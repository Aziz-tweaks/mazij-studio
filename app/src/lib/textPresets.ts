import type { HAlign, Weight } from '../state/types';

/** بطاقات لوح «نصوص». ثلاثٌ أساسيّة كما في الأداة الشائعة (عنوان، فرعي، نص)، وبعدها أنماطٌ
 * عربيّة جاهزة لأكثر ما يُكتب على بوستات المحلات. المقاس بوحدة المرجع (`fontSize`
 * على لوحٍ عرضه ١٠٨٠)، والصندوق كسورٌ من اللوح. */
export type TextPreset = 'heading' | 'subheading' | 'body' | 'offer' | 'soon' | 'opening' | 'new';

export interface TextPresetDef {
  id: TextPreset;
  text: string;
  fontFamily: string;
  fontSize: number;
  weight: Weight;
  halign: HAlign;
  tracking?: number;
  w: number;
  h: number;
}

export const TEXT_PRESETS: Record<TextPreset, TextPresetDef> = {
  heading: { id: 'heading', text: 'عنوانك هنا', fontFamily: 'Alexandria', fontSize: 96, weight: 'bold', halign: 'center', w: 0.8, h: 0.14 },
  subheading: { id: 'subheading', text: 'عنوان فرعي', fontFamily: 'Alexandria', fontSize: 56, weight: 'medium', halign: 'center', w: 0.7, h: 0.09 },
  body: { id: 'body', text: 'اكتب نصّك هنا', fontFamily: 'Readex Pro', fontSize: 36, weight: 'regular', halign: 'center', w: 0.6, h: 0.07 },
  offer: { id: 'offer', text: 'عرض اليوم', fontFamily: 'Alexandria', fontSize: 120, weight: 'bold', halign: 'center', w: 0.8, h: 0.16 },
  soon: { id: 'soon', text: 'قريبًا', fontFamily: 'Alexandria', fontSize: 140, weight: 'bold', halign: 'center', tracking: 4, w: 0.7, h: 0.18 },
  opening: { id: 'opening', text: 'افتتاح', fontFamily: 'Vazirmatn', fontSize: 120, weight: 'bold', halign: 'center', w: 0.7, h: 0.16 },
  new: { id: 'new', text: 'كل شي جديد', fontFamily: 'Alexandria', fontSize: 72, weight: 'medium', halign: 'center', w: 0.8, h: 0.11 },
};

export const BASIC_TEXT_PRESETS: TextPreset[] = ['heading', 'subheading', 'body'];
export const STYLED_TEXT_PRESETS: TextPreset[] = ['offer', 'soon', 'opening', 'new'];
