# مختبر التكافؤ — Mazij Parity Lab

**يُقرأ بعد `THE-NERDS.md` ويعمل تحته:** لا يُلغي
شيئًا من الميثاق، بل يضيف ما ثبت أنه ناقص.

## لماذا

عندنا ١٢ ألف سطر استطلاع في `re-*.md`، ومع ذلك وجد مراجعٌ من خارج الفريق في دقائق، يوم
١٩ أكتوبر على `main` (`f184c46`):

١. اختيار حركة «ظهور تدريجي» لنصٍّ يُخفيه من اللوحة كليًّا، ويبقى إطار التحديد فارغًا.
   الرجوع إلى «بدون» يُعيده. اللوحة تعرض لحظة البداية الشفّافة.
٢. معاينة نافذة التصدير تعرض تصميمًا آخر (دائرة صفراء وشارة ومربّع منقّط) لا التصميم المفتوح.
٣. نافذة التصدير تفتح وأربعة مقاسات محدّدة مسبقًا، فتخرج أربعة ملفّات بدل واحد.
٤. شاشة البداية تفيض أفقيًّا تحت ٩٠٠ بكسل، وتُقصّ العناوين اليمنى.
٥. أربعة خوادم تطوير قديمة لمزيج (المنافذ 1435 و1436 و1439 و1443) تعمل منذ ١٨ أكتوبر على
   مجلّدات محذوفة، وخادم 1455 يخدم فرعًا أقدم من `main`. من يجرّب عليها يجرّب نسخةً غير التي تُبنى.

و`HANDOFF.md` يقول ١٥٣٢ تأكيدًا ناجحًا وصفر فاشل. فالعائق **ليس الاكتشاف**، بل تحويل ما
اكتُشف إلى سلوكٍ يعمل ويُرى بالعين.

## القواعد الجديدة

١. **وحدة العمل سلوكٌ واحد:** فعلُ مستخدمٍ واحد وأثرُه الكامل المرئيّ، لا وحدةٌ برمجيّة.
٢. **البحث الموجود أوّلًا.** تُجرَد `re-*.md` وما غطّته لا يُعاد؛ يُبحث فقط في الناقص.
٣. **مجالٌ واحد في كلّ جولة، وعشرة سلوكيّات حدًّا أقصى،** والأعطال المضلِّلة (P0) أوّلًا.
٤. **دورٌ جديد: `verify`.** وكيلٌ جديد لم يرَ الفرق ولا تقرير المنفّذ، يجرّب بإدخالٍ حقيقيّ.
   **ولا تُقال «تمّ» إلا بحكمه.** نجاح الاختبارات وحده لا يكفي.
٥. **المنفّذ يستلم سلوكًا واحدًا** في شجرة عملٍ خاصّة، ولا يضيف ميزات، ولا يعدّل اختبارًا قائمًا.
٦. **المواصفة بلا كودٍ وبلا أسماء من المصدر.** الإسناد (`ملف:سطر` واللقطات) في
   `provenance.md` منفصلٍ لا يقرؤه المنفّذ.
٧. **البرامج المغلقة بالمراقبة فقط:** لا فكّ حِزم، ولا حقن سكربتات، ولا حفظ أصول، ولا إدخال
   كلمات مرور؛ تسجيل الدخول يفعله المالك بنفسه.
٨. **خوادم التطوير تُحصى في بداية كلّ جولة،** ويُبلَّغ عن القديم منها ولا يُطفأ بلا إذن.
٩. **الجولة تتوقّف بعد التقرير.** لا يبدأ البناء إلا بموافقة المالك على ما يختاره.

والإجراء الكامل بالتفصيل أدناه، بالإنجليزيّة لدقّته عند الوكلاء؛ وكلّ ما يخرج منه بالعربيّة.

---

## Procedure (English, for agents)

### The unit of work: a behavior

A behavior is one user action and its complete observable effect, for example
"press the pen tool while a shape is selected". The useful information is rarely the headline
("the pen draws paths"); it is everything else that happens: the selection clears, the cursor
changes, the properties panel switches, Escape returns to the previous tool, undo does not record it.
Every agent writes about behaviors, not about modules.

### Sources and what may be done with each

