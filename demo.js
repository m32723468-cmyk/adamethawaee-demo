// Nouskha dyal l'3ard (GitHub Pages): ma kayn la serveur la base de données, walo ma kaytsjjel.
(function () {
  var lang = document.documentElement.lang || 'fr';
  var inAdmin = /\/admin\//.test(location.pathname);
  var T = {
    fr: { off: 'Version de démonstration : rien n’est enregistré ici.', bar: 'Aperçu du site en cours de préparation. Commandes et formulaires désactivés.', dash: 'Voir le tableau de bord', shop: 'Voir la boutique', fake: 'Tableau de bord de démonstration : toutes les données sont fictives.' },
    ar: { off: 'هذه نسخة للعرض فقط: لا يتم تسجيل أي شيء هنا.', bar: 'معاينة للموقع قيد الإعداد. الطلبات والنماذج غير مفعّلة.', dash: 'عرض لوحة التحكم', shop: 'عرض المتجر', fake: 'لوحة تحكم للعرض: كل البيانات وهمية.' },
    en: { off: 'Demo version: nothing is saved here.', bar: 'Preview of the site in progress. Orders and forms are disabled.', dash: 'View the dashboard', shop: 'View the shop', fake: 'Demo dashboard: all data is fictional.' }
  }[lang] || null;
  if (!T) return;

  // L'langue dyal tel mnin kaydkhel direct l l'accueil
  if (!inAdmin && !document.referrer && /(\/|\/index\.html)$/.test(location.pathname)) {
    var nav = (navigator.language || '').slice(0, 2);
    if (nav === 'ar' || nav === 'en') location.replace(nav + '-index.html');
  }

  function toast(msg) {
    var el = document.getElementById('demoToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'demoToast';
      el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;max-width:90vw;padding:12px 18px;border-radius:12px;background:#2b102b;color:#fff;font:600 14px/1.4 system-ui,sans-serif;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.3)';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.hidden = true; }, 3500);
  }

  // Les appels l serveur: kayrj3o erreur b message wad7
  var realFetch = window.fetch;
  window.fetch = function (url, opts) {
    if (/(^|\/)api\/|upload\.php|poll\.php/.test(String(url))) {
      return Promise.resolve(new Response(JSON.stringify({ error: T.off }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    }
    return realFetch.call(window, url, opts);
  };
  if (navigator.sendBeacon) navigator.sendBeacon = function () { return true; };

  // Formulaires (recherche, tri, admin…): ma kaymchiw l 7tta blasa
  HTMLFormElement.prototype.submit = function () { toast(T.off); };
  window.addEventListener('submit', function (e) {
    var f = e.target;
    if ((f.getAttribute('method') || '').toLowerCase() === 'dialog') return;
    if (f.getAttribute('action') || (f.getAttribute('method') || '').toLowerCase() === 'post') {
      e.preventDefault();
      e.stopImmediatePropagation();
      toast(T.off);
    }
  }, true);

  document.addEventListener('DOMContentLoaded', function () {
    var bar = document.createElement('div');
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px 14px;justify-content:center;align-items:center;padding:8px 14px;background:#2b102b;color:#fff;font:500 13px/1.4 system-ui,sans-serif;text-align:center;position:relative;z-index:99998';
    var txt = document.createElement('span');
    txt.textContent = inAdmin ? T.fake : T.bar;
    var a = document.createElement('a');
    a.href = inAdmin ? '../index.html' : 'admin/index.html';
    a.textContent = (inAdmin ? T.shop : T.dash) + ' →';
    a.style.cssText = 'color:#fff;font-weight:700;text-decoration:underline';
    bar.appendChild(txt);
    bar.appendChild(a);
    document.body.insertBefore(bar, document.body.firstChild);
    // Menu dyal l'admin (fixe): ma ykhbiwch l bande
    var side = inAdmin && document.querySelector('.side');
    if (side && getComputedStyle(side).position !== 'static') {
      side.style.top = bar.offsetHeight + 'px';
      side.style.height = 'calc(100vh - ' + bar.offsetHeight + 'px)';
    }
  });
})();
