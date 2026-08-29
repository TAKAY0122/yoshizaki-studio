/* ============================================================
   管理者ダッシュボード ロジック
   ============================================================ */

const els = {
  loginView: document.getElementById("login-view"),
  setupView: document.getElementById("setup-view"),
  dashboardView: document.getElementById("dashboard-view"),
  loginForm: document.getElementById("login-form"),
  loginError: document.getElementById("login-error"),
  setupNote: document.getElementById("setup-note"),
  setupLink: document.getElementById("setup-link"),
  setupForm: document.getElementById("setup-form"),
  setupError: document.getElementById("setup-error"),
  whoLabel: document.getElementById("who-label"),
  logoutBtn: document.getElementById("logout-btn"),
  caseTbody: document.getElementById("case-tbody"),
  searchInput: document.getElementById("search-input"),
  modal: document.getElementById("case-modal"),
  modalClose: document.getElementById("modal-close"),
  modalTitle: document.getElementById("modal-title"),
  modalSub: document.getElementById("modal-sub"),
  modalAnswers: document.getElementById("modal-answers"),
  modalEstimateSection: document.getElementById("modal-estimate-section"),
  modalEstimate: document.getElementById("modal-estimate"),
  modalStatus: document.getElementById("modal-status"),
  modalNote: document.getElementById("modal-note"),
  modalSave: document.getElementById("modal-save"),
  modalLogs: document.getElementById("modal-logs"),
};

let state = { status: "", q: "", currentCaseId: null };

const STATUS_LABEL = {
  new: "新規受付",
  hearing: "ヒアリング中",
  quoted: "見積もり提示済み",
  won: "受注",
  lost: "失注",
};

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
  return data;
}

/* ---------------- 画面切り替え ---------------- */
function showLogin() {
  els.loginView.style.display = "flex";
  els.setupView.style.display = "none";
  els.dashboardView.style.display = "none";
}
function showSetup() {
  els.loginView.style.display = "none";
  els.setupView.style.display = "flex";
  els.dashboardView.style.display = "none";
}
function showDashboard(admin) {
  els.loginView.style.display = "none";
  els.setupView.style.display = "none";
  els.dashboardView.style.display = "block";
  els.whoLabel.textContent = admin ? `${admin.name} さん` : "";
}

/* ---------------- 初期化：ログイン状態確認 ---------------- */
async function bootstrap() {
  try {
    const me = await api("/api/admin/me");
    showDashboard(me.admin);
    loadCases();
    return;
  } catch (e) {
    // 未ログイン → 続けて初回セットアップの要否を確認
  }

  try {
    const status = await api("/api/admin/setup-status");
    if (status.needsSetup) {
      showSetup();
      return;
    }
  } catch (e) {
    // 確認自体に失敗した場合のみ、念のためリンクを見えるようにしておく
    showLogin();
    if (els.setupNote) els.setupNote.hidden = false;
    return;
  }

  showLogin();
}

els.setupLink?.addEventListener("click", (e) => {
  e.preventDefault();
  showSetup();
});

els.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.loginError.textContent = "";
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  try {
    const res = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ email, password }) });
    showDashboard({ name: res.name });
    loadCases();
  } catch (err) {
    els.loginError.textContent = err.data?.error || "ログインに失敗しました";
  }
});

els.setupForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.setupError.textContent = "";
  const name = document.getElementById("setup-name").value;
  const email = document.getElementById("setup-email").value;
  const password = document.getElementById("setup-password").value;
  try {
    await api("/api/admin/setup", { method: "POST", body: JSON.stringify({ name, email, password }) });
    const res = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ email, password }) });
    showDashboard({ name: res.name });
    loadCases();
  } catch (err) {
    els.setupError.textContent = err.data?.error || "作成に失敗しました";
  }
});

els.logoutBtn.addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST" });
  showLogin();
});

/* ---------------- 案件一覧 ---------------- */
document.querySelectorAll(".status-filter").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".status-filter").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    state.status = btn.dataset.status;
    loadCases();
  });
});

let searchDebounce;
els.searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    state.q = els.searchInput.value.trim();
    loadCases();
  }, 300);
});

function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function categoryLabel(id) {
  const cfg = typeof HEARING_FORMS !== "undefined" && HEARING_FORMS[id];
  return cfg ? cfg.title.replace("ヒアリングシート", "") : id;
}

