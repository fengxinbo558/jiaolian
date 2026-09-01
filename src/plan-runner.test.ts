import { describe, expect, it } from "vitest";
import { WORKOUT_PLANS } from "./plans";
import { classifyRestPace, WorkoutPlanRunner } from "./plan-runner";

describe("WorkoutPlanRunner", () => {
  it("moves from warmup through preparation into the first active set", () => {
    const runner = new WorkoutPlanRunner(WORKOUT_PLANS[0]!);
    runner.start(0);
    expect(runner.getSnapshot(0).phase).toBe("warmup");
    runner.skipWarmup(1_000);
    expect(runner.getSnapshot(1_000).phase).toBe("preparing");
    runner.tick(4_000);
    expect(runner.getSnapshot(4_000).phase).toBe("active");
  });

  it("advances sets, records rest and supports extending rest", () => {
    const runner = new WorkoutPlanRunner(WORKOUT_PLANS[0]!);
    runner.start(0);
    runner.skipWarmup(0);
    runner.tick(3_000);
    runner.markSetComplete(5_000);
    const resting = runner.getSnapshot(5_000);
    expect(resting.phase).toBe("resting");
    expect(resting.setIndex).toBe(1);
    expect(resting.remainingSeconds).toBe(60);
    runner.extendRest(15);
    expect(runner.getSnapshot(5_000).remainingSeconds).toBe(75);
    runner.skipRest(35_000);
    expect(runner.restRecords[0]).toMatchObject({ pace: "fast" });
    expect(runner.getSnapshot(35_000).phase).toBe("preparing");
  });

  it("pauses and resumes without consuming the remaining countdown", () => {
    const runner = new WorkoutPlanRunner(WORKOUT_PLANS[0]!);
    runner.start(0);
    runner.pause(20_000);
    expect(runner.getSnapshot(80_000).phase).toBe("paused");
    runner.resume(80_000);
    expect(runner.getSnapshot(80_000).remainingSeconds).toBe(100);
  });

  it("uses a separate action-transition rest after the final set of an exercise", () => {
    const plan = WORKOUT_PLANS.find((item) => item.id === "light-recovery-flow")!;
    const runner = new WorkoutPlanRunner(plan);
    runner.start(0);
    runner.skipWarmup(0);
    runner.skipPreparation();
    runner.markSetComplete(1_000);
    expect(runner.getSnapshot(1_000).remainingSeconds).toBe(40);
    runner.skipRest(41_000);
    runner.skipPreparation();
    runner.markSetComplete(42_000);
    expect(runner.getSnapshot(42_000).remainingSeconds).toBe(45);
    expect(runner.getSnapshot(42_000).stepIndex).toBe(1);
  });

  it("reaches cooldown only after every configured set is completed", () => {
    const runner = new WorkoutPlanRunner(WORKOUT_PLANS[0]!);
    runner.start(0);
    runner.skipWarmup(0);
    runner.skipPreparation();
    while (runner.getSnapshot().phase === "active") {
      runner.markSetComplete(1_000);
      if (runner.getSnapshot().phase === "cooldown") break;
      runner.skipRest(31_000);
      runner.skipPreparation();
    }
    const cooldown = runner.getSnapshot();
    expect(cooldown.phase).toBe("cooldown");
    expect(cooldown.completedSets).toBe(cooldown.totalSets);
    expect(runner.restRecords).toHaveLength(cooldown.totalSets - 1);
    runner.skipCooldown();
    expect(runner.getSnapshot().phase).toBe("complete");
  });
});

describe("classifyRestPace", () => {
  it("uses the planned rest as a proportional baseline", () => {
    expect(classifyRestPace(40, 60)).toBe("fast");
    expect(classifyRestPace(60, 60)).toBe("standard");
    expect(classifyRestPace(80, 60)).toBe("extended");
    expect(classifyRestPace(42, 60)).toBe("standard");
    expect(classifyRestPace(78, 60)).toBe("standard");
  });
});
