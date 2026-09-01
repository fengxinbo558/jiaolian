import { describe, expect, it } from "vitest";
import { EMPTY_BODY_PROFILE } from "./body/profile";
import { recommendWorkoutPlans } from "./plan-recommendation";
import { WORKOUT_PLANS } from "./plans";
import type { SessionSummary } from "./types";

function session(daysAgo: number): SessionSummary {
  return {
    id: String(daysAgo),
    endedAt: new Date(Date.UTC(2026, 7, 24 - daysAgo)).toISOString(),
    totalReps: 20,
    qualifiedReps: 18,
    averageTempoSeconds: 2,
    issueCounts: {},
  };
}

describe("plan recommendation", () => {
  it("keeps a sedentary new user on light plans and respects no-equipment choice", () => {
    const recommendations = recommendWorkoutPlans(WORKOUT_PLANS, {
      profile: { ...EMPTY_BODY_PROFILE, age: 45, heightCm: 170, weightKg: 92, activityLevel: "sedentary" },
      capacityRecords: [],
      sessions: [],
      goal: "general",
      availableMinutes: 25,
      equipment: "none",
      now: new Date(Date.UTC(2026, 7, 24)),
    });
    expect(recommendations[0]?.plan.intensity).toBe("轻");
    expect(recommendations.every((item) => item.plan.equipment === "无需器械")).toBe(true);
    expect(recommendations.every((item) => item.plan.durationMinutes <= 25)).toBe(true);
    expect(recommendations[0]?.reasons.length).toBeGreaterThan(1);
  });

  it("can recommend high intensity to a consistently active user with good movement quality", () => {
    const sessions = Array.from({ length: 10 }, (_, index) => session(index));
    const recommendations = recommendWorkoutPlans(WORKOUT_PLANS, {
      profile: { ...EMPTY_BODY_PROFILE, age: 30, heightCm: 178, weightKg: 75, activityLevel: "very" },
      capacityRecords: [{
        schemaVersion: 1, id: "c1", exerciseId: "squat", mode: "bodyweight-reps",
        performanceType: "working", recordedAt: new Date().toISOString(), loadKg: null,
        loadMode: null, reps: 20, sets: 3, holdSeconds: null, rir: 3,
        qualityPercent: 90, assistance: null,
      }],
      sessions,
      goal: "fat-loss",
      availableMinutes: 40,
      equipment: "dumbbell",
      now: new Date(Date.UTC(2026, 7, 24)),
    });
    expect(recommendations[0]?.plan.intensity).toBe("高");
    expect(recommendations[0]?.reasons.join("")).toMatch(/高强度|目标/);
  });

  it("uses the selected goal to change ranking", () => {
    const base = {
      profile: { ...EMPTY_BODY_PROFILE, activityLevel: "moderate" as const },
      capacityRecords: [],
      sessions: [session(1), session(4), session(8)],
      availableMinutes: 35,
      equipment: "none" as const,
      now: new Date(Date.UTC(2026, 7, 24)),
    };
    const core = recommendWorkoutPlans(WORKOUT_PLANS, { ...base, goal: "core" });
    const strength = recommendWorkoutPlans(WORKOUT_PLANS, { ...base, goal: "strength" });
    expect(core[0]?.plan.id).not.toBe(strength[0]?.plan.id);
  });
});
