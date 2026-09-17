# software

The baseline design system for web, iOS and Android. One set of design tokens, controlled by Figma, built for every platform.

```
Figma: software-subatomic  ──plugin──▶  tokens/*.json  ──scripts/build.mjs──▶  platforms/web      tokens.css
(variables are the source)             (W3C DTCG)                              platforms/ios      SoftwareTokens (Swift package)
                                                                               platforms/android  SoftwareTokens.kt (Compose)
```

Nothing in `tokens/` or `platforms/` is edited by hand. Change the variable in Figma, push, review the pull request.

## How the tokens are organised

| Tier | Figma collection | File | Themed by |
|---|---|---|---|
| Primitive | Tier 1 · base values, core | `tokens/primitives.json` | nothing |
| Semantic colour | Tier 2 · semantic color | `tokens/semantic.light.json`, `semantic.dark.json` | Light / Dark mode |
| Semantic typography | Tier 2 · semantic typography | `tokens/typography.json` | nothing |
| Component | Tier 3 · component specific | `tokens/component.json` | inherits from semantic |
| Layout | grid | `tokens/grid.small.json`, `medium`, `large` | viewport width |

**Only semantic colour changes with the theme.** Typography lives in its own collection so its variables don't carry an unused Dark column. Component tokens point at semantic tokens, so every button, input and card follows Light/Dark without its own dark values.

**Primitive colours are private.** In Figma they are hidden from every property picker. The build treats a primitive with no scopes the same way: platforms get its resolved value, never the token. Designers and developers both reach for `color/content/default`, never `color/gray-charcoal/400`.

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

The plugin refuses to export, and lists why, if a variable points to another library, or if a name is both a token and a group (for example `color/brand` next to `color/brand/primary/100`). Fix those in Figma first.

## Using the tokens

1rem = 16px = 16pt = 16dp. Text sizes use rem on the web, sp on Android and scale with Dynamic Type on iOS, so every platform honours the user's text-size setting.

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

iOS uses the system font (San Francisco); font-family tokens are web-only. Colours switch with the system appearance and with `.preferredColorScheme`. A fixed `.system(size:)` does not follow Dynamic Type on its own, which is why the size goes through `@ScaledMetric`.

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

Android uses the device's default system font (no `fontFamily` set); `sp` sizes follow the user's font-scale setting. Colours follow the system dark theme. Force one for a subtree with `CompositionLocalProvider(LocalSoftwareDarkTheme provides true) { … }`. Use `SoftwareTokens.Grid.forWidth(windowWidth)` for layout values.

## Accessibility checks

`checks/contrast.json` lists every foreground/background pair a component uses. `npm test` measures each pair in every theme against WCAG 2.1 AA (4.5:1 for text, 3:1 for boundaries and focus indicators) and fails the pull request if one falls short. Add a pair whenever a component puts two colours together.

## Commands

```bash
npm run build
```

```bash
npm test
```

No dependencies to install. Requires Node 20 or later.
