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
  const cfg = window.HEARING_FORMS && HEARING_FORMS[id];
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
      els.modalEstimate.innerHTML = `<div>概算金額：<strong>¥${Number(res.estimates[0].total_amount).toLocaleString("ja-JP")}〜</strong></div>`;
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

bootstrap();
