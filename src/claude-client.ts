/* ============================================================
   Aster Systems / ty-mitumori
   Anthropic API 呼び出しの共通ヘルパー
   ------------------------------------------------------------
   src/index.ts（既存のAI機能）と src/ai-pipeline.ts（新規の
   自動判断パイプライン）の両方から使う。
   ============================================================ */

export async function callClaude(
  apiKey: string,
  system: string,
  userText: string,
  opts: { maxTokens?: number } = {}
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: opts.maxTokens ?? 1000,
      system,
      messages: [{ role: "user", content: userText }],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Claude API error ${res.status}: ${text.slice(0, 300)}`);
  }
  const data: any = await res.json();
  const textBlock = (data.content || []).find((b: any) => b.type === "text");
  return textBlock ? textBlock.text : "";
}

// 5xx等の一時的なエラー時に1回だけリトライする（全自動パイプラインは人が
// 再実行を指示できないため、既存の単発呼び出しより多少の耐障害性を持たせる）。
export async function callClaudeWithRetry(
  apiKey: string,
  system: string,
  userText: string,
  opts: { maxTokens?: number } = {}
): Promise<string> {
  try {
    return await callClaude(apiKey, system, userText, opts);
  } catch (err) {
    console.warn("Claude呼び出しに失敗しました。1回だけリトライします:", err);
    return await callClaude(apiKey, system, userText, opts);
  }
}

export function extractJson(raw: string): any {
  const cleaned = raw.replace(/```json\s*|```\s*/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e2) {
        return null;
      }
    }
    return null;
  }
}
