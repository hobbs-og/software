#!/usr/bin/env node
// Checks every pair in checks/contrast.json against WCAG 2.1 in every theme.
// Exits 1 if any pair fails. Usage: node scripts/check-contrast.mjs

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadTokens, resolve, rgba, contrast, over, hex8 } from './lib/tokens.mjs';

const model = loadTokens();
const { pairs } = JSON.parse(fs.readFileSync(path.join(ROOT, 'checks/contrast.json'), 'utf8'));
const failures = [];
const rows = [];

for (const theme of model.semanticModes) {
  const ctx = { semantic: theme, layout: model.layoutModes[0] };
  for (const { fg, bg, min, note } of pairs) {
    const f = resolve(model, fg, ctx);
    const b = resolve(model, bg, ctx);
    if (f.type !== 'color' || b.type !== 'color') throw new Error(`${fg} / ${bg} must both be colours`);
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
if (failures.length) {
  console.log('\nFailing:\n' + failures.join('\n'));
  process.exit(1);
}
