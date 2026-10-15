/* ============================================================================
 *  عامل الخدمة — ما يجعل التطبيق قابلًا للتثبيت ويفتح بعد انقطاع مؤقّت.
 *
 *  القاعدة الحاكمة: لا يلمس أي طلب إلى Supabase إطلاقًا.
 *  البيانات المحاسبية لا تُخزَّن مؤقَّتًا ولا تُعاد من ذاكرة: رصيدٌ قديم يُعرض
 *  على أنه الحالي خطأٌ أخطر من رسالة «لا اتصال». القرار يُتخذ مرّتين أدناه:
 *  بالمنشأ (كل ما ليس من هذا الموقع يُترك للمتصفّح)، وباسم المضيف صراحةً.
 *
 *  ما يُخزَّن: صفحات HTML (شبكة أولًا، والذاكرة احتياطٌ عند الانقطاع)، وأصول
 *  /_next/static (أسماؤها تحمل بصمة محتواها، فلا تتعارض نسختان أبدًا)،
 *  والأيقونات وملف الـmanifest.
 *
 *  b8e9347f0a2b يستبدله scripts/build-pages.mjs ببصمة البناء، فلكل بناءٍ
 *  ذاكرةٌ باسمٍ جديد وتُمسح القديمة. في بناء محلّي عادي يبقى النص كما هو —
 *  وهو مقبول لأن أصول _next مبصومة وHTML يُجلب من الشبكة أولًا.
 * ========================================================================== */

const BUILD_ID = "b8e9347f0a2b";
const CACHE = `garreb-accounting-${BUILD_ID}`;

// هيكل التطبيق: الصفحات المعروفة مسبقًا. المسارات نسبية إلى نطاق العامل،
// فتعمل من الجذر محليًّا ومن /garreb-follow/ على GitHub Pages بلا تغيير.
const SHELL = [
  "./",
  "./login/",
  "./admin/",
  "./admin/payments/",
  "./admin/expenses/",
  "./admin/invoices/",
  "./admin/trainees/",
  "./admin/projects/",
  "./admin/partnerships/",
  "./admin/sales/",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // addAll تفشل كلها لو فشل واحد؛ نضيف كلًّا على حدة فلا يمنع ملفٌ مفقود
      // التثبيتَ بأكمله.
      Promise.all(
        SHELL.map((path) =>
          cache.add(new Request(path, { cache: "reload" })).catch(() => undefined)
        )
      )
    )
  );
  // لا skipWaiting هنا: الإصدار الجديد ينتظر قرار المستخدم (انظر الرسالة أدناه)
  // حتى لا يُقطع نموذجٌ نصف ممتلئ.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("garreb-accounting-") && k !== CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

/** هل هذا الطلب خارج نطاقنا؟ (Supabase وأي منشأ آخر يمرّ بلا اعتراض.) */
function isForeign(url) {
  if (url.origin !== self.location.origin) return true;
  // حزام أمان ثانٍ: لو صار المشروع يُخدَم من نطاق فرعي لسوبابيس يومًا ما.
  return url.hostname === "supabase.co" || url.hostname.endsWith(".supabase.co");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (isForeign(url)) return; // لا respondWith ⇒ المتصفّح يتولّاه كما لو لا عامل.

  // صفحات HTML: الشبكة أولًا، فالمعروض دائمًا آخر نسخة ما دام هناك اتصال.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req, { ignoreSearch: true });
          // أي مسار غير مخزَّن يرجع إلى جذر التطبيق: الملاحة بعده من المتصفّح.
          return cached || (await caches.match("./")) || Response.error();
        })
    );
    return;
  }

  // أصول البناء والأيقونات: الذاكرة أولًا (أسماؤها مبصومة فلا تتقادم).
  const cacheable =
    url.pathname.includes("/_next/static/") ||
    url.pathname.includes("/icons/") ||
    url.pathname.endsWith("/manifest.webmanifest");

  if (!cacheable) return;

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
          }
          return res;
        })
    )
  );
});