| Source | Where | Kind | Allowed |
|---|---|---|---|
| an open-source vector engine | a local checkout (Rust, egui) | open, MIT OR Apache-2.0 | read source, run it, measure |
| an open-source timeline editor | a local checkout (Rust, egui) | open, MIT OR Apache-2.0 | read source, run it, measure |
| an open-source motion engine | a local checkout if present | open, same family | read source, run it, measure |
| a common design tool | web, owner's own login | closed | observe through the UI only |
| a common video editor | `/Applications/a common video editor.app` | closed | observe through the UI only |
| Mazij | `<repo>` branch `main` | ours | read, run, measure; edits only in Phase 4 |

### Clean-room rules (all agents)

1. **No code crosses over.** Specs contain no source code, no pseudo-code that follows a source
   function line by line, and no source identifiers in anything the builder will read.
2. **Facts are fine.** Numbers (a 4 px drag threshold, a 150 ms ease-out) and general techniques
   (pointer capture, topmost-first hit testing) are facts and ideas, not code.
3. **Provenance is kept separately** in `provenance.md`: `file:line` for open sources, a screenshot
   or recording path for closed apps. The builder never needs it.
4. **Deliberate porting is an explicit exception** (charter rule 1): ask the owner first; if
   approved, name the source, file and license in a comment and in `NOTICE`.
5. **Closed apps: observation only.** No decompiling, no reading their JavaScript bundles, no
   injected scripts, no saving templates, fonts, icons, images or audio. Screenshots, the
   accessibility tree, recordings and stopwatch timing only. Never type credentials.
6. **No brands in Mazij.** Their names, wording, icons and identity never appear in Mazij's UI,
   assets or any file that may be published. Mazij borrows behavior, not looks.

### Phase 0: Setup (the planner alone)

1. Read `THE-NERDS.md`, `HANDOFF.md`, `BUGS.md`, `UX-AUDIT-*.md`, `CONTROLS.md`, then the headings
   of every `re-*.md` and قياسٌ خارجيٌّ موثَّق.
2. Pick one surface: canvas direct manipulation (default), Arabic text editing, timeline and
   motion, export, or first run to first finished design. Ask the owner if unclear.
3. Write `coverage.md`: every behavior of that surface already described, with doc and section,
   marked `covered`, `partial` or `missing`. Research only `partial` and `missing`.
4. Record the commit hash of every source repo and of Mazij `main`.
5. Run folder outside the repo: `<scratch>/parity/<YYYY-MM-DD>-<surface>/` with `specs/`,
   `tickets/`, `evidence/`.
6. Run Mazij `main` on a free port. List every Mazij dev server already listening; report stale
   ones (deleted folders, old branches) to the owner; do not kill without asking.
7. Never `git checkout` or `git switch` in `<repo>`.

### Phase 1: Discovery (relevant agents in parallel)

| Surface | Agents |
|---|---|
| Canvas direct manipulation | A, C, E |
| Arabic text editing | A, C, E |
| Timeline and motion | B, D, E (+ A if keyframes are edited on canvas) |
| Export | A, B, C, D, E |
| First run to first design | C, D, E |

Each agent gets: the surface, its `partial`/`missing` list, the clean-room rules verbatim, the
checklist below, the card template, and its own output path. None writes to Mazij.

- **A, `recon` an open-source vector engine.** Find each behavior's entry point and trace everything that runs after
  the "main" line: state resets, tool switches, selection, panels, cursor, history, redraw. Run
  an open-source vector engine and confirm in the UI; where code and UI disagree, the UI wins. Record every number,
  its unit, screen or document space, and whether it scales with zoom. → `discovery-vectorcraft.md`
- **B, `recon` an open-source timeline editor.** Same, for timeline, playback, trimming, keyframes, export: what is
  frame-accurate, what snaps to what and in which priority, what happens to playhead and selection
  after each edit, how preview stays smooth. → `discovery-filmcraft.md`
- **C, observer a common design tool.** In a dedicated Arabic test session, ideally Arabic. Blank designs only.
  Measure in small increments (drag 1, 2, 3 px for a threshold; approach a guide slowly for snap
  distance; hover around a corner for the rotation zone). Screenshot each step, GIF for motion.
  Mark anything not seen `unobserved` with the reason. → `discovery-canva.md`, `evidence/canva/`
