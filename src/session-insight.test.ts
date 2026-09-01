import { describe, expect, it } from "vitest";
import { buildLocalSessionInsight, SafeSessionInsightProvider, type SessionInsightProvider } from "./session-insight";
import type { SessionSummary } from "./types";

function summary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "session-1",
    endedAt: new Date(0).toISOString(),
    exerciseId: "squat",
    totalReps: 0,
    qualifiedReps: 0,
    averageTempoSeconds: null,
    issueCounts: { depth: 0, lean: 0, knees: 0, speed: 0 },
    activeDurationMs: 0,
    ...overrides,
  };
}

describe("session insight", () => {
  it("never praises an empty session", () => {
    expect(buildLocalSessionInsight(summary())).toMatchObject({
      state: "empty",
      title: "本次未形成有效训练记录",
      evidence: "完整动作 0 次",
    });
  });

  it("uses a factual low-quality summary", () => {
    expect(buildLocalSessionInsight(summary({
      totalReps: 5,
      qualifiedReps: 1,
      issueCounts: { depth: 4, speed: 3 },
    }))).toMatchObject({
      state: "needs-work",
      title: "本组 1 / 5 次合格",
      evidence: "5 次完成 · 1 次合格 · 20%",
      primaryIssue: "depth",
    });
  });

  it("only gives a strong state when the measured pass rate supports it", () => {
    expect(buildLocalSessionInsight(summary({ totalReps: 10, qualifiedReps: 8 }))).toMatchObject({
      state: "strong",
      title: "本组 8 / 10 次合格",
      evidence: "10 次完成 · 8 次合格 · 80%",
    });
  });

  it("falls back when a future AI provider fails", async () => {
    const failing: SessionInsightProvider = { getInsight: async () => { throw new Error("offline"); } };
    const provider = new SafeSessionInsightProvider(failing);
    await expect(provider.getInsight(summary())).resolves.toMatchObject({ source: "local-rules", state: "empty" });
  });
});
