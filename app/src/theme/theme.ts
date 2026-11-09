export interface ThemeVars {
  '--bg': string; '--surface': string; '--surface2': string; '--seg': string; '--line': string; '--lineStrong': string;
  '--text': string; '--muted': string; '--faint': string;
  '--accent': string; '--accentText': string; '--onAccent': string; '--accentSoft': string;
  '--motion': string; '--motionSoft': string; '--vector': string;
  '--canvas': string; '--canvasDot': string; '--float': string;
  '--danger': string;
  '--r': string; '--rs': string; '--gap': string; '--pad': string; '--shadow': string; '--overlay': string;
  '--font': string;
}

export interface Theme {
  vars: ThemeVars;
  scheme: 'light' | 'dark';
  floating: boolean;
  accent: string;
}

/** **الليل — الثيم الافتراضي منذ ٢٤ أكتوبر ٢٠٢٦.**
 *
 * المالك اعتمد تصوّر «لوحة واحدة، ثلاثة أعماق» (artifact «مزيج — تصوّر
 * التجربة») وهذا لونه: أرضيّةٌ داكنة تُبرز التصميمَ نفسه، كما في أداة متّجهات
 * ومحرّر فيديو شائع — الواجهةُ تتراجع واللوحةُ تتقدّم.
 *
 * **لماذا لونان للبنفسجي.** `--accent` يُملأ به الزرّ الأساسي وتحته نصٌّ أبيض
 * (تباين ٤٫٦:١ — يجتاز AA)، لكنّه نصًّا على سطحٍ داكن يَسقط إلى ٣٫٩:١. فالنصُّ
 * المُلوَّن والأيقونات النشطة تأخذ `--accentText` الأفتح (٨:١). واحدٌ للتعبئة،
 * واحدٌ للكتابة — لا لونٌ واحدٌ يُرضي الاثنين.
 *
 * **ألوانُ الأعماق.** `--motion` (مرجاني) لكلّ ما يخصّ الزمن والحركة، و`--vector`
 * (فيروزي) لكلّ ما يخصّ الدقّة والمسارات. المستخدم يعرف أين هو من اللون قبل
 * أن يقرأ.
 *
 * و`--seg` خلفيّةُ القطعة المختارة في أيّ مفتاحٍ مُجزّأ: كانت `--surface`، وهو
 * في الثيم الفاتح أفتح من المسار تحته (أبيض على رمادي)، لكنه في الداكن أغمق
 * منه فيبدو المختارُ مطفأً. فصار له رمزٌ مستقلّ. */
export const NIGHT_THEME: Theme = {
  vars: {
    '--bg': '#0F1013',
    '--surface': '#17181C',
    '--surface2': '#1E2025',
    '--seg': '#2E3138',
    '--line': 'rgba(255,255,255,.08)',
    '--lineStrong': 'rgba(255,255,255,.14)',
    '--text': '#EDEEF0',
    '--muted': '#A0A3AB',
    '--faint': '#6B6F78',
    '--accent': '#6D5BFF',
    '--accentText': '#B0A4FF',
    '--onAccent': '#FFFFFF',
    '--accentSoft': 'rgba(109,91,255,.18)',
    '--motion': '#FF8A6B',
    '--motionSoft': 'rgba(255,122,89,.14)',
    '--vector': '#3DD6C6',
    '--canvas': '#0B0C0E',
    '--canvasDot': 'rgba(255,255,255,.055)',
    '--float': 'rgba(30,32,37,.94)',
    '--danger': '#FF6B6B',
    '--r': '14px',
    '--rs': '9px',
    '--gap': '0px',
    '--pad': '0',
    '--shadow': '0 12px 32px rgba(0,0,0,.45)',
    '--overlay': 'rgba(0,0,0,.6)',
    '--font': "'Readex Pro', system-ui, sans-serif",
  },
  scheme: 'dark',
  floating: false,
  accent: '#6D5BFF',
};

// "island" was the Phase 1 light direction.
// Kept as a complete token set so a light switch stays a one-line change, but
// it is no longer what the app ships with.
export const ISLAND_THEME: Theme = {
  vars: {
    '--bg': '#E9ECF1',
    '--surface': '#FFFFFF',
    '--surface2': '#F1F3F7',
    '--seg': '#FFFFFF',
    '--line': 'rgba(16,24,40,.09)',
    '--lineStrong': 'rgba(16,24,40,.16)',
    '--text': '#0F172A',
    '--muted': '#64748B',
    '--faint': '#94A3B8',
    '--accent': '#0EA5E9',
    '--accentText': '#0369A1',
    '--onAccent': '#06202F',
    '--accentSoft': 'rgba(14,165,233,.14)',
    '--motion': '#E8743B',
    '--motionSoft': 'rgba(232,116,59,.12)',
    '--vector': '#0F9488',
    '--canvas': '#DDE2EA',
    '--canvasDot': 'rgba(15,23,42,.06)',
    '--float': 'rgba(255,255,255,.96)',
    '--danger': '#E5484D',
    '--r': '16px',
    '--rs': '10px',
    '--gap': '10px',
    '--pad': '0 10px 10px',
    '--shadow': '0 10px 30px rgba(15,23,42,.07)',
    '--overlay': 'rgba(15,23,42,.38)',
    '--font': "'Readex Pro', system-ui, sans-serif",
  },
  scheme: 'light',
  floating: true,
  accent: '#0EA5E9',
};

/** The theme the app ships with. One place to switch. */
export const THEME = NIGHT_THEME;
