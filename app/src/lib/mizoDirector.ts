import text from '../data/mizo-director.md?raw';

/** **مِزو بطريقة المخرج** (٦ نوفمبر ٢٠٢٦) — تعليماتٌ تُحقَن في وكيل المستخدم: في مِزو داخل
 * التطبيق (`agentSystemPrompt`، بمفتاحه أو بـClaude Code/Codex على جهازه)، وفي «الربط مع
 * Claude» عبر MCP (`instructions` في `src-tauri/src/link.rs`، من الملف نفسه بـ`include_str!`).
 * أوّل ما يسجّل المستخدم دخوله بوكيله يلقى الوكيلُ عنده طريقةَ العمل كاملةً، بلا إعداد.
 * المصدرُ واحد: `src/data/mizo-director.md`. */
export const MIZO_DIRECTOR = `\n${text}`;
