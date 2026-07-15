/* ============================================================
   Aster Systems / ty-mitumori
   見積もりシミュレーター 料金ロジック設定（人日ベース）
   ------------------------------------------------------------
   各項目は「人日単価（rate）× 稼働日数（days）＝ 金額（price）」で構成。
   rate/days は free_estimator_料金表.xlsx の推奨価格を基準に、
   カテゴリごとの標準人日単価から逆算した目安値です。
   実際の座組み（アサインするメンバーの単価）が確定したら、
   カテゴリ単位・項目単位どちらでも rate を調整してください。
   ============================================================ */

function item(id, label, rate, days, opts = {}) {
  return { id, label, rate, days, price: Math.round(rate * days), ...opts };
}

const CATEGORIES = [
  {
    id: "web",
    label: "Webサイト制作",
    tag: "WEB",
    emoji: "🌐",
    badge: "#e8f1fb",
    hearingUrl: "/hearing.html",
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
      { id: "cms", type: "checkbox", ...item("cms", "CMS（WordPress）導入", 45000, 3) },
      { id: "contact", type: "checkbox", ...item("contact", "お問い合わせフォーム設置", 45000, 0.5) },
      { id: "responsive", type: "checkbox", ...item("responsive", "レスポンシブ（SP/PC対応）", 45000, 1) },
      { id: "seo", type: "checkbox", ...item("seo", "SEO内部対策（メタ・構造化）", 45000, 1.5) },
      { id: "ga4", type: "checkbox", ...item("ga4", "GA4（アクセス解析）設定", 45000, 0.6) },
      { id: "ssl", type: "checkbox", ...item("ssl", "SSL設定", 45000, 0.3) },
      { id: "server", type: "checkbox", ...item("server", "サーバー・ドメイン初期設定", 45000, 0.4) },
      { id: "i18n", type: "checkbox", ...item("i18n", "多言語対応（英語ページ追加）", 45000, 2) },
      { id: "booking", type: "checkbox", ...item("booking", "予約・カレンダー機能", 45000, 1.6) },
      { id: "blog", type: "checkbox", ...item("blog", "ブログ機能実装", 45000, 1) },
      { id: "member-login", type: "checkbox", ...item("member-login", "会員ログイン機能", 45000, 3) },
      { id: "a11y", type: "checkbox", ...item("a11y", "アクセシビリティ対応（WCAG準拠）", 45000, 1) },
      { id: "speed", type: "checkbox", ...item("speed", "表示速度改善（Core Web Vitals）", 45000, 1.5) },
    ],
    recurring: [{ id: "maintenance", label: "月額保守・更新サポート", price: 18000, unit: "月" }],
  },
  {
    id: "video",
    label: "動画編集・映像制作",
    tag: "VIDEO",
    emoji: "🎬",
    badge: "#fdeaec",
    hearingUrl: "/hearing_video.html",
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
      { id: "telop", type: "checkbox", ...item("telop", "テロップ・字幕追加", 40000, 0.1) },
      { id: "bgm", type: "checkbox", ...item("bgm", "BGM・効果音追加", 40000, 0.1) },
      { id: "thumb", type: "checkbox", ...item("thumb", "サムネイル作成", 40000, 0.07) },
      { id: "ai-subtitle", type: "checkbox", ...item("ai-subtitle", "AI字幕生成（多言語対応）", 40000, 0.8) },
      { id: "narration", type: "checkbox", ...item("narration", "プロナレーション手配", 40000, 1.8) },
      { id: "resize", type: "checkbox", ...item("resize", "SNS投稿用リサイズ（縦横変換）", 40000, 0.2) },
      { id: "motion", type: "checkbox", ...item("motion", "アニメーション・モーション追加", 40000, 0.7) },
      { id: "storyboard", type: "checkbox", ...item("storyboard", "絵コンテ・構成台本作成", 40000, 1) },
      { id: "color", type: "checkbox", ...item("color", "カラーグレーディング", 40000, 0.5) },
    ],
    recurring: [{ id: "pack", label: "月次動画制作パック（4本/月）", price: 36000, unit: "月" }],
  },
  {
    id: "app",
    label: "アプリ開発",
    tag: "APP",
    emoji: "📱",
    badge: "#efeafb",
    hearingUrl: "/hearing_app.html",
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
      { id: "sns-login", type: "checkbox", ...item("sns-login", "SNSログイン（Google/Apple等）", 65000, 2) },
      { id: "push", type: "checkbox", ...item("push", "プッシュ通知機能", 65000, 2) },
      { id: "dashboard", type: "checkbox", ...item("dashboard", "管理画面（ダッシュボード）", 65000, 5.5) },
      { id: "auth", type: "checkbox", ...item("auth", "ユーザー認証・会員管理", 65000, 4) },
      { id: "payment", type: "checkbox", ...item("payment", "決済機能（Stripe/Pay等）", 65000, 11) },
      { id: "chat", type: "checkbox", ...item("chat", "チャット・メッセージ機能", 65000, 4) },
      { id: "i18n", type: "checkbox", ...item("i18n", "多言語対応（i18n）", 65000, 2.8) },
      { id: "offline", type: "checkbox", ...item("offline", "オフライン対応・ローカル同期", 65000, 4) },
      { id: "analytics", type: "checkbox", ...item("analytics", "アプリ内アクセス解析導入", 65000, 1.5) },
      { id: "store", type: "checkbox", ...item("store", "ストア申請・審査対応", 65000, 1) },
    ],
    recurring: [{ id: "support", label: "リリース後保守サポート", price: 72000, unit: "月" }],
  },
  {
    id: "design",
    label: "グラフィック・デザイン",
    tag: "DESIGN",
    emoji: "🎨",
    badge: "#fdecf5",
    hearingUrl: "/hearing_design.html",
    dailyRate: 35000,
    plans: [
      item("logo-simple", "ロゴデザイン（シンプル）", 35000, 0.8),
      item("logo-original", "ロゴデザイン（本格オリジナル）", 35000, 2),
      item("meishi", "名刺デザイン", 35000, 0.5),
      item("flyer", "チラシ・フライヤー（A4）", 35000, 0.8),
      item("vi", "ブランドVI設計（一式）", 35000, 3.9),
      item("pamphlet", "会社案内パンフレット（8P程度）", 35000, 3),
      item("exhibition", "展示会・イベント用ブース装飾デザイン", 35000, 2.5),
    ],
    addons: [
      { id: "color-variant", type: "checkbox", ...item("color-variant", "カラーバリエーション追加（+2色）", 35000, 0.25) },
      { id: "revisions", type: "checkbox", ...item("revisions", "修正回数追加（+3回）", 35000, 0.25) },
      { id: "print-data", type: "checkbox", ...item("print-data", "印刷用データ入稿対応（ai/PDF）", 35000, 0.4) },
      { id: "sns-set", type: "checkbox", ...item("sns-set", "SNSアイコン・バナーセット", 35000, 1) },
      { id: "guideline", type: "checkbox", ...item("guideline", "ブランドガイドライン作成", 35000, 2.5) },
      { id: "stationery", type: "checkbox", ...item("stationery", "封筒・レターヘッドデザイン", 35000, 0.5) },
      { id: "package", type: "checkbox", ...item("package", "商品パッケージデザイン", 35000, 0.9) },
      { id: "photo", type: "checkbox", ...item("photo", "商品・イメージ写真撮影ディレクション", 35000, 1) },
      { id: "illustration", type: "checkbox", ...item("illustration", "オリジナルイラスト制作", 35000, 1.2) },
    ],
    recurring: [],
  },
  {
    id: "system",
    label: "システム開発",
    tag: "SYSTEM",
    emoji: "⚙️",
    badge: "#e6f6f2",
    hearingUrl: "/hearing_system.html",
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
      { id: "dashboard", type: "checkbox", ...item("dashboard", "管理画面・ダッシュボード構築", 70000, 5.1) },
      { id: "auth", type: "checkbox", ...item("auth", "ユーザー認証・会員管理機能", 70000, 3.9) },
      { id: "api-connect", type: "stepper", unit: "件", ...item("api-connect", "API連携（外部サービス1件）", 70000, 2.6) },
      { id: "payment", type: "checkbox", ...item("payment", "決済機能実装（Stripe等）", 70000, 9) },
      { id: "cloud", type: "checkbox", ...item("cloud", "クラウドインフラ構築（AWS/GCP）", 70000, 5.1) },
      { id: "cicd", type: "checkbox", ...item("cicd", "自動テスト・CI/CD構築", 70000, 3.9) },
      { id: "security", type: "checkbox", ...item("security", "セキュリティ診断・脆弱性対応", 70000, 2.6) },
      { id: "migration", type: "checkbox", ...item("migration", "既存データ移行・クレンジング", 70000, 4) },
      { id: "docs", type: "checkbox", ...item("docs", "運用マニュアル・設計書作成", 70000, 2) },
    ],
    recurring: [{ id: "ops", label: "月額保守・障害対応サポート", price: 72000, unit: "月" }],
  },
];

/* 全カテゴリ共通オプション */
const COMMON_ADDONS = [
  { id: "lecture", type: "checkbox", ...item("lecture", "納品後レクチャー（使い方説明）", 45000, 0.3) },
  { id: "extra-revisions", type: "checkbox", ...item("extra-revisions", "修正回数の上乗せ（+3回）", 45000, 0.2) },
  { id: "rush", label: "急ぎ対応（特急オプション・合計 ×1.5）", type: "multiplier", value: 1.5 },
];
