import type { ExerciseId } from "./types";
import { SCIENTIFIC_WORKOUT_PLANS } from "./scientific-plans";

export type WorkoutPlanId =
  | "starter"
  | "balanced"
  | "lower-body"
  | "core-stability"
  | "low-impact"
  | "quick-cardio"
  | "dumbbell-foundation"
  | "dumbbell-shoulders-arms"
  | "light-recovery-flow"
  | "light-lower-mobility"
  | "light-core-reset"
  | "light-cardio-primer"
  | "moderate-balanced-30"
  | "moderate-lower-control"
  | "moderate-dumbbell-full"
  | "moderate-core-cardio"
  | "high-hiit"
  | "high-dumbbell-complex"
  | "high-bodyweight-power"
  | "high-core-endurance"
  | `custom-${string}`;

export type WorkoutTarget =
  | { kind: "repetitions"; value: number }
  | { kind: "seconds"; value: number };

export interface WorkoutStep {
  exerciseId: ExerciseId;
  sets: number;
  target: WorkoutTarget;
  restSeconds: number;
  note?: string;
}

export interface WorkoutPlan {
  id: WorkoutPlanId;
  name: string;
  description: string;
  goal: string;
  level: "入门" | "基础" | "进阶";
  equipment: "无需器械" | "一只或一对哑铃";
  durationMinutes: number;
  intensity?: "轻" | "中" | "高";
  audience?: string;
  evidenceBasis?: string;
  transitionSeconds?: number;
  warmupSeconds: number;
  cooldownSeconds: number;
  steps: WorkoutStep[];
  accent: "ink" | "teal" | "coral";
}

const reps = (value: number): WorkoutTarget => ({ kind: "repetitions", value });
const seconds = (value: number): WorkoutTarget => ({ kind: "seconds", value });

