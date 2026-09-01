import { describe, expect, it } from "vitest";
import type { DetectedPose, PoseLandmark } from "../types";
import { BodyweightAnalyzer, type FirstBatchExerciseId } from "./bodyweight-analyzer";

function mark(x = 0.5, y = 0.5, visibility = 0.99): PoseLandmark {
  return { x, y, z: 0, visibility };
}

function basePose(): DetectedPose {
  const landmarks = Array.from({ length: 33 }, () => mark(0.5, 0.5, 0.15));
  const left = {
    shoulder: mark(0.43, 0.34),
    hip: mark(0.43, 0.58),
    knee: mark(0.43, 0.74),
    ankle: mark(0.43, 0.9),
    heel: mark(0.41, 0.92),
    foot: mark(0.5, 0.93),
  };
  const right = {
    shoulder: mark(0.57, 0.34),
    hip: mark(0.57, 0.58),
    knee: mark(0.57, 0.74),
    ankle: mark(0.57, 0.9),
    heel: mark(0.55, 0.92),
    foot: mark(0.64, 0.93),
  };
  for (const [index, value] of [
    [11, left.shoulder], [23, left.hip], [25, left.knee], [27, left.ankle],
    [29, left.heel], [31, left.foot], [12, right.shoulder], [24, right.hip],
    [26, right.knee], [28, right.ankle], [30, right.heel], [32, right.foot],
  ] as Array<[number, PoseLandmark]>) landmarks[index] = value;
  return { landmarks, worldLandmarks: [], aspectRatio: 1 };
}

function standingPose(kneeAngle = 170, lean = 4): DetectedPose {
  const pose = basePose();
  for (const side of ["left", "right"] as const) {
    const kneeIndex = side === "left" ? 25 : 26;
    const hipIndex = side === "left" ? 23 : 24;
    const shoulderIndex = side === "left" ? 11 : 12;
    const ankle = pose.landmarks[side === "left" ? 27 : 28]!;
    const knee = pose.landmarks[kneeIndex]!;
    const radians = kneeAngle * Math.PI / 180;
    const hip = mark(
      knee.x + 0.16 * Math.sin(radians),
      knee.y + 0.16 * Math.cos(radians),
    );
    const leanRadians = lean * Math.PI / 180;
    pose.landmarks[hipIndex] = hip;
    pose.landmarks[shoulderIndex] = mark(
      hip.x + 0.24 * Math.sin(leanRadians),
      hip.y - 0.24 * Math.cos(leanRadians),
    );
    ankle.y = knee.y + 0.16;
  }
  return pose;
}

function calfPose(lift = 0, kneeAngle = 170, shoulderShift = 0): DetectedPose {
  const pose = standingPose(kneeAngle);
  for (const [heelIndex, footIndex, shoulderIndex] of [
    [29, 31, 11],
    [30, 32, 12],
  ] as Array<[number, number, number]>) {
    const heel = pose.landmarks[heelIndex]!;
    const foot = pose.landmarks[footIndex]!;
    heel.y = 0.92 - lift * 0.16;
    foot.y = 0.93;
    pose.landmarks[shoulderIndex]!.x += shoulderShift;
  }
  return pose;
}

function highKneePose(leftHeight = -0.35, rightHeight = -0.35, lean = 0): DetectedPose {
  const pose = basePose();
  for (const [shoulderIndex, hipIndex, kneeIndex, height] of [
    [11, 23, 25, leftHeight],
    [12, 24, 26, rightHeight],
  ] as Array<[number, number, number, number]>) {
    const hip = pose.landmarks[hipIndex]!;
    const shoulder = pose.landmarks[shoulderIndex]!;
    shoulder.x = hip.x + Math.tan(lean * Math.PI / 180) * 0.24;
    shoulder.y = hip.y - 0.24;
    pose.landmarks[kneeIndex]!.y = hip.y - height * 0.24;
  }
  return pose;
}

