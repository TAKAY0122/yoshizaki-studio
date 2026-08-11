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
// 公開API：ヒアリング送信の保存
// ============================================================
app.post("/api/hearings", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !body.category || !body.answers) {
    return c.json({ error: "invalid payload" }, 400);
  }

  const now = new Date().toISOString();
  const answerName = body.answers.contact_name || body.answers.company || "";
  const answerEmail = body.answers.email || "";
  const answerTel = body.answers.tel || "";
  const answerCompany = body.answers.company || "";

  // 見積もりシミュレーターの段階で既に案件（case）が作成されている場合は
  // その case を更新する（重複した案件が作られないようにするため）。
  // お客様には hearing.js が生成した refCode（例: HR-20260714-AB12）を
  // 受付番号として表示するため、新規作成時はこれをそのまま cases.id（主キー）として使う。
  let caseId: string | null = null;
  let isNewCase = true;

  if (body.caseId) {
    const existing = await c.env.DB.prepare("SELECT id FROM cases WHERE id = ?").bind(body.caseId).first();
    if (existing) {
      caseId = body.caseId;
      isNewCase = false;
      await c.env.DB.prepare(
        `UPDATE cases SET status = 'hearing', customer_name = ?, email = ?, tel = ?, company = ?, updated_at = ? WHERE id = ?`
      )
        .bind(answerName, answerEmail, answerTel, answerCompany, now, caseId)
        .run();
    }
  }

  if (!caseId) {
    caseId = body.refCode || newId();
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

  // ヒアリング内容の確認メール（顧客向け）。送信に失敗してもヒアリング自体の受付は成立させる。
  const confirmedCaseId: string = caseId!;
  if (c.env.RESEND_API_KEY && answerEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answerEmail)) {
    try {
      const url = new URL(c.req.url);
      const origin = `${url.protocol}//${url.host}`;
      const mypageUrl = `${origin}/mypage.html`;
      const catLabel = CATEGORY_INFO[body.category]?.label || body.category;
      const fromAddr = c.env.MAIL_FROM || "quotes@example.com";
      const emailSettings = await getEmailSettings(c.env.DB);
      const signatureHtml = `
        <p style="margin-top:20px;padding-top:16px;border-top:1px solid #e3e8ec;color:#1b2333;">
          ${escapeHtml(emailSettings.signature_company)}<br />
          担当：${escapeHtml(emailSettings.signature_name)}<br />
          <a href="mailto:${escapeHtml(emailSettings.signature_email)}" style="color:#5c6b74;">${escapeHtml(emailSettings.signature_email)}</a>
        </p>
      `;
      const customerHtml = `
        <div style="font-family:sans-serif;line-height:1.7;color:#1b2333;">
          <p>${escapeHtml(answerName || "お客")} 様</p>
          <p>この度はAster Systemsへヒアリング内容をご送信いただき、誠にありがとうございます。<br />
          以下の内容で受け付けいたしました。担当者より内容を確認のうえ、追ってご連絡いたします。</p>
          <table style="border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">カテゴリ</td><td>${escapeHtml(catLabel)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#5c6b74;">受付番号</td><td style="font-weight:bold;">${escapeHtml(confirmedCaseId)}</td></tr>
          </table>
          <p><a href="${mypageUrl}" style="display:inline-block;background:#c9a227;color:#1b2333;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:bold;">マイページで進捗を確認する</a></p>
          <p style="color:#8a97a0;font-size:12px;">マイページでは、上記の受付番号とこのメールアドレスでご確認いただけます。</p>
          ${signatureHtml}
          <p style="margin-top:16px;color:#8a97a0;font-size:12px;">本メールは自動送信されています。心当たりのない場合は破棄してくださいませ。</p>
        </div>
      `;
      await sendResendEmail(
        c.env.RESEND_API_KEY,
        fromAddr,
        [answerEmail],
        `【Aster Systems】ヒアリング内容を受け付けました（受付番号：${confirmedCaseId}）`,
        customerHtml
      );
    } catch (err) {
      console.warn("ヒアリング確認メールの送信に失敗しました（ヒアリング自体の受付は継続）:", err);
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

  // この時点で案件（case）を作成し、ヒアリング未着手でも管理者ダッシュボードに
  // 「新規受付」として表示されるようにする。ヒアリングシート送信時にはこの
  // caseId を引き継いで更新する（重複した案件が作られないようにするため）。
  const caseId = newCaseId("C");
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO cases (id, category, status, customer_name, email, estimate_code, estimate_total, created_at, updated_at)
     VALUES (?, ?, 'new', ?, ?, ?, ?, ?, ?)`
  )
    .bind(caseId, decoded.cat, name, email, code, decoded.total || 0, now, now)
    .run();
  await c.env.DB.prepare(
    `INSERT INTO estimates (id, case_id, items, total_amount, created_at) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(newId(), caseId, JSON.stringify(decoded), decoded.total || 0, now)
    .run();

  const url = new URL(c.req.url);
  const origin = `${url.protocol}//${url.host}`;
  const quoteUrl = `${origin}/quote.html?code=${encodeURIComponent(code)}`;
  const hearingUrl = `${origin}${catInfo.hearingUrl}?code=${encodeURIComponent(code)}&caseId=${encodeURIComponent(caseId)}`;
  const mypageUrl = `${origin}/mypage.html`;
  const total = decoded.total || 0;
  const low = formatYenJP(total * 0.9);
  const high = formatYenJP(total * 1.15);

  const fromAddr = c.env.MAIL_FROM || "quotes@example.com";
  const emailSettings = await getEmailSettings(c.env.DB);

  const signatureHtml = `
    <p style="margin-top:20px;padding-top:16px;border-top:1px solid #e3e8ec;color:#1b2333;">
      ${escapeHtml(emailSettings.signature_company)}<br />
      担当：${escapeHtml(emailSettings.signature_name)}<br />
      <a href="mailto:${escapeHtml(emailSettings.signature_email)}" style="color:#5c6b74;">${escapeHtml(emailSettings.signature_email)}</a>
    </p>
  `;
  const noticeHtml = emailSettings.custom_notice
    ? `<p style="margin-top:16px;padding:12px 14px;background:#f7efd6;border-radius:8px;color:#1b2333;">${escapeHtml(emailSettings.custom_notice).replace(/\n/g, "<br />")}</p>`
    : "";

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
      <p style="margin-top:16px;padding:12px 14px;background:#f5f6f8;border-radius:8px;font-size:13px;">
        受付番号：<strong>${escapeHtml(caseId)}</strong><br />
        この受付番号とこのメールアドレスで、<a href="${mypageUrl}" style="color:#c9a227;">マイページ</a>から今後の進捗を確認できます。
      </p>
      ${noticeHtml}
      ${signatureHtml}
      <p style="margin-top:16px;color:#8a97a0;font-size:12px;">発行日時：${decoded.ts ? new Date(decoded.ts).toLocaleString("ja-JP") : "-"}<br />
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

  return c.json({ ok: true, caseId });
});

