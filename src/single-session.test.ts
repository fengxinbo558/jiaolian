import { describe, expect, it } from "vitest";
import { EMPTY_BODY_PROFILE } from "./body/profile";
import { EXERCISE_PROFILES } from "./exercises";
import {
  buildSingleExercisePlan,
  defaultSingleSessionSettings,
  IdleGuidanceScheduler,
  recommendRest,
} from "./single-session";
import { WorkoutPlanRunner } from "./plan-runner";

describe("single exercise session", () => {
  it("builds an editable one-exercise plan", () => {
    const plan = buildSingleExercisePlan("squat", EXERCISE_PROFILES.squat, {
      sets: 4,
      target: 10,
      restSeconds: 75,
    });
    expect(plan.steps).toEqual([{
      exerciseId: "squat",
      sets: 4,
      target: { kind: "repetitions", value: 10 },
      restSeconds: 75,
    }]);
    expect(plan.warmupSeconds).toBe(0);
  });

  it("uses a more conservative rest when activity is low", () => {
    const active = recommendRest(EXERCISE_PROFILES.squat, {
      ...EMPTY_BODY_PROFILE,
      activityLevel: "very",
    });
    const sedentary = recommendRest(EXERCISE_PROFILES.squat, {
      ...EMPTY_BODY_PROFILE,
      activityLevel: "sedentary",
    });
    expect(sedentary.seconds).toBeGreaterThan(active.seconds);
    expect(defaultSingleSessionSettings(EXERCISE_PROFILES.squat, EMPTY_BODY_PROFILE).sets).toBe(3);
  });

  it("moves from a completed set into editable rest and finishes after the last set", () => {
    const plan = buildSingleExercisePlan("squat", EXERCISE_PROFILES.squat, {
      sets: 2,
      target: 3,
      restSeconds: 75,
    });
    const runner = new WorkoutPlanRunner(plan);
    runner.start(0);
    runner.skipWarmup(0);
    runner.skipPreparation();
    runner.markSetComplete(1_000);
    expect(runner.getSnapshot(1_000)).toMatchObject({
      phase: "resting",
      completedSets: 1,
      remainingSeconds: 75,
    });
    runner.skipRest(2_000);
    runner.skipPreparation();
    runner.markSetComplete(3_000);
    runner.skipCooldown();
    expect(runner.getSnapshot(3_000)).toMatchObject({
      phase: "complete",
      completedSets: 2,
      totalSets: 2,
    });
  });
});

describe("idle guidance scheduler", () => {
  it("announces readiness, then short and detailed reminders", () => {
    const scheduler = new IdleGuidanceScheduler();
    scheduler.reset(0);
    expect(scheduler.update({ now: 100, calibrated: true, trackingStable: true, moving: false })?.kind).toBe("ready");
    expect(scheduler.update({ now: 2_100, calibrated: true, trackingStable: true, moving: false })?.kind).toBe("short");
    expect(scheduler.update({ now: 6_100, calibrated: true, trackingStable: true, moving: false })?.kind).toBe("detailed");
  });

  it("cancels an idle reminder as soon as movement begins", () => {
    const scheduler = new IdleGuidanceScheduler();
    scheduler.reset(0);
    scheduler.update({ now: 100, calibrated: true, trackingStable: true, moving: false });
    expect(scheduler.update({ now: 300, calibrated: true, trackingStable: true, moving: true })?.kind).toBe("cancel");
    expect(scheduler.update({ now: 2_400, calibrated: true, trackingStable: true, moving: false })?.kind).toBe("short");
  });
});
