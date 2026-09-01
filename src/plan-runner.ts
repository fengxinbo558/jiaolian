import {
  workoutPlanTotalSets,
  type WorkoutPlan,
  type WorkoutStep,
} from "./plans";

export type PlanPhase =
  | "idle"
  | "warmup"
  | "preparing"
  | "active"
  | "resting"
  | "paused"
  | "cooldown"
  | "complete";

export type RestPace = "fast" | "standard" | "extended";

export interface RestRecord {
  plannedSeconds: number;
  actualSeconds: number;
  pace: RestPace;
}

export interface PlanSnapshot {
  phase: PlanPhase;
  stepIndex: number;
  setIndex: number;
  completedSets: number;
  totalSets: number;
  currentStep: WorkoutStep;
  remainingSeconds: number | null;
  progressPercent: number;
  pausedFrom: Exclude<PlanPhase, "paused"> | null;
}

export function classifyRestPace(
  actualSeconds: number,
  plannedSeconds: number,
): RestPace {
  if (plannedSeconds <= 0) return "standard";
  const ratio = actualSeconds / plannedSeconds;
  if (ratio < 0.7) return "fast";
  if (ratio > 1.3) return "extended";
  return "standard";
}

export class WorkoutPlanRunner {
  private phase: PlanPhase = "idle";
  private stepIndex = 0;
  private setIndex = 0;
  private completedSets = 0;
  private phaseEndsAt: number | null = null;
  private restStartedAt: number | null = null;
  private plannedRestSeconds = 0;
  private pausedFrom: Exclude<PlanPhase, "paused"> | null = null;
  private pausedRemainingMs: number | null = null;
  private pausedAt: number | null = null;
  private readonly preparationSeconds: number;
  readonly restRecords: RestRecord[] = [];

  constructor(readonly plan: WorkoutPlan, preparationSeconds = 3) {
    this.preparationSeconds = preparationSeconds;
  }

  start(now = Date.now()): void {
    this.phase = "warmup";
    this.stepIndex = 0;
    this.setIndex = 0;
    this.completedSets = 0;
    this.restRecords.length = 0;
    this.phaseEndsAt = now + this.plan.warmupSeconds * 1_000;
    this.restStartedAt = null;
    this.plannedRestSeconds = 0;
    this.pausedFrom = null;
    this.pausedRemainingMs = null;
    this.pausedAt = null;
  }

  tick(now = Date.now()): boolean {
    if (this.phaseEndsAt === null || now < this.phaseEndsAt) return false;
    if (this.phase === "warmup" || this.phase === "resting") {
      if (this.phase === "resting") this.finishRest(now);
      this.beginPreparation(now);
      return true;
    }
    if (this.phase === "preparing") {
      this.phase = "active";
      this.phaseEndsAt = null;
      return true;
    }
    if (this.phase === "cooldown") {
      this.phase = "complete";
      this.phaseEndsAt = null;
      return true;
    }
    return false;
  }

  skipWarmup(now = Date.now()): void {
    if (this.phase !== "warmup") return;
    this.beginPreparation(now);
  }

  markSetComplete(now = Date.now()): void {
    if (this.phase !== "active") return;
    this.completedSets += 1;
    const completedStep = this.currentStep;
    if (this.completedSets >= workoutPlanTotalSets(this.plan)) {
      this.phase = "cooldown";
      this.phaseEndsAt = now + this.plan.cooldownSeconds * 1_000;
      return;
    }
    const completedStepIndex = this.stepIndex;
    this.advanceCursor();
    this.phase = "resting";
    this.restStartedAt = now;
    const movedToNextExercise = this.stepIndex !== completedStepIndex;
    this.plannedRestSeconds = movedToNextExercise
      ? (this.plan.transitionSeconds ?? completedStep.restSeconds)
      : completedStep.restSeconds;
    this.phaseEndsAt = now + this.plannedRestSeconds * 1_000;
  }

  skipRest(now = Date.now()): void {
    if (this.phase !== "resting") return;
    this.finishRest(now);
    this.beginPreparation(now);
  }

  skipPreparation(): void {
    if (this.phase !== "preparing") return;
    this.phase = "active";
    this.phaseEndsAt = null;
  }

  extendRest(seconds: number): void {
    if (this.phase !== "resting" || this.phaseEndsAt === null || seconds <= 0) return;
    this.phaseEndsAt += seconds * 1_000;
  }

  skipCooldown(): void {
    if (this.phase !== "cooldown") return;
    this.phase = "complete";
    this.phaseEndsAt = null;
  }

  pause(now = Date.now()): void {
    if (
      this.phase === "idle" ||
      this.phase === "paused" ||
      this.phase === "complete"
    ) return;
    this.pausedFrom = this.phase;
    this.pausedAt = now;
    this.pausedRemainingMs = this.phaseEndsAt === null
      ? null
      : Math.max(0, this.phaseEndsAt - now);
    this.phase = "paused";
    this.phaseEndsAt = null;
  }

  resume(now = Date.now()): void {
    if (this.phase !== "paused" || this.pausedFrom === null) return;
    this.phase = this.pausedFrom;
    this.phaseEndsAt = this.pausedRemainingMs === null
      ? null
      : now + this.pausedRemainingMs;
    if (
      this.phase === "resting" &&
      this.restStartedAt !== null &&
      this.pausedAt !== null
    ) {
      this.restStartedAt += now - this.pausedAt;
    }
    this.pausedFrom = null;
    this.pausedRemainingMs = null;
    this.pausedAt = null;
  }

  getSnapshot(now = Date.now()): PlanSnapshot {
    const totalSets = workoutPlanTotalSets(this.plan);
    return {
      phase: this.phase,
      stepIndex: this.stepIndex,
      setIndex: this.setIndex,
      completedSets: this.completedSets,
      totalSets,
      currentStep: this.currentStep,
      remainingSeconds: this.phaseEndsAt === null
        ? null
        : Math.max(0, Math.ceil((this.phaseEndsAt - now) / 1_000)),
      progressPercent: totalSets === 0
        ? 0
        : Math.min(100, (this.completedSets / totalSets) * 100),
      pausedFrom: this.pausedFrom,
    };
  }

  private get currentStep(): WorkoutStep {
    const step = this.plan.steps[this.stepIndex] ?? this.plan.steps[0];
    if (!step) throw new Error("Workout plan must contain at least one step");
    return step;
  }

  private beginPreparation(now: number): void {
    this.phase = "preparing";
    this.phaseEndsAt = now + this.preparationSeconds * 1_000;
  }

  private finishRest(now: number): void {
    if (this.restStartedAt === null) return;
    const actualSeconds = Math.max(0, (now - this.restStartedAt) / 1_000);
    this.restRecords.push({
      plannedSeconds: this.plannedRestSeconds,
      actualSeconds,
      pace: classifyRestPace(actualSeconds, this.plannedRestSeconds),
    });
    this.restStartedAt = null;
  }

  private advanceCursor(): void {
    const step = this.currentStep;
    if (this.setIndex + 1 < step.sets) {
      this.setIndex += 1;
      return;
    }
    this.stepIndex += 1;
    this.setIndex = 0;
  }
}
