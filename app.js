'use strict';
/* جرّب · المتابعة — تطبيق جوال ساكن يقرأ من قاعدة جرّب مباشرة.
 * لا خادم هنا ولا بيانات في هذا الملف: كل شيء يُجلب بعد تسجيل الدخول، وتحكمه سياسات القاعدة (RLS).
 * المفتاح أدناه «publishable» مصمَّم ليكون علنيًا ولا يمنح وحده أي وصول. */

var SB = 'https://ynqrbfbomtriixtcbrey.supabase.co';
var KEY = 'sb_publishable_iuhkvv15VfzjonbIjXwyXA_vZJI_MKJ';
var STORE = 'gf_session_v1';

/* ---------- أدوات ---------- */
function h(tag, props) {
  var e = document.createElement(tag);
  if (props) {
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (k === 'class') e.className = v;
      else if (k === 'on') Object.keys(v).forEach(function (ev) { e.addEventListener(ev, v[ev]); });
      else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : String(v));
    });
  }
  var kids = Array.prototype.slice.call(arguments, 2);
  (function add(list) {
    list.forEach(function (c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) return add(c);
      e.append(c.nodeType ? c : document.createTextNode(String(c)));
    });
  })(kids);
  return e;
}
function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

var AR = 'ar-SA-u-ca-gregory-nu-latn';
function fmtMoney(n) {
  var x = Number(n);
  if (!isFinite(x)) return '—';
  return x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ر.س';
}
function fmtDate(iso, withTime) {
  if (!iso) return '—';
  var d = new Date(iso);
  if (isNaN(d)) return String(iso).slice(0, 10);
  var o = { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'short' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) { o.year = 'numeric'; }
  if (withTime) { o.hour = '2-digit'; o.minute = '2-digit'; }
  return d.toLocaleString(AR, o);
}
function fmtMonth(iso) {
  var d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
  return d.toLocaleString(AR, { timeZone: 'UTC', month: 'long', year: 'numeric' });
}
function safeUrl(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : null; }

var STAGE_AR = {
  researching: 'بحث', qualified: 'مؤهل', draft_ready: 'مسودة جاهزة', contacted: 'تم التواصل',
  replied: 'ردّ', meeting: 'لقاء', trial: 'تجربة', proposal: 'عرض', won: 'تعاقد', lost: 'خسارة', nurture: 'رعاية'
};
function stageAr(s) { return STAGE_AR[s] || s || '—'; }
var STATUS_AR = { pending: 'بانتظار القرار', approved: 'معتمد', rejected: 'مرفوض', executed: 'نُفّذ', expired: 'منتهي', paid: 'مدفوع', failed: 'فاشل', refunded: 'مسترد' };
function statusAr(s) { return STATUS_AR[s] || s || '—'; }
var METHOD_AR = { card: 'بطاقة', mada: 'مدى', bank_transfer: 'تحويل', cash: 'نقد', stc_pay: 'STC Pay', apple_pay: 'Apple Pay' };
function methodAr(m) { return METHOD_AR[m] || m || '—'; }

