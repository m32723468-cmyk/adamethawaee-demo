const S = window.STORE;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const money = n => `${n.toLocaleString("fr-FR")} ${S.currency}`;
// Traduction (textes jaw mn PHP f STORE.t)
const T = (s, vars = {}) => Object.entries(vars).reduce((out, [k, v]) => out.replaceAll(`{${k}}`, v), S.t?.[s] ?? s);
const shippingFor = subtotal => (subtotal >= S.freeShippingFrom ? 0 : S.shippingFee);

/* ===== Toast ===== */
const toast = $("#toast");
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("is-show");
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => toast.classList.remove("is-show"), 2400);
}

/* ===== Panier (localStorage) ===== */
const Cart = {
  key: "ah_cart",
  read() {
    try {
      const items = JSON.parse(localStorage.getItem(this.key)) || [];
      return items.filter(i => S.products[i.slug] && i.qty > 0);
    } catch { return []; }
  },
  write(items) {
    try { localStorage.setItem(this.key, JSON.stringify(items)); } catch {}
    renderCart();
    window.checkoutCoupon?.reapply?.();
  },
  add(slug, size, color, qty) {
    const items = this.read();
    const line = items.find(i => i.slug === slug && i.size === size && (i.color || "") === color);
    if (line) line.qty = Math.min(line.qty + qty, 10);
    else items.push({ slug, size, color, qty });
    this.write(items);
  },
  setQty(index, qty) {
    const items = this.read();
    if (!items[index]) return;
    if (qty < 1) items.splice(index, 1);
    else items[index].qty = Math.min(qty, 10);
    this.write(items);
  },
  subtotal(items = this.read()) {
    return items.reduce((s, i) => s + S.products[i.slug].price * i.qty, 0);
  },
  count(items = this.read()) {
    return items.reduce((s, i) => s + i.qty, 0);
  },
};

const drawer = $("#cartDrawer");
function openCart() {
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("no-scroll");
}
function closeCart() {
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("no-scroll");
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function lineHTML(item, index, editable) {
  const p = S.products[item.slug];
  const meta = [item.color && (p.colors?.[item.color] ?? item.color), item.size && T("Taille {s}", { s: item.size })].filter(Boolean).join(" · ");
  return `
    <div class="line">
      <a href="${esc(p.url)}" class="line__img"><img src="${esc(p.image)}" alt=""></a>
      <div class="line__info">
        <a href="${esc(p.url)}" class="line__name">${esc(p.name)}</a>
        ${meta ? `<span class="line__meta">${esc(meta)}</span>` : ""}
        ${editable ? `
          <div class="qty qty--sm">
            <button type="button" data-line="${index}" data-delta="-1" aria-label="${esc(T("Diminuer"))}">−</button>
            <span>${item.qty}</span>
            <button type="button" data-line="${index}" data-delta="1" aria-label="${esc(T("Augmenter"))}">+</button>
          </div>` : `<span class="line__meta">${esc(T("Quantité : {n}", { n: item.qty }))}</span>`}
      </div>
      <div class="line__end">
        <strong>${money(p.price * item.qty)}</strong>
        ${editable ? `<button type="button" class="line__remove" data-remove="${index}">${esc(T("Retirer"))}</button>` : ""}
      </div>
    </div>`;
}

function renderCart() {
  const items = Cart.read();
  const subtotal = Cart.subtotal(items);
  const count = Cart.count(items);
  $("#cartCount").textContent = count;
  $("#cartCount").classList.toggle("is-empty", count === 0);

  $("#cartItems").innerHTML = items.length
    ? items.map((it, i) => lineHTML(it, i, true)).join("")
    : `<div class="drawer__empty"><p>${esc(T("Votre panier est vide."))}</p><a href="${window.DEMO_SHOP}" class="btn">${esc(T("Découvrir la collection"))}</a></div>`;
  $("#cartFoot").hidden = !items.length;
  $("#cartSubtotal").textContent = money(subtotal);

  // Barre "livraison offerte"
  const left = S.freeShippingFrom - subtotal;
  const prog = $("#shipProgress");
  prog.hidden = !items.length;
  prog.querySelector("p").innerHTML = left > 0
    ? T("Plus que {x} pour la livraison offerte", { x: `<strong>${money(left)}</strong>` })
    : esc(T("Bravo ! La livraison est offerte"));
  prog.querySelector("span").style.width = `${Math.min(100, (subtotal / S.freeShippingFrom) * 100)}%`;

  renderCheckout(items);
}

$("#cartBtn").addEventListener("click", openCart);
drawer.addEventListener("click", e => {
  if (e.target.closest("[data-close]")) closeCart();
  const delta = e.target.closest("[data-delta]");
  if (delta) {
    const i = +delta.dataset.line;
    Cart.setQty(i, Cart.read()[i].qty + +delta.dataset.delta);
  }
  const rm = e.target.closest("[data-remove]");
  if (rm) Cart.setQty(+rm.dataset.remove, 0);
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && drawer.classList.contains("is-open")) closeCart();
});