async function loadCases() {
  els.caseTbody.innerHTML = `<tr class="empty-row"><td colspan="5">読み込み中…</td></tr>`;
  try {
    const params = new URLSearchParams();
    if (state.status) params.set("status", state.status);
    if (state.q) params.set("q", state.q);
    const res = await api(`/api/admin/cases?${params.toString()}`);
    renderCases(res.cases);
  } catch (e) {
    if (e.status === 401) {
      showLogin();
      return;
    }
    els.caseTbody.innerHTML = `<tr class="empty-row"><td colspan="5">読み込みに失敗しました</td></tr>`;
  }
}

function renderCases(cases) {
  if (!cases.length) {
    els.caseTbody.innerHTML = `<tr class="empty-row"><td colspan="5">該当する案件はありません</td></tr>`;
    return;
  }
  els.caseTbody.innerHTML = cases
    .map(
      (c) => `
    <tr data-id="${c.id}">
      <td>${fmtDateTime(c.created_at)}</td>
      <td>${categoryLabel(c.category)}</td>
      <td>${c.customer_name || "（未入力）"}</td>
      <td>${c.email || ""}</td>
      <td><span class="badge ${c.status}">${STATUS_LABEL[c.status] || c.status}</span></td>
    </tr>`
    )
    .join("");

  els.caseTbody.querySelectorAll("tr[data-id]").forEach((row) => {
    row.addEventListener("click", () => openCase(row.dataset.id));
  });
}

/* ---------------- 案件詳細 ---------------- */
function renderEstimateDetail(est, totalAmount) {
  const cat = (typeof CATEGORIES !== "undefined" ? CATEGORIES : []).find((c) => c.id === est.cat);
  const total = Number(totalAmount || est.total || 0);
  const lines = [];

  if (cat) {
    const plan = cat.plans.find((p) => p.id === est.plan);
    if (plan) lines.push(`${plan.label}（${plan.days}人日 ／ ¥${plan.price.toLocaleString("ja-JP")}）`);

    const commonAddons = typeof COMMON_ADDONS !== "undefined" ? COMMON_ADDONS : [];
    Object.entries(est.addons || {}).forEach(([id, val]) => {
      if (!val) return;
      const addon = cat.addons.find((a) => a.id === id) || commonAddons.find((a) => a.id === id);
      if (!addon) return;
      if (addon.type === "stepper") {
        lines.push(`${addon.label} × ${val}（¥${(addon.price * val).toLocaleString("ja-JP")}）`);
      } else if (addon.type === "multiplier") {
        lines.push(`${addon.label}`);
      } else {
        lines.push(`${addon.label}（¥${addon.price.toLocaleString("ja-JP")}）`);
      }
    });
  }

  const catLabel = cat ? cat.label : est.cat || "";
  const itemsHtml = lines.length
    ? `<ul class="estimate-lines">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`
    : "";

  return `
    <div class="estimate-summary-line"><strong>${catLabel}</strong></div>
    ${itemsHtml}
    <div class="estimate-total-line">概算金額：<strong>¥${total.toLocaleString("ja-JP")}〜</strong></div>
  `;
}

async function openCase(id) {
  try {
    const res = await api(`/api/admin/cases/${id}`);
    state.currentCaseId = id;
    els.modalTitle.textContent = res.case.customer_name || "（未入力）";
    els.modalSub.textContent = `${categoryLabel(res.case.category)} ／ ${res.case.email || ""}`;

    const latestHearing = res.hearings[0];
    const answers = latestHearing ? JSON.parse(latestHearing.answers) : {};
    els.modalAnswers.innerHTML = Object.entries(answers)
      .filter(([, v]) => v)
      .map(([k, v]) => `<dt>${k}</dt><dd>${String(v).replace(/</g, "&lt;")}</dd>`)
      .join("") || "<dt>—</dt><dd>ヒアリング未回答</dd>";

    if (res.estimates.length) {
      els.modalEstimateSection.hidden = false;
      const est = JSON.parse(res.estimates[0].items);
      els.modalEstimate.innerHTML = renderEstimateDetail(est, res.estimates[0].total_amount);
    } else {
      els.modalEstimateSection.hidden = true;
    }

    els.modalStatus.value = res.case.status;
    els.modalNote.value = "";

    els.modalLogs.innerHTML = res.logs.length
      ? res.logs.map((l) => `<li>${fmtDateTime(l.created_at)} — ${STATUS_LABEL[l.status_before] || l.status_before} → ${STATUS_LABEL[l.status_after] || l.status_after}${l.note ? `（${l.note}）` : ""}</li>`).join("")
      : "<li>履歴はまだありません</li>";

    els.modal.classList.add("is-open");
  } catch (e) {
    console.error(e);
  }
}

