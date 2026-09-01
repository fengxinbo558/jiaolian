import { describe, expect, it } from "vitest";
import { ISSUE_COACHING, buildRepAdvice, buildSessionAdvice } from "./coaching";
import type { CompletedRep, ExerciseId, IssueKey, SessionSummary } from "./types";

function completedRep(
  issues: IssueKey[] = [],
  repNumber = 1,
  exerciseId: ExerciseId = "squat",
): CompletedRep {
  return {
    repNumber,
    durationMs: 2_400,
    descentMs: 1_100,
    qualified: issues.length === 0,
    issues,
    exerciseId,
  };
}

function session(
  overrides: Partial<SessionSummary> = {},
): SessionSummary {
  return {
    id: "session-1",
    endedAt: "2026-08-12T00:00:00.000Z",
    exerciseId: "squat",
    totalReps: 4,
    qualifiedReps: 2,
    averageTempoSeconds: 2.4,
    issueCounts: { depth: 1, lean: 1, knees: 0, speed: 0 },
    ...overrides,
  };
}

describe("buildRepAdvice", () => {
  it("returns a clear positive evaluation for a qualified rep", () => {
    expect(buildRepAdvice(completedRep([], 3))).toEqual({
      status: "qualified",
      title: "第 3 次 · 合格",
      message: "深度和节奏都不错，下一次继续保持",
      primaryIssue: null,
      secondaryLabels: [],
      speech: "第 3 次，合格",
    });
  });

  it("uses jumping-jack language for a qualified jumping jack", () => {
    expect(buildRepAdvice(completedRep([], 4, "jumping-jack"))).toMatchObject({
      title: "第 4 次 · 合格",
      message: "手脚同步、幅度到位，下一次继续保持",
      speech: "第 4 次，合格",
    });
  });

  it.each([
    ["knees", "膝盖内扣", "下次让膝盖跟着脚尖方向移动"],
    ["lean", "身体前倾", "下次抬起胸口，保持背部稳定"],
    ["depth", "深度不足", "下次让髋部再低一点，接近膝盖高度"],
    ["speed", "下蹲偏快", "下次慢一点，控制下蹲"],
  ] as const)("returns actionable advice for %s", (issue, label, message) => {
    const advice = buildRepAdvice(completedRep([issue], 2));

    expect(advice).toMatchObject({
      status: "adjust",
      title: `第 2 次 · ${label}`,
      message,
      primaryIssue: issue,
      secondaryLabels: [],
    });
    expect(advice.speech).toContain("下次");
    expect(advice.speech.length).toBeLessThan(30);
  });

  it("uses the supported safety priority and preserves other issues", () => {
    const advice = buildRepAdvice(
      completedRep(["speed", "depth", "lean"], 5),
    );

    expect(advice.primaryIssue).toBe("lean");
    expect(advice.title).toBe("第 5 次 · 身体前倾");
    expect(advice.secondaryLabels).toEqual(["深度不足", "下蹲偏快"]);
  });

  it("does not repeat duplicate issues", () => {
    const advice = buildRepAdvice(
      completedRep(["speed", "lean", "speed", "lean"]),
    );

    expect(advice.primaryIssue).toBe("lean");
    expect(advice.secondaryLabels).toEqual(["下蹲偏快"]);
  });
});