- **D, observer a common video editor.** Same, on the desktop app via screenshots and the accessibility tree.
  Earlier recon: synthetic edge drags moved the whole clip instead of trimming; try slow real drags
  with a hover pause, else `unobserved`. → `discovery-capcut.md`, `evidence/capcut/`
- **E, Mazij baseline.** The same behaviors in Mazij `main` at 1440 x 900 and once at 900 px wide,
  real input only, Arabic and Latin text. Record what happens today and every bug seen, without
  reading source to explain it. → `mazij-baseline.md`, `evidence/mazij/`

### Behavior checklists

Answer every item that applies. "Not applicable" and "unobserved" are valid; silence is not.

**Every behavior.** Trigger (button, shortcut, menu, gesture; does the shortcut fire while typing in
a field?). Preconditions and what happens when unmet. Feedback within one frame. Side effects on
selection, active tool, panels, focus, scroll, zoom. Escape mid-action; pointer leaving the window.
Undo: one step or many; does redo restore; is selection restored. Doing it twice. RTL and Arabic.

**Canvas direct manipulation.**
- Hit testing: topmost first; inside stroke-only shapes; tolerance in screen px; locked and hidden
  objects; empty canvas vs outside the artboard.
- Select on pointer down or up; press-and-drag on an unselected object moves it at once?
- Drag threshold (px, screen or document).
- Groups: click selects group or child; how to enter a group.
- Marquee: intersect or contain; direction matters; Shift adds, Cmd/Alt subtracts.
- Handles: screen-px size constant across zoom; hit area vs drawn size; hidden on tiny objects;
  rotation zone.
- Modifiers: Shift (ratio, 15 degree steps, axis lock), Alt (from center, duplicate on drag),
  Cmd (no snapping); pressed mid-drag.
- Snapping: targets (artboard edges and center, object edges and centers, equal spacing, grid,
  pixel); distance in screen px; priority; hysteresis; guide look and lifetime.
- Nudge: arrow and Shift+arrow distances; undo per burst or per press.
- Resize: anchor; flip past the opposite edge; text (scale font or reflow); images (crop or scale).
- Rotate: center; snaps at 0/45/90; handles of rotated objects.
- Multi-selection box, group rotation, alignment controls.
- Duplicate and paste position. Zoom and pan (wheel, pinch, Space+drag, to cursor, limits,
  Cmd +/-/0). Auto-scroll near edges. Frame rate during drag with 200 objects.

**Arabic text editing.** Enter and leave edit mode and what stays selected; caret with arrows in
Arabic, mixed text and line ends; selection across direction changes; live joining, diacritics,
kashida, Arabic vs Western digits; line breaking and box auto-resize; default alignment; font
fallback; font change keeps selection; paste plain vs styled, RTL marks.

**Timeline and motion.** Scrub accuracy, audio scrub, preview quality while scrubbing; playhead
(click, drag, snapping to it, Space, J/K/L, arrows); clips (select, move, trim either edge and trim
zone width, split, ripple vs overwrite, gaps, magnetic main track, snapping and distance);
keyframes (add, move, delete, copy, easing); **what the canvas shows while editing an animation
that starts invisible**; timeline zoom and scroll; undo granularity.

**Export.** Preview must be the current design at the chosen size and time; defaults and how many
files one click makes; progress, cancel, errors, destination, what happens after.

**First run to first design.** Clicks from launch to an exported design; hesitation points; empty
states; what is pre-selected; how templates and sizes are chosen.

### Behavior card (every discovery file)

```
### <اسم السلوك بالعربية>
- المُطلِق:
- الشروط المسبقة:
- الاستجابة الفورية:
- أثناء الفعل:
- عند الإفلات أو الاعتماد:
- عند الإلغاء:
- التراجع:
- الآثار الجانبية:
- الأرقام: (القيمة، الوحدة، شاشة أو مستند، هل تتغير مع التكبير)
- الحالات الطرفية: (تكبير 25% و400%، مدوَّر، مقفل، مجموعة، تحديد متعدد، نص عربي)
- لم يُرصد: (البند والسبب)
```

