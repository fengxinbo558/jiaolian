import { EXERCISE_PROFILES } from "./exercises";
import type { ExerciseId } from "./types";
import type { WorkoutPlan, WorkoutStep } from "./plans";

const SAVED_PLAN_KEY = "form:custom-workout-plans:v1";
const PLAN_DRAFT_KEY = "form:custom-plan-draft:v1";

type PlanStorage = Pick<Storage, "getItem" | "setItem">;

export type CustomPlanGoal = "general" | "fat-loss" | "strength" | "core" | "mobility";
export type CustomPlanIntensity = "light" | "moderate" | "high";
export type CustomPlanEquipment = "none" | "dumbbell";

export interface CustomPlanRequest {
  prompt: string;
  goal: CustomPlanGoal;
  intensity: CustomPlanIntensity;
  equipment: CustomPlanEquipment;
  durationMinutes: number;
  excludedExerciseIds?: ExerciseId[];
}

export interface SavedCustomPlan {
  schemaVersion: 1;
  savedAt: string;
  pinned: boolean;
  plan: WorkoutPlan;
  request: CustomPlanRequest;
}

export interface CustomPlanDraft {
  schemaVersion: 1;
  updatedAt: string;
  expiresAt: string;
  plan: WorkoutPlan;
  request: CustomPlanRequest;
}

const GOAL_POOLS: Record<CustomPlanGoal, ExerciseId[]> = {
  general: ["squat", "push-up", "reverse-lunge", "bird-dog", "jumping-jack", "glute-bridge", "shoulder-tap"],
  "fat-loss": ["jumping-jack", "high-knees", "mountain-climber", "squat", "burpee", "reverse-lunge"],
  strength: ["squat", "push-up", "reverse-lunge", "glute-bridge", "goblet-squat", "dumbbell-rdl", "dumbbell-shoulder-press", "dumbbell-biceps-curl"],
  core: ["dead-bug", "bird-dog", "plank", "side-plank", "shoulder-tap", "mountain-climber"],
  mobility: ["downward-dog", "tree-pose", "chair-pose", "bird-dog", "side-lunge", "glute-bridge"],
};

const INTENSITY_LABEL: Record<CustomPlanIntensity, "轻" | "中" | "高"> = {
  light: "轻",
  moderate: "中",
  high: "高",
};

const GOAL_LABEL: Record<CustomPlanGoal, string> = {
  general: "全身均衡",
  "fat-loss": "心肺与热量消耗",
  strength: "基础力量",
  core: "核心稳定",
  mobility: "活动度与恢复",
};

function isAvailable(exerciseId: ExerciseId): boolean {
  return EXERCISE_PROFILES[exerciseId]?.available === true;
}

function equipmentMatches(exerciseId: ExerciseId, equipment: CustomPlanEquipment): boolean {
  const profile = EXERCISE_PROFILES[exerciseId];
  if (!profile) return false;
  if (equipment === "dumbbell") return profile.equipment !== "resistance-band";
  return !profile.equipment || profile.equipment === "none";
}

function inferRequest(input: CustomPlanRequest): CustomPlanRequest {
  const text = input.prompt.toLowerCase();
  const duration = text.match(/(\d{1,2})\s*(?:分钟|分)/)?.[1];
  const goal: CustomPlanGoal = /减脂|燃脂|有氧|心肺/.test(text)
    ? "fat-loss"
    : /力量|增肌|臀腿/.test(text)
      ? "strength"
      : /核心|腹/.test(text)
        ? "core"
        : /拉伸|瑜伽|活动度|恢复/.test(text)
          ? "mobility"
          : input.goal;
  const intensity: CustomPlanIntensity = /高强度|挑战|很累/.test(text)
    ? "high"
    : /轻松|低强度|恢复|新手/.test(text)
      ? "light"
      : input.intensity;
  const equipment = /哑铃/.test(text) ? "dumbbell" : input.equipment;
  return {
    ...input,
    goal,
    intensity,
    equipment,
    durationMinutes: duration ? Math.min(60, Math.max(12, Number(duration))) : input.durationMinutes,
  };
}

function createStep(exerciseId: ExerciseId, intensity: CustomPlanIntensity): WorkoutStep {
  const mode = EXERCISE_PROFILES[exerciseId].mode;
  const settings = intensity === "light"
    ? { sets: 2, reps: 10, seconds: 20, rest: 60 }
    : intensity === "high"
      ? { sets: 4, reps: 16, seconds: 40, rest: 75 }
      : { sets: 3, reps: 12, seconds: 30, rest: 65 };
  return {
    exerciseId,
    sets: settings.sets,
    target: mode === "timed-hold"
      ? { kind: "seconds", value: settings.seconds }
      : { kind: "repetitions", value: settings.reps },
    restSeconds: settings.rest,
    note: mode === "alternating" ? `左右交替，共 ${settings.reps} 次` : undefined,
  };
}

