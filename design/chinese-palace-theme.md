# Chinese fiction Studio theme

The existing Studio layout remains the task interface (Operate). Selecting `contentMode = fiction` and `fictionGenre = chinese` gives the whole workspace an ancient Chinese palace atmosphere. Other fiction genres now use their own worlds, documented in `fiction-genre-themes.md`. Prose and item collections use the existing room and provider themes.

## Implementation

- `studio-fiction.css` follows `studio-crystal.css` and owns the shared surface styling and genre palette tokens. `studio-palace.css` retains the Chinese-only portrait and petal styling.
- `paintChinese()` synchronizes the selected fiction theme through `fiction-themes.js` alongside the existing Chinese story options, including initial mounting, form changes and restored settings. `syncStudioScene()` supplies the selected genre label while preserving the normal crew scene selection underneath.
- `chinese-theme.js` mounts one decorative, `aria-hidden`, noninteractive layer with 56 CSS petals and two alternating portraits. Repeated synchronization does not duplicate layers. Leaving the genre removes the layer and theme attribute, so no animations remain active. The layer is now above the background scrim and workspace so its elements are visible, and the shared portrait entrance/exit animation is defined in `fiction-atmosphere.css`.
- Crew duo palettes are overridden only while the palace theme is selected; the original inline values and room attributes remain available when leaving it.

## Palette and assets

| Token | Value | Purpose |
| --- | --- | --- |
| `--scene-accent` | `#ead5a0` | Pale antique gold buttons, focus rings and highlights |
| `--fiction-ink` | `#faf5e9` | Main ivory text |
| `--fiction-muted` | `#d9e4d5` | Secondary warm jade text |
| `--fiction-line` | `#aaac82` | Muted gold and sage borders |
| Main surface | `#233d3f` | Deep jade panels |
| Input surface | `#1b3236` | Dark jade controls |

The local palace JPG and transparent character WebP total about 1 MB. Exact built-in ImageGen prompts are recorded in `extension/ui/themes/chinese/README.md`. The portraits retain their original two-column image and now use the shared 28-second entrance/hold/exit effect, holding at .72 opacity on desktop rather than the earlier .22. Petals animate only transform and opacity, with 32 visible on narrow screens.

At the user's request, `palace-balanced.jpg` replaces the overly red background. It is an ImageGen edit of the same composition with jade roofs, ivory stone, natural wood, a soft blue-gray sky and restrained red/gold accents. The Chinese-only UI palette now coordinates with those colors; other genre palettes and the character/petal effects are unchanged.

Reduced motion hides falling petals and shows a static faint portrait. Reduced transparency uses solid surfaces and hides decorations. Existing keyboard focus styles inherit the gold accent. The narrow-screen wizard footer wraps its explanation above its two buttons to avoid squeezing Thai text into a tall column.

## Validation

The actual Studio source was run in an isolated localhost browser preview with Chrome APIs stubbed, because direct extension-page inspection was blocked by browser URL policy. The current balanced palette was captured on desktop and a narrow screen with no horizontal overflow or Studio boot error. The two portraits and 56 petals remain present. Checked Chinese palette text pairs have minimum contrast 5.5:1; the mechanical detector returned no findings. This does not exercise a live writing job inside the installed extension.
