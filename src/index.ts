import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { secureHeaders } from "hono/secure-headers";
import type { Context, Next } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { CATEGORY_INFO, CATEGORY_SUMMARY } from "./category-info";
import { callClaude, extractJson } from "./claude-client";
import { runAiPipelinePreview, generateDocument, selectPlanAndAddons, classifyInquiry } from "./ai-pipeline";
import PostalMime from "postal-mime";
import { CATEGORIES as SERVER_CATEGORIES, COMMON_ADDONS as SERVER_COMMON_ADDONS } from "./pricing-catalog";

type Bindings = {
  ASSETS: Fetcher;
  DB: D1Database;
  ANTHROPIC_API_KEY: string;
  RESEND_API_KEY: string;
  MAIL_FROM: string;
  COMPANY_NOTIFY_EMAIL: string;
  // メール受信（email()ハンドラ）はHTTPリクエストを経由しないため、
  // quote.html等へのリンクを組み立てる際の基準URLをこの変数から取る。
  // 未設定時は本番の既定ドメインにフォールバックする（下記フォールバック値を参照）。
  SITE_ORIGIN?: string;
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
// 既定のセキュリティ関連レスポンスヘッダー（X-Frame-Options, X-Content-Type-Options等）を付与。
// Content-Security-Policyは明示的に指定しない限り付与されないため、
// Google FontsやインラインCSSの読み込みには影響しない。
app.use("*", secureHeaders());

const SESSION_COOKIE = "ty_admin_session";
const SESSION_DAYS = 7;
const PBKDF2_ITERATIONS = 100000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// クライアント（hearing.js）が生成するrefCode（例: HR-20260714-AB12）の書式。
// サーバー側でも検証し、不正な値をcases.id（主キー）やメール件名へ使わないようにする。
const REF_CODE_PATTERN = /^[A-Z]{1,4}-\d{8}-[A-Z0-9]{4,8}$/;

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

function newCaseId(prefix: string): string {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ymd}-${rand}`;
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
// 乱用防止（レート制限）・監査ログ
// ------------------------------------------------------------
// 公開エンドポイント（ヒアリング送信・見積もり送信・AI呼び出し）には
// これまでCAPTCHA・IP制限等が一切なかったため、D1ベースの簡易な
// 日次レート制限を追加する（新規KV bindingは増やさない）。
// メールアドレス等の生の値は保存せず、SHA-256ハッシュのみを保存する。
// ============================================================
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return toHex(digest);
}

// 同一キー（メールアドレス等）からの1日あたりの回数を制限する。
// 上限を超えた場合はtrueを返す（呼び出し側で429等を返すこと）。
async function isRateLimited(db: D1Database, bucket: string, key: string, limitPerDay: number): Promise<boolean> {
  const keyHash = await sha256Hex(key.toLowerCase());
  const day = new Date().toISOString().slice(0, 10);
  const row: any = await db
    .prepare("SELECT count FROM rate_limits WHERE bucket = ? AND key_hash = ? AND day = ?")
    .bind(bucket, keyHash, day)
    .first();
  const count = row ? Number(row.count) : 0;
  if (count >= limitPerDay) return true;
  await db
    .prepare(
      `INSERT INTO rate_limits (bucket, key_hash, day, count) VALUES (?, ?, ?, 1)
       ON CONFLICT (bucket, key_hash, day) DO UPDATE SET count = count + 1`
    )
    .bind(bucket, keyHash, day)
    .run();
  return false;
}

// 案件に関するメール送受信・AI判定を時系列の監査ログとして記録する。
// 失敗してもリクエスト自体は継続させる（ログ保存はベストエフォート）。
async function logCaseEvent(
  db: D1Database,
  caseId: string,
  eventType: "outbound_email" | "inbound_email" | "ai_stage" | "auto_status_change",
  opts: { direction?: "in" | "out"; subject?: string; summary?: string; payload?: unknown } = {}
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO case_events (id, case_id, event_type, direction, subject, summary, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        newId(),
        caseId,
        eventType,
        opts.direction || null,
        opts.subject || null,
        opts.summary || null,
        opts.payload !== undefined ? JSON.stringify(opts.payload) : null
      )
      .run();
  } catch (err) {
    console.warn("case_eventsの記録に失敗しました:", err);
  }
}

// ============================================================
// 公開API：ヒアリング送信の保存
// ============================================================
app.post("/api/hearings", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !body.category || !body.answers) {
    return c.json({ error: "invalid payload" }, 400);
  }
  // 異常に大きいペイロード（乱用・入力ミス）を弾く。通常のヒアリング回答なら十分収まる上限。
  if (JSON.stringify(body.answers).length > 20000) {
    return c.json({ error: "入力内容が大きすぎます" }, 400);
  }

  const now = new Date().toISOString();
  const answerName = body.answers.contact_name || body.answers.company || "";
  const answerEmail = body.answers.email || "";
  const answerTel = body.answers.tel || "";
  const answerCompany = body.answers.company || "";

  // 乱用防止：同一メール（無ければ送信元IP）からの1日あたりの送信回数を制限する。
  const rateLimitKey = answerEmail || c.req.header("cf-connecting-ip") || "unknown";
  if (await isRateLimited(c.env.DB, "hearing_email", rateLimitKey, 20)) {
    return c.json({ error: "送信回数が上限に達しました。しばらくしてから再度お試しください" }, 429);
  }

  // 見積もりシミュレーターの段階で既に案件（case）が作成されている場合は
  // その case を更新する（重複した案件が作られないようにするため）。
  // お客様には hearing.js が生成した refCode（例: HR-20260714-AB12）を
  // 受付番号として表示するため、新規作成時はこれをそのまま cases.id（主キー）として使う。
  let caseId: string | null = null;
  let isNewCase = true;

  if (body.caseId) {
    const existing: any = await c.env.DB.prepare("SELECT id, email FROM cases WHERE id = ?").bind(body.caseId).first();
    if (existing) {
      caseId = body.caseId;
      isNewCase = false;
      // 既にメールアドレスが設定されている場合は上書きしない。
      // caseId（受付番号）を知っている第三者がヒアリング送信APIを直接叩いて
      // email を書き換え、正式見積書の送付先を乗っ取れてしまうのを防ぐため。
      const emailToSet = existing.email ? existing.email : answerEmail;
      await c.env.DB.prepare(
        `UPDATE cases SET status = 'hearing', customer_name = ?, email = ?, tel = ?, company = ?, updated_at = ? WHERE id = ?`
      )
        .bind(answerName, emailToSet, answerTel, answerCompany, now, caseId)
        .run();
    }
  }

  const safeRefCode = typeof body.refCode === "string" && REF_CODE_PATTERN.test(body.refCode) ? body.refCode : null;

  if (!caseId) {
    caseId = safeRefCode || newId();
    await c.env.DB.prepare(
      `INSERT INTO cases (id, category, status, customer_name, email, tel, company, created_at, updated_at)
       VALUES (?, ?, 'hearing', ?, ?, ?, ?, ?, ?)`
    )
      .bind(caseId, body.category, answerName, answerEmail, answerTel, answerCompany, now, now)
      .run();
  }

  await c.env.DB.prepare(
    `INSERT INTO hearings (id, case_id, category, answers, created_at) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(newId(), caseId, body.category, JSON.stringify(body.answers), now)
    .run();

  // 見積もりコードがあり、かつ「見積もりシミュレーター段階で作られた既存case」
  // ではない（＝estimatesレコードがまだ無い）場合のみ、ここでestimatesを記録する。
  if (body.estimateCode && isNewCase) {
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

  // ヒアリング内容の確認メール（顧客向け）。DB書き込みは既に完了しているため、
  // レスポンスは待たせずに返し、メール送信はバックグラウンドで行う
  // （失敗してもヒアリング自体の受付は成立させる）。
  if (c.env.RESEND_API_KEY && answerEmail && EMAIL_PATTERN.test(answerEmail)) {
    const url = new URL(c.req.url);
    const origin = `${url.protocol}//${url.host}`;
    const mypageUrl = `${origin}/customer/mypage.html`;
    const catLabel = CATEGORY_INFO[body.category]?.label || body.category;
    const fromAddr = c.env.MAIL_FROM || "quotes@example.com";
    const finalCaseId: string = caseId!;

    c.executionCtx.waitUntil(
      (async () => {
        const emailSettings = await getEmailSettings(c.env.DB);
        const customerHtml = `
          <div style="font-family:sans-serif;line-height:1.7;color:#1b2333;">
            <p>${escapeHtml(answerName || "お客")} 様</p>
            <p>この度はAster Systemsへヒアリング内容をご送信いただき、誠にありがとうございます。<br />
            以下の内容で受け付けいたしました。担当者より内容を確認のうえ、追ってご連絡いたします。</p>
            <table style="border-collapse:collapse;margin:16px 0;">
              <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">カテゴリ</td><td>${escapeHtml(catLabel)}</td></tr>
            </table>
            ${buildMypageNoticeHtml(finalCaseId, mypageUrl)}
            ${buildSignatureHtml(emailSettings)}
            <p style="margin-top:16px;color:#8a97a0;font-size:12px;">本メールは自動送信されています。心当たりのない場合は破棄してくださいませ。</p>
          </div>
        `;
        const customerSubject = `【Aster Systems】ヒアリング内容を受け付けました（受付番号：${finalCaseId}）`;
        const customerSent = await sendEmailSafe(
          c.env.RESEND_API_KEY,
          fromAddr,
          [answerEmail],
          customerSubject,
          customerHtml,
          "ヒアリング確認メールの送信に失敗しました（ヒアリング自体の受付は継続）:"
        );
        await logCaseEvent(c.env.DB, finalCaseId, "outbound_email", {
          direction: "out",
          subject: customerSubject,
          summary: customerSent
            ? `ヒアリング確認メールを${answerEmail}へ送信`
            : `ヒアリング確認メールの${answerEmail}への送信に失敗しました`,
          payload: { to: answerEmail, category: body.category, success: customerSent },
        });

        // オーナーへの控えメール（顧客宛メールとは別送。相互のメールアドレスを見せないため）。
        if (c.env.COMPANY_NOTIFY_EMAIL) {
          const staffSubject = `【ヒアリング通知】${answerName || "お客様"}（${catLabel}）`;
          const staffHtml = `
            <div style="font-family:sans-serif;line-height:1.7;color:#1b2333;">
              <p>ヒアリングシートが送信されました。</p>
              <table style="border-collapse:collapse;margin:16px 0;">
                <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">受付番号</td><td>${escapeHtml(finalCaseId)}</td></tr>
                <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">お名前</td><td>${escapeHtml(answerName || "-")}</td></tr>
                <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">メール</td><td>${escapeHtml(answerEmail)}</td></tr>
                <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">カテゴリ</td><td>${escapeHtml(catLabel)}</td></tr>
              </table>
              <p style="color:#8a97a0;font-size:12px;">詳細は管理者ダッシュボード（/admin）で確認できます。</p>
            </div>
          `;
          await sendEmailSafe(
            c.env.RESEND_API_KEY,
            fromAddr,
            [c.env.COMPANY_NOTIFY_EMAIL],
            staffSubject,
            staffHtml,
            "ヒアリング通知メール（社内向け）の送信に失敗しました:",
            answerEmail
          );
        }
      })()
    );
  }

  // AI全自動パイプライン（フェーズ6、既定OFF）。有効時のみヒアリング完了を
  // トリガーに発火する。レスポンスは待たせず、失敗してもヒアリング受付自体には影響しない。
  {
    const url = new URL(c.req.url);
    const origin = `${url.protocol}//${url.host}`;
    const finalCaseId: string = caseId!;
    c.executionCtx.waitUntil(
      (async () => {
        try {
          if (await isAutoPipelineEnabled(c.env.DB)) {
            await runAutoPipeline(c.env, origin, finalCaseId);
          }
        } catch (err) {
          console.warn("AI自動パイプラインの実行に失敗しました:", err);
        }
      })()
    );
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
// 管理者：見積書メールの署名・お知らせ文の設定
// ============================================================
const DEFAULT_EMAIL_SETTINGS = {
  signature_company: "株式会社Aster Systems",
  signature_name: "吉崎 天晴",
  signature_email: "t.yoshizaki@aster-system.com",
  custom_notice: "",
};

async function getEmailSettings(db: D1Database) {
  const row: any = await db.prepare("SELECT * FROM email_settings WHERE id = 'default'").first();
  if (!row) return DEFAULT_EMAIL_SETTINGS;
  return {
    signature_company: row.signature_company || DEFAULT_EMAIL_SETTINGS.signature_company,
    signature_name: row.signature_name || DEFAULT_EMAIL_SETTINGS.signature_name,
    signature_email: row.signature_email || DEFAULT_EMAIL_SETTINGS.signature_email,
    custom_notice: row.custom_notice || "",
  };
}

app.get("/api/admin/email-settings", requireAuth, async (c) => {
  const settings = await getEmailSettings(c.env.DB);
  return c.json({ settings });
});

// ============================================================
// 管理者：全自動AIパイプラインのON/OFF（フィーチャーフラグ）
// ------------------------------------------------------------
// 既定はOFF。ONにすると、ヒアリング送信時にrunAutoPipeline()が
// 発火し、正式見積書・要件定義書・仕様書の自動生成/自動送信を
// 人の確認なしで行うようになる（.claude/memory/decisions.md参照）。
// ============================================================
async function isAutoPipelineEnabled(db: D1Database): Promise<boolean> {
  const row: any = await db.prepare("SELECT enabled FROM auto_pipeline_config WHERE id = 'default'").first();
  return !!row && Number(row.enabled) === 1;
}

app.get("/api/admin/auto-pipeline", requireAuth, async (c) => {
  const enabled = await isAutoPipelineEnabled(c.env.DB);
  return c.json({ enabled });
});

app.put("/api/admin/auto-pipeline", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  const enabled = body?.enabled ? 1 : 0;
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO auto_pipeline_config (id, enabled, updated_at) VALUES ('default', ?, ?)
     ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`
  )
    .bind(enabled, now)
    .run();
  return c.json({ ok: true, enabled: !!enabled });
});

app.put("/api/admin/email-settings", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "invalid payload" }, 400);
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO email_settings (id, signature_company, signature_name, signature_email, custom_notice, updated_at)
     VALUES ('default', ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       signature_company = excluded.signature_company,
       signature_name = excluded.signature_name,
       signature_email = excluded.signature_email,
       custom_notice = excluded.custom_notice,
       updated_at = excluded.updated_at`
  )
    .bind(
      String(body.signature_company || "").trim(),
      String(body.signature_name || "").trim(),
      String(body.signature_email || "").trim(),
      String(body.custom_notice || "").trim(),
      now
    )
    .run();
  return c.json({ ok: true });
});

// ============================================================
// 料金オーバーライド（人日単価・人日数の管理画面編集）
// ------------------------------------------------------------
// プラン／オプションの「項目そのものの一覧」は public/js/pricing-config.js
// 側がカタログとして持っている。ここではその項目に対する
// 上書き値（rate/days）だけを保存・提供する。
// ============================================================
app.get("/api/pricing-overrides", async (c) => {
  const rows = await c.env.DB.prepare("SELECT category_id, item_type, item_id, rate, days FROM pricing_overrides").all();
  return c.json({ overrides: rows.results });
});

app.get("/api/admin/pricing-overrides", requireAuth, async (c) => {
  const rows = await c.env.DB.prepare("SELECT category_id, item_type, item_id, rate, days FROM pricing_overrides").all();
  return c.json({ overrides: rows.results });
});

app.put("/api/admin/pricing-overrides", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !Array.isArray(body.items)) return c.json({ error: "items(配列) は必須です" }, 400);
  const now = new Date().toISOString();
  for (const item of body.items) {
    if (!item.category_id || !item.item_type || !item.item_id) continue;
    const rate = Number(item.rate);
    const days = Number(item.days);
    if (!Number.isFinite(rate) || rate < 0 || !Number.isFinite(days) || days < 0) continue;
    await c.env.DB.prepare(
      `INSERT INTO pricing_overrides (category_id, item_type, item_id, rate, days, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(category_id, item_type, item_id) DO UPDATE SET
         rate = excluded.rate, days = excluded.days, updated_at = excluded.updated_at`
    )
      .bind(item.category_id, item.item_type, item.item_id, rate, days, now)
      .run();
  }
  return c.json({ ok: true });
});

