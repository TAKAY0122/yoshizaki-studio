-- YOSHIZAKI STUDIO / ty-mitumori
-- D1スキーマ初期案（フェーズ3以降で使用）
-- 要件定義書 7章「データ設計概要」に対応

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new', -- new / hearing / quoted / won / lost
  customer_name TEXT,
  email TEXT,
  tel TEXT,
  company TEXT,
  assigned_to TEXT,
  estimate_code TEXT,
  estimate_total INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS estimates (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  items TEXT NOT NULL,        -- JSON
  total_amount INTEGER NOT NULL,
  valid_until TEXT,
  pdf_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hearings (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  category TEXT NOT NULL,
  answers TEXT NOT NULL,       -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS case_logs (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  note TEXT,
  status_before TEXT,
  status_after TEXT,
  admin_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES admins(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_estimates_case ON estimates(case_id);
CREATE INDEX IF NOT EXISTS idx_hearings_case ON hearings(case_id);
CREATE INDEX IF NOT EXISTS idx_case_logs_case ON case_logs(case_id);
CREATE INDEX IF NOT EXISTS idx_sessions_admin ON admin_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON admin_sessions(expires_at);

-- 見積書メールの署名・お知らせ文を管理画面から編集できるようにするための設定テーブル
-- 1行のみを想定（id は常に 'default'）
CREATE TABLE IF NOT EXISTS email_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  signature_company TEXT,
  signature_name TEXT,
  signature_email TEXT,
  custom_notice TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 料金体系（管理画面から編集可能にするための追加テーブル）
-- ------------------------------------------------------------
-- pricing_overrides: public/js/pricing-config.js に定義済みの
--   プラン／オプション（カタログ＝項目の存在自体はコード側で定義）に対して、
--   人日単価・人日数だけを管理画面から上書きできるようにする。
--   行が無い項目は pricing-config.js のデフォルト値がそのまま使われる。
-- ============================================================
CREATE TABLE IF NOT EXISTS pricing_overrides (
  category_id TEXT NOT NULL,
  item_type TEXT NOT NULL,   -- 'plan' | 'addon' | 'common_addon'
  item_id TEXT NOT NULL,
  rate INTEGER NOT NULL,
  days REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (category_id, item_type, item_id)
);

-- おトクなセットプラン（カテゴリ＋プラン＋オプションを固定金額/割引でまとめて提供）
CREATE TABLE IF NOT EXISTS bundles (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  plan_id TEXT NOT NULL,
  addon_ids TEXT NOT NULL DEFAULT '[]',   -- JSON配列
  discount_type TEXT NOT NULL DEFAULT 'percent', -- 'percent' | 'fixed'
  discount_value REAL NOT NULL DEFAULT 0,
  audience_tag TEXT,        -- 例：「スタートアップ向け」「中小企業向け」
  featured INTEGER NOT NULL DEFAULT 0,  -- 1なら「人気No.1」リボン表示
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- デフォルトのセットプラン（初回のみ投入。管理画面から自由に編集・削除可能）
INSERT OR IGNORE INTO bundles (id, category_id, label, description, plan_id, addon_ids, discount_type, discount_value, audience_tag, featured, active, sort_order) VALUES
  ('seed-web-1', 'web', 'LPスターターパック', 'LP・レスポンシブ・お問い合わせ・SEO内部対策', 'lp', '["responsive","contact","seo"]', 'percent', 15, 'スタートアップ向け', 0, 1, 10),
  ('seed-web-2', 'web', 'コーポレートスタンダード', 'コーポレートサイト・CMS・SEO内部対策・GA4', 'corporate', '["cms","seo","ga4"]', 'percent', 15, '中小企業向け', 1, 1, 20),
  ('seed-web-3', 'web', 'ECサイトスタンダード', 'ECサイト・CMS・SEO内部対策・GA4', 'ec', '["cms","seo","ga4"]', 'percent', 12, 'EC・ショップ向け', 0, 1, 30),
  ('seed-video-1', 'video', 'SNS動画おまかせセット', '企業紹介・商品PRムービー＋テロップ・BGM・サムネイル', 'corp', '["telop","bgm","thumb"]', 'percent', 12, '販促・広告向け', 1, 1, 10),
  ('seed-video-2', 'video', 'TikTok・ショート動画セット', 'TikTok・ショート動画編集＋テロップ・BGM', 'tiktok', '["telop","bgm"]', 'percent', 15, 'スタートアップ向け', 0, 1, 5),
  ('seed-video-3', 'video', '撮影込みフルパッケージ', '撮影込みの映像制作＋テロップ・ナレーション・モーション', 'shoot', '["telop","narration","motion"]', 'percent', 12, '本格制作向け', 0, 1, 20),
  ('seed-app-1', 'app', 'PWAスタートセット', 'PWA・簡易Webアプリ＋SNSログイン・プッシュ通知', 'pwa', '["sns-login","push"]', 'percent', 12, '新規事業向け', 1, 1, 10),
  ('seed-app-2', 'app', '業務アプリおまかせセット', '業務アプリ（社内向け）＋ユーザー認証・管理画面', 'internal', '["auth","dashboard"]', 'percent', 15, '社内ツール向け', 0, 1, 20),
  ('seed-app-3', 'app', '本格アプリフルセット', 'iOS+Android両対応＋決済機能・認証・管理画面', 'both-os', '["payment","auth","dashboard"]', 'percent', 12, '本格開発向け', 0, 1, 30),
  ('seed-system-1', 'system', '業務効率化おまかせセット', '業務システム（小規模）＋管理画面構築', 'small', '["dashboard"]', 'percent', 12, '中小企業向け', 1, 1, 10),
  ('seed-system-2', 'system', 'SaaS開発おまかせセット', 'SaaS・Webアプリ開発＋管理画面・認証・CI/CD', 'saas', '["dashboard","auth","cicd"]', 'percent', 15, '新規事業向け', 0, 1, 20),
  ('seed-system-3', 'system', '基幹連携フルセット', '自動化ツール開発＋クラウド構築・セキュリティ診断・運用資料', 'automation', '["cloud","security","docs"]', 'percent', 12, '本格導入向け', 0, 1, 30),
  ('seed-design-1', 'design', 'ブランディングセット', 'ロゴ（本格オリジナル）＋SNS用アイコン・バナー＋印刷用データ入稿対応', 'logo-original', '["sns-set","print-data"]', 'percent', 15, '新規事業向け', 1, 1, 10),
  ('seed-design-2', 'design', 'ロゴスタートセット', 'ロゴデザイン（シンプル）＋カラーバリエーション・入稿対応', 'logo-simple', '["color-variant","print-data"]', 'percent', 15, 'スタートアップ向け', 0, 1, 5),
  ('seed-design-3', 'design', '販促物フルセット', '会社案内パンフレット＋入稿対応・商品パッケージデザイン', 'pamphlet', '["print-data","package"]', 'percent', 12, '本格販促向け', 0, 1, 20);

-- 納品スケジュール（納期に応じた割引・割増）
CREATE TABLE IF NOT EXISTS delivery_options (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,          -- 例：通常納期 / 特急（+50%） / ゆったり納期（-10%）
  description TEXT,
  multiplier REAL NOT NULL DEFAULT 1.0,  -- 合計金額に掛ける倍率
  is_default INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- デフォルトの納品スケジュール
INSERT OR IGNORE INTO delivery_options (id, label, description, multiplier, is_default, active, sort_order) VALUES
  ('seed-dl-normal', '通常納期', '標準的な制作スケジュールです', 1.0, 1, 1, 10),
  ('seed-dl-relaxed', 'ゆったり納期（-10%）', '納期に余裕がある場合、割引が適用されます', 0.9, 0, 1, 20),
  ('seed-dl-rush', '特急納期（+50%）', 'お急ぎの場合、優先対応いたします', 1.5, 0, 1, 30);

-- キャンペーン設定（同時に有効にできるのは1件のみ。新しく有効化すると他は自動的に無効化される）
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  banner_text TEXT,
  discount_type TEXT NOT NULL DEFAULT 'percent', -- 'percent' | 'fixed'
  discount_value REAL NOT NULL DEFAULT 0,
  category_id TEXT,             -- NULLなら全カテゴリ対象
  start_date TEXT,
  end_date TEXT,
  active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bundles_category ON bundles(category_id);
CREATE INDEX IF NOT EXISTS idx_delivery_active ON delivery_options(active);
CREATE INDEX IF NOT EXISTS idx_campaigns_active ON campaigns(active);
