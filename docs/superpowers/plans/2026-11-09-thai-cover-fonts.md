# Thai Cover Fonts Implementation Plan

**Goal:** Use commercially usable Thai cover lettering appropriate to the selected book genre, with genuine bundled fonts for typeset covers and matching directions for AI-drawn cover text.

**Architecture:** A pure cover-font catalog resolves genre defaults and explicit user choices. Bundle unmodified static TTFs with their original OFL notices and pinned-source hashes. Reuse the resolver in cover prompts, Typst title overlays, browser preview and a small automatic/manual font picker. Body and chapter fonts remain independent.

- [x] Test genre mapping, manual overrides, Thai-mark coverage, prompt routing and native cover output.
- [x] Download ten verified OFL Thai font faces and preserve licenses/provenance.
- [x] Connect the catalog to cover prompts, the compiler and native cover title rendering.
- [x] Add a live Thai cover-font sample and automatic/manual choice to the existing appearance settings.
- [x] Verify real font loading, all genre samples, Typst output and relevant existing tests; review and document the result.

Validation: 52 relevant tests pass, syntax and diff checks pass, focused typography detector has no findings. All ten browser faces loaded; the native Typst compiler rendered a distinct specimen for each face. Studio automatic/manual/English states and desktop/mobile picker layouts were exercised. See `design/thai-cover-fonts.md` and `design/thai-cover-fonts-preview.png`.

**Constraints:** Preserve existing Flow baked-text behavior and avoid duplicate title overlays. AI-generated lettering can follow the chosen face and treatment but is not guaranteed to reproduce the font exactly. Keep all Thai vowels/tone marks and existing user text intact. Do not modify the font binaries or claim ownership of their designs.
