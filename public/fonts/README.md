# Bundled fonts

QIYU bundles these original, unmodified font binaries for offline use. Both fonts are licensed under the SIL Open Font License 1.1. Their own license terms continue to apply independently of the application license.

| Font | File | Weights | Official source |
| --- | --- | --- | --- |
| Inter | `InterVariable.woff2` | 100–900, upright variable | [Inter project](https://github.com/rsms/inter/tree/353b61b9f4430d5f420d56605a6e7993e0941470) |
| Noto Sans SC | `NotoSansSC-VF.ttf` | 100–900, upright variable | [Noto CJK project](https://github.com/notofonts/noto-cjk/tree/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans) |
| Noto Serif SC | `NotoSerifSC-VF.ttf` | 200–900, upright variable, v2.003 | [Noto CJK project](https://github.com/notofonts/noto-cjk/tree/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Serif) |

The Simplified Chinese regional fonts include 30,890 mapped code points (Sans) and 30,928 (Serif); neither is a subset restricted to QIYU's current UI text. The original official regional filenames are preserved. Font copyright notices are also embedded in each font's metadata.

- Inter: Copyright © 2016 The Inter Project Authors. Full notice and OFL in `Inter-OFL.txt`.
- Noto Sans SC: Copyright © 2014–2021 Adobe, with Reserved Font Name 'Source'. Full OFL in `NotoSansSC-OFL.txt`.
- Noto Serif SC: Copyright © 2017–2024 Adobe (http://www.adobe.com/). Full OFL in `NotoSerifSC-OFL.txt`, with the copyright embedded in the original binary.

Pinned download URLs, byte lengths, commit IDs and SHA-256 checksums are in `sources.json`. No Google Fonts CSS, font CDN or fontsource package is needed at runtime.

The interface can select modern sans (Inter + Noto Sans SC, the original default), bookish serif (Noto Serif SC), or installed system UI fonts. Serif is loaded only when used or previewed, and is bundled to keep the choice available offline. Font selection is a local appearance preference; it does not alter collection metadata or saved reviews.
