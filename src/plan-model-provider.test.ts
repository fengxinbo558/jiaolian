import { describe, expect, it, vi } from "vitest";
import { SafePlanModelProvider, type PlanModelProvider } from "./plan-model-provider";
import type { CustomPlanRequest } from "./custom-plans";

const request: CustomPlanRequest = { prompt: "核心", goal: "core", intensity: "light", equipment: "none", durationMinutes: 18 };

describe("safe plan model provider", () => {
  it("falls back to the local planner when the future model endpoint is unavailable", async () => {
    const remote: PlanModelProvider = { generate: vi.fn().mockRejectedValue(new Error("offline")) };
    const plan = await new SafePlanModelProvider(remote).generate(request);
    expect(remote.generate).toHaveBeenCalledOnce();
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.goal).toContain("核心");
  });
});