els.modalClose.addEventListener("click", () => els.modal.classList.remove("is-open"));
els.modal.addEventListener("click", (e) => {
  if (e.target === els.modal) els.modal.classList.remove("is-open");
});

/* ---------------- メール設定 ---------------- */
const emailSettingsModal = document.getElementById("email-settings-modal");
const esCompany = document.getElementById("es-company");
const esName = document.getElementById("es-name");
const esEmail = document.getElementById("es-email");
const esNotice = document.getElementById("es-notice");
const esStatus = document.getElementById("es-status");

document.getElementById("email-settings-btn")?.addEventListener("click", async () => {
  esStatus.textContent = "読み込み中…";
  emailSettingsModal.classList.add("is-open");
  try {
    const res = await api("/api/admin/email-settings");
    esCompany.value = res.settings.signature_company || "";
    esName.value = res.settings.signature_name || "";
    esEmail.value = res.settings.signature_email || "";
    esNotice.value = res.settings.custom_notice || "";
    esStatus.textContent = "";
  } catch (e) {
    esStatus.textContent = "読み込みに失敗しました";
  }
});

document.getElementById("email-settings-close")?.addEventListener("click", () => {
  emailSettingsModal.classList.remove("is-open");
});
emailSettingsModal?.addEventListener("click", (e) => {
  if (e.target === emailSettingsModal) emailSettingsModal.classList.remove("is-open");
});

document.getElementById("email-settings-save")?.addEventListener("click", async () => {
  esStatus.textContent = "保存中…";
  try {
    await api("/api/admin/email-settings", {
      method: "PUT",
      body: JSON.stringify({
        signature_company: esCompany.value,
        signature_name: esName.value,
        signature_email: esEmail.value,
        custom_notice: esNotice.value,
      }),
    });
    esStatus.textContent = "保存しました";
    setTimeout(() => { esStatus.textContent = ""; }, 2000);
  } catch (e) {
    esStatus.textContent = "保存に失敗しました";
  }
});

/* ---------------- 全自動AI対応（フィーチャーフラグ） ---------------- */
const autoPipelineModal = document.getElementById("auto-pipeline-modal");
const apEnabled = document.getElementById("ap-enabled");
const apStatus = document.getElementById("ap-status");

document.getElementById("auto-pipeline-btn")?.addEventListener("click", async () => {
  apStatus.textContent = "読み込み中…";
  autoPipelineModal.classList.add("is-open");
  try {
    const res = await api("/api/admin/auto-pipeline");
    apEnabled.checked = !!res.enabled;
    apStatus.textContent = "";
  } catch (e) {
    apStatus.textContent = "読み込みに失敗しました";
  }
});

document.getElementById("auto-pipeline-close")?.addEventListener("click", () => {
  autoPipelineModal.classList.remove("is-open");
});
autoPipelineModal?.addEventListener("click", (e) => {
  if (e.target === autoPipelineModal) autoPipelineModal.classList.remove("is-open");
});

document.getElementById("auto-pipeline-save")?.addEventListener("click", async () => {
  apStatus.textContent = "保存中…";
  try {
    await api("/api/admin/auto-pipeline", {
      method: "PUT",
      body: JSON.stringify({ enabled: apEnabled.checked }),
    });
    apStatus.textContent = "保存しました";
    setTimeout(() => { apStatus.textContent = ""; }, 2000);
  } catch (e) {
    apStatus.textContent = "保存に失敗しました";
  }
});

/* ---------------- 料金・キャンペーン設定 ---------------- */
const pricingModal = document.getElementById("pricing-settings-modal");

document.getElementById("pricing-settings-btn")?.addEventListener("click", () => {
  pricingModal.classList.add("is-open");
  initPricingSettingsOnce();
  loadRatesTable();
});
document.getElementById("pricing-settings-close")?.addEventListener("click", () => {
  pricingModal.classList.remove("is-open");
});
pricingModal?.addEventListener("click", (e) => {
  if (e.target === pricingModal) pricingModal.classList.remove("is-open");
});

