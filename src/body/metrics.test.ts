import { describe, expect, it } from "vitest";
import {
  calculateBmi,
  calculateBodyMetrics,
  calculateBmr,
  calculateHealthyWeightRange,
  calculateNavyBodyFat,
  calculateTdee,
  classifyBmi,
  type BodyMetricInput,
} from "./metrics";

const completeMale: BodyMetricInput = {
  age: 30,
  formulaSex: "male",
  heightCm: 175,
  weightKg: 70,
  activityLevel: "moderate",
  waistCm: 82,
  neckCm: 38,
  hipCm: 95,
};

describe("body metrics", () => {
  it("calculates common adult reference metrics", () => {
    expect(calculateBmi(70, 175)).toBe(22.9);
    expect(classifyBmi(22.9)).toBe("健康范围");
    expect(calculateHealthyWeightRange(175)).toEqual({ low: 56.7, high: 76.3 });
    expect(calculateBmr(completeMale)).toBe(1649);
    expect(calculateTdee(1649, "moderate")).toBe(2556);
  });

  it("only estimates circumference body fat when required inputs are present", () => {
    expect(calculateNavyBodyFat(completeMale)).toBeCloseTo(14.5, 1);
    expect(calculateNavyBodyFat({ ...completeMale, formulaSex: "female", hipCm: null })).toBeNull();
  });

  it("derives ratios and composition without inventing missing values", () => {
    const complete = calculateBodyMetrics(completeMale);
    expect(complete.waistToHeightRatio).toBe(0.47);
    expect(complete.bodyFatPercent).not.toBeNull();
    expect(complete.fatMassKg).not.toBeNull();
    expect(complete.leanMassKg).not.toBeNull();
    expect(complete.ffmi).not.toBeNull();

    const partial = calculateBodyMetrics({
      age: null,
      formulaSex: null,
      heightCm: 175,
      weightKg: null,
      activityLevel: null,
    });
    expect(partial.bmi).toBeNull();
    expect(partial.bmrKcal).toBeNull();
    expect(partial.tdeeKcal).toBeNull();
    expect(partial.healthyWeightRangeKg).toEqual({ low: 56.7, high: 76.3 });
  });

  it("rejects values outside the product's supported adult range", () => {
    expect(calculateBmi(15, 175)).toBeNull();
    expect(calculateBmr({ ...completeMale, age: 61 })).toBeNull();
    expect(calculateNavyBodyFat({ ...completeMale, waistCm: 30 })).toBeNull();
  });
});
