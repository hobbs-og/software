# software

The baseline design system for web, iOS and Android. One set of design tokens, controlled by Figma, built for every platform.

```
Figma: software-subatomic  ──plugin──▶  tokens/*.json  ──scripts/build.mjs──▶  platforms/web      tokens.css
(variables are the source)             (W3C DTCG)                              platforms/ios      SoftwareTokens (Swift package)
                                                                               platforms/android  SoftwareTokens.kt (Compose)
```

Nothing in `tokens/` or `platforms/` is edited by hand. Change the variable in Figma, push, review the pull request.

## How the tokens are organized

| Tier | Figma collection | File | Themed by |
|---|---|---|---|
| Primitive | Tier 1 · base values, core | `tokens/primitives.json` | nothing |
| Semantic color | Tier 2 · semantic color | `tokens/semantic.light.json`, `semantic.dark.json` | Light / Dark mode |
| Semantic typography | Tier 2 · semantic typography | `tokens/typography.default.json`, `typography.rhinestone.json` | brand mode (font families only, today) |
| Component | software-components, linked to software-subatomic | `tokens/component/component.json` | inherits from semantic (one mode) |
| Layout | grid | `tokens/grid.small.json`, `medium`, `large` | viewport width |

**Brands are modes on core, themes are modes on semantic color, and components have one mode.** A frame or page picks a brand and a theme independently, and a component follows both because it only points at semantic tokens. **Only semantic color changes with the theme.** Typography lives in its own collection so its variables don't carry an unused Dark column. Its modes are brands, not themes: the first mode (`default`) is the baseline, and each other mode (`rhinestone`) overrides only what differs. Component tokens point at semantic tokens, so every button, input and card follows Light/Dark without its own dark values.

**Primitive colors are private.** In Figma they are hidden from every property picker. The build treats a primitive with no scopes the same way: platforms get its resolved value, never the token. Designers and developers both reach for `color/content/default`, never `color/gray-charcoal/400`.

### Component naming

```
{component}/spacing/{gap | padding-x | padding-y | …}
{component}/color/{variant}/{background | content | border}/{default | hover | focus | disabled}
```

Icons are content. Example: `button/color/outline/content/default` → `--button-color-outline-content-default`, `SoftwareTokens.Button.colorOutlineContentDefault`.

## Pushing changes from Figma

### One-time setup

1. **Create a GitHub token.** On github.com: your avatar → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
   - Token name: `Figma tokens plugin`
   - Resource owner: `hobbs-og`
   - Repository access: **Only select repositories** → `software`
   - Scroll to **Permissions** and click **+ Add permissions**. Choose **Contents** and **Pull requests**, then set each one's access to **Read and write** (they are added as Read-only).
   - Click **Generate token** and copy it.
2. **Install the plugin in Figma.** This needs the Figma desktop app.
   - Open the software-subatomic file.
   - Main menu → **Plugins** → **Development** → **Import plugin from manifest…**
   - Select `figma-plugin/manifest.json` from this repository.

### Every time

1. In Figma: **Plugins** → **Development** → **Software Tokens → GitHub**.
2. Paste the token the first time, and tick **Remember token on this computer** if you want.
3. Optionally describe what changed, then click **Export and open pull request**.
4. Open the pull request. Within a few minutes the **Tokens** workflow commits the rebuilt web, iOS and Android files to it and runs the contrast check.
5. Review the diff and merge.

Run the plugin from either Figma file. **software-subatomic** exports core, semantic and grid to `tokens/`; **software-components** exports component tokens to `tokens/component/`. Each export only adds, changes or removes files in its own folder. Both use the repository `hobbs-og/software`.

The plugin refuses to export, and lists why, if a variable points to another library, if a name is both a token and a group (for example `color/brand` next to `color/brand/primary/100`), if a file mixes component collections with shared tiers, or if a component collection has more than one mode. Fix those in Figma first.

## Using the tokens

1rem = 16px = 16pt = 16dp. Text sizes use rem on the web, sp on Android and scale with Dynamic Type on iOS, so every platform honors the user's text-size setting.

### Web

```html
<!-- Preload the one font file almost every page needs. -->
<link rel="preload" href="/fonts/inter-normal-latin.woff2" as="font" type="font/woff2" crossorigin>
```

```css
@import "@hobbs-og/software/fonts.css"; /* serve platforms/web/fonts/ beside it */
@import "@hobbs-og/software/tokens.css";

.card {
  background: var(--color-background-default);
  color: var(--color-content-default);
  padding: var(--spacing-padding-md);
}
```

- **Theme:** follows the operating system by default. Force one with `data-theme="light"` or `data-theme="dark"` on `<html>` or on any section, which also lets a dark section sit inside a light page.
- **Brand:** the default brand applies everywhere. Switch a page or section to another
  brand with `data-brand="rhinestone"`, which carries both its colors (Tier 1) and its
  type (semantic typography) — one brand, one switch. It works on `<html>` or on any
  subtree, in either theme. Native outputs use the default brand (and the system font).

### Grid (web)

Import `@hobbs-og/software/grid.css` after `tokens.css`. It is generated from the grid tokens: 2 columns below 35em, 8 from 35em, 12 from 60em.

