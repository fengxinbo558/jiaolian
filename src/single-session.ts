import type { BodyProfile } from "./body/profile";
import type { ExerciseCoachProfile } from "./exercises";
import type { WorkoutPlan, WorkoutTarget } from "./plans";
import type { ExerciseId, WorkoutPhase } from "./types";

export interface SingleSessionSettings {
  sets: number;
  target: number;
  restSeconds: number;
}

export interface RestRecommendation {
  seconds: number;
  reason: string;
}

const clampInteger = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(value)));

export function recommendRest(
  profile: ExerciseCoachProfile,
  body: BodyProfile,
): RestRecommendation {
  const profileRest = profile.suggestedTraining?.restSeconds;
  let seconds = profileRest ?? (profile.mode === "timed-hold" ? 45 : (profile.met ?? 4) >= 7 ? 60 : 45);
  const reasons = [`${profile.name}的动作强度`];

  if (body.activityLevel === "sedentary" || body.activityLevel === "light") {
    seconds += 15;
    reasons.push("当前活动水平偏低，预留恢复时间");
  } else if (body.activityLevel === "very" || body.activityLevel === "extra") {
    reasons.push("已有较稳定活动基础");
  }

  if (body.age !== null && body.age >= 50) {
    seconds += 15;
    reasons.push("按年龄采用更保守的恢复节奏");
  }

  if (body.weightKg !== null) reasons.push("已读取本机体重资料");
  const rounded = clampInteger(Math.round(seconds / 5) * 5, 30, 120);
  return { seconds: rounded, reason: reasons.join("；") };
}

export function defaultSingleSessionSettings(
  profile: ExerciseCoachProfile,
  body: BodyProfile,
): SingleSessionSettings {
  const rest = recommendRest(profile, body);
  const target = profile.mode === "timed-hold"
    ? 30
    : (profile.met ?? 4) >= 7
      ? 15
      : profile.difficulty === "进阶"
        ? 10
        : 12;
  return { sets: 3, target, restSeconds: rest.seconds };
}

export function normalizeSingleSessionSettings(
  settings: SingleSessionSettings,
  mode: ExerciseCoachProfile["mode"],
): SingleSessionSettings {
  return {
    sets: clampInteger(settings.sets, 1, 10),
    target: clampInteger(settings.target, 1, mode === "timed-hold" ? 300 : 100),
    restSeconds: clampInteger(settings.restSeconds, 15, 300),
  };
}

function planEquipment(profile: ExerciseCoachProfile): WorkoutPlan["equipment"] {
  return profile.discipline === "dumbbell" || profile.equipment?.includes("dumbbell")
    ? "一只或一对哑铃"
    : "无需器械";
}

export function buildSingleExercisePlan(
  exerciseId: ExerciseId,
  profile: ExerciseCoachProfile,
  input: SingleSessionSettings,
): WorkoutPlan {
  const settings = normalizeSingleSessionSettings(input, profile.mode);
  const target: WorkoutTarget = {
    kind: profile.mode === "timed-hold" ? "seconds" : "repetitions",
    value: settings.target,
  };
  const activeSeconds = profile.mode === "timed-hold"
    ? settings.target
    : settings.target * 3;
  const totalSeconds = settings.sets * activeSeconds + (settings.sets - 1) * settings.restSeconds;
  return {
    id: `custom-single-${exerciseId}`,
    name: `${profile.name}按组训练`,
    description: `共 ${settings.sets} 组，每组${profile.mode === "timed-hold" ? "保持" : "完成"} ${settings.target}${profile.mode === "timed-hold" ? " 秒" : " 次"}`,
    goal: "单动作按组训练",
    level: profile.difficulty === "进阶" ? "进阶" : "基础",
    equipment: planEquipment(profile),
    durationMinutes: Math.max(1, Math.ceil(totalSeconds / 60)),
    intensity: (profile.met ?? 4) >= 7 ? "高" : (profile.met ?? 4) >= 5 ? "中" : "轻",
    audience: "希望按目标完成单个动作的训练者",
    evidenceBasis: "组数、次数和休息可在开始前修改。",
    warmupSeconds: 0,
    cooldownSeconds: 0,
    steps: [{ exerciseId, sets: settings.sets, target, restSeconds: settings.restSeconds }],
    accent: "teal",
  };
}

export type IdleGuidanceKind = "ready" | "short" | "detailed" | "cancel";

export interface IdleGuidanceCue {
  kind: IdleGuidanceKind;
}

const ACTIVE_PHASES = new Set<WorkoutPhase>([
  "descending", "bottom", "ascending", "opening", "open", "closing",
  "lifting", "top", "lowering", "left-lift", "right-lift", "plank",
  "pressing", "holding",
]);

export function isActiveMotionPhase(phase: WorkoutPhase): boolean {
  return ACTIVE_PHASES.has(phase);
}

export class IdleGuidanceScheduler {
  private readyAnnounced = false;
  private inactiveSince: number | null = null;
  private reminderStage = 0;
  private idleSpeechActive = false;

  reset(now: number): void {
    this.readyAnnounced = false;
    this.inactiveSince = now;
    this.reminderStage = 0;
    this.idleSpeechActive = false;
  }

  update(input: {
    now: number;
    calibrated: boolean;
    trackingStable: boolean;
    moving: boolean;
  }): IdleGuidanceCue | null {
    const { now, calibrated, trackingStable, moving } = input;
    if (moving) {
      const shouldCancel = this.idleSpeechActive;
      this.inactiveSince = now;
      this.reminderStage = 0;
      this.idleSpeechActive = false;
      return shouldCancel ? { kind: "cancel" } : null;
    }
    if (!calibrated || !trackingStable) {
      this.inactiveSince = now;
      this.reminderStage = 0;
      this.idleSpeechActive = false;
      return null;
    }
    if (!this.readyAnnounced) {
      this.readyAnnounced = true;
      this.inactiveSince = now;
      this.idleSpeechActive = true;
      return { kind: "ready" };
    }
    this.inactiveSince ??= now;
    const idleMs = now - this.inactiveSince;
    if (this.reminderStage === 0 && idleMs >= 2_000) {
      this.reminderStage = 1;
      this.idleSpeechActive = true;
      return { kind: "short" };
    }
    if (this.reminderStage === 1 && idleMs >= 6_000) {
      this.reminderStage = 2;
      this.idleSpeechActive = true;
      return { kind: "detailed" };
    }
    return null;
  }
}
