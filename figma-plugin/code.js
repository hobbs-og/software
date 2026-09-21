// Software Tokens → GitHub
// Exports this file's local variables as W3C Design Tokens (DTCG 2025.10) JSON.
// The UI (ui.html) sends the files to GitHub as a pull request.
//
// Everything that turns Figma variables into token files lives in exportTokens(),
// so the plugin and any scripted export produce byte-identical output.

const EXPORTER_VERSION = 3;

// A component file may point at these published libraries; the build resolves those
// references against the same token names. A link to any other library is an error,
// because nothing would resolve it.
const ALLOWED_LIBRARIES = ['software-subatomic'];

// Each Figma file owns one folder of token files, so an export can only add, change
// or remove files it owns. The subatomic file owns tokens/*.json; a component file
// (only Tier 3 collections) owns tokens/component/*.json. Each folder has its own
// manifest.json, and loadTokens() in scripts/lib/tokens.mjs reads both.
const COMPONENT_DIR = 'tokens/component/';

// Figma collection name → token file. Order matters: first match wins.
const COLLECTION_FILES = [
  { match: /^tier 1\b/i, file: 'primitives', tier: 'primitive' },
  { match: /^core$/i, file: 'primitives', tier: 'primitive' },
  { match: /^tier 2\b.*typography/i, file: 'typography', tier: 'typography' },
  { match: /^tier 2\b/i, file: 'semantic', tier: 'semantic' },
  { match: /^tier 3\b/i, file: 'component', tier: 'component' },
  { match: /^components?$/i, file: 'component', tier: 'component' },
  { match: /^grid$/i, file: 'grid', tier: 'layout' },
];

function slug(text) {
  return text.trim().toLowerCase().replace(/\s+/g, '-').replace(/-+/g, '-');
}

function round(n) {
  return Math.round(n * 10000) / 10000;
}

function toHex(c) {
  const h = (n) => Math.round(n * 255).toString(16).padStart(2, '0');
  return '#' + h(c.r) + h(c.g) + h(c.b);
}

// Figma stores every number as FLOAT; the variable name tells us what it measures.
function floatType(path) {
  if (path.includes('font-weight')) return 'fontWeight';
  if (path[path.length - 1] === 'columns') return 'number';
  return 'dimension';
}

function stringType(path) {
  return path.includes('font-family') ? 'fontFamily' : 'string';
}

// Keys of every variable published by an allowed library, so a remote link can be
// checked. Needs the "teamlibrary" permission in manifest.json. A failure here is
// reported once, rather than as one error per linked variable.
async function allowedLibraryVariableKeys() {
  const keys = new Set();
  const seen = new Set();
  let problem = null;
  try {
    for (const c of await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync()) {
      seen.add(c.libraryName);
      if (!ALLOWED_LIBRARIES.includes(c.libraryName)) continue;
      for (const v of await figma.teamLibrary.getVariablesInLibraryCollectionAsync(c.key)) keys.add(v.key);
    }
    if (!keys.size) {
      problem = `Can't find the ${ALLOWED_LIBRARIES.join(' or ')} library. Enable it in this file (Assets → Libraries). Libraries this file can see: ${seen.size ? [...seen].join(', ') : 'none'}.`;
    }
  } catch (err) {
    problem = `Couldn't read team libraries: ${(err && err.message) || err}`;
  }
  return { keys, problem };
}

