// Reads tokens/*.json (DTCG, exported by figma-plugin/code.js) into a model
// the platform builds and checks share. No dependencies.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

function flatten(tree, prefix, out, file) {
  for (const [key, node] of Object.entries(tree)) {
    if (key.startsWith('$')) continue;
    const p = prefix.concat(key);
    if (node && typeof node === 'object' && '$value' in node) {
      const figma = (node.$extensions && node.$extensions['com.figma']) || {};
      out.set(p.join('.'), { path: p, type: node.$type, value: node.$value, scopes: figma.scopes || [], file });
    } else {
      flatten(node, p, out, file);
    }
  }
}

function loadFile(file) {
  const map = new Map();
  flatten(readJson(file), [], map, file);
  return map;
}

// Returns { primitives, primitivesByMode: {mode: Map}, brandModes, typography,
//           typographyByMode: {mode: Map}, typographyModes, component,
//           semantic: {mode: Map}, semanticModes, layout: {mode: Map}, layoutModes }
// model.primitives and model.typography are the first (default) brand.
export function loadTokens() {
  // The subatomic file owns tokens/manifest.json; a component file owns
  // tokens/component/manifest.json. Each lists its own files by full path.
  const manifest = readJson('tokens/manifest.json');
  if (fs.existsSync(path.join(ROOT, 'tokens/component/manifest.json'))) {
    const component = readJson('tokens/component/manifest.json');
    for (const c of component.collections) {
      if (c.tier !== 'component') throw new Error(`tokens/component/manifest.json lists "${c.name}" as ${c.tier}; only component collections belong there`);
    }
    manifest.collections = manifest.collections.concat(component.collections);
  }
  const model = { primitives: new Map(), primitivesByMode: {}, brandModes: [], typography: new Map(), typographyByMode: {}, typographyModes: [], component: new Map(), semantic: {}, semanticModes: [], layout: {}, layoutModes: [] };
  const seenFiles = new Set();
  // Primitive collections are read first: a brand is a mode on Tier 1, and a
  // single-mode collection (core) is shared by every brand.
  const shared = new Map();
  const byBrand = {};
  for (const c of manifest.collections.filter((x) => x.tier === 'primitive')) {
    for (const mode of c.modes) {
      if (seenFiles.has(mode.file)) continue;
      seenFiles.add(mode.file);
      const tokens = loadFile(mode.file);
      if (c.modes.length === 1) {
        for (const [k, t] of tokens) shared.set(k, t);
      } else {
        if (!byBrand[mode.name]) {
          byBrand[mode.name] = new Map();
          model.brandModes.push(mode.name);
        }
        for (const [k, t] of tokens) byBrand[mode.name].set(k, t);
      }
    }
  }
  if (!model.brandModes.length) model.brandModes.push('default');
  for (const brand of model.brandModes) {
    const map = new Map(shared);
    for (const [k, t] of byBrand[brand] || []) map.set(k, t);
    model.primitivesByMode[brand] = map;
  }
  model.primitives = model.primitivesByMode[model.brandModes[0]];
  // Every brand must define the same tokens, or a token exists in one brand and
  // not another and the platform outputs disagree about what the system holds.
  for (const brand of model.brandModes.slice(1)) {
    for (const k of model.primitivesByMode[brand].keys()) {
      if (!model.primitives.has(k)) throw new Error(`Primitive "${k}" is in brand "${brand}" but not in "${model.brandModes[0]}"`);
    }
    for (const k of model.primitives.keys()) {
      if (!model.primitivesByMode[brand].has(k)) throw new Error(`Primitive "${k}" is in brand "${model.brandModes[0]}" but not in "${brand}"`);
    }
  }

  for (const c of manifest.collections) {
    for (const mode of c.modes) {
      // Several collections share one file; read it once.
      if (seenFiles.has(mode.file)) continue;
      const tokens = loadFile(mode.file);
      if (c.tier === 'primitive') {
        throw new Error(`Primitive collection "${c.name}" was not read in the first pass`);
      } else if (c.tier === 'typography') {
        // Typography modes are brands (default, rhinestone, …), not themes: the same in light and dark.
        model.typographyByMode[mode.name] = tokens;
        model.typographyModes.push(mode.name);
      } else if (c.tier === 'component') {
        for (const [k, t] of tokens) model.component.set(k, t);
      } else if (c.tier === 'semantic') {
        model.semantic[mode.name] = tokens;
        model.semanticModes.push(mode.name);
      } else if (c.tier === 'layout') {
        model.layout[mode.name] = tokens;
        model.layoutModes.push(mode.name);
      } else {
        throw new Error(`Collection "${c.name}" has no tier mapping. Add it to COLLECTION_FILES in figma-plugin/code.js.`);
      }
      seenFiles.add(mode.file);
    }
  }

  if (model.typographyModes.length) model.typography = model.typographyByMode[model.typographyModes[0]];
  if (!model.semanticModes.length) throw new Error('No semantic collection found in tokens/manifest.json');
  if (!model.layoutModes.length) throw new Error('No layout (grid) collection found in tokens/manifest.json');

  // A token name must live in exactly one tier, or references become ambiguous.
  const owners = new Map();
  const claim = (tier, map) => {
    for (const k of map.keys()) {
      if (owners.has(k) && owners.get(k) !== tier) throw new Error(`Token "${k}" is defined in both ${owners.get(k)} and ${tier}`);
      owners.set(k, tier);
    }
  };
  for (const b of model.brandModes) claim('primitives', model.primitivesByMode[b]);
  for (const m of model.typographyModes) claim('typography', model.typographyByMode[m]);
  claim('component', model.component);
  for (const m of model.semanticModes) claim('semantic', model.semantic[m]);
  for (const m of model.layoutModes) claim('layout', model.layout[m]);
  model.tierOf = (key) => owners.get(key);

  // Layout modes sorted small → large by their min-width token, for mobile-first output.
  model.layoutModes.sort((a, b) => layoutMinWidth(model, a) - layoutMinWidth(model, b));

  return model;
}

