/* ============================================================
   Aster Systems / ty-mitumori
   見積もり金額計算ロジック（純粋関数）
   ------------------------------------------------------------
   public/js/estimate.js の computeTotal() がこの関数を通じて
   見積もりシミュレーターの金額を算出する。DOM・グローバル変数への
   依存を一切持たない（state・catalogは呼び出し側が明示的に渡す）。

   計算順序（変更する場合は既存の計算結果とのズレがないか確認すること）：
   プラン価格 → カテゴリ別addon → 共通addon → rush倍率
   → セットプラン割引 → 納品スケジュール倍率 → キャンペーン割引
   ============================================================ */

export function computeTotalPure(state, catalog) {
  const { categories, commonAddons, bundles, deliveryOptions, activeCampaign } = catalog;
  const cat = categories.find((c) => c.id === state.categoryId);
  if (!cat) return { total: 0, breakdown: [], recurringTotal: 0 };

  const breakdown = [];
  let total = 0;

  const plan = cat.plans.find((p) => p.id === state.planId);
  if (plan) {
    total += plan.price;
    breakdown.push({ label: plan.label, price: plan.price, days: plan.days });
  }

  cat.addons.forEach((a) => {
    if (a.type === "checkbox" && state.addons[a.id]) {
      total += a.price;
      breakdown.push({ label: a.label, price: a.price, days: a.days });
    } else if (a.type === "stepper" && state.addons[a.id]) {
      const qty = state.addons[a.id];
      const sub = qty * a.price;
      total += sub;
      breakdown.push({ label: `${a.label} × ${qty}`, price: sub, days: a.days * qty });
    }
  });

  commonAddons.forEach((a) => {
    if (a.type === "checkbox" && state.addons[a.id]) {
      total += a.price;
      breakdown.push({ label: a.label, price: a.price, days: a.days });
    }
  });

  const rush = commonAddons.find((a) => a.type === "multiplier");
  if (rush && state.addons[rush.id]) {
    const before = total;
    total = Math.round(total * rush.value);
    breakdown.push({ label: rush.label, price: total - before });
  }

  // セットプラン割引
  if (state.bundleId) {
    const bundle = bundles.find((b) => b.id === state.bundleId);
    if (bundle) {
      const before = total;
      total = bundle.discount_type === "fixed"
        ? Math.max(0, Math.round(total - bundle.discount_value))
        : Math.round(total * (1 - bundle.discount_value / 100));
      breakdown.push({ label: `${bundle.label}（セット割引）`, price: total - before });
    }
  }

  // 納品スケジュールによる倍率
  const delivery = deliveryOptions.find((d) => d.id === state.deliveryOptionId);
  if (delivery && delivery.multiplier !== 1) {
    const before = total;
    total = Math.round(total * delivery.multiplier);
    breakdown.push({ label: `${delivery.label}`, price: total - before });
  }

  // キャンペーン割引
  if (activeCampaign && (!activeCampaign.category_id || activeCampaign.category_id === state.categoryId)) {
    const before = total;
    total = activeCampaign.discount_type === "fixed"
      ? Math.max(0, Math.round(total - activeCampaign.discount_value))
      : Math.round(total * (1 - activeCampaign.discount_value / 100));
    breakdown.push({ label: `${activeCampaign.label}（キャンペーン割引）`, price: total - before });
  }

  const recurringTotal = cat.recurring.reduce((sum, r) => sum + r.price, 0);

  return { total, breakdown, recurringTotal };
}
