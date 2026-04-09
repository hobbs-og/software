#!/usr/bin/env node
/**
 * figma-sync.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Pulls Figma Local Variables from one or more files via the Figma REST API
 * and writes them as W3C Design Token JSON files into tokens/.
 *
 * Zero npm dependencies — uses only Node built-ins (https, fs/promises).
 *
 * Required env vars
 *   FIGMA_TOKEN         Personal Access Token from figma.com/settings
 *
 * Optional env vars (override defaults below)
 *   FIGMA_SUBATOMIC_KEY File key for --ds_subatomic  (primitives + semantics)
 *   FIGMA_COMPONENTS_KEY File key for --ds_components (component tokens)
 *
 * Usage
 *   node scripts/figma-sync.mjs
 */

import { get }      from 'https'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import path         from 'path'

// ─── Config ───────────────────────────────────────────────────────────────────

const FIGMA_TOKEN = process.env.FIGMA_TOKEN
if (!FIGMA_TOKEN) {
  console.error('❌  FIGMA_TOKEN env var is required.')
  console.error('   Generate one at: figma.com/settings → Personal access tokens')
  process.exit(1)
}

const FILES = [
  {
    key:   process.env.FIGMA_SUBATOMIC_KEY  ?? 'DoE0YKYP5iWeZb0izbTznM',
    label: '--ds_subatomic',
  },
  // Uncomment when you're ready to sync component tokens from --ds_components:
  // {
  //   key:   process.env.FIGMA_COMPONENTS_KEY ?? 'EMi2Tg8H7hoG55aWOXBMId',
  //   label: '--ds_components',
  // },
]

// Maps Figma collection names (lowercased, partial match) → output JSON file.
// Add/adjust entries to match your Figma variable collection naming.
const COLLECTION_FILE_MAP = [
  { match: 'color',      file: 'tokens/base/color.json'            },
  { match: 'typography', file: 'tokens/base/typography.json'       },
  { match: 'type',       file: 'tokens/base/typography.json'       },
  { match: 'spacing',    file: 'tokens/base/spacing.json'          },
  { match: 'space',      file: 'tokens/base/spacing.json'          },
  { match: 'semantic',   file: 'tokens/semantic/color.light.json'  },
  { match: 'button',     file: 'tokens/component/button.json'      },
  { match: 'input',      file: 'tokens/component/input.json'       },
]

// ─── Figma API helper ─────────────────────────────────────────────────────────

function figmaFetch(endpoint) {
  return new Promise((resolve, reject) => {
    const req = get(
      {
        hostname: 'api.figma.com',
        path:     `/v1${endpoint}`,
        headers:  { 'X-Figma-Token': FIGMA_TOKEN },
      },
      (res) => {
        if (res.statusCode === 403) {
          reject(new Error('403 Forbidden – check your FIGMA_TOKEN and file permissions'))
          return
        }
        let raw = ''
        res.on('data', (chunk) => (raw += chunk))
        res.on('end', () => {
          try   { resolve(JSON.parse(raw)) }
          catch { reject(new Error(`Failed to parse JSON: ${raw.slice(0, 200)}`)) }
        })
      }
    )
    req.on('error', reject)
  })
}

// ─── Value converters ─────────────────────────────────────────────────────────

/** Convert Figma RGBA {r,g,b,a} (0–1) → #rrggbb or #rrggbbaa */
function rgbaToHex({ r, g, b, a }) {
  const h = (n) => Math.round(n * 255).toString(16).padStart(2, '0')
  return a < 0.9999 ? `#${h(r)}${h(g)}${h(b)}${h(a)}` : `#${h(r)}${h(g)}${h(b)}`
}

/** Infer W3C $type from variable path + Figma resolvedType */
function inferType(name, resolvedType) {
  if (resolvedType === 'COLOR')  return 'color'
  if (resolvedType === 'STRING') return name.includes('font-family') ? 'fontFamily' : 'string'
  if (resolvedType === 'FLOAT') {
    if (name.includes('font-weight')) return 'fontWeight'
    return 'dimension'
  }
  return 'other'
}

// ─── Object helpers ───────────────────────────────────────────────────────────

