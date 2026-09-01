export type FormulaSex = "male" | "female";

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "very"
  | "extra";

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  extra: 1.9,
};

export interface BodyMetricInput {
  age: number | null;
  formulaSex: FormulaSex | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: ActivityLevel | null;
  waistCm?: number | null;
  neckCm?: number | null;
  hipCm?: number | null;
}

export type BmiBand = "偏轻" | "健康范围" | "偏高" | "较高";

export interface BodyMetricResult {
  bmi: number | null;
  bmiBand: BmiBand | null;
  healthyWeightRangeKg: { low: number; high: number } | null;
  bmrKcal: number | null;
  tdeeKcal: number | null;
  waistToHeightRatio: number | null;
  waistToHipRatio: number | null;
  bodyFatPercent: number | null;
  fatMassKg: number | null;
  leanMassKg: number | null;
  ffmi: number | null;
}

function isFiniteInRange(value: number | null | undefined, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function round(value: number, digits = 1): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function calculateBmi(weightKg: number | null, heightCm: number | null): number | null {
  if (!isFiniteInRange(weightKg, 30, 250) || !isFiniteInRange(heightCm, 120, 230)) return null;
  return round(weightKg / ((heightCm / 100) ** 2));
}

export function classifyBmi(bmi: number | null): BmiBand | null {
  if (bmi === null || !Number.isFinite(bmi) || bmi <= 0) return null;
  if (bmi < 18.5) return "偏轻";
  if (bmi < 25) return "健康范围";
  if (bmi < 30) return "偏高";
  return "较高";
}

export function calculateHealthyWeightRange(heightCm: number | null): { low: number; high: number } | null {
  if (!isFiniteInRange(heightCm, 120, 230)) return null;
  const heightM2 = (heightCm / 100) ** 2;
  return { low: round(18.5 * heightM2), high: round(24.9 * heightM2) };
}

export function calculateBmr(input: BodyMetricInput): number | null {
  const { age, formulaSex, heightCm, weightKg } = input;
  if (!isFiniteInRange(age, 18, 60)
    || !formulaSex
    || !isFiniteInRange(heightCm, 120, 230)
    || !isFiniteInRange(weightKg, 30, 250)) return null;
  const sexAdjustment = formulaSex === "male" ? 5 : -161;
  return Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + sexAdjustment);
}

export function calculateTdee(bmrKcal: number | null, activityLevel: ActivityLevel | null): number | null {
  if (bmrKcal === null || !Number.isFinite(bmrKcal) || bmrKcal <= 0 || !activityLevel) return null;
  return Math.round(bmrKcal * ACTIVITY_FACTORS[activityLevel]);
}

export function calculateNavyBodyFat(input: BodyMetricInput): number | null {
  const { formulaSex, heightCm, waistCm, neckCm, hipCm } = input;
  if (!formulaSex
    || !isFiniteInRange(heightCm, 120, 230)
    || !isFiniteInRange(waistCm, 40, 200)
    || !isFiniteInRange(neckCm, 20, 80)) return null;

  const heightIn = heightCm / 2.54;
  const waistIn = waistCm / 2.54;
  const neckIn = neckCm / 2.54;
  let estimate: number;
  if (formulaSex === "male") {
    const difference = waistIn - neckIn;
    if (difference <= 0) return null;
    estimate = 86.01 * Math.log10(difference) - 70.041 * Math.log10(heightIn) + 36.76;
  } else {
    if (!isFiniteInRange(hipCm, 50, 200)) return null;
    const circumference = waistIn + hipCm / 2.54 - neckIn;
    if (circumference <= 0) return null;
    estimate = 163.205 * Math.log10(circumference) - 97.684 * Math.log10(heightIn) - 78.387;
  }
  return estimate >= 2 && estimate <= 65 ? round(estimate) : null;
}

export function calculateBodyMetrics(input: BodyMetricInput): BodyMetricResult {
  const bmi = calculateBmi(input.weightKg, input.heightCm);
  const bmrKcal = calculateBmr(input);
  const bodyFatPercent = calculateNavyBodyFat(input);
  const waistToHeightRatio = isFiniteInRange(input.waistCm, 40, 200)
    && isFiniteInRange(input.heightCm, 120, 230)
    ? round(input.waistCm / input.heightCm, 2)
    : null;
  const waistToHipRatio = isFiniteInRange(input.waistCm, 40, 200)
    && isFiniteInRange(input.hipCm, 50, 200)
    ? round(input.waistCm / input.hipCm, 2)
    : null;
  const weightKg = isFiniteInRange(input.weightKg, 30, 250) ? input.weightKg : null;
  const canCalculateComposition = bodyFatPercent !== null
    && weightKg !== null;
  const fatMassKg = canCalculateComposition
    ? round(weightKg * bodyFatPercent / 100)
    : null;
  const leanMassKg = canCalculateComposition
    ? round(weightKg - (fatMassKg ?? 0))
    : null;
  const ffmi = leanMassKg !== null && isFiniteInRange(input.heightCm, 120, 230)
    ? round(leanMassKg / ((input.heightCm / 100) ** 2))
    : null;

  return {
    bmi,
    bmiBand: classifyBmi(bmi),
    healthyWeightRangeKg: calculateHealthyWeightRange(input.heightCm),
    bmrKcal,
    tdeeKcal: calculateTdee(bmrKcal, input.activityLevel),
    waistToHeightRatio,
    waistToHipRatio,
    bodyFatPercent,
    fatMassKg,
    leanMassKg,
    ffmi,
  };
}