pricingModal?.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    pricingModal.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    pricingModal.querySelectorAll(".tab-panel").forEach((p) => { p.hidden = p.dataset.panel !== btn.dataset.tab; });
    if (btn.dataset.tab === "bundles") loadBundlesList();
    if (btn.dataset.tab === "delivery") loadDeliveryList();
    if (btn.dataset.tab === "campaigns") loadCampaignsList();
  });
});

let pricingSettingsInitialized = false;
function initPricingSettingsOnce() {
  if (pricingSettingsInitialized) return;
  pricingSettingsInitialized = true;

  const categoryOptions = CATEGORIES.map((c) => `<option value="${c.id}">${c.label}</option>`).join("");
  document.getElementById("rates-category").innerHTML = categoryOptions;
  document.getElementById("bundle-category").innerHTML = categoryOptions;
  document.getElementById("campaign-category").innerHTML += categoryOptions;

  document.getElementById("rates-category").addEventListener("change", loadRatesTable);
  document.getElementById("bundle-category").addEventListener("change", populateBundleFormOptions);
  populateBundleFormOptions();
}

/* ---- 基本料金 ---- */
async function loadRatesTable() {
  const catId = document.getElementById("rates-category").value;
  const cat = CATEGORIES.find((c) => c.id === catId);
  if (!cat) return;
  const res = await api("/api/admin/pricing-overrides");
  const overrides = res.overrides || [];
  const findOverride = (type, id) => overrides.find((o) => o.category_id === catId && o.item_type === type && o.item_id === id);

  const rows = [];
  cat.plans.forEach((p) => {
    const o = findOverride("plan", p.id);
    rows.push({ type: "plan", id: p.id, label: p.label, rate: o ? o.rate : p.rate, days: o ? o.days : p.days });
  });
  cat.addons.forEach((a) => {
    const o = findOverride("addon", a.id);
    rows.push({ type: "addon", id: a.id, label: a.label, rate: o ? o.rate : a.rate, days: o ? o.days : a.days });
  });
  if (catId === CATEGORIES[0].id) {
    COMMON_ADDONS.filter((a) => a.type !== "multiplier").forEach((a) => {
      const o = overrides.find((x) => x.item_type === "common_addon" && x.item_id === a.id);
      rows.push({ type: "common_addon", id: a.id, label: `${a.label}（共通）`, rate: o ? o.rate : a.rate, days: o ? o.days : a.days });
    });
  }

  const table = document.getElementById("rates-table");
  table.innerHTML = `
    <tr><th>項目</th><th>人日単価</th><th>人日数</th><th>金額（自動計算）</th></tr>
    ${rows.map((r) => `
      <tr data-type="${r.type}" data-id="${r.id}">
        <td>${r.label}</td>
        <td><input type="number" min="0" class="rate-input" value="${r.rate}" /></td>
        <td><input type="number" min="0" step="0.01" class="days-input" value="${r.days}" /></td>
        <td class="price-cell"></td>
      </tr>`).join("")}
  `;

  const formatYenAdmin = (n) => "¥" + Math.round(n).toLocaleString("ja-JP");
  const updatePriceCell = (tr) => {
    const rate = Number(tr.querySelector(".rate-input").value);
    const days = Number(tr.querySelector(".days-input").value);
    const cell = tr.querySelector(".price-cell");
    cell.textContent = Number.isFinite(rate) && Number.isFinite(days) ? formatYenAdmin(rate * days) : "―";
  };
  table.querySelectorAll("tr[data-type]").forEach((tr) => {
    updatePriceCell(tr);
    tr.querySelectorAll(".rate-input, .days-input").forEach((input) => {
      input.addEventListener("input", () => updatePriceCell(tr));
    });
  });
}

