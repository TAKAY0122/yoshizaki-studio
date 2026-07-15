/* ============================================================
   見積もりシミュレーター ロジック
   ============================================================ */

const state = {
  categoryId: null,
  planId: null,
  addons: {}, // id -> qty(number) or boolean
};

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
  summaryToggle: document.getElementById("summary-toggle"),
};

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

/* ---------------- カテゴリ選択 ---------------- */
function renderCategoryGrid() {
  els.categoryGrid.innerHTML = CATEGORIES.map(
    (cat) => `
    <button type="button" class="cat-card ${state.categoryId === cat.id ? "is-selected" : ""}" data-cat="${cat.id}" aria-pressed="${state.categoryId === cat.id}">
      <span class="icon-badge" style="background:${cat.badge}">${cat.emoji}</span>
      <h3>${cat.label}</h3>
    </button>
  `
  ).join("");

  els.categoryGrid.querySelectorAll(".cat-card").forEach((btn) => {
    btn.addEventListener("click", () => selectCategory(btn.dataset.cat));
  });
}

function selectCategory(id) {
  if (state.categoryId !== id) {
    state.categoryId = id;
    state.planId = null;
    state.addons = {};
  }
  renderCategoryGrid();
  renderOptions();
  els.optionsSection.hidden = false;
  setStep(2);
  els.optionsSection.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

/* ---------------- 仕様選択 ---------------- */
function renderOptions() {
  const cat = getCategory(state.categoryId);
  if (!cat) return;

  const planHtml = `
    <div class="opt-group">
      <h4>📋 ベースプラン<span class="req">必須</span></h4>
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
      <h4>➕ オプション</h4>
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
      <h4>🔁 継続費用（任意・目安）</h4>
      <div class="opt-list">
        ${cat.recurring.map((r) => `<div class="opt-row opt-row--static"><span class="opt-label">${r.label}</span><span class="opt-price">${formatYen(r.price)} / ${r.unit}</span></div>`).join("")}
      </div>
    </div>`
    : "";

  const commonHtml = `
    <div class="opt-group">
      <h4>🎁 共通オプション</h4>
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

  els.optionsInner.innerHTML = planHtml + addonHtml + commonHtml + recurringHtml;

  els.optionsInner.querySelectorAll('input[name="plan"]').forEach((el) => {
    el.addEventListener("change", (e) => {
      state.planId = e.target.value;
      updateSummary();
    });
  });
  els.optionsInner.querySelectorAll('input[data-addon][data-type="checkbox"], input[data-addon][data-type="multiplier"]').forEach((el) => {
    el.addEventListener("change", (e) => {
      state.addons[e.target.dataset.addon] = e.target.checked;
      updateSummary();
    });
  });
  els.optionsInner.querySelectorAll("[data-stepper-inc]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.stepperInc;
      state.addons[id] = (state.addons[id] || 0) + 1;
      document.getElementById(`stepper-${id}`).textContent = state.addons[id];
      updateSummary();
    });
  });
  els.optionsInner.querySelectorAll("[data-stepper-dec]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.stepperDec;
      state.addons[id] = Math.max(0, (state.addons[id] || 0) - 1);
      document.getElementById(`stepper-${id}`).textContent = state.addons[id];
      updateSummary();
    });
  });

  updateSummary();
}

/* ---------------- 集計 ---------------- */
function computeTotal() {
  const cat = getCategory(state.categoryId);
  if (!cat) return { total: 0, breakdown: [], recurringTotal: 0 };

  const breakdown = [];
  let total = 0;

  const plan = cat.plans.find((p) => p.id === state.planId);
  if (plan) {
    total += plan.price;
    breakdown.push({ label: plan.label, price: plan.price, days: plan.days });
  }

  cat.addons.forEach((a) => {
    if (a.type === "checkbox" && state.addons[a.id]) {
      total += a.price;
      breakdown.push({ label: a.label, price: a.price, days: a.days });
    } else if (a.type === "stepper" && state.addons[a.id]) {
      const qty = state.addons[a.id];
      const sub = qty * a.price;
      total += sub;
      breakdown.push({ label: `${a.label} × ${qty}`, price: sub, days: a.days * qty });
    }
  });

  COMMON_ADDONS.forEach((a) => {
    if (a.type === "checkbox" && state.addons[a.id]) {
      total += a.price;
      breakdown.push({ label: a.label, price: a.price, days: a.days });
    }
  });

  const rush = COMMON_ADDONS.find((a) => a.type === "multiplier");
  if (rush && state.addons[rush.id]) {
    const before = total;
    total = Math.round(total * rush.value);
    breakdown.push({ label: rush.label, price: total - before });
  }

  const recurringTotal = cat.recurring.reduce((sum, r) => sum + r.price, 0);

  return { total, breakdown, recurringTotal };
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

  els.summary.classList.remove("is-collapsed");
  const code = encodeEstimate();
  els.codeValue.textContent = code;
  els.codeResult.hidden = false;
  setStep(3);
  const cat = getCategory(state.categoryId);
  els.hearingLink.href = `${cat.hearingUrl}?code=${encodeURIComponent(code)}`;
  els.hearingLink.textContent = `${cat.label} のヒアリングシートへ進む →`;
  if (els.quoteLink) els.quoteLink.href = `/quote.html?code=${encodeURIComponent(code)}`;
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
    statusEl.className = "send-status is-success";
    statusEl.textContent = `${email} 宛に見積書をお送りしました。ご確認ください。`;
  } catch (err) {
    statusEl.className = "send-status is-error";
    statusEl.textContent = `メール送信に失敗しました（${err.message}）。お手数ですが下記リンクから見積書をご確認ください。`;
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
        <div class="ai-result-cat">${cat.emoji} ${cat.label} がおすすめです</div>
        <div class="ai-result-note">${s.reasoning || ""}${s.note ? "／" + s.note : ""}</div>
        <button type="button" id="ai-apply-btn">このカテゴリを選択する</button>
      `;
      document.getElementById("ai-apply-btn").addEventListener("click", () => {
        selectCategory(cat.id);
        document.getElementById("options-section").scrollIntoView?.({ behavior: "smooth", block: "start" });
      });
    } catch (err) {
      aiEls.status.textContent = "";
      aiEls.result.hidden = false;
      aiEls.result.innerHTML = `<div class="ai-result-note">提案の取得に失敗しました（${err.message}）。カテゴリを直接選んでください。</div>`;
    } finally {
      aiEls.btn.disabled = false;
    }
  });
}
