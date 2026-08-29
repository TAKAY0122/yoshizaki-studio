/* ============================================================
   Aster Systems / ty-mitumori
   AI自動判断パイプライン
   ------------------------------------------------------------
   自由文の問い合わせから「分類 → ヒアリング項目の構造化抽出 →
   プラン/オプション選定・金額判断」までを行う。

   ヒアリング項目の抽出（extractHearingFields）は、実在する
   ヒアリング項目id（src/hearing-fields.ts）と照合し、一致しない
   ものは機械的に除去する（本文に書かれていない情報の捏造防止）。

   一方、プラン/オプション選定・金額算出（selectPlanAndAddons）は
   2026-08-29のユーザー明示指示により、ホワイトリスト照合・
   決定的な金額計算ロジックへの委譲を撤廃した。AIが選んだ
   plan/addon・金額（aiTotal）をそのまま信用する（実在しないプラン名や
   金額の誤りがそのまま顧客に送られるリスクがあることを踏まえたうえでの
   運用判断。詳細は .claude/memory/decisions.md 参照）。
   ============================================================ */
import { callClaudeWithRetry, extractJson } from "./claude-client";
import { CATEGORY_SUMMARY, CATEGORY_INFO } from "./category-info";
import { HEARING_FIELDS } from "./hearing-fields";
import { CATEGORIES as SERVER_CATEGORIES } from "./pricing-catalog";

export type ClassifyResult = {
  category: string | null;
  confidence: number;
  reasoning: string;
};

export type ExtractResult = {
  answers: Record<string, string>;
  coveredFieldIds: string[];
  droppedFieldIds: string[];
};

export type SelectResult = {
  planId: string | null;
  addonIds: string[];
  aiTotal: number | null;
  confidence: number;
  reasoning: string;
  unresolvedQuestions: string[];
};

const VALID_CATEGORY_IDS = new Set(Object.keys(CATEGORY_INFO));

// ------------------------------------------------------------
// ステージ1：自由文からカテゴリを判定する
// ------------------------------------------------------------
export async function classifyInquiry(apiKey: string, freeText: string): Promise<ClassifyResult> {
  const system = `あなたはAster Systems（Web/動画/アプリ/システム開発/デザイン制作会社）の見積もり相談員です。
お客様の依頼内容の説明文から、以下のカテゴリ一覧の中から最も近いものを選び、
JSON のみを出力してください（前後に説明文を付けないこと）。

${CATEGORY_SUMMARY}

出力形式（キー名を変えないこと）:
{"category":"web|video|app|system|design|null","confidence":0から1の数値,"reasoning":"選定理由を80文字程度の日本語で"}
該当カテゴリが自信を持って判断できない場合は category を null にし、confidenceを低くしてください。`;

  const raw = await callClaudeWithRetry(apiKey, system, freeText, { maxTokens: 500 });
  const parsed = extractJson(raw);
  const category = parsed?.category && VALID_CATEGORY_IDS.has(parsed.category) ? parsed.category : null;
  const confidence = typeof parsed?.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
  return { category, confidence, reasoning: typeof parsed?.reasoning === "string" ? parsed.reasoning : "" };
}

// ------------------------------------------------------------
// ステージ2：自由文からヒアリング項目を構造化抽出する
// ------------------------------------------------------------
export async function extractHearingFields(apiKey: string, category: string, freeText: string): Promise<ExtractResult> {
  const fields = HEARING_FIELDS[category] || [];
  const fieldList = fields.map((f) => `- ${f.id}: ${f.label}`).join("\n");

  const system = `あなたはAster Systemsの制作ディレクターです。お客様からの自由文の問い合わせ内容を読み、
以下のヒアリング項目のうち、本文に明記されている内容だけを日本語の値として抽出してください。
JSONのみを出力してください（前後に説明文を付けないこと）。

抽出対象の項目一覧（カテゴリ: ${category}）:
${fieldList}

出力形式: {"項目id": "抽出した値", ...}
重要な注意事項:
- 本文に明記されていない項目は出力しないでください（推測・補完で埋めないこと）
- 項目idは上記一覧のものだけを使ってください（一覧にないidを作らないこと）
- 値は本文の内容を要約せず、可能な限りそのままの表現を使ってください`;

  const raw = await callClaudeWithRetry(apiKey, system, freeText, { maxTokens: 1500 });
  const parsed = extractJson(raw);

  const validIds = new Set(fields.map((f) => f.id));
  const answers: Record<string, string> = {};
  const coveredFieldIds: string[] = [];
  const droppedFieldIds: string[] = [];

  if (parsed && typeof parsed === "object") {
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== "string" || !value.trim()) continue;
      if (validIds.has(key)) {
        answers[key] = value.trim().slice(0, 2000);
        coveredFieldIds.push(key);
      } else {
        droppedFieldIds.push(key);
      }
    }
  }

  return { answers, coveredFieldIds, droppedFieldIds };
}

