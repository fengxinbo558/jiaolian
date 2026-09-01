import { describe, expect, it } from "vitest";
import type { CompletedRep, DetectedPose, PoseLandmark } from "../types";
import {
  ExpandedExerciseAnalyzer,
  type RealtimeExpandedExerciseId,
} from "./expanded-analyzer";

function mark(x: number, y: number, visibility = 0.99): PoseLandmark {
  return { x, y, z: 0, visibility };
}

function basePose(): DetectedPose {
  const landmarks = Array.from({ length: 33 }, () => mark(0.5, 0.5, 0.2));
  for (const [shoulder, elbow, wrist, hip, knee, ankle, lane] of [
    [11, 13, 15, 23, 25, 27, 0.42],
    [12, 14, 16, 24, 26, 28, 0.58],
  ] as Array<[number, number, number, number, number, number, number]>) {
    landmarks[shoulder] = mark(lane, 0.3);
    landmarks[elbow] = mark(lane, 0.46);
    landmarks[wrist] = mark(lane, 0.62);
    landmarks[hip] = mark(lane, 0.55);
    landmarks[knee] = mark(lane, 0.72);
    landmarks[ankle] = mark(lane, 0.9);
  }
  return { landmarks, worldLandmarks: [], aspectRatio: 1 };
}

function setKneeAngle(pose: DetectedPose, side: "left" | "right", kneeAngle: number): void {
  const hipIndex = side === "left" ? 23 : 24;
  const kneeIndex = side === "left" ? 25 : 26;
  const ankleIndex = side === "left" ? 27 : 28;
  const knee = pose.landmarks[kneeIndex]!;
  const ankle = pose.landmarks[ankleIndex]!;
  ankle.x = knee.x;
  ankle.y = knee.y + 0.18;
  const radians = kneeAngle * Math.PI / 180;
  const direction = side === "left" ? 1 : -1;
  pose.landmarks[hipIndex] = mark(
    knee.x + direction * 0.17 * Math.sin(radians),
    knee.y + 0.17 * Math.cos(radians),
  );
}

function setTrunkLean(pose: DetectedPose, degrees: number): void {
  for (const [shoulderIndex, hipIndex] of [[11, 23], [12, 24]] as const) {
    const hip = pose.landmarks[hipIndex]!;
    const radians = degrees * Math.PI / 180;
    pose.landmarks[shoulderIndex] = mark(
      hip.x + 0.23 * Math.sin(radians),
      hip.y - 0.23 * Math.cos(radians),
    );
  }
}

function setStraightArmAngle(pose: DetectedPose, armAngle: number): void {
  const radians = armAngle * Math.PI / 180;
  for (const [shoulderIndex, elbowIndex, wristIndex, direction] of [
    [11, 13, 15, -1],
    [12, 14, 16, 1],
  ] as Array<[number, number, number, number]>) {
    const shoulder = pose.landmarks[shoulderIndex]!;
    const wrist = mark(
      shoulder.x + direction * 0.3 * Math.sin(radians),
      shoulder.y + 0.3 * Math.cos(radians),
    );
    pose.landmarks[elbowIndex] = mark(
      (shoulder.x + wrist.x) / 2,
      (shoulder.y + wrist.y) / 2,
    );
    pose.landmarks[wristIndex] = wrist;
  }
}

function setElbowAngle(pose: DetectedPose, elbowAngle: number): void {
  const radians = elbowAngle * Math.PI / 180;
  for (const [shoulderIndex, elbowIndex, wristIndex, direction] of [
    [11, 13, 15, -1],
    [12, 14, 16, 1],
  ] as Array<[number, number, number, number]>) {
    const shoulder = pose.landmarks[shoulderIndex]!;
    const elbow = mark(shoulder.x, shoulder.y + 0.17);
    pose.landmarks[elbowIndex] = elbow;
    pose.landmarks[wristIndex] = mark(
      elbow.x + direction * 0.15 * Math.sin(radians),
      elbow.y - 0.15 * Math.cos(radians),
    );
  }
}

function strengthPose(options: {
  knee?: number;
  trunk?: number;
  arm?: number;
  elbow?: number;
  wide?: boolean;
} = {}): DetectedPose {
  const pose = basePose();
  if (options.wide) {
    pose.landmarks[25]!.x = 0.28;
    pose.landmarks[27]!.x = 0.28;
    pose.landmarks[26]!.x = 0.72;
    pose.landmarks[28]!.x = 0.72;
  }
  setKneeAngle(pose, "left", options.knee ?? 170);
  setKneeAngle(pose, "right", options.knee ?? 170);
  setTrunkLean(pose, options.trunk ?? 0);
  if (options.arm !== undefined) setStraightArmAngle(pose, options.arm);
  if (options.elbow !== undefined) setElbowAngle(pose, options.elbow);
  return pose;
}

