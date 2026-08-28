/* ============================================================
   Aster Systems / ty-mitumori
   ヒアリングシート フォーム設定（本格版）
   ============================================================ */

const COMMON_FIELDS = [
  { id: "company", label: "会社名・組織名", type: "text", required: false, placeholder: "株式会社〇〇（個人の場合は空欄で可）" },
  { id: "department", label: "部署・役職", type: "text", required: false, placeholder: "例：マーケティング部 課長" },
  { id: "contact_name", label: "ご担当者名", type: "text", required: true, placeholder: "山田 太郎" },
  { id: "email", label: "メールアドレス", type: "email", required: true, placeholder: "example@aster-systems.jp" },
  { id: "tel", label: "電話番号", type: "tel", required: false, placeholder: "090-1234-5678" },
  { id: "preferred_contact", label: "希望の連絡方法", type: "radio", required: false, options: ["メール", "電話", "どちらでも可"] },
  { id: "how_found", label: "弊社を知ったきっかけ（任意）", type: "select", required: false, options: ["未選択", "検索エンジン", "SNS", "知人・取引先からの紹介", "他社からの乗り換え", "その他"] },
];

const BUDGET_FIELD = { id: "budget", label: "ご予算感（概算で構いません）", type: "select", required: false, options: ["未定・相談したい", "〜30万円", "30〜100万円", "100〜300万円", "300〜500万円", "500万円以上"] };
const DEADLINE_NOTE_FIELD = { id: "deadline_reason", label: "納期の背景（イベント・展示会等の期日があれば）", type: "text", required: false, placeholder: "例：〇月〇日の展示会に合わせて公開したい" };