document.getElementById("rates-save")?.addEventListener("click", async () => {
  const catId = document.getElementById("rates-category").value;
  const statusEl = document.getElementById("rates-status");
  const rows = Array.from(document.querySelectorAll("#rates-table tr[data-type]"));

  // 未入力・マイナス値など、保存できない項目がないか先に確認する
  // （サーバー側は不正な値を静かに無視するため、ここで止めないと
  //  「保存できたつもりが実は反映されていない」状態になってしまう）。
  let hasInvalid = false;
  rows.forEach((tr) => {
    const rateInput = tr.querySelector(".rate-input");
    const daysInput = tr.querySelector(".days-input");
    const rate = Number(rateInput.value);
    const days = Number(daysInput.value);
    const rateInvalid = !Number.isFinite(rate) || rate < 0;
    const daysInvalid = !Number.isFinite(days) || days < 0;
    rateInput.classList.toggle("is-invalid", rateInvalid);
    daysInput.classList.toggle("is-invalid", daysInvalid);
    if (rateInvalid || daysInvalid) hasInvalid = true;
  });
  if (hasInvalid) {
    statusEl.textContent = "赤色の欄に0以上の数値を入力してください";
    return;
  }

  const items = rows.map((tr) => ({
    category_id: catId,
    item_type: tr.dataset.type,
    item_id: tr.dataset.id,
    rate: Number(tr.querySelector(".rate-input").value),
    days: Number(tr.querySelector(".days-input").value),
  }));
  statusEl.textContent = "保存中…";
  try {
    await api("/api/admin/pricing-overrides", { method: "PUT", body: JSON.stringify({ items }) });
    statusEl.textContent = "保存しました（見積もりシミュレーターに反映されます）";
    setTimeout(() => { statusEl.textContent = ""; }, 3000);
  } catch (e) {
    statusEl.textContent = "保存に失敗しました。時間をおいて再度お試しください";
  }
});

/* ---- セットプラン ---- */
function populateBundleFormOptions() {
  const catId = document.getElementById("bundle-category").value || CATEGORIES[0].id;
  const cat = CATEGORIES.find((c) => c.id === catId);
  if (!cat) return;
  document.getElementById("bundle-plan").innerHTML = cat.plans.map((p) => `<option value="${p.id}">${p.label}</option>`).join("");
  document.getElementById("bundle-addons").innerHTML = cat.addons.map((a) =>
    `<label><input type="checkbox" value="${a.id}" /> ${a.label}</label>`
  ).join("");
}

async function loadBundlesList() {
  const res = await api("/api/admin/bundles");
  const list = document.getElementById("bundles-list");
  if (!res.bundles.length) {
    list.innerHTML = `<p class="who">まだセットプランがありません</p>`;
    return;
  }
  list.innerHTML = res.bundles.map((b) => {
    const cat = CATEGORIES.find((c) => c.id === b.category_id);
    return `
    <div class="settings-row" data-id="${b.id}">
      <div class="settings-row-main">
        <strong>${cat ? cat.tag + " " : ""}${b.label}</strong>
        <span>${b.discount_type === "fixed" ? `¥${b.discount_value.toLocaleString("ja-JP")}引き` : `${b.discount_value}%OFF`} ／ ${b.description || ""}</span>
      </div>
      <div class="settings-row-actions">
        <button type="button" class="toggle-active is-active-toggle ${b.active ? "is-on" : ""}">${b.active ? "有効" : "無効"}</button>
        <button type="button" class="delete-btn is-danger">削除</button>
      </div>
    </div>`;
  }).join("");

  list.querySelectorAll(".toggle-active").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const row = e.target.closest("[data-id]");
      const id = row.dataset.id;
      const bundle = res.bundles.find((b) => b.id === id);
      await api(`/api/admin/bundles/${id}`, { method: "PUT", body: JSON.stringify({ ...bundle, active: !bundle.active }) });
      loadBundlesList();
    });
  });
  list.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.closest("[data-id]").dataset.id;
      if (!confirm("このセットプランを削除しますか？")) return;
      await api(`/api/admin/bundles/${id}`, { method: "DELETE" });
      loadBundlesList();
    });
  });
}

document.getElementById("bundle-add")?.addEventListener("click", async () => {
  const statusEl = document.getElementById("bundle-status");
  const label = document.getElementById("bundle-label").value.trim();
  if (!label) { statusEl.textContent = "セット名を入力してください"; return; }
  const addonIds = Array.from(document.querySelectorAll("#bundle-addons input:checked")).map((el) => el.value);
  statusEl.textContent = "追加中…";
  try {
    await api("/api/admin/bundles", {
      method: "POST",
      body: JSON.stringify({
        category_id: document.getElementById("bundle-category").value,
        plan_id: document.getElementById("bundle-plan").value,
        addon_ids: addonIds,
        label,
        description: document.getElementById("bundle-desc").value.trim(),
        discount_type: document.getElementById("bundle-discount-type").value,
        discount_value: Number(document.getElementById("bundle-discount-value").value) || 0,
        audience_tag: document.getElementById("bundle-audience").value.trim(),
        featured: document.getElementById("bundle-featured").checked,
        active: true,
      }),
    });
    document.getElementById("bundle-label").value = "";
    document.getElementById("bundle-desc").value = "";
    document.getElementById("bundle-discount-value").value = "";
    document.getElementById("bundle-audience").value = "";
    document.getElementById("bundle-featured").checked = false;
    statusEl.textContent = "追加しました";
    setTimeout(() => { statusEl.textContent = ""; }, 2000);
    loadBundlesList();
  } catch (e) {
    statusEl.textContent = "追加に失敗しました";
  }
});

