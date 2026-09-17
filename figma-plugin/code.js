// Software Tokens → GitHub
// Exports this file's local variables as W3C Design Tokens (DTCG 2025.10) JSON.
// The UI (ui.html) sends the files to GitHub as a pull request.
//
// Everything that turns Figma variables into token files lives in exportTokens(),
// so the plugin and any scripted export produce byte-identical output.

const EXPORTER_VERSION = 1;

// Figma collection name → token file. Order matters: first match wins.
const COLLECTION_FILES = [
  { match: /^tier 1\b/i, file: 'primitives', tier: 'primitive' },
  { match: /^core$/i, file: 'primitives', tier: 'primitive' },
  { match: /^tier 2\b/i, file: 'semantic', tier: 'semantic' },
  { match: /^tier 3\b/i, file: 'component', tier: 'component' },
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

async function exportTokens() {
  const errors = [];
  const warnings = [];
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const trees = {}; // file path → token tree
  const manifest = { exporterVersion: EXPORTER_VERSION, collections: [] };
  let tokenCount = 0;

  for (const collection of collections) {
    const rule = COLLECTION_FILES.find((r) => r.match.test(collection.name));
    const base = rule ? rule.file : slug(collection.name);
    if (!rule) warnings.push(`Collection "${collection.name}" has no tier mapping; exported to tokens/${base}*.json`);

    const multiMode = collection.modes.length > 1;
    const modes = collection.modes.map((m) => ({
      name: m.name,
      modeId: m.modeId,
      file: `tokens/${base}${multiMode ? '.' + slug(m.name) : ''}.json`,
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
          if (target.remote) {
            errors.push(`${label}: points to "${target.name}" in another library; point it at a local variable`);
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
  files['tokens/manifest.json'] = JSON.stringify(manifest, null, 2) + '\n';

  return {
    files,
    summary: {
      fileName: figma.root.name,
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
