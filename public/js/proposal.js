/* ============================================================
   提案依頼書 ロジック
   管理者ダッシュボードと同じセッションCookieを利用して
   /api/admin/cases/:id から案件データを取得し、整形表示する。
   ============================================================ */

function formatYen(n) {
  return "¥" + Math.round(Number(n) || 0).toLocaleString("ja-JP");
}

function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function categoryLabel(id) {
  const cfg = typeof HEARING_FORMS !== "undefined" && HEARING_FORMS[id];
  return cfg ? cfg.title.replace("ヒアリングシート", "") : id;
}

function fieldLabel(category, fieldId) {
  const cfg = typeof HEARING_FORMS !== "undefined" && HEARING_FORMS[category];
  if (!cfg) return fieldId;
  for (const sec of cfg.sections) {
    const f = sec.fields.find((x) => x.id === fieldId);
    if (f) return f.label;
  }
  return fieldId;
}

function renderHearingAnswers(category, answers) {
  const cfg = typeof HEARING_FORMS !== "undefined" && HEARING_FORMS[category];
  if (!cfg) {
    return `<div class="hearing-qa"><div class="hearing-a">${escapeHtml(JSON.stringify(answers))}</div></div>`;
  }
  return cfg.sections
    .map((sec) => {
      const rows = sec.fields
        .map((f) => {
          const val = (answers || {})[f.id];
          const hasVal = val !== undefined && val !== null && String(val).trim() !== "";
          return `
          <div class="hearing-qa">
            <div class="hearing-q">${escapeHtml(f.label)}</div>
            <div class="hearing-a ${hasVal ? "" : "is-empty"}">${hasVal ? escapeHtml(String(val)) : "（未回答）"}</div>
          </div>`;
        })
        .join("");
      return `<div class="hearing-section"><h3>${escapeHtml(sec.title)}</h3>${rows}</div>`;
    })
    .join("");
}

function renderEstimateContent(est, totalAmount) {
  const cat = (typeof CATEGORIES !== "undefined" ? CATEGORIES : []).find((c) => c.id === est.cat);
  const total = Number(totalAmount || est.total || 0);
  const lines = [];

  if (cat) {
    const plan = cat.plans.find((p) => p.id === est.plan);
    if (plan) lines.push(`${plan.label}（${plan.days}人日 ／ ${formatYen(plan.price)}）`);
    const commonAddons = typeof COMMON_ADDONS !== "undefined" ? COMMON_ADDONS : [];
    Object.entries(est.addons || {}).forEach(([id, val]) => {
      if (!val) return;
      const addon = cat.addons.find((a) => a.id === id) || commonAddons.find((a) => a.id === id);
      if (!addon) return;
      if (addon.type === "stepper") lines.push(`${addon.label} × ${val}（${formatYen(addon.price * val)}）`);
      else if (addon.type === "multiplier") lines.push(`${addon.label}`);
      else lines.push(`${addon.label}（${formatYen(addon.price)}）`);
    });
  }

  const catLabel = cat ? cat.label : est.cat || "";
  const itemsHtml = lines.length ? `<ul class="estimate-lines">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>` : "";
  return `
    <div class="estimate-summary-line">${escapeHtml(catLabel)}</div>
    ${itemsHtml}
    <div class="estimate-total-line">概算金額：${formatYen(total)}〜</div>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function showError(message) {
  document.getElementById("sheet").hidden = true;
  const box = document.getElementById("error-box");
  box.hidden = false;
  document.getElementById("error-message").textContent = message;
}

async function init() {
  const caseId = new URLSearchParams(location.search).get("caseId");
  if (!caseId) {
    showError("受付番号（caseId）が指定されていません。");
    return;
  }

  let res;
  try {
    res = await fetch(`/api/admin/cases/${encodeURIComponent(caseId)}`);
  } catch (e) {
    showError("通信エラーが発生しました。時間をおいて再度お試しください。");
    return;
  }

  if (res.status === 401) {
    showError("この資料の閲覧には管理者ログインが必要です。/admin からログインしてください。");
    return;
  }
  if (!res.ok) {
    showError("案件情報の取得に失敗しました。受付番号をご確認ください。");
    return;
  }

  const data = await res.json();
  const c = data.case;

  document.getElementById("sheet").hidden = false;
  document.getElementById("case-id").textContent = c.id;
  document.getElementById("issue-date").textContent = fmtDateTime(new Date().toISOString());
  document.getElementById("category-label").textContent = categoryLabel(c.category);

  document.getElementById("customer-info").innerHTML = `
    <dt>会社名</dt><dd>${escapeHtml(c.company || "―")}</dd>
    <dt>ご担当者名</dt><dd>${escapeHtml(c.customer_name || "―")}</dd>
    <dt>メールアドレス</dt><dd>${escapeHtml(c.email || "―")}</dd>
    <dt>電話番号</dt><dd>${escapeHtml(c.tel || "―")}</dd>
    <dt>受付日</dt><dd>${fmtDateTime(c.created_at)}</dd>
  `;

  if (data.estimates && data.estimates.length) {
    document.getElementById("estimate-block").hidden = false;
    const est = JSON.parse(data.estimates[0].items);
    document.getElementById("estimate-content").innerHTML = renderEstimateContent(est, data.estimates[0].total_amount);
  }

  if (data.hearings && data.hearings.length) {
    const latest = data.hearings[0];
    const answers = JSON.parse(latest.answers);
    document.getElementById("hearing-content").innerHTML = renderHearingAnswers(latest.category, answers);
  } else {
    document.getElementById("hearing-content").innerHTML = `<p style="color:var(--ink-faint);">まだヒアリング回答がありません。</p>`;
  }
}

document.getElementById("print-btn").addEventListener("click", () => window.print());
document.addEventListener("DOMContentLoaded", init);