function floorPose(elbowAngle = 170, hipOffset = 0): DetectedPose {
  const pose = basePose();
  for (const side of ["left", "right"] as const) {
    const shoulderIndex = side === "left" ? 11 : 12;
    const elbowIndex = side === "left" ? 13 : 14;
    const wristIndex = side === "left" ? 15 : 16;
    const hipIndex = side === "left" ? 23 : 24;
    const kneeIndex = side === "left" ? 25 : 26;
    const ankleIndex = side === "left" ? 27 : 28;
    const shoulder = mark(0.22, 0.46);
    const elbow = mark(0.25, 0.62);
    const direction = (-90 + elbowAngle) * Math.PI / 180;
    pose.landmarks[shoulderIndex] = shoulder;
    pose.landmarks[elbowIndex] = elbow;
    pose.landmarks[wristIndex] = mark(
      elbow.x + 0.16 * Math.cos(direction),
      elbow.y + 0.16 * Math.sin(direction),
    );
    pose.landmarks[hipIndex] = mark(0.48, 0.46 + hipOffset);
    pose.landmarks[kneeIndex] = mark(0.67, 0.46 + hipOffset * 0.45);
    pose.landmarks[ankleIndex] = mark(0.86, 0.46);
  }
  return pose;
}

function mountainPose(side: "left" | "right" | null): DetectedPose {
  const pose = floorPose();
  if (side) {
    const shoulder = pose.landmarks[side === "left" ? 11 : 12]!;
    const knee = pose.landmarks[side === "left" ? 25 : 26]!;
    knee.x = shoulder.x + 0.08;
    knee.y = shoulder.y + 0.04;
  }
  return pose;
}

function shoulderTapPose(side: "left" | "right" | null): DetectedPose {
  const pose = floorPose();
  if (side === "left") {
    const target = pose.landmarks[12]!;
    pose.landmarks[15] = mark(target.x + 0.02, target.y + 0.02);
  } else if (side === "right") {
    const target = pose.landmarks[11]!;
    pose.landmarks[16] = mark(target.x - 0.02, target.y + 0.02);
  }
  return pose;
}

function burpeeStandingPose(kneeAngle = 170): DetectedPose {
  const pose = standingPose(kneeAngle);
  pose.landmarks[13] = mark(0.42, 0.5);
  pose.landmarks[14] = mark(0.58, 0.5);
  pose.landmarks[15] = mark(0.42, 0.64);
  pose.landmarks[16] = mark(0.58, 0.64);
  return pose;
}

function gluteBridgePose(bridgeAngle = 105): DetectedPose {
  const pose = basePose();
  for (const side of ["left", "right"] as const) {
    const shoulderIndex = side === "left" ? 11 : 12;
    const hipIndex = side === "left" ? 23 : 24;
    const kneeIndex = side === "left" ? 25 : 26;
    const ankleIndex = side === "left" ? 27 : 28;
    const lane = side === "left" ? -0.02 : 0.02;
    const hip = mark(0.5, 0.58 + lane);
    const kneeDirection = (180 - bridgeAngle) * Math.PI / 180;
    pose.landmarks[shoulderIndex] = mark(0.28, 0.58 + lane);
    pose.landmarks[hipIndex] = hip;
    pose.landmarks[kneeIndex] = mark(
      hip.x + 0.2 * Math.cos(kneeDirection),
      hip.y + 0.2 * Math.sin(kneeDirection),
    );
    pose.landmarks[ankleIndex] = mark(0.78, 0.78 + lane);
  }
  return pose;
}

function oppositeReachPose(side: "left" | "right" | null, stable = true): DetectedPose {
  const pose = basePose();
  for (const [shoulderIndex, elbowIndex, wristIndex, hipIndex, kneeIndex, ankleIndex, lane] of [
    [11, 13, 15, 23, 25, 27, -0.02],
    [12, 14, 16, 24, 26, 28, 0.02],
  ] as Array<[number, number, number, number, number, number, number]>) {
    pose.landmarks[shoulderIndex] = mark(0.38, 0.48 + lane);
    pose.landmarks[elbowIndex] = mark(0.32, 0.48 + lane);
    pose.landmarks[wristIndex] = mark(0.26, 0.48 + lane);
    pose.landmarks[hipIndex] = mark(stable ? 0.58 : 0.48, stable ? 0.48 + lane : 0.64 + lane);
    pose.landmarks[kneeIndex] = mark(0.64, 0.5 + lane);
    pose.landmarks[ankleIndex] = mark(0.7, 0.5 + lane);
  }
  if (side === "left") {
    pose.landmarks[15] = mark(0.02, 0.46);
    pose.landmarks[28] = mark(0.94, 0.5);
  } else if (side === "right") {
    pose.landmarks[16] = mark(0.02, 0.5);
    pose.landmarks[27] = mark(0.94, 0.46);
  }
  return pose;
}