### Phase 2: Audit and synthesis

**F, clean-room auditor.** Extracts identifiers from the source repos
(`rg -o --no-filename '(fn|struct|enum|trait|const) [A-Za-z_][A-Za-z0-9_]*'`) and flags any in a
spec or ticket; flags code blocks other than shell or Mazij-side test steps; flags paragraphs that
walk a source function in the same order; flags closed-app names or identity that would reach
Mazij's UI; flags numbers without a measurement method and claims without provenance.
→ `audit.md`. The planner applies the fixes before Phase 3.

**The planner.**
1. `parity-matrix.md`: one row per behavior; columns an open-source vector engine, an open-source timeline editor, a common design tool, a common video editor, Mazij
   today, gap, severity, effort. P0 = misleads or breaks (content disappears, wrong preview, dead
   button, data loss). P1 = works but feels worse. P2 = polish. Order by severity, frequency, then
   lower effort. Keep the top 10.
2. `specs/NN-<slug>.md` for each: the Mazij behavior we want (best of the references, our choice
   and why in one line) and acceptance steps. No provenance, no source names, no code.
3. `00-index.md` in Arabic: surface, what was reused, what was newly observed, top 10, what could
   not be observed, stale servers, next steps.

Acceptance steps are a human script the verifier runs by real input, for example:
```
١. افتح تصميمًا فارغًا ١٠٨٠×١٠٨٠.
٢. أضف مستطيلًا، واسحبه نحو منتصف اللوحة ببطء.
٣. المتوقَّع: يظهر خط إرشاد عند مسافة كذا بكسل شاشة من المنتصف، ويلتصق المستطيل، ويختفي الخط عند الإفلات.
٤. Cmd+Z مرة واحدة تُرجع المستطيل إلى موضعه الأول بالضبط.
```
Include an Arabic text case and a zoomed case (25% or 400%) where relevant.

### Phase 3: Report and stop

Send the owner a short Arabic summary (top 5 gaps, P0s first, what needs their sign-in or
decision) and stop. Building starts only on the owner's word, for the specs the owner picks.

### Phase 4: Build and verify (after approval)

**Builder ticket** (`tickets/NN-<slug>.md`, the full prompt for `build`):
```
المهمة: سلوك واحد فقط في مزيج: [اسم السلوك].
المواصفة: [محتوى specs/NN-<slug>.md كاملًا].

القواعد:
- اعمل في شجرة عمل خاصة من main:
  git -C <repo> worktree add <scratch>/parity-NN -b parity/NN-<slug> main
  ولا تنفّذ checkout في <repo> أبدًا.
- نفّذ هذا السلوك فقط. لا ميزات إضافية، ولا إعادة هيكلة خارج ما يلزمه.
- لا تعدّل أي اختبار أو عتبة أو مواصفة قائمة لتنجح. إن رأيت خطأً فيها، أبلغ بالدليل واتركها.
- أضف اختبارًا يقود السلوك بأحداث مؤشر ولوحة مفاتيح حقيقية، كما في خطوات القبول.
- تحقّق بالنص العربي والإنجليزي، وعند تكبير 25% و400%.
- أي نص جديد في الواجهة بالعربية، والاتجاه صحيح.
- لا تكتب "تم" قبل أن تشغّل خطوات القبول يدويًا في المتصفح.

التسليم: اسم الفرع وآخر التزام؛ لقطتا قبل وبعد لكل خطوة قبول؛ ما لم يُنجَز بصراحة.
```

**G, `verify`** (a fresh agent, never the builder): does not read the diff or the builder's
report before testing; runs the builder's branch on its own port at 1440 x 900; runs every
acceptance step by real input with a screenshot per expectation; repeats the five most common
actions of the surface and the earlier P0 checks to catch regressions; verdict per step: pass,
fail (screenshot and one line), or blocked. Only a full pass lets the planner mark the spec done and
merge. A fail goes back to the builder with the verifier's evidence, unchanged.

### Honesty

- A guess is never a measurement: write `unobserved` and why.
- Passing tests is not done; done is what `verify` saw working.
- A source that cannot be run or observed is named in `00-index.md`, and the run continues.
- The owner's report is short; detail lives in the files.
