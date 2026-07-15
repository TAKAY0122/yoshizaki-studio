import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Context, Next } from "hono";

type Bindings = {
  ASSETS: Fetcher;
  DB: D1Database;
  ANTHROPIC_API_KEY: string;
  RESEND_API_KEY: string;
  MAIL_FROM: string;
  COMPANY_NOTIFY_EMAIL: string;
};

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type Variables = {
  admin: AdminUser;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const SESSION_COOKIE = "ty_admin_session";
const SESSION_DAYS = 7;
const PBKDF2_ITERATIONS = 100000;

// ============================================================
// パスワードハッシュ（Web Crypto / PBKDF2-SHA256）
// ============================================================
function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function fromHex(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}

async function hashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return { hash: toHex(bits), salt: toHex(salt) };
}

async function verifyPassword(password: string, saltHex: string, hashHex: string): Promise<boolean> {
  const { hash } = await hashPassword(password, saltHex);
  if (hash.length !== hashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ hashHex.charCodeAt(i);
  return diff === 0;
}

function newId(): string {
  return crypto.randomUUID();
}

// ============================================================
// 認証ミドルウェア
// ============================================================
async function requireAuth(c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return c.json({ error: "unauthorized" }, 401);

  const session = await c.env.DB.prepare(
    "SELECT s.admin_id, s.expires_at, a.name, a.email, a.role FROM admin_sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token = ?"
  )
    .bind(token)
    .first();

  if (!session || new Date(session.expires_at as string) < new Date()) {
    return c.json({ error: "unauthorized" }, 401);
  }
  c.set("admin", {
    id: String(session.admin_id),
    name: String(session.name),
    email: String(session.email),
    role: String(session.role),
  });
  await next();
}

// ============================================================
// 公開API：ヒアリング送信の保存
// ============================================================
app.post("/api/hearings", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !body.category || !body.answers) {
    return c.json({ error: "invalid payload" }, 400);
  }

  // お客様には hearing.js が生成した refCode（例: HR-20260714-AB12）を受付番号として
  // 表示するため、これをそのまま cases.id（主キー）として使う。
  // マイページ（/api/mypage）はこの id で照会するため、両者が一致している必要がある。
  const caseId: string = body.refCode || newId();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO cases (id, category, status, customer_name, email, tel, company, created_at, updated_at)
     VALUES (?, ?, 'new', ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      caseId,
      body.category,
      body.answers.contact_name || body.answers.company || "",
      body.answers.email || "",
      body.answers.tel || "",
      body.answers.company || "",
      now,
      now
    )
    .run();

  await c.env.DB.prepare(
    `INSERT INTO hearings (id, case_id, category, answers, created_at) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(newId(), caseId, body.category, JSON.stringify(body.answers), now)
    .run();

  if (body.estimateCode) {
    let decoded: any = null;
    try {
      decoded = JSON.parse(decodeURIComponent(escape(atob(body.estimateCode))));
    } catch (e) {
      decoded = null;
    }
    if (decoded) {
      await c.env.DB.prepare(
        `INSERT INTO estimates (id, case_id, items, total_amount, created_at) VALUES (?, ?, ?, ?, ?)`
      )
        .bind(newId(), caseId, JSON.stringify(decoded), decoded.total || 0, now)
        .run();

      await c.env.DB.prepare(
        `UPDATE cases SET estimate_code = ?, estimate_total = ? WHERE id = ?`
      )
        .bind(body.estimateCode, decoded.total || 0, caseId)
        .run();
    }
  }

  return c.json({ ok: true, caseId, refCode: body.refCode || null });
});

// ============================================================
// 管理者：初回セットアップ（管理者が0件のときのみ有効）
// ============================================================
app.get("/api/admin/setup-status", async (c) => {
  const existing = await c.env.DB.prepare("SELECT COUNT(*) as n FROM admins").first();
  const needsSetup = !existing || Number(existing.n) === 0;
  return c.json({ needsSetup });
});

app.post("/api/admin/setup", async (c) => {
  const existing = await c.env.DB.prepare("SELECT COUNT(*) as n FROM admins").first();
  if (existing && Number(existing.n) > 0) {
    return c.json({ error: "already initialized" }, 403);
  }
  const body = await c.req.json().catch(() => null);
  if (!body?.name || !body?.email || !body?.password) {
    return c.json({ error: "name, email, password は必須です" }, 400);
  }
  if (String(body.password).length < 8) {
    return c.json({ error: "パスワードは8文字以上にしてください" }, 400);
  }
  const { hash, salt } = await hashPassword(body.password);
  await c.env.DB.prepare(
    `INSERT INTO admins (id, name, email, password_hash, password_salt, role) VALUES (?, ?, ?, ?, ?, 'owner')`
  )
    .bind(newId(), body.name, body.email, hash, salt)
    .run();
  return c.json({ ok: true });
});

app.post("/api/admin/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.email || !body?.password) return c.json({ error: "email, password は必須です" }, 400);

  const admin = await c.env.DB.prepare("SELECT * FROM admins WHERE email = ?").bind(body.email).first();
  if (!admin) return c.json({ error: "メールアドレスまたはパスワードが違います" }, 401);

  const valid = await verifyPassword(body.password, admin.password_salt as string, admin.password_hash as string);
  if (!valid) return c.json({ error: "メールアドレスまたはパスワードが違います" }, 401);

  const token = newId() + newId();
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await c.env.DB.prepare("INSERT INTO admin_sessions (token, admin_id, expires_at) VALUES (?, ?, ?)")
    .bind(token, admin.id, expires.toISOString())
    .run();

  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });

  return c.json({ ok: true, name: admin.name, role: admin.role });
});

app.post("/api/admin/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    await c.env.DB.prepare("DELETE FROM admin_sessions WHERE token = ?").bind(token).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

app.get("/api/admin/me", requireAuth, async (c) => {
  return c.json({ admin: c.get("admin") });
});

// ============================================================
// 管理者：案件一覧・詳細・更新
// ============================================================
app.get("/api/admin/cases", requireAuth, async (c) => {
  const status = c.req.query("status");
  const q = c.req.query("q");

  let sql = "SELECT * FROM cases";
  const conditions: string[] = [];
  const params: any[] = [];
  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }
  if (q) {
    conditions.push("(customer_name LIKE ? OR email LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
  sql += " ORDER BY created_at DESC LIMIT 200";

  const { results } = await c.env.DB.prepare(sql)
    .bind(...params)
    .all();
  return c.json({ cases: results });
});

app.get("/api/admin/cases/:id", requireAuth, async (c) => {
  const id = c.req.param("id");
  const caseRow = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first();
  if (!caseRow) return c.json({ error: "not found" }, 404);

  const hearings = await c.env.DB.prepare("SELECT * FROM hearings WHERE case_id = ? ORDER BY created_at DESC")
    .bind(id)
    .all();
  const estimates = await c.env.DB.prepare("SELECT * FROM estimates WHERE case_id = ? ORDER BY created_at DESC")
    .bind(id)
    .all();
  const logs = await c.env.DB.prepare("SELECT * FROM case_logs WHERE case_id = ? ORDER BY created_at DESC")
    .bind(id)
    .all();

  return c.json({
    case: caseRow,
    hearings: hearings.results,
    estimates: estimates.results,
    logs: logs.results,
  });
});

app.patch("/api/admin/cases/:id", requireAuth, async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const admin = c.get("admin");

  const before = await c.env.DB.prepare("SELECT status FROM cases WHERE id = ?").bind(id).first();
  if (!before) return c.json({ error: "not found" }, 404);

  const fields: string[] = [];
  const params: any[] = [];
  if (body.status) {
    fields.push("status = ?");
    params.push(body.status);
  }
  if (body.assigned_to !== undefined) {
    fields.push("assigned_to = ?");
    params.push(body.assigned_to);
  }
  fields.push("updated_at = ?");
  params.push(new Date().toISOString());
  params.push(id);

  await c.env.DB.prepare(`UPDATE cases SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...params)
    .run();

  if (body.status || body.note) {
    await c.env.DB.prepare(
      `INSERT INTO case_logs (id, case_id, note, status_before, status_after, admin_id) VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(newId(), id, body.note || null, before.status, body.status || before.status, admin.id)
      .run();
  }

  return c.json({ ok: true });
});

// ============================================================
// AI：見積もり提案・ヒアリング補助（Claude API）
// ------------------------------------------------------------
// CATEGORY_INFO は public/js/pricing-config.js の内容と手動で
// 同期させる必要があります（カテゴリ・プラン構成を変更した場合は要更新）。
// ============================================================
const CATEGORY_INFO: Record<string, { label: string; hearingUrl: string; summary: string }> = {
  web: {
    label: "Webサイト制作",
    hearingUrl: "/hearing.html",
    summary: "プラン=LP/コーポレートサイト/WordPress制作/ECサイト/サイトリニューアル。オプション=CMS導入/問い合わせフォーム/レスポンシブ/SEO内部対策/GA4設定/SSL設定/サーバードメイン初期設定/多言語対応/予約カレンダー機能",
  },
  video: {
    label: "動画編集・映像制作",
    hearingUrl: "/hearing_video.html",
    summary: "プラン=YouTube動画編集/TikTokショート動画編集/企業紹介PRムービー/撮影込み映像制作。オプション=テロップ字幕/BGM効果音/サムネイル作成/字幕生成/プロナレーション/SNSリサイズ/アニメーション追加",
  },
  app: {
    label: "アプリ開発",
    hearingUrl: "/hearing_app.html",
    summary: "プラン=PWA簡易Webアプリ/iOSまたはAndroid単体/iOS+Android両対応/業務アプリ。オプション=SNSログイン/プッシュ通知/管理画面/ユーザー認証/決済機能/チャット機能/多言語対応",
  },
  system: {
    label: "システム開発",
    hearingUrl: "/hearing_system.html",
    summary: "プラン=業務システム小規模/API連携外部サービス接続/SaaS Webアプリ開発/自動化ツール開発。オプション=管理画面構築/ユーザー認証/API連携/決済機能実装/クラウドインフラ構築/自動テストCI CD/セキュリティ診断",
  },
  design: {
    label: "グラフィック・デザイン",
    hearingUrl: "/hearing_design.html",
    summary: "プラン=ロゴデザインシンプル/ロゴデザイン本格オリジナル/名刺デザイン/チラシフライヤー/ブランドVI設計一式。オプション=カラーバリエーション追加/修正回数追加/印刷用データ入稿対応/SNSアイコンバナーセット/ブランドガイドライン作成/封筒レターヘッドデザイン/商品パッケージデザイン",
  },
};

const CATEGORY_SUMMARY = Object.entries(CATEGORY_INFO)
  .map(([id, c]) => `- ${id}（${c.label}）: ${c.summary}`)
  .join("\n");

function decodeEstimateCode(code: string): any {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(code))));
  } catch (e) {
    return null;
  }
}

function formatYenJP(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

async function sendResendEmail(
  apiKey: string,
  from: string,
  to: string[],
  subject: string,
  html: string,
  replyTo?: string
) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to, subject, html, reply_to: replyTo }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend API error ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

app.post("/api/estimates/send", async (c) => {
  if (!c.env.RESEND_API_KEY) return c.json({ error: "メール送信機能が未設定です（RESEND_API_KEY）" }, 503);

  const body = await c.req.json().catch(() => null);
  const code: string = body?.code;
  const name: string = (body?.name || "").trim();
  const email: string = (body?.email || "").trim();
  if (!code || !name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: "code, name, email は必須です" }, 400);
  }

  const decoded = decodeEstimateCode(code);
  if (!decoded || !decoded.cat) return c.json({ error: "見積もりコードが不正です" }, 400);
  const catInfo = CATEGORY_INFO[decoded.cat];
  if (!catInfo) return c.json({ error: "不明なカテゴリです" }, 400);

  const url = new URL(c.req.url);
  const origin = `${url.protocol}//${url.host}`;
  const quoteUrl = `${origin}/quote.html?code=${encodeURIComponent(code)}`;
  const hearingUrl = `${origin}${catInfo.hearingUrl}?code=${encodeURIComponent(code)}`;
  const total = decoded.total || 0;
  const low = formatYenJP(total * 0.9);
  const high = formatYenJP(total * 1.15);

  const fromAddr = c.env.MAIL_FROM || "quotes@example.com";

  // お客様向けメール
  const customerHtml = `
    <div style="font-family:sans-serif;line-height:1.7;color:#1b2333;">
      <p>${escapeHtml(name)} 様</p>
      <p>この度はAster Systemsへお見積もりのご依頼をいただき、誠にありがとうございます。<br />
      以下の内容でお見積もりを作成いたしましたので、ご確認くださいませ。</p>
      <table style="border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">カテゴリ</td><td>${escapeHtml(catInfo.label)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">概算費用</td><td style="font-weight:bold;">${low} 〜 ${high}</td></tr>
      </table>
      <p><a href="${quoteUrl}" style="display:inline-block;background:#c9a227;color:#1b2333;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:bold;">御見積書を見る</a></p>
      <p>今後の進め方として、より正確なお見積もり・ご提案のために、下記よりヒアリングシートへのご記入をお願いしております。</p>
      <p><a href="${hearingUrl}" style="color:#c9a227;font-weight:bold;">ヒアリングシートに進む →</a></p>
      <p style="margin-top:24px;color:#8a97a0;font-size:12px;">発行日時：${decoded.ts ? new Date(decoded.ts).toLocaleString("ja-JP") : "-"}<br />
      本メールは自動送信されています。心当たりのない場合は破棄してくださいませ。</p>
    </div>
  `;

  await sendResendEmail(c.env.RESEND_API_KEY, fromAddr, [email], `【Aster Systems】御見積書のご案内（${catInfo.label}）`, customerHtml);

  // 社内通知メール
  if (c.env.COMPANY_NOTIFY_EMAIL) {
    const staffHtml = `
      <div style="font-family:sans-serif;line-height:1.7;color:#1b2333;">
        <p>見積もりシミュレーターから新しいお見積もりが作成されました。</p>
        <table style="border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">お名前</td><td>${escapeHtml(name)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">メール</td><td>${escapeHtml(email)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">カテゴリ</td><td>${escapeHtml(catInfo.label)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">概算費用</td><td>${low} 〜 ${high}</td></tr>
        </table>
        <p><a href="${quoteUrl}">御見積書を見る</a></p>
        <p style="color:#8a97a0;font-size:12px;">ヒアリングシート送信後は管理者ダッシュボード（/admin）で確認できます。</p>
      </div>
    `;
    await sendResendEmail(
      c.env.RESEND_API_KEY,
      fromAddr,
      [c.env.COMPANY_NOTIFY_EMAIL],
      `【見積もり通知】${escapeHtml(name)} 様（${catInfo.label}）`,
      staffHtml,
      email
    );
  }

  return c.json({ ok: true });
});

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (ch) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[ch];
  });
}