// ------------------------------------------------------------
// ステージ3：構造化済みの回答からプラン・オプション・金額をAIに判断させる
// （2026-08-29、ユーザー明示指示によりホワイトリスト照合・金額算出の
// 決定的ロジックへの委譲を撤廃。AIが選んだplanId/addonIdや金額を
// そのまま信用する。カタログ一覧はあくまで参考情報として渡す）
// ------------------------------------------------------------
export async function selectPlanAndAddons(
  apiKey: string,
  category: string,
  structuredAnswers: Record<string, string>
): Promise<SelectResult> {
  const cat = SERVER_CATEGORIES.find((c) => c.id === category);
  if (!cat) {
    return { planId: null, addonIds: [], aiTotal: null, confidence: 0, reasoning: "不明なカテゴリです", unresolvedQuestions: [] };
  }

  const planList = cat.plans.map((p) => `- ${p.id}: ${p.label}（参考価格 ¥${p.price.toLocaleString("ja-JP")}）`).join("\n");
  const addonList = cat.addons.map((a) => `- ${a.id}: ${a.label}（参考価格 ¥${a.price?.toLocaleString?.("ja-JP") ?? "-"}）`).join("\n");

  const system = `あなたはAster Systemsの制作ディレクターです。以下のヒアリング回答（JSON）をもとに、
このカテゴリ（${cat.label}）に最も近いプラン・該当しそうなオプションを判断し、
あなた自身の判断で御見積金額（税別、日本円）も決定してください。JSONのみを出力してください（前後に説明文を付けないこと）。

プラン一覧（参考）:
${planList}

オプション一覧（参考）:
${addonList}

出力形式（キー名を変えないこと）:
{"planId":"最も近いプラン名や説明","addonIds":["該当しそうなオプション名の配列"],"aiTotal":あなたが判断した御見積金額（数値、円）,"confidence":0から1の数値,"reasoning":"選定理由・金額の根拠を100文字程度の日本語で","unresolvedQuestions":["確認が必要な点があれば日本語の質問文を最大3件"]}
自信が持てない場合でも、参考価格をもとにおおよその金額を判断して構いません。`;

  const raw = await callClaudeWithRetry(apiKey, system, JSON.stringify(structuredAnswers), { maxTokens: 1000 });
  const parsed = extractJson(raw);

  const planId = typeof parsed?.planId === "string" && parsed.planId.trim() ? parsed.planId.trim() : null;
  const addonIds = Array.isArray(parsed?.addonIds) ? parsed.addonIds.filter((id: unknown) => typeof id === "string" && id.trim()) : [];
  const aiTotal = typeof parsed?.aiTotal === "number" && Number.isFinite(parsed.aiTotal) ? Math.max(0, Math.round(parsed.aiTotal)) : null;
  const confidence = typeof parsed?.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
  const unresolvedQuestions = Array.isArray(parsed?.unresolvedQuestions)
    ? parsed.unresolvedQuestions.filter((q: unknown) => typeof q === "string").slice(0, 3)
    : [];

  return {
    planId,
    addonIds,
    aiTotal,
    confidence,
    reasoning: typeof parsed?.reasoning === "string" ? parsed.reasoning : "",
    unresolvedQuestions,
  };
}