// ============================================================
// おトクなセットプラン（bundles）
// ============================================================
app.get("/api/bundles", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM bundles WHERE active = 1 ORDER BY sort_order ASC, created_at ASC"
  ).all();
  return c.json({ bundles: rows.results.map(parseBundleRow) });
});

app.get("/api/admin/bundles", requireAuth, async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM bundles ORDER BY sort_order ASC, created_at ASC").all();
  return c.json({ bundles: rows.results.map(parseBundleRow) });
});

function parseBundleRow(row: any) {
  return {
    id: row.id,
    category_id: row.category_id,
    label: row.label,
    description: row.description,
    plan_id: row.plan_id,
    addon_ids: JSON.parse(row.addon_ids || "[]"),
    discount_type: row.discount_type,
    discount_value: row.discount_value,
    audience_tag: row.audience_tag || "",
    featured: !!row.featured,
    active: !!row.active,
    sort_order: row.sort_order,
  };
}

app.post("/api/admin/bundles", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !body.category_id || !body.label || !body.plan_id) {
    return c.json({ error: "category_id, label, plan_id は必須です" }, 400);
  }
  const id = newCaseId("BD");
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO bundles (id, category_id, label, description, plan_id, addon_ids, discount_type, discount_value, audience_tag, featured, active, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.category_id,
      body.label,
      body.description || "",
      body.plan_id,
      JSON.stringify(body.addon_ids || []),
      body.discount_type === "fixed" ? "fixed" : "percent",
      Number(body.discount_value) || 0,
      body.audience_tag || "",
      body.featured ? 1 : 0,
      body.active === false ? 0 : 1,
      Number(body.sort_order) || 0,
      now,
      now
    )
    .run();
  return c.json({ ok: true, id });
});