/* ===== Code promo ===== */
// Kol formulaire 3ndo coupon dyalo: { code, discount, shipping } (l7isab kaydar f serveur)
function setupCoupon(box, getItems, onChange) {
  const state = { code: "", discount: 0, shipping: null, freeShipping: false };
  if (!box) return state;
  const input = $("input", box);
  const msg = $("[data-coupon-msg]", box);
  const show = (text, ok) => {
    msg.innerHTML = text;
    msg.hidden = false;
    msg.classList.toggle("is-ok", ok);
  };
  async function apply(code, quiet = false) {
    code = (code || "").trim();
    if (!code) return;
    try {
      const res = await fetch("api/coupon.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csrf: S.csrf, code, items: getItems() }),
      });
      const data = await res.json();
      if (!res.ok) {
        Object.assign(state, { code: "", discount: 0, shipping: null });
        try { sessionStorage.removeItem("ah_coupon"); } catch {}
        if (!quiet) show(esc(data.error), false);
        onChange();
        return;
      }
      Object.assign(state, { code: data.code, discount: data.discount, shipping: data.shipping });
      try { sessionStorage.setItem("ah_coupon", data.code); } catch {}
      input.value = data.code;
      box.open = true;
      show(`${esc(data.message)} · <button type="button" class="link-btn" data-coupon-remove>${esc(T("Retirer le code"))}</button>`, true);
      onChange();
    } catch {
      if (!quiet) show(esc(T("Connexion impossible, réessayez.")), false);
    }
  }
  $("[data-coupon-apply]", box).addEventListener("click", () => apply(input.value));
  input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); apply(input.value); } });
  box.addEventListener("click", e => {
    if (!e.target.closest("[data-coupon-remove]")) return;
    Object.assign(state, { code: "", discount: 0, shipping: null });
    try { sessionStorage.removeItem("ah_coupon"); } catch {}
    input.value = "";
    msg.hidden = true;
    onChange();
  });
  state.reapply = () => state.code && apply(state.code, true);
  state.error = text => { box.open = true; show(esc(text), false); };
  // Code déjà appliqué (wla jay mn newsletter) f had la session
  let saved = "";
  try { saved = sessionStorage.getItem("ah_coupon") || ""; } catch {}
  if (saved) apply(saved, true);
  return state;
}

function showDiscount(scope, coupon, el) {
  const row = $(".sum-discount", scope);
  if (!row) return;
  row.hidden = !coupon.discount;
  $("[data-coupon-code]", row).textContent = coupon.code;
  el.textContent = `-${money(coupon.discount)}`;
}

/* ===== Envoi commande ===== */
function clearErrors(form) {
  $$(".field-error[data-for]", form).forEach(el => { el.hidden = true; });
  $$(".is-invalid", form).forEach(el => el.classList.remove("is-invalid"));
}
function showErrors(form, errors) {
  let first = null;
  for (const [field, msg] of Object.entries(errors)) {
    const el = $(`.field-error[data-for="${field}"]`, form);
    const input = form.elements[field];
    if (el) { el.textContent = msg; el.hidden = false; }
    if (input) { input.classList.add("is-invalid"); first ??= input; }
  }
  first?.focus();
}
function validPhone(v) {
  let d = v.replace(/\D+/g, "");
  if (d.startsWith("00212")) d = "0" + d.slice(5);
  else if (d.startsWith("212")) d = "0" + d.slice(3);
  return /^0[5-7]\d{8}$/.test(d);
}
function localErrors(form) {
  const errors = {};
  if (form.elements.name.value.trim().length < 3) errors.name = T("Veuillez indiquer votre nom complet.");
  if (!validPhone(form.elements.phone.value)) errors.phone = T("Numéro invalide (ex : 06 12 34 56 78).");
  if (form.elements.city.value.trim().length < 2) errors.city = T("Veuillez indiquer votre ville.");
  return errors;
}