- `.grid` is the page grid. Write spans for 12 columns: `.span-1` … `.span-12`, or `.span-all`.
- On 8 columns, spans remap by the share of the row they take (Mark's tablet rule): 1–4 → 2, 5–7 → 4, 8–11 → 6, 12 → 8. A row that fills 12 columns still fills 8 (8+4 → 6+2, 6+3+3 → 4+2+2).
- On 2 columns, every span is full width.
- `.subgrid` on a span lays its children on the page's own tracks, so nested spans line up with the page columns and remap with them. It replaces the old `.columns--N` containers.
- Empty `span`/`div` children are spacers: they shift content on the 12-column grid and are hidden below it.
- **Grid:** `--columns`, `--container-gutter`, `--section-padding` and `--section-gap` change at 35em (560px) and 60em (960px). Breakpoints use `em` so they move with the user's browser font size.
- **Font:** every font-family token falls back to the OS system sans-serif, then Helvetica: `"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, sans-serif`. Inter is self-hosted, never loaded from the Google Fonts CDN (see Fonts below).

### Fonts

Inter comes from Google Fonts (SIL Open Font License) and is **self-hosted**. Measured 2026-09-17:

- Google serves Inter as a variable font: one 73,016-byte woff2 covers every weight (100–900) for Latin. Inter's own `InterVariable.woff2` is 352,240 bytes because it isn't subset.
- Loading from the CDN adds two extra origins (fonts.googleapis.com, fonts.gstatic.com), ~55–67ms each for DNS + TCP + TLS on a fast connection, plus a render-blocking stylesheet. Browsers partition their cache by site, so there is no shared-cache benefit.
- Self-hosting the same Google files removes both connections and lets the Latin file be preloaded.

`platforms/web/fonts/` holds 14 variable woff2 files (upright and italic × Latin, Latin Extended, Cyrillic, Cyrillic Extended, Greek, Greek Extended, Vietnamese) and `OFL.txt`. `fonts.css` gives each file a `unicode-range`, so an English page downloads only `inter-normal-latin.woff2` (verified in Chrome: one 73 KB request serving weights 400–900). To update Inter, run `npm run fonts`.

**Inter is web-only.** iOS and Android use their system fonts, Mark's decision (2026-09-17), so the native outputs contain no font-family tokens and no font files are bundled.

### iOS (SwiftUI)

Add the package in Xcode: **File** → **Add Package Dependencies…** → `git@github.com:hobbs-og/software.git`.

```swift
import SoftwareTokens

struct Greeting: View {
    // Scales the token size with the user's Dynamic Type setting.
    @ScaledMetric(relativeTo: .body) private var bodySize = SoftwareTokens.Typography.bodyDefaultFontSize

    var body: some View {
        Text("Hello")
            .font(.system(size: bodySize, weight: SoftwareTokens.Typography.bodyDefaultFontWeight))
            .foregroundStyle(SoftwareTokens.Color.contentDefault)
            .padding(SoftwareTokens.Spacing.paddingMd)
    }
}
```

iOS uses the system font (San Francisco); font-family tokens are web-only. Colors switch with the system appearance and with `.preferredColorScheme`. A fixed `.system(size:)` does not follow Dynamic Type on its own, which is why the size goes through `@ScaledMetric`.

**Layout on iPhone Duo.** Pick grid values from the width your view actually has, not the device model:

```swift
GeometryReader { proxy in
    let grid = SoftwareTokens.Grid.mode(forWidth: proxy.size.width)
    // Folded (≈466pt wide) → small, 2 columns. Unfolded (≈890pt landscape) → medium, 8 columns.
}
```

The ≈466pt and ≈890pt figures assume a 3× display scale, which Apple does not publish for iPhone Duo. Confirm them in the Simulator.

### Android (Jetpack Compose)

Add `platforms/android/src/main/kotlin/design/hobbs/software/tokens/SoftwareTokens.kt` to a module that depends on Compose UI, Foundation and Runtime.

```kotlin
Text(
    text = "Hello",
    color = SoftwareTokens.Color.contentDefault,
    fontSize = SoftwareTokens.Typography.bodyDefaultFontSize,
    modifier = Modifier.padding(SoftwareTokens.Spacing.paddingMd),
)
```

Android uses the device's default system font (no `fontFamily` set); `sp` sizes follow the user's font-scale setting. Colors follow the system dark theme. Force one for a subtree with `CompositionLocalProvider(LocalSoftwareDarkTheme provides true) { … }`. Use `SoftwareTokens.Grid.forWidth(windowWidth)` for layout values.

## Accessibility checks

`checks/contrast.json` lists every foreground/background pair a component uses. `npm test` measures each pair in every theme against WCAG 2.1 AA (4.5:1 for text, 3:1 for boundaries and focus indicators) and fails the pull request if one falls short. Add a pair whenever a component puts two colors together.

The same command checks **theme coverage**: every color a designer can pick must reach `Tier 2 | semantic color`. A component color pointing straight at a primitive (say `color/brand/secondary/400`) looks right in light mode and stays the same in dark, so the pull request fails until it points at a semantic token.

## Commands

```bash
npm run build
```

```bash
npm test
```

No dependencies to install. Requires Node 20 or later.
