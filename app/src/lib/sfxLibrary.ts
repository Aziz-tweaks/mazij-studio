import data from '../data/sfxLibrary.json';

/** **مكتبةُ المؤثّرات الصوتيّة** (٦ نوفمبر ٢٠٢٦) — أصواتٌ قصيرة مرفقةٌ مع مزيج في
 * `public/sfx/<id>.m4a`: هبّات وبوب ونقرات وصاعدات وتروس وغيرها.
 *
 * كلُّ ملفٍّ مقصوصُ الصمت من أوّله (فيقع صوتُه على حدثه) ومحدودُ الطول بتلاشٍ في ذيله،
 * ومُرمَّزٌ AAC فلا يثقل التطبيق. والاسمُ العربيّ هو ما يراه المصمّم؛ والإنجليزيّ للوكيل. */

export type SfxCat = 'whoosh' | 'pop' | 'click' | 'riser' | 'gear' | 'shutter' | 'money' | 'data';

export interface SfxItem {
  id: string;
  cat: SfxCat;
  nameAr: string;
  nameEn: string;
  /** المدّةُ بالثواني بعد القصّ. */
  dur: number;
}

export const SFX_ITEMS: SfxItem[] = data as SfxItem[];

export const SFX_CATS: { id: SfxCat; ar: string; en: string }[] = [
  { id: 'whoosh', ar: 'هبّات', en: 'Whooshes' },
  { id: 'pop', ar: 'بوب', en: 'Pops' },
  { id: 'click', ar: 'نقرات', en: 'Clicks' },
  { id: 'riser', ar: 'صاعدات', en: 'Risers' },
  { id: 'shutter', ar: 'كاميرا', en: 'Shutters' },
  { id: 'gear', ar: 'تروس', en: 'Gears' },
  { id: 'money', ar: 'فلوس', en: 'Money' },
  { id: 'data', ar: 'بيانات', en: 'Data' },
];

export const sfxUrl = (id: string) => `/sfx/${id}.m4a`;

export function sfxById(id: string): SfxItem | undefined {
  return SFX_ITEMS.find((s) => s.id === id);
}

export async function sfxBytes(id: string): Promise<Uint8Array> {
  const res = await fetch(sfxUrl(id));
  if (!res.ok) throw new Error(`sfx ${id} not found`);
  return new Uint8Array(await res.arrayBuffer());
}

/** ملفٌّ جاهزٌ لـ`insertAudioFromFile` — اسمُه اسمُ الطبقة. */
export async function sfxFile(item: SfxItem, lang: 'ar' | 'en'): Promise<File> {
  const bytes = await sfxBytes(item.id);
  return new File([bytes as Uint8Array<ArrayBuffer>], `${lang === 'ar' ? item.nameAr : item.nameEn}.m4a`, { type: 'audio/mp4' });
}

let previewAudio: HTMLAudioElement | null = null;
/** سماعٌ سريع قبل الإضافة؛ نقرةٌ ثانية توقف السابق. */
export function previewSfx(id: string): void {
  try {
    previewAudio?.pause();
    previewAudio = new Audio(sfxUrl(id));
    previewAudio.volume = 0.8;
    void previewAudio.play();
  } catch {
    /* المعاينةُ رفاهيّة */
  }
}
