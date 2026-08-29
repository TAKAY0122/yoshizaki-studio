/* ============================================================
   要件定義書・仕様書（下書き）閲覧・生成ロジック
   requirements.html / spec.html の両方から共通で使う
   （body の data-doc-type 属性で対象を切り替える）。
   管理者ダッシュボードと同じセッションCookieを利用する。
   ============================================================ */

const docType = document.body.dataset.docType;
const docTitle = document.body.dataset.docTitle;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function getCaseId() {
  return new URLSearchParams(location.search).get("caseId");
}

function showError(message) {
  document.getElementById("sheet").hidden = true;
  document.getElementById("empty-box").hidden = true;
  const box = document.getElementById("error-box");
  box.hidden = false;
  document.getElementById("error-message").textContent = message;
}

function showEmpty() {
  document.getElementById("sheet").hidden = true;
  document.getElementById("error-box").hidden = true;
  document.getElementById("empty-box").hidden = false;
}

function renderDocument(doc) {
  document.getElementById("empty-box").hidden = true;
  document.getElementById("error-box").hidden = true;
  document.getElementById("sheet").hidden = false;

  document.getElementById("case-id").textContent = getCaseId() || "";
  document.getElementById("issue-date").textContent = fmtDateTime(doc.createdAt);
  document.getElementById("doc-version").textContent = `v${doc.version}`;

  document.getElementById("sections-content").innerHTML = doc.sections
    .map(
      (s) => `
        <div class="hearing-section">
          <h3>${escapeHtml(s.heading)}</h3>
          <p>${escapeHtml(s.body).replace(/\n/g, "<br />")}</p>
        </div>`
    )
    .join("");
}

async function fetchDocument(caseId) {
  const res = await fetch(`/api/admin/cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(docType)}`);
  if (res.status === 401) {
    showError("この資料の閲覧には管理者ログインが必要です。/admin からログインしてください。");
    return;
  }
  if (res.status === 404) {
    showEmpty();
    return;
  }
  if (!res.ok) {
    showError("資料の取得に失敗しました。");
    return;
  }
  const data = await res.json();
  renderDocument(data.document);
}

async function generateDocument(caseId) {
  const btn = document.getElementById("generate-btn");
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "生成中…";
  try {
    const res = await fetch(`/api/admin/cases/${encodeURIComponent(caseId)}/documents/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docType }),
    });
    if (res.status === 401) {
      showError("この操作には管理者ログインが必要です。/admin からログインしてください。");
      return;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      showError(data?.error || `${docTitle}の生成に失敗しました。時間をおいて再度お試しください。`);
      return;
    }
    renderDocument(data.document);
  } catch (e) {
    showError("通信エラーが発生しました。時間をおいて再度お試しください。");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function init() {
  const caseId = getCaseId();
  if (!caseId) {
    showError("受付番号（caseId）が指定されていません。");
    return;
  }
  await fetchDocument(caseId);
}

document.getElementById("print-btn").addEventListener("click", () => window.print());
document.getElementById("generate-btn").addEventListener("click", () => {
  const caseId = getCaseId();
  if (caseId) generateDocument(caseId);
});
document.addEventListener("DOMContentLoaded", init);
