export type CalorieEquivalentKind = "banana" | "apple" | "egg" | "rice" | "fat-energy";

export interface CalorieEquivalent {
  kind: CalorieEquivalentKind;
  label: string;
  amountLabel: string;
  kcalPerAmount: number;
}

export const CALORIE_EQUIVALENTS: CalorieEquivalent[] = [
  { kind: "banana", label: "中等香蕉", amountLabel: "根中等香蕉", kcalPerAmount: 105 },
  { kind: "apple", label: "中等苹果", amountLabel: "个中等苹果", kcalPerAmount: 95 },
  { kind: "egg", label: "水煮蛋", amountLabel: "个水煮蛋", kcalPerAmount: 78 },
  { kind: "rice", label: "熟米饭 100 克", amountLabel: "份熟米饭（每份 100 克）", kcalPerAmount: 116 },
  { kind: "fat-energy", label: "脂肪能量参考", amountLabel: "", kcalPerAmount: 7_700 },
];

const DEFAULT_KIND: CalorieEquivalentKind = "banana";
const PREFERENCE_KEY = "form:calorie-equivalent:v1";

function isKind(value: unknown): value is CalorieEquivalentKind {
  return CALORIE_EQUIVALENTS.some((item) => item.kind === value);
}

export class CalorieEquivalentPreferenceStore {
  constructor(
    private readonly storage: Pick<Storage, "getItem" | "setItem">,
    private readonly key = PREFERENCE_KEY,
  ) {}

  load(): CalorieEquivalentKind {
    try {
      const value = this.storage.getItem(this.key);
      return isKind(value) ? value : DEFAULT_KIND;
    } catch {
      return DEFAULT_KIND;
    }
  }

  save(kind: CalorieEquivalentKind): CalorieEquivalentKind {
    const safeKind = isKind(kind) ? kind : DEFAULT_KIND;
    try {
      this.storage.setItem(this.key, safeKind);
    } catch {
      // Storage may be unavailable in strict private browsing.
    }
    return safeKind;
  }
}

function formatServingCount(count: number, amountLabel: string): string {
  if (count > 0 && count < 0.1) {
    const denominator = Math.max(2, Math.round(1 / count));
    return `约 1/${denominator} ${amountLabel}`;
  }
  if (count < 10) return `约 ${count.toFixed(1)} ${amountLabel}`;
  return `约 ${Math.round(count)} ${amountLabel}`;
}

export function formatCalorieEquivalent(kcal: number, kind: CalorieEquivalentKind): string {
  if (!Number.isFinite(kcal) || kcal <= 0) return "有训练消耗后显示能量类比";
  const item = CALORIE_EQUIVALENTS.find((candidate) => candidate.kind === kind)
    ?? CALORIE_EQUIVALENTS[0]!;
  if (item.kind === "fat-energy") {
    const grams = kcal / 7.7;
    if (grams < 500) return `约 ${grams < 10 ? grams.toFixed(1) : Math.round(grams)} 克脂肪能量参考`;
    const kilograms = grams / 1_000;
    return `约 ${kilograms.toFixed(2)} 公斤（${(kilograms * 2).toFixed(2)} 斤）脂肪能量参考`;
  }
  return formatServingCount(kcal / item.kcalPerAmount, item.amountLabel);
}

export function calorieEquivalentDisclaimer(kind: CalorieEquivalentKind): string {
  return kind === "fat-energy"
    ? "仅为能量等值，不代表实际减少的体脂"
    : "食物大小和做法不同，结果仅作直观类比";
}
