/** تفضيلاتُ الواجهة لكلّ جهاز — لا بيانات مستند، فلا تدخل الحفظ التلقائيّ ولا التراجع. */
const KEY = 'mazij.ui.v1';

export interface UiPrefs {
  /** الوضع الاحترافي — انظر `StudioState.pro`. */
  pro?: boolean;
}

export function loadUiPrefs(): UiPrefs {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    return raw ? (JSON.parse(raw) as UiPrefs) : {};
  } catch {
    return {};
  }
}

export function saveUiPrefs(p: UiPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadUiPrefs(), ...p }));
  } catch {
    // تفضيلٌ لكلّ جهاز: فقدُه يُرجع البسيط الافتراضيّ فقط.
  }
}
