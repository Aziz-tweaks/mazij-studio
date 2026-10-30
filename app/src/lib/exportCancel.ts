// إلغاءُ تصديرٍ جارٍ (٣٠ أكتوبر ٢٠٢٦). كان الحوار يُخفي زرَّيه أثناء التصدير، فتصديرُ
// 4K بـH.265 — دقائقُ — لا يُوقَف إلا بإغلاق التطبيق. هنا علَمٌ واحدٌ ومرجعٌ لعمليّة
// ffmpeg الجارية: الإلغاءُ يرفع العلم ويَقتل العمليّة، وكلُّ حلقةٍ تَسأل العلمَ بين
// خطوةٍ وأخرى فتَخرج بخطأٍ معروفٍ لا بملفٍّ نصفِ مكتوب.

export class ExportCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'ExportCancelled';
  }
}

type Killable = { kill: () => Promise<void> };

let cancelled = false;
let running: Killable | null = null;

export function beginExport(): void {
  cancelled = false;
  running = null;
}

export function isExportCancelled(): boolean {
  return cancelled;
}

export function throwIfCancelled(): void {
  if (cancelled) throw new ExportCancelled();
}

export function setRunningProcess(child: Killable | null): void {
  running = child;
  if (cancelled && child) void child.kill().catch(() => {});
}

export function cancelExport(): void {
  cancelled = true;
  if (running) void running.kill().catch(() => {});
}
