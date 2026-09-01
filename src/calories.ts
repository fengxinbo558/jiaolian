import type { ExerciseId } from "./types";
import { ALL_EXERCISE_IDS } from "./exercise-ids";
import { EXERCISE_PROFILES } from "./exercises";

export interface CalorieEstimateInput {
  exerciseId: ExerciseId;
  weightKg: number;
  activeDurationMs: number;
}

const LEGACY_EXERCISE_MET = {
  squat: 5,
  "jumping-jack": 7.5,
  "reverse-lunge": 5,
  "calf-raise": 3.5,
  "high-knees": 8,
  "push-up": 6,
  plank: 3.5,
  "side-lunge": 5,
  "glute-bridge": 4,
  "knee-push-up": 4.5,
  "bird-dog": 3.5,
  "mountain-climber": 8,
  "single-leg-deadlift": 4,
  "shoulder-tap": 5,
  "side-plank": 3.5,
  "dead-bug": 3.5,
  burpee: 11,
  "mountain-pose": 2.5,
  "chair-pose": 3,
  "warrior-two": 3,
  "tree-pose": 2.5,
  "downward-dog": 3,
  "sumo-squat": 5,
  "bulgarian-split-squat": 5.5,
  "curtsy-lunge": 5,
  "jump-squat": 8,
  "skater-jump": 8,
  "pike-push-up": 6,
  "narrow-push-up": 6,
  superman: 3.5,
  "bicycle-crunch": 5,
  "leg-raise": 4,
  "goblet-squat": 6,
  "dumbbell-rdl": 6,
  "dumbbell-reverse-lunge": 6,
  "dumbbell-sumo-squat": 6,
  "dumbbell-split-squat": 6,
  "dumbbell-glute-bridge": 5,
  "dumbbell-shoulder-press": 5,
  "arnold-press": 5,
  "dumbbell-lateral-raise": 4,
  "dumbbell-front-raise": 4,
  "dumbbell-bent-over-row": 5.5,
  "single-arm-dumbbell-row": 5.5,
  "dumbbell-reverse-fly": 5,
  "dumbbell-biceps-curl": 4,
  "hammer-curl": 4,
  "overhead-triceps-extension": 4,
  "dumbbell-kickback": 4,
  "dumbbell-floor-press": 5,
  "dumbbell-floor-fly": 5,
  "dumbbell-thruster": 8,
} satisfies Partial<Record<ExerciseId, number>>;

export const EXERCISE_MET = Object.fromEntries(
  ALL_EXERCISE_IDS.map((exerciseId) => [
    exerciseId,
    LEGACY_EXERCISE_MET[exerciseId as keyof typeof LEGACY_EXERCISE_MET]
      ?? EXERCISE_PROFILES[exerciseId].met
      ?? 4,
  ]),
) as Record<ExerciseId, number>;

export function isValidWeightKg(weightKg: number): boolean {
  return Number.isFinite(weightKg) && weightKg >= 30 && weightKg <= 250;
}

export function estimateCalories({
  exerciseId,
  weightKg,
  activeDurationMs,
}: CalorieEstimateInput): number | null {
  if (!isValidWeightKg(weightKg) || !Number.isFinite(activeDurationMs) || activeDurationMs <= 0) {
    return null;
  }
  const activeMinutes = activeDurationMs / 60_000;
  return EXERCISE_MET[exerciseId] * 3.5 * weightKg / 200 * activeMinutes;
}

export function estimateCalorieRange(
  exerciseIds: ExerciseId[],
  weightKg: number,
  activeDurationMs: number,
): { low: number; high: number } | null {
  if (!exerciseIds.length || !isValidWeightKg(weightKg) || activeDurationMs <= 0) {
    return null;
  }
  const mets = exerciseIds.map((id) => EXERCISE_MET[id]);
  const averageMet = mets.reduce((sum, met) => sum + met, 0) / mets.length;
  const activeMinutes = activeDurationMs / 60_000;
  const center = averageMet * 3.5 * weightKg / 200 * activeMinutes;
  return { low: center * 0.85, high: center * 1.15 };
}

export function formatCalories(kcal: number | null): string {
  if (kcal === null || !Number.isFinite(kcal)) return "—";
  return kcal < 10 ? kcal.toFixed(1) : String(Math.round(kcal));
}
