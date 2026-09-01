import { describe, expect, it } from "vitest";
import { responseGrade, summarizeLatency } from "./latency";

describe("coach response latency", () => {
  it("returns no summary when there are no valid measurements", () => {
    expect(summarizeLatency([])).toBeNull();
    expect(summarizeLatency([Number.NaN, -1, 5_000])).toBeNull();
  });

  it("reports the average and nearest-rank P95", () => {
    const summary = summarizeLatency([90, 100, 110, 120, 200]);
    expect(summary).toMatchObject({ averageMs: 124, p95Ms: 200 });
  });

  it("turns milliseconds into user-facing response states", () => {
    expect(responseGrade(180)).toEqual({ label: "流畅", state: "good" });
    expect(responseGrade(181)).toEqual({ label: "正常", state: "normal" });
    expect(responseGrade(300)).toEqual({ label: "正常", state: "normal" });
    expect(responseGrade(301)).toEqual({ label: "偏慢", state: "slow" });
  });
});