// ------------------------------------------------------------
// 上記3ステージをまとめて実行する（admin手動プレビュー用・フェーズ3時点では
// 送信・DB更新は一切行わない。フェーズ6でこの関数を全自動フローからも呼ぶ）
// ------------------------------------------------------------
export type PipelinePreview = {
  classification: ClassifyResult;
  extraction: ExtractResult | null;
  selection: SelectResult | null;
};

// ------------------------------------------------------------
// 新資料（要件定義書・仕様書）の下書き生成
// ------------------------------------------------------------
// 社内専用（フェーズ4時点では顧客送付なし）。ヒアリング回答・選定プラン・
// 確定金額「だけ」を根拠にAIへ文章化させ、それ以外の事実を作らせない。
// ------------------------------------------------------------
export type DocumentSection = { heading: string; body: string };
export type DocumentType = "requirements" | "spec";

export type DocumentGenerationInput = {
  category: string;
  categoryLabel: string;
  answers: Record<string, string>;
  planLabel: string | null;
  addonLabels: string[];
  total: number | null;
};

const DOCUMENT_SYSTEM_PROMPTS: Record<DocumentType, string> = {
  requirements: `あなたはAster Systemsの制作ディレクターです。以下の情報（カテゴリ・ヒアリング回答・選定プラン/オプション・確定金額）だけを根拠に、
社内検討用の「要件定義書」の下書きを作成してください。JSONのみを出力してください（前後に説明文を付けないこと）。

出力形式: {"sections":[{"heading":"見出し","body":"本文（日本語、200〜400字程度）"}, ...]}
見出しの構成例：1.プロジェクト概要／2.目的・背景／3.対象ユーザー／4.主要機能要件／5.非機能要件／6.スケジュール／7.予算・見積り概要／8.未確認事項
重要な注意事項:
- 与えられた情報にない事実（存在しない機能・数値・固有名詞・会社名等）を作らないこと
- 情報が不足している見出しは「ヒアリング回答からは十分な情報が得られていません。追加確認が必要です。」のように正直に書くこと`,
  spec: `あなたはAster Systemsの制作ディレクターです。以下の情報だけを根拠に、社内検討用の「仕様書（機能一覧）」の下書きを作成してください。
JSONのみを出力してください（前後に説明文を付けないこと）。

出力形式: {"sections":[{"heading":"見出し","body":"本文（日本語、150〜300字程度、箇条書き的な列挙でよい）"}, ...]}
見出しの構成例：1.対象範囲／2.画面・機能一覧／3.選定プラン・オプションの内訳／4.技術要件・連携／5.納品物／6.確認事項
重要な注意事項:
- 与えられた情報にない事実を作らないこと
- 情報が不足している場合は正直に「未確認」と明記すること`,
};

export async function generateDocument(
  apiKey: string,
  docType: DocumentType,
  input: DocumentGenerationInput
): Promise<DocumentSection[]> {
  const system = DOCUMENT_SYSTEM_PROMPTS[docType];
  if (!system) throw new Error(`未知のdocType: ${docType}`);

  const raw = await callClaudeWithRetry(apiKey, system, JSON.stringify(input), { maxTokens: 3000 });
  const parsed = extractJson(raw);
  const sections = Array.isArray(parsed?.sections) ? parsed.sections : [];

  return sections
    .filter((s: any) => s && typeof s.heading === "string" && typeof s.body === "string" && s.heading.trim() && s.body.trim())
    .map((s: any) => ({ heading: s.heading.trim().slice(0, 200), body: s.body.trim().slice(0, 4000) }));
}

export async function runAiPipelinePreview(
  apiKey: string,
  freeText: string,
  knownCategory?: string | null
): Promise<PipelinePreview> {
  const classification = knownCategory
    ? { category: knownCategory, confidence: 1, reasoning: "既存の案件カテゴリを使用" }
    : await classifyInquiry(apiKey, freeText);

  if (!classification.category) {
    return { classification, extraction: null, selection: null };
  }

  const extraction = await extractHearingFields(apiKey, classification.category, freeText);
  const selection = await selectPlanAndAddons(apiKey, classification.category, extraction.answers);

  return { classification, extraction, selection };
}
