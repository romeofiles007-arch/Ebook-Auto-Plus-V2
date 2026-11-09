# Studio fiction genre themes

Every option in the fiction genre selector owns a distinct visual world. Chinese architecture, palace portraits and falling palace petals are exclusive to Chinese fiction. The existing form layout, text, controls, provider selection and crew activity remain intact.

| Genre key | Scene | Palette | Floating detail |
| --- | --- | --- | --- |
| romance | Sunny tropical seaside, ivory sand and a wooden swing | Turquoise, seafoam, sand | Fresh leaves |
| fantasy | Celtic forest, medieval castle and floating islands | Emerald, moss, pale gold | Fireflies |
| scifi | Orbital observatory overlooking Earth | Navy, cyan, silver | Stardust |
| mystery | London detective's mahogany study | Walnut, amber, parchment | Dust motes |
| thriller | Rainy modern Manhattan street at midnight | Petrol teal, charcoal, amber | Rain |
| horror | Abandoned Victorian manor under moonlight | Charcoal, indigo, muted wine | Drifting mist |
| drama | Piano, empty armchair and rainy apartment window | Slate, amber, terracotta | Rain |
| adventure | Mayan jungle temple, waterfall and hiking path | Olive, jungle teal, ochre | Jungle leaves |
| comingofage | Bicycles on a sunset hill above a riverside town | Dusk blue, peach, honey | Windblown seeds |
| literary | Contemporary Paris bookshop in the rain | Ink blue, walnut, ivory | Small paper sheets |
| senior | Teak home veranda and peaceful tropical garden | Sage, cream, honey | Gentle leaves |
| chinese | Balanced ancient imperial palace, jade roofs and pale stone | Jade, ivory, soft gold, restrained vermilion | Original pink petals |

## Responsibilities

- `extension/ui/fiction-themes.js` maps the twelve explicit genre selections to scene labels. `syncFictionTheme(contentMode, genre, doc)` activates a theme only for a known genre in fiction mode. Unknown values, prose and items clear the genre layer. It delegates palace decoration lifecycle to the existing Chinese module.
- `extension/ui/studio-fiction.css` contains the twelve palette blocks and shared surface rules under `html[data-fiction-theme]`. Each block sets `--fiction-image`, fourteen color tokens and a scrim RGB value. These drive scene accents, panels, text, inputs, selected controls, buttons, focus, selection and scrollbars. No genre uses another genre's image.
- `extension/ui/studio-palace.css` contains only the existing Chinese decorations and their accessibility/responsive rules. The Chinese portrait asset is unchanged; `palace-balanced.jpg` is a color-balanced edit of the original background at the user's request.
- `extension/ui/fiction-atmosphere.js` and `.css` own the other eleven ambient effects. A single noninteractive, aria-hidden layer is reused while the same genre remains selected and replaced when switching genres. The layer is above the background scrim and workspace at z-index 4 so it remains visible. Particle fields range from 22 mist wisps to 96 rain streaks; other genres have 48–90 particles. Up to 36 particles are visible on narrow screens. Chinese has 56 petals, capped at 32 on narrow screens. Larger particles and stronger opacity address the earlier visibility issue caused by decorations being hidden below the scrim and opaque panels.
- `extension/ui/fiction-characters.js` mounts two decorative portrait elements in every genre layer. Each palette references its own transparent two-column character sheet through `--fiction-characters`. Chinese retains its existing character asset; the other eleven genres have newly generated sheets in `themes/characters`. Both portraits use a 28-second staggered entrance/hold/exit cycle with opacity, horizontal movement and brief blur. Desktop hold opacity is .72; narrow screens use smaller edge portraits at .42. All elements ignore pointer input. Reduced motion stops animation; reduced transparency hides the layers.
- `paintChinese()` is already called during initialization, form restore and content/genre changes; it now synchronizes all fiction themes. `syncStudioScene()` reads the matching catalog label.

The room and crew duo attributes/inline values stay underneath the fiction layer. Genre CSS takes precedence while selected; removing the fiction attribute restores the original room/provider styling. No writing engine, prompts or book illustrations are modified by this theme work.

## Assets and accessibility

Eleven independent locally bundled JPG backgrounds total approximately 6 MB. Romance now uses `romance-seaside.jpg` at the user's request; the earlier garden asset was replaced. Exact built-in ImageGen prompts are in `extension/ui/themes/fiction/README.md` and embedded in the JPEG comment metadata. Only the currently selected background is referenced by matching CSS; portraits and palace petals are mounted only for Chinese fiction. Each other genre has the appropriate floating detail listed above. Reduced motion/transparency behavior for Chinese remains supported.

## Verification

Five theme lifecycle tests cover all twelve keys, transitions from Chinese to every other genre, matching ambient kinds, two portraits per layer, denser particles, repeated selection without duplicate decorations, leaving fiction, and unknown/prototype-property values. Related existing tests plus these tests pass (46 total). Runtime preview evidence is recorded in `tmp` and uses the actual Studio modules with Chrome APIs stubbed. Native installed extension execution is not exercised because browser policy does not allow extension URLs. Asset prompt provenance is saved alongside the WebP character sheets.

The current browser evidence is in `tmp/visible-effects-review`. All twelve themes were captured on the actual settings step, with two correct portrait references, one decorative layer, no boot error or horizontal overflow, and hit-testing reaching the page-count input through the foreground layer. The input was filled and restored successfully. Narrow captures show 36 generic particles or 32 Chinese petals, two portrait elements, and no horizontal overflow. Timed snapshots confirm a .72 hold, translated/blurred exit toward zero opacity, and replacement by the second portrait at .72. Prose and item modes remove every particle/portrait layer.

Eleven new transparent character sheets total approximately 4.2 MB. `ffprobe` confirmed alpha for those sheets and the existing Chinese asset. Exact built-in ImageGen prompts are in `extension/ui/themes/characters/README.md` and the companion WebP JSON provenance files.

The scoped visibility/character finish review returned **ship** with no blocking defects in the supplied desktop/narrow captures and lifecycle evidence. The reviewer independently reran all five lifecycle tests successfully. Sustained animation performance and every moving-frame contrast pair were not independently profiled.