app.put("/api/admin/bundles/:id", requireAuth, async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "invalid payload" }, 400);
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `UPDATE bundles SET category_id=?, label=?, description=?, plan_id=?, addon_ids=?, discount_type=?, discount_value=?, audience_tag=?, featured=?, active=?, sort_order=?, updated_at=? WHERE id=?`
  )
    .bind(
      body.category_id,
      body.label,
      body.description || "",
      body.plan_id,
      JSON.stringify(body.addon_ids || []),
      body.discount_type === "fixed" ? "fixed" : "percent",
      Number(body.discount_value) || 0,
      body.audience_tag || "",
      body.featured ? 1 : 0,
      body.active === false ? 0 : 1,
      Number(body.sort_order) || 0,
      now,
      id
    )
    .run();
  return c.json({ ok: true });
});

app.delete("/api/admin/bundles/:id", requireAuth, async (c) => {
  await c.env.DB.prepare("DELETE FROM bundles WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

// ============================================================
// 納品スケジュール（delivery_options）
// ============================================================
app.get("/api/delivery-options", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM delivery_options WHERE active = 1 ORDER BY sort_order ASC, created_at ASC"
  ).all();
  return c.json({ options: rows.results });
});

app.get("/api/admin/delivery-options", requireAuth, async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM delivery_options ORDER BY sort_order ASC, created_at ASC").all();
  return c.json({ options: rows.results });
});

app.post("/api/admin/delivery-options", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !body.label) return c.json({ error: "label は必須です" }, 400);
  const id = newCaseId("DL");
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO delivery_options (id, label, description, multiplier, is_default, active, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.label,
      body.description || "",
      Number(body.multiplier) || 1,
      body.is_default ? 1 : 0,
      body.active === false ? 0 : 1,
      Number(body.sort_order) || 0,
      now,
      now
    )
    .run();
  return c.json({ ok: true, id });
});

app.put("/api/admin/delivery-options/:id", requireAuth, async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "invalid payload" }, 400);
  const now = new Date().toISOString();
  if (body.is_default) {
    // is_default はカテゴリ全体で1件のみにする
    await c.env.DB.prepare("UPDATE delivery_options SET is_default = 0").run();
  }
  await c.env.DB.prepare(
    `UPDATE delivery_options SET label=?, description=?, multiplier=?, is_default=?, active=?, sort_order=?, updated_at=? WHERE id=?`
  )
    .bind(
      body.label,
      body.description || "",
      Number(body.multiplier) || 1,
      body.is_default ? 1 : 0,
      body.active === false ? 0 : 1,
      Number(body.sort_order) || 0,
      now,
      id
    )
    .run();
  return c.json({ ok: true });
});

app.delete("/api/admin/delivery-options/:id", requireAuth, async (c) => {
  await c.env.DB.prepare("DELETE FROM delivery_options WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

// ============================================================
// キャンペーン設定（campaigns）
// 同時に有効化できるのは1件のみ。新しく有効化すると他は自動的に無効化される。
// ============================================================
app.get("/api/campaigns/active", async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const row: any = await c.env.DB.prepare(
    `SELECT * FROM campaigns WHERE active = 1
     AND (start_date IS NULL OR start_date = '' OR start_date <= ?)
     AND (end_date IS NULL OR end_date = '' OR end_date >= ?)
     ORDER BY updated_at DESC LIMIT 1`
  )
    .bind(today, today)
    .first();
  return c.json({ campaign: row || null });
});

app.get("/api/admin/campaigns", requireAuth, async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM campaigns ORDER BY created_at DESC").all();
  return c.json({ campaigns: rows.results });
});

app.post("/api/admin/campaigns", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !body.label) return c.json({ error: "label は必須です" }, 400);
  const id = newCaseId("CP");
  const now = new Date().toISOString();
  if (body.active) {
    await c.env.DB.prepare("UPDATE campaigns SET active = 0").run();
  }
  await c.env.DB.prepare(
    `INSERT INTO campaigns (id, label, banner_text, discount_type, discount_value, category_id, start_date, end_date, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.label,
      body.banner_text || "",
      body.discount_type === "fixed" ? "fixed" : "percent",
      Number(body.discount_value) || 0,
      body.category_id || null,
      body.start_date || null,
      body.end_date || null,
      body.active ? 1 : 0,
      now,
      now
    )
    .run();
  return c.json({ ok: true, id });
});

app.put("/api/admin/campaigns/:id", requireAuth, async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "invalid payload" }, 400);
  const now = new Date().toISOString();
  if (body.active) {
    await c.env.DB.prepare("UPDATE campaigns SET active = 0 WHERE id != ?").bind(id).run();
  }
  await c.env.DB.prepare(
    `UPDATE campaigns SET label=?, banner_text=?, discount_type=?, discount_value=?, category_id=?, start_date=?, end_date=?, active=?, updated_at=? WHERE id=?`
  )
    .bind(
      body.label,
      body.banner_text || "",
      body.discount_type === "fixed" ? "fixed" : "percent",
      Number(body.discount_value) || 0,
      body.category_id || null,
      body.start_date || null,
      body.end_date || null,
      body.active ? 1 : 0,
      now,
      id
    )
    .run();
  return c.json({ ok: true });
});

app.delete("/api/admin/campaigns/:id", requireAuth, async (c) => {
  await c.env.DB.prepare("DELETE FROM campaigns WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
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
// 管理者：AI自動判断パイプラインのプレビュー実行
// ------------------------------------------------------------
// 自由文の問い合わせ（メール本文の貼り付け等）を分類→ヒアリング項目の
// 構造化抽出→プラン/オプション選定まで実行し、結果をcase_eventsに記録して
// 返すだけのプレビュー専用エンドポイント。ここでは送信・見積確定・
// cases/estimatesテーブルの更新は一切行わない（フェーズ6で全自動化する際に
// runAiPipelinePreview を実行フローから呼び出す）。
// ============================================================
app.post("/api/admin/cases/:id/ai/run-pipeline", requireAuth, async (c) => {
  if (!c.env.ANTHROPIC_API_KEY) return c.json({ error: "AI機能が未設定です" }, 503);
  const id = c.req.param("id");
  const caseRow: any = await c.env.DB.prepare("SELECT id, category FROM cases WHERE id = ?").bind(id).first();
  if (!caseRow) return c.json({ error: "案件が見つかりません" }, 404);

  const body = await c.req.json().catch(() => null);
  const freeText: string = (body?.freeText || "").trim();
  if (!freeText) return c.json({ error: "freeText は必須です" }, 400);
  if (freeText.length > 4000) return c.json({ error: "4000文字以内で入力してください" }, 400);

  try {
    const result = await runAiPipelinePreview(c.env.ANTHROPIC_API_KEY, freeText, caseRow.category || null);
    // 金額はAI自身の判断（selection.aiTotal）をそのまま表示する
    // （2026-08-29、ユーザー明示指示によりcomputeServerSideTotalへの委譲を撤廃）。
    const estimatePreview = result.selection?.aiTotal != null ? { total: result.selection.aiTotal } : null;
    await logCaseEvent(c.env.DB, id!, "ai_stage", {
      summary: `AIパイプラインをプレビュー実行（カテゴリ:${result.classification.category ?? "不明"}、プラン:${result.selection?.planId ?? "未確定"}、金額:${result.selection?.aiTotal ?? "未確定"}）`,
      payload: { freeText, ...result, estimatePreview },
    });
    return c.json({ ok: true, result, estimatePreview });
  } catch (err: any) {
    console.warn("run-pipeline failed:", err);
    return c.json({ error: "AIパイプラインの実行に失敗しました" }, 502);
  }
});

// ============================================================
// 管理者：新資料（要件定義書・仕様書）の生成・閲覧
// ------------------------------------------------------------
// 社内専用（顧客への送付は行わない）。ヒアリング回答・見積もりコードの
// デコード結果「だけ」を根拠にAIへ文章化させる。生成のたびに新しい
// versionとしてINSERTし、表示・取得は常に最新版を返す。
// ============================================================
const DOCUMENT_TYPES = new Set(["requirements", "spec", "detailed_design"]);
const DOCUMENT_TYPE_LABELS: Record<string, string> = { requirements: "要件定義書", spec: "仕様書", detailed_design: "詳細設計書" };

function resolveEstimateLabels(categoryId: string | null, decoded: any): { planLabel: string | null; addonLabels: string[] } {
  const cat = categoryId ? SERVER_CATEGORIES.find((c) => c.id === categoryId) : null;
  if (!cat || !decoded) return { planLabel: null, addonLabels: [] };
  const plan = cat.plans.find((p) => p.id === decoded.plan);
  const addonLabels: string[] = [];
  Object.entries(decoded.addons || {}).forEach(([addonId, val]) => {
    if (!val) return;
    const addon = cat.addons.find((a) => a.id === addonId) || SERVER_COMMON_ADDONS.find((a) => a.id === addonId);
    if (addon) addonLabels.push(addon.label);
  });
  return { planLabel: plan ? plan.label : null, addonLabels };
}

// admin手動（documents/generate）とAI自動パイプラインの両方から呼べる共有関数。
// ヒアリング・見積もり情報が無い場合はnullを返す（呼び出し側でエラー/スキップを判断する）。
async function generateAndSaveDocument(
  env: Bindings,
  caseId: string,
  docType: "requirements" | "spec" | "detailed_design"
): Promise<{ id: string; version: number; sections: Awaited<ReturnType<typeof generateDocument>>; createdAt: string } | null> {
  const caseRow: any = await env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(caseId).first();
  if (!caseRow) return null;

  const latestHearing: any = await env.DB.prepare(
    "SELECT * FROM hearings WHERE case_id = ? ORDER BY created_at DESC LIMIT 1"
  ).bind(caseId).first();
  const latestEstimate: any = await env.DB.prepare(
    "SELECT * FROM estimates WHERE case_id = ? ORDER BY created_at DESC LIMIT 1"
  ).bind(caseId).first();
  if (!latestHearing && !latestEstimate) return null;

  const category = caseRow.category || latestHearing?.category || null;
  const catInfo = category ? CATEGORY_INFO[category] : null;
  const answers = latestHearing ? JSON.parse(latestHearing.answers) : {};
  const decodedEstimate = latestEstimate ? JSON.parse(latestEstimate.items) : null;
  const { planLabel, addonLabels } = resolveEstimateLabels(category, decodedEstimate);

  const sections = await generateDocument(env.ANTHROPIC_API_KEY, docType, {
    category: category || "",
    categoryLabel: catInfo?.label || category || "",
    answers,
    planLabel,
    addonLabels,
    total: latestEstimate ? Number(latestEstimate.total_amount) : null,
  });

  const versionRow: any = await env.DB.prepare(
    "SELECT MAX(version) as maxVersion FROM documents WHERE case_id = ? AND doc_type = ?"
  ).bind(caseId, docType).first();
  const version = (versionRow?.maxVersion || 0) + 1;
  const docId = newId();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO documents (id, case_id, doc_type, version, content_json, generated_by, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'ai', 'draft', ?, ?)`
  )
    .bind(docId, caseId, docType, version, JSON.stringify(sections), now, now)
    .run();

  await logCaseEvent(env.DB, caseId, "ai_stage", {
    summary: `${DOCUMENT_TYPE_LABELS[docType] || docType}の下書きを生成（version ${version}）`,
    payload: { docType, version, sectionCount: sections.length },
  });

  return { id: docId, version, sections, createdAt: now };
}

