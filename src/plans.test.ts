import { describe, expect, it } from "vitest";
import {
  findWorkoutPlan,
  workoutPlanTotalSets,
  WORKOUT_PLANS,
} from "./plans";
import { EXERCISE_PROFILES } from "./exercises";

describe("workout plans", () => {
  it("keeps the original plans and adds 12 intensity-balanced plans", () => {
    expect(WORKOUT_PLANS).toHaveLength(20);
    expect(WORKOUT_PLANS.flatMap((plan) => plan.steps.map((step) => step.exerciseId))).toContain("squat");
    expect(WORKOUT_PLANS.filter((plan) => plan.equipment !== "无需器械")).toHaveLength(4);
    expect(findWorkoutPlan("quick-cardio")?.durationMinutes).toBe(16);
    expect(WORKOUT_PLANS.every((plan) => workoutPlanTotalSets(plan) > 0)).toBe(true);
    expect(WORKOUT_PLANS.every((plan) => plan.steps.every((step) => step.restSeconds >= 30))).toBe(true);
    const scientificPlans = WORKOUT_PLANS.filter((plan) => plan.intensity);
    expect(scientificPlans).toHaveLength(12);
    expect(scientificPlans.filter((plan) => plan.intensity === "轻")).toHaveLength(4);
    expect(scientificPlans.filter((plan) => plan.intensity === "中")).toHaveLength(4);
    expect(scientificPlans.filter((plan) => plan.intensity === "高")).toHaveLength(4);
    expect(scientificPlans.every((plan) => (plan.transitionSeconds ?? 0) >= 40)).toBe(true);
    expect(scientificPlans.every((plan) => (plan.audience?.length ?? 0) > 8)).toBe(true);
    expect(scientificPlans.every((plan) => (plan.evidenceBasis?.length ?? 0) > 12)).toBe(true);
    expect(scientificPlans.every((plan) => plan.steps.every(
      (step) => EXERCISE_PROFILES[step.exerciseId].available,
    ))).toBe(true);
  });
});