describe("buildSessionAdvice", () => {
  it("explains how to finish a complete rep when no rep was counted", () => {
    expect(
      buildSessionAdvice(
        session({
          totalReps: 0,
          qualifiedReps: 0,
          averageTempoSeconds: null,
          issueCounts: { depth: 0, lean: 0, knees: 0, speed: 0 },
        }),
      ),
    ).toEqual({
      title: "先完成一次完整动作",
      message: "先站直校准，再下蹲并重新站直，系统才会评价这一动作",
      primaryIssue: null,
      issueSummary: [],
    });
  });

  it("encourages the same depth and tempo when every rep qualified", () => {
    expect(
      buildSessionAdvice(
        session({
          totalReps: 4,
          qualifiedReps: 4,
          issueCounts: { depth: 0, lean: 0, knees: 0, speed: 0 },
        }),
      ),
    ).toEqual({
      title: "保持现在的深度和节奏",
      message: "本组动作全部合格，下一组继续稳定完成每一次",
      primaryIssue: null,
      issueSummary: [],
    });
  });

  it("uses jumping-jack setup and completion language in summaries", () => {
    expect(
      buildSessionAdvice(
        session({
          exerciseId: "jumping-jack",
          totalReps: 0,
          qualifiedReps: 0,
          averageTempoSeconds: null,
          issueCounts: { arms: 0, feet: 0, sync: 0, symmetry: 0 },
        }),
      ).message,
    ).toContain("完整张开并重新收回");

    expect(
      buildSessionAdvice(
        session({
          exerciseId: "jumping-jack",
          totalReps: 4,
          qualifiedReps: 4,
          issueCounts: { arms: 0, feet: 0, sync: 0, symmetry: 0 },
        }),
      ),
    ).toMatchObject({
      title: "保持现在的幅度和同步",
      message: "本组动作全部合格，下一组继续让手脚同时张开、同时收回",
    });
  });

  it("focuses on the most frequent issue and includes every issue count", () => {
    const advice = buildSessionAdvice(
      session({
        totalReps: 6,
        qualifiedReps: 1,
        issueCounts: { depth: 4, lean: 2, knees: 0, speed: 3 },
      }),
    );

    expect(advice).toEqual({
      title: "让髋部再低一点",
      message: "接近膝盖高度后再起身，下降时保持稳定",
      primaryIssue: "depth",
      issueSummary: ["深度不足 4 次", "下蹲偏快 3 次", "身体前倾 2 次"],
    });
  });

  it("uses the configured issue order as the tie-breaking priority", () => {
    const advice = buildSessionAdvice(
      session({
        totalReps: 3,
        qualifiedReps: 0,
        issueCounts: { depth: 2, lean: 2, knees: 0, speed: 2 },
      }),
    );

    expect(advice.primaryIssue).toBe("lean");
    expect(advice.issueSummary).toEqual([
      "身体前倾 2 次",
      "深度不足 2 次",
      "下蹲偏快 2 次",
    ]);
  });

  it("exposes stable copy for all supported issues", () => {
    expect(Object.keys(ISSUE_COACHING)).toEqual([
      "knees",
      "lean",
      "depth",
      "speed",
      "arms",
      "feet",
      "sync",
      "symmetry",
      "body-line",
      "alignment",
      "range",
      "stability",
      "rhythm",
    ]);
    expect(ISSUE_COACHING.lean.label).toBe("身体前倾");
    expect(ISSUE_COACHING.lean.sessionTitle).toBe("抬起胸口");
    expect(ISSUE_COACHING.depth.sessionTitle).toContain("髋部");
    expect(ISSUE_COACHING.speed.sessionAdvice).toContain("控制");
  });

  it("explains timed plank sessions without squat-specific copy", () => {
    expect(buildSessionAdvice({
      id: "plank",
      endedAt: "2026-08-20T00:00:00Z",
      exerciseId: "plank",
      totalReps: 12,
      qualifiedReps: 12,
      averageTempoSeconds: null,
      measurementMode: "timed-hold",
      validDurationMs: 12_400,
      issueCounts: {},
    })).toMatchObject({
      title: "保持现在的身体直线",
      message: expect.stringContaining("12.4 秒"),
    });
  });

  it("uses generic completion guidance for expanded repetitions", () => {
    expect(buildSessionAdvice({
      id: "push-up",
      endedAt: "2026-08-20T00:00:00Z",
      exerciseId: "push-up",
      totalReps: 6,
      qualifiedReps: 6,
      averageTempoSeconds: 1.2,
      issueCounts: {},
    }).title).toBe("保持现在的动作幅度和稳定性");
  });

  it("does not claim every rep qualified when issue details are unavailable", () => {
    expect(buildSessionAdvice({
      id: "push-up-partial",
      endedAt: "2026-08-20T00:00:00Z",
      exerciseId: "push-up",
      totalReps: 10,
      qualifiedReps: 8,
      averageTempoSeconds: 1.2,
      issueCounts: {},
    })).toEqual({
      title: "先提高完整动作通过率",
      message: "本组合格率 80%，下一组放慢一点，完整回到起始姿势后再开始下一次",
      primaryIssue: null,
      issueSummary: ["未通过完整标准 2 次"],
    });
  });
});
