/* ============================================================
   Aster Systems / ty-mitumori
   ヒアリング項目ホワイトリスト（AIパイプライン用）
   ------------------------------------------------------------
   public/js/hearing-config.js の HEARING_FORMS からフィールドid・
   ラベルのみを転記したもの（options・placeholder等のUI情報は含まない。
   金額に関わらないため pricing-catalog.ts のような整合性チェックは設けないが、
   hearing-config.js にフィールドを追加・削除した場合はこちらも更新すること）。

   AIによるヒアリング内容の構造化抽出（extractHearingFields）が、
   実在しないフィールドidを作り出さないようにするための照合先として使う。
   ============================================================ */

export type HearingFieldDef = { id: string; label: string };

const COMMON_FIELDS: HearingFieldDef[] = [
  { id: "company", label: "会社名・組織名" },
  { id: "department", label: "部署・役職" },
  { id: "contact_name", label: "ご担当者名" },
  { id: "email", label: "メールアドレス" },
  { id: "tel", label: "電話番号" },
  { id: "preferred_contact", label: "希望の連絡方法" },
  { id: "how_found", label: "弊社を知ったきっかけ" },
];

const BUDGET_FIELD: HearingFieldDef = { id: "budget", label: "ご予算感" };
const DEADLINE_NOTE_FIELD: HearingFieldDef = { id: "deadline_reason", label: "納期の背景" };

export const HEARING_FIELDS: Record<string, HearingFieldDef[]> = {
  web: [
    ...COMMON_FIELDS,
    { id: "purpose", label: "制作の目的・背景" },
    { id: "target_audience", label: "ターゲットユーザー層" },
    { id: "goals", label: "達成したい成果・KPI" },
    { id: "competitors", label: "競合・参考にしている他社サイト" },
    { id: "is_renewal", label: "新規制作／既存サイトのリニューアル" },
    { id: "existing_url", label: "既存サイトのURL" },
    { id: "page_count", label: "想定ページ数" },
    { id: "has_content", label: "掲載する文章・画像素材の有無" },
    { id: "domain_hosting", label: "独自ドメイン・サーバーの状況" },
    { id: "cms_update_freq", label: "公開後の更新頻度・CMSの必要性" },
    { id: "multilingual", label: "多言語対応の要否" },
    { id: "reference_url", label: "参考にしたいデザインのサイトURL" },
    { id: "required_features", label: "必要な機能（自由記述）" },
    { id: "brand_guideline", label: "ロゴ・ブランドガイドラインの有無" },
    { id: "design_taste", label: "希望するデザインテイスト" },
    { id: "seo_analytics", label: "SEO対策・アクセス解析の要否" },
    { id: "deadline", label: "希望公開時期" },
    DEADLINE_NOTE_FIELD,
    BUDGET_FIELD,
    { id: "notes", label: "その他ご要望・注意事項" },
  ],
  video: [
    ...COMMON_FIELDS,
    { id: "purpose", label: "動画の目的・用途" },
    { id: "target_audience", label: "想定視聴者層" },
    { id: "message", label: "伝えたいメッセージ・訴求ポイント" },
    { id: "length", label: "想定尺（長さ）" },
    { id: "usage_scene", label: "使用シーン・掲載媒体" },
    { id: "needs_shooting", label: "撮影の要否" },
    { id: "has_material", label: "既存素材の有無" },
    { id: "narration_needed", label: "ナレーション・テロップの要否" },
    { id: "aspect_ratio", label: "書き出し比率" },
    { id: "reference_url", label: "参考にしたい動画のURL" },
    { id: "deadline", label: "希望納期" },
    DEADLINE_NOTE_FIELD,
    BUDGET_FIELD,
    { id: "notes", label: "その他ご要望・注意事項" },
  ],
  app: [
    ...COMMON_FIELDS,
    { id: "purpose", label: "アプリの目的・解決したい課題" },
    { id: "target_user", label: "想定ユーザー・利用シーン" },
    { id: "business_model", label: "ビジネスモデル・収益方法" },
    { id: "reference_app", label: "参考アプリ" },
    { id: "platform", label: "対象プラットフォーム" },
    { id: "main_features", label: "想定している主要機能" },
    { id: "existing_system_link", label: "既存システム・外部サービスとの連携有無" },
    { id: "existing_system_detail", label: "連携が必要な場合、対象システム名など" },
    { id: "data_handling", label: "取り扱うデータで注意が必要なもの" },
    { id: "release_scope", label: "リリース範囲" },
    { id: "maintenance_plan", label: "リリース後の運用体制" },
    { id: "deadline", label: "希望リリース時期" },
    DEADLINE_NOTE_FIELD,
    BUDGET_FIELD,
    { id: "notes", label: "その他ご要望・注意事項" },
  ],
  system: [
    ...COMMON_FIELDS,
    { id: "current_issue", label: "現在の課題・困りごと" },
    { id: "current_method", label: "現在の業務のやり方" },
    { id: "target_operation", label: "対象業務・部署" },
    { id: "user_count", label: "利用予定人数" },
    { id: "required_functions", label: "必要な機能（自由記述）" },
    { id: "existing_system", label: "既存システムとの連携有無" },
    { id: "existing_system_detail", label: "連携が必要な場合、システム名など" },
    { id: "data_migration", label: "既存データの移行要否" },
    { id: "device_env", label: "利用環境" },
    { id: "security_requirement", label: "セキュリティ・コンプライアンス上の要件" },
    { id: "deadline", label: "希望稼働開始時期" },
    DEADLINE_NOTE_FIELD,
    BUDGET_FIELD,
    { id: "notes", label: "その他ご要望・注意事項" },
  ],
  design: [
    ...COMMON_FIELDS,
    { id: "purpose", label: "制作物の用途・目的" },
    { id: "target_audience", label: "想定される見る人・配布先" },
    { id: "spec", label: "サイズ・仕様" },
    { id: "quantity", label: "印刷部数" },
    { id: "has_guideline", label: "既存のロゴ・ブランドガイドラインの有無" },
    { id: "design_taste", label: "希望するデザインテイスト" },
    { id: "color_preference", label: "希望するカラー・避けたいカラー" },
    { id: "reference", label: "参考にしたいデザイン" },
    { id: "print_data_needed", label: "印刷用データ入稿対応の要否" },
    { id: "deadline", label: "希望納期" },
    DEADLINE_NOTE_FIELD,
    BUDGET_FIELD,
    { id: "notes", label: "その他ご要望・注意事項" },
  ],
};
