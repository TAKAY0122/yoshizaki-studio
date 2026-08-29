/* ============================================================
   見積もりシミュレーター ロジック
   ============================================================ */

const state = {
  categoryId: null,
  planId: null,
  addons: {}, // id -> qty(number) or boolean
  bundleId: null,
  deliveryOptionId: null,
};

let BUNDLES = [];
let DELIVERY_OPTIONS = [];
let ACTIVE_CAMPAIGN = null;

// 金額計算の本体（computeTotalPure）はサーバー（src/index.ts）と共有する
// public/js/pricing-calc.js に切り出してある。ページ読み込み時に一度だけ
// 読み込み、以後は同期的に呼び出す（loadDynamicData() が解決を待つため、
// カテゴリ・プランを選択できる状態になった時点では必ず読み込み済み）。
let computeTotalPureRef = null;
const pricingCalcReady = import("/js/pricing-calc.js").then((mod) => {
  computeTotalPureRef = mod.computeTotalPure;
});

const els = {
  categoryGrid: document.getElementById("category-grid"),
  optionsSection: document.getElementById("options-section"),
  optionsInner: document.getElementById("options-inner"),
  summary: document.getElementById("summary"),
  summaryTotal: document.getElementById("summary-total"),
  summaryDays: document.getElementById("summary-days"),
  summaryBreakdown: document.getElementById("summary-breakdown"),
  summaryRecurring: document.getElementById("summary-recurring"),
  issueBtn: document.getElementById("issue-code-btn"),
  codeResult: document.getElementById("code-result"),
  codeValue: document.getElementById("code-value"),
  copyBtn: document.getElementById("copy-code-btn"),
  hearingLink: document.getElementById("hearing-link"),
  quoteLink: document.getElementById("quote-link"),
  stepsEl: document.getElementById("steps"),
  categorySection: document.getElementById("category-section"),
  selectedCategoryBar: document.getElementById("selected-category-bar"),
  selectedCategoryBadge: document.getElementById("selected-category-badge"),
  selectedCategoryLabel: document.getElementById("selected-category-label"),
  changeCategoryBtn: document.getElementById("change-category-btn"),
  summaryToggle: document.getElementById("summary-toggle"),
  bundleSection: document.getElementById("bundle-section"),
  bundleGrid: document.getElementById("bundle-grid"),
  campaignBanner: document.getElementById("campaign-banner"),
  caseIdNote: document.getElementById("case-id-note"),
  caseIdValue: document.getElementById("case-id-value"),
};

