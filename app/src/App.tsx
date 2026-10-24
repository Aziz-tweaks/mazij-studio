import type { CSSProperties } from 'react';
import { StudioProvider, useStudio } from './state/StudioContext';
import { TopBar } from './components/TopBar';
import { AddRail } from './components/AddRail';
import { ContentPanel } from './components/ContentPanel';
import { Inspector } from './components/Inspector';
import { ShortcutsSheet } from './components/ShortcutsSheet';
import { Stage } from './components/Stage';
import { Timeline } from './components/Timeline';
import { CommandPalette } from './components/CommandPalette';
import { ExportDialog } from './components/ExportDialog';
import { TemplatesDialog } from './components/TemplatesDialog';
import { ArtboardsDialog } from './components/ArtboardsDialog';
import { LocalModelsDialog } from './components/LocalModelsDialog';
import { ReferenceVideoDialog } from './components/ReferenceVideoDialog';
import { McpServerDialog } from './components/McpServerDialog';
import { CommandInterpreterDialog } from './components/CommandInterpreterDialog';
import { AiGenerateDialog } from './components/AiGenerateDialog';
import { HomeScreen } from './components/HomeScreen';
import { THEME } from './theme/theme';
import './App.css';

function StudioShell() {
  const { state, dir } = useStudio();

  const rootStyle: CSSProperties = {
    ...(THEME.vars as CSSProperties),
    // عناصر النظام (القوائم المنسدلة، شرائط التمرير، منتقي اللون) تتبع الثيم.
    colorScheme: THEME.scheme,
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100vh',
    // **أرضيّةُ العرض صفةُ المحرِّر وحده، لا صفةُ القشرة.**
    //
    // الثمانمئةٌ وثمانون أرضيّةٌ للمحرِّر فعلًا: شريطُ الأدوات ولوحُ الخصائص
    // والمسرحُ والخطُّ الزمنيّ أربعةُ أعمدةٍ لا تَنضغط إلى ما لا نهاية. لكنها
    // كانت مكتوبةً هنا — على الجذر — فورثَتها **شاشةُ البداية** وهي عمودٌ واحدٌ
    // مركزيّ (`maxWidth: 860, margin: 0 auto`) يُعيد انسيابَه بلا قيد.
    //
    // ومع `overflow: 'hidden'` أسفله صار الفائضُ **مقصوصًا لا مُمَرَّرًا**: تحت
    // ٨٨٠ بكسلًا يبقى الجذرُ ٨٨٠ والمنفذُ أضيق، ولا شريطَ تمرير أفقيٍّ يَصِل إلى
    // المقصوص (`documentElement.scrollWidth === clientWidth`). قيسَ عند ٧٦٨
    // بكسلًا: الجذرُ من ‎−112‎ إلى ٧٦٨، فيَضيع ١١٢ بكسلًا من الحافّة المنطقيّة —
    // أبعادُ المقاسات وزرُّ «ابدأ بهذا المقاس» من بينها. وبالإنجليزيّة (LTR) عند
    // ٧٦٠ يُقصّ الطرفان معًا (‎−84‎ … ٧٩٦).
    //
    // فالقيدُ يَنزل إلى صاحبه: المحرِّرُ يَحمله كما كان بالضبط — فسلوكُه لم
    // يتغيّر بتّةً — وشاشةُ البداية تُترَك تَنساب.
    ...(state.screen === 'editor' ? { minWidth: 880 } : null),
    background: 'var(--bg)',
    color: 'var(--text)',
    fontFamily: 'var(--font)',
    fontSize: 13,
    lineHeight: 1.4,
    overflow: 'hidden',
  };

  return (
    <div dir={dir} lang={state.lang} style={rootStyle}>
      <TopBar />

      {state.screen === 'editor' && (
        // **لوحة واحدة، ثلاثة أعماق** — التخطيط المعتمد في ٢٤ أكتوبر ٢٠٢٦: شريط
        // الإضافة ولوحه على البداية (الأداة الشائعة)، اللوحة في الوسط بأكبر مساحة وحبّة
        // الأدوات فوقها (أداة المتّجهات)، المفتش على النهاية، والخطّ الزمنيّ بعرض
        // الشاشة تحت كلّ شيء — للمستند المُوقَّت وحده (محرّر الفيديو الشائع).
        <div data-screen-label="Editor" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <AddRail />
            <ContentPanel />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <Stage />
            </div>
            <Inspector />
          </div>
          {/* **السطحُ الأوّل من الثلاثة التي يتفرّع عليها `medium`، وهو موضعُ
              التفرّع الوحيد: `Timeline` نفسُه لا يَقرأ `medium` ولا يُقارنه.**

              بوسترٌ مربّع كان يتسلّم خطًّا زمنيًّا كاملًا — مسطرةً ومؤشّرًا
              ومقاطعَ وشريطَ تشغيل — يأكل ثلثَ الشاشة السفليّ لصورةٍ ساكنة،
              لأنّ `tlOpen` تبدأ `true` دائمًا ولا أحدَ يقرأ طبيعةَ المقاس
              (البند ٦ في `docs/UX-AUDIT-2026-10-18.md`).

              **وقائمةُ الطبقات تعيش داخل هذا المكوّن ولا بيتَ لها غيره** — العين
              والقفل وإعادةُ التسمية وإعادةُ الترتيب والتحديدُ بالاسم كلُّها هنا.
              فللمستند الساكن يُركَّب المكوّن نفسه رفًّا تحت المفتش
              (`<Timeline timed={false} docked />` في `Inspector.tsx`) بلا أيّ سطحٍ
              زمنيّ، وللمُوقَّت يُركَّب هنا بعرض الشاشة. نسخةٌ واحدة في كلّ لحظة،
              فلا معرّفَ اختبارٍ يتكرّر.

              وهو قابلٌ للتراجع في اللحظة: بدِّل المقاسَ إلى وجهةٍ مُوقَّتة من
              `ArtboardSizeMenu` فيَظهر الخطُّ بلا إعادةِ تحميل — انظر
              `DocSnapshot.medium`. */}
          {state.medium === 'timed' && <Timeline timed />}
        </div>
      )}

      {state.screen === 'home' && <HomeScreen />}

      <CommandPalette />
      <ExportDialog />
      <TemplatesDialog />
      <ArtboardsDialog />
      <LocalModelsDialog />
      <ReferenceVideoDialog />
      <McpServerDialog />
      <CommandInterpreterDialog />
      <AiGenerateDialog />
      <ShortcutsSheet />
    </div>
  );
}

export default function App() {
  return (
    <StudioProvider>
      <StudioShell />
    </StudioProvider>
  );
}
