import { describe, expect, it } from "vitest";
import {
  estimateCalorieRange,
  estimateCalories,
  EXERCISE_MET,
  formatCalories,
  isValidWeightKg,
} from "./calories";

describe("calorie estimates", () => {
  it("uses MET, weight and active movement minutes", () => {
    expect(estimateCalories({
      exerciseId: "jumping-jack",
      weightKg: 70,
      activeDurationMs: 10 * 60_000,
    })).toBeCloseTo(91.875, 3);
  });

  it("does not invent calories without valid weight or active time", () => {
    expect(estimateCalories({ exerciseId: "squat", weightKg: 0, activeDurationMs: 60_000 })).toBeNull();
    expect(estimateCalories({ exerciseId: "squat", weightKg: 70, activeDurationMs: 0 })).toBeNull();
    expect(isValidWeightKg(29)).toBe(false);
    expect(isValidWeightKg(70)).toBe(true);
  });

  it("returns a restrained plan range", () => {
    expect(estimateCalorieRange(["squat", "jumping-jack"], 70, 20 * 60_000)).toEqual({
      low: expect.any(Number),
      high: expect.any(Number),
    });
    const range = estimateCalorieRange(["squat", "jumping-jack"], 70, 20 * 60_000)!;
    expect(range.low).toBeLessThan(range.high);
  });

  it("formats small values without false precision elsewhere", () => {
    expect(formatCalories(4.24)).toBe("4.2");
    expect(formatCalories(28.6)).toBe("29");
    expect(formatCalories(null)).toBe("—");
  });

  it("contains MET estimates for all 100 active catalog actions", () => {
    expect(Object.keys(EXERCISE_MET)).toHaveLength(100);
    expect(estimateCalories({
      exerciseId: "chair-pose",
      weightKg: 70,
      activeDurationMs: 10 * 60_000,
    })).toBeCloseTo(36.75, 2);
    expect(estimateCalories({
      exerciseId: "dumbbell-thruster",
      weightKg: 70,
      activeDurationMs: 10 * 60_000,
    })).toBeCloseTo(98, 2);
    expect(estimateCalories({
      exerciseId: "band-squat",
      weightKg: 70,
      activeDurationMs: 10 * 60_000,
    })).toBeCloseTo(67.375, 3);
  });
});
