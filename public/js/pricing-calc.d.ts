// pricing-calc.js の型宣言（サーバー側 src/index.ts からのimport用）。
// 実装は pricing-calc.js 側のみに存在する（このファイルは型情報のみ）。
export type PricingCalcState = {
  categoryId: string | null;
  planId: string | null;
  addons: Record<string, boolean | number>;
  bundleId: string | null;
  deliveryOptionId: string | null;
};

export type PricingCalcCatalog = {
  categories: any[];
  commonAddons: any[];
  bundles: any[];
  deliveryOptions: any[];
  activeCampaign: any;
};

export type PricingCalcResult = {
  total: number;
  breakdown: { label: string; price: number; days?: number }[];
  recurringTotal: number;
};

export function computeTotalPure(state: PricingCalcState, catalog: PricingCalcCatalog): PricingCalcResult;
