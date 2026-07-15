/* ============================================================
   顧客マイページ ロジック
   ============================================================ */

const STATUS_FLOW = [
  { id: "new", label: "新規受付" },
  { id: "hearing", label: "ヒアリング中" },
  { id: "quoted", label: "見積もり提示済み" },
  { id: "won", label: "受注" },
];
const STATUS_INDEX = Object.fromEntries(STATUS_FLOW.map((s, i) => [s.id, i]));

function formatYen(n) {
  return "¥" + Number(n).toLocaleString("ja-JP");
}
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

const els = {
  lookupCard: document.getElementById("lookup-card"),
  statusCard: document.getElementById("status-card"),
  id: document.getElementById("lookup-id"),
  email: document.getElementById("lookup-email"),
  error: document.getElementById("lookup-error"),
  btn: document.getElementById("lookup-btn"),
  againBtn: document.getElementById("lookup-again-btn"),
  category: document.getElementById("status-category"),
  track: document.getElementById("status-track"),
  created: document.getElementById("status-created"),
  updated: document.getElementById("status-updated"),
  estimate: document.getElementById("status-estimate"),
  quoteLink: document.getElementById("status-quote-link"),
};

function renderTrack(status) {
  if (status === "lost") {
    els.track.innerHTML = `<div class="pt is-current"><span class="dot"></span><span class="label">失注・見送り</span></div>`;
    return;
  }
  const currentIndex = STATUS_INDEX[status] ?? 0;
  els.track.innerHTML = STATUS_FLOW.map((s, i) => {
    const cls = i < currentIndex ? "is-done" : i === currentIndex ? "is-current" : "";
    const pt = `<div class="pt ${cls}"><span class="dot"></span><span class="label">${s.label}</span></div>`;
    if (i === 0) return pt;
    const lineCls = i <= currentIndex ? "is-done" : "";
    return `<div class="line ${lineCls}"></div>${pt}`;
  }).join("");
}

async function doLookup() {
  const id = els.id.value.trim();
  const email = els.email.value.trim();
  els.error.textContent = "";
  if (!id || !email) {
    els.error.textContent = "受付番号とメールアドレスの両方を入力してください";
    return;
  }
  els.btn.disabled = true;
  els.btn.textContent = "確認中…";
  try {
    const res = await fetch(`/api/mypage?id=${encodeURIComponent(id)}&email=${encodeURIComponent(email)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "見つかりませんでした");

    els.category.textContent = categoryLabel(data.case.category);
    renderTrack(data.case.status);
    els.created.textContent = fmtDateTime(data.case.created_at);
    els.updated.textContent = fmtDateTime(data.case.updated_at);
    els.estimate.textContent = data.latestEstimateTotal ? `${formatYen(data.latestEstimateTotal)} 〜` : "算出中／未算出";

    els.quoteLink.innerHTML = data.case.estimate_code
      ? `<a href="/quote.html?code=${encodeURIComponent(data.case.estimate_code)}">📄 見積書を見る</a>`
      : "";

    els.lookupCard.hidden = true;
    els.statusCard.hidden = false;
  } catch (err) {
    els.error.textContent = err.message || "確認に失敗しました";
  } finally {
    els.btn.disabled = false;
    els.btn.textContent = "確認する";
  }
}

els.btn.addEventListener("click", doLookup);
[els.id, els.email].forEach((el) =>
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLookup();
  })
);
els.againBtn.addEventListener("click", () => {
  els.statusCard.hidden = true;
  els.lookupCard.hidden = false;
  els.id.value = "";
  els.email.value = "";
  els.error.textContent = "";
});