async function submitOrder(form, items, source, btn, errorBox, coupon = null) {
  clearErrors(form);
  errorBox.hidden = true;
  const errors = localErrors(form);
  if (Object.keys(errors).length) return showErrors(form, errors);

  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = T("Envoi en cours…");
  try {
    const res = await fetch("api/order.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        csrf: S.csrf,
        source,
        items,
        coupon: coupon?.code || "",
        website: form.elements.website?.value || "",
        customer: Object.fromEntries(["name", "phone", "city", "address", "note"]
          .filter(k => form.elements[k]).map(k => [k, form.elements[k].value])),
      }),
    });
    const data = await res.json();
    if (res.ok && data.redirect) {
      location.href = data.redirect;
      return;
    }
    if (data.errors?.coupon) coupon?.error(data.errors.coupon);
    if (data.errors) showErrors(form, data.errors);
    errorBox.textContent = data.error || (data.errors?.items ?? data.errors?.color ?? data.errors?.size ?? T("Veuillez corriger les champs en rouge."));
    errorBox.hidden = false;
  } catch {
    errorBox.textContent = T("Connexion impossible. Vérifiez votre réseau ou commandez sur WhatsApp.");
    errorBox.hidden = false;
  }
  btn.disabled = false;
  btn.textContent = label;
}

