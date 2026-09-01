import { buildSessionAdvice } from "./coaching";
import type { IssueKey, SessionSummary } from "./types";

export type SessionInsightState = "empty" | "needs-work" | "developing" | "strong";
export type SessionInsightSource = "local-rules" | "ai";

export interface SessionInsight {
  state: SessionInsightState;
  title: string;
  message: string;
  nextStepTitle: string;
  nextStepMessage: string;
  primaryIssue: IssueKey | null;
  issueSummary: string[];
  evidence: string;
  source: SessionInsightSource;
}

export interface SessionInsightProvider {
  getInsight(summary: SessionSummary): Promise<SessionInsight>;
}

function validHoldSeconds(summary: SessionSummary): number {
  return Math.max(0, (summary.validDurationMs ?? 0) / 1_000);
}

export function buildLocalSessionInsight(summary: SessionSummary): SessionInsight {
  const next = buildSessionAdvice(summary);
  const holdSeconds = validHoldSeconds(summary);
  const isTimedHold = summary.measurementMode === "timed-hold";
  const hasEffectiveWork = isTimedHold ? holdSeconds > 0 : summary.totalReps > 0;

  if (!hasEffectiveWork) {
    return {
      state: "empty",
      title: "本次未形成有效训练记录",
      message: isTimedHold
        ? "系统没有累计到有效保持时间，因此这次不判定完成，也不会写入训练成绩。"
        : "系统没有识别到一次完整动作，因此这次不判定完成，也不会写入训练成绩。",
      nextStepTitle: next.title,
      nextStepMessage: next.message,
      primaryIssue: null,
      issueSummary: [],
      evidence: isTimedHold ? "有效保持 0 秒" : "完整动作 0 次",
      source: "local-rules",
    };
  }

  if (isTimedHold) {
    return {
      state: holdSeconds >= 20 ? "strong" : "developing",
      title: `本次有效保持 ${holdSeconds.toFixed(1)} 秒`,
      message: "这是系统实际累计的姿势达标时间；下一组继续以身体稳定和自然呼吸为准。",
      nextStepTitle: next.title,
      nextStepMessage: next.message,
      primaryIssue: next.primaryIssue,
      issueSummary: next.issueSummary,
      evidence: `有效保持 ${holdSeconds.toFixed(1)} 秒`,
      source: "local-rules",
    };
  }

  const qualityRate = summary.totalReps === 0 ? 0 : summary.qualifiedReps / summary.totalReps;
  const percent = Math.round(qualityRate * 100);
  if (qualityRate < 0.4) {
    return {
      state: "needs-work",
      title: `本组 ${summary.qualifiedReps} / ${summary.totalReps} 次合格`,
      message: `合格率 ${percent}%。这组暂时不适合用“完成得不错”评价，下一组先集中解决一个主要问题。`,
      nextStepTitle: next.title,
      nextStepMessage: next.message,
      primaryIssue: next.primaryIssue,
      issueSummary: next.issueSummary,
      evidence: `${summary.totalReps} 次完成 · ${summary.qualifiedReps} 次合格 · ${percent}%`,
      source: "local-rules",
    };
  }
  if (qualityRate < 0.8) {
    return {
      state: "developing",
      title: `完成 ${summary.totalReps} 次，其中 ${summary.qualifiedReps} 次合格`,
      message: `合格率 ${percent}%。已经形成有效训练记录，但动作稳定性仍有提升空间。`,
      nextStepTitle: next.title,
      nextStepMessage: next.message,
      primaryIssue: next.primaryIssue,
      issueSummary: next.issueSummary,
      evidence: `${summary.totalReps} 次完成 · ${summary.qualifiedReps} 次合格 · ${percent}%`,
      source: "local-rules",
    };
  }
  return {
    state: "strong",
    title: `本组 ${summary.qualifiedReps} / ${summary.totalReps} 次合格`,
    message: `合格率 ${percent}%，正面评价来自本次真实识别结果。${next.primaryIssue ? "下一组仍优先处理最常见问题。" : "下一组继续保持当前幅度与控制。"}`,
    nextStepTitle: next.title,
    nextStepMessage: next.message,
    primaryIssue: next.primaryIssue,
    issueSummary: next.issueSummary,
    evidence: `${summary.totalReps} 次完成 · ${summary.qualifiedReps} 次合格 · ${percent}%`,
    source: "local-rules",
  };
}

function isValidInsight(value: unknown): value is SessionInsight {
  if (!value || typeof value !== "object") return false;
  const insight = value as Partial<SessionInsight>;
  return (
    ["empty", "needs-work", "developing", "strong"].includes(insight.state ?? "") &&
    typeof insight.title === "string" && insight.title.length > 0 &&
    typeof insight.message === "string" && insight.message.length > 0 &&
    typeof insight.nextStepTitle === "string" && insight.nextStepTitle.length > 0 &&
    typeof insight.nextStepMessage === "string" && insight.nextStepMessage.length > 0 &&
    Array.isArray(insight.issueSummary) &&
    (insight.source === "local-rules" || insight.source === "ai")
  );
}

export class LocalSessionInsightProvider implements SessionInsightProvider {
  async getInsight(summary: SessionSummary): Promise<SessionInsight> {
    return buildLocalSessionInsight(summary);
  }
}

export class SafeSessionInsightProvider implements SessionInsightProvider {
  constructor(
    private readonly primary: SessionInsightProvider | null,
    private readonly fallback: SessionInsightProvider = new LocalSessionInsightProvider(),
  ) {}

  async getInsight(summary: SessionSummary): Promise<SessionInsight> {
    if (this.primary) {
      try {
        const insight = await this.primary.getInsight(summary);
        if (isValidInsight(insight)) return insight;
      } catch {
        // A future model provider must never block the deterministic summary.
      }
    }
    return this.fallback.getInsight(summary);
  }
}