function escapeHtmlClient(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function formatYen(n) {
  return "¥" + n.toLocaleString("ja-JP");
}

function formatDays(d) {
  if (d === undefined || d === null) return "";
  const n = Number(d);
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${s}人日`;
}

function setStep(n) {
  if (!els.stepsEl) return;
  els.stepsEl.querySelectorAll(".step").forEach((el) => {
    const s = Number(el.dataset.step);
    el.classList.toggle("is-active", s === n);
    el.classList.toggle("is-done", s < n);
  });
}

function getCategory(id) {
  return CATEGORIES.find((c) => c.id === id);
}

/* ---------------- 動的データ（料金上書き・セットプラン・納品スケジュール・キャンペーン） ---------------- */
function applyPricingOverrides(overrides) {
  overrides.forEach((o) => {
    let item = null;
    if (o.item_type === "plan") {
      const cat = getCategory(o.category_id);
      item = cat && cat.plans.find((p) => p.id === o.item_id);
    } else if (o.item_type === "addon") {
      const cat = getCategory(o.category_id);
      item = cat && cat.addons.find((a) => a.id === o.item_id);
    } else if (o.item_type === "common_addon") {
      item = COMMON_ADDONS.find((a) => a.id === o.item_id);
    }
    if (item) {
      item.rate = o.rate;
      item.days = o.days;
      item.price = Math.round(o.rate * o.days);
    }
  });
}

async function loadDynamicData() {
  await pricingCalcReady;
  try {
    const [overridesRes, bundlesRes, deliveryRes, campaignRes] = await Promise.all([
      fetch("/api/pricing-overrides").then((r) => (r.ok ? r.json() : { overrides: [] })).catch(() => ({ overrides: [] })),
      fetch("/api/bundles").then((r) => (r.ok ? r.json() : { bundles: [] })).catch(() => ({ bundles: [] })),
      fetch("/api/delivery-options").then((r) => (r.ok ? r.json() : { options: [] })).catch(() => ({ options: [] })),
      fetch("/api/campaigns/active").then((r) => (r.ok ? r.json() : { campaign: null })).catch(() => ({ campaign: null })),
    ]);

    applyPricingOverrides(overridesRes.overrides || []);
    BUNDLES = bundlesRes.bundles || [];
    DELIVERY_OPTIONS = deliveryRes.options || [];
    ACTIVE_CAMPAIGN = campaignRes.campaign || null;

    const defaultDelivery = DELIVERY_OPTIONS.find((d) => d.is_default) || DELIVERY_OPTIONS[0];
    if (defaultDelivery) state.deliveryOptionId = defaultDelivery.id;
  } catch (e) {
    // 動的データの取得に失敗しても、基本の見積もり機能は使えるようにする
    console.warn("動的な料金設定の取得に失敗しました（基本料金のみで表示します）:", e);
  }

  renderBundles();
  renderCampaignBanner();
}

function renderBundles() {
  if (!els.bundleSection || !els.bundleGrid) return;
  const catBundles = BUNDLES.filter((b) => b.category_id === state.categoryId);
  if (!state.categoryId || !catBundles.length) {
    els.bundleSection.hidden = true;
    return;
  }
  els.bundleSection.hidden = false;

  const subtitleEl = document.getElementById("bundle-subtitle");
  if (subtitleEl) {
    const percentBundles = catBundles.filter((b) => b.discount_type === "percent");
    const maxPct = percentBundles.length ? Math.max(...percentBundles.map((b) => b.discount_value)) : null;
    subtitleEl.textContent = maxPct
      ? `バラで選ぶより最大${maxPct}%OFF・選ぶと見積もりに直行`
      : "バラで選ぶよりおトク・選ぶと見積もりに直行";
  }

  els.bundleGrid.innerHTML = catBundles.map((b) => {
    const cat = getCategory(b.category_id);
    const plan = cat && cat.plans.find((p) => p.id === b.plan_id);
    if (!cat || !plan) return "";
    const addons = (b.addon_ids || [])
      .map((id) => cat.addons.find((a) => a.id === id))
      .filter(Boolean);
    const subtotal = plan.price + addons.reduce((s, a) => s + a.price, 0);
    const discounted = b.discount_type === "fixed"
      ? Math.max(0, subtotal - b.discount_value)
      : Math.round(subtotal * (1 - b.discount_value / 100));
    const saved = subtotal - discounted;
    const savedPct = subtotal ? Math.round((saved / subtotal) * 100) : 0;
    const chips = [plan.label, ...addons.map((a) => a.label)];

    return `
      <button type="button" class="bundle-card ${b.featured ? "is-featured" : ""}" data-bundle="${b.id}">
        ${b.featured ? '<span class="bundle-ribbon">人気No.1</span>' : ""}
        <div class="bundle-top">
          <span class="icon-badge" style="background:${cat.badge}">${cat.tag}</span>
          ${b.audience_tag ? `<span class="bundle-audience">${b.audience_tag}</span>` : ""}
        </div>
        <span class="bundle-label">${b.label}</span>
        <div class="bundle-chips">${chips.map((c) => `<span class="bundle-chip">${c}</span>`).join("")}</div>
        <span class="bundle-price">
          <span class="bundle-price-was">¥${subtotal.toLocaleString("ja-JP")}</span>
          <span class="bundle-price-now">¥${discounted.toLocaleString("ja-JP")}</span>
          <span class="bundle-price-tax">税別</span>
        </span>
        ${saved > 0 ? `<span class="bundle-saved">▲ ¥${saved.toLocaleString("ja-JP")} お得（${savedPct}%OFF）</span>` : ""}
      </button>`;
  }).join("");

  els.bundleGrid.querySelectorAll("[data-bundle]").forEach((btn) => {
    btn.addEventListener("click", () => selectBundle(btn.dataset.bundle));
  });
}

function selectBundle(bundleId) {
  const bundle = BUNDLES.find((b) => b.id === bundleId);
  if (!bundle) return;
  selectCategory(bundle.category_id, { keepBundle: true });
  state.planId = bundle.plan_id;
  state.addons = {};
  (bundle.addon_ids || []).forEach((id) => { state.addons[id] = true; });
  state.bundleId = bundle.id;
  renderOptions();
  const scrollTarget = document.getElementById("delivery-opt-group") || els.optionsSection;
  scrollTarget.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

function renderCampaignBanner() {
  if (!els.campaignBanner) return;
  if (!ACTIVE_CAMPAIGN) {
    els.campaignBanner.hidden = true;
    return;
  }
  const discountText = ACTIVE_CAMPAIGN.discount_type === "fixed"
    ? `¥${Number(ACTIVE_CAMPAIGN.discount_value).toLocaleString("ja-JP")}引き`
    : `${ACTIVE_CAMPAIGN.discount_value}%OFF`;
  els.campaignBanner.hidden = false;
  els.campaignBanner.innerHTML = `<strong>${ACTIVE_CAMPAIGN.label}</strong>　${discountText}実施中${ACTIVE_CAMPAIGN.banner_text ? "　" + ACTIVE_CAMPAIGN.banner_text : ""}`;
}

/* ---------------- カテゴリ選択 ---------------- */
function renderCategoryGrid() {
  els.categoryGrid.innerHTML = CATEGORIES.map(
    (cat) => `
    <button type="button" class="cat-card ${state.categoryId === cat.id ? "is-selected" : ""}" data-cat="${cat.id}" aria-pressed="${state.categoryId === cat.id}">
      <span class="icon-badge" style="background:${cat.badge}">${cat.tag}</span>
      <h3>${cat.label}</h3>
    </button>
  `
  ).join("");

  els.categoryGrid.querySelectorAll(".cat-card").forEach((btn) => {
    btn.addEventListener("click", () => selectCategory(btn.dataset.cat));
  });
}

function selectCategory(id, opts = {}) {
  if (state.categoryId !== id) {
    state.categoryId = id;
    state.planId = null;
    state.addons = {};
  }
  if (!opts.keepBundle) state.bundleId = null;
  renderCategoryGrid();
  renderBundles();
  renderOptions();
  renderSelectedCategoryBar();
  if (els.categorySection) els.categorySection.hidden = true;
  els.optionsSection.hidden = false;
  setStep(2);
  els.optionsSection.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

/* ---------------- ウィザード表示制御（金額計算には関与しない） ---------------- */
function renderSelectedCategoryBar() {
  const cat = getCategory(state.categoryId);
  if (!cat || !els.selectedCategoryBadge || !els.selectedCategoryLabel) return;
  els.selectedCategoryBadge.textContent = cat.tag;
  els.selectedCategoryBadge.style.background = cat.badge;
  els.selectedCategoryLabel.textContent = cat.label;
}

if (els.changeCategoryBtn) {
  els.changeCategoryBtn.addEventListener("click", () => {
    els.optionsSection.hidden = true;
    if (els.summary) els.summary.hidden = true;
    const statusEl = document.getElementById("send-status");
    if (statusEl) statusEl.hidden = true;
    if (els.categorySection) els.categorySection.hidden = false;
    setStep(1);
    els.categorySection.scrollIntoView?.({ behavior: "smooth", block: "start" });
  });
}

/* ---------------- 仕様選択 ---------------- */
function renderOptions() {
  const cat = getCategory(state.categoryId);
  if (!cat) return;

  const planHtml = `
    <div class="opt-group">
      <h4>ベースプラン<span class="req">必須</span></h4>
      <div class="opt-list">
        ${cat.plans
          .map(
            (p) => `
          <label class="opt-row">
            <input type="radio" name="plan" value="${p.id}" ${state.planId === p.id ? "checked" : ""} />
            <span class="opt-label">${p.label}</span>
            <span class="opt-days">${formatDays(p.days)}</span>
            <span class="opt-price">${formatYen(p.price)}〜</span>
          </label>
        `
          )
          .join("")}
      </div>
    </div>
  `;

  const addonHtml = `
    <div class="opt-group">
      <h4>オプション</h4>
      <div class="opt-list">
        ${cat.addons
          .map((a) => {
            if (a.type === "checkbox") {
              const checked = !!state.addons[a.id];
              return `
              <label class="opt-row">
                <input type="checkbox" data-addon="${a.id}" data-type="checkbox" ${checked ? "checked" : ""} />
                <span class="opt-label">${a.label}</span>
                <span class="opt-days">${formatDays(a.days)}</span>
                <span class="opt-price">+${formatYen(a.price)}</span>
              </label>`;
            }
            const qty = state.addons[a.id] || 0;
            return `
              <div class="opt-row opt-row--stepper">
                <span class="opt-label">${a.label}</span>
                <span class="opt-days">${formatDays(a.days)}/${a.unit}</span>
                <span class="opt-price">+${formatYen(a.price)} / ${a.unit}</span>
                <span class="stepper">
                  <button type="button" class="stepper-btn" data-stepper-dec="${a.id}" aria-label="減らす">−</button>
                  <span class="stepper-val" id="stepper-${a.id}">${qty}</span>
                  <button type="button" class="stepper-btn" data-stepper-inc="${a.id}" aria-label="増やす">＋</button>
                </span>
              </div>`;
          })
          .join("")}
      </div>
    </div>
  `;

  const recurringHtml = cat.recurring.length
    ? `
    <div class="opt-group">
      <h4>継続費用（任意・目安）</h4>
      <div class="opt-list">
        ${cat.recurring.map((r) => `<div class="opt-row opt-row--static"><span class="opt-label">${r.label}</span><span class="opt-price">${formatYen(r.price)} / ${r.unit}</span></div>`).join("")}
      </div>
    </div>`
    : "";

  const commonHtml = `
    <div class="opt-group">
      <h4>共通オプション</h4>
      <div class="opt-list">
        ${COMMON_ADDONS.map((a) => {
          if (a.type === "multiplier") {
            const checked = !!state.addons[a.id];
            return `
            <label class="opt-row">
              <input type="checkbox" data-addon="${a.id}" data-type="multiplier" ${checked ? "checked" : ""} />
              <span class="opt-label">${a.label}</span>
              <span class="opt-price">× ${a.value}</span>
            </label>`;
          }
          const checked = !!state.addons[a.id];
          return `
          <label class="opt-row">
            <input type="checkbox" data-addon="${a.id}" data-type="checkbox" ${checked ? "checked" : ""} />
            <span class="opt-label">${a.label}</span>
            <span class="opt-price">+${formatYen(a.price)}</span>
          </label>`;
        }).join("")}
      </div>
    </div>
  `;

  const deliveryHtml = DELIVERY_OPTIONS.length
    ? `
    <div class="opt-group" id="delivery-opt-group">
      <h4>納品スケジュール</h4>
      <div class="opt-list">
        ${DELIVERY_OPTIONS.map((d) => {
          const checked = state.deliveryOptionId === d.id;
          const diffPct = Math.round((d.multiplier - 1) * 100);
          const diffLabel = diffPct === 0 ? "±0%" : diffPct > 0 ? `+${diffPct}%` : `${diffPct}%`;
          return `
          <label class="opt-row">
            <input type="radio" name="delivery" value="${d.id}" ${checked ? "checked" : ""} />
            <span class="opt-label">${d.label}${d.description ? `<br /><span class="opt-sub">${d.description}</span>` : ""}</span>
            <span class="opt-price">${diffLabel}</span>
          </label>`;
        }).join("")}
      </div>
    </div>`
    : "";

  els.optionsInner.innerHTML = planHtml + addonHtml + commonHtml + deliveryHtml + recurringHtml;

  els.optionsInner.querySelectorAll('input[name="delivery"]').forEach((el) => {
    el.addEventListener("change", (e) => {
      state.deliveryOptionId = e.target.value;
      updateSummary();
    });
  });

  els.optionsInner.querySelectorAll('input[name="plan"]').forEach((el) => {
    el.addEventListener("change", (e) => {
      state.planId = e.target.value;
      state.bundleId = null;
      updateSummary();
    });
  });
  els.optionsInner.querySelectorAll('input[data-addon][data-type="checkbox"], input[data-addon][data-type="multiplier"]').forEach((el) => {
    el.addEventListener("change", (e) => {
      state.addons[e.target.dataset.addon] = e.target.checked;
      state.bundleId = null;
      updateSummary();
    });
  });
  els.optionsInner.querySelectorAll("[data-stepper-inc]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.stepperInc;
      state.addons[id] = (state.addons[id] || 0) + 1;
      state.bundleId = null;
      document.getElementById(`stepper-${id}`).textContent = state.addons[id];
      updateSummary();
    });
  });
  els.optionsInner.querySelectorAll("[data-stepper-dec]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.stepperDec;
      state.addons[id] = Math.max(0, (state.addons[id] || 0) - 1);
      state.bundleId = null;
      document.getElementById(`stepper-${id}`).textContent = state.addons[id];
      updateSummary();
    });
  });

  updateSummary();
}

/* ---------------- 集計 ---------------- */
// 実際の計算ロジックは public/js/pricing-calc.js の computeTotalPure に
// 集約されている（サーバー側 src/index.ts と共有するため）。
// 万一モジュール読み込み前に呼ばれた場合は「未選択」と同じ形の値を返す
// （誤った金額を一瞬でも表示しないため。loadDynamicData() が解決を待つので
// 通常のユーザー操作でこの分岐に入ることはない）。
function computeTotal() {
  if (!computeTotalPureRef) return { total: 0, breakdown: [], recurringTotal: 0 };
  return computeTotalPureRef(state, {
    categories: CATEGORIES,
    commonAddons: COMMON_ADDONS,
    bundles: BUNDLES,
    deliveryOptions: DELIVERY_OPTIONS,
    activeCampaign: ACTIVE_CAMPAIGN,
  });
}

function updateSummary() {
  const cat = getCategory(state.categoryId);
  const { total, breakdown, recurringTotal } = computeTotal();

  if (!cat || !state.planId) {
    els.summary.hidden = true;
    els.codeResult.hidden = true;
    return;
  }
  const wasHidden = els.summary.hidden;
  els.summary.hidden = false;
  if (wasHidden) {
    els.summary.classList.add("is-collapsed");
  }

  const low = Math.round(total * 0.9);
  const high = Math.round(total * 1.15);
  els.summaryTotal.textContent = `${formatYen(low)} 〜 ${formatYen(high)}`;

  const totalDays = breakdown.reduce((s, b) => s + (b.days || 0), 0);
  if (els.summaryDays) {
    els.summaryDays.textContent = totalDays ? `合計 約${formatDays(Math.round(totalDays * 10) / 10)}` : "";
  }

  els.summaryBreakdown.innerHTML = breakdown
    .map(
      (b) =>
        `<li><span>${b.label}${b.days ? `<span class="li-days">${formatDays(b.days)}</span>` : ""}</span><span>${formatYen(b.price)}</span></li>`
    )
    .join("");

  els.summaryRecurring.innerHTML = recurringTotal
    ? `<p class="recurring-note">継続費用の目安：${formatYen(recurringTotal)} / 月〜</p>`
    : "";

  els.codeResult.hidden = true;
}

/* ---------------- 見積もりコード ---------------- */
function encodeEstimate() {
  const payload = {
    v: 1,
    cat: state.categoryId,
    plan: state.planId,
    addons: state.addons,
    total: computeTotal().total,
    ts: Date.now(),
  };
  const json = JSON.stringify(payload);
  return btoa(unescape(encodeURIComponent(json)));
}

function decodeEstimate(code) {
  try {
    const json = decodeURIComponent(escape(atob(code)));
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}
window.TyEstimate = { encodeEstimate, decodeEstimate, CATEGORIES, COMMON_ADDONS };

els.summaryToggle.addEventListener("click", () => {
  els.summary.classList.toggle("is-collapsed");
});

els.issueBtn.addEventListener("click", async () => {
  const nameEl = document.getElementById("contact-name");
  const emailEl = document.getElementById("contact-email");
  const statusEl = document.getElementById("send-status");
  const name = nameEl.value.trim();
  const email = emailEl.value.trim();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (!name || !emailOk) {
    statusEl.hidden = false;
    statusEl.className = "send-status is-error";
    statusEl.textContent = !name ? "お名前を入力してください" : "メールアドレスの形式が正しくありません";
    (!name ? nameEl : emailEl).focus();
    return;
  }

  // ヒアリングシートに進んだ際、お名前・メールアドレスの再入力を省けるよう、
  // 同一タブ内でのみ有効なsessionStorageに一時保存する（URLには含めない）。
  try {
    sessionStorage.setItem("ty-contact-carryover", JSON.stringify({ name, email }));
  } catch (e) {
    // sessionStorageが使えない環境では何もしない
  }

  els.summary.classList.remove("is-collapsed");
  const code = encodeEstimate();
  els.codeValue.textContent = code;
  els.codeResult.hidden = false;
  setStep(3);
  const cat = getCategory(state.categoryId);
  els.hearingLink.href = `${cat.hearingUrl}?code=${encodeURIComponent(code)}`;
  els.hearingLink.textContent = `${cat.label} のヒアリングシートへ進む →`;
  if (els.quoteLink) els.quoteLink.href = `/customer/quote.html?code=${encodeURIComponent(code)}`;
  els.codeResult.scrollIntoView?.({ behavior: "smooth", block: "center" });

  els.issueBtn.disabled = true;
  statusEl.hidden = false;
  statusEl.className = "send-status is-loading";
  statusEl.textContent = "見積書を作成してメールを送信しています…";

  try {
    const res = await fetch("/api/estimates/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name, email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (data.caseId) {
      els.hearingLink.href = `${cat.hearingUrl}?code=${encodeURIComponent(code)}&caseId=${encodeURIComponent(data.caseId)}`;
      if (els.caseIdNote && els.caseIdValue) {
        els.caseIdValue.textContent = data.caseId;
        els.caseIdNote.hidden = false;
      }
    }
    statusEl.className = "send-status is-success";
    statusEl.innerHTML = `${escapeHtmlClient(email)} 宛に見積書をお送りしました。ご確認ください。<br /><span class="status-sub">※ 数分待っても届かない場合は、迷惑メールフォルダもご確認ください。</span>`;
  } catch (err) {
    console.warn("見積もり送信でエラーが発生しました:", err);
    statusEl.className = "send-status is-error";
    statusEl.textContent = "メールの送信に失敗しました。お手数ですが、上記の見積もりコードまたはリンクから内容をご確認ください。";
  } finally {
    els.issueBtn.disabled = false;
  }
});

els.copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(els.codeValue.textContent);
    els.copyBtn.textContent = "コピーしました";
    setTimeout(() => (els.copyBtn.textContent = "コードをコピー"), 1800);
  } catch (e) {
    /* clipboard unavailable — no-op */
  }
});

renderCategoryGrid();
loadDynamicData();

/* ---------------- AI提案 ---------------- */
const aiEls = {
  textarea: document.getElementById("ai-description"),
  btn: document.getElementById("ai-suggest-btn"),
  status: document.getElementById("ai-status"),
  result: document.getElementById("ai-result"),
};

if (aiEls.btn) {
  aiEls.btn.addEventListener("click", async () => {
    const description = aiEls.textarea.value.trim();
    if (!description) {
      aiEls.status.textContent = "内容を入力してください";
      return;
    }
    aiEls.btn.disabled = true;
    aiEls.status.textContent = "確認中…";
    aiEls.result.hidden = true;

    try {
      const res = await fetch("/api/ai/suggest-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const s = data.suggestion;
      const cat = s.category ? getCategory(s.category) : null;
      aiEls.status.textContent = "";
      aiEls.result.hidden = false;

      if (!cat) {
        aiEls.result.innerHTML = `<div class="ai-result-note">${s.note || "該当するカテゴリを判断できませんでした。カテゴリを直接選んでください。"}</div>`;
        return;
      }

      aiEls.result.innerHTML = `
        <div class="ai-result-cat">${cat.label} がおすすめです</div>
        <div class="ai-result-note">${s.reasoning || ""}${s.note ? "／" + s.note : ""}</div>
        <button type="button" id="ai-apply-btn">このカテゴリを選択する</button>
      `;
      document.getElementById("ai-apply-btn").addEventListener("click", () => {
        selectCategory(cat.id);
        document.getElementById("options-section").scrollIntoView?.({ behavior: "smooth", block: "start" });
      });
    } catch (err) {
      console.warn("おすすめカテゴリの取得に失敗しました:", err);
      aiEls.status.textContent = "";
      aiEls.result.hidden = false;
      aiEls.result.innerHTML = `<div class="ai-result-note">提案の取得に失敗しました。お手数ですが、下記からカテゴリを直接選んでください。</div>`;
    } finally {
      aiEls.btn.disabled = false;
    }
  });
}
