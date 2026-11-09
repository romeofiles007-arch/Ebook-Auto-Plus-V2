# SP-Kangfu license review

Reviewed 2026-11-09 for Thai Chinese-brush cover titles. Following the user's instruction to proceed, the unchanged font is now bundled for cover rendering and is the automatic Chinese-genre choice. Its terms summary, original credits and source/hash record ship beside the binary in `extension/fonts/cover/`.

## Sources checked

- [SP-Font release page](https://www.f0nt.com/release/sp-kangfu/), which links to the site's license and the designer's original thread.
- [Designer thread](https://forum.f0nt.com/index.php/topic,24076.0.html), including the release post and original download link.
- [f0nt.com license and FAQ](https://www.f0nt.com/about/license/).
- The ZIP downloaded using the release page's actual link: `https://www.f0nt.com/?dl_name=SP-Font/SP-Kangfu.zip`.

## Findings

The release ZIP contains only `SP-Kangfu.ttf` (550,232 bytes). There is no accompanying license document. Font name-table records 13/14 (license text/URL) are absent. The file retains NP NaipolTemplate credits and copyright information. Neither the release page nor designer thread reviewed states an additional commercial restriction, so the site's published general terms are the applicable terms found in this review.

- **Commercial cover artwork and books for sale:** permitted by the general license FAQ on print production and commercial design.
- **Font bundled with software for correct display/convenience:** expressly described as an allowed exception in the general terms. Preserve the original file and credits; include the published terms and original source links when integrating. Do not advertise the file itself as the product being sold.
- **Standalone font resale or a separate font-download mirror:** not permitted by those general terms.
- **Modifying the font for commercial work or redistributing a modified font:** requires the designer's permission under those terms. This is not an OFL font.
- **PDF embedding:** the original file has OS/2 `fsType = 0x0008`, the editable-embedding flag defined by the [OpenType specification](https://learn.microsoft.com/en-us/typography/opentype/spec/os2#fstype). It has neither the no-subsetting nor bitmap-only flag. Together with the site's explicit permission to produce books, this supports embedding the unchanged font in the generated book document. The flag is technical supporting evidence, not a replacement for the published license.

## Artifact identity

- ZIP SHA-256: `990a06dc3a996c2080d58cdc759e2d2ce55bc3c33ebfaf9868d7a7c7ffbc9dad`
- TTF SHA-256: `5581c13dbabfacfcfda95fec07c0b1427fa4dcee971dda0ff07ddb508a53a790`
- Family: `SP-Kangfu`, Regular; version 3.001, March 14, 2020.

Local inspection material is in ignored `tmp/sp-kangfu-license-review/`: the original ZIP/TTF, metadata JSON, and retrieved HTML copies of the release, license and author pages. Recheck terms if replacing this exact binary with a later download.
