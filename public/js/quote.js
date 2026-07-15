/* ============================================================
   見積書PDF（印刷用）ロジック
   pricing-config.js を先に読み込んでおくこと（CATEGORIES / COMMON_ADDONS）
   ============================================================ */

const TAX_RATE = 0.1;

function decodeEstimateCode(code) {
  try {
    const json = decodeURIComponent(escape(atob(code)));
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

function formatYen(n) {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

function formatDays(d) {
  if (d === undefined || d === null) return "";
  const n = Number(d);
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${s}人日`;
}

function genQuoteNo(decoded) {
  const d = new Date(decoded.ts || Date.now());
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, "");
  const hash = Math.abs(
    Array.from(decoded.cat + decoded.plan).reduce((a, c) => a + c.charCodeAt(0), 0) + decoded.ts
  )
    .toString(36)
    .slice(-4)
    .toUpperCase();
  return `Q-${ymd}-${hash}`;
}

function buildLineItems(decoded) {
  const cat = CATEGORIES.find((c) => c.id === decoded.cat);
  if (!cat) return null;

  const items = [];
  const plan = cat.plans.find((p) => p.id === decoded.plan);
  if (plan) {
    items.push({ name: `【${cat.label}】${plan.label}`, days: plan.days, rate: plan.rate, amount: plan.price });
  }

  cat.addons.forEach((a) => {
    const val = (decoded.addons || {})[a.id];
    if (!val) return;
    if (a.type === "checkbox") {
      items.push({ name: a.label, days: a.days, rate: a.rate, amount: a.price });
    } else if (a.type === "stepper") {
      items.push({ name: `${a.label} × ${val}`, days: a.days * val, rate: a.rate, amount: a.price * val });
    }
  });

  let multiplier = 1;
  COMMON_ADDONS.forEach((a) => {
    const val = (decoded.addons || {})[a.id];
    if (!val) return;
    if (a.type === "checkbox") {
      items.push({ name: a.label, days: a.days, rate: a.rate, amount: a.price });
    } else if (a.type === "multiplier") {
      multiplier = a.value;
    }
  });

  const subBeforeMultiplier = items.reduce((s, i) => s + i.amount, 0);
  if (multiplier !== 1) {
    const rushAmount = Math.round(subBeforeMultiplier * (multiplier - 1));
    items.push({ name: "急ぎ対応（特急オプション）", days: null, rate: null, amount: rushAmount, isMultiplierLine: true });
  }

  const totalDays = items.reduce((s, i) => s + (i.days || 0), 0);
  const recurring = cat.recurring || [];

  return { categoryLabel: cat.label, items, recurring, totalDays };
}

function renderQuote() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const errorEl = document.getElementById("quote-error");
  const sheetEl = document.getElementById("sheet");

  if (!code) {
    errorEl.hidden = false;
    sheetEl.hidden = true;
    return;
  }
  const decoded = decodeEstimateCode(code);
  const built = decoded ? buildLineItems(decoded) : null;
  if (!decoded || !built) {
    errorEl.hidden = false;
    sheetEl.hidden = true;
    return;
  }

  const issueDate = new Date(decoded.ts || Date.now());
  const validUntil = new Date(issueDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  const fmtDate = (d) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;

  document.getElementById("quote-no").textContent = genQuoteNo(decoded);
  document.getElementById("issue-date").textContent = fmtDate(issueDate);
  document.getElementById("valid-date").textContent = fmtDate(validUntil);
  document.getElementById("category-label").textContent = built.categoryLabel;
  const totalDaysEl = document.getElementById("total-days");
  if (totalDaysEl) totalDaysEl.textContent = built.totalDays ? formatDays(built.totalDays) : "";

  const subtotal = built.items.reduce((s, i) => s + i.amount, 0);
  const tax = Math.round(subtotal * TAX_RATE);
  const total = subtotal + tax;

  document.getElementById("total-amount").textContent = formatYen(total);

  const tbody = document.getElementById("items-body");
  tbody.innerHTML = built.items
    .map(
      (i) => `
    <tr>
      <td>${i.name}</td>
      <td class="num">${i.days !== null && i.days !== undefined ? formatDays(i.days) : "—"}</td>
      <td class="num">${i.rate ? formatYen(i.rate) : "—"}</td>
      <td class="num">${formatYen(i.amount)}</td>
    </tr>`
    )
    .join("");

  document.getElementById("subtotal").textContent = formatYen(subtotal);
  document.getElementById("tax").textContent = formatYen(tax);
  document.getElementById("grand-total").textContent = formatYen(total);

  const recurringEl = document.getElementById("recurring-note");
  if (built.recurring.length) {
    recurringEl.hidden = false;
    recurringEl.innerHTML =
      "<h3>継続費用（別途・目安）</h3><ul>" +
      built.recurring.map((r) => `<li>${r.label}：${formatYen(r.price)} / ${r.unit}</li>`).join("") +
      "</ul>";
  } else {
    recurringEl.hidden = true;
  }
}

function initPrintButton() {
  const btn = document.getElementById("print-btn");
  if (btn) btn.addEventListener("click", () => window.print());
}

document.addEventListener("DOMContentLoaded", () => {
  renderQuote();
  initPrintButton();
});