async function callClaude(apiKey: string, system: string, userText: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
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

function extractJson(raw: string): any {
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

app.post("/api/ai/suggest-estimate", async (c) => {
  if (!c.env.ANTHROPIC_API_KEY) return c.json({ error: "AI機能が未設定です（ANTHROPIC_API_KEY）" }, 503);
  const body = await c.req.json().catch(() => null);
  const description = body?.description?.trim();
  if (!description) return c.json({ error: "description は必須です" }, 400);
  if (description.length > 2000) return c.json({ error: "1文字以上2000文字以内で入力してください" }, 400);

  const system = `あなたはAster Systems（Web/動画/アプリ/システム開発/デザイン制作会社）の見積もり相談員です。
お客様の依頼内容の説明文から、以下のカテゴリ・プラン・オプション一覧の中から最も近いものを選び、
JSON のみを出力してください（前後に説明文を付けないこと）。

${CATEGORY_SUMMARY}

出力形式（キー名を変えないこと）:
{"category":"web|video|app|system|design","reasoning":"選定理由を80文字程度の日本語で","note":"お客様への一言コメントを80文字程度の日本語で"}
該当カテゴリが判断できない場合は category を null にしてください。`;

  try {
    const raw = await callClaude(c.env.ANTHROPIC_API_KEY, system, description);
    const parsed = extractJson(raw);
    if (!parsed) return c.json({ error: "AI応答の解析に失敗しました" }, 502);
    return c.json({ ok: true, suggestion: parsed });
  } catch (err: any) {
    return c.json({ error: err.message || "AI呼び出しに失敗しました" }, 502);
  }
});

app.post("/api/ai/hearing-assist", async (c) => {
  if (!c.env.ANTHROPIC_API_KEY) return c.json({ error: "AI機能が未設定です（ANTHROPIC_API_KEY）" }, 503);
  const body = await c.req.json().catch(() => null);
  const category = body?.category;
  const answers = body?.answers;
  if (!category || !answers) return c.json({ error: "category, answers は必須です" }, 400);

  const system = `あなたはAster Systemsの制作ディレクターです。お客様が入力中のヒアリングシート（カテゴリ: ${category}）の
回答内容（JSON）を見て、ヒアリング精度を上げるための追加確認事項を2〜4件、日本語の短い質問文の配列として提案してください。
JSONのみを出力してください（前後に説明文を付けないこと）。
出力形式: {"questions":["質問1","質問2"]}
既に回答内容に十分含まれている観点は提案しないでください。`;

  try {
    const raw = await callClaude(c.env.ANTHROPIC_API_KEY, system, JSON.stringify(answers));
    const parsed = extractJson(raw);
    if (!parsed || !Array.isArray(parsed.questions)) {
      return c.json({ error: "AI応答の解析に失敗しました" }, 502);
    }
    return c.json({ ok: true, questions: parsed.questions.slice(0, 4) });
  } catch (err: any) {
    return c.json({ error: err.message || "AI呼び出しに失敗しました" }, 502);
  }
});

// ============================================================
// 顧客マイページ：案件ID + メールアドレスで自分の案件を照会
// ============================================================
app.get("/api/mypage", async (c) => {
  const id = c.req.query("id")?.trim();
  const email = c.req.query("email")?.trim().toLowerCase();
  if (!id || !email) return c.json({ error: "id, email は必須です" }, 400);

  const caseRow: any = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first();
  if (!caseRow || String(caseRow.email || "").toLowerCase() !== email) {
    return c.json({ error: "該当する案件が見つかりませんでした。受付番号とメールアドレスをご確認ください。" }, 404);
  }

  const hearings = await c.env.DB.prepare(
    "SELECT category, answers, created_at FROM hearings WHERE case_id = ? ORDER BY created_at DESC"
  )
    .bind(id)
    .all();
  const estimates = await c.env.DB.prepare(
    "SELECT total_amount, created_at FROM estimates WHERE case_id = ? ORDER BY created_at DESC LIMIT 1"
  )
    .bind(id)
    .all();

  return c.json({
    ok: true,
    case: {
      id: caseRow.id,
      category: caseRow.category,
      status: caseRow.status,
      customer_name: caseRow.customer_name,
      created_at: caseRow.created_at,
      updated_at: caseRow.updated_at,
      estimate_code: caseRow.estimate_code,
    },
    hearingCount: hearings.results.length,
    latestEstimateTotal: estimates.results[0] ? (estimates.results[0] as any).total_amount : null,
  });
});

// ============================================================
// ページルーティング / 静的アセット
// ============================================================
app.get("/", (c) => c.redirect("/portal.html", 302));
app.get("/portal", (c) => c.redirect("/portal.html", 302));
app.get("/estimate", (c) => c.redirect("/estimate.html", 302));
app.get("/admin", (c) => c.redirect("/admin.html", 302));
app.get("/mypage", (c) => c.redirect("/mypage.html", 302));

app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
