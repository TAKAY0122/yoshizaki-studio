/* ============================================================
   Aster Systems / ty-mitumori
   見積もり料金カタログ（サーバー側TypeScript版）
   ------------------------------------------------------------
   public/js/pricing-config.js の内容を転記したもの。
   src/ai-pipeline.ts の selectPlanAndAddons がAIへの参考価格提示に
   使う（2026-08-29以降、AI自身がプラン/金額を判断するため、
   ここに定義された項目に厳密に一致している必要はない参考情報という
   位置づけになった。整合性の自動チェックは撤廃済み）。
   ============================================================ */

export type PricingItem = {
  id: string;
  label: string;
  rate: number;
  days: number;
  price: number;
  [key: string]: unknown;
};

export type PricingAddon = PricingItem & {
  type: "checkbox" | "stepper" | "multiplier";
  unit?: string;
  value?: number;
};

export type PricingCategory = {
  id: string;
  label: string;
  tag: string;
  badge: string;
  hearingUrl: string;
  dailyRate: number;
  plans: PricingItem[];
  addons: PricingAddon[];
  recurring: { id: string; label: string; price: number; unit: string }[];
};

function item(id: string, label: string, rate: number, days: number, opts: Record<string, unknown> = {}): PricingItem {
  return { id, label, rate, days, price: Math.round(rate * days), ...opts };
}