function calibrate(
  analyzer: BodyweightAnalyzer,
  pose: DetectedPose,
  start = 0,
): number {
  let at = start;
  for (let index = 0; index < 7; index += 1) {
    analyzer.analyze(pose, at);
    at += 100;
  }
  return at;
}

function run(
  analyzer: BodyweightAnalyzer,
  poses: DetectedPose[],
  start: number,
  step = 100,
): ReturnType<BodyweightAnalyzer["analyze"]>[] {
  return poses.map((pose, index) => analyzer.analyze(pose, start + index * step));
}

describe("BodyweightAnalyzer first reviewed batch", () => {
  it("counts a full reverse lunge and reports a shallow one", () => {
    const good = new BodyweightAnalyzer("reverse-lunge");
    const start = calibrate(good, standingPose());
    run(good, [145, 130, 108, 114, 135, 158].map((angle) => standingPose(angle)), start);
    expect(good.getSummary()).toMatchObject({ totalReps: 1, qualifiedReps: 1 });

    const shallow = new BodyweightAnalyzer("reverse-lunge");
    const shallowStart = calibrate(shallow, standingPose());
    run(shallow, [142, 132, 122, 130, 145, 158].map((angle) => standingPose(angle)), shallowStart);
    expect(shallow.getSummary()).toMatchObject({
      totalReps: 1,
      qualifiedReps: 0,
      issueCounts: { range: 1 },
    });
  });

  it("counts a controlled calf raise and catches bent-knee assistance", () => {
    const analyzer = new BodyweightAnalyzer("calf-raise");
    const start = calibrate(analyzer, calfPose());
    const frames = run(analyzer, [
      calfPose(0.04), calfPose(0.08, 145), calfPose(0.11, 145),
      calfPose(0.07), calfPose(0.02), calfPose(0),
    ], start);
    expect(frames.some((frame) => frame.events.some((event) => event.kind === "correction")))
      .toBe(true);
    expect(analyzer.getSummary()).toMatchObject({
      totalReps: 1,
      qualifiedReps: 0,
      issueCounts: { alignment: 1 },
    });
  });

  it("counts every completed high-knee side and speaks during the movement", () => {
    const analyzer = new BodyweightAnalyzer("high-knees");
    const start = calibrate(analyzer, highKneePose());
    const frames = run(analyzer, [
      highKneePose(-0.04, -0.35), highKneePose(0.12, -0.35), highKneePose(-0.35, -0.35),
      highKneePose(-0.35, -0.04), highKneePose(-0.35, 0.12), highKneePose(-0.35, -0.35),
    ], start);
    expect(frames.flatMap((frame) => frame.events).filter((event) => event.kind === "phase"))
      .toHaveLength(2);
    expect(analyzer.getSummary()).toMatchObject({ totalReps: 2, qualifiedReps: 2 });
  });

  it("does not get stuck when fast high knees skip a fully neutral frame", () => {
    const analyzer = new BodyweightAnalyzer("high-knees");
    const start = calibrate(analyzer, highKneePose());
    run(analyzer, [
      highKneePose(0.12, -0.35),
      highKneePose(-0.1, 0.12),
      highKneePose(-0.35, -0.35),
    ], start, 120);
    expect(analyzer.getSummary()).toMatchObject({ totalReps: 2, qualifiedReps: 2 });
  });

  it("counts a full push-up and catches a broken body line in real time", () => {
    const analyzer = new BodyweightAnalyzer("push-up");
    const start = calibrate(analyzer, floorPose());
    const frames = run(analyzer, [
      floorPose(135), floorPose(108), floorPose(92, 0.16),
      floorPose(112), floorPose(150), floorPose(162),
    ], start);
    expect(frames.some((frame) => frame.events.some((event) => event.key.includes("body-line"))))
      .toBe(true);
    expect(analyzer.getSummary()).toMatchObject({
      totalReps: 1,
      qualifiedReps: 0,
      issueCounts: { "body-line": 1 },
    });
  });

  it("only adds valid plank time while the body line is stable", () => {
    const analyzer = new BodyweightAnalyzer("plank");
    const start = calibrate(analyzer, floorPose());
    run(analyzer, [floorPose(), floorPose(), floorPose(170, 0.16), floorPose(), floorPose()], start, 200);
    const summary = analyzer.getSummary();
    expect(summary.measurementMode).toBe("timed-hold");
    expect(summary.validDurationMs).toBe(800);
    expect(summary.issueCounts["body-line"]).toBe(1);
  });

  it.each<FirstBatchExerciseId>(["reverse-lunge", "calf-raise", "high-knees", "push-up"])(
    "requires the start position after sustained tracking loss for %s",
    (exerciseId) => {
      const analyzer = new BodyweightAnalyzer(exerciseId);
      const ready = exerciseId === "push-up" ? floorPose() : exerciseId === "high-knees" ? highKneePose() : standingPose();
      const at = calibrate(analyzer, ready);
      analyzer.analyze(null, at);
      analyzer.analyze(null, at + 500);
      const first = analyzer.analyze(ready, at + 600);
      const recovered = analyzer.analyze(ready, at + 950);
      expect(first.phase).toBe("paused");
      expect(recovered.phase).toBe(exerciseId === "push-up" ? "plank" : "standing");
      expect(analyzer.getSummary().totalReps).toBe(0);
    },
  );

  it("counts a complete knee push-up with shoulder-hip-knee alignment", () => {
    const analyzer = new BodyweightAnalyzer("knee-push-up");
    const start = calibrate(analyzer, floorPose());
    run(analyzer, [
      floorPose(135), floorPose(108), floorPose(92),
      floorPose(112), floorPose(150), floorPose(162),
    ], start);
    expect(analyzer.getSummary()).toMatchObject({ totalReps: 1, qualifiedReps: 1 });
  });

  it("counts every completed mountain-climber side", () => {
    const analyzer = new BodyweightAnalyzer("mountain-climber");
    const start = calibrate(analyzer, mountainPose(null));
    const frames = run(analyzer, [
      mountainPose("left"), mountainPose("left"), mountainPose(null),
      mountainPose("right"), mountainPose("right"), mountainPose(null),
    ], start, 80);
    expect(frames.flatMap((frame) => frame.events).some((event) => event.speechMessage === "膝盖向胸口"))
      .toBe(true);
    expect(analyzer.getSummary()).toMatchObject({ totalReps: 2, qualifiedReps: 2 });
  });

  it("counts every completed shoulder tap without double counting a held hand", () => {
    const analyzer = new BodyweightAnalyzer("shoulder-tap");
    const start = calibrate(analyzer, shoulderTapPose(null));
    run(analyzer, [
      shoulderTapPose("left"), shoulderTapPose("left"), shoulderTapPose("left"),
      shoulderTapPose(null), shoulderTapPose("right"), shoulderTapPose("right"),
      shoulderTapPose(null),
    ], start, 80);
    expect(analyzer.getSummary()).toMatchObject({ totalReps: 2, qualifiedReps: 2 });
  });

  it("adds only valid side-plank time and records a dropped-hip episode", () => {
    const analyzer = new BodyweightAnalyzer("side-plank");
    const start = calibrate(analyzer, floorPose());
    run(analyzer, [floorPose(), floorPose(), floorPose(170, 0.16), floorPose()], start, 200);
    expect(analyzer.getSummary()).toMatchObject({
      measurementMode: "timed-hold",
      validDurationMs: 600,
      issueCounts: { "body-line": 1 },
    });
  });

  it("counts a standing-floor-standing burpee and rejects a partial crouch as range", () => {
    const analyzer = new BodyweightAnalyzer("burpee");
    const start = calibrate(analyzer, burpeeStandingPose());
    const frames = run(analyzer, [
      burpeeStandingPose(138), floorPose(), floorPose(), burpeeStandingPose(165),
    ], start, 180);
    expect(frames.flatMap((frame) => frame.events).map((event) => event.speechMessage))
      .toEqual(expect.arrayContaining(["下蹲，双手撑地", "撑稳，收紧核心", "收腿站直"]));
    expect(analyzer.getSummary()).toMatchObject({ totalReps: 1, qualifiedReps: 1 });

    const partial = new BodyweightAnalyzer("burpee");
    const partialStart = calibrate(partial, burpeeStandingPose());
    run(partial, [burpeeStandingPose(138), burpeeStandingPose(130), burpeeStandingPose(165)], partialStart, 250);
    expect(partial.getSummary()).toMatchObject({
      totalReps: 1,
      qualifiedReps: 0,
      issueCounts: { range: 1 },
    });
  });

  it("counts a complete side lunge and reports a shallow one", () => {
    const analyzer = new BodyweightAnalyzer("side-lunge");
    const start = calibrate(analyzer, standingPose());
    const frames = run(analyzer, [
      standingPose(142), standingPose(125), standingPose(105),
      standingPose(118), standingPose(138), standingPose(158),
    ], start);
    expect(frames.flatMap((frame) => frame.events).map((event) => event.speechMessage))
      .toEqual(expect.arrayContaining(["髋部向后坐", "臀腿发力，回到站立"]));
    expect(analyzer.getSummary()).toMatchObject({ totalReps: 1, qualifiedReps: 1 });

    const shallow = new BodyweightAnalyzer("side-lunge");
    const shallowStart = calibrate(shallow, standingPose());
    run(shallow, [
      standingPose(142), standingPose(130), standingPose(122),
      standingPose(132), standingPose(145), standingPose(158),
    ], shallowStart);
    expect(shallow.getSummary()).toMatchObject({
      totalReps: 1,
      qualifiedReps: 0,
      issueCounts: { range: 1 },
    });
  });

  it("counts a full glute bridge and catches insufficient hip extension", () => {
    const analyzer = new BodyweightAnalyzer("glute-bridge");
    const start = calibrate(analyzer, gluteBridgePose());
    run(analyzer, [
      gluteBridgePose(138), gluteBridgePose(158),
      gluteBridgePose(144), gluteBridgePose(120),
    ], start);
    expect(analyzer.getSummary()).toMatchObject({ totalReps: 1, qualifiedReps: 1 });

    const shallow = new BodyweightAnalyzer("glute-bridge");
    const shallowStart = calibrate(shallow, gluteBridgePose());
    run(shallow, [
      gluteBridgePose(136), gluteBridgePose(147),
      gluteBridgePose(138), gluteBridgePose(120),
    ], shallowStart);
    expect(shallow.getSummary()).toMatchObject({
      totalReps: 1,
      qualifiedReps: 0,
      issueCounts: { range: 1 },
    });
  });

  it.each(["bird-dog", "dead-bug"] as const)(
    "counts every completed opposite reach side for %s",
    (exerciseId) => {
      const analyzer = new BodyweightAnalyzer(exerciseId);
      const start = calibrate(analyzer, oppositeReachPose(null));
      const frames = run(analyzer, [
        oppositeReachPose("left"), oppositeReachPose("left"), oppositeReachPose(null),
        oppositeReachPose("right"), oppositeReachPose("right"), oppositeReachPose(null),
      ], start, 100);
      expect(frames.flatMap((frame) => frame.events).some(
        (event) => event.speechMessage === "对侧手脚伸远",
      )).toBe(true);
      expect(analyzer.getSummary()).toMatchObject({ totalReps: 2, qualifiedReps: 2 });
    },
  );

  it("gives a live stability correction during an opposite reach", () => {
    const analyzer = new BodyweightAnalyzer("bird-dog");
    const start = calibrate(analyzer, oppositeReachPose(null));
    const frames = run(analyzer, [
      oppositeReachPose("left"), oppositeReachPose("left", false),
      oppositeReachPose(null), oppositeReachPose("right"), oppositeReachPose(null),
    ], start, 100);
    expect(frames.flatMap((frame) => frame.events).some(
      (event) => event.kind === "correction" && event.speechMessage === "骨盆保持稳定",
    )).toBe(true);
  });

  it("counts a full single-leg deadlift and catches excessive support-knee bend", () => {
    const analyzer = new BodyweightAnalyzer("single-leg-deadlift");
    const start = calibrate(analyzer, standingPose());
    const frames = run(analyzer, [
      standingPose(170, 24), standingPose(170, 36), standingPose(170, 48),
      standingPose(135, 42), standingPose(170, 25), standingPose(170, 10),
    ], start);
    expect(frames.flatMap((frame) => frame.events).some(
      (event) => event.kind === "correction" && event.speechMessage === "支撑膝保持稳定",
    )).toBe(true);
    expect(analyzer.getSummary()).toMatchObject({
      totalReps: 1,
      qualifiedReps: 0,
      issueCounts: { alignment: 1 },
    });
  });
});
