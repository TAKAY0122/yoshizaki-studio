/* ============================================================
   Aster Systems / ty-mitumori
   ヒアリングシート フォーム設定
   ============================================================ */

const COMMON_FIELDS = [
  { id: "company", label: "会社名・組織名", type: "text", required: false, placeholder: "株式会社〇〇（個人の場合は空欄で可）" },
  { id: "contact_name", label: "ご担当者名", type: "text", required: true, placeholder: "山田 太郎" },
  { id: "email", label: "メールアドレス", type: "email", required: true, placeholder: "example@aster-systems.jp" },
  { id: "tel", label: "電話番号", type: "tel", required: false, placeholder: "090-1234-5678" },
];

const HEARING_FORMS = {
  web: {
    title: "Webサイト制作ヒアリングシート",
    emoji: "🌐",
    badgeBg: "#e8f1fb",
    lede: "コーポレート・LP・EC・メディアなど、Web制作のご依頼内容をお伺いします。",
    sections: [
      {
        title: "基本情報",
        fields: COMMON_FIELDS,
      },
      {
        title: "制作内容について",
        fields: [
          { id: "purpose", label: "制作の目的・背景", type: "textarea", required: true, placeholder: "例：新規サービスのLPを制作し、問い合わせを増やしたい" },
          { id: "reference_url", label: "参考にしたいサイトのURL", type: "text", required: false, placeholder: "https://example.com（複数可）" },
          { id: "page_count", label: "想定ページ数", type: "select", required: false, options: ["未定", "1〜3ページ", "4〜10ページ", "11ページ以上"] },
          { id: "has_content", label: "掲載する文章・画像素材の有無", type: "radio", required: false, options: ["すべて用意できる", "一部用意できる", "制作会社に相談したい"] },
          { id: "deadline", label: "希望公開時期", type: "text", required: false, placeholder: "例：2026年9月末" },
          { id: "notes", label: "その他ご要望・注意事項", type: "textarea", required: false },
        ],
      },
    ],
  },

  video: {
    title: "動画編集・映像制作ヒアリングシート",
    emoji: "🎬",
    badgeBg: "#fdeaec",
    lede: "カット編集・テロップ・モーション・SNS動画などの映像制作のご依頼内容をお伺いします。",
    sections: [
      { title: "基本情報", fields: COMMON_FIELDS },
      {
        title: "制作内容について",
        fields: [
          { id: "purpose", label: "動画の目的・用途", type: "textarea", required: true, placeholder: "例：SNS広告用の15秒ショート動画" },
          { id: "length", label: "想定尺（長さ）", type: "text", required: false, placeholder: "例：15秒 / 3分 など" },
          { id: "usage_scene", label: "使用シーン・掲載媒体", type: "text", required: false, placeholder: "例：Instagram広告、自社サイト内" },
          { id: "reference_url", label: "参考動画のURL", type: "text", required: false, placeholder: "YouTube等のURL（複数可）" },
          { id: "has_material", label: "素材（撮影データ等）の有無", type: "radio", required: false, options: ["すべて用意できる", "一部用意できる", "撮影から依頼したい"] },
          { id: "deadline", label: "希望納期", type: "text", required: false },
          { id: "notes", label: "その他ご要望・注意事項", type: "textarea", required: false },
        ],
      },
    ],
  },

  app: {
    title: "アプリ開発ヒアリングシート",
    emoji: "📱",
    badgeBg: "#efeafb",
    lede: "iOS・Android・Webアプリの企画段階から要件定義までをお伺いします。",
    sections: [
      { title: "基本情報", fields: COMMON_FIELDS },
      {
        title: "アプリについて",
        fields: [
          { id: "purpose", label: "アプリの目的・解決したい課題", type: "textarea", required: true },
          { id: "platform", label: "対象プラットフォーム", type: "radio", required: false, options: ["iOS", "Android", "iOS + Android", "Webアプリ（PWA）", "未定"] },
          { id: "main_features", label: "想定している主要機能", type: "textarea", required: false, placeholder: "例：会員登録、位置情報検索、決済機能 など" },
          { id: "target_user", label: "想定ユーザー・利用シーン", type: "text", required: false },
          { id: "reference_app", label: "参考アプリ", type: "text", required: false, placeholder: "近いイメージのアプリ名やURL" },
          { id: "deadline", label: "希望リリース時期", type: "text", required: false },
          { id: "notes", label: "その他ご要望・注意事項", type: "textarea", required: false },
        ],
      },
    ],
  },

  system: {
    title: "システム開発ヒアリングシート",
    emoji: "⚙️",
    badgeBg: "#e6f6f2",
    lede: "業務システム・CRM・受発注管理・API連携など、業務DX向けのご依頼内容をお伺いします。",
    sections: [
      { title: "基本情報", fields: COMMON_FIELDS },
      {
        title: "システムについて",
        fields: [
          { id: "current_issue", label: "現在の課題・困りごと", type: "textarea", required: true, placeholder: "例：Excelでの受発注管理が属人化している" },
          { id: "target_operation", label: "対象業務・部署", type: "text", required: false },
          { id: "user_count", label: "利用予定人数", type: "select", required: false, options: ["未定", "1〜5名", "6〜20名", "21〜50名", "51名以上"] },
          { id: "existing_system", label: "既存システムとの連携有無", type: "radio", required: false, options: ["連携が必要", "連携は不要", "わからない"] },
          { id: "existing_system_detail", label: "連携が必要な場合、システム名など", type: "text", required: false },
          { id: "deadline", label: "希望稼働開始時期", type: "text", required: false },
          { id: "notes", label: "その他ご要望・注意事項", type: "textarea", required: false },
        ],
      },
    ],
  },

  design: {
    title: "グラフィック・デザインヒアリングシート",
    emoji: "🎨",
    badgeBg: "#fdecf5",
    lede: "ロゴ・チラシ・パンフ・名刺・ブランディングなど、印刷・グラフィック系のご依頼内容をお伺いします。",
    sections: [
      { title: "基本情報", fields: COMMON_FIELDS },
      {
        title: "制作内容について",
        fields: [
          { id: "purpose", label: "制作物の用途・目的", type: "textarea", required: true, placeholder: "例：展示会用の会社紹介パンフレット" },
          { id: "spec", label: "サイズ・仕様（判明していれば）", type: "text", required: false, placeholder: "例：A4三つ折り、両面フルカラー" },
          { id: "has_guideline", label: "既存のロゴ・ブランドガイドラインの有無", type: "radio", required: false, options: ["あり（支給できる）", "なし", "これから決めたい"] },
          { id: "reference", label: "参考にしたいデザイン", type: "text", required: false, placeholder: "参考画像URLやイメージの説明" },
          { id: "deadline", label: "希望納期", type: "text", required: false },
          { id: "notes", label: "その他ご要望・注意事項", type: "textarea", required: false },
        ],
      },
    ],
  },
};
