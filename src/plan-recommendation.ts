import type { BodyProfile } from "./body/profile";
import type { CapacityRecord } from "./capacity";
import { calculateBmi } from "./body/metrics";
import type { SessionSummary } from "./types";
import type { WorkoutPlan } from "./plans";

export type PlanGoal = "general" | "fat-loss" | "strength" | "core" | "mobility";
export type PlanEquipmentPreference = "none" | "dumbbell";

export interface PlanRecommendationContext {
  profile: BodyProfile;
  capacityRecords: CapacityRecord[];
  sessions: SessionSummary[];
  goal: PlanGoal;
  availableMinutes: number;
  equipment: PlanEquipmentPreference;
  now?: Date;
}

export interface RecommendedPlan {
  plan: WorkoutPlan;
  score: number;
  reasons: string[];
  caution: string | null;
}

const GOAL_TERMS: Record<PlanGoal, string[]> = {
  general: ["全身", "均衡", "恢复"],
  "fat-loss": ["心肺", "有氧", "代谢", "全身"],
  strength: ["力量", "臀腿", "哑铃"],
  core: ["核心", "稳定"],
  mobility: ["活动", "恢复", "平衡"],
};

function recentSessions(sessions: SessionSummary[], now: Date): SessionSummary[] {
  const cutoff = now.getTime() - 28 * 24 * 60 * 60 * 1_000;
  return sessions.filter((session) => Date.parse(session.endedAt) >= cutoff);
}

function preferredIntensity(context: PlanRecommendationContext): "轻" | "中" | "高" {
  const recent = recentSessions(context.sessions, context.now ?? new Date());
  const qualities = context.capacityRecords
    .map((record) => record.qualityPercent)
    .filter((value): value is number => value !== null)
    .slice(0, 6);
  const averageQuality = qualities.length
    ? qualities.reduce((sum, value) => sum + value, 0) / qualities.length
    : null;
  const bmi = calculateBmi(context.profile.weightKg, context.profile.heightCm);

  if (
    recent.length < 2
    || context.profile.activityLevel === "sedentary"
    || (averageQuality !== null && averageQuality < 75)
    || (bmi !== null && bmi >= 30)
  ) return "轻";

  if (
    recent.length >= 8
    && (context.profile.activityLevel === "very" || context.profile.activityLevel === "extra")
    && (averageQuality === null || averageQuality >= 85)
  ) return "高";

  return "中";
}

function equipmentMatches(plan: WorkoutPlan, equipment: PlanEquipmentPreference): boolean {
  if (equipment === "dumbbell") return true;
  return plan.equipment === "无需器械";
}

function planText(plan: WorkoutPlan): string {
  return [plan.name, plan.goal, plan.description].join(" ");
}

export function recommendWorkoutPlans(
  plans: WorkoutPlan[],
  context: PlanRecommendationContext,
): RecommendedPlan[] {
  const desiredIntensity = preferredIntensity(context);
  const terms = GOAL_TERMS[context.goal];
  const results = plans
    .filter((plan) => plan.intensity && plan.durationMinutes <= context.availableMinutes)
    .map((plan): RecommendedPlan => {
      let score = 50;
      const reasons: string[] = [];
      if (plan.intensity === desiredIntensity) {
        score += 24;
        reasons.push(`当前记录更适合${desiredIntensity}强度`);
      } else if (
        (desiredIntensity === "轻" && plan.intensity === "中")
        || (desiredIntensity === "中" && plan.intensity !== "中")
      ) {
        score -= 8;
      } else {
        score -= 22;
      }

      if (plan.durationMinutes <= context.availableMinutes) {
        score += 18;
        reasons.push(`${plan.durationMinutes} 分钟可放进你的可用时间`);
      } else {
        score -= Math.min(35, plan.durationMinutes - context.availableMinutes);
      }

      if (equipmentMatches(plan, context.equipment)) {
        score += 12;
        reasons.push(context.equipment === "none" ? "无需额外器械" : "符合当前器械选择");
      } else {
        score -= 100;
      }

      const matches = terms.filter((term) => planText(plan).includes(term));
      if (matches.length) {
        score += matches.length * 8;
        reasons.push(`匹配“${matches[0]}”目标`);
      }

      const caution = desiredIntensity === "轻" && plan.intensity !== "轻"
        ? "建议先完成轻强度计划并观察动作质量，再提高强度。"
        : null;
      return { plan, score, reasons: reasons.slice(0, 3), caution };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.plan.durationMinutes - b.plan.durationMinutes);

  return results;
}
