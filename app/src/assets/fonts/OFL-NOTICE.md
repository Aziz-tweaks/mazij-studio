# Font licensing

Alexandria, Readex Pro and Vazirmatn are distributed under the **SIL Open Font
License, Version 1.1**, and sourced from [Google Fonts](https://fonts.google.com/).
The full license text ships with this repository at
[`LICENSES/OFL-1.1.txt`](../../../../LICENSES/OFL-1.1.txt).

The static `.woff2` files are self-hosted so the app works fully offline. **No
modifications were made to the font binaries**; they are the upstream Google
Fonts builds.

## Copyright notices

Reproduced verbatim from each family's upstream `OFL.txt`, as the license
requires:

```
Copyright 2022 The Alexandria Project Authors (https://github.com/Gue3bara/Alexandria)
```

```
Copyright 2018 The Readex Pro Project Authors (https://github.com/ThomasJockin/readexpro),
with Reserved Font Name "RevReading Lexend".
```

```
Copyright 2015 The Vazirmatn Project Authors (https://github.com/rastikerdar/vazirmatn)
```

## Where the files live

This notice covers **every** copy of these fonts in the repository, not only the
directory it sits in:

| Path | Families |
|---|---|
| `app/src/assets/fonts/files/` | Alexandria, Readex Pro, Vazirmatn — the app's own text engine |
| `app/public/motion-styles/fonts/` | Alexandria — the Arabic range for motion-style templates, wired in `fonts.css` as `MzArabic` |

The second directory holds byte-identical copies of five Alexandria weights. It
is separate because the motion-style templates render in their own isolated
document and cannot reach the app's bundler output.

## Reserved Font Name

Readex Pro carries the Reserved Font Name *RevReading Lexend*. Under OFL §3 a
modified version may not be distributed under that name. This repository
distributes the fonts unmodified, so the clause is satisfied; anyone who *does*
modify them must rename accordingly.