function sideViewWithOccludedRight(pose: DetectedPose): DetectedPose {
  for (const index of [12, 14, 16, 24, 26, 28]) {
    pose.landmarks[index]!.visibility = 0.2;
  }
  return pose;
}

function yogaPose(id: RealtimeExpandedExerciseId): DetectedPose {
  if (id === "chair-pose") {
    return strengthPose({ knee: 108, trunk: 18, arm: 155 });
  }
  if (id === "warrior-two") {
    const pose = strengthPose({ knee: 170, arm: 90, wide: true });
    setKneeAngle(pose, "left", 108);
    pose.landmarks[11] = mark(0.42, 0.34);
    pose.landmarks[12] = mark(0.58, 0.34);
    setStraightArmAngle(pose, 90);
    return pose;
  }
  if (id === "tree-pose") {
    const pose = strengthPose({ knee: 170, trunk: 2 });
    setKneeAngle(pose, "left", 92);
    pose.landmarks[27]!.y = 0.58;
    return pose;
  }
  const pose = basePose();
  for (const [shoulder, elbow, wrist, hip, knee, ankle, offset] of [
    [11, 13, 15, 23, 25, 27, -0.015],
    [12, 14, 16, 24, 26, 28, 0.015],
  ] as Array<[number, number, number, number, number, number, number]>) {
    pose.landmarks[shoulder] = mark(0.31, 0.61 + offset);
    pose.landmarks[elbow] = mark(0.22, 0.73 + offset);
    pose.landmarks[wrist] = mark(0.13, 0.85 + offset);
    pose.landmarks[hip] = mark(0.53, 0.28 + offset);
    pose.landmarks[knee] = mark(0.69, 0.56 + offset);
    pose.landmarks[ankle] = mark(0.85, 0.84 + offset);
  }
  return pose;
}

