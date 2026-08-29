/* ============================================================
   Aster Systems / ty-mitumori
   カテゴリ概要（AIプロンプト・メールURL生成で使用）
   ------------------------------------------------------------
   public/js/pricing-config.js の内容と手動で同期させる必要がある
   （カテゴリ・プラン構成を変更した場合は要更新）。
   src/index.ts と src/ai-pipeline.ts の両方から参照するため
   共有モジュールとして切り出してある。
   ============================================================ */
export const CATEGORY_INFO: Record<string, { label: string; hearingUrl: string; summary: string }> = {
  web: {
    label: "Webサイト制作",
    hearingUrl: "/hearing/hearing.html",
    summary: "プラン=LP/コーポレートサイト/WordPress制作/ECサイト/サイトリニューアル。オプション=CMS導入/問い合わせフォーム/レスポンシブ/SEO内部対策/GA4設定/SSL設定/サーバードメイン初期設定/多言語対応/予約カレンダー機能",
  },
  video: {
    label: "動画編集・映像制作",
    hearingUrl: "/hearing/hearing_video.html",
    summary: "プラン=YouTube動画編集/TikTokショート動画編集/企業紹介PRムービー/撮影込み映像制作。オプション=テロップ字幕/BGM効果音/サムネイル作成/字幕生成/プロナレーション/SNSリサイズ/アニメーション追加",
  },
  app: {
    label: "アプリ開発",
    hearingUrl: "/hearing/hearing_app.html",
    summary: "プラン=PWA簡易Webアプリ/iOSまたはAndroid単体/iOS+Android両対応/業務アプリ。オプション=SNSログイン/プッシュ通知/管理画面/ユーザー認証/決済機能/チャット機能/多言語対応",
  },
  system: {
    label: "システム開発",
    hearingUrl: "/hearing/hearing_system.html",
    summary: "プラン=業務システム小規模/API連携外部サービス接続/SaaS Webアプリ開発/自動化ツール開発。オプション=管理画面構築/ユーザー認証/API連携/決済機能実装/クラウドインフラ構築/自動テストCI CD/セキュリティ診断",
  },
  design: {
    label: "グラフィック・デザイン",
    hearingUrl: "/hearing/hearing_design.html",
    summary: "プラン=ロゴデザインシンプル/ロゴデザイン本格オリジナル/名刺デザイン/チラシフライヤー/ブランドVI設計一式。オプション=カラーバリエーション追加/修正回数追加/印刷用データ入稿対応/SNSアイコンバナーセット/ブランドガイドライン作成/封筒レターヘッドデザイン/商品パッケージデザイン",
  },
};

export const CATEGORY_SUMMARY = Object.entries(CATEGORY_INFO)
  .map(([id, c]) => `- ${id}（${c.label}）: ${c.summary}`)
  .join("\n");
