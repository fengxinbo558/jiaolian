import { describe, expect, it } from "vitest";
import { JumpingJackAnalyzer } from "./jumping-jack-analyzer";
import type { DetectedPose, PoseLandmark } from "../types";

function mark(x: number, y: number, visibility = 0.99): PoseLandmark {
  return { x, y, z: 0, visibility };
}

function jackPose(arm: number, feet: number, asymmetry = 0): DetectedPose {
  const landmarks = Array.from({ length: 33 }, () => mark(0.5, 0.5, 0.2));
  landmarks[0] = mark(0.5, 0.16);
  landmarks[11] = mark(0.41, 0.34);
  landmarks[12] = mark(0.59, 0.34);
  landmarks[23] = mark(0.42, 0.62);
  landmarks[24] = mark(0.58, 0.62);
  const wristY = 0.63 - arm * 0.55;
  landmarks[15] = mark(0.33 - arm * 0.16, wristY);
  landmarks[16] = mark(0.67 + arm * 0.16, wristY + asymmetry * 0.15);
  landmarks[27] = mark(0.42 - feet * 0.22, 0.91);
  landmarks[28] = mark(0.58 + feet * 0.22, 0.91);
  return { landmarks, worldLandmarks: landmarks.map((item) => ({ ...item })), aspectRatio: 1 };
}

function calibrate(analyzer: JumpingJackAnalyzer): number {
  let time = 0;
  for (let index = 0; index < 9; index += 1) {
    analyzer.analyze(jackPose(0, 0), time);
    time += 100;
  }
  return time;
}

function perform(
  analyzer: JumpingJackAnalyzer,
  frames: Array<[number, number, number?]>,
  start: number,
  step = 80,
): void {
  frames.forEach(([arms, feet, asymmetry], index) => {
    analyzer.analyze(jackPose(arms, feet, asymmetry), start + index * step);
  });
}

describe("JumpingJackAnalyzer", () => {
  it("counts one closed-open-closed jumping jack", () => {
    const analyzer = new JumpingJackAnalyzer();
    const start = calibrate(analyzer);
    perform(analyzer, [[0.2, 0.2], [0.55, 0.55], [1, 1], [0.6, 0.6], [0.2, 0.2], [0, 0]], start);
    const summary = analyzer.getSummary();
    expect(summary.totalReps).toBe(1);
    expect(summary.qualifiedReps).toBe(1);
  });

  it("does not count a partial twitch", () => {
    const analyzer = new JumpingJackAnalyzer();
    const start = calibrate(analyzer);
    perform(analyzer, [[0.2, 0.2], [0.4, 0.35], [0.2, 0.2], [0, 0]], start);
    expect(analyzer.getSummary().totalReps).toBe(0);
  });

  it("counts the movement but reports arms that never reach overhead", () => {
    const analyzer = new JumpingJackAnalyzer();
    const start = calibrate(analyzer);
    perform(analyzer, [[0.2, 0.2], [0.35, 0.55], [0.55, 1], [0.3, 0.6], [0, 0]], start);
    const summary = analyzer.getSummary();
    expect(summary.totalReps).toBe(1);
    expect(summary.qualifiedReps).toBe(0);
    expect(summary.issueCounts.arms).toBe(1);
  });

  it("works at a fast 0.5 second cadence without double counting", () => {
    const analyzer = new JumpingJackAnalyzer();
    const start = calibrate(analyzer);
    perform(analyzer, [[0.3, 0.3], [0.8, 0.8], [1, 1], [0.55, 0.55], [0, 0]], start, 100);
    expect(analyzer.getSummary().totalReps).toBe(1);
  });

  it("follows a fast rep with timely open, close, and result cues", () => {
    const analyzer = new JumpingJackAnalyzer();
    const start = calibrate(analyzer);
    const observed: Array<{ at: number; speech: string | undefined }> = [];
    const frames: Array<[number, number]> = [
      [0.3, 0.3],
      [0.8, 0.8],
      [1, 1],
      [0.55, 0.55],
      [0, 0],
    ];

    frames.forEach(([arms, feet], index) => {
      const at = start + index * 100;
      const analysis = analyzer.analyze(jackPose(arms, feet), at);
      for (const event of analysis.events) {
        observed.push({ at: at - start, speech: event.speechMessage });
      }
    });

    expect(observed.map((event) => event.speech)).toEqual([
      "张开",
      "收回",
      "第 1 次，合格",
    ]);
    expect(observed[0]?.at).toBe(0);
    expect(observed[1]?.at).toBeLessThanOrEqual(200);
    expect(observed[2]?.at).toBe(400);
    expect(analyzer.getSummary().totalReps).toBe(1);
  });

  it.each([30, 50, 100, 150, 200])(
    "keeps one complete jump at a %d ms analysis interval",
    (step) => {
      const analyzer = new JumpingJackAnalyzer();
      const start = calibrate(analyzer);
      for (let elapsed = 0; elapsed <= 600; elapsed += step) {
        const progress = Math.sin(Math.PI * Math.min(1, elapsed / 600));
        analyzer.analyze(jackPose(progress, progress), start + elapsed);
      }
      analyzer.analyze(jackPose(0, 0), start + 650);
      expect(analyzer.getSummary().totalReps).toBe(1);
    },
  );

  it("does not double count while the body jitters near maximum opening", () => {
    const analyzer = new JumpingJackAnalyzer();
    const start = calibrate(analyzer);
    perform(analyzer, [[0.3, 0.3], [0.9, 0.9], [1, 1], [0.86, 0.92], [1, 0.88], [0.6, 0.6], [0, 0]], start);
    expect(analyzer.getSummary().totalReps).toBe(1);
  });

  it("does not backfill a rep when training starts from the open position", () => {
    const analyzer = new JumpingJackAnalyzer();
    const start = calibrate(analyzer);
    analyzer.analyze(jackPose(1, 1), start + 500);
    analyzer.analyze(null, start + 600);
    analyzer.analyze(null, start + 1_100);
    analyzer.analyze(jackPose(0, 0), start + 1_200);
    expect(analyzer.getSummary().totalReps).toBe(0);
  });

  it("reports clearly asynchronous hands and feet", () => {
    const analyzer = new JumpingJackAnalyzer();
    const start = calibrate(analyzer);
    perform(analyzer, [[0, 0.5], [0, 1], [0.7, 1], [1, 1], [0.5, 0.5], [0, 0]], start, 120);
    expect(analyzer.getSummary().issueCounts.sync).toBe(1);
  });

  it("drops an unfinished jump after sustained tracking loss", () => {
    const analyzer = new JumpingJackAnalyzer();
    const start = calibrate(analyzer);
    analyzer.analyze(jackPose(0.6, 0.6), start);
    analyzer.analyze(null, start + 100);
    analyzer.analyze(null, start + 600);
    analyzer.analyze(jackPose(0, 0), start + 700);
    expect(analyzer.getSummary().totalReps).toBe(0);
  });
});
