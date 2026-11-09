# مزيج / Mazij Studio

تطبيق سطح مكتب للتصميم (Tauri + React + TypeScript)، عربي أولاً وRTL، للمقاطع القصيرة والصور.

## الإعداد بعد أي استنساخ جديد

```bash
npm install
PATH="$HOME/.cargo/bin:$PATH" ./scripts/setup-ffmpeg-sidecar.sh      # تصدير MP4/GIF وقراءة الفيديو المرجعي
PATH="$HOME/.cargo/bin:$PATH" ./scripts/setup-livephoto-tool.sh      # تصدير الصورة الحية (macOS فقط، يحتاج Xcode CLT)
PATH="$HOME/.cargo/bin:$PATH" cargo build --bin mcp_server --manifest-path src-tauri/Cargo.toml  # اختبارات خادم MCP
```

ملاحظة: `cargo`/`rustc` غير موجودين بالـ`PATH` الافتراضي في بعض البيئات — بدونهم `setup-livephoto-tool.sh` يفشل بصمت (يعتمد على `rustc` لتحديد معمارية الجهاز).

## التطوير

```bash
npm run dev                                    # خادم Vite، المنفذ الافتراضي 1420
PATH="$HOME/.cargo/bin:$PATH" npm run tauri dev # نافذة Tauri حقيقية
```

## الاختبارات

```bash
for f in qa/*.mjs; do node "$f"; done
```

تتطلب خادم Vite شغّالًا على المنفذ 1420 (أو مرّر المنفذ عبر متغيّر البيئة لو الملف يدعمه).

⚠️ `qa/mcp-server.spec.mjs` يشغّل ثنائي **debug** من `src-tauri/target/debug/mcp_server`، لا بناء release. لو بنيتَ release فقط فالثنائي القديم يبقى مكانه ويُشغَّل بصمت، والحزمة تنهار برسالة مضلّلة عن «لا نافذة متصلة بالجسر» بدل أن تقول إن الثنائي قديم. بعد أي تعديل على `src-tauri/src/mcp.rs` أعد بناءه:

```bash
PATH="$HOME/.cargo/bin:$PATH" cargo build --bin mcp_server --manifest-path src-tauri/Cargo.toml
```

⚠️ `cargo build --release` وحده **لا** يُنتج تطبيقًا صالحًا للاستخدام: `tauri-build` يبقى يُصدر `cargo:rustc-cfg=dev`، فالثنائي الناتج يحمّل `devUrl` ويعرض ما يصادف وجوده على المنفذ 1420. الحزمة الحقيقية تأتي من `npm run tauri build` وحده.

بعد `npm install` جديد امسح ذاكرة Vite المؤقتة إذا ظهرت أخطاء 504 غامضة:

```bash
rm -rf node_modules/.vite
```

## البناء النهائي

```bash
PATH="$HOME/.cargo/bin:$PATH" npm run tauri build
```

## التوثيق

- `docs/CONTROLS.md` — جرد كل عنصر تحكم بالتطبيق وحالته
- `docs/ROADMAP-PROGRESS.md` — تتبّع تنفيذ خارطة الطريق (٢٤ بندًا)
- قياسٌ خارجيٌّ موثَّق — تحليل تقني لآليات a common design tool/a common video editor/a vector editor ومكتبات مفتوحة المصدر مُقيَّمة

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
