# Bundled assets

Everything under `public/` that is not code. Each entry says what it is, where
it came from, and under what terms it may be redistributed.

---

## `motion-styles/` — 20 motion templates and their previews

**Origin: this repository.** Each `<id>/template.html` is a canvas scene written
here. It draws from time alone with a fixed random seed and exposes
`window.renderFrame(t)`, so the same frame comes out on every run.

`<id>/preview.jpg` is **not** an imported image: it is a frame of that template,
rendered at `t = 0.55 × duration`. Regenerate all twenty at any time:

```bash
node scripts/make-motion-previews.mjs            # all styles
node scripts/make-motion-previews.mjs neon-glow  # one style
```

That script is the provenance. If a preview and its template ever disagree, the
template is the truth and the preview is stale.

`motion-styles/fonts/` holds Alexandria (Arabic range) under SIL OFL 1.1 — see
[`../src/assets/fonts/OFL-NOTICE.md`](../src/assets/fonts/OFL-NOTICE.md), which
covers this copy explicitly.

**Terms:** MIT, with the project.

---

## `sfx/` — 54 short sound effects

Eight categories: whoosh, pop, click, riser, shutter, gear, money, data.
Catalogued in [`../src/data/sfxLibrary.json`](../src/data/sfxLibrary.json) and
surfaced by `src/lib/sfxLibrary.ts`.

Each file was trimmed of leading silence so its onset lands on its event, capped
in length with a tail fade, and encoded to AAC at 48 kHz.

**Terms:** distributed as part of Mazij Studio under the project's MIT license.

> If any individual file is later found to originate from a third-party library,
> it must be named here with its own license and copyright line, or replaced.
> This notice is the place for that.

---

## `src-tauri/icons/` — application icons

**Origin: this repository.** Generated from the project mark by
`tauri icon`.

**Terms:** MIT, with the project.

---

## `../../design-source/` — the Phase 1 interface prototype

Not under `public/`, listed here because it is the one other non-code artifact
in the repository. A standalone interactive mock of the editor's interface
(`Mazij Studio.html`), kept because `src/theme/theme.ts` still cites
`reference-render.png` as the origin of the "island" light theme. The app does
not load anything from this directory.

`source/support.js` is a **generated** runtime bundle emitted by the prototyping
tool that produced the mock, not written here; its header says
`GENERATED from dc-runtime/src/*.ts`. Its own license is not recorded in this
repository. It is included because the prototype does not open without it.

**Terms:** the prototype itself ships under the project's MIT license. Anyone
redistributing `source/support.js` separately should establish its terms first.
