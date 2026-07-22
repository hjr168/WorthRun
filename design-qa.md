# WorthRun miniapp redesign QA

## Source and implementation evidence

- Source visual truth: `Redesign running app interface.zip`, home light frame rendered to `design-audit/2026-07-22-redesign-check/reference/01-home-light.png`.
- Implementation screenshot: `design-audit/2026-07-22-redesign-check/implementation/05-custom-nav-tabbar-final.jpg` from WeChat Developer Tools.
- Normalized implementation: `design-audit/2026-07-22-redesign-check/implementation/05-custom-nav-tabbar-final-crop.png`.
- Full-view comparison: `design-audit/2026-07-22-redesign-check/05-custom-nav-tabbar-comparison.png`.
- Focused comparisons: `design-audit/2026-07-22-redesign-check/05-topbar-focused-comparison.png` and `design-audit/2026-07-22-redesign-check/05-tabbar-focused-comparison.png`.
- Source pixels: 430 × 932. Implementation simulator: iPhone 12/13 mini at 375 × 812 CSS px, displayed at 79%; the 270 × 585 simulator capture was normalized to 430 × 932 for equal-size inspection.
- State: home, light theme, live event data. Additional runtime checks covered dark home, events after search navigation, and event detail with a back action.

## Findings

- P0: none.
- P1: none.
- P2: none.
- P3: WeChat-owned status bar, capsule, safe area, and live-data wrapping remain device/runtime differences.

The current user annotation intentionally supersedes the source frame's two-line `WorthRun / 哪场值得跑` content header: the page title now appears as a compact left-aligned custom-navigation title. The app-owned background remains continuous behind the custom top bar in both themes.

## Required fidelity surfaces

- Fonts and typography: navigation title uses the existing miniapp system stack, compact 34rpx size, strong weight, single-line truncation, and clear hierarchy without overlapping action controls.
- Spacing and layout rhythm: the title, search, theme action, native capsule, and optional back action occupy one measured navigation row. Home, events, and mine no longer reserve a duplicate content-title block.
- Colors and visual tokens: title and navigation background use the existing `--wr-text` and `--wr-bg` tokens; light/dark switching remains coherent.
- Image and icon fidelity: the real search asset is centered in a 72rpx flex action. Native tab icons remain 64 × 64 PNG files for WeChat compatibility, with artwork reduced to a maximum 44 × 44 alpha bound and centered on the transparent canvas.
- Copy and content: all 15 routes expose their existing page name in the custom bar. Existing product wording and functions are unchanged.

## Comparison history

1. Earlier implementation placed the home title in content, kept events/mine titles outside the custom navigation, and rendered tab artwork close to the full 64px canvas.
2. Fixes: added reusable `title` and `showSearch` inputs to `theme-shell`, moved the existing search action into that component, added route titles, removed duplicate root-page headings, and padded all six native tab assets.
3. Post-fix evidence: the full and focused comparisons show the search glyph centered, the title clear of the action/capsule area, and the tab glyphs reduced while retaining selected/unselected states.

## Interaction and runtime verification

- Home search opened `pages/events/index` and focused the existing search flow.
- Event selection opened `pages/event-detail/index`; its left title and back control rendered without overlap.
- Light-to-dark and dark-to-light switching preserved the new navigation hierarchy.
- WeChat Developer Tools console: 0 errors. Remaining messages are environment, deprecation, or worker warnings.
- TypeScript compilation, no-emit typecheck, 49 test files / 197 tests, and `git diff --check` passed.

## Tools card-width follow-up

- Source visual truth: `design/figma-screenshots-2026-07-21/07-tools.png` at 267 × 580.
- Implementation screenshot: `design-audit/2026-07-22-redesign-check/implementation/06-tools-width-final.jpg`; the simulator region was normalized to `implementation/06-tools-width-final-crop.png` at 267 × 580.
- Side-by-side evidence: `design-audit/2026-07-22-redesign-check/06-tools-width-comparison.png`.
- User annotation intentionally supersedes the source's narrow, centered tool cards: both cards now fill the same page content width as the header while retaining the existing 40rpx page inset.
- Earlier P2: WeChat's native `button` continued shrinking to content width even with `width: 100%`, creating excessive side whitespace and severe copy wrapping.
- Fix: the page is now a stretching flex column, and tool buttons use `align-self: stretch`, `max-width: none`, and `min-width: 100%`. The minimum-width rule is required by the WeChat runtime.
- Post-fix check: both cards align to the header edges, card copy wraps naturally, light-theme tokens and source icons remain unchanged, both entry labels remain visible, and the Developer Tools console reports 0 errors.
- Typography, color tokens, icon assets, copy, routes, and card interaction behavior were unchanged.

Final result: passed
