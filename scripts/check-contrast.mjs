#!/usr/bin/env node
// Checks every pair in checks/contrast.json against WCAG 2.1 in every theme.
// Exits 1 if any pair fails. Usage: node scripts/check-contrast.mjs

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadTokens, resolve, lookup, aliasKey, isPrivate, rgba, contrast, over, hex8 } from './lib/tokens.mjs';

const model = loadTokens();
const { pairs } = JSON.parse(fs.readFileSync(path.join(ROOT, 'checks/contrast.json'), 'utf8'));
const failures = [];
const rows = [];

for (const theme of model.semanticModes) {
  const ctx = { semantic: theme, layout: model.layoutModes[0] };
  for (const { fg, bg, min, note } of pairs) {
    let f, b;
    try {
      f = resolve(model, fg, ctx);
      b = resolve(model, bg, ctx);
    } catch (err) {
      const line = `  FAIL  ${theme.padEnd(6)} ${fg} on ${bg}: ${err.message}. Export from Figma, or fix the pair in checks/contrast.json`;
      rows.push(line);
      failures.push(line);
      continue;
    }
    if (f.type !== 'color' || b.type !== 'color') throw new Error(`${fg} / ${bg} must both be colors`);
    const back = rgba(b.value);
    if (back.a < 1) {
      rows.push(`  skip  ${theme.padEnd(6)} ${fg} on ${bg}: background is translucent, so contrast depends on what is behind it`);
      continue;
    }
    const front = over(rgba(f.value), back);
    const ratio = contrast(front, back);
    const ok = ratio >= min;
    const line = `${ok ? '  pass' : '  FAIL'}  ${theme.padEnd(6)} ${ratio.toFixed(2).padStart(5)} ≥ ${min}  ${fg} #${hex8(f.value).slice(0, 6)} on ${bg} #${hex8(b.value).slice(0, 6)}${note ? `  (${note})` : ''}`;
    rows.push(line);
    if (!ok) failures.push(line);
  }
}

console.log(rows.join('\n'));
console.log(`\n${pairs.length} pairs × ${model.semanticModes.length} themes: ${failures.length ? failures.length + ' failing' : 'all pass'}`);

// Theme coverage: every color a designer or developer can use must reach the semantic
// color tier, or it cannot change between light and dark.
const themeCtx = { semantic: model.semanticModes[0], layout: model.layoutModes[0] };

// Primitives the semantic tier itself points at (the brand override tokens) sit upstream of
// theming, not around it: a theme is built from them. Everything else must reach semantic.
const upstream = new Set();
for (const mode of model.semanticModes) {
  for (const token of model.semantic[mode].values()) {
    let target = aliasKey(token.value);
    while (target && model.tierOf(target) === 'primitives') {
      upstream.add(target);
      target = aliasKey(model.primitives.get(target).value);
    }
  }
}
const usable = [...model.component.keys(), ...[...model.primitives.keys()].filter((k) => !isPrivate(model, k) && !upstream.has(k))];
const unthemed = [];
for (const key of usable) {
  if (lookup(model, key, themeCtx).type !== 'color') continue;
  let cur = key, themed = false;
  for (let target; (target = aliasKey(lookup(model, cur, themeCtx).value)); cur = target) {
    if (model.tierOf(target) === 'semantic') { themed = true; break; }
  }
  if (!themed) unthemed.push(`  FAIL  ${key} never reaches Tier 2 semantic color, so it cannot follow dark mode`);
}
console.log(`\nTheme coverage: ${unthemed.length ? unthemed.length + ' color tokens bypass semantic color' : 'every usable color follows the theme'}`);
if (unthemed.length) {
  console.log(unthemed.join('\n'));
  failures.push(...unthemed);
}
if (failures.length) {
  console.log('\nFailing:\n' + failures.join('\n'));
  process.exit(1);
}
