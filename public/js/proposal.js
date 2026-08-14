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

/* ------------------------------------------------------------
   仕様書ドラフト生成
   ヒアリングの「セクション名」を手がかりに、要件定義でよく使う
   見出し（概要・要件・スケジュール）へ機械的に並べ替える。
   セクション名に含まれるキーワードで判定するだけなので、
   hearing-config.js 側の項目追加・変更にもそのまま追従できる。
   ------------------------------------------------------------ */
const SPEC_GROUPS = [
  { key: "overview", label: "概要・背景", test: (t) => /目的|背景|課題|企画|制作内容/.test(t) },
  { key: "requirements", label: "要件・仕様", test: (t) => /要件|仕様|機能|デザイン/.test(t) },
  { key: "schedule", label: "スケジュール・予算・運用", test: (t) => /スケジュール|予算|運用|納品/.test(t) },
  { key: "other", label: "その他", test: () => true }, // どれにも一致しない場合の受け皿。回答が仕様書から静かに消えるのを防ぐ
];

function buildSpecDraft(category, answers, est, totalAmount) {
  const cfg = typeof HEARING_FORMS !== "undefined" && HEARING_FORMS[category];
  if (!cfg) return null;

  const groups = { overview: [], requirements: [], schedule: [], other: [] };
  const openQuestions = [];

  cfg.sections.forEach((sec) => {
    if (sec.fields === COMMON_FIELDS) return; // 基本情報はお客様情報側で表示済み
    const group = SPEC_GROUPS.find((g) => g.test(sec.title));
    sec.fields.forEach((f) => {
      const val = (answers || {})[f.id];
      const hasVal = val !== undefined && val !== null && String(val).trim() !== "";
      if (hasVal) {
        groups[group.key].push({ label: f.label, value: String(val) });
      } else if (f.required) {
        openQuestions.push(f.label);
      }
    });
  });

  const estLines = [];
  if (est) {
    const cat = (typeof CATEGORIES !== "undefined" ? CATEGORIES : []).find((c) => c.id === est.cat);
    if (cat) {
      const plan = cat.plans.find((p) => p.id === est.plan);
      if (plan) estLines.push(`${plan.label}（${plan.days}人日 ／ ${formatYen(plan.price)}）`);
      const commonAddons = typeof COMMON_ADDONS !== "undefined" ? COMMON_ADDONS : [];
      Object.entries(est.addons || {}).forEach(([id, val]) => {
        if (!val) return;
        const addon = cat.addons.find((a) => a.id === id) || commonAddons.find((a) => a.id === id);
        if (!addon) return;
        if (addon.type === "stepper") estLines.push(`${addon.label} × ${val}（${formatYen(addon.price * val)}）`);
        else estLines.push(addon.label);
      });
    }
    estLines.push(`概算合計：${formatYen(totalAmount || est.total || 0)}〜`);
  }

  return { groups, openQuestions, estLines };
}

/* セクション見出しは「回答があるものだけ」を連番で並べる。
   空のグループを飛ばさず固定番号にすると欠番が出て読みづらいため。 */
function specSections(draft) {
  const list = [];
  SPEC_GROUPS.forEach((g) => {
    if (draft.groups[g.key] && draft.groups[g.key].length) list.push({ title: g.label, items: draft.groups[g.key] });
  });
  if (draft.estLines.length) list.push({ title: "見積り内訳（シミュレーターより）", lines: draft.estLines });
  if (draft.openQuestions.length) list.push({ title: "要確認事項（未回答の必須項目）", lines: draft.openQuestions, isOpen: true });
  return list.map((s, i) => Object.assign(s, { title: `${i + 1}. ${s.title}` }));
}

function renderSpecHtml(draft) {
  const sections = specSections(draft);
  if (!sections.length) return `<p style="color:var(--ink-faint);">ヒアリング回答が無いため、仕様書ドラフトを生成できません。</p>`;

  return sections
    .map((s) => {
      const cls = s.isOpen ? "hearing-section spec-open" : "hearing-section";
      if (s.items) {
        const rows = s.items.map((i) => `<div class="hearing-qa"><div class="hearing-q">${escapeHtml(i.label)}</div><div class="hearing-a">${escapeHtml(i.value)}</div></div>`).join("");
        return `<div class="${cls}"><h3>${escapeHtml(s.title)}</h3>${rows}</div>`;
      }
      return `<div class="${cls}"><h3>${escapeHtml(s.title)}</h3><ul class="estimate-lines">${s.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul></div>`;
    })
    .join("");
}

/* お客様の自由入力をMarkdownへそのまま埋め込むと、コピー先ツール（Slack/Notion等）で
   意図しないリンク化・見出し化が起きうる（Markdownインジェクション）ため、
   改行をつぶし記号をエスケープしてから埋め込む。 */
function escapeMarkdown(s) {
  return String(s)
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/[\\`*_[\]()#>]/g, (ch) => "\\" + ch);
}

function specDraftToMarkdown(draft, meta) {
  const lines = [];
  lines.push(`# 仕様書ドラフト（受付番号: ${escapeMarkdown(meta.caseId)}）`);
  lines.push(`- カテゴリ: ${meta.category}`);
  lines.push(`- 会社名: ${escapeMarkdown(meta.company || "―")}`);
  lines.push("");

  specSections(draft).forEach((s) => {
    lines.push(`## ${s.title}`);
    if (s.items) s.items.forEach((i) => lines.push(`- **${i.label}**: ${escapeMarkdown(i.value)}`));
    else s.lines.forEach((l) => lines.push(`- ${l}`));
    lines.push("");
  });

  return lines.join("\n");
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

    const est = data.estimates && data.estimates.length ? JSON.parse(data.estimates[0].items) : null;
    const totalAmount = data.estimates && data.estimates.length ? data.estimates[0].total_amount : null;
    const draft = buildSpecDraft(latest.category, answers, est, totalAmount);
    if (draft) {
      document.getElementById("spec-block").hidden = false;
      document.getElementById("spec-content").innerHTML = renderSpecHtml(draft);

      const copyBtn = document.getElementById("copy-spec-btn");
      copyBtn.hidden = false;
      copyBtn.addEventListener("click", async () => {
        const markdown = specDraftToMarkdown(draft, { caseId: c.id, category: categoryLabel(c.category), company: c.company });
        try {
          await navigator.clipboard.writeText(markdown);
          const original = copyBtn.textContent;
          copyBtn.textContent = "コピーしました";
          setTimeout(() => { copyBtn.textContent = original; }, 1800);
        } catch (e) {
          window.prompt("コピーできませんでした。以下を手動でコピーしてください：", markdown);
        }
      });
    }
  } else {
    document.getElementById("hearing-content").innerHTML = `<p style="color:var(--ink-faint);">まだヒアリング回答がありません。</p>`;
  }
}

document.getElementById("print-btn").addEventListener("click", () => window.print());
document.addEventListener("DOMContentLoaded", init);
