<div align="right">

# مزيج · Mazij Studio

**محرّرُ تصميمٍ وحركةٍ لسطح المكتب، عربيٌّ أوّلًا.**

تطبيقٌ مفتوحُ المصدر يبني الصورَ والمقاطعَ القصيرة: لوحةٌ متّجهة، وخطٌّ زمنيٌّ بمفاتيحِ حركة، وتصديرٌ إلى MP4 وGIF وPNG. مبنيٌّ على Tauri وReact وTypeScript.

> **المنصّة اليوم: macOS وحدَه.** الأساسُ (Tauri) يعمل على Windows وLinux، لكنّ سكربتَ تحميل
> ffmpeg الجانبيِّ يُجهّز ثنائيّاتِ macOS فقط بنصِّه، وتصديرُ «الصورة الحيّة» خاصٌّ بـmacOS.
> ونقلُه إلى منصّةٍ أخرى يبدأ من `app/scripts/setup-ffmpeg-sidecar.sh`.

</div>

---

## لماذا

أدواتُ التصميم الشائعةُ تُعامل العربيّةَ لاحقةً: تشكيلُ الحروف يَنكسر، واتّجاهُ النصّ يُقلَب، والكشيدةُ لا وجودَ لها، والواجهةُ كلُّها من اليسار. مزيج يبدأ من الطرف الآخر: التخطيطُ RTL أصلًا، وتشكيلُ الحروف يمرُّ بـ HarfBuzz، والواجهةُ عربيّة.

## القدرات

- **لوحةٌ متّجهة**: أشكال، ونصّ، وصور، وفيديو، وقلمٌ بمساراتِ بيزييه، وطبقاتٌ بتجميعٍ وقفلٍ وإخفاء.
- **نصٌّ عربيٌّ صحيح**: تشكيلٌ عبر HarfBuzz، واتّجاهٌ ثنائيٌّ عبر bidi-js، وكشيدةٌ متحكَّمٌ بها، وكسرُ سطرٍ يحترم الخطّ المختار.
- **خطٌّ زمنيٌّ بمفاتيحِ حركة**: لكلِّ خاصّيّةٍ مسارُها، وتخفيفٌ قابلٌ للتحرير، وحركاتٌ جاهزةٌ للدخول والخروج.
- **تصدير**: MP4 وGIF وPNG، عبر ffmpeg مُحمَّلًا جانبيًّا.
- **خادم MCP مدمج**: يَفتح اللوحةَ لوكيلٍ ذكيٍّ يبني التصميمَ بالأوامر.
- **يعمل دون إنترنت**: الخطوطُ ومحرّكاتُ التشغيل محزومةٌ محليًّا.

## التشغيل

يحتاج [Node.js](https://nodejs.org) و[Rust](https://rustup.rs).

```bash
git clone https://github.com/<OWNER>/mazij.git
cd mazij/app
npm install
./scripts/setup-ffmpeg-sidecar.sh      # لازمٌ للتصدير إلى MP4 وGIF
npm run tauri dev
```

وللبناء النهائي:

```bash
npm run tauri build
```

التفاصيلُ كلُّها، ومنها الفخاخُ المعروفةُ في البناء، في [`app/README.md`](app/README.md).

## البنية

| المسار | ما فيه |
|---|---|
| `app/src` | الواجهة: React وTypeScript |
| `app/src/lib` | المحرّك: التشكيل، والحركة، والتصدير، وأدوات MCP |
| `app/src/state` | نموذجُ المستند وحالتُه |
| `app/src-tauri` | الطرفُ الأصيل: Rust وخادم MCP |
| `app/qa` | حِزَمُ الاختبار وحلقةُ المحاكاة |
| `app/docs` | قراراتُ التصميم وتحليلُ الأدوات المنافسة |

## الاختبارات

```bash
cd app
npm run dev          # في طرفيّةٍ أخرى، المنفذ 1420
node scripts/run-qa.mjs
```

## حلقةُ المحاكاة

تحت `app/qa/replication` حلقةٌ تقيس التطبيقَ بأهدافٍ حقيقيّة: يُبنى التصميمُ بأوامرِ البرنامج نفسِه، ثمّ يُقارَن بمرجعٍ ببنودٍ مكتوبة. **ومراجعُ الطرفِ الثالث ليست في المستودع**: ما يُنشَر هو الحكمُ وحدَه (`spec.json`) وشرحُ ما ينقص، وكلُّ هدفٍ يعمل بمحتوًى محايدٍ لمن استنسخ المستودع.

## المساهمة

المشكلاتُ والطلباتُ مرحَّبٌ بها. والشفرةُ تتبع ما في `app/docs`: كلُّ قرارِ تصميمٍ مكتوبٌ بسببه، فمن أراد تغييرَه فليَنقض السببَ أوّلًا.

## الرخصة

[MIT](LICENSE). والخطوطُ المضمَّنةُ تحت SIL OFL 1.1، تفصيلُها في [`app/src/assets/fonts/OFL-NOTICE.md`](app/src/assets/fonts/OFL-NOTICE.md).

---

<div dir="ltr">

## English

**Mazij Studio** is an open-source desktop design and motion editor, built Arabic-first.

Most design tools treat Arabic as an afterthought: glyph shaping breaks, text direction flips, kashida does not exist, and the whole UI runs left to right. Mazij starts from the other end. Layout is RTL natively, shaping goes through HarfBuzz, and the interface is Arabic.

**Features** — vector canvas (shapes, text, images, video, bezier pen, layers); correct Arabic text (HarfBuzz shaping, bidi-js, controlled kashida); keyframe timeline with per-property tracks and editable easing; export to MP4, GIF and PNG via a bundled ffmpeg sidecar; a built-in MCP server that lets an AI agent drive the canvas; fully offline.

**Stack** — Tauri 2, React 19, TypeScript, Rust.

> **Platform today: macOS only.** Tauri itself is cross-platform, but the ffmpeg sidecar
> script stages macOS binaries only, and Live Photo export is macOS-specific. Porting
> starts at `app/scripts/setup-ffmpeg-sidecar.sh`.

**Quick start**

```bash
git clone https://github.com/<OWNER>/mazij.git
cd mazij/app
npm install
./scripts/setup-ffmpeg-sidecar.sh
npm run tauri dev
```

See [`app/README.md`](app/README.md) for the full setup, test commands, and known build pitfalls.

**Replication harness** — `app/qa/replication` measures the app against real design targets: a design is rebuilt through the app's own commands, then scored against a written rubric. Third-party reference material is deliberately not committed; only the rubric and a neutral fallback ship, so every target runs from a fresh clone.

**License** — [MIT](LICENSE). Bundled fonts are under SIL OFL 1.1.

</div>
