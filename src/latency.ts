export type ResponseState = "good" | "normal" | "slow";

export interface LatencySummary {
  averageMs: number;
  p95Ms: number;
  label: "流畅" | "正常" | "偏慢";
  state: ResponseState;
}

export function responseGrade(p95Ms: number): Pick<LatencySummary, "label" | "state"> {
  if (p95Ms <= 180) return { label: "流畅", state: "good" };
  if (p95Ms <= 300) return { label: "正常", state: "normal" };
  return { label: "偏慢", state: "slow" };
}

export function summarizeLatency(samples: number[]): LatencySummary | null {
  const valid = samples.filter(
    (sample) => Number.isFinite(sample) && sample >= 0 && sample < 5_000,
  );
  if (valid.length === 0) return null;

  const ordered = [...valid].sort((first, second) => first - second);
  const p95Index = Math.max(0, Math.ceil(ordered.length * 0.95) - 1);
  const p95Ms = ordered[p95Index] ?? ordered[ordered.length - 1]!;
  const averageMs = valid.reduce((sum, sample) => sum + sample, 0) / valid.length;
  return { averageMs, p95Ms, ...responseGrade(p95Ms) };
}