/* ---- 納品スケジュール ---- */
async function loadDeliveryList() {
  const res = await api("/api/admin/delivery-options");
  const list = document.getElementById("delivery-list");
  if (!res.options.length) {
    list.innerHTML = `<p class="who">まだ納品スケジュールがありません（未設定の場合、通常料金のみで算出されます）</p>`;
    return;
  }
  list.innerHTML = res.options.map((d) => `
    <div class="settings-row" data-id="${d.id}">
      <div class="settings-row-main">
        <strong>${d.label}${d.is_default ? "（標準）" : ""}</strong>
        <span>倍率 × ${d.multiplier} ／ ${d.description || ""}</span>
      </div>
      <div class="settings-row-actions">
        <button type="button" class="toggle-active is-active-toggle ${d.active ? "is-on" : ""}">${d.active ? "有効" : "無効"}</button>
        <button type="button" class="delete-btn is-danger">削除</button>
      </div>
    </div>`).join("");

  list.querySelectorAll(".toggle-active").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.closest("[data-id]").dataset.id;
      const d = res.options.find((x) => x.id === id);
      await api(`/api/admin/delivery-options/${id}`, { method: "PUT", body: JSON.stringify({ ...d, active: !d.active }) });
      loadDeliveryList();
    });
  });
  list.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.closest("[data-id]").dataset.id;
      if (!confirm("この納品スケジュールを削除しますか？")) return;
      await api(`/api/admin/delivery-options/${id}`, { method: "DELETE" });
      loadDeliveryList();
    });
  });
}

document.getElementById("delivery-add")?.addEventListener("click", async () => {
  const statusEl = document.getElementById("delivery-status");
  const label = document.getElementById("delivery-label").value.trim();
  if (!label) { statusEl.textContent = "名称を入力してください"; return; }
  statusEl.textContent = "追加中…";
  try {
    await api("/api/admin/delivery-options", {
      method: "POST",
      body: JSON.stringify({
        label,
        description: document.getElementById("delivery-desc").value.trim(),
        multiplier: Number(document.getElementById("delivery-multiplier").value) || 1,
        is_default: document.getElementById("delivery-is-default").checked,
        active: true,
      }),
    });
    document.getElementById("delivery-label").value = "";
    document.getElementById("delivery-desc").value = "";
    document.getElementById("delivery-multiplier").value = "";
    document.getElementById("delivery-is-default").checked = false;
    statusEl.textContent = "追加しました";
    setTimeout(() => { statusEl.textContent = ""; }, 2000);
    loadDeliveryList();
  } catch (e) {
    statusEl.textContent = "追加に失敗しました";
  }
});

/* ---- キャンペーン ---- */
async function loadCampaignsList() {
  const res = await api("/api/admin/campaigns");
  const list = document.getElementById("campaigns-list");
  if (!res.campaigns.length) {
    list.innerHTML = `<p class="who">まだキャンペーンがありません</p>`;
    return;
  }
  list.innerHTML = res.campaigns.map((cp) => {
    const cat = CATEGORIES.find((c) => c.id === cp.category_id);
    const period = [cp.start_date, cp.end_date].filter(Boolean).join(" 〜 ") || "期間指定なし";
    return `
    <div class="settings-row" data-id="${cp.id}">
      <div class="settings-row-main">
        <strong>${cp.label}</strong>
        <span>${cp.discount_type === "fixed" ? `¥${cp.discount_value.toLocaleString("ja-JP")}引き` : `${cp.discount_value}%OFF`} ／ ${cat ? cat.label : "全カテゴリ"} ／ ${period}</span>
      </div>
      <div class="settings-row-actions">
        <button type="button" class="toggle-active is-active-toggle ${cp.active ? "is-on" : ""}">${cp.active ? "有効中" : "無効"}</button>
        <button type="button" class="delete-btn is-danger">削除</button>
      </div>
    </div>`;
  }).join("");

  list.querySelectorAll(".toggle-active").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.closest("[data-id]").dataset.id;
      const cp = res.campaigns.find((x) => x.id === id);
      await api(`/api/admin/campaigns/${id}`, { method: "PUT", body: JSON.stringify({ ...cp, active: !cp.active }) });
      loadCampaignsList();
    });
  });
  list.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.closest("[data-id]").dataset.id;
      if (!confirm("このキャンペーンを削除しますか？")) return;
      await api(`/api/admin/campaigns/${id}`, { method: "DELETE" });
      loadCampaignsList();
    });
  });
}