app.post("/api/admin/cases/:id/send-formal-quote", requireAuth, async (c) => {
  if (!c.env.RESEND_API_KEY) return c.json({ error: "メール送信機能が未設定です（RESEND_API_KEY）" }, 503);
  const id = c.req.param("id");
  const admin = c.get("admin");

  const caseRow: any = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first();
  if (!caseRow) return c.json({ error: "案件が見つかりません" }, 404);
  if (!caseRow.email) return c.json({ error: "お客様のメールアドレスが登録されていません" }, 400);
  if (!caseRow.estimate_code) return c.json({ error: "この案件には見積もりコードがありません" }, 400);

  const decoded = decodeEstimateCode(caseRow.estimate_code);
  if (!decoded) return c.json({ error: "見積もりコードの解析に失敗しました" }, 400);
  const catInfo = CATEGORY_INFO[caseRow.category];
  if (!catInfo) return c.json({ error: "不明なカテゴリです" }, 400);

  const url = new URL(c.req.url);
  const origin = `${url.protocol}//${url.host}`;
  const quoteUrl = `${origin}/quote.html?code=${encodeURIComponent(caseRow.estimate_code)}`;
  const total = caseRow.estimate_total || decoded.total || 0;
  const fromAddr = c.env.MAIL_FROM || "quotes@example.com";
  const emailSettings = await getEmailSettings(c.env.DB);
  const customerName = caseRow.customer_name || "お客様";

  const signatureHtml = `
    <p style="margin-top:20px;padding-top:16px;border-top:1px solid #e3e8ec;color:#1b2333;">
      ${escapeHtml(emailSettings.signature_company)}<br />
      担当：${escapeHtml(emailSettings.signature_name)}<br />
      <a href="mailto:${escapeHtml(emailSettings.signature_email)}" style="color:#5c6b74;">${escapeHtml(emailSettings.signature_email)}</a>
    </p>
  `;
  const noticeHtml = emailSettings.custom_notice
    ? `<p style="margin-top:16px;padding:12px 14px;background:#f7efd6;border-radius:8px;color:#1b2333;">${escapeHtml(emailSettings.custom_notice).replace(/\n/g, "<br />")}</p>`
    : "";

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
      ${noticeHtml}
      ${signatureHtml}
      <p style="margin-top:16px;color:#8a97a0;font-size:12px;">本メールは自動送信されています。心当たりのない場合は破棄してくださいませ。</p>
    </div>
  `;

  await sendResendEmail(c.env.RESEND_API_KEY, fromAddr, [caseRow.email], `【Aster Systems】正式御見積書のご案内（${catInfo.label}）`, html);

  const now = new Date().toISOString();
  await c.env.DB.prepare("UPDATE cases SET status = 'quoted', updated_at = ? WHERE id = ?").bind(now, id).run();
  await c.env.DB.prepare(
    `INSERT INTO case_logs (id, case_id, note, status_before, status_after, admin_id) VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(newId(), id, "正式な見積書をメール送信", caseRow.status, "quoted", admin.id)
    .run();

  return c.json({ ok: true, email: caseRow.email });
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