/* ===== Page produit ===== */
const pdp = $(".pdp");
if (pdp) {
  const slug = pdp.dataset.slug;
  const price = +pdp.dataset.price;
  const needSize = +pdp.dataset.sizes > 0;
  const needColor = +pdp.dataset.colors > 1;
  const qtyInput = $("#qty");
  const form = $("#expressForm");
  let size = null;
  let color = needColor ? null : ($(".swatch")?.dataset.color || $("#colorLabel")?.textContent || "");

  const getQty = () => Math.max(1, Math.min(10, parseInt(qtyInput?.value, 10) || 1));

  let coupon;
  function updateTotals() {
    const sub = price * getQty();
    const ship = coupon?.code && coupon.shipping !== null ? coupon.shipping : shippingFor(sub);
    const disc = coupon?.code ? coupon.discount : 0;
    $("#exSubtotal").textContent = money(sub);
    $("#exShipping").textContent = ship ? money(ship) : T("Offerte");
    $("#exTotal").textContent = money(Math.max(0, sub - disc) + ship);
    if (coupon && form) showDiscount(form, coupon, $("#exDiscount"));
  }
  coupon = setupCoupon(form && $("[data-coupon]", form), () => [{ slug, qty: getQty() }], updateTotals);

  function flag(groupSel, errorSel) {
    const group = $(groupSel);
    $(errorSel).hidden = false;
    group.scrollIntoView({ behavior: "smooth", block: "center" });
    group.classList.add("shake");
    setTimeout(() => group.classList.remove("shake"), 500);
    return false;
  }
  const requireOptions = () =>
    (!needColor || color || flag(".swatches", "#colorError")) &&
    (!needSize || size || flag(".sizes", "#sizeError"));

  function setImage(src) {
    if (!src) return;
    const stage = $("#pdpStage"), first = stage.dataset.first === src;
    stage.classList.toggle("is-plain", !first);
    $("#mainImage").classList.toggle("is-full", first && stage.dataset.full === "1");
    $("#mainImage").src = src;
    $$(".pdp__thumb").forEach(x => x.classList.toggle("is-active", x.dataset.src === src));
  }

  $$(".size").forEach(btn => btn.addEventListener("click", () => {
    size = btn.dataset.size;
    $$(".size").forEach(b => b.setAttribute("aria-checked", String(b === btn)));
    $("#sizeLabel").textContent = size;
    $("#sizeError").hidden = true;
  }));

  $$(".swatch").forEach(btn => btn.addEventListener("click", () => {
    color = btn.dataset.color;
    $$(".swatch").forEach(b => b.setAttribute("aria-checked", String(b === btn)));
    $("#colorLabel").textContent = btn.dataset.label || color;
    if ($("#colorError")) $("#colorError").hidden = true;
    setImage(btn.dataset.image);
  }));

  $$("[data-qty]").forEach(btn => btn.addEventListener("click", () => {
    qtyInput.value = Math.max(1, Math.min(10, getQty() + +btn.dataset.qty));
    updateTotals();
    coupon.reapply?.();
  }));
  qtyInput?.addEventListener("change", () => { qtyInput.value = getQty(); updateTotals(); });

  $("#addToCart")?.addEventListener("click", () => {
    if (!requireOptions()) return;
    Cart.add(slug, size || "", color || "", getQty());
    window.ahHit?.("cart");
    const evId = "addtocart-" + Math.random().toString(16).slice(2) + Date.now().toString(16);
    window.fbq?.("track", "AddToCart", { content_ids: [slug], content_type: "product", value: price * getQty(), currency: "MAD" }, { eventID: evId });
    if (window.META_CAPI) navigator.sendBeacon?.("api/track.php", new Blob([JSON.stringify({ event: "AddToCart", id: evId, url: location.href, data: { content_ids: [slug], qty: getQty() } })], { type: "application/json" }));
    window.ttq?.track("AddToCart", { content_id: slug, value: price * getQty(), currency: "MAD" });
    openCart();
  });

  form?.addEventListener("submit", e => {
    e.preventDefault();
    if (!requireOptions()) return;
    submitOrder(form, [{ slug, size: size || "", color: color || "", qty: getQty() }], "express", $("#expressBtn"), $("#expressError"), coupon);
  });

  // Galerie
  $$(".pdp__thumb").forEach(t => t.addEventListener("click", () => setImage(t.dataset.src)));
  const lightbox = $("#lightbox");
  $("#zoomBtn").addEventListener("click", () => {
    $("img", lightbox).src = $("#mainImage").src;
    lightbox.showModal();
  });
  lightbox.addEventListener("click", e => { if (e.target === lightbox) lightbox.close(); });

  // Barre mobile: katban mlli l formulaire ma bayench
  const sticky = $("#stickyBuy");
  if (sticky && form) {
    new IntersectionObserver(([entry]) => {
      sticky.classList.toggle("is-visible", !entry.isIntersecting && entry.boundingClientRect.top > 0);
    }).observe(form);
    $("#stickyBuyBtn").addEventListener("click", () => {
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      const next = (needColor && !color && $(".swatch")) || (needSize && !size && $(".size")) || form.elements.name;
      setTimeout(() => next.focus({ preventScroll: true }), 500);
    });
  }

  // Avis
  const reviewForm = $("#reviewForm");
  reviewForm?.addEventListener("submit", async e => {
    e.preventDefault();
    const err = $("#reviewError");
    const fd = new FormData(reviewForm);
    fd.append("csrf", S.csrf);
    fd.append("product_id", reviewForm.dataset.product);
    err.hidden = true;
    const btn = $("button[type=submit]", reviewForm);
    btn.disabled = true;
    try {
      const res = await fetch("api/review.php", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { err.textContent = data.error; err.hidden = false; return; }
      $("#reviewModal").close();
      reviewForm.reset();
      showToast(T("Merci ! Votre avis sera publié après vérification."));
    } catch {
      err.textContent = T("Connexion impossible, réessayez.");
      err.hidden = false;
    }
    btn.disabled = false;
  });

}

/* ===== Modales (guide des tailles) ===== */
$$("[data-open]").forEach(btn => btn.addEventListener("click", () => $("#" + btn.dataset.open).showModal()));
$$("dialog.modal").forEach(d => d.addEventListener("click", e => { if (e.target === d) d.close(); }));

/* ===== Page commande ===== */
function renderCheckout(items) {
  const grid = $("#checkoutGrid");
  if (!grid) return;
  $("#checkoutEmpty").hidden = items.length > 0;
  grid.hidden = !items.length;
  const sub = Cart.subtotal(items);
  const c = window.checkoutCoupon;
  const ship = c?.code && c.shipping !== null ? c.shipping : shippingFor(sub);
  const disc = c?.code ? c.discount : 0;
  $("#summaryItems").innerHTML = items.map((it, i) => lineHTML(it, i, true)).join("");
  $("#sumSubtotal").textContent = money(sub);
  $("#sumShipping").textContent = ship ? money(ship) : T("Offerte");
  $("#sumTotal").textContent = money(Math.max(0, sub - disc) + ship);
  if (c) showDiscount($(".summary"), c, $("#sumDiscount"));
}

const checkoutForm = $("#checkoutForm");
if (checkoutForm) {
  window.checkoutCoupon = setupCoupon($(".summary [data-coupon]"),
    () => Cart.read().map(({ slug, qty }) => ({ slug, qty })), () => renderCheckout(Cart.read()));
  $("#summaryItems").addEventListener("click", e => {
    const delta = e.target.closest("[data-delta]");
    if (delta) {
      const i = +delta.dataset.line;
      Cart.setQty(i, Cart.read()[i].qty + +delta.dataset.delta);
    }
    const rm = e.target.closest("[data-remove]");
    if (rm) Cart.setQty(+rm.dataset.remove, 0);
  });
  checkoutForm.addEventListener("submit", e => {
    e.preventDefault();
    const items = Cart.read().map(({ slug, size, color, qty }) => ({ slug, size, color: color || "", qty }));
    submitOrder(checkoutForm, items, "panier", $("#checkoutBtn"), $("#checkoutError"), window.checkoutCoupon);
  });
}

/* ===== Langue ===== */
const langMenu = $("#langMenu");
if (langMenu) {
  const btn = $(".lang__btn", langMenu);
  btn.addEventListener("click", e => {
    e.stopPropagation();
    const open = langMenu.classList.toggle("is-open");
    btn.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", () => {
    langMenu.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
  });
}

/* ===== Recherche ===== */
const searchBar = $("#searchBar");
$("#searchBtn").addEventListener("click", () => {
  searchBar.classList.toggle("is-open");
  if (searchBar.classList.contains("is-open")) $("input", searchBar).focus();
});

/* ===== Menu mobile ===== */
const nav = $("#nav");
function closeNav() {
  nav.classList.remove("is-open");
  document.body.classList.remove("nav-open");
}
$("#menuBtn").addEventListener("click", () => {
  const open = nav.classList.toggle("is-open");
  document.body.classList.toggle("nav-open", open);
});
document.body.addEventListener("click", e => {
  if (document.body.classList.contains("nav-open") && !e.target.closest("#menuBtn") &&
      (!e.target.closest("#nav") || e.target.closest("#nav a"))) closeNav();
});

/* ===== Bandeau d'annonces ===== */
const slides = $$(".announce__track p");
let slide = 0;
function goTo(i) {
  slides[slide].classList.remove("is-active");
  slide = (i + slides.length) % slides.length;
  slides[slide].classList.add("is-active");
}
let timer = setInterval(() => goTo(slide + 1), 4000);
$$(".announce__arrow").forEach(btn => btn.addEventListener("click", () => {
  clearInterval(timer);
  goTo(slide + (btn.dataset.dir === "next" ? 1 : -1));
  timer = setInterval(() => goTo(slide + 1), 4000);
}));

/* ===== Newsletter ===== */
$("#newsForm").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.target;
  try {
    const res = await fetch("api/newsletter.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csrf: S.csrf, email: form.querySelector("input").value }),
    });
    const data = await res.json();
    if (!res.ok) return showToast(data.error);
    form.reset();
    showToast(T("Merci ! Votre inscription est confirmée."));
    if (data.code) {
      const box = $("#newsCode");
      box.innerHTML = `${esc(T("Votre code de bienvenue {label} : {code}", { label: data.label, code: "" }))}<strong>${esc(data.code)}</strong><br><small>${esc(T("Utilisez-le lors de votre commande."))}</small>`;
      box.hidden = false;
      try { sessionStorage.setItem("ah_coupon", data.code); } catch {}
    }
  } catch {
    showToast(T("Connexion impossible, réessayez plus tard."));
  }
});

renderCart();