function setNested(obj, keys, value) {
  let cur = obj
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) {
      cur[keys[i]] = {}
    }
    cur = cur[keys[i]]
  }
  cur[keys[keys.length - 1]] = value
}

function deepMerge(target, source) {
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && !('$value' in v)) {
      target[k] ??= {}
      deepMerge(target[k], v)
    } else {
      target[k] = v
    }
  }
  return target
}

function collectionFile(collectionName) {
  const lc = collectionName.toLowerCase()
  const entry = COLLECTION_FILE_MAP.find((e) => lc.includes(e.match))
  return entry?.file ?? `tokens/base/${lc.replace(/\s+/g, '-')}.json`
}

// ─── Core transform ───────────────────────────────────────────────────────────

function transformFile(meta) {
  const { variables, variableCollections } = meta
  const varById = Object.fromEntries(Object.entries(variables).map(([id, v]) => [id, v]))

  // accumulator: outputPath → token tree
  const outputs = {}

  for (const variable of Object.values(variables)) {
    const collection   = variableCollections[variable.variableCollectionId]
    const defaultMode  = collection.defaultModeId
    const rawValue     = variable.valuesByMode[defaultMode]

    if (rawValue === undefined || rawValue === null) continue

    let $value

    // ── Alias reference ──────────────────────────────────────────────────────
    if (rawValue?.type === 'VARIABLE_ALIAS') {
      const ref = varById[rawValue.id]
      if (!ref) continue
      // Convert Figma slash path to W3C dot path: "color/content/foo" → "{color.content.foo}"
      $value = `{${ref.name.replace(/\//g, '.')}}`
    }

    // ── Concrete value ───────────────────────────────────────────────────────
    else {
      switch (variable.resolvedType) {
        case 'COLOR':  $value = rgbaToHex(rawValue);   break
        case 'FLOAT':  $value = String(rawValue);       break
        case 'STRING': $value = rawValue;               break
        default: continue
      }
    }

    const $type   = inferType(variable.name, variable.resolvedType)
    const token   = { $value, $type }
    const keys    = variable.name.split('/')
    const outFile = collectionFile(collection.name)

    outputs[outFile] ??= {}
    setNested(outputs[outFile], keys, token)
  }

  return outputs
}

// ─── Merge with existing token files ─────────────────────────────────────────
// Strategy: Figma is the source of truth for base/semantic tokens.
// Component tokens managed manually are NOT overwritten unless the collection
// name matches a component entry in COLLECTION_FILE_MAP.

function mergeWithExisting(outPath, incoming) {
  if (!existsSync(outPath)) return incoming
  try {
    const existing = JSON.parse(readFileSync(outPath, 'utf8'))
    return deepMerge(existing, incoming)
  } catch {
    return incoming
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const allOutputs = {}

  for (const { key, label } of FILES) {
    console.log(`\n📐  Fetching variables from ${label} (${key})…`)

    const response = await figmaFetch(`/files/${key}/variables/local`)

    if (response.status === 404) {
      console.warn(`   ⚠️  File not found – skipping. Check file key and token permissions.`)
      continue
    }
    if (!response.meta?.variables) {
      console.warn(`   ⚠️  No variables found in response – skipping.`)
      continue
    }

    const fileOutputs = transformFile(response.meta)
    const varCount    = Object.keys(response.meta.variables).length

    console.log(`   ✓ ${varCount} variables → ${Object.keys(fileOutputs).length} token file(s)`)

    for (const [filePath, tree] of Object.entries(fileOutputs)) {
      allOutputs[filePath] ??= {}
      deepMerge(allOutputs[filePath], tree)
    }
  }

  if (Object.keys(allOutputs).length === 0) {
    console.error('\n❌  No token data was generated. Check your FIGMA_TOKEN and file keys.')
    process.exit(1)
  }

  // Write output files
  console.log('\n📝  Writing token files…')
  for (const [filePath, tree] of Object.entries(allOutputs)) {
    const merged = mergeWithExisting(filePath, tree)
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, JSON.stringify(merged, null, 2) + '\n')
    console.log(`   ✓ ${filePath}`)
  }

  console.log('\n✅  Figma sync complete. Run `npm run build:tokens` to regenerate CSS.\n')
}

main().catch((err) => {
  console.error('\n❌  Sync failed:', err.message)
  process.exit(1)
})