document.getElementById("campaign-add")?.addEventListener("click", async () => {
  const statusEl = document.getElementById("campaign-status");
  const label = document.getElementById("campaign-label").value.trim();
  if (!label) { statusEl.textContent = "キャンペーン名を入力してください"; return; }
  statusEl.textContent = "追加中…";
  try {
    await api("/api/admin/campaigns", {
      method: "POST",
      body: JSON.stringify({
        label,
        banner_text: document.getElementById("campaign-banner-text").value.trim(),
        discount_type: document.getElementById("campaign-discount-type").value,
        discount_value: Number(document.getElementById("campaign-discount-value").value) || 0,
        category_id: document.getElementById("campaign-category").value || null,
        start_date: document.getElementById("campaign-start").value || null,
        end_date: document.getElementById("campaign-end").value || null,
        active: document.getElementById("campaign-active").checked,
      }),
    });
    document.getElementById("campaign-label").value = "";
    document.getElementById("campaign-banner-text").value = "";
    document.getElementById("campaign-discount-value").value = "";
    document.getElementById("campaign-start").value = "";
    document.getElementById("campaign-end").value = "";
    document.getElementById("campaign-active").checked = false;
    statusEl.textContent = "追加しました";
    setTimeout(() => { statusEl.textContent = ""; }, 2000);
    loadCampaignsList();
  } catch (e) {
    statusEl.textContent = "追加に失敗しました";
  }
});

els.modalSave.addEventListener("click", async () => {
  if (!state.currentCaseId) return;
  try {
    await api(`/api/admin/cases/${state.currentCaseId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: els.modalStatus.value, note: els.modalNote.value || undefined }),
    });
    els.modal.classList.remove("is-open");
    loadCases();
  } catch (e) {
    alert("保存に失敗しました: " + (e.data?.error || e.message));
  }
});

document.getElementById("modal-open-proposal")?.addEventListener("click", () => {
  if (!state.currentCaseId) return;
  window.open(`/admin/proposal.html?caseId=${encodeURIComponent(state.currentCaseId)}`, "_blank");
});

document.getElementById("modal-open-requirements")?.addEventListener("click", () => {
  if (!state.currentCaseId) return;
  window.open(`/admin/requirements.html?caseId=${encodeURIComponent(state.currentCaseId)}`, "_blank");
});

document.getElementById("modal-open-spec")?.addEventListener("click", () => {
  if (!state.currentCaseId) return;
  window.open(`/admin/spec.html?caseId=${encodeURIComponent(state.currentCaseId)}`, "_blank");
});

document.getElementById("modal-open-timeline")?.addEventListener("click", () => {
  if (!state.currentCaseId) return;
  window.open(`/admin/case-timeline.html?caseId=${encodeURIComponent(state.currentCaseId)}`, "_blank");
});

document.getElementById("modal-send-formal-quote")?.addEventListener("click", async () => {
  if (!state.currentCaseId) return;
  const statusEl = document.getElementById("modal-doc-status");
  const btn = document.getElementById("modal-send-formal-quote");
  if (!confirm("この案件の正式な見積書をお客様にメール送信します。よろしいですか？")) return;
  btn.disabled = true;
  statusEl.textContent = "送信中…";
  try {
    const res = await api(`/api/admin/cases/${state.currentCaseId}/send-formal-quote`, { method: "POST" });
    statusEl.textContent = `${res.email} 宛に正式な見積書を送付しました`;
    loadCases();
  } catch (e) {
    statusEl.textContent = "送信に失敗しました: " + (e.data?.error || e.message);
  } finally {
    btn.disabled = false;
  }
});

bootstrap();
