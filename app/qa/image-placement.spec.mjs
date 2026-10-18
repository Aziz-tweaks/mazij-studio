#!/usr/bin/env node
// أين تهبط الصورة المستوردة؟ — عند نقرة المصمّم، لا في وسط اللوحة.
//
// من أين جاء هذا الملف: حلقة المحاكاة على الهدف الثالث
// `qa/replication/targets/t03-store-card` — الهدف المنشور الذي يحمل ثلاث
// صورٍ مستوردة: أيقونة التطبيق وشارتَي المتجرين، كلُّ واحدةٍ في موضعها.
//
// **العطل.** أداة «صورة» تعمل بإيماءتين: اختيارُ الأداة، ثم **نقرةٌ على اللوحة**
// عند الموضع المقصود — وهي الإيماءة نفسها التي تضع نصًّا جديدًا عند النقرة
// بالضبط (`state.tool === 'text'` في `Stage.tsx` يقرأ `p.x`/`p.y` ويبني الصندوق
// حولهما). أمّا فرع `state.tool === 'image'` فكان ينادي `insertImageTool()` بلا
// وسائط، و`insertLoadedImage` بلا `dropPointPx` تضع العنصر في **وسط اللوحة**
// دائمًا. فالنقطة التي أمسكها `Stage` فعلًا — وهي في المتغيّر `p` على بُعد سطرين —
// كانت تُهمل.
//
// وأثرُه على مصمّمٍ حقيقيّ ليس تجميليًّا: بوستٌ فيه ثلاث صور يُنتج **ثلاث صورٍ
// مكدّسةٍ فوق بعضها في المنتصف**، ولا سبيل إلى تفريقها إلا بكتابة أربعة أرقامٍ
// لكلّ واحدة في لوح التحويل. والقدرة موجودة أصلًا ومستعملة: السحبُ والإفلات
// (`insertImageFromFile(file, dropPointPx)`) يحترم نقطة الإفلات منذ البداية —
// فالنقص كان في التمرير لا في النموذج.
//
// والقاعدة نفسها تسري على «لوتي» و«فيديو»: ثلاثتها فروعٌ متجاورة في المعالج
// نفسه، وثلاثتها كانت تُهمل `p`. فأُصلحت معًا كي لا يبقى في الشريط زرٌّ يعِد
// بالوضع عند النقرة ولا يفي.
//
// Run: node qa/image-placement.spec.mjs   (dev server must be running on :1420)
import { chromium } from '/private/tmp/iphone_mockup_inspect/node_modules/playwright/index.mjs';
import { bootBlank } from './helpers/boot.mjs';

const BASE_URL = 'http://localhost:1420';
let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    pass++;
    console.log('  ok  ', msg);
  } else {
    fail++;
    failures.push(msg);
    console.error('  FAIL:', msg);
  }
}

// مربّعٌ أحمر ٢×٢ — المحتوى لا يهمّ هنا، الموضع هو المقيس.
const RED_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DAwMDAwAAFAAwJAP+Vx3dXAAAAAElFTkSuQmCC';
const DOC = { w: 1080, h: 1350 };

/** صندوقُ عنصرٍ بإحداثيّات المستند، مقيسًا من البكسل المرسوم على الشاشة. */
async function docBox(page, elId) {
  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  const eb = await page.locator(`[data-el-id="${elId}"]`).boundingBox();
  return {
    x: ((eb.x - ab.x) / ab.width) * DOC.w,
    y: ((eb.y - ab.y) / ab.height) * DOC.h,
    w: (eb.width / ab.width) * DOC.w,
    h: (eb.height / ab.height) * DOC.h,
  };
}

const lastElId = (page) =>
  page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-el-id]')];
    return all.length ? all[all.length - 1].getAttribute('data-el-id') : null;
  });