const LEGACY_WORKOUT_PLANS: WorkoutPlan[] = [
  {
    id: "starter",
    name: "新手轻松起步",
    description: "用常见基础动作建立完整训练节奏",
    goal: "动作熟悉 · 全身唤醒",
    level: "入门",
    equipment: "无需器械",
    durationMinutes: 18,
    warmupSeconds: 120,
    cooldownSeconds: 120,
    accent: "teal",
    steps: [
      { exerciseId: "squat", sets: 2, target: reps(10), restSeconds: 60 },
      { exerciseId: "knee-push-up", sets: 2, target: reps(8), restSeconds: 60 },
      { exerciseId: "glute-bridge", sets: 2, target: reps(12), restSeconds: 45 },
      { exerciseId: "bird-dog", sets: 2, target: reps(16), restSeconds: 45, note: "左右交替，共 16 次" },
    ],
  },
  {
    id: "balanced",
    name: "全身均衡训练",
    description: "下肢、上肢、核心和心肺都有安排",
    goal: "全身力量 · 协调心肺",
    level: "基础",
    equipment: "无需器械",
    durationMinutes: 28,
    warmupSeconds: 120,
    cooldownSeconds: 120,
    accent: "ink",
    steps: [
      { exerciseId: "squat", sets: 3, target: reps(12), restSeconds: 75 },
      { exerciseId: "push-up", sets: 3, target: reps(8), restSeconds: 90 },
      { exerciseId: "reverse-lunge", sets: 3, target: reps(16), restSeconds: 75, note: "左右交替，共 16 次" },
      { exerciseId: "shoulder-tap", sets: 3, target: reps(16), restSeconds: 60, note: "左右交替，共 16 次" },
      { exerciseId: "jumping-jack", sets: 3, target: reps(20), restSeconds: 45 },
    ],
  },
  {
    id: "lower-body",
    name: "臀腿强化",
    description: "从双腿稳定到单腿控制，完整覆盖臀腿",
    goal: "臀腿力量 · 下肢稳定",
    level: "基础",
    equipment: "无需器械",
    durationMinutes: 30,
    warmupSeconds: 120,
    cooldownSeconds: 120,
    accent: "coral",
    steps: [
      { exerciseId: "squat", sets: 4, target: reps(10), restSeconds: 90 },
      { exerciseId: "reverse-lunge", sets: 3, target: reps(16), restSeconds: 75, note: "左右交替，共 16 次" },
      { exerciseId: "glute-bridge", sets: 3, target: reps(15), restSeconds: 60 },
      { exerciseId: "calf-raise", sets: 3, target: reps(18), restSeconds: 45 },
      { exerciseId: "single-leg-deadlift", sets: 3, target: reps(12), restSeconds: 60, note: "左右交替，共 12 次" },
    ],
  },
  {
    id: "core-stability",
    name: "核心稳定",
    description: "抗伸展、抗旋转和身体控制循序推进",
    goal: "核心控制 · 躯干稳定",
    level: "基础",
    equipment: "无需器械",
    durationMinutes: 22,
    warmupSeconds: 120,
    cooldownSeconds: 120,
    accent: "teal",
    steps: [
      { exerciseId: "dead-bug", sets: 3, target: reps(16), restSeconds: 45, note: "左右交替，共 16 次" },
      { exerciseId: "bird-dog", sets: 3, target: reps(16), restSeconds: 45, note: "左右交替，共 16 次" },
      { exerciseId: "plank", sets: 3, target: seconds(30), restSeconds: 60 },
      { exerciseId: "shoulder-tap", sets: 3, target: reps(20), restSeconds: 60, note: "左右交替，共 20 次" },
      { exerciseId: "side-plank", sets: 4, target: seconds(20), restSeconds: 45, note: "左右交替，每侧 2 组" },
    ],
  },
  {
    id: "low-impact",
    name: "低冲击活动",
    description: "不跳跃，兼顾腿部耐力和身体舒展",
    goal: "低冲击 · 活动恢复",
    level: "入门",
    equipment: "无需器械",
    durationMinutes: 20,
    warmupSeconds: 120,
    cooldownSeconds: 120,
    accent: "ink",
    steps: [
      { exerciseId: "chair-pose", sets: 2, target: seconds(30), restSeconds: 45 },
      { exerciseId: "sumo-squat", sets: 3, target: reps(12), restSeconds: 60 },
      { exerciseId: "calf-raise", sets: 3, target: reps(15), restSeconds: 45 },
      { exerciseId: "glute-bridge", sets: 3, target: reps(15), restSeconds: 45 },
      { exerciseId: "downward-dog", sets: 2, target: seconds(30), restSeconds: 30 },
    ],
  },
  {
    id: "quick-cardio",
    name: "快速心肺",
    description: "短组、短休息，让节奏保持连贯",
    goal: "心肺耐力 · 全身协调",
    level: "进阶",
    equipment: "无需器械",
    durationMinutes: 16,
    warmupSeconds: 120,
    cooldownSeconds: 120,
    accent: "coral",
    steps: [
      { exerciseId: "jumping-jack", sets: 3, target: reps(25), restSeconds: 30 },
      { exerciseId: "high-knees", sets: 3, target: reps(30), restSeconds: 30, note: "左右交替，共 30 次" },
      { exerciseId: "mountain-climber", sets: 3, target: reps(20), restSeconds: 45, note: "左右交替，共 20 次" },
      { exerciseId: "burpee", sets: 2, target: reps(6), restSeconds: 60 },
    ],
  },
  {
    id: "dumbbell-foundation",
    name: "哑铃全身基础",
    description: "用四个复合与基础动作练遍全身",
    goal: "哑铃力量 · 全身基础",
    level: "基础",
    equipment: "一只或一对哑铃",
    durationMinutes: 25,
    warmupSeconds: 120,
    cooldownSeconds: 120,
    accent: "ink",
    steps: [
      { exerciseId: "goblet-squat", sets: 3, target: reps(10), restSeconds: 90 },
      { exerciseId: "dumbbell-rdl", sets: 3, target: reps(10), restSeconds: 90 },
      { exerciseId: "dumbbell-shoulder-press", sets: 3, target: reps(8), restSeconds: 90 },
      { exerciseId: "dumbbell-biceps-curl", sets: 2, target: reps(12), restSeconds: 60 },
    ],
  },
  {
    id: "dumbbell-shoulders-arms",
    name: "哑铃肩臂强化",
    description: "肩部推举、侧举与手臂弯举组合",
    goal: "肩臂力量 · 上肢控制",
    level: "基础",
    equipment: "一只或一对哑铃",
    durationMinutes: 22,
    warmupSeconds: 120,
    cooldownSeconds: 120,
    accent: "coral",
    steps: [
      { exerciseId: "dumbbell-shoulder-press", sets: 3, target: reps(10), restSeconds: 90 },
      { exerciseId: "dumbbell-lateral-raise", sets: 3, target: reps(12), restSeconds: 60 },
      { exerciseId: "dumbbell-biceps-curl", sets: 3, target: reps(12), restSeconds: 60 },
      { exerciseId: "goblet-squat", sets: 2, target: reps(12), restSeconds: 75 },
    ],
  },
];

export const WORKOUT_PLANS: WorkoutPlan[] = [
  ...LEGACY_WORKOUT_PLANS,
  ...SCIENTIFIC_WORKOUT_PLANS,
];

export function findWorkoutPlan(id: string | undefined): WorkoutPlan | undefined {
  return WORKOUT_PLANS.find((plan) => plan.id === id);
}

export function workoutPlanExercises(plan: WorkoutPlan): ExerciseId[] {
  return plan.steps.map((step) => step.exerciseId);
}

export function workoutPlanTotalSets(plan: WorkoutPlan): number {
  return plan.steps.reduce((total, step) => total + step.sets, 0);
}

export function formatWorkoutTarget(target: WorkoutTarget): string {
  return target.kind === "seconds" ? `${target.value} 秒` : `${target.value} 次`;
}