async function exportTokens() {
  const errors = [];
  const warnings = [];
  const library = await allowedLibraryVariableKeys();
  const allowedKeys = library.keys;
  let libraryReported = false;
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const tierOf = (c) => {
    const rule = COLLECTION_FILES.find((r) => r.match.test(c.name));
    return rule ? rule.tier : 'unmapped';
  };
  const componentFile = collections.length > 0 && collections.every((c) => tierOf(c) === 'component');
  if (!componentFile && collections.some((c) => tierOf(c) === 'component')) {
    errors.push('This file mixes Tier 3 (component) collections with shared tiers. Component tokens belong in their own Figma file, linked to software-subatomic.');
  }
  const dir = componentFile ? COMPONENT_DIR : 'tokens/';
  const trees = {}; // file path → token tree
  const manifest = { exporterVersion: EXPORTER_VERSION, collections: [] };
  let tokenCount = 0;

  for (const collection of collections) {
    const rule = COLLECTION_FILES.find((r) => r.match.test(collection.name));
    const base = rule ? rule.file : slug(collection.name);
    // An unmapped collection can't be placed safely, so the export stops rather
    // than guess a folder (a wrong guess could remove another file's tokens).
    if (!rule) errors.push(`Collection "${collection.name}" has no tier. Name it to match COLLECTION_FILES in figma-plugin/code.js (e.g. "Tier 1 | …", "Tier 2 | semantic color", "components"), or ask for a new mapping.`);

    // Themes live on Tier 2 semantic color and brands on Tier 1, so a component
    // collection has one mode: its tokens point at semantic tokens and follow both.
    if (componentFile && collection.modes.length > 1) {
      errors.push(`${collection.name}: component collections have one mode (found ${collection.modes.length}: ${collection.modes.map((m) => m.name).join(', ')}). Put theme differences in Tier 2 semantic color and brand differences in Tier 1.`);
    }
    const multiMode = collection.modes.length > 1;
    const modes = collection.modes.map((m) => ({
      name: m.name,
      modeId: m.modeId,
      file: `${dir}${base}${multiMode ? '.' + slug(m.name) : ''}.json`,
    }));
    manifest.collections.push({
      name: collection.name,
      tier: rule ? rule.tier : 'unmapped',
      modes: modes.map((m) => ({ name: slug(m.name), file: m.file })),
    });

    const variables = [];
    for (const id of collection.variableIds) {
      const v = await figma.variables.getVariableByIdAsync(id);
      if (v) variables.push(v);
    }
    variables.sort((a, b) => a.name.localeCompare(b.name));

    for (const mode of modes) {
      const tree = (trees[mode.file] = trees[mode.file] || {});

      for (const v of variables) {
        const path = v.name.split('/').map(slug);
        const label = `${collection.name} › ${v.name}`;

        const bad = path.find((seg) => !seg || /[{}.]/.test(seg) || seg.startsWith('$'));
        if (bad !== undefined) {
          errors.push(`${label}: name segment "${bad}" is empty or contains { } . or starts with $`);
          continue;
        }

        const raw = v.valuesByMode[mode.modeId];
        const token = {};

        if (raw && typeof raw === 'object' && raw.type === 'VARIABLE_ALIAS') {
          const target = await figma.variables.getVariableByIdAsync(raw.id);
          if (!target) {
            errors.push(`${label}: points to a variable that no longer exists`);
            continue;
          }
          if (target.remote && library.problem) {
            if (!libraryReported) errors.push(library.problem);
            libraryReported = true;
            continue;
          }
          if (target.remote && !allowedKeys.has(target.key)) {
            errors.push(`${label}: points to "${target.name}" in a library this system does not read (allowed: ${ALLOWED_LIBRARIES.join(', ')})`);
            continue;
          }
          token.$type = v.resolvedType === 'COLOR' ? 'color'
            : v.resolvedType === 'FLOAT' ? floatType(path)
            : stringType(path);
          token.$value = '{' + target.name.split('/').map(slug).join('.') + '}';
        } else if (v.resolvedType === 'COLOR') {
          token.$type = 'color';
          token.$value = {
            colorSpace: 'srgb',
            components: [round(raw.r), round(raw.g), round(raw.b)],
            alpha: round(raw.a === undefined ? 1 : raw.a),
            hex: toHex(raw),
          };
        } else if (v.resolvedType === 'FLOAT') {
          token.$type = floatType(path);
          token.$value = token.$type === 'dimension' ? { value: round(raw), unit: 'px' } : round(raw);
        } else if (v.resolvedType === 'STRING') {
          token.$type = stringType(path);
          token.$value = raw;
        } else {
          warnings.push(`${label}: ${v.resolvedType} variables have no token type; skipped`);
          continue;
        }

        if (v.description) token.$description = v.description;
        token.$extensions = {
          'com.figma': { variableId: v.id, collection: collection.name, scopes: v.scopes.slice().sort() },
        };

        // A name can be a token or a group, never both.
        let node = tree;
        let conflict = null;
        for (let i = 0; i < path.length - 1; i++) {
          const seg = path[i];
          if (node[seg] && '$value' in node[seg]) {
            conflict = path.slice(0, i + 1).join('/');
            break;
          }
          node = node[seg] = node[seg] || {};
        }
        const leaf = path[path.length - 1];
        if (conflict) {
          errors.push(`${label}: "${conflict}" is already a token, so it can't also be a group`);
        } else if (node[leaf] && '$value' in node[leaf]) {
          errors.push(`${label}: duplicate name in ${mode.file}`);
        } else if (node[leaf]) {
          errors.push(`${label}: "${path.join('/')}" is already a group, so it can't also be a token`);
        } else {
          node[leaf] = token;
          tokenCount++;
        }
      }
    }
  }

  const files = {};
  for (const [path, tree] of Object.entries(trees)) files[path] = JSON.stringify(tree, null, 2) + '\n';
  files[`${dir}manifest.json`] = JSON.stringify(manifest, null, 2) + '\n';

  return {
    files,
    summary: {
      fileName: figma.root.name,
      dir,
      collections: manifest.collections.map((c) => `${c.name} (${c.modes.map((m) => m.name).join(', ')})`),
      tokenCount,
      errors,
      warnings,
    },
  };
}

// ─── Plugin shell ───────────────────────────────────────────────────────────

const SETTINGS_KEY = 'settings';

figma.showUI(__html__, { width: 400, height: 600, themeColors: true, title: 'Software Tokens → GitHub' });

figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === 'init') {
      const settings = (await figma.clientStorage.getAsync(SETTINGS_KEY)) || {};
      figma.ui.postMessage({ type: 'settings', settings, fileName: figma.root.name });
    } else if (msg.type === 'save-settings') {
      await figma.clientStorage.setAsync(SETTINGS_KEY, msg.settings);
    } else if (msg.type === 'export') {
      figma.ui.postMessage({ type: 'exported', result: await exportTokens() });
    } else if (msg.type === 'open-url') {
      figma.openExternal(msg.url);
    }
  } catch (err) {
    figma.ui.postMessage({ type: 'error', message: String((err && err.message) || err) });
  }
};