export function generateCustomWorkoutPlan(rawRequest: CustomPlanRequest, now = new Date()): WorkoutPlan {
  const request = inferRequest(rawRequest);
  const excluded = new Set(request.excludedExerciseIds ?? []);
  let pool = GOAL_POOLS[request.goal]
    .filter((id) => !excluded.has(id) && isAvailable(id) && equipmentMatches(id, request.equipment));
  if (request.equipment === "dumbbell") {
    const dumbbells = GOAL_POOLS.strength.filter((id) => EXERCISE_PROFILES[id].discipline === "dumbbell");
    pool = [...dumbbells, ...pool].filter((id, index, all) => all.indexOf(id) === index);
  }
  if (pool.length < 3) {
    pool = Object.keys(EXERCISE_PROFILES)
      .filter((id): id is ExerciseId => isAvailable(id as ExerciseId) && equipmentMatches(id as ExerciseId, request.equipment))
      .filter((id) => !excluded.has(id));
  }
  const movementCount = request.durationMinutes <= 18 ? 4 : request.durationMinutes <= 32 ? 5 : 6;
  const selected = pool.slice(0, movementCount);
  const intensity = INTENSITY_LABEL[request.intensity];
  const safeTimestamp = now.toISOString().replace(/\D/g, "").slice(0, 14);
  return {
    id: `custom-${safeTimestamp}`,
    name: `${GOAL_LABEL[request.goal]} · ${request.durationMinutes} 分钟`,
    description: request.prompt.trim()
      ? `按你的要求生成：${request.prompt.trim().slice(0, 56)}`
      : "根据目标、可用时间和器械生成的本机计划。",
    goal: GOAL_LABEL[request.goal],
    level: request.intensity === "light" ? "入门" : request.intensity === "high" ? "进阶" : "基础",
    intensity,
    audience: "按当前输入生成；开始前可查看每个动作和休息安排",
    evidenceBasis: "本地规则按大肌群、动作模式、强度与恢复时间进行组合。",
    equipment: request.equipment === "dumbbell" ? "一只或一对哑铃" : "无需器械",
    durationMinutes: request.durationMinutes,
    warmupSeconds: request.intensity === "high" ? 300 : 180,
    cooldownSeconds: request.intensity === "high" ? 300 : 180,
    transitionSeconds: request.intensity === "high" ? 80 : request.intensity === "light" ? 45 : 60,
    steps: selected.map((id) => createStep(id, request.intensity)),
    accent: request.goal === "fat-loss" ? "coral" : request.goal === "mobility" ? "teal" : "ink",
  };
}

function normalizeSavedPlan(value: unknown): SavedCustomPlan | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<SavedCustomPlan>;
  if (!input.plan || !input.request || typeof input.savedAt !== "string" || Number.isNaN(Date.parse(input.savedAt))) return null;
  if (!Array.isArray(input.plan.steps) || !input.plan.steps.length || !input.plan.steps.every((step) => isAvailable(step.exerciseId))) return null;
  return { schemaVersion: 1, savedAt: input.savedAt, pinned: input.pinned === true, plan: input.plan, request: input.request };
}

export class CustomPlanStore {
  constructor(private readonly storage: PlanStorage, private readonly key = SAVED_PLAN_KEY) {}

  load(): SavedCustomPlan[] {
    try {
      const parsed = JSON.parse(this.storage.getItem(this.key) ?? "[]") as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeSavedPlan).filter((item): item is SavedCustomPlan => item !== null)
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.savedAt) - Date.parse(a.savedAt));
    } catch {
      return [];
    }
  }

  save(plan: WorkoutPlan, request: CustomPlanRequest, pinned = true): SavedCustomPlan[] {
    const item: SavedCustomPlan = { schemaVersion: 1, savedAt: new Date().toISOString(), pinned, plan, request };
    const items = [item, ...this.load().filter((saved) => saved.plan.id !== plan.id)];
    this.persist(items);
    return items;
  }

  remove(id: string): SavedCustomPlan[] {
    const items = this.load().filter((item) => item.plan.id !== id);
    this.persist(items);
    return items;
  }

  has(id: string): boolean {
    return this.load().some((item) => item.plan.id === id);
  }

  private persist(items: SavedCustomPlan[]): void {
    try { this.storage.setItem(this.key, JSON.stringify(items)); } catch { /* Local storage can be unavailable. */ }
  }
}

export class CustomPlanDraftStore {
  constructor(private readonly storage: PlanStorage, private readonly key = PLAN_DRAFT_KEY) {}

  load(now = new Date()): CustomPlanDraft | null {
    try {
      const parsed = JSON.parse(this.storage.getItem(this.key) ?? "null") as Partial<CustomPlanDraft> | null;
      if (!parsed || parsed.schemaVersion !== 1 || !parsed.plan || !parsed.request) return null;
      if (typeof parsed.expiresAt !== "string" || Date.parse(parsed.expiresAt) <= now.getTime()) {
        this.clear();
        return null;
      }
      return parsed as CustomPlanDraft;
    } catch {
      return null;
    }
  }

  save(plan: WorkoutPlan, request: CustomPlanRequest, now = new Date()): CustomPlanDraft {
    const draft: CustomPlanDraft = {
      schemaVersion: 1,
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      plan,
      request,
    };
    this.storage.setItem(this.key, JSON.stringify(draft));
    return draft;
  }

  clear(): void {
    this.storage.setItem(this.key, "null");
  }
}
