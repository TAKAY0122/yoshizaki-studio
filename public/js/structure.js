/* ============================================================
   アプリ構造ビューアー ロジック
   表示内容は public/js/structure-data.js の静的データを描画するのみ。
   管理者ダッシュボードと同じセッションCookieで認証確認する。
   ============================================================ */

const els = {
  authGate: document.getElementById("auth-gate"),
  structureView: document.getElementById("structure-view"),
  errorView: document.getElementById("error-view"),
  errorMessage: document.getElementById("error-message"),
  whoLabel: document.getElementById("who-label"),
  logoutBtn: document.getElementById("logout-btn"),
  overviewList: document.getElementById("overview-list"),
  pagesTbody: document.getElementById("pages-tbody"),
  apiTbody: document.getElementById("api-tbody"),
  dbTbody: document.getElementById("db-tbody"),
  flowList: document.getElementById("flow-list"),
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

els.logoutBtn.addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST" }).catch(() => {});
  location.href = "/admin.html";
});

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    document.querySelectorAll(".tab-panel").forEach((p) => { p.hidden = p.dataset.panel !== btn.dataset.tab; });
  });
});

function renderStructure() {
  els.overviewList.innerHTML = APP_STRUCTURE.overview
    .map((o) => `<div class="structure-item"><strong>${escapeHtml(o.label)}</strong>${escapeHtml(o.value)}</div>`)
    .join("");

  els.pagesTbody.innerHTML = APP_STRUCTURE.pages
    .map((p) => `
      <tr>
        <td><code>${escapeHtml(p.file)}</code></td>
        <td>${escapeHtml(p.routes)}</td>
        <td>${escapeHtml(p.auth)}</td>
        <td>${escapeHtml(p.role)}</td>
      </tr>`)
    .join("");

  els.apiTbody.innerHTML = APP_STRUCTURE.apiRoutes
    .map((r) => `
      <tr>
        <td><code>${escapeHtml(r.method)}</code></td>
        <td><code>${escapeHtml(r.path)}</code></td>
        <td>${escapeHtml(r.auth)}</td>
        <td>${escapeHtml(r.purpose)}</td>
      </tr>`)
    .join("");

  els.dbTbody.innerHTML = APP_STRUCTURE.dbTables
    .map((t) => `
      <tr>
        <td><code>${escapeHtml(t.name)}</code></td>
        <td>${escapeHtml(t.role)}</td>
      </tr>`)
    .join("");

  els.flowList.innerHTML = APP_STRUCTURE.userFlow
    .map((step) => `<li>${escapeHtml(step)}</li>`)
    .join("");
}

async function init() {
  try {
    const me = await api("/api/admin/me");
    els.whoLabel.textContent = me.admin ? `${me.admin.name} さん` : "";
  } catch (e) {
    location.replace("/admin.html");
    return;
  }

  els.authGate.style.display = "none";
  els.structureView.style.display = "block";

  try {
    renderStructure();
  } catch (e) {
    els.structureView.style.display = "none";
    els.errorView.style.display = "flex";
    els.errorMessage.textContent = "表示に失敗しました。";
  }
}

document.addEventListener("DOMContentLoaded", init);