/** نقرةٌ بأداة الصورة عند نسبةٍ من اللوحة، ثم اختيارُ ملفٍّ في المنتقي الحقيقي. */
async function insertImageAt(page, fx, fy, name) {
  await page.locator('[data-tool="image"]').click();
  await page.waitForTimeout(200);
  const ab = await page.locator('[data-testid="artboard"]').boundingBox();
  const chooser = page.waitForEvent('filechooser', { timeout: 15000 });
  await page.mouse.click(ab.x + ab.width * fx, ab.y + ab.height * fy);
  (await chooser).setFiles({ name, mimeType: 'image/png', buffer: Buffer.from(RED_PNG_B64, 'base64') });
  await page.waitForTimeout(600);
  return lastElId(page);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await bootBlank(page, BASE_URL, 'ig-portrait');
  await page.locator('button', { hasText: /^احترافي$/ }).first().click();
  await page.waitForTimeout(260);

  console.log('\n١. النقرة تضع الصورة عندها');
  // ربعُ العرض وسبعون بالمئة من الارتفاع — موضعٌ لا يقع صدفةً في المنتصف في أيّ
  // من المحورين، فلا يمكن لعطل «ضَعْها في الوسط» أن يجتازه.
  const a = await insertImageAt(page, 0.25, 0.7, 'a.png');
  const boxA = await docBox(page, a);
  const cxA = boxA.x + boxA.w / 2;
  const cyA = boxA.y + boxA.h / 2;
  assert(Math.abs(cxA - DOC.w * 0.25) <= 12, `أفقيًّا: مركز الصورة عند نقرة المصمّم (${cxA.toFixed(0)} ≈ ${(DOC.w * 0.25).toFixed(0)})`);
  assert(Math.abs(cyA - DOC.h * 0.7) <= 12, `رأسيًّا: مركز الصورة عند نقرة المصمّم (${cyA.toFixed(0)} ≈ ${(DOC.h * 0.7).toFixed(0)})`);
  assert(Math.abs(cxA - DOC.w / 2) > 60, 'وليست في وسط اللوحة — النقرة ليست زينة');

  console.log('\n٢. صورةٌ ثانية لا تُكدَّس فوق الأولى');
  const b = await insertImageAt(page, 0.75, 0.7, 'b.png');
  const boxB = await docBox(page, b);
  const cxB = boxB.x + boxB.w / 2;
  assert(b !== a, 'الاستيراد الثاني أضاف عنصرًا جديدًا لا استبدل الأول');
  assert(Math.abs(cxB - DOC.w * 0.75) <= 12, `الصورة الثانية عند نقرتها هي (${cxB.toFixed(0)} ≈ ${(DOC.w * 0.75).toFixed(0)})`);
  assert(Math.abs(cxB - cxA) > 300, 'والمسافة بينهما هي المسافة بين النقرتين — لا كومةٌ في المنتصف');

  console.log('\n٢ ب. واللوحة ترسمها حيث يقول النموذج');
  // عطلٌ ثانٍ كشفه الهدفُ نفسه، ومستقلٌّ عن الأول: إطار الصورة كان يكتب
  // `position: 'relative'` فوق `position: 'absolute'` الآتية من `baseStyle` —
  // وحدَه بين كل أنواع العناصر. فالصورة الأولى تُرسَم صحيحة (موضعها الساكن هو
  // زاوية اللوحة)، والثانية تنزل بارتفاعٍ كامل، والثالثة بارتفاعين. والتصدير
  // يرسم من النموذج فيخرج سليمًا — فاللوحة وحدها هي التي تكذب على المصمّم.
  //
  // ولهذا يُقاس هنا **البكسل المرسوم** (`boundingBox`) مقابل **النموذج**
  // (`style.top`)، لا أحدهما وحده: كلاهما كان يُقرأ صحيحًا في محلّه.
  const modelTop = await page.locator(`[data-el-id="${b}"]`).evaluate((el) => el.style.top);
  const paintedTop = boxB.y;
  const modelTopPx = (parseFloat(modelTop) / 100) * DOC.h;
  assert(
    Math.abs(paintedTop - modelTopPx) <= 6,
    `المرسوم يطابق النموذج (${paintedTop.toFixed(0)} ≈ ${modelTopPx.toFixed(0)} من style.top=${modelTop})`,
  );
  const posB = await page.locator(`[data-el-id="${b}"]`).evaluate((el) => getComputedStyle(el).position);
  assert(posB === 'absolute', `إطار الصورة مُطلَق الموضع لا تابعٌ لمجرى المستند (${posB})`);

  console.log('\n٣. نقرةٌ عند الحافّة تُبقي الصورة داخل اللوحة');
  const c = await insertImageAt(page, 0.02, 0.06, 'c.png');
  const boxC = await docBox(page, c);
  assert(boxC.x >= -1 && boxC.y >= -1, `الحافّة اليسرى/العليا داخل اللوحة (${boxC.x.toFixed(0)},${boxC.y.toFixed(0)})`);
  assert(
    boxC.x + boxC.w <= DOC.w + 1 && boxC.y + boxC.h <= DOC.h + 1,
    `والحافّة اليمنى/السفلى كذلك — القصُّ إلى حدود الصفحة قائم كما كان (${(boxC.x + boxC.w).toFixed(0)},${(boxC.y + boxC.h).toFixed(0)})`,
  );

  console.log('\n٤. السحب والإفلات لم يتغيّر');
  // الإفلات كان يحترم نقطته منذ البداية؛ هذا حارسُ انحدارٍ لا أكثر.
  await page.evaluate(async (b64) => {
    const res = await fetch(`data:image/png;base64,${b64}`);
    const blob = await res.blob();
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'drop.png', { type: 'image/png' }));
    const target = document.querySelector('[data-testid="artboard"]');
    const r = target.getBoundingClientRect();
    const clientX = r.left + r.width * 0.3;
    const clientY = r.top + r.height * 0.25;
    for (const kind of ['dragover', 'drop']) {
      target.dispatchEvent(new DragEvent(kind, { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }));
    }
  }, RED_PNG_B64);
  await page.waitForTimeout(400);
  const d = await lastElId(page);
  const boxD = await docBox(page, d);
  assert(Math.abs(boxD.x + boxD.w / 2 - DOC.w * 0.3) <= 12, 'الإفلات ما زال يضع الصورة عند نقطة الإفلات');

  console.log('\n٥. لا أخطاء زمن تشغيل');
  assert(pageErrors.length === 0, `لا أخطاء في الجلسة (${pageErrors.join(' | ') || 'لا شيء'})`);

  await browser.close();
  console.log('\n' + '='.repeat(60));
  console.log(`${pass} passed, ${fail} failed.`);
  if (fail) {
    for (const f of failures) console.error(' -', f);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
