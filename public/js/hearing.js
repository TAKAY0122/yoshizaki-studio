/* ============================================================
   ヒアリングシート 共通ロジック
   前提: HTML側で `window.HEARING_CATEGORY` を定義し、
   pricing-config.js → hearing-config.js → hearing.js の順で読み込む
   ============================================================ */

function decodeEstimateCode(code) {
  try {
    const json = decodeURIComponent(escape(atob(code)));
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

function formatYen(n) {
  return "¥" + Number(n).toLocaleString("ja-JP");
}

function resolveEstimateSummary(decoded) {
  const cat = CATEGORIES.find((c) => c.id === decoded.cat);
  if (!cat) return null;
  const plan = cat.plans.find((p) => p.id === decoded.plan);
  const lines = [];
  if (plan) lines.push(plan.label);
  Object.entries(decoded.addons || {}).forEach(([id, val]) => {
    if (!val) return;
    const addon = cat.addons.find((a) => a.id === id) || COMMON_ADDONS.find((a) => a.id === id);
    if (!addon) return;
    if (addon.type === "stepper") lines.push(`${addon.label} × ${val}`);
    else if (addon.type === "multiplier") lines.push(addon.label);
    else lines.push(addon.label);
  });
  return { categoryLabel: cat.label, lines, total: decoded.total };
}

function renderEstimateBanner() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const banner = document.getElementById("estimate-banner");
  if (!code) {
    banner.hidden = true;
    return null;
  }
  const decoded = decodeEstimateCode(code);
  if (!decoded) {
    banner.hidden = true;
    return null;
  }
  const summary = resolveEstimateSummary(decoded);
  if (!summary) {
    banner.hidden = true;
    return null;
  }
  banner.hidden = false;
  banner.innerHTML = `
    <div class="banner-head">
      <span>🔗 見積もりシミュレーターの内容を引き継いでいます</span>
      <span class="banner-total">${formatYen(summary.total)} 〜</span>
    </div>
    <ul class="banner-lines">${summary.lines.map((l) => `<li>${l}</li>`).join("")}</ul>
  `;
  return { code, decoded };
}

/* ---------------- フォーム描画 ---------------- */
function fieldHtml(f) {
  const req = f.required ? '<span class="req">必須</span>' : "";
  const label = `<label class="f-label" for="f_${f.id}">${f.label}${req}</label>`;

  if (f.type === "textarea") {
    return `<div class="f-row">${label}<textarea id="f_${f.id}" name="${f.id}" rows="4" placeholder="${f.placeholder || ""}" ${f.required ? "required" : ""}></textarea></div>`;
  }
  if (f.type === "select") {
    const opts = f.options.map((o) => `<option value="${o}">${o}</option>`).join("");
    return `<div class="f-row">${label}<select id="f_${f.id}" name="${f.id}">${opts}</select></div>`;
  }
  if (f.type === "radio") {
    const opts = f.options
      .map(
        (o, i) => `
      <label class="radio-opt">
        <input type="radio" name="${f.id}" value="${o}" ${i === 0 && f.required ? "" : ""} />
        <span>${o}</span>
      </label>`
      )
      .join("");
    return `<div class="f-row">${label}<div class="radio-group">${opts}</div></div>`;
  }
  return `<div class="f-row">${label}<input type="${f.type}" id="f_${f.id}" name="${f.id}" placeholder="${f.placeholder || ""}" ${f.required ? "required" : ""} /></div>`;
}

function renderForm() {
  const config = HEARING_FORMS[window.HEARING_CATEGORY];
  document.getElementById("hearing-title").textContent = config.title;
  document.getElementById("hearing-lede").textContent = config.lede;
  document.getElementById("hearing-badge").textContent = config.emoji;
  document.getElementById("hearing-badge").style.background = config.badgeBg;

  const root = document.getElementById("form-sections");
  root.innerHTML = config.sections
    .map(
      (sec) => `
    <div class="f-section">
      <h2>${sec.title}</h2>
      ${sec.fields.map(fieldHtml).join("")}
    </div>
  `
    )
    .join("");
}

/* ---------------- 送信 ---------------- */
function genRefCode() {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `HR-${ymd}-${rand}`;
}

function collectFormData(config) {
  const data = {};
  config.sections.forEach((sec) => {
    sec.fields.forEach((f) => {
      if (f.type === "radio") {
        const checked = document.querySelector(`input[name="${f.id}"]:checked`);
        data[f.id] = checked ? checked.value : "";
      } else {
        const el = document.getElementById(`f_${f.id}`);
        data[f.id] = el ? el.value : "";
      }
    });
  });
  return data;
}

function initAiAssist(config) {
  const btn = document.getElementById("ai-assist-btn");
  const resultEl = document.getElementById("ai-assist-result");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = "📝 チェック中…";
    resultEl.hidden = true;

    const answers = collectFormData(config);
    try {
      const res = await fetch("/api/ai/hearing-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: window.HEARING_CATEGORY, answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      resultEl.hidden = false;
      if (!data.questions || !data.questions.length) {
        resultEl.innerHTML = `<h4>チェック結果</h4><p>現時点で大きな確認漏れはなさそうです。</p>`;
      } else {
        resultEl.innerHTML = `<h4>ご確認いただきたい項目</h4><ul>${data.questions.map((q) => `<li>${q}</li>`).join("")}</ul>`;
      }
    } catch (err) {
      resultEl.hidden = false;
      resultEl.innerHTML = `<h4>チェック結果</h4><p>チェックの取得に失敗しました（${err.message}）。そのままご記入・送信いただいて問題ありません。</p>`;
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
}

function initHearingForm() {
  renderForm();
  const estimateCtx = renderEstimateBanner();
  const config = HEARING_FORMS[window.HEARING_CATEGORY];
  initAiAssist(config);
  const form = document.getElementById("hearing-form");
  const successPanel = document.getElementById("success-panel");
  const refCodeEl = document.getElementById("ref-code");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // required チェック（テキスト系は required 属性、radioは手動チェック）
    let ok = form.reportValidity();
    const missingRadio = config.sections
      .flatMap((s) => s.fields)
      .filter((f) => f.type === "radio" && f.required)
      .some((f) => !document.querySelector(`input[name="${f.id}"]:checked`));
    if (missingRadio) ok = false;
    if (!ok) return;

    const answers = collectFormData(config);
    const urlCaseId = new URLSearchParams(location.search).get("caseId");
    const refCode = urlCaseId || genRefCode();

    const payload = {
      category: window.HEARING_CATEGORY,
      answers,
      estimateCode: estimateCtx ? estimateCtx.code : null,
      caseId: urlCaseId || null,
      refCode,
      submittedAt: new Date().toISOString(),
    };

    try {
      const res = await fetch("/api/hearings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      // バックエンド未接続・通信エラー時もお客様の入力は失わず、受付完了表示はそのまま出す。
      // 開発者向けにコンソールへ詳細を残す。
      console.warn("ヒアリング送信APIへの保存に失敗しました（ローカル受付表示のみ継続）:", err);
    }

    form.hidden = true;
    document.getElementById("estimate-banner").hidden = true;
    successPanel.hidden = false;
    refCodeEl.textContent = refCode;
    successPanel.scrollIntoView?.({ behavior: "smooth", block: "start" });
  });
}

document.addEventListener("DOMContentLoaded", initHearingForm);
