# software: notes for AI sessions

Read `README.md` first. This file holds the rules that aren't obvious from the code.

## Source of truth

- The Figma file **software-subatomic** (`lNddkUU3x5467wcBKWZbvP`) controls every token value and name. Never edit `tokens/*.json` or `platforms/**` by hand, and never invent a value to fill a gap. Ask Mark.
- Figma's Variables REST API is Enterprise-only; Mark is on Pro. Tokens reach the repo through `figma-plugin/` (Plugin API → pull request). Don't reintroduce a REST sync.
- `figma-plugin/code.js` `exportTokens()` is the only Figma → JSON converter. If you script an export (e.g. through the Figma MCP), run that exact function so output matches the plugin byte for byte.

## Structure rules the build enforces

- Collection → tier mapping lives in `COLLECTION_FILES` in `figma-plugin/code.js`. A new collection needs an entry there.
- A token name belongs to exactly one tier, and a path can't be both a token and a group.
- Primitive tokens with empty Figma scopes are private: resolved into outputs, never emitted.
- Only the semantic tier has theme modes (`light`, `dark`). Component tokens reference semantic tokens so they theme for free. Web output keeps those references as `var()`.
- The grid collection needs a `min-width` token in every mode; modes are ordered by it.

## Naming

`{component}/color/{variant}/{background|content|border}/{default|hover|focus|disabled}` and `{component}/spacing/{gap|padding-x|padding-y}`. Icons are content. Mark set this pattern; follow it for every new component.

## Accessibility

Every colour pair a component uses goes in `checks/contrast.json`. `npm test` must pass before merging. A failing pair is a design decision for Mark, not something to fix by editing tokens.

## Constraints

- No npm dependencies. Build and checks are plain Node (≥20).
- Web values are rem (1rem = 16px); media queries are em. Native: pt / dp, text metrics sp.
- Font is Inter, self-hosted from Google Fonts' variable woff2 subsets (all weights, smallest files, no third-party connections). Never link the Google Fonts CDN. Web fallback, fixed by Mark: OS system sans-serif, then Helvetica (`FONT_FALLBACK` in `scripts/build.mjs`).