app.post("/api/admin/cases/:id/documents/generate", requireAuth, async (c) => {
  if (!c.env.ANTHROPIC_API_KEY) return c.json({ error: "AI機能が未設定です" }, 503);
  const id = c.req.param("id")!;
  const body = await c.req.json().catch(() => null);
  const docType = body?.docType;
  if (!DOCUMENT_TYPES.has(docType)) return c.json({ error: "docType は 'requirements'・'spec'・'detailed_design' のいずれかを指定してください" }, 400);

  const caseRow = await c.env.DB.prepare("SELECT id FROM cases WHERE id = ?").bind(id).first();
  if (!caseRow) return c.json({ error: "案件が見つかりません" }, 404);

  try {
    const doc = await generateAndSaveDocument(c.env, id, docType);
    if (!doc) return c.json({ error: "この案件にはヒアリング回答・見積もり情報がまだありません" }, 400);
    return c.json({
      ok: true,
      document: { id: doc.id, docType, version: doc.version, sections: doc.sections, generatedBy: "ai", status: "draft", createdAt: doc.createdAt },
    });
  } catch (err: any) {
    console.warn("documents/generate failed:", err);
    return c.json({ error: "資料の生成に失敗しました" }, 502);
  }
});

app.get("/api/admin/cases/:id/documents/:docType", requireAuth, async (c) => {
  const id = c.req.param("id");
  const docType = c.req.param("docType") || "";
  if (!DOCUMENT_TYPES.has(docType)) return c.json({ error: "docType は 'requirements'・'spec'・'detailed_design' のいずれかを指定してください" }, 400);

  const row: any = await c.env.DB.prepare(
    "SELECT * FROM documents WHERE case_id = ? AND doc_type = ? ORDER BY version DESC LIMIT 1"
  ).bind(id, docType).first();
  if (!row) return c.json({ error: "この案件にはまだ資料が生成されていません" }, 404);

  return c.json({
    ok: true,
    document: {
      id: row.id,
      docType: row.doc_type,
      version: row.version,
      sections: JSON.parse(row.content_json),
      generatedBy: row.generated_by,
      status: row.status,
      createdAt: row.created_at,
    },
  });
});

// ============================================================
// 管理者：案件の全メール送受信・AI判定を時系列で確認する
// （「やり取りは必ず見えるように」を満たす監査ログ閲覧）
// ============================================================
app.get("/api/admin/cases/:id/events", requireAuth, async (c) => {
  const id = c.req.param("id");
  const caseRow = await c.env.DB.prepare("SELECT id FROM cases WHERE id = ?").bind(id).first();
  if (!caseRow) return c.json({ error: "案件が見つかりません" }, 404);

  const rows = await c.env.DB.prepare(
    "SELECT * FROM case_events WHERE case_id = ? ORDER BY created_at ASC"
  ).bind(id).all();

  const events = (rows.results || []).map((r: any) => ({
    id: r.id,
    eventType: r.event_type,
    direction: r.direction,
    subject: r.subject,
    summary: r.summary,
    payload: r.payload_json ? JSON.parse(r.payload_json) : null,
    createdAt: r.created_at,
  }));

  return c.json({ ok: true, events });
});

// ============================================================
// AI：見積もり提案・ヒアリング補助（Claude API）
// ------------------------------------------------------------
// CATEGORY_INFO / CATEGORY_SUMMARY は src/category-info.ts に切り出してある
// （src/ai-pipeline.ts と共有するため）。public/js/pricing-config.js の
// 内容と手動で同期させる必要がある点は変わらない。
// ============================================================

function decodeEstimateCode(code: string): any {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(code))));
  } catch (e) {
    return null;
  }
}

// public/js/estimate.js の encodeEstimate() と同一の方式（Unicode安全なBase64）。
// AI自動パイプラインがプラン/オプションを選定した場合に、既存のquote.html等が
// そのまま使える「見積もりコード」をサーバー側で発行するために使う。
function encodeEstimateServerSide(payload: { v: number; cat: string; plan: string; addons: Record<string, boolean | number>; total: number; ts: number }): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
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

// 顧客向けメールの送信失敗を握りつぶし、警告ログのみ残す（受付・登録自体は継続させるため）。
// 戻り値で成否を返す（呼び出し元がcase_eventsに正しい結果を記録できるようにするため）。
async function sendEmailSafe(
  apiKey: string,
  from: string,
  to: string[],
  subject: string,
  html: string,
  warnMessage: string,
  replyTo?: string
): Promise<boolean> {
  try {
    await sendResendEmail(apiKey, from, to, subject, html, replyTo);
    return true;
  } catch (err) {
    console.warn(warnMessage, err);
    return false;
  }
}

type EmailSignatureSettings = { signature_company: string; signature_name: string; signature_email: string };

function buildSignatureHtml(emailSettings: EmailSignatureSettings): string {
  return `
    <p style="margin-top:20px;padding-top:16px;border-top:1px solid #e3e8ec;color:#1b2333;">
      ${escapeHtml(emailSettings.signature_company)}<br />
      担当：${escapeHtml(emailSettings.signature_name)}<br />
      <a href="mailto:${escapeHtml(emailSettings.signature_email)}" style="color:#5c6b74;">${escapeHtml(emailSettings.signature_email)}</a>
    </p>
  `;
}