/* ---------- الجلسة والشبكة ---------- */
var session = null;
function loadSession() {
  try { var s = JSON.parse(localStorage.getItem(STORE) || 'null'); if (s && s.access_token) session = s; } catch (e) { session = null; }
}
function saveSession(s) {
  session = s;
  try { if (s) localStorage.setItem(STORE, JSON.stringify(s)); else localStorage.removeItem(STORE); } catch (e) { /* التخزين غير متاح */ }
}
function pack(j) {
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || (Math.floor(Date.now() / 1000) + (j.expires_in || 3600)), email: (j.user && j.user.email) || (session && session.email) || '' };
}
async function authCall(path, body) {
  var r = await fetch(SB + '/auth/v1/' + path, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  var j = await r.json().catch(function () { return {}; });
  return { ok: r.ok, status: r.status, body: j };
}
async function signIn(email, password) {
  var r = await authCall('token?grant_type=password', { email: email, password: password });
  if (!r.ok) throw new Error(r.status === 400 ? 'البريد أو كلمة المرور غير صحيحة.' : 'تعذّر تسجيل الدخول. حاول لاحقًا.');
  saveSession(pack(r.body));
}
var refreshing = null;
function refreshSession() {
  if (!session || !session.refresh_token) return Promise.resolve(false);
  if (refreshing) return refreshing;
  refreshing = authCall('token?grant_type=refresh_token', { refresh_token: session.refresh_token })
    .then(function (r) { if (r.ok) { saveSession(pack(r.body)); return true; } return false; })
    .catch(function () { return false; })
    .then(function (ok) { refreshing = null; return ok; });
  return refreshing;
}
function signOut() { saveSession(null); boot(); }

async function api(path, opt) {
  opt = opt || {};
  if (session && session.expires_at && session.expires_at - 30 < Date.now() / 1000) await refreshSession();
  if (!session) throw authError();
  var headers = { apikey: KEY, Authorization: 'Bearer ' + session.access_token };
  if (opt.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opt.prefer) headers.Prefer = opt.prefer;
  var r = await fetch(SB + path, { method: opt.method || 'GET', headers: headers, body: opt.body !== undefined ? JSON.stringify(opt.body) : undefined });
  if (r.status === 401 && !opt.retried) {
    if (await refreshSession()) return api(path, Object.assign({}, opt, { retried: true }));
    saveSession(null);
    throw authError();
  }
  var text = await r.text();
  var data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
  if (!r.ok) {
    var err = new Error((data && (data.message || data.error)) || ('HTTP ' + r.status));
    err.status = r.status; err.code = data && data.code;
    throw err;
  }
  return data;
}
function authError() { var e = new Error('انتهت الجلسة، سجّل الدخول من جديد.'); e.auth = true; return e; }
function q(table, query) { return api('/rest/v1/' + table + '?' + query); }

/* ---------- الهيكل ---------- */
var app = document.getElementById('app');
var state = { tab: 'home', leadStage: 'all', search: '', moneyTab: 'payments', ready: false };
var TABS = [
  { id: 'home', label: 'الملخص', ic: '◧' },
  { id: 'sales', label: 'المبيعات', ic: '◉' },
  { id: 'money', label: 'المالية', ic: '＄' },
  { id: 'clients', label: 'العملاء', ic: '☻' }
];
var viewEl = null, subEl = null, lastLoad = 0, timer = null;

function boot() {
  clear(app);
  if (!session) return renderLogin();
  renderShell();
  go(state.tab);
}

function renderLogin(msg) {
  clear(app);
  var email = h('input', { type: 'email', autocomplete: 'username', inputmode: 'email', required: true, placeholder: 'البريد الإلكتروني' });
  var pass = h('input', { type: 'password', autocomplete: 'current-password', required: true, placeholder: 'كلمة المرور' });
  var err = h('div', { class: 'msg bad hidden', role: 'alert' });
  var btn = h('button', { class: 'btn primary', type: 'submit', style: false }, 'دخول');
  var form = h('form', { on: { submit: async function (ev) {
    ev.preventDefault();
    err.classList.add('hidden'); btn.disabled = true;
    try { await signIn(email.value.trim(), pass.value); pass.value = ''; boot(); }
    catch (e) { err.textContent = e.message; err.classList.remove('hidden'); btn.disabled = false; }
  } } },
    h('label', null, 'البريد الإلكتروني'), email,
    h('label', null, 'كلمة المرور'), pass,
    err, h('div', { class: 'btns' }, btn));
  app.append(h('div', { class: 'login' },
    h('h1', null, 'جرّب · المتابعة'),
    h('p', null, 'لوحة الإدارة على الجوال. الدخول لصاحب الحساب فقط.'),
    msg ? h('div', { class: 'msg warn' }, msg) : null,
    form));
}

function renderShell() {
  subEl = h('div', { class: 'sub' }, '');
  var refresh = h('button', { class: 'icon-btn', 'aria-label': 'تحديث', on: { click: function () { go(state.tab, true); } } }, '⟳');
  var out = h('button', { class: 'icon-btn', 'aria-label': 'خروج', on: { click: signOut } }, 'خروج');
  viewEl = h('main', { class: 'view', id: 'view' });
  var nav = h('nav', { class: 'nav', 'aria-label': 'التنقل' }, TABS.map(function (t) {
    return h('button', { 'data-tab': t.id, on: { click: function () { go(t.id); } } }, h('span', { class: 'ic', 'aria-hidden': 'true' }, t.ic), t.label);
  }));
  app.append(h('div', { class: 'shell' },
    h('header', { class: 'top' }, h('div', { style: false }, h('h1', null, 'جرّب'), subEl), h('span', { style: false }, ''), refresh, out),
    viewEl, nav));
  // العنوان يأخذ المساحة المتبقية
  app.querySelector('.top > div').style.flex = '1';
}

function setNav() {
  app.querySelectorAll('.nav button').forEach(function (b) {
    if (b.getAttribute('data-tab') === state.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
}

var loading = 0;
async function go(tab, force) {
  state.tab = tab; setNav();
  var my = ++loading;
  if (force || !viewEl.firstChild) { clear(viewEl); viewEl.append(h('div', { class: 'spin' }, 'جارٍ التحميل…')); }
  var node;
  try {
    node = await ({ home: viewHome, sales: viewSales, money: viewMoney, clients: viewClients })[tab]();
  } catch (e) {
    if (e.auth) { renderLogin(e.message); return; }
    node = h('div', { class: 'msg bad' }, 'تعذّر التحميل: ' + e.message);
  }
  if (my !== loading) return;
  clear(viewEl); viewEl.append(node);
  lastLoad = Date.now();
  subEl.textContent = 'آخر تحديث ' + new Date().toLocaleTimeString(AR, { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit' });
  window.scrollTo(0, 0);
}
function softRefresh() {
  if (!session || document.hidden || !viewEl) return;
  if (document.querySelector('.sheet')) return; // لا نقطع نافذة مفتوحة
  if (Date.now() - lastLoad < 55000) return;
  var y = window.scrollY;
  var tab = state.tab;
  var run = ({ home: viewHome, sales: viewSales, money: viewMoney, clients: viewClients })[tab];
  run().then(function (n) {
    if (tab !== state.tab || document.querySelector('.sheet')) return;
    clear(viewEl); viewEl.append(n); lastLoad = Date.now(); window.scrollTo(0, y);
    subEl.textContent = 'آخر تحديث ' + new Date().toLocaleTimeString(AR, { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit' });
  }).catch(function () { /* التحديث الصامت لا يزعج */ });
}

/* ---------- نافذة سفلية ---------- */
function openSheet(title, body) {
  closeSheet();
  var scrim = h('div', { class: 'scrim', id: 'scrim', on: { click: closeSheet } });
  var sheet = h('div', { class: 'sheet', id: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'head' }, h('h2', null, title), h('button', { class: 'x', 'aria-label': 'إغلاق', on: { click: closeSheet } }, '✕')),
    body);
  document.body.append(scrim, sheet);
  return sheet;
}
function closeSheet() {
  ['scrim', 'sheet'].forEach(function (id) { var e = document.getElementById(id); if (e) e.remove(); });
}
function sheetBody() { return document.getElementById('sheet'); }

/* ---------- الملخص ---------- */
async function viewHome() {
  var now = new Date().toISOString();
  var r = await Promise.all([
    q('v_monthly_summary', 'select=month,income,expenses,net&order=month.desc&limit=4'),
    q('sales_leads', 'select=id,stage,do_not_contact,needs_review,next_action_at,display_name,next_action'),
    q('sales_approvals', 'select=id,action_type,channel,status,requested_at,sales_leads(display_name)&status=eq.pending&order=requested_at.desc&limit=10').catch(function () {
      return q('sales_approvals', 'select=id,action_type,channel,status,requested_at&status=eq.pending&order=requested_at.desc&limit=10');
    }),
    q('trainees', 'select=id,type'),
    q('payments', 'select=status,amount'),
    q('sales_agent_settings', 'select=agent_enabled,research_enabled,drafting_enabled,sending_enabled,agent_phase&limit=1')
  ]);
  var months = r[0], leads = r[1], appr = r[2], trainees = r[3], pays = r[4], set = (r[5] || [])[0] || {};
  var cur = months[0];
  var paid = pays.filter(function (p) { return p.status === 'paid'; });
  var paidTotal = paid.reduce(function (a, p) { return a + Number(p.amount || 0); }, 0);
  var pendingPays = pays.filter(function (p) { return p.status === 'pending'; });
  var due = leads.filter(function (l) { return l.next_action_at && l.next_action_at <= now && !l.do_not_contact; });
  var review = leads.filter(function (l) { return l.needs_review; });

  var counts = {};
  leads.forEach(function (l) { counts[l.stage] = (counts[l.stage] || 0) + 1; });
  var order = ['researching', 'qualified', 'draft_ready', 'contacted', 'replied', 'meeting', 'trial', 'proposal', 'won', 'nurture', 'lost'];
  var stages = Object.keys(counts).sort(function (a, b) { var ia = order.indexOf(a), ib = order.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
  var max = Math.max.apply(null, stages.map(function (s) { return counts[s]; }).concat([1]));

  var root = h('div');
  if (cur) {
    root.append(h('div', { class: 'card' }, h('h2', null, 'هذا الشهر · ' + fmtMonth(cur.month)),
      h('div', { class: 'grid2' },
        stat('الدخل', fmtMoney(cur.income), 'ok'),
        stat('المصروفات', fmtMoney(cur.expenses), ''),
        stat('الصافي', fmtMoney(cur.net), Number(cur.net) < 0 ? 'bad' : 'ok'),
        stat('إجمالي المدفوع', fmtMoney(paidTotal), ''))));
  }
  root.append(h('div', { class: 'grid2' },
    stat('قرارات بانتظارك', String(appr.length), appr.length ? 'warn' : ''),
    stat('متابعات مستحقة', String(due.length), due.length ? 'warn' : ''),
    stat('الفرص', String(leads.length), ''),
    stat('العملاء', String(trainees.length), '')));
  root.append(h('div', { style: false, class: 'hidden' }));

  if (appr.length) {
    root.append(h('div', { class: 'card' }, h('h2', null, 'بانتظار موافقتك'),
      appr.map(function (a) {
        return h('div', { class: 'row' }, h('div', { class: 'main' },
          h('div', { class: 't' }, (a.sales_leads && a.sales_leads.display_name) || 'فرصة'),
          h('div', { class: 's' }, [a.action_type, a.channel].filter(Boolean).join(' · ') + ' — ' + fmtDate(a.requested_at, true))));
      }),
      h('div', { class: 'msg' }, 'القرار نفسه يُتخذ من النظام المحاسبي أو بريد المبيعات. هنا للمتابعة.')));
  }
  if (due.length) {
    root.append(h('div', { class: 'card' }, h('h2', null, 'متابعات مستحقة'),
      due.slice(0, 8).map(function (l) {
        return h('div', { class: 'row' }, h('div', { class: 'main' }, h('div', { class: 't' }, l.display_name), h('div', { class: 's' }, (l.next_action || '—') + ' — ' + fmtDate(l.next_action_at))));
      })));
  }
  root.append(h('div', { class: 'card' }, h('h2', null, 'مراحل الفرص'),
    stages.map(function (s) {
      var b = h('i'); b.style.width = Math.round(counts[s] / max * 100) + '%';
      return h('div', { style: false }, h('div', { class: 'kv' }, h('span', null, stageAr(s)), h('span', null, String(counts[s]))), h('div', { class: 'bar' }, b));
    })));
  if (review.length) root.append(h('div', { class: 'msg warn' }, review.length + ' فرصة تحتاج مراجعتك (مشتبه بها أو معلّقة).'));
  if (pendingPays.length) root.append(h('div', { class: 'msg warn' }, pendingPays.length + ' دفعة معلّقة.'));

  root.append(h('div', { class: 'card' }, h('h2', null, 'وكيل المبيعات'),
    kv('الوكيل', set.agent_enabled ? 'يعمل' : 'متوقف'),
    kv('البحث', set.research_enabled ? 'يعمل' : 'متوقف'),
    kv('صياغة المسودات', set.drafting_enabled ? 'يعمل' : 'متوقف'),
    kv('الإرسال الآلي', set.sending_enabled ? 'مفعّل' : 'متوقف (الإرسال يدوي)'),
    kv('المرحلة', String(set.agent_phase != null ? set.agent_phase : '—'))));

  if (months.length > 1) {
    root.append(h('div', { class: 'card' }, h('h2', null, 'الأشهر الأخيرة'),
      months.map(function (m) { return h('div', { class: 'kv' }, h('span', null, fmtMonth(m.month)), h('span', null, 'صافي ' + fmtMoney(m.net))); })));
  }
  return root;
}
function stat(k, v, cls) { return h('div', { class: 'stat' }, h('div', { class: 'k' }, k), h('div', { class: 'v ' + (cls || '') }, v)); }
function kv(k, v) { return h('div', { class: 'kv' }, h('span', null, k), h('span', null, v)); }

/* ---------- المبيعات ---------- */
async function viewSales() {
  var leads = await q('sales_leads', 'select=id,display_name,organization_name,stage,city,region,lead_score,next_action,next_action_at,needs_review,do_not_contact,followups_sent,updated_at&order=updated_at.desc&limit=300');
  var stages = {};
  leads.forEach(function (l) { stages[l.stage] = 1; });
  var root = h('div');
  var chips = h('div', { class: 'chips' }, [{ id: 'all', t: 'الكل (' + leads.length + ')' }].concat(Object.keys(stages).map(function (s) {
    return { id: s, t: stageAr(s) + ' (' + leads.filter(function (l) { return l.stage === s; }).length + ')' };
  })).map(function (c) {
    return h('button', { 'aria-pressed': String(state.leadStage === c.id), on: { click: function () { state.leadStage = c.id; go('sales'); } } }, c.t);
  }));
  root.append(chips);
  var list = leads.filter(function (l) { return state.leadStage === 'all' || l.stage === state.leadStage; });
  var card = h('div', { class: 'card' });
  if (!list.length) card.append(h('div', { class: 'empty' }, 'لا فرص في هذه المرحلة.'));
  list.forEach(function (l) {
    card.append(h('button', { class: 'row', on: { click: function () { openLead(l.id); } } },
      h('div', { class: 'main' },
        h('div', { class: 't' }, l.display_name),
        h('div', { class: 's' }, [l.city, l.next_action].filter(Boolean).join(' · ') || '—'),
        h('div', { style: false },
          h('span', { class: 'chip' }, stageAr(l.stage)),
          l.needs_review ? h('span', { class: 'chip warn' }, 'مراجعة') : null,
          l.do_not_contact ? h('span', { class: 'chip bad' }, 'لا تواصل') : null)),
      h('div', { class: 'end' }, l.lead_score != null ? String(l.lead_score) : '')));
  });
  root.append(card);
  return root;
}

async function openLead(id) {
  var sheet = openSheet('الفرصة', h('div', { class: 'spin' }, 'جارٍ التحميل…'));
  try {
    var r = await Promise.all([
      q('sales_leads', 'select=*&id=eq.' + encodeURIComponent(id) + '&limit=1'),
      q('sales_contacts', 'select=full_name,job_title,work_email,work_phone,is_primary&lead_id=eq.' + encodeURIComponent(id) + '&order=is_primary.desc'),
      q('sales_activities', 'select=activity_type,channel,actor_type,summary,activity_at&lead_id=eq.' + encodeURIComponent(id) + '&order=activity_at.desc&limit=10')
    ]);
    var l = r[0][0];
    if (!l) throw new Error('الفرصة غير موجودة.');
    var body = h('div');
    var url = safeUrl(l.website_url);
    body.append(h('div', { class: 'card' },
      h('div', { class: 't' }, l.display_name),
      kv('المرحلة', stageAr(l.stage)),
      kv('المدينة', [l.city, l.region].filter(Boolean).join('، ') || '—'),
      kv('الدرجة', l.lead_score != null ? String(l.lead_score) : '—'),
      kv('المنافسة', l.competitor_status || '—'),
      kv('الإجراء التالي', (l.next_action || '—') + (l.next_action_at ? ' — ' + fmtDate(l.next_action_at) : '')),
      kv('أول إرسال', l.first_sent_at ? fmtDate(l.first_sent_at, true) : '—'),
      kv('المتابعات المرسلة', String(l.followups_sent != null ? l.followups_sent : 0)),
      l.do_not_contact ? h('div', { class: 'msg bad' }, 'لا تواصل' + (l.do_not_contact_reason ? ': ' + l.do_not_contact_reason : '')) : null,
      url ? h('div', { class: 'btns' }, h('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener noreferrer' }, 'فتح الموقع')) : null));
    if (l.qualification_reason) body.append(h('div', { class: 'card' }, h('h2', null, 'سبب التأهيل'), h('div', { class: 'pre' }, String(l.qualification_reason).slice(0, 1200))));
    if (r[1].length) {
      body.append(h('div', { class: 'card' }, h('h2', null, 'جهات الاتصال'), r[1].map(function (c) {
        return h('div', { class: 'row' }, h('div', { class: 'main' }, h('div', { class: 't' }, c.full_name || '—'),
          h('div', { class: 's' }, [c.job_title, c.work_email, c.work_phone].filter(Boolean).join(' · '))));
      })));
    }
    body.append(h('div', { class: 'card' }, h('h2', null, 'آخر الأنشطة'),
      r[2].length ? r[2].map(function (a) {
        return h('div', { class: 'row' }, h('div', { class: 'main' }, h('div', { class: 't' }, a.summary || a.activity_type),
          h('div', { class: 's' }, [a.activity_type, a.channel, a.actor_type].filter(Boolean).join(' · ') + ' — ' + fmtDate(a.activity_at, true))));
      }) : h('div', { class: 'empty' }, 'لا أنشطة.')));
    var cur = sheetBody(); if (!cur) return;
    cur.replaceChild(body, cur.lastChild);
  } catch (e) {
    var s = sheetBody(); if (s) s.replaceChild(h('div', { class: 'msg bad' }, 'تعذّر التحميل: ' + e.message), s.lastChild);
  }
}

/* ---------- المالية ---------- */
async function viewMoney() {
  var root = h('div');
  var tabs = [{ id: 'payments', t: 'الدفعات' }, { id: 'invoices', t: 'الفواتير' }, { id: 'expenses', t: 'المصروفات' }];
  root.append(h('div', { class: 'chips' }, tabs.map(function (t) {
    return h('button', { 'aria-pressed': String(state.moneyTab === t.id), on: { click: function () { state.moneyTab = t.id; go('money'); } } }, t.t);
  })));
  var card = h('div', { class: 'card' });
  if (state.moneyTab === 'payments') {
    var p = await q('payments', 'select=id,amount,method,status,paid_at,created_at,trainees(full_name)&order=created_at.desc&limit=60');
    if (!p.length) card.append(h('div', { class: 'empty' }, 'لا دفعات.'));
    p.forEach(function (x) {
      card.append(h('div', { class: 'row' }, h('div', { class: 'main' },
        h('div', { class: 't' }, (x.trainees && x.trainees.full_name) || '—'),
        h('div', { class: 's' }, methodAr(x.method) + ' — ' + fmtDate(x.paid_at || x.created_at, true)),
        h('span', { class: 'chip ' + (x.status === 'paid' ? 'ok' : 'warn') }, statusAr(x.status))),
        h('div', { class: 'end' }, fmtMoney(x.amount))));
    });
  } else if (state.moneyTab === 'invoices') {
    var inv = await q('invoices', 'select=id,invoice_number,type,total,issued_at,buyer_name&order=issued_at.desc&limit=60');
    if (!inv.length) card.append(h('div', { class: 'empty' }, 'لا فواتير.'));
    inv.forEach(function (x) {
      card.append(h('div', { class: 'row' }, h('div', { class: 'main' },
        h('div', { class: 't' }, x.invoice_number),
        h('div', { class: 's' }, (x.buyer_name || '—') + ' — ' + fmtDate(x.issued_at)),
        x.type === 'credit_note' ? h('span', { class: 'chip bad' }, 'إشعار دائن') : null),
        h('div', { class: 'end' }, fmtMoney(x.total))));
    });
  } else {
    var ex = await q('expenses', 'select=id,category,amount,vendor,description,expense_date&order=expense_date.desc&limit=60');
    if (!ex.length) card.append(h('div', { class: 'empty' }, 'لا مصروفات.'));
    ex.forEach(function (x) {
      card.append(h('div', { class: 'row' }, h('div', { class: 'main' },
        h('div', { class: 't' }, x.vendor || x.category || '—'),
        h('div', { class: 's' }, [x.category, x.description].filter(Boolean).join(' · ') + ' — ' + fmtDate(x.expense_date))),
        h('div', { class: 'end' }, fmtMoney(x.amount))));
    });
  }
  root.append(card);
  return root;
}

/* ---------- العملاء وواتساب ---------- */
var TRAINEE_COLS = 'id,full_name,phone,type,organization,consent_contact,whatsapp_opt_out,phone_owner,created_at';
async function viewClients() {
  var rows = await q('trainees', 'select=' + TRAINEE_COLS + '&order=created_at.desc&limit=500');
  var root = h('div');
  var search = h('input', { type: 'search', placeholder: 'ابحث بالاسم أو الجهة أو الرقم', value: state.search, 'aria-label': 'بحث' });
  var listEl = h('div', { class: 'card' });
  function paint() {
    clear(listEl);
    var s = state.search.trim().toLowerCase();
    var list = rows.filter(function (t) { return !s || [t.full_name, t.organization, t.phone].join(' ').toLowerCase().indexOf(s) >= 0; });
    if (!list.length) listEl.append(h('div', { class: 'empty' }, 'لا نتائج.'));
    list.forEach(function (t) {
      var ready = t.consent_contact && !t.whatsapp_opt_out && t.phone_owner !== 'unknown' && t.phone;
      listEl.append(h('button', { class: 'row', on: { click: function () { openClient(t.id); } } },
        h('div', { class: 'main' },
          h('div', { class: 't' }, t.full_name),
          h('div', { class: 's' }, [t.organization, t.phone].filter(Boolean).join(' · ') || '—'),
          h('div', { style: false },
            t.whatsapp_opt_out ? h('span', { class: 'chip bad' }, 'أوقف الرسائل')
              : ready ? h('span', { class: 'chip ok' }, 'جاهز لواتساب')
              : h('span', { class: 'chip warn' }, !t.consent_contact ? 'بلا موافقة' : t.phone_owner === 'unknown' ? 'صاحب الرقم غير محدد' : 'بلا رقم'))),
        h('div', { class: 'end' }, '›')));
    });
  }
  search.addEventListener('input', function () { state.search = search.value; paint(); });
  root.append(search, h('div', { style: false, class: 'hidden' }), h('p', { class: 's', style: false }, rows.length + ' عميل'), listEl);
  paint();
  return root;
}

var OWNER_AR = { self: 'العميل ذاته', guardian: 'ولي أمر', unknown: 'غير محدد' };
async function openClient(id) {
  openSheet('العميل', h('div', { class: 'spin' }, 'جارٍ التحميل…'));
  await paintClient(id);
}
async function paintClient(id) {
  try {
    var r = await Promise.all([
      q('trainees', 'select=' + TRAINEE_COLS + ',city,source,consent_at,whatsapp_opt_out_at&id=eq.' + encodeURIComponent(id) + '&limit=1'),
      q('whatsapp_message_log', 'select=template_key,status,blocked_reason,prepared_at&trainee_id=eq.' + encodeURIComponent(id) + '&order=prepared_at.desc&limit=5')
    ]);
    var t = r[0][0];
    if (!t) throw new Error('العميل غير موجود.');
    var out = h('div');
    var ownerSel = h('select', { 'aria-label': 'صاحب الرقم' }, ['unknown', 'self', 'guardian'].map(function (o) {
      return h('option', { value: o, selected: t.phone_owner === o }, OWNER_AR[o]);
    }));
    var note = h('div', { class: 'msg hidden', role: 'status' });
    function say(text, cls) { note.className = 'msg ' + (cls || ''); note.textContent = text; }
    ownerSel.addEventListener('change', async function () {
      try { await api('/rest/v1/trainees?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: { phone_owner: ownerSel.value } }); say('حُفظ صاحب الرقم.', 'ok'); }
      catch (e) { say('تعذّر الحفظ: ' + e.message, 'bad'); }
    });

    out.append(h('div', { class: 'card' },
      h('div', { class: 't' }, t.full_name),
      kv('النوع', t.type === 'organization' ? 'جهة' : 'عميل'),
      kv('الجهة', t.organization || '—'),
      kv('الجوال', t.phone || '—'),
      kv('الموافقة على التواصل', t.consent_contact ? 'نعم' + (t.consent_at ? ' — ' + fmtDate(t.consent_at) : '') : 'لا'),
      kv('أوقف الرسائل', t.whatsapp_opt_out ? 'نعم' + (t.whatsapp_opt_out_at ? ' — ' + fmtDate(t.whatsapp_opt_out_at) : '') : 'لا'),
      h('label', null, 'صاحب الرقم'), ownerSel,
      t.consent_contact ? null : h('div', { class: 'btns' }, h('button', { class: 'btn', on: { click: async function (ev) {
        ev.target.disabled = true;
        try { await api('/rest/v1/trainees?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: { consent_contact: true, consent_at: new Date().toISOString() } }); await paintClient(id); }
        catch (e) { say('تعذّر الحفظ: ' + e.message, 'bad'); ev.target.disabled = false; }
      } } }, 'سجّلت موافقة العميل على التواصل')),
      note));

    var area = h('div');
    out.append(h('div', { class: 'card' }, h('h2', null, 'رسالة واتساب'),
      h('div', { class: 's' }, 'تُفتح المحادثة بنص جاهز وتضغط «إرسال» داخل واتساب بنفسك.'),
      h('div', { class: 'btns' },
        h('button', { class: 'btn primary', on: { click: function () { prepare(t, 'payment_reminder', area); } } }, 'تذكير بالدفع'),
        h('button', { class: 'btn primary', on: { click: function () { prepare(t, 'receipt_thanks', area); } } }, 'شكر على الدفعة')),
      area));

    if (r[1].length) {
      out.append(h('div', { class: 'card' }, h('h2', null, 'آخر المحاولات'), r[1].map(function (m) {
        return h('div', { class: 'kv' }, h('span', null, (TEMPLATE_LABEL[m.template_key] || m.template_key) + ' — ' + fmtDate(m.prepared_at, true)),
          h('span', null, m.status === 'confirmed_sent' ? 'أُرسلت' : m.status === 'prepared' ? 'مُحضّرة' : 'مرفوضة'));
      })));
    }
    if (!t.whatsapp_opt_out) {
      out.append(h('div', { class: 'card' }, h('h2', null, 'طلب إيقاف'),
        h('div', { class: 's' }, 'إن وصلك من العميل «إيقاف»، سجّله هنا فيُحجب رقمه من كل رسالة لاحقة.'),
        optOutControl(id)));
    }
    var cur = sheetBody(); if (!cur) return;
    cur.replaceChild(out, cur.lastChild);
  } catch (e) {
    var s = sheetBody(); if (s) s.replaceChild(h('div', { class: 'msg bad' }, 'تعذّر التحميل: ' + e.message), s.lastChild);
  }
}
function optOutControl(id) {
  var box = h('div', { class: 'btns' });
  var first = h('button', { class: 'btn danger', on: { click: function () {
    clear(box);
    box.append(
      h('button', { class: 'btn danger', on: { click: async function (ev) {
        ev.target.disabled = true;
        try {
          var res = await api('/rest/v1/rpc/whatsapp_register_opt_out', { method: 'POST', body: { p_trainee_id: id } });
          if (res && res.ok === true) { await paintClient(id); } else { clear(box); box.append(h('div', { class: 'msg bad' }, 'تعذّر التسجيل.')); }
        } catch (e) { clear(box); box.append(h('div', { class: 'msg bad' }, 'تعذّر التسجيل: ' + e.message)); }
      } } }, 'تأكيد: العميل طلب الإيقاف'),
      h('button', { class: 'btn', on: { click: function () { clear(box); box.append(first); } } }, 'تراجع'));
  } } }, 'سجّلت طلب إيقاف');
  box.append(first);
  return box;
}

/* ---- قوالب واتساب: نسخة حرفية من النظام المحاسبي (lib/whatsapp/templates.ts) ---- */
var OPT_OUT_LINE = 'لإيقاف التذكيرات أرسل: إيقاف';
var TEMPLATE_LABEL = { payment_reminder: 'تذكير بالدفع', receipt_thanks: 'شكر على الدفعة', renewal_reminder: 'تذكير بالتجديد' };
function cleanVar(v) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function renderTemplate(key, v) {
  var req = key === 'payment_reminder' ? ['name', 'invoice_number', 'amount'] : ['name', 'invoice_number'];
  var c = {};
  req.forEach(function (n) { c[n] = cleanVar(v[n]); if (!c[n]) throw new Error('نقص في بيانات القالب: ' + n); });
  var body = key === 'payment_reminder'
    ? 'السلام عليكم ' + c.name + '، تذكير ودي من منصة جرّب بفاتورتكم رقم ' + c.invoice_number + ' بمبلغ ' + c.amount + ' ريال. إن تمت التسوية فاعتبروا الرسالة منتهية، وشكرًا لكم.'
    : 'السلام عليكم ' + c.name + '، وصلتنا دفعتكم للفاتورة رقم ' + c.invoice_number + '، شكرًا لكم.';
  return body + '\n\n' + OPT_OUT_LINE;
}
var REFUSAL_AR = {
  invalid_phone: 'رقم الجوال غير صالح كجوال سعودي — صحّحه في سجل العميل ثم أعد المحاولة.',
  no_consent: 'لا توجد موافقة من العميل على التواصل — سجّلها أعلاه إن كانت موجودة فعلًا.',
  opted_out: 'هذا الرقم طلب إيقاف الرسائل — لا تُرسَل إليه رسالة.',
  owner_unknown: 'صاحب الرقم غير محدد — حدّده أعلاه (العميل ذاته أو ولي أمر).',
  rate_week: 'سبقت مراسلته بهذا القالب خلال الأسبوع الماضي — انتظر.',
  rate_month: 'بلغ الحدّ الشهري: ثلاث رسائل خلال ٣٠ يومًا — انتظر.',
  template_unknown: 'قالب غير معتمد.',
  trainee_not_found: 'العميل غير موجود.',
  error: 'تعذّر تحضير الرسالة. حاول لاحقًا.'
};
var NO_DATA_AR = {
  payment_reminder: 'لا توجد فاتورة غير مسدّدة (دفعتها معلّقة) لهذا العميل.',
  receipt_thanks: 'لا توجد فاتورة مدفوعة لهذا العميل.'
};
function outsideHours(now) {
  var hr = (now.getUTCHours() + 3) % 24; // الرياض UTC+3 بلا توقيت صيفي
  return hr < 7 || hr >= 22;
}

async function prepare(t, key, area) {
  clear(area);
  area.append(h('div', { class: 'spin' }, 'جارٍ التحضير…'));
  function fail(text) { clear(area); area.append(h('div', { class: 'msg bad' }, text)); }
  try {
    // 1) البيانات من الفواتير (قراءة فقط) — كما في النظام المحاسبي
    var wanted = key === 'payment_reminder' ? 'pending' : 'paid';
    var cands = await q('invoices', 'select=id,invoice_number,total,issued_at,payments!inner(status)&trainee_id=eq.' + encodeURIComponent(t.id) + '&type=neq.credit_note&payments.status=eq.' + wanted + '&order=issued_at.desc&limit=10');
    if (!cands.length) return fail(NO_DATA_AR[key]);
    var notes = await q('invoices', 'select=related_invoice_id&type=eq.credit_note&related_invoice_id=in.(' + cands.map(function (c) { return c.id; }).join(',') + ')');
    var refunded = {};
    notes.forEach(function (n) { refunded[n.related_invoice_id] = 1; });
    var inv = cands.filter(function (c) { return !refunded[c.id]; })[0];
    if (!inv) return fail(NO_DATA_AR[key]);
    var total = Number(inv.total);
    if (!isFinite(total) || total < 0) return fail('مبلغ غير صالح للرسالة.');
    var vars = { name: t.full_name, invoice_number: inv.invoice_number };
    if (key === 'payment_reminder') vars.amount = total.toFixed(2);
    var text = renderTemplate(key, vars);
    var source = key === 'payment_reminder'
      ? 'الفاتورة ' + inv.invoice_number + ' — ' + total.toFixed(2) + ' ريال — دفعتها معلّقة'
      : 'الفاتورة ' + inv.invoice_number + ' — مدفوعة';

    // 2) البوابة في القاعدة (الحَكَم): تتحقق وتسجّل المحاولة
    var g = await api('/rest/v1/rpc/whatsapp_prepare', { method: 'POST', body: { p_trainee_id: t.id, p_template_key: key } });
    if (!g || g.ok !== true) return fail(REFUSAL_AR[g && g.reason] || REFUSAL_AR.error);
    if (!/^9665\d{8}$/.test(String(g.phone || ''))) return fail(REFUSAL_AR.error);
    var link = 'https://wa.me/' + g.phone + '?text=' + encodeURIComponent(text);

    // 3) مراجعة ثم فتح واتساب
    clear(area);
    var done = h('div');
    area.append(
      h('div', { class: 's' }, 'المصدر: ' + source),
      outsideHours(new Date()) ? h('div', { class: 'msg warn' }, 'تنبيه: الوقت خارج 07:00–22:00 بتوقيت الرياض. يفضَّل الإرسال في ساعات النهار.') : h('span'),
      h('div', { class: 'pre', dir: 'rtl' }, text),
      h('div', { class: 'btns' },
        h('a', { class: 'btn primary', href: link, target: '_blank', rel: 'noopener noreferrer' }, 'فتح واتساب'),
        h('button', { class: 'btn', on: { click: async function (ev) {
          ev.target.disabled = true;
          try {
            var c = await api('/rest/v1/rpc/whatsapp_confirm_sent', { method: 'POST', body: { p_log_id: g.log_id } });
            clear(done); done.append(h('div', { class: 'msg ' + (c && c.ok ? 'ok' : 'bad') }, c && c.ok ? 'سُجّل الإرسال.' : 'تعذّر تأكيد الإرسال.'));
          } catch (e) { clear(done); done.append(h('div', { class: 'msg bad' }, 'تعذّر تأكيد الإرسال: ' + e.message)); ev.target.disabled = false; }
        } } }, 'تم الإرسال')),
      done);
  } catch (e) {
    if (e.auth) return renderLogin(e.message);
    fail(REFUSAL_AR.error);
  }
}

/* ---------- التشغيل ---------- */
document.addEventListener('visibilitychange', function () { if (!document.hidden) softRefresh(); });
window.addEventListener('focus', softRefresh);
timer = setInterval(softRefresh, 60000);
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* اختياري */ }); });
}
loadSession();
boot();
