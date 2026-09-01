import { generateCustomWorkoutPlan, type CustomPlanRequest } from "./custom-plans";
import type { WorkoutPlan } from "./plans";

export interface PlanModelProvider {
  generate(request: CustomPlanRequest): Promise<WorkoutPlan>;
}

export class LocalRulePlanProvider implements PlanModelProvider {
  async generate(request: CustomPlanRequest): Promise<WorkoutPlan> {
    return generateCustomWorkoutPlan(request);
  }
}

export class ServerPlanModelProvider implements PlanModelProvider {
  constructor(private readonly endpoint = "/api/plan/generate") {}

  async generate(request: CustomPlanRequest): Promise<WorkoutPlan> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error("plan-model-unavailable");
    return response.json() as Promise<WorkoutPlan>;
  }
}

export class SafePlanModelProvider implements PlanModelProvider {
  constructor(
    private readonly remote: PlanModelProvider | null,
    private readonly fallback: PlanModelProvider = new LocalRulePlanProvider(),
  ) {}

  async generate(request: CustomPlanRequest): Promise<WorkoutPlan> {
    if (this.remote) {
      try { return await this.remote.generate(request); } catch { /* Fall through to local rules. */ }
    }
    return this.fallback.generate(request);
  }
}
