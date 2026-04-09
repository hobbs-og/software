# Figma ↔ Code Sync Guide

No Tokens Studio required. This system uses the **Figma Variables REST API** directly —
free with any Figma plan, zero plugins to maintain.

---

## How it works

```
Figma Variables
     │
     │  Figma REST API (via scripts/figma-sync.mjs)
     ▼
tokens/**/*.json  ← W3C token source files
     │
     │  GitHub Action (tokens.yml) runs Style Dictionary
     ▼
dist/tokens.css   ← generated CSS custom properties
dist/tokens.dark.css
     │
     │  imported once in your app's root CSS
     ▼
Components read CSS vars — zero rebuild needed per component
```

---

## One-time setup (10 minutes)

### Step 1 — Get a Figma Personal Access Token

1. Go to **figma.com → your avatar → Settings → Security**
2. Under "Personal access tokens", click **Generate new token**
3. Name it `design-system-sync`, set expiry to your preference
4. Copy the token — you only see it once

### Step 2 — Add the token to GitHub

1. Open **github.com/hobbs-og/design-system**
2. Go to **Settings → Secrets and variables → Actions**
3. Click **New repository secret**
4. Name: `FIGMA_TOKEN`
5. Value: paste the token from Step 1
6. Click **Add secret**

That's the entire setup. The file key for `--ds_subatomic` is already hardcoded
in `scripts/figma-sync.mjs`.

---

## Running the sync

### From GitHub (recommended)

1. Go to **github.com/hobbs-og/design-system → Actions**
2. Select **"Sync Figma Tokens"** in the left sidebar
3. Click **"Run workflow" → Run workflow**
4. Takes ~30 seconds. When done, `dist/tokens.css` is updated automatically.

### Locally (for testing)

```bash
# From your repo root
export FIGMA_TOKEN=your_token_here
node scripts/figma-sync.mjs
npm run build:tokens   # regenerates dist/tokens.css
```

---

## Automating the sync

To run automatically (e.g. nightly), uncomment the `schedule` block in
`.github/workflows/figma-sync.yml`:

```yaml
schedule:
  - cron: '0 9 * * 1-5'   # 9 AM UTC, Mon–Fri
```

---

## What the sync does (and doesn't) touch

| Files | Behavior |
|-------|----------|
| `tokens/base/*.json` | **Overwritten** from Figma — Figma is source of truth |
| `tokens/semantic/*.json` | **Overwritten** from Figma |
| `tokens/component/*.json` | **Merged** — manual component tokens are preserved |
| `dist/tokens.css` | **Regenerated** automatically |
| `src/components/**` | **Never touched** — components are code-only |

---

## Sync path for future Figma files

When `--ds_components` has Figma Variables you want to sync, uncomment this
block in `scripts/figma-sync.mjs`:

```js
{
  key:   process.env.FIGMA_COMPONENTS_KEY ?? 'EMi2Tg8H7hoG55aWOXBMId',
  label: '--ds_components',
},
```

Each file's variables are fetched separately and merged into the same output structure.

---

## Component builds (Claude-assisted)

Components themselves aren't synced automatically — they're generated from Figma
using the Claude MCP connector, then live in the codebase permanently.

**Workflow when a component changes in Figma:**
1. Select the updated component in `--ds_components`
2. Copy the Figma URL
3. In Claude: _"Update the Input component from this URL: [url]"_
4. Claude reads the new variant/state structure and regenerates the files
5. You review the diff, commit, and push

**Component build order (atoms first)**

- [x] Button
- [ ] Input — paste URL from `--ds_components` to start
- [ ] Checkbox / Radio
- [ ] Toggle
- [ ] Select
- [ ] Badge / Tag
- [ ] Tooltip
- [ ] Avatar

---

## Using tokens in your app

```css
/* In your global CSS or _app.tsx */
@import '@hobbs-og/design-system/dist/tokens.css';
@import '@hobbs-og/design-system/dist/tokens.dark.css';
```

```tsx
/* Dark mode toggle */
document.documentElement.setAttribute('data-theme', 'dark')
document.documentElement.removeAttribute('data-theme')
```

```tsx
import { Button } from '@hobbs-og/design-system'

<Button label="Get started"  variant="primary"   radius="round" size="md" />
<Button label="Learn more"   variant="secondary" radius="round" size="md" />
<Button icon={<ArrowIcon />} iconOnly            radius="md"    size="md" />
```

---

## Adding a new Figma Variable collection

If you add a new collection in Figma (e.g. "Motion" for animation tokens):

1. Open `scripts/figma-sync.mjs`
2. Add an entry to `COLLECTION_FILE_MAP`:
   ```js
   { match: 'motion', file: 'tokens/base/motion.json' },
   ```
3. Run the sync — the new JSON file will be created automatically
4. Style Dictionary picks it up on the next build (no config change needed)
