import type { Deal, ScopeItem } from "@/app/lib/types";
import { SAMPLE_ID } from "@/app/lib/analyticsConstants";

const SAMPLE_SCOPE_ITEMS: ScopeItem[] = [
  {
    id: "sample-roof-repair",
    tier: 1,
    section: "systems",
    category: "Roof",
    description: "Replace shingles and underlayment",
    quantity: "1",
    unitCost: "8500",
    unit: "job",
  },
  {
    id: "sample-kitchen-refresh",
    tier: 2,
    section: "kitchen",
    category: "Kitchen",
    description: "Cabinet refresh and countertop replacement",
    quantity: "1",
    unitCost: "15000",
    unit: "job",
  },
  {
    id: "sample-interior-paint",
    tier: 3,
    section: "living",
    category: "Interior paint",
    description: "Paint walls and trim throughout",
    quantity: "1",
    unitCost: "16500",
    unit: "job",
  },
];

export function createSampleDeal(): Deal {
  return {
    id: SAMPLE_ID,
    createdAt: 0,
    updatedAt: 0,
    form: {
      address: "Sample Property",
      purchasePrice: "150000",
      rehabBudget: "46000",
      arv: "275000",
      holdingDays: "120",
      financingType: "cash",
      hardMoneyRate: "12",
      hardMoneyPoints: "2",
      strategy: "flip",
    },
    scopeItems: SAMPLE_SCOPE_ITEMS.map((item) => ({ ...item })),
    contingencyEnabled: true,
  };
}
