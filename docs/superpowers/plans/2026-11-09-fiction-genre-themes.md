# Fiction Genre Themes Implementation Plan

**Goal:** Give every fiction genre its own appropriate environment and palette; Chinese palace scenery and portraits remain exclusive to Chinese fiction.

**Architecture:** Keep the existing Chinese atmospheric layer. Add a genre catalog and theme synchronizer, extract reusable surface styling into a token-based fiction stylesheet, and supply eleven independent generated scene assets. Existing room/provider values stay underneath and return outside fiction.

**Tech stack:** Native JavaScript modules, CSS custom properties, local compressed JPG assets, Node test runner.

- [x] Add behavior coverage for all twelve genres, repeated switching, unknown values and leaving fiction.
- [x] Add the genre catalog and connect it to the existing form/restore paths and scene label.
- [x] Share readable surface styling through per-genre palette tokens while preserving the approved Chinese colors and effects.
- [x] Generate and inspect eleven distinct backgrounds with no Chinese architecture in other genres. Save exact prompts alongside assets.
- [x] Verify all genres and image URLs in an isolated actual-Studio preview; inspect desktop and narrow screens, then run related tests and a scoped finish review. Result: 44 tests passed; scoped reviewer disposition ship.

**Constraints:** Preserve unrelated working changes. No new runtime dependencies or API calls. Decorations stay noninteractive. Respect reduced motion/transparency. Do not reload the user's live writing job. Existing Chinese imagery must remain unchanged.
