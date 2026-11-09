# Thai cover typography

The cover title has a dedicated font role, independent of chapter headings and body copy. Twelve fiction genres resolve through `extension/core/cover-fonts.js` to eleven original Thai faces: ten under OFL and SP-Kangfu under the f0nt.com terms. Chinese defaults to SP-Kangfu; Charm remains a manual option. Each genre has distinct lettering art direction; manual supported choices override the genre default. Older books without a saved choice resolve automatically. English retains its existing heading face.

Studio exposes automatic/manual selection and a live title sample in the existing appearance settings. Browser fonts use local static files and `font-display: swap`; the typesetter receives the same binaries. Each face uses its actual supplied weight. SP-Kangfu receives a 1.5 optical size adjustment to compensate for its smaller glyphs within the em square, consistently in samples, preview, single cover and print spread. The font binary is unchanged. Title preview loads its selected face before measuring the overlay. The license helper follows the selected font rather than calling every face OFL.

Native single-cover and print-spread titles use the resolved family and weight. AI baked-text prompts receive the same family and genre treatment as art direction. Baked covers continue to render as images without a second title overlay. Thai vowels and stacked tone marks must remain intact.

## Validation

- Checked Thai cmap coverage, genre defaults, manual/invalid choices, native title routing and all three front-cover prompt routes.
- Loaded all eleven browser faces successfully: one FontFace returned for every requested family/weight.
- Rendered twelve genre specimens and compiled a native Typst specimen atlas using all eleven real faces; visually confirmed distinct shapes and Thai marks, including SP-Kangfu.
- Exercised automatic sci-fi/Chinese choices, manual choice across genre changes, and English disabled state in an isolated Studio preview.
- Inspected desktop and 390px mobile samples. The picker wraps within its column; the existing Studio has a separate overflowing muted label outside this field.
- The focused typography detector reported no findings.

Full font attribution, OFL texts, SP-Kangfu terms summary and source links, pinned source revision and binary hashes are in `extension/fonts/cover/`. The OFL maintenance downloader skips the separately sourced SP-Kangfu file.