const HEARING_FORMS = {
  web: {
    title: "Webサイト制作ヒアリングシート",
    tag: "WEB",
    badgeBg: "var(--gold-soft)",
    lede: "コーポレート・LP・EC・メディアなど、Web制作のご依頼内容を詳しくお伺いします。回答内容は御見積もり・ご提案の精度向上に活用させていただきます。",
    sections: [
      { title: "基本情報", fields: COMMON_FIELDS },
      {
        title: "プロジェクトの目的・背景",
        fields: [
          { id: "purpose", label: "制作の目的・背景", type: "textarea", required: true, placeholder: "例：新規サービスのLPを制作し、問い合わせを増やしたい" },
          { id: "target_audience", label: "ターゲットユーザー層", type: "textarea", required: false, placeholder: "例：30〜40代の女性、BtoB企業の決裁者 など" },
          { id: "goals", label: "達成したい成果・KPI（あれば）", type: "text", required: false, placeholder: "例：月間問い合わせ20件、資料DL率5%向上 など" },
          { id: "competitors", label: "競合・参考にしている他社サイト", type: "textarea", required: false, placeholder: "URLや社名など（複数可）" },
        ],
      },
      {
        title: "サイト仕様",
        fields: [
          { id: "is_renewal", label: "新規制作／既存サイトのリニューアル", type: "radio", required: false, options: ["新規制作", "リニューアル", "未定"] },
          { id: "existing_url", label: "既存サイトのURL（リニューアルの場合）", type: "text", required: false, placeholder: "https://example.com" },
          { id: "page_count", label: "想定ページ数", type: "select", required: false, options: ["未定", "1〜3ページ", "4〜10ページ", "11〜20ページ", "21ページ以上"] },
          { id: "has_content", label: "掲載する文章・画像素材の有無", type: "radio", required: false, options: ["すべて用意できる", "一部用意できる", "制作会社に相談したい"] },
          { id: "domain_hosting", label: "独自ドメイン・サーバーの状況", type: "radio", required: false, options: ["すでに持っている", "新規取得が必要", "わからない・相談したい"] },
          { id: "cms_update_freq", label: "公開後の更新頻度・CMSの必要性", type: "select", required: false, options: ["更新はほぼしない", "月1回程度", "週1回程度", "頻繁に更新（CMS必須）"] },
          { id: "multilingual", label: "多言語対応の要否", type: "radio", required: false, options: ["不要", "英語対応が必要", "その他言語も必要"] },
          { id: "reference_url", label: "参考にしたいデザインのサイトURL", type: "textarea", required: false, placeholder: "https://example.com（複数可・良いと思う理由も書いていただけると助かります）" },
        ],
      },
      {
        title: "機能・デザイン要件",
        fields: [
          { id: "required_features", label: "必要な機能（自由記述）", type: "textarea", required: false, placeholder: "例：問い合わせフォーム、会員登録、EC決済、予約システム、多言語切り替え など" },
          { id: "brand_guideline", label: "ロゴ・ブランドガイドラインの有無", type: "radio", required: false, options: ["あり（支給できる）", "なし", "これから決めたい"] },
          { id: "design_taste", label: "希望するデザインテイスト", type: "text", required: false, placeholder: "例：高級感、ポップ、シンプル、和風 など" },
          { id: "seo_analytics", label: "SEO対策・アクセス解析の要否", type: "radio", required: false, options: ["両方必要", "アクセス解析のみ", "特に不要"] },
        ],
      },
      {
        title: "スケジュール・ご予算",
        fields: [
          { id: "deadline", label: "希望公開時期", type: "text", required: false, placeholder: "例：2026年9月末" },
          DEADLINE_NOTE_FIELD,
          BUDGET_FIELD,
          { id: "notes", label: "その他ご要望・注意事項", type: "textarea", required: false },
        ],
      },
    ],
  },

  video: {
    title: "動画編集・映像制作ヒアリングシート",
    tag: "VIDEO",
    badgeBg: "var(--gold-soft)",
    lede: "カット編集・テロップ・モーション・SNS動画などの映像制作のご依頼内容を詳しくお伺いします。",
    sections: [
      { title: "基本情報", fields: COMMON_FIELDS },
      {
        title: "企画の目的・内容",
        fields: [
          { id: "purpose", label: "動画の目的・用途", type: "textarea", required: true, placeholder: "例：SNS広告用の15秒ショート動画、採用サイト掲載用の会社紹介動画" },
          { id: "target_audience", label: "想定視聴者層", type: "text", required: false, placeholder: "例：20代女性、就活生、既存顧客 など" },
          { id: "message", label: "伝えたいメッセージ・訴求ポイント", type: "textarea", required: false, placeholder: "例：商品の使いやすさを訴求したい" },
          { id: "length", label: "想定尺（長さ）", type: "text", required: false, placeholder: "例：15秒 / 1分 / 3〜5分 など" },
          { id: "usage_scene", label: "使用シーン・掲載媒体", type: "textarea", required: false, placeholder: "例：Instagram広告、YouTube、自社サイトトップ、展示会ブース上映 など" },
        ],
      },
      {
        title: "制作仕様",
        fields: [
          { id: "needs_shooting", label: "撮影の要否", type: "radio", required: false, options: ["編集のみ（素材あり）", "撮影から依頼したい", "一部追加撮影が必要"] },
          { id: "has_material", label: "既存素材（映像・写真・BGM等）の有無", type: "radio", required: false, options: ["すべて用意できる", "一部用意できる", "特に無い"] },
          { id: "narration_needed", label: "ナレーション・テロップの要否", type: "radio", required: false, options: ["両方必要", "テロップのみ", "ナレーションのみ", "不要"] },
          { id: "aspect_ratio", label: "書き出し比率", type: "select", required: false, options: ["未定", "横型（16:9）", "縦型（9:16）", "正方形（1:1）", "複数サイズ必要"] },
          { id: "reference_url", label: "参考にしたい動画のURL", type: "textarea", required: false, placeholder: "YouTube等のURL（複数可・良いと思う理由も添えていただけると助かります）" },
        ],
      },
      {
        title: "スケジュール・ご予算",
        fields: [
          { id: "deadline", label: "希望納期", type: "text", required: false },
          DEADLINE_NOTE_FIELD,
          BUDGET_FIELD,
          { id: "notes", label: "その他ご要望・注意事項", type: "textarea", required: false },
        ],
      },
    ],
  },

  app: {
    title: "アプリ開発ヒアリングシート",
    tag: "APP",
    badgeBg: "var(--gold-soft)",
    lede: "iOS・Android・Webアプリの企画段階から要件定義までを詳しくお伺いします。",
    sections: [
      { title: "基本情報", fields: COMMON_FIELDS },
      {
        title: "企画・背景",
        fields: [
          { id: "purpose", label: "アプリの目的・解決したい課題", type: "textarea", required: true, placeholder: "例：店舗の予約管理を効率化したい、既存顧客のリピート率を上げたい" },
          { id: "target_user", label: "想定ユーザー・利用シーン", type: "textarea", required: false, placeholder: "例：20〜30代の一般消費者、社内の営業担当者 など" },
          { id: "business_model", label: "ビジネスモデル・収益方法（該当する場合）", type: "text", required: false, placeholder: "例：広告収益、サブスクリプション、都度課金 など" },
          { id: "reference_app", label: "参考アプリ", type: "textarea", required: false, placeholder: "近いイメージのアプリ名やURL（複数可）" },
        ],
      },
      {
        title: "機能・技術要件",
        fields: [
          { id: "platform", label: "対象プラットフォーム", type: "radio", required: false, options: ["iOS", "Android", "iOS + Android", "Webアプリ（PWA）", "未定"] },
          { id: "main_features", label: "想定している主要機能", type: "textarea", required: false, placeholder: "例：会員登録、位置情報検索、決済機能、プッシュ通知、チャット機能 など" },
          { id: "existing_system_link", label: "既存システム・外部サービスとの連携有無", type: "radio", required: false, options: ["連携が必要", "連携は不要", "わからない・相談したい"] },
          { id: "existing_system_detail", label: "連携が必要な場合、対象システム名など", type: "text", required: false },
          { id: "data_handling", label: "取り扱うデータで注意が必要なもの（個人情報・決済情報等）", type: "text", required: false, placeholder: "例：クレジットカード情報、位置情報、医療関連情報 など" },
        ],
      },
      {
        title: "運用・スケジュール・ご予算",
        fields: [
          { id: "release_scope", label: "リリース範囲", type: "radio", required: false, options: ["まずは最小限（MVP）で試したい", "最初から一通りの機能を揃えたい", "相談したい"] },
          { id: "maintenance_plan", label: "リリース後の運用体制", type: "radio", required: false, options: ["社内で運用したい", "継続して開発会社に依頼したい", "未定"] },
          { id: "deadline", label: "希望リリース時期", type: "text", required: false },
          DEADLINE_NOTE_FIELD,
          BUDGET_FIELD,
          { id: "notes", label: "その他ご要望・注意事項", type: "textarea", required: false },
        ],
      },
    ],
  },

  system: {
    title: "システム開発ヒアリングシート",
    tag: "SYSTEM",
    badgeBg: "var(--gold-soft)",
    lede: "業務システム・CRM・受発注管理・API連携など、業務DX向けのご依頼内容を詳しくお伺いします。",
    sections: [
      { title: "基本情報", fields: COMMON_FIELDS },
      {
        title: "現状の課題",
        fields: [
          { id: "current_issue", label: "現在の課題・困りごと", type: "textarea", required: true, placeholder: "例：Excelでの受発注管理が属人化しており、集計に時間がかかっている" },
          { id: "current_method", label: "現在の業務のやり方（Excel運用・紙管理など）", type: "textarea", required: false, placeholder: "例：Excelで在庫管理をしており、複数人で編集すると不整合が起きる" },
          { id: "target_operation", label: "対象業務・部署", type: "text", required: false, placeholder: "例：営業部の受発注管理、経理部の請求処理 など" },
          { id: "user_count", label: "利用予定人数", type: "select", required: false, options: ["未定", "1〜5名", "6〜20名", "21〜50名", "51名以上"] },
        ],
      },
      {
        title: "システム要件",
        fields: [
          { id: "required_functions", label: "必要な機能（自由記述）", type: "textarea", required: false, placeholder: "例：受発注入力、在庫連動、帳票出力、承認フロー、権限管理 など" },
          { id: "existing_system", label: "既存システムとの連携有無", type: "radio", required: false, options: ["連携が必要", "連携は不要", "わからない"] },
          { id: "existing_system_detail", label: "連携が必要な場合、システム名など", type: "text", required: false, placeholder: "例：会計ソフト〇〇、基幹システム〇〇 など" },
          { id: "data_migration", label: "既存データの移行要否", type: "radio", required: false, options: ["移行が必要（Excel等からの取り込み）", "移行は不要", "わからない"] },
          { id: "device_env", label: "利用環境", type: "radio", required: false, options: ["社内PCのみ", "外出先・スマホからも利用したい", "未定"] },
        ],
      },
      {
        title: "運用・スケジュール・ご予算",
        fields: [
          { id: "security_requirement", label: "セキュリティ・コンプライアンス上の要件（あれば）", type: "text", required: false, placeholder: "例：個人情報保護法対応、社内規定によるログ保持義務 など" },
          { id: "deadline", label: "希望稼働開始時期", type: "text", required: false },
          DEADLINE_NOTE_FIELD,
          BUDGET_FIELD,
          { id: "notes", label: "その他ご要望・注意事項", type: "textarea", required: false },
        ],
      },
    ],
  },

  design: {
    title: "グラフィック・デザインヒアリングシート",
    tag: "DESIGN",
    badgeBg: "var(--gold-soft)",
    lede: "ロゴ・チラシ・パンフ・名刺・ブランディングなど、印刷・グラフィック系のご依頼内容を詳しくお伺いします。",
    sections: [
      { title: "基本情報", fields: COMMON_FIELDS },
      {
        title: "制作内容",
        fields: [
          { id: "purpose", label: "制作物の用途・目的", type: "textarea", required: true, placeholder: "例：展示会用の会社案内パンフレット、採用強化のための会社紹介チラシ" },
          { id: "target_audience", label: "想定される見る人・配布先", type: "text", required: false, placeholder: "例：展示会来場者、新卒学生、既存取引先 など" },
          { id: "spec", label: "サイズ・仕様（判明していれば）", type: "text", required: false, placeholder: "例：A4三つ折り、両面フルカラー、名刺サイズ など" },
          { id: "quantity", label: "印刷部数（印刷物の場合）", type: "text", required: false, placeholder: "例：500部、1000部 など" },
        ],
      },
      {
        title: "デザイン要件",
        fields: [
          { id: "has_guideline", label: "既存のロゴ・ブランドガイドラインの有無", type: "radio", required: false, options: ["あり（支給できる）", "なし", "これから決めたい"] },
          { id: "design_taste", label: "希望するデザインテイスト", type: "text", required: false, placeholder: "例：高級感、ポップ、シンプル、和風、企業らしい信頼感 など" },
          { id: "color_preference", label: "希望するカラー・避けたいカラー", type: "text", required: false, placeholder: "例：コーポレートカラーの青を基調に、赤は使わないでほしい など" },
          { id: "reference", label: "参考にしたいデザイン", type: "textarea", required: false, placeholder: "参考画像URLやイメージの説明（複数可）" },
        ],
      },
      {
        title: "納品・スケジュール・ご予算",
        fields: [
          { id: "print_data_needed", label: "印刷用データ入稿対応の要否", type: "radio", required: false, options: ["必要（印刷会社への入稿まで依頼したい）", "不要（データ納品のみでよい）", "わからない"] },
          { id: "deadline", label: "希望納期", type: "text", required: false },
          DEADLINE_NOTE_FIELD,
          BUDGET_FIELD,
          { id: "notes", label: "その他ご要望・注意事項", type: "textarea", required: false },
        ],
      },
    ],
  },
};