function layoutMinWidth(model, mode) {
  const t = model.layout[mode].get('min-width');
  if (!t || t.type !== 'dimension') throw new Error(`Grid mode "${mode}" needs a min-width dimension token`);
  return t.value.value;
}

// Primitive tokens hidden from every Figma picker (no scopes) stay internal:
// platforms get their resolved values, never the token itself.
export function isPrivate(model, key) {
  return model.tierOf(key) === 'primitives' && model.primitives.get(key).scopes.length === 0;
}

// Primitives a brand repoints. They reach the products through the semantic and
// component tiers, so CSS keeps them as variables even when they are private:
// a brand then overrides these alone, and everything downstream follows.
export function brandVarying(model, ctx) {
  const keys = new Set();
  if (model.brandModes.length < 2) return keys;
  const base = model.brandModes[0];
  for (const key of model.primitives.keys()) {
    const value = (brand) => JSON.stringify(resolve(model, key, { ...ctx, brand }).value);
    const first = value(base);
    if (model.brandModes.slice(1).some((brand) => value(brand) !== first)) keys.add(key);
  }
  return keys;
}

// A context picks one semantic mode and one layout mode, and optionally a brand
// (the default one when omitted). A brand names both a Tier 1 mode and the
// typography mode of the same name, so one switch carries a brand's color and type.
export function typographyMode(model, brand) {
  return brand && model.typographyByMode[brand] ? brand : model.typographyModes[0];
}

export function lookup(model, key, ctx) {
  const brand = (ctx && ctx.brand) || model.brandModes[0];
  switch (model.tierOf(key)) {
    case 'primitives': return model.primitivesByMode[brand].get(key);
    case 'typography': return model.typographyByMode[typographyMode(model, brand)].get(key);
    case 'component': return model.component.get(key);
    case 'semantic': return model.semantic[ctx.semantic].get(key);
    case 'layout': return model.layout[ctx.layout].get(key);
    default: return undefined;
  }
}

export function aliasKey(value) {
  return typeof value === 'string' && /^\{[^{}]+\}$/.test(value) ? value.slice(1, -1) : null;
}

export function resolve(model, key, ctx, trail = []) {
  if (trail.includes(key)) throw new Error(`Circular reference: ${trail.concat(key).join(' → ')}`);
  const token = lookup(model, key, ctx);
  if (!token) throw new Error(`Unknown token "${key}"` + (trail.length ? ` (referenced by ${trail[trail.length - 1]})` : ''));
  const target = aliasKey(token.value);
  return target ? resolve(model, target, ctx, trail.concat(key)) : token;
}

// Every token key visible to platforms, in a stable order.
export function publicKeys(model) {
  const keys = new Set();
  for (const k of model.primitives.keys()) if (!isPrivate(model, k)) keys.add(k);
  for (const m of model.semanticModes) for (const k of model.semantic[m].keys()) keys.add(k);
  for (const k of model.typography.keys()) keys.add(k);
  for (const k of model.component.keys()) keys.add(k);
  return [...keys].sort();
}

export function layoutKeys(model) {
  return [...model.layout[model.layoutModes[0]].keys()].sort();
}

// ─── Color math (WCAG 2.1) ────────────────────────────────────────────────

export function rgba(color) {
  const [r, g, b] = color.components;
  return { r, g, b, a: color.alpha === undefined ? 1 : color.alpha };
}

export function hex8(color) {
  const { r, g, b, a } = rgba(color);
  const h = (n) => Math.round(n * 255).toString(16).padStart(2, '0');
  return (h(r) + h(g) + h(b) + h(a)).toUpperCase();
}

function channel(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function luminance({ r, g, b }) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(fg, bg) {
  const a = luminance(fg), b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Paints a translucent color over an opaque one.
export function over(top, bottom) {
  const a = top.a;
  return { r: top.r * a + bottom.r * (1 - a), g: top.g * a + bottom.g * (1 - a), b: top.b * a + bottom.b * (1 - a), a: 1 };
}

export function write(file, content) {
  const full = path.join(ROOT, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}