function calibrate(
  analyzer: ExpandedExerciseAnalyzer,
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

describe("ExpandedExerciseAnalyzer", () => {
  it.each([
    "chair-pose",
    "warrior-two",
    "tree-pose",
    "downward-dog",
  ] as const)("recognizes and accumulates a valid %s hold", (exerciseId) => {
    const analyzer = new ExpandedExerciseAnalyzer(exerciseId);
    const pose = yogaPose(exerciseId);
    const start = calibrate(analyzer, pose);
    let result = analyzer.analyze(pose, start);
    for (let index = 1; index <= 12; index += 1) {
      result = analyzer.analyze(pose, start + index * 100);
    }
    expect(result.phase).toBe("holding");
    expect(result.validHoldMs).toBeGreaterThanOrEqual(1_000);
    expect(analyzer.getSummary().measurementMode).toBe("timed-hold");
  });

  it("pauses chair-pose timing and gives an immediate actionable correction", () => {
    const analyzer = new ExpandedExerciseAnalyzer("chair-pose");
    const good = yogaPose("chair-pose");
    const start = calibrate(analyzer, good);
    analyzer.analyze(good, start);
    const bad = strengthPose({ knee: 168, trunk: 4, arm: 155 });
    const result = analyzer.analyze(bad, start + 100);
    expect(result.phase).toBe("paused");
    expect(result.events[0]).toMatchObject({ kind: "correction", speak: true });
    expect(result.events[0]?.speechMessage).toContain("髋部");
  });

  it.each([
    ["sumo-squat", strengthPose({ knee: 170, wide: true }), [
      strengthPose({ knee: 140, wide: true }),
      strengthPose({ knee: 104, wide: true }),
      strengthPose({ knee: 122, wide: true }),
      strengthPose({ knee: 160, wide: true }),
    ]],
    ["goblet-squat", strengthPose({ knee: 170 }), [
      strengthPose({ knee: 140 }), strengthPose({ knee: 104 }),
      strengthPose({ knee: 122 }), strengthPose({ knee: 160 }),
    ]],
    ["dumbbell-rdl", strengthPose({ trunk: 4 }), [
      strengthPose({ trunk: 25 }), strengthPose({ trunk: 50 }),
      strengthPose({ trunk: 34 }), strengthPose({ trunk: 8 }),
    ]],
    ["dumbbell-shoulder-press", strengthPose({ arm: 90 }), [
      strengthPose({ arm: 120 }), strengthPose({ arm: 162 }),
      strengthPose({ arm: 132 }), strengthPose({ arm: 90 }),
    ]],
    ["dumbbell-lateral-raise", strengthPose({ arm: 8 }), [
      strengthPose({ arm: 35 }), strengthPose({ arm: 92 }),
      strengthPose({ arm: 58 }), strengthPose({ arm: 8 }),
    ]],
    ["dumbbell-biceps-curl", strengthPose({ elbow: 170 }), [
      strengthPose({ elbow: 130 }), strengthPose({ elbow: 65 }),
      strengthPose({ elbow: 105 }), strengthPose({ elbow: 160 }),
    ]],
  ] as const)("counts one complete %s repetition", (exerciseId, startPose, movement) => {
    const analyzer = new ExpandedExerciseAnalyzer(exerciseId);
    const start = calibrate(analyzer, startPose);
    let completed: CompletedRep | null = null;
    movement.forEach((pose, index) => {
      const result = analyzer.analyze(pose, start + index * 120);
      completed = result.completedRep ?? completed;
    });
    expect(analyzer.getSummary()).toMatchObject({ totalReps: 1, qualifiedReps: 1 });
    expect(completed).toMatchObject({ repNumber: 1, exerciseId });
  });

  it("drops an unfinished dumbbell repetition after sustained tracking loss", () => {
    const analyzer = new ExpandedExerciseAnalyzer("dumbbell-lateral-raise");
    const start = calibrate(analyzer, strengthPose({ arm: 8 }));
    analyzer.analyze(strengthPose({ arm: 45 }), start);
    analyzer.analyze(null, start + 100);
    const lost = analyzer.analyze(null, start + 600);
    analyzer.analyze(strengthPose({ arm: 8 }), start + 700);
    expect(lost.trackingState).toBe("lost");
    expect(analyzer.getSummary().totalReps).toBe(0);
  });

  it.each([50, 100, 200, 300])(
    "keeps a fast sumo squat count stable at a %d ms analysis interval",
    (step) => {
      const analyzer = new ExpandedExerciseAnalyzer("sumo-squat");
      const start = calibrate(analyzer, strengthPose({ knee: 170, wide: true }));
      [140, 104, 122, 160].forEach((knee, index) => {
        analyzer.analyze(strengthPose({ knee, wide: true }), start + index * step);
      });
      expect(analyzer.getSummary().totalReps).toBe(1);
    },
  );

  it("uses the clear side of a supported side-view sumo squat", () => {
    const analyzer = new ExpandedExerciseAnalyzer("sumo-squat");
    const startPose = sideViewWithOccludedRight(strengthPose({ knee: 170, wide: true }));
    const start = calibrate(analyzer, startPose);
    [140, 104, 122, 160].forEach((knee, index) => {
      analyzer.analyze(
        sideViewWithOccludedRight(strengthPose({ knee, wide: true })),
        start + index * 120,
      );
    });
    expect(analyzer.getSummary().totalReps).toBe(1);
  });

  it("uses the clear side of a supported side-view shoulder press", () => {
    const analyzer = new ExpandedExerciseAnalyzer("dumbbell-shoulder-press");
    const startPose = sideViewWithOccludedRight(strengthPose({ arm: 90 }));
    const start = calibrate(analyzer, startPose);
    [120, 162, 132, 90].forEach((arm, index) => {
      analyzer.analyze(
        sideViewWithOccludedRight(strengthPose({ arm })),
        start + index * 120,
      );
    });
    expect(analyzer.getSummary().totalReps).toBe(1);
  });

  it("speaks current dumbbell phases without leaving an old cue behind", () => {
    const analyzer = new ExpandedExerciseAnalyzer("dumbbell-lateral-raise");
    const start = calibrate(analyzer, strengthPose({ arm: 8 }));
    const observed: Array<{ at: number; speech: string | undefined }> = [];
    [35, 92, 58, 8].forEach((arm, index) => {
      const at = start + index * 80;
      const result = analyzer.analyze(strengthPose({ arm }), at);
      for (const event of result.events) {
        observed.push({ at: at - start, speech: event.speechMessage });
      }
    });
    expect(observed.map((item) => item.speech)).toEqual([
      "侧向抬起",
      "控制放下",
      "第 1 次，合格",
    ]);
    expect(observed[1]?.at).toBeLessThanOrEqual(160);
    expect(observed[2]?.at).toBeLessThanOrEqual(240);
  });
});