function buildCustomNoticeHtml(customNotice: string): string {
  return customNotice
    ? `<p style="margin-top:16px;padding:12px 14px;background:#f7efd6;border-radius:8px;color:#1b2333;">${escapeHtml(customNotice).replace(/\n/g, "<br />")}</p>`
    : "";
}

// 見積り・ヒアリング確認メール、正式見積書メールに共通で載せる「受付番号＋マイページ導線」ブロック。
function buildMypageNoticeHtml(caseId: string, mypageUrl: string): string {
  return `
    <p style="margin-top:16px;padding:12px 14px;background:#f5f6f8;border-radius:8px;font-size:13px;">
      受付番号：<strong>${escapeHtml(caseId)}</strong><br />
      この受付番号とご登録のメールアドレスで、<a href="${mypageUrl}" style="color:#c9a227;">マイページ</a>から進捗を確認できます。
    </p>
  `;
}

app.post("/api/estimates/send", async (c) => {
  if (!c.env.RESEND_API_KEY) return c.json({ error: "メール送信機能が未設定です" }, 503);

  const body = await c.req.json().catch(() => null);
  const code: string = body?.code;
  const name: string = (body?.name || "").trim();
  const email: string = (body?.email || "").trim();
  if (!code || !name || !email || !EMAIL_PATTERN.test(email) || name.length > 200 || email.length > 200) {
    return c.json({ error: "code, name, email は必須です" }, 400);
  }

  if (await isRateLimited(c.env.DB, "estimate_email", email, 20)) {
    return c.json({ error: "送信回数が上限に達しました。しばらくしてから再度お試しください" }, 429);
  }

  const decoded = decodeEstimateCode(code);
  if (!decoded || !decoded.cat) return c.json({ error: "見積もりコードが不正です" }, 400);
  const catInfo = CATEGORY_INFO[decoded.cat];
  if (!catInfo) return c.json({ error: "不明なカテゴリです" }, 400);

  // この時点で案件（case）を作成し、ヒアリング未着手でも管理者ダッシュボードに
  // 「新規受付」として表示されるようにする。ヒアリングシート送信時にはこの
  // caseId を引き継いで更新する（重複した案件が作られないようにするため）。
  //
  // 問い合わせメール受信（handleInboundEmail）で先に案件が作られている場合は、
  // その案件をそのまま更新する（メール起点の案件とシミュレーター起点の案件が
  // 別々の重複案件にならないようにするため、2026-08-30追加）。
  let caseId: string | null = null;
  let existingCaseEmail: string | null = null;
  if (typeof body?.caseId === "string" && body.caseId.length > 0 && body.caseId.length <= 100) {
    const existing: any = await c.env.DB.prepare("SELECT id, email, status FROM cases WHERE id = ?").bind(body.caseId).first();
    // ヒアリング以降に進んでいる案件（hearing/quoted/won/lost）は上書き対象にしない。
    // 古いメールのリンクを踏み直した・caseIdを知った第三者が叩いた等の場合に、
    // 既に確定した金額・カテゴリが黙って書き換わってしまうのを防ぐため
    // （見積金額を絶対に壊さないという最優先事項に抵触するリスクのため2026-08-30追加）。
    if (existing && (existing.status === "new" || existing.status === "needs_info")) {
      caseId = existing.id;
      existingCaseEmail = existing.email;
    }
  }

  const now = new Date().toISOString();
  if (caseId) {
    // 既にメールアドレスが設定されている場合は上書きしない（第三者がcaseIdを
    // 知ってこのAPIを直接叩き、送付先メールアドレスを乗っ取れてしまうのを防ぐため）。
    const emailToSet = existingCaseEmail || email;
    await c.env.DB.prepare(
      `UPDATE cases SET category = ?, status = 'new', customer_name = ?, email = ?, estimate_code = ?, estimate_total = ?, updated_at = ? WHERE id = ?`
    )
      .bind(decoded.cat, name, emailToSet, code, decoded.total || 0, now, caseId)
      .run();
  } else {
    caseId = newCaseId("C");
    await c.env.DB.prepare(
      `INSERT INTO cases (id, category, status, customer_name, email, estimate_code, estimate_total, created_at, updated_at)
       VALUES (?, ?, 'new', ?, ?, ?, ?, ?, ?)`
    )
      .bind(caseId, decoded.cat, name, email, code, decoded.total || 0, now, now)
      .run();
  }
  await c.env.DB.prepare(
    `INSERT INTO estimates (id, case_id, items, total_amount, created_at) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(newId(), caseId, JSON.stringify(decoded), decoded.total || 0, now)
    .run();

  const url = new URL(c.req.url);
  const origin = `${url.protocol}//${url.host}`;
  const quoteUrl = `${origin}/customer/quote.html?code=${encodeURIComponent(code)}`;
  const hearingUrl = `${origin}${catInfo.hearingUrl}?code=${encodeURIComponent(code)}&caseId=${encodeURIComponent(caseId)}`;
  const mypageUrl = `${origin}/customer/mypage.html`;
  const total = decoded.total || 0;
  const low = formatYenJP(total * 0.9);
  const high = formatYenJP(total * 1.15);

  const fromAddr = c.env.MAIL_FROM || "quotes@example.com";

  // メール送信はDB登録完了後にバックグラウンドで行い、レスポンス（caseId等）は待たせない。
  // 失敗しても見積もり自体の受付・DB登録は既に完了しているため影響しない。
  c.executionCtx.waitUntil(
    (async () => {
      const emailSettings = await getEmailSettings(c.env.DB);
      const signatureHtml = buildSignatureHtml(emailSettings);
      const noticeHtml = buildCustomNoticeHtml(emailSettings.custom_notice);

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
          ${buildMypageNoticeHtml(caseId, mypageUrl)}
          ${noticeHtml}
          ${signatureHtml}
          <p style="margin-top:16px;color:#8a97a0;font-size:12px;">発行日時：${decoded.ts ? new Date(decoded.ts).toLocaleString("ja-JP") : "-"}<br />
          本メールは自動送信されています。心当たりのない場合は破棄してくださいませ。</p>
        </div>
      `;

      const customerSubject = `【Aster Systems】御見積書のご案内（${catInfo.label}）`;
      const tasks = [
        sendEmailSafe(
          c.env.RESEND_API_KEY,
          fromAddr,
          [email],
          customerSubject,
          customerHtml,
          "見積り確認メールの送信に失敗しました（見積もり自体の受付は継続）:"
        ),
      ];

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
        tasks.push(
          sendEmailSafe(
            c.env.RESEND_API_KEY,
            fromAddr,
            [c.env.COMPANY_NOTIFY_EMAIL],
            `【見積もり通知】${escapeHtml(name)} 様（${catInfo.label}）`,
            staffHtml,
            "社内通知メールの送信に失敗しました（見積もり自体の受付は継続）:",
            email
          )
        );
      }

      const [customerSent] = await Promise.all(tasks);
      await logCaseEvent(c.env.DB, caseId, "outbound_email", {
        direction: "out",
        subject: customerSubject,
        summary: customerSent
          ? `見積もりメールを${email}へ送信（概算 ${low}〜${high}）`
          : `見積もりメールの${email}への送信に失敗しました`,
        payload: { to: email, category: decoded.cat, total, success: customerSent },
      });
    })()
  );

  return c.json({ ok: true, caseId });
});

class QuoteError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// 正式見積書の送付を admin 手動（send-formal-quote）と AI自動パイプライン
// （runAutoPipeline）の両方から共通で呼べるようにした共有関数。
async function issueFormalQuote(
  env: Bindings,
  origin: string,
  caseId: string,
  opts: { triggeredBy: "admin" | "auto"; adminId?: string; adminName?: string }
): Promise<{ email: string; total: number }> {
  if (!env.RESEND_API_KEY) throw new QuoteError("メール送信機能が未設定です", 503);

  const caseRow: any = await env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(caseId).first();
  if (!caseRow) throw new QuoteError("案件が見つかりません", 404);
  if (!caseRow.email) throw new QuoteError("お客様のメールアドレスが登録されていません", 400);
  if (!caseRow.estimate_code) throw new QuoteError("この案件には見積もりコードがありません", 400);

  const decoded = decodeEstimateCode(caseRow.estimate_code);
  if (!decoded) throw new QuoteError("見積もりコードの解析に失敗しました", 400);
  const catInfo = CATEGORY_INFO[caseRow.category];
  if (!catInfo) throw new QuoteError("不明なカテゴリです", 400);

  const quoteUrl = `${origin}/customer/quote.html?code=${encodeURIComponent(caseRow.estimate_code)}`;
  const mypageUrl = `${origin}/customer/mypage.html`;
  const total = caseRow.estimate_total || decoded.total || 0;
  const fromAddr = env.MAIL_FROM || "quotes@example.com";
  const emailSettings = await getEmailSettings(env.DB);
  const customerName = caseRow.customer_name || "お客様";

  const html = `
    <div style="font-family:sans-serif;line-height:1.7;color:#1b2333;">
      <p>${escapeHtml(customerName)} 様</p>
      <p>この度はヒアリングにご協力いただき、誠にありがとうございました。<br />
      いただいた内容をもとに、正式な御見積書を作成いたしましたのでご確認くださいませ。</p>
      <table style="border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">カテゴリ</td><td>${escapeHtml(catInfo.label)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">御見積金額</td><td style="font-weight:bold;">${formatYenJP(total)}（税別）</td></tr>
      </table>
      <p><a href="${quoteUrl}" style="display:inline-block;background:#c9a227;color:#1b2333;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:bold;">正式な御見積書を見る</a></p>
      ${buildMypageNoticeHtml(caseId, mypageUrl)}
      ${buildCustomNoticeHtml(emailSettings.custom_notice)}
      ${buildSignatureHtml(emailSettings)}
      <p style="margin-top:16px;color:#8a97a0;font-size:12px;">本メールは自動送信されています。心当たりのない場合は破棄してくださいませ。</p>
    </div>
  `;

  const formalSubject = `【Aster Systems】正式御見積書のご案内（${catInfo.label}）`;
  await sendResendEmail(env.RESEND_API_KEY, fromAddr, [caseRow.email], formalSubject, html);

  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE cases SET status = 'quoted', updated_at = ? WHERE id = ?").bind(now, caseId).run();

  const noteSuffix = opts.triggeredBy === "auto" ? "（AI自動パイプラインによる自動送信）" : "";
  await env.DB.prepare(
    `INSERT INTO case_logs (id, case_id, note, status_before, status_after, admin_id) VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(newId(), caseId, `正式な見積書をメール送信${noteSuffix}`, caseRow.status, "quoted", opts.adminId || null)
    .run();

  await logCaseEvent(env.DB, caseId, "outbound_email", {
    direction: "out",
    subject: formalSubject,
    summary:
      opts.triggeredBy === "auto"
        ? `正式見積書メールを${caseRow.email}へ自動送信（${formatYenJP(total)}）`
        : `正式見積書メールを${caseRow.email}へ送信（${formatYenJP(total)}、担当:${opts.adminName}）`,
    payload: { to: caseRow.email, total, triggeredBy: opts.triggeredBy, adminId: opts.adminId || null },
  });

  // オーナーへの控えメール（正式見積書は従来オーナーに一切通知されていなかったため追加）。
  if (env.COMPANY_NOTIFY_EMAIL) {
    const staffHtml = `
      <div style="font-family:sans-serif;line-height:1.7;color:#1b2333;">
        <p>正式な御見積書を送信しました（${opts.triggeredBy === "auto" ? "AI自動パイプラインによる自動送信" : `担当：${escapeHtml(opts.adminName || "")}`}）。</p>
        <table style="border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">受付番号</td><td>${escapeHtml(caseId)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">お客様</td><td>${escapeHtml(customerName)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">メール</td><td>${escapeHtml(caseRow.email)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">カテゴリ</td><td>${escapeHtml(catInfo.label)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">御見積金額</td><td>${formatYenJP(total)}（税別）</td></tr>
        </table>
      </div>
    `;
    await sendEmailSafe(
      env.RESEND_API_KEY,
      fromAddr,
      [env.COMPANY_NOTIFY_EMAIL],
      `【正式見積書送付】${customerName} 様（${catInfo.label}）`,
      staffHtml,
      "正式見積書の社内通知メール送信に失敗しました（見積書自体の送付は完了済み）:",
      caseRow.email
    );
  }

  return { email: caseRow.email, total };
}

app.post("/api/admin/cases/:id/send-formal-quote", requireAuth, async (c) => {
  const id = c.req.param("id")!;
  const admin = c.get("admin");
  const url = new URL(c.req.url);
  const origin = `${url.protocol}//${url.host}`;

  try {
    const result = await issueFormalQuote(c.env, origin, id, { triggeredBy: "admin", adminId: admin.id, adminName: admin.name });
    return c.json({ ok: true, email: result.email });
  } catch (err: any) {
    const status = err instanceof QuoteError ? err.status : 500;
    if (!(err instanceof QuoteError)) console.warn("send-formal-quote failed:", err);
    return c.json({ error: err.message || "送信に失敗しました" }, status as ContentfulStatusCode);
  }
});

// AIがプランを確信を持って選定できなかった場合に送る、確認をお願いするメール。
// 金額は一切記載しない（決まっていないものを決まっているかのように書かない）。
async function sendClarificationEmail(
  env: Bindings,
  origin: string,
  caseRow: any,
  unresolvedQuestions: string[]
): Promise<void> {
  if (!env.RESEND_API_KEY || !caseRow.email || !EMAIL_PATTERN.test(caseRow.email)) return;
  const fromAddr = env.MAIL_FROM || "quotes@example.com";
  const emailSettings = await getEmailSettings(env.DB);
  const customerName = caseRow.customer_name || "お客様";
  const mypageUrl = `${origin}/customer/mypage.html`;

  const questionsHtml = unresolvedQuestions.length
    ? `<ul>${unresolvedQuestions.map((q) => `<li>${escapeHtml(q)}</li>`).join("")}</ul>`
    : "<p>いただいたご依頼内容について、担当者より改めてご連絡させていただきます。</p>";

  const html = `
    <div style="font-family:sans-serif;line-height:1.7;color:#1b2333;">
      <p>${escapeHtml(customerName)} 様</p>
      <p>この度はヒアリングにご協力いただき、誠にありがとうございます。<br />
      より正確なお見積もりをご案内するため、以下の点について追加でご確認させてください。</p>
      ${questionsHtml}
      ${buildMypageNoticeHtml(caseRow.id, mypageUrl)}
      ${buildCustomNoticeHtml(emailSettings.custom_notice)}
      ${buildSignatureHtml(emailSettings)}
      <p style="margin-top:16px;color:#8a97a0;font-size:12px;">本メールは自動送信されています。心当たりのない場合は破棄してくださいませ。</p>
    </div>
  `;
  const subject = "【Aster Systems】ご依頼内容について確認をお願いいたします";
  const sent = await sendEmailSafe(env.RESEND_API_KEY, fromAddr, [caseRow.email], subject, html, "確認依頼メールの送信に失敗しました:");
  await logCaseEvent(env.DB, caseRow.id, "outbound_email", {
    direction: "out",
    subject,
    summary: sent
      ? `AIがプランを確定できなかったため確認依頼メールを${caseRow.email}へ自動送信`
      : `確認依頼メールの${caseRow.email}への送信に失敗しました`,
    payload: { to: caseRow.email, unresolvedQuestions, success: sent },
  });

  if (env.COMPANY_NOTIFY_EMAIL) {
    const staffHtml = `
      <div style="font-family:sans-serif;line-height:1.7;color:#1b2333;">
        <p>AI自動パイプラインが、以下の案件でプランを確定できませんでした（正式見積書は自動送信していません）。</p>
        <table style="border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">受付番号</td><td>${escapeHtml(caseRow.id)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">お客様</td><td>${escapeHtml(customerName)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">メール</td><td>${escapeHtml(caseRow.email)}</td></tr>
        </table>
        ${questionsHtml}
        <p style="color:#8a97a0;font-size:12px;">案件一覧（/admin）で内容を確認し、必要に応じて手動で対応してください。</p>
      </div>
    `;
    await sendEmailSafe(
      env.RESEND_API_KEY,
      fromAddr,
      [env.COMPANY_NOTIFY_EMAIL],
      `【要確認】AIがプラン確定できませんでした（${customerName} 様）`,
      staffHtml,
      "確認依頼の社内通知メール送信に失敗しました:",
      caseRow.email
    );
  }
}

// ============================================================
// AI全自動オーケストレーション（フェーズ6）
// ------------------------------------------------------------
// 起点はサイト操作（ヒアリング送信）のみ。auto_pipeline_config.enabled
// がONの場合のみ、/api/hearings のPOST処理から waitUntil() で発火する。
//
// 金額はAI自身の判断（selectPlanAndAddonsが返すaiTotal）をそのまま使う
// （2026-08-29、ユーザー明示指示により決定的ロジックへの委譲・
// ホワイトリスト照合を撤廃。経緯は.claude/memory/decisions.md参照）。
// AIが金額を全く判断できなかった場合のみ、確定させず確認メールを送るに
// とどめる。
// ============================================================
async function runAutoPipeline(env: Bindings, origin: string, caseId: string): Promise<void> {
  if (!env.ANTHROPIC_API_KEY || !env.RESEND_API_KEY) {
    console.warn("auto pipeline skipped: ANTHROPIC_API_KEY/RESEND_API_KEYが未設定です");
    return;
  }

  const caseRow: any = await env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(caseId).first();
  if (!caseRow) return;

  const latestHearing: any = await env.DB.prepare(
    "SELECT * FROM hearings WHERE case_id = ? ORDER BY created_at DESC LIMIT 1"
  ).bind(caseId).first();
  if (!latestHearing) return;

  const category = caseRow.category || latestHearing.category;
  const answers = JSON.parse(latestHearing.answers);

  // すでに見積もりシミュレーターでお客様自身が確定した見積もりコードがある場合は、
  // その金額をそのまま正として扱う。それ以外はAI自身が金額を判断する
  // （2026-08-29、ユーザー明示指示によりcomputeServerSideTotalへの委譲を撤廃）。
  if (!caseRow.estimate_code) {
    let selection;
    try {
      selection = await selectPlanAndAddons(env.ANTHROPIC_API_KEY, category, answers);
    } catch (err: any) {
      // AI呼び出し自体の失敗（APIキー不正・障害等）は「判断できなかった」とは区別する。
      // 誤解を招く確認メールは送らず、人が案件一覧から手動対応できる状態のまま留める。
      console.warn("自動パイプライン：プラン選定のAI呼び出しに失敗しました:", err);
      await logCaseEvent(env.DB, caseId, "ai_stage", {
        summary: `自動パイプライン：プラン選定のAI呼び出しに失敗しました（${err.message || err}）`,
      });
      return;
    }
    await logCaseEvent(env.DB, caseId, "ai_stage", {
      summary: `自動パイプライン：プラン・金額をAIが判断（プラン:${selection.planId ?? "未確定"}、金額:${selection.aiTotal ?? "未確定"}、確信度:${selection.confidence}）`,
      payload: selection,
    });

    if (selection.aiTotal === null) {
      await sendClarificationEmail(env, origin, caseRow, selection.unresolvedQuestions);
      const now = new Date().toISOString();
      await env.DB.prepare("UPDATE cases SET status = 'needs_info', updated_at = ? WHERE id = ?").bind(now, caseId).run();
      await logCaseEvent(env.DB, caseId, "auto_status_change", {
        summary: "AIが金額を判断できなかったため needs_info に変更し、確認メールを自動送信しました",
      });
      return;
    }

    const addonsMap = Object.fromEntries(selection.addonIds.map((addonId) => [addonId, true]));
    const total = selection.aiTotal;

    const estimatePayload = { v: 1, cat: category, plan: selection.planId || "ai-judged", addons: addonsMap, total, ts: Date.now() };
    const estimateCode = encodeEstimateServerSide(estimatePayload);
    const now = new Date().toISOString();

    await env.DB.prepare(`INSERT INTO estimates (id, case_id, items, total_amount, created_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(newId(), caseId, JSON.stringify(estimatePayload), total, now)
      .run();
    await env.DB.prepare("UPDATE cases SET estimate_code = ?, estimate_total = ?, updated_at = ? WHERE id = ?")
      .bind(estimateCode, total, now, caseId)
      .run();

    caseRow.estimate_code = estimateCode;
    caseRow.estimate_total = total;

    await logCaseEvent(env.DB, caseId, "auto_status_change", {
      summary: `自動パイプライン：AIの判断で見積もりを確定（${formatYenJP(total)}）`,
      payload: { planId: selection.planId, addonIds: selection.addonIds, total, reasoning: selection.reasoning },
    });
  }

  // 資料生成（要件定義書・仕様書・詳細設計書、社内専用）。失敗しても見積書の自動送信は継続する。
  for (const docType of ["requirements", "spec", "detailed_design"] as const) {
    try {
      await generateAndSaveDocument(env, caseId, docType);
    } catch (err: any) {
      console.warn(`自動パイプライン：${docType}の生成に失敗しました:`, err);
      await logCaseEvent(env.DB, caseId, "ai_stage", {
        summary: `自動パイプライン：${DOCUMENT_TYPE_LABELS[docType] || docType}の生成に失敗しました（${err.message || err}）`,
      });
    }
  }

  // 正式見積書の自動送信
  try {
    await issueFormalQuote(env, origin, caseId, { triggeredBy: "auto" });
  } catch (err: any) {
    console.warn("自動パイプライン：正式見積書の自動送信に失敗しました:", err);
    await logCaseEvent(env.DB, caseId, "ai_stage", {
      summary: `自動見積書送信に失敗しました: ${err.message || err}`,
    });
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (ch) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[ch];
  });
}

app.post("/api/ai/suggest-estimate", async (c) => {
  if (!c.env.ANTHROPIC_API_KEY) return c.json({ error: "AI機能が未設定です" }, 503);
  const body = await c.req.json().catch(() => null);
  const description = body?.description?.trim();
  if (!description) return c.json({ error: "description は必須です" }, 400);
  if (description.length > 2000) return c.json({ error: "1文字以上2000文字以内で入力してください" }, 400);

  const clientIp = c.req.header("cf-connecting-ip") || "unknown";
  if (await isRateLimited(c.env.DB, "ai_suggest", clientIp, 30)) {
    return c.json({ error: "利用回数が上限に達しました。しばらくしてから再度お試しください" }, 429);
  }

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
    console.warn("suggest-estimate failed:", err);
    return c.json({ error: "AI呼び出しに失敗しました" }, 502);
  }
});

app.post("/api/ai/hearing-assist", async (c) => {
  if (!c.env.ANTHROPIC_API_KEY) return c.json({ error: "AI機能が未設定です" }, 503);
  const body = await c.req.json().catch(() => null);
  const category = body?.category;
  const answers = body?.answers;
  if (!category || !answers) return c.json({ error: "category, answers は必須です" }, 400);
  // AI呼び出しのコスト乱用を防ぐため、送信できる回答量に上限を設ける。
  if (JSON.stringify(answers).length > 8000) return c.json({ error: "入力内容が大きすぎます" }, 400);

  const clientIp = c.req.header("cf-connecting-ip") || "unknown";
  if (await isRateLimited(c.env.DB, "ai_hearing_assist", clientIp, 30)) {
    return c.json({ error: "利用回数が上限に達しました。しばらくしてから再度お試しください" }, 429);
  }

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
    console.warn("hearing-assist failed:", err);
    return c.json({ error: "AI呼び出しに失敗しました" }, 502);
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
app.get("/estimate", (c) => c.redirect("/customer/estimate.html", 302));
app.get("/admin", (c) => c.redirect("/admin/admin.html", 302));
app.get("/mypage", (c) => c.redirect("/customer/mypage.html", 302));

app.get("*", async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  // ASSETS.fetch() が返すResponseはヘッダーがイミュータブルなため、
  // secureHeadersミドルウェア（後段でヘッダーを追記する）が書き込めるよう複製する。
  return new Response(res.body, res);
});

// ============================================================
// メール受信（フェーズ7）
// ------------------------------------------------------------
// Cloudflare Email Routingからの着信を受け取るハンドラ。
// 前提として、受信用ドメインをCloudflareにオンボードし、ダッシュボード/
// `wrangler email routing rules create` で本Workerへのルーティング規則を
// 作成しておく必要がある（コード側の変更だけでは受信は有効化されない）。
//
// message.from / message.to はSMTPエンベロープの値（なりすまし困難）を
// 信頼し、ヘッダーのFrom等は信頼しない。送信は既存のResend経由をそのまま
// 流用し、Cloudflareのsend_email bindingは導入しない（送信経路を一本化する
// ため）。
// ============================================================
const DEFAULT_SITE_ORIGIN = "https://studio.aster-system.com";

function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 受信直後に送る一次受付メール。見積もりシミュレーター→ヒアリングシートという
// 通常の受付フローへお客様を案内する（2026-08-30、メール本文からの自動抽出をやめ、
// サイト経由の通常フローに合流させる方針に変更）。
async function sendInboundAcknowledgementEmail(env: Bindings, origin: string, caseRow: any): Promise<void> {
  if (!env.RESEND_API_KEY || !caseRow.email || !EMAIL_PATTERN.test(caseRow.email)) return;
  const fromAddr = env.MAIL_FROM || "quotes@example.com";
  const emailSettings = await getEmailSettings(env.DB);
  const customerName = caseRow.customer_name || "お客様";
  const mypageUrl = `${origin}/customer/mypage.html`;
  // このcaseIdを引き継ぐことで、シミュレーターで見積もりを作成した際に
  // 別の新規案件にならず、同一案件として更新される（/api/estimates/send側で対応）。
  const estimateUrl = `${origin}/customer/estimate.html?caseId=${encodeURIComponent(caseRow.id)}`;

  const html = `
    <div style="font-family:sans-serif;line-height:1.7;color:#1b2333;">
      <p>${escapeHtml(customerName)} 様</p>
      <p>この度はAster Systemsへお問い合わせいただき、誠にありがとうございます。</p>
      <p>より早く正式なお見積もりをお受け取りいただくため、以下の見積もりシミュレーターから概算金額のご確認とヒアリングシートのご記入をお願いしております。</p>
      <p><a href="${estimateUrl}" style="display:inline-block;background:#c9a227;color:#1b2333;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:bold;">見積もりシミュレーターへ進む →</a></p>
      <p>お急ぎでない場合や、まずは内容だけお伝えいただく場合は、このままお待ちいただいても担当者より改めてご連絡させていただきます。</p>
      ${buildMypageNoticeHtml(caseRow.id, mypageUrl)}
      ${buildCustomNoticeHtml(emailSettings.custom_notice)}
      ${buildSignatureHtml(emailSettings)}
      <p style="margin-top:16px;color:#8a97a0;font-size:12px;">本メールは自動送信されています。心当たりのない場合は破棄してくださいませ。</p>
    </div>
  `;
  const subject = "【Aster Systems】お問い合わせを受け付けました";
  const sent = await sendEmailSafe(env.RESEND_API_KEY, fromAddr, [caseRow.email], subject, html, "受信メールへの自動返信に失敗しました:");
  await logCaseEvent(env.DB, caseRow.id, "outbound_email", {
    direction: "out",
    subject,
    summary: sent
      ? `お問い合わせ受付メールを${caseRow.email}へ自動送信`
      : `お問い合わせ受付メールの${caseRow.email}への送信に失敗しました`,
    payload: { to: caseRow.email, success: sent },
  });
}

// 受信メールの本文をオーナー自身のメールアプリでも確認できるよう、社内通知メールを送る
// （見積もり・ヒアリング等、他の受信経路には元々オーナー控えメールがあるが、
// 問い合わせメール受信だけは通知が無かったため2026-08-30に追加）。
async function sendInboundOwnerNotificationEmail(
  env: Bindings,
  origin: string,
  caseRow: { id: string; email: string; customer_name: string },
  subject: string | undefined,
  bodyPreview: string,
  category: string | null
): Promise<void> {
  if (!env.RESEND_API_KEY || !env.COMPANY_NOTIFY_EMAIL) return;
  const fromAddr = env.MAIL_FROM || "quotes@example.com";
  const catLabel = category ? CATEGORY_INFO[category]?.label || category : "未分類（要手動確認）";
  const timelineUrl = `${origin}/admin/case-timeline.html?caseId=${encodeURIComponent(caseRow.id)}`;
  const html = `
    <div style="font-family:sans-serif;line-height:1.7;color:#1b2333;">
      <p>問い合わせメールを受信しました。</p>
      <table style="border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">受付番号</td><td>${escapeHtml(caseRow.id)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">送信元</td><td>${escapeHtml(caseRow.email)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">件名</td><td>${escapeHtml(subject || "(件名なし)")}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">分類</td><td>${escapeHtml(catLabel)}</td></tr>
      </table>
      <p style="white-space:pre-wrap;background:#f7f7f5;border:1px solid #e6e3db;border-radius:8px;padding:12px;">${escapeHtml(bodyPreview)}</p>
      <p><a href="${timelineUrl}" style="color:#c9a227;font-weight:bold;">やり取りタイムラインで詳細を見る →</a></p>
      <p style="margin-top:16px;color:#8a97a0;font-size:12px;">このメールに返信すると、送信者へ直接返信できます。</p>
    </div>
  `;
  const sent = await sendEmailSafe(
    env.RESEND_API_KEY,
    fromAddr,
    [env.COMPANY_NOTIFY_EMAIL],
    `【問い合わせ受信】${caseRow.customer_name || caseRow.email}様（${catLabel}）`,
    html,
    "受信メールの社内通知に失敗しました（受信処理自体は継続）:",
    caseRow.email
  );
  await logCaseEvent(env.DB, caseRow.id, "outbound_email", {
    direction: "out",
    subject: `【問い合わせ受信】${caseRow.customer_name || caseRow.email}様（${catLabel}）`,
    summary: sent
      ? `問い合わせ受信の社内通知メールを${env.COMPANY_NOTIFY_EMAIL}へ送信`
      : `問い合わせ受信の社内通知メールの送信に失敗しました`,
    payload: { to: env.COMPANY_NOTIFY_EMAIL, success: sent },
  });
}

async function handleInboundEmail(message: ForwardableEmailMessage, env: Bindings): Promise<void> {
  const envelopeFrom = message.from;

  // 乱用防止：同一送信元からの受信処理回数を日次で制限する。
  if (await isRateLimited(env.DB, "inbound_email", envelopeFrom, 10)) {
    message.setReject("Too many messages from this sender today");
    return;
  }

  let parsed;
  try {
    parsed = await PostalMime.parse(message.raw);
  } catch (err) {
    console.warn("受信メールのMIME解析に失敗しました:", err);
    return;
  }

  const messageId = parsed.messageId || null;
  if (messageId) {
    const existing = await env.DB.prepare("SELECT case_id FROM inbound_messages WHERE message_id = ?").bind(messageId).first();
    if (existing) {
      console.warn("重複した受信メールをスキップしました:", messageId);
      return;
    }
  }

  const bodyText = (parsed.text || stripHtmlTags(parsed.html || "")).trim().slice(0, 4000);
  if (!bodyText) {
    console.warn("受信メールに本文が無いためスキップしました");
    return;
  }

  const origin = env.SITE_ORIGIN || DEFAULT_SITE_ORIGIN;
  const customerName = parsed.from?.name || envelopeFrom;

  // まずカテゴリ分類を試み、その結果を使って案件を作成する
  // （cases.categoryはNOT NULLのため、分類前に空で作成することはできない）。
  let classification: Awaited<ReturnType<typeof classifyInquiry>> | null = null;
  if (env.ANTHROPIC_API_KEY) {
    try {
      classification = await classifyInquiry(env.ANTHROPIC_API_KEY, bodyText);
    } catch (err) {
      console.warn("受信メールのカテゴリ分類に失敗しました:", err);
    }
  }

  const category = classification?.category || "uncategorized";
  const now = new Date().toISOString();
  const caseId = newId();

  // 見積もりシミュレーター起点の案件と同じ「new」から始め、以降は
  // シミュレーター→ヒアリングという通常フローに合流させる
  // （2026-08-30、メール本文からの自動抽出をやめた方針変更に合わせて変更）。
  await env.DB.prepare(
    `INSERT INTO cases (id, category, status, customer_name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(caseId, category, classification?.category ? "new" : "needs_info", customerName, envelopeFrom, now, now)
    .run();

  if (messageId) {
    await env.DB.prepare("INSERT INTO inbound_messages (message_id, case_id) VALUES (?, ?)").bind(messageId, caseId).run();
  }

  await logCaseEvent(env.DB, caseId, "inbound_email", {
    direction: "in",
    subject: parsed.subject || undefined,
    summary: `${envelopeFrom}からの問い合わせメールを受信`,
    payload: { from: envelopeFrom, subject: parsed.subject, bodyPreview: bodyText.slice(0, 500), messageId },
  });

  if (classification) {
    await logCaseEvent(env.DB, caseId, "ai_stage", {
      summary: `受信メールを分類（カテゴリ:${classification.category ?? "不明"}、確信度:${classification.confidence}）`,
      payload: classification,
    });
  }

  await sendInboundOwnerNotificationEmail(
    env,
    origin,
    { id: caseId, email: envelopeFrom, customer_name: customerName },
    parsed.subject,
    bodyText,
    classification?.category || null
  );

  await sendInboundAcknowledgementEmail(env, origin, { id: caseId, email: envelopeFrom, customer_name: customerName });

  // 以降はお客様が見積もりシミュレーター→ヒアリングシートへ進むのを待つ
  // （メール本文からのヒアリング項目自動抽出・即時の全自動パイプライン起動は
  // 2026-08-30に廃止。ヒアリングシート送信時に/api/hearingsが従来通り
  // 全自動パイプラインを起動する）。
}

export default {
  fetch: app.fetch,
  async email(message: ForwardableEmailMessage, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(
      handleInboundEmail(message, env).catch((err) => {
        console.warn("受信メール処理に失敗しました:", err);
      })
    );
  },
} satisfies ExportedHandler<Bindings>;
