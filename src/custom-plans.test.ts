import { describe, expect, it } from "vitest";
import { CustomPlanDraftStore, CustomPlanStore, generateCustomWorkoutPlan, type SavedCustomPlan } from "./custom-plans";
import { EXERCISE_PROFILES } from "./exercises";

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

describe("custom workout plans", () => {
  it("turns natural language preferences into a safe runnable plan", () => {
    const plan = generateCustomWorkoutPlan({
      prompt: "我想做 20 分钟轻松核心训练，不用器械",
      goal: "general",
      intensity: "moderate",
      equipment: "none",
      durationMinutes: 30,
    }, new Date("2026-08-25T08:00:00Z"));
    expect(plan.durationMinutes).toBe(20);
    expect(plan.intensity).toBe("轻");
    expect(plan.goal).toContain("核心");
    expect(plan.steps.length).toBeGreaterThanOrEqual(4);
    expect(plan.steps.every((step) => EXERCISE_PROFILES[step.exerciseId].available)).toBe(true);
  });

  it("uses available dumbbell movements when dumbbells are requested", () => {
    const plan = generateCustomWorkoutPlan({ prompt: "哑铃力量", goal: "strength", intensity: "moderate", equipment: "none", durationMinutes: 30 });
    expect(plan.equipment).toContain("哑铃");
    expect(plan.steps.some((step) => EXERCISE_PROFILES[step.exerciseId].discipline === "dumbbell")).toBe(true);
  });

  it("saves, pins and removes generated plans locally", () => {
    const storage = new MemoryStorage();
    const store = new CustomPlanStore(storage);
    const request = { prompt: "", goal: "general" as const, intensity: "light" as const, equipment: "none" as const, durationMinutes: 18 };
    const plan = generateCustomWorkoutPlan(request);
    expect(store.save(plan, request)[0]?.pinned).toBe(true);
    expect((store.load()[0] as SavedCustomPlan).plan.id).toBe(plan.id);
    expect(store.remove(plan.id)).toHaveLength(0);
  });

  it("keeps all saved plans until the user removes them", () => {
    const storage = new MemoryStorage();
    const store = new CustomPlanStore(storage);
    const request = { prompt: "", goal: "general" as const, intensity: "light" as const, equipment: "none" as const, durationMinutes: 18 };
    for (let index = 0; index < 15; index += 1) {
      store.save({ ...generateCustomWorkoutPlan(request, new Date(2026, 0, index + 1)), id: `custom-saved-${index}` }, request);
    }
    expect(store.load()).toHaveLength(15);
  });

  it("restores an unexpired generated draft and drops an expired one", () => {
    const storage = new MemoryStorage();
    const store = new CustomPlanDraftStore(storage);
    const request = { prompt: "核心", goal: "core" as const, intensity: "light" as const, equipment: "none" as const, durationMinutes: 18 };
    const plan = generateCustomWorkoutPlan(request);
    store.save(plan, request, new Date("2026-08-30T00:00:00Z"));
    expect(store.load(new Date("2026-08-31T00:00:00Z"))?.plan.id).toBe(plan.id);
    expect(store.load(new Date("2026-09-08T00:00:00Z"))).toBeNull();
  });
});
