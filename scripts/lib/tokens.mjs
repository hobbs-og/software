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

// Returns { primitives, typography, typographyByMode: {mode: Map}, typographyModes, component,
//           semantic: {mode: Map}, semanticModes, layout: {mode: Map}, layoutModes }
// model.typography is the first (default) typography mode.
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
  const model = { primitives: new Map(), typography: new Map(), typographyByMode: {}, typographyModes: [], component: new Map(), semantic: {}, semanticModes: [], layout: {}, layoutModes: [] };
  const seenFiles = new Set();

  for (const c of manifest.collections) {
    for (const mode of c.modes) {
      // Several primitive collections share tokens/primitives.json; read it once.
      if (seenFiles.has(mode.file)) continue;
      const tokens = loadFile(mode.file);
      if (c.tier === 'primitive') {
        for (const [k, t] of tokens) model.primitives.set(k, t);
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
  claim('primitives', model.primitives);
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

// A context picks one semantic mode and one layout mode, and optionally a typography mode
// (the default one when omitted).
export function lookup(model, key, ctx) {
  switch (model.tierOf(key)) {
    case 'primitives': return model.primitives.get(key);
    case 'typography': return (ctx && ctx.typography ? model.typographyByMode[ctx.typography] : model.typography).get(key);
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
