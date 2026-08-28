/* ============================================================
   経営ダッシュボード ロジック
   管理者ダッシュボード（admin.html）と同じセッションCookieを利用し、
   既存の /api/admin/* エンドポイントから取得したデータをブラウザ側で
   集計・表示するのみ（新規APIやDBスキーマの変更は行っていない）。
   ============================================================ */

const els = {
  authGate: document.getElementById("auth-gate"),
  dashboardView: document.getElementById("dashboard-view"),
  errorView: document.getElementById("error-view"),
  errorMessage: document.getElementById("error-message"),
  whoLabel: document.getElementById("who-label"),
  logoutBtn: document.getElementById("logout-btn"),
  statusStats: document.getElementById("status-stats"),
  revenueStats: document.getElementById("revenue-stats"),
  categoryTbody: document.getElementById("category-tbody"),
  pricingStats: document.getElementById("pricing-stats"),
};

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

function categoryLabel(id) {
  const cfg = typeof HEARING_FORMS !== "undefined" && HEARING_FORMS[id];
  return cfg ? cfg.title.replace("ヒアリングシート", "") : id;
}

function formatYen(n) {
  return "¥" + Math.round(Number(n) || 0).toLocaleString("ja-JP");
}

function statCard(label, value, note) {
  return `
    <div class="stat-card">
      <div class="stat-value">${value}</div>
      <div class="stat-label">${label}</div>
      ${note ? `<div class="stat-note">${note}</div>` : ""}
    </div>`;
}

els.logoutBtn.addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST" }).catch(() => {});
  location.href = "/admin.html";
});

function renderStatusStats(cases) {
  const counts = { new: 0, hearing: 0, quoted: 0, won: 0, lost: 0 };
  cases.forEach((c) => { if (counts[c.status] !== undefined) counts[c.status]++; });
  const closed = counts.won + counts.lost;
  const winRate = closed ? Math.round((counts.won / closed) * 100) : null;

  els.statusStats.innerHTML = [
    statCard("集計対象件数", cases.length, cases.length >= 200 ? "直近200件まで" : ""),
    statCard(STATUS_LABEL.new, counts.new),
    statCard(STATUS_LABEL.hearing, counts.hearing),
    statCard(STATUS_LABEL.quoted, counts.quoted),
    statCard(STATUS_LABEL.won, counts.won),
    statCard(STATUS_LABEL.lost, counts.lost),
    statCard("受注率", winRate !== null ? `${winRate}%` : "―", "受注／(受注+失注)"),
  ].join("");
}

function renderRevenueStats(cases) {
  const amounts = cases.map((c) => Number(c.estimate_total) || 0).filter((n) => n > 0);
  const wonAmounts = cases.filter((c) => c.status === "won").map((c) => Number(c.estimate_total) || 0);
  const sumAll = amounts.reduce((a, b) => a + b, 0);
  const sumWon = wonAmounts.reduce((a, b) => a + b, 0);
  const avg = amounts.length ? Math.round(sumAll / amounts.length) : 0;

  const now = Date.now();
  const recent30 = cases.filter((c) => {
    const iso = (c.created_at || "").replace(" ", "T");
    const t = new Date(iso.endsWith("Z") ? iso : iso + "Z").getTime();
    return Number.isFinite(t) && now - t <= 30 * 24 * 60 * 60 * 1000;
  }).length;

  els.revenueStats.innerHTML = [
    statCard("見積もり合計金額", formatYen(sumAll), "全ステータスの概算合計"),
    statCard("受注済み合計金額", formatYen(sumWon)),
    statCard("平均見積もり金額", formatYen(avg)),
    statCard("直近30日の新規受付", `${recent30}件`),
  ].join("");
}

function renderCategoryTable(cases) {
  const byCategory = {};
  cases.forEach((c) => {
    const key = c.category || "unknown";
    if (!byCategory[key]) byCategory[key] = { total: 0, won: 0 };
    byCategory[key].total++;
    if (c.status === "won") byCategory[key].won++;
  });
  const rows = Object.entries(byCategory).sort((a, b) => b[1].total - a[1].total);

  els.categoryTbody.innerHTML = rows.length
    ? rows.map(([id, v]) => `
      <tr>
        <td>${categoryLabel(id)}</td>
        <td>${v.total}</td>
        <td>${v.won}</td>
        <td>${v.total ? Math.round((v.won / v.total) * 100) : 0}%</td>
      </tr>`).join("")
    : `<tr class="empty-row"><td colspan="4">データがありません</td></tr>`;
}

function renderPricingStats({ campaigns, bundles, deliveryOptions }) {
  const activeCampaign = campaigns.find((cp) => cp.active);
  const activeBundles = bundles.filter((b) => b.active).length;
  const activeDelivery = deliveryOptions.filter((d) => d.active).length;

  els.pricingStats.innerHTML = [
    statCard("有効なキャンペーン", activeCampaign ? activeCampaign.label : "なし", activeCampaign ? (activeCampaign.banner_text || "") : ""),
    statCard("セットプラン", `${activeBundles} / ${bundles.length}`, "有効 / 登録数"),
    statCard("納品スケジュール", `${activeDelivery} / ${deliveryOptions.length}`, "有効 / 登録数"),
  ].join("");
}

async function loadDashboard() {
  const [casesRes, campaignsRes, bundlesRes, deliveryRes] = await Promise.all([
    api("/api/admin/cases"),
    api("/api/admin/campaigns"),
    api("/api/admin/bundles"),
    api("/api/admin/delivery-options"),
  ]);

  const cases = casesRes.cases || [];
  renderStatusStats(cases);
  renderRevenueStats(cases);
  renderCategoryTable(cases);
  renderPricingStats({
    campaigns: campaignsRes.campaigns || [],
    bundles: bundlesRes.bundles || [],
    deliveryOptions: deliveryRes.options || [],
  });
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
  els.dashboardView.style.display = "block";

  try {
    await loadDashboard();
  } catch (e) {
    els.dashboardView.style.display = "none";
    els.errorView.style.display = "flex";
    els.errorMessage.textContent = "データの取得に失敗しました。時間をおいて再度お試しください。";
  }
}

document.addEventListener("DOMContentLoaded", init);
