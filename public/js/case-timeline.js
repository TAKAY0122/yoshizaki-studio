/* ============================================================
   やり取りタイムライン ロジック
   管理者ダッシュボードと同じセッションCookieを利用し、
   /api/admin/cases/:id/events から案件の全イベントを取得して表示する。
   ============================================================ */

const els = {
  authGate: document.getElementById("auth-gate"),
  timelineView: document.getElementById("timeline-view"),
  errorView: document.getElementById("error-view"),
  errorMessage: document.getElementById("error-message"),
  whoLabel: document.getElementById("who-label"),
  logoutBtn: document.getElementById("logout-btn"),
  caseIdLabel: document.getElementById("case-id-label"),
  timelineList: document.getElementById("timeline-list"),
  timelineEmpty: document.getElementById("timeline-empty"),
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

function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const EVENT_BADGE = {
  outbound_email: { cls: "out", label: "送信メール" },
  inbound_email: { cls: "in", label: "受信メール" },
  ai_stage: { cls: "ai", label: "AI判定" },
  auto_status_change: { cls: "status", label: "自動ステータス変更" },
};

function renderEvent(ev) {
  const badge = EVENT_BADGE[ev.eventType] || { cls: "status", label: ev.eventType };
  const payloadHtml = ev.payload
    ? `<details class="timeline-payload"><summary>詳細を表示</summary><pre>${escapeHtml(JSON.stringify(ev.payload, null, 2))}</pre></details>`
    : "";
  return `
    <div class="timeline-item">
      <div class="timeline-head">
        <span class="timeline-badge ${badge.cls}">${escapeHtml(badge.label)}</span>
        <span class="timeline-time">${fmtDateTime(ev.createdAt)}</span>
      </div>
      ${ev.subject ? `<div class="timeline-subject">${escapeHtml(ev.subject)}</div>` : ""}
      ${ev.summary ? `<div class="timeline-summary">${escapeHtml(ev.summary)}</div>` : ""}
      ${payloadHtml}
    </div>
  `;
}

function getCaseId() {
  return new URLSearchParams(location.search).get("caseId");
}

async function loadTimeline(caseId) {
  const data = await api(`/api/admin/cases/${encodeURIComponent(caseId)}/events`);
  if (!data.events || !data.events.length) {
    els.timelineEmpty.style.display = "block";
    els.timelineList.innerHTML = "";
    return;
  }
  els.timelineEmpty.style.display = "none";
  els.timelineList.innerHTML = data.events.map(renderEvent).join("");
}

els.logoutBtn.addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST" }).catch(() => {});
  location.href = "/admin/admin.html";
});

async function init() {
  const caseId = getCaseId();
  if (!caseId) {
    els.authGate.style.display = "none";
    els.errorView.style.display = "flex";
    els.errorMessage.textContent = "受付番号（caseId）が指定されていません。";
    return;
  }

  try {
    const me = await api("/api/admin/me");
    els.whoLabel.textContent = me.admin ? `${me.admin.name} さん` : "";
  } catch (e) {
    location.replace("/admin/admin.html");
    return;
  }

  els.authGate.style.display = "none";
  els.caseIdLabel.textContent = caseId;

  try {
    await loadTimeline(caseId);
    els.timelineView.style.display = "block";
  } catch (e) {
    els.errorView.style.display = "flex";
    els.errorMessage.textContent = e.status === 404 ? "案件が見つかりません。" : "データの取得に失敗しました。時間をおいて再度お試しください。";
  }
}

document.addEventListener("DOMContentLoaded", init);