export const CATEGORIES: PricingCategory[] = [
  {
    id: "web",
    label: "Webサイト制作",
    tag: "WEB",
    badge: "var(--gold-soft)",
    hearingUrl: "/hearing/hearing.html",
    dailyRate: 45000,
    plans: [
      item("lp", "LP（ランディングページ）", 45000, 3),
      item("corporate", "コーポレートサイト（5P前後）", 45000, 4),
      item("corporate-large", "大規模コーポレートサイト（10P以上）", 45000, 8),
      item("wp", "WordPress制作（HP全般）", 45000, 3),
      item("headless", "ヘッドレスCMS構築（Next.js等）", 45000, 15),
      item("ec", "ECサイト（Shopify等）", 45000, 12),
      item("renewal", "サイトリニューアル", 45000, 4),
    ],
    addons: [
      { type: "checkbox", ...item("cms", "CMS（WordPress）導入", 45000, 3) },
      { type: "checkbox", ...item("contact", "お問い合わせフォーム設置", 45000, 0.5) },
      { type: "checkbox", ...item("responsive", "レスポンシブ（SP/PC対応）", 45000, 1) },
      { type: "checkbox", ...item("seo", "SEO内部対策（メタ・構造化）", 45000, 1.5) },
      { type: "checkbox", ...item("ga4", "GA4（アクセス解析）設定", 45000, 0.6) },
      { type: "checkbox", ...item("ssl", "SSL設定", 45000, 0.3) },
      { type: "checkbox", ...item("server", "サーバー・ドメイン初期設定", 45000, 0.4) },
      { type: "checkbox", ...item("i18n", "多言語対応（英語ページ追加）", 45000, 2) },
      { type: "checkbox", ...item("booking", "予約・カレンダー機能", 45000, 1.6) },
      { type: "checkbox", ...item("blog", "ブログ機能実装", 45000, 1) },
      { type: "checkbox", ...item("member-login", "会員ログイン機能", 45000, 3) },
      { type: "checkbox", ...item("a11y", "アクセシビリティ対応（WCAG準拠）", 45000, 1) },
      { type: "checkbox", ...item("speed", "表示速度改善（Core Web Vitals）", 45000, 1.5) },
    ] as PricingAddon[],
    recurring: [{ id: "maintenance", label: "月額保守・更新サポート", price: 18000, unit: "月" }],
  },
  {
    id: "video",
    label: "動画編集・映像制作",
    tag: "VIDEO",
    badge: "var(--gold-soft)",
    hearingUrl: "/hearing/hearing_video.html",
    dailyRate: 40000,
    plans: [
      item("youtube", "YouTube動画編集（〜15分・1本）", 40000, 0.25),
      item("tiktok", "TikTok・ショート動画編集（1本）", 40000, 0.15),
      item("corp", "企業紹介・商品PRムービー", 40000, 3.5),
      item("shoot", "撮影込みの映像制作", 40000, 4.5),
      item("recruit", "採用ブランディング動画（撮影+編集）", 40000, 6),
      item("event", "イベント・展示会ダイジェスト動画", 40000, 3),
    ],
    addons: [
      { type: "checkbox", ...item("telop", "テロップ・字幕追加", 40000, 0.1) },
      { type: "checkbox", ...item("bgm", "BGM・効果音追加", 40000, 0.1) },
      { type: "checkbox", ...item("thumb", "サムネイル作成", 40000, 0.07) },
      { type: "checkbox", ...item("ai-subtitle", "字幕生成（多言語対応）", 40000, 0.8) },
      { type: "checkbox", ...item("narration", "プロナレーション手配", 40000, 1.8) },
      { type: "checkbox", ...item("resize", "SNS投稿用リサイズ（縦横変換）", 40000, 0.2) },
      { type: "checkbox", ...item("motion", "アニメーション・モーション追加", 40000, 0.7) },
      { type: "checkbox", ...item("storyboard", "絵コンテ・構成台本作成", 40000, 1) },
      { type: "checkbox", ...item("color", "カラーグレーディング", 40000, 0.5) },
    ] as PricingAddon[],
    recurring: [{ id: "pack", label: "月次動画制作パック（4本/月）", price: 36000, unit: "月" }],
  },
  {
    id: "app",
    label: "アプリ開発",
    tag: "APP",
    badge: "var(--gold-soft)",
    hearingUrl: "/hearing/hearing_app.html",
    dailyRate: 65000,
    plans: [
      item("pwa", "PWA・簡易Webアプリ", 65000, 7),
      item("single-os", "iOS または Android（単体）", 65000, 21),
      item("both-os", "iOS + Android 両対応", 65000, 42),
      item("internal", "業務アプリ（社内向け）", 65000, 11),
      item("mvp-full", "新規事業向けMVP開発一式", 65000, 30),
      item("renewal-app", "既存アプリのリニューアル・再設計", 65000, 18),
    ],
    addons: [
      { type: "checkbox", ...item("sns-login", "SNSログイン（Google/Apple等）", 65000, 2) },
      { type: "checkbox", ...item("push", "プッシュ通知機能", 65000, 2) },
      { type: "checkbox", ...item("dashboard", "管理画面（ダッシュボード）", 65000, 5.5) },
      { type: "checkbox", ...item("auth", "ユーザー認証・会員管理", 65000, 4) },
      { type: "checkbox", ...item("payment", "決済機能（Stripe/Pay等）", 65000, 11) },
      { type: "checkbox", ...item("chat", "チャット・メッセージ機能", 65000, 4) },
      { type: "checkbox", ...item("i18n", "多言語対応（i18n）", 65000, 2.8) },
      { type: "checkbox", ...item("offline", "オフライン対応・ローカル同期", 65000, 4) },
      { type: "checkbox", ...item("analytics", "アプリ内アクセス解析導入", 65000, 1.5) },
      { type: "checkbox", ...item("store", "ストア申請・審査対応", 65000, 1) },
    ] as PricingAddon[],
    recurring: [{ id: "support", label: "リリース後保守サポート", price: 72000, unit: "月" }],
  },
  {
    id: "design",
    label: "グラフィック・デザイン",
    tag: "DESIGN",
    badge: "var(--gold-soft)",
    hearingUrl: "/hearing/hearing_design.html",
    dailyRate: 45000,
    plans: [
      item("logo-simple", "ロゴデザイン（シンプル）", 45000, 0.8),
      item("logo-original", "ロゴデザイン（本格オリジナル）", 45000, 2),
      item("meishi", "名刺デザイン", 45000, 0.5),
      item("flyer", "チラシ・フライヤー（A4）", 45000, 0.8),
      item("vi", "ブランドVI設計（一式）", 45000, 3.9),
      item("pamphlet", "会社案内パンフレット（8P程度）", 45000, 3),
      item("exhibition", "展示会・イベント用ブース装飾デザイン", 45000, 2.5),
    ],
    addons: [
      { type: "checkbox", ...item("color-variant", "カラーバリエーション追加（+2色）", 45000, 0.25) },
      { type: "checkbox", ...item("revisions", "修正回数追加（+3回）", 45000, 0.25) },
      { type: "checkbox", ...item("print-data", "印刷用データ入稿対応（ai/PDF）", 45000, 0.4) },
      { type: "checkbox", ...item("sns-set", "SNSアイコン・バナーセット", 45000, 1) },
      { type: "checkbox", ...item("guideline", "ブランドガイドライン作成", 45000, 2.5) },
      { type: "checkbox", ...item("stationery", "封筒・レターヘッドデザイン", 45000, 0.5) },
      { type: "checkbox", ...item("package", "商品パッケージデザイン", 45000, 0.9) },
      { type: "checkbox", ...item("photo", "商品・イメージ写真撮影ディレクション", 45000, 1) },
      { type: "checkbox", ...item("illustration", "オリジナルイラスト制作", 45000, 1.2) },
    ] as PricingAddon[],
    recurring: [],
  },
  {
    id: "system",
    label: "システム開発",
    tag: "SYSTEM",
    badge: "var(--gold-soft)",
    hearingUrl: "/hearing/hearing_system.html",
    dailyRate: 70000,
    plans: [
      item("small", "業務システム（小規模）", 70000, 10.3),
      item("api", "API連携・外部サービス接続", 70000, 2.6),
      item("saas", "SaaS・Webアプリ開発", 70000, 25.7),
      item("automation", "自動化ツール開発", 70000, 6.4),
      item("erp", "基幹システム連携（在庫・会計等）", 70000, 20),
      item("bi", "BIダッシュボード構築（データ可視化）", 70000, 8),
    ],
    addons: [
      { type: "checkbox", ...item("dashboard", "管理画面・ダッシュボード構築", 70000, 5.1) },
      { type: "checkbox", ...item("auth", "ユーザー認証・会員管理機能", 70000, 3.9) },
      { type: "stepper", unit: "件", ...item("api-connect", "API連携（外部サービス1件）", 70000, 2.6) },
      { type: "checkbox", ...item("payment", "決済機能実装（Stripe等）", 70000, 9) },
      { type: "checkbox", ...item("cloud", "クラウドインフラ構築（AWS/GCP）", 70000, 5.1) },
      { type: "checkbox", ...item("cicd", "自動テスト・CI/CD構築", 70000, 3.9) },
      { type: "checkbox", ...item("security", "セキュリティ診断・脆弱性対応", 70000, 2.6) },
      { type: "checkbox", ...item("migration", "既存データ移行・クレンジング", 70000, 4) },
      { type: "checkbox", ...item("docs", "運用マニュアル・設計書作成", 70000, 2) },
    ] as PricingAddon[],
    recurring: [{ id: "ops", label: "月額保守・障害対応サポート", price: 72000, unit: "月" }],
  },
];

/* 全カテゴリ共通オプション */
export const COMMON_ADDONS: PricingAddon[] = [
  { type: "checkbox", ...item("lecture", "納品後レクチャー（使い方説明）", 45000, 0.3) },
  { type: "checkbox", ...item("extra-revisions", "修正回数の上乗せ（+3回）", 45000, 0.2) },
  { id: "rush", label: "急ぎ対応（特急オプション・合計 ×1.5）", type: "multiplier", value: 1.5 } as PricingAddon,
];
