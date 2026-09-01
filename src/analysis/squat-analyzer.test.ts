import { describe, expect, it } from "vitest";
import { SquatAnalyzer } from "./squat-analyzer";
import type {
  CompletedRep,
  DetectedPose,
  PoseLandmark,
  SquatPhase,
} from "../types";

function landmark(
  x = 0.5,
  y = 0.5,
  visibility = 0.99,
): PoseLandmark {
  return { x, y, z: 0, visibility };
}

function poseFor(kneeAngle: number, trunkLean = 5): DetectedPose {
  const landmarks = Array.from({ length: 33 }, () => landmark(0.5, 0.5, 0.2));
  const knee = { x: 0.45, y: 0.68 };
  const angleRadians = (kneeAngle * Math.PI) / 180;
  const hip = {
    x: knee.x + 0.22 * Math.sin(angleRadians),
    y: knee.y + 0.22 * Math.cos(angleRadians),
  };
  const ankle = { x: knee.x, y: knee.y + 0.22 };
  const leanRadians = (trunkLean * Math.PI) / 180;
  const shoulder = {
    x: hip.x + 0.24 * Math.sin(leanRadians),
    y: hip.y - 0.24 * Math.cos(leanRadians),
  };

  landmarks[11] = landmark(shoulder.x, shoulder.y);
  landmarks[23] = landmark(hip.x, hip.y);
  landmarks[25] = landmark(knee.x, knee.y);
  landmarks[27] = landmark(ankle.x, ankle.y);
  landmarks[29] = landmark(ankle.x - 0.02, ankle.y + 0.02);
  landmarks[31] = landmark(ankle.x + 0.09, ankle.y + 0.03);

  return {
    landmarks,
    worldLandmarks: [],
    aspectRatio: 1,
  };
}

function widePoseFor(kneeAngle: number, trunkLean = 5): DetectedPose {
  const pose = poseFor(kneeAngle, trunkLean);
  const aspectRatio = 16 / 9;
  const anchorX = pose.landmarks[25]?.x ?? 0.5;
  for (const current of pose.landmarks) {
    current.x = anchorX + (current.x - anchorX) / aspectRatio;
  }
  pose.aspectRatio = aspectRatio;
  return pose;
}

function copyLeftSideToRight(pose: DetectedPose): DetectedPose {
  const pairs: Array<[number, number]> = [
    [11, 12],
    [23, 24],
    [25, 26],
    [27, 28],
    [29, 30],
    [31, 32],
  ];
  for (const [left, right] of pairs) {
    const source = pose.landmarks[left];
    if (source) {
      pose.landmarks[right] = { ...source };
    }
  }
  return pose;
}

function setWorldView(
  pose: DetectedPose,
  view: "front" | "side" | "oblique",
): DetectedPose {
  const source = pose.landmarks.map((point) => ({ ...point }));
  copyLeftSideToRight(pose);
  pose.worldLandmarks = pose.landmarks.map((point) => ({ ...point }));
  const spans = {
    front: { x: 0.4, z: 0.02 },
    side: { x: 0.02, z: 0.4 },
    oblique: { x: 0.28, z: 0.28 },
  }[view];
  const spanLength = Math.hypot(spans.x, spans.z);
  const sagittal = { x: -spans.z / spanLength, z: spans.x / spanLength };
  const sourceHip = source[23];
  if (!sourceHip) return pose;
  const sideIndices = [
    { sign: -1, target: [11, 23, 25, 27, 29, 31] as const },
    { sign: 1, target: [12, 24, 26, 28, 30, 32] as const },
  ] as const;
  const sourceIndices = [11, 23, 25, 27, 29, 31] as const;
  for (const side of sideIndices) {
    for (let index = 0; index < sourceIndices.length; index += 1) {
      const sourcePoint = source[sourceIndices[index] ?? 0];
      const targetPoint = pose.worldLandmarks[side.target[index] ?? 0];
      if (!sourcePoint || !targetPoint) continue;
      const localHorizontal = sourcePoint.x - sourceHip.x;
      targetPoint.x =
        (side.sign * spans.x) / 2 + localHorizontal * sagittal.x;
      targetPoint.y = sourcePoint.y;
      targetPoint.z =
        (side.sign * spans.z) / 2 + localHorizontal * sagittal.z;
    }
  }
  return pose;
}

function calibrate(analyzer: SquatAnalyzer, start = 0): number {
  let timestamp = start;
  for (let index = 0; index < 22; index += 1) {
    analyzer.analyze(poseFor(170), timestamp);
    timestamp += 100;
  }
  return timestamp;
}

function feed(
  analyzer: SquatAnalyzer,
  sequence: Array<{ angle: number; lean?: number; step?: number }>,
  start: number,
): number {
  let timestamp = start;
  for (const frame of sequence) {
    analyzer.analyze(poseFor(frame.angle, frame.lean), timestamp);
    timestamp += frame.step ?? 200;
  }
  return timestamp;
}

function feedAndCollect(
  analyzer: SquatAnalyzer,
  sequence: Array<{ angle: number; lean?: number; step?: number }>,
  start: number,
): { timestamp: number; completedReps: CompletedRep[] } {
  let timestamp = start;
  const completedReps: CompletedRep[] = [];
  for (const frame of sequence) {
    const analysis = analyzer.analyze(
      poseFor(frame.angle, frame.lean),
      timestamp,
    );
    if (analysis.completedRep) {
      completedReps.push(analysis.completedRep);
    }
    timestamp += frame.step ?? 200;
  }
  return { timestamp, completedReps };
}

describe("SquatAnalyzer", () => {
  it("counts one complete deep squat as qualified", () => {
    const analyzer = new SquatAnalyzer();
    const start = calibrate(analyzer);

    const result = feedAndCollect(
      analyzer,
      [
        { angle: 142 },
        { angle: 126 },
        { angle: 108 },
        { angle: 94 },
        { angle: 99 },
        { angle: 112 },
        { angle: 132 },
        { angle: 150 },
        { angle: 160 },
        { angle: 168 },
        { angle: 168 },
        { angle: 168 },
        { angle: 168 },
      ],
      start,
    );

    const summary = analyzer.getSummary(new Date("2026-08-11T00:00:00Z"));
    expect(summary.issueCounts).toEqual({
      depth: 0,
      lean: 0,
      knees: 0,
      speed: 0,
    });
    expect(summary.totalReps).toBe(1);
    expect(summary.qualifiedReps).toBe(1);
    expect(result.completedReps).toEqual([
      expect.objectContaining({
        repNumber: 1,
        qualified: true,
        issues: [],
      }),
    ]);
    expect(
      analyzer.analyze(poseFor(170), result.timestamp).completedRep,
    ).toBeNull();
  });

  it("counts a shallow squat but marks the depth issue", () => {
    const analyzer = new SquatAnalyzer();
    const start = calibrate(analyzer);

    const result = feedAndCollect(
      analyzer,
      [
        { angle: 142 },
        { angle: 132 },
        { angle: 122 },
        { angle: 128 },
        { angle: 138 },
        { angle: 150 },
        { angle: 160 },
        { angle: 168 },
        { angle: 168 },
        { angle: 168 },
        { angle: 168 },
      ],
      start,
    );

    const summary = analyzer.getSummary();
    expect(summary.totalReps).toBe(1);
    expect(summary.qualifiedReps).toBe(0);
    expect(summary.issueCounts.depth).toBe(1);
    expect(result.completedReps[0]).toEqual(
      expect.objectContaining({
        repNumber: 1,
        qualified: false,
        issues: expect.arrayContaining(["depth"]),
      }),
    );
  });

  it("marks a fast descent", () => {
    const analyzer = new SquatAnalyzer();
    const start = calibrate(analyzer);

    const result = feedAndCollect(
      analyzer,
      [
        { angle: 140, step: 90 },
        { angle: 112, step: 90 },
        { angle: 96, step: 90 },
        { angle: 104, step: 90 },
        { angle: 120, step: 120 },
        { angle: 145, step: 120 },
        { angle: 160, step: 120 },
        { angle: 168, step: 120 },
        { angle: 168, step: 120 },
        { angle: 168, step: 120 },
        { angle: 168, step: 120 },
      ],
      start,
    );

    const summary = analyzer.getSummary();
    expect(summary.totalReps).toBe(1);
    expect(summary.issueCounts.speed).toBe(1);
    expect(result.completedReps[0]?.issues).toContain("speed");
  });

  it("marks sustained trunk lean but ignores a brief spike", () => {
    const analyzer = new SquatAnalyzer();
    let timestamp = calibrate(analyzer);

    const result = feedAndCollect(
      analyzer,
      [
        { angle: 136, lean: 75, step: 220 },
        { angle: 118, lean: 75, step: 220 },
        { angle: 101, lean: 75, step: 220 },
        { angle: 94, lean: 75, step: 220 },
        { angle: 94, lean: 75, step: 220 },
        { angle: 94, lean: 75, step: 220 },
        { angle: 94, lean: 75, step: 220 },
        { angle: 94, lean: 75, step: 220 },
        { angle: 102, lean: 15, step: 180 },
        { angle: 118, lean: 15, step: 180 },
        { angle: 145, lean: 15, step: 180 },
        { angle: 160, lean: 15, step: 180 },
        { angle: 168, lean: 15, step: 180 },
        { angle: 168, lean: 15, step: 180 },
        { angle: 168, lean: 15, step: 180 },
        { angle: 168, lean: 15, step: 180 },
      ],
      timestamp,
    );
    timestamp = result.timestamp;

    expect(timestamp).toBeGreaterThan(0);
    const summary = analyzer.getSummary();
    expect(summary.totalReps).toBe(1);
    expect(summary.issueCounts.lean).toBe(1);
    expect(result.completedReps[0]?.issues).toContain("lean");
  });

  it("returns every issue when one rep is both shallow and too fast", () => {
    const analyzer = new SquatAnalyzer();
    const start = calibrate(analyzer);

    const result = feedAndCollect(
      analyzer,
      [
        { angle: 136, step: 90 },
        { angle: 126, step: 90 },
        { angle: 120, step: 90 },
        { angle: 126, step: 90 },
        { angle: 140, step: 120 },
        { angle: 155, step: 120 },
        { angle: 168, step: 120 },
        { angle: 168, step: 120 },
        { angle: 168, step: 120 },
        { angle: 168, step: 120 },
      ],
      start,
    );

    expect(result.completedReps).toHaveLength(1);
    expect(result.completedReps[0]?.issues).toEqual(
      expect.arrayContaining(["depth", "speed"]),
    );
  });

  it("gives consecutive completion events unique keys so every result can speak", () => {
    const analyzer = new SquatAnalyzer();
    let timestamp = calibrate(analyzer);
    const completionKeys: string[] = [];
    const sequence = [
      136, 118, 101, 94, 102, 118, 145, 160, 168, 168, 168, 168,
    ];

    for (let rep = 0; rep < 2; rep += 1) {
      for (const angle of sequence) {
        const analysis = analyzer.analyze(poseFor(angle), timestamp);
        const completion = analysis.events.find((event) =>
          event.key.startsWith("rep-complete"),
        );
        if (completion) completionKeys.push(completion.key);
        timestamp += 200;
      }
    }

    expect(completionKeys).toEqual(["rep-complete:1", "rep-complete:2"]);
  });

  it("cues descent before the strict rep threshold and does not count a micro-bend", () => {
    const analyzer = new SquatAnalyzer();
    const timestamp = calibrate(analyzer);

    const cue = analyzer.analyze(poseFor(148), timestamp);
    analyzer.analyze(poseFor(156), timestamp + 100);
    analyzer.analyze(poseFor(168), timestamp + 200);

    expect(cue.phase).toBe("standing");
    expect(cue.events[0]).toEqual(
      expect.objectContaining({
        kind: "phase",
        speechMessage: "下蹲",
      }),
    );
    expect(analyzer.getSummary().totalReps).toBe(0);
  });

  it("uses only current short speech cues through a natural-speed squat", () => {
    const analyzer = new SquatAnalyzer();
    let timestamp = calibrate(analyzer);
    const spoken: string[] = [];

    for (const angle of [148, 135, 112, 98, 108, 128, 155, 168, 168, 168]) {
      const analysis = analyzer.analyze(poseFor(angle), timestamp);
      spoken.push(
        ...analysis.events
          .filter((event) => event.speak)
          .map((event) => event.speechMessage ?? event.message),
      );
      timestamp += 160;
    }

    expect(spoken).toEqual(["下蹲", "起身", "第 1 次，合格"]);
    expect(analyzer.getSummary().totalReps).toBe(1);
  });

  it("expires an abandoned descent cue instead of aging the next rep", () => {
    const analyzer = new SquatAnalyzer();
    let timestamp = calibrate(analyzer);

    analyzer.analyze(poseFor(148), timestamp);
    timestamp += 100;
    for (let index = 0; index < 80; index += 1) {
      analyzer.analyze(poseFor(160), timestamp);
      timestamp += 200;
    }
    for (const angle of [150, 135, 112, 96, 108, 130, 155, 168, 168, 168]) {
      analyzer.analyze(poseFor(angle), timestamp);
      timestamp += 120;
    }

    expect(analyzer.getSummary().totalReps).toBe(1);
  });

  it("emits bottom and ascent cues without requiring a bottom pause", () => {
    const analyzer = new SquatAnalyzer({ riseFrames: 1 });
    let timestamp = calibrate(analyzer);
    const keys: string[] = [];
    for (const angle of [148, 135, 112, 98, 108, 128, 155, 168, 168]) {
      const analysis = analyzer.analyze(poseFor(angle), timestamp);
      keys.push(...analysis.events.map((event) => event.key));
      timestamp += 100;
    }

    expect(keys.some((key) => key.startsWith("phase:bottom"))).toBe(true);
    expect(keys.some((key) => key.startsWith("phase:ascent"))).toBe(true);
  });

  it("reports side, front and oblique view capabilities", () => {
    const analyzer = new SquatAnalyzer({ viewConfirmMs: 0 });
    const confirmView = (
      view: "front" | "side" | "oblique",
      timestamp: number,
    ): string => {
      analyzer.analyze(setWorldView(poseFor(170), view), timestamp);
      return analyzer.analyze(
        setWorldView(poseFor(170), view),
        timestamp + 1,
      ).bodyView;
    };

    expect(confirmView("side", 0)).toBe("side");
    expect(confirmView("front", 100)).toBe("front");
    expect(confirmView("oblique", 200)).toBe("oblique");
  });

  it("detects sustained knee collapse only in a front view", () => {
    const analyzer = new SquatAnalyzer({
      kneeAlignmentPersistMs: 100,
      viewConfirmMs: 100,
    });
    let timestamp = 0;
    for (let index = 0; index < 22; index += 1) {
      const pose = setWorldView(copyLeftSideToRight(poseFor(170)), "front");
      pose.worldLandmarks = [];
      const leftKnee = pose.landmarks[25];
      const rightKnee = pose.landmarks[26];
      const leftAnkle = pose.landmarks[27];
      const rightAnkle = pose.landmarks[28];
      if (leftKnee && rightKnee && leftAnkle && rightAnkle) {
        leftKnee.x = 0.4;
        rightKnee.x = 0.6;
        leftAnkle.x = 0.36;
        rightAnkle.x = 0.64;
      }
      analyzer.analyze(pose, timestamp);
      timestamp += 100;
    }
    for (let index = 0; index < 4; index += 1) {
      const pose = setWorldView(copyLeftSideToRight(poseFor(170)), "front");
      const leftKnee = pose.landmarks[25];
      const rightKnee = pose.landmarks[26];
      const leftAnkle = pose.landmarks[27];
      const rightAnkle = pose.landmarks[28];
      if (leftKnee && rightKnee && leftAnkle && rightAnkle) {
        leftKnee.x = 0.4;
        rightKnee.x = 0.6;
        leftAnkle.x = 0.36;
        rightAnkle.x = 0.64;
      }
      analyzer.analyze(pose, timestamp);
      timestamp += 100;
    }

    const correctionKeys: string[] = [];
    for (const angle of [148, 135, 120, 108, 104, 108, 125, 150, 168, 168, 168]) {
      const pose = setWorldView(copyLeftSideToRight(poseFor(angle)), "front");
      const leftKnee = pose.landmarks[25];
      const rightKnee = pose.landmarks[26];
      const leftAnkle = pose.landmarks[27];
      const rightAnkle = pose.landmarks[28];
      if (leftKnee && rightKnee && leftAnkle && rightAnkle) {
        leftKnee.x = angle >= 145 ? 0.4 : 0.47;
        rightKnee.x = angle >= 145 ? 0.6 : 0.53;
        leftAnkle.x = 0.36;
        rightAnkle.x = 0.64;
      }
      pose.worldLandmarks = setWorldView(
        copyLeftSideToRight(poseFor(angle)),
        "front",
      ).worldLandmarks;
      const analysis = analyzer.analyze(pose, timestamp);
      correctionKeys.push(...analysis.events.map((event) => event.key));
      timestamp += 120;
    }

    expect(correctionKeys).toContain("knees");
    expect(analyzer.getSummary().totalReps).toBe(1);
    expect(analyzer.getSummary().issueCounts.knees).toBe(1);
  });

  it("does not call a naturally narrow but unchanged front stance knee collapse", () => {
    const analyzer = new SquatAnalyzer({
      kneeAlignmentPersistMs: 100,
      viewConfirmMs: 100,
    });
    let timestamp = 0;
    const narrowPose = (angle: number): DetectedPose => {
      const pose = setWorldView(copyLeftSideToRight(poseFor(angle)), "front");
      const leftKnee = pose.landmarks[25];
      const rightKnee = pose.landmarks[26];
      const leftAnkle = pose.landmarks[27];
      const rightAnkle = pose.landmarks[28];
      if (leftKnee && rightKnee && leftAnkle && rightAnkle) {
        leftKnee.x = 0.44;
        rightKnee.x = 0.56;
        leftAnkle.x = 0.4;
        rightAnkle.x = 0.6;
      }
      return pose;
    };
    for (let index = 0; index < 22; index += 1) {
      analyzer.analyze(narrowPose(170), timestamp);
      timestamp += 100;
    }
    for (const angle of [150, 135, 112, 96, 108, 130, 155, 168, 168, 168]) {
      analyzer.analyze(narrowPose(angle), timestamp);
      timestamp += 120;
    }

    expect(analyzer.getSummary().totalReps).toBe(1);
    expect(analyzer.getSummary().issueCounts.knees).toBe(0);
  });

  it("cancels an interrupted rep and requires standing before restarting", () => {
    const analyzer = new SquatAnalyzer();
    let timestamp = calibrate(analyzer);

    timestamp = feed(
      analyzer,
      [
        { angle: 140, step: 180 },
        { angle: 120, step: 180 },
      ],
      timestamp,
    );
    analyzer.analyze(null, timestamp + 1_500);
    analyzer.analyze(poseFor(115), timestamp + 1_650);
    analyzer.analyze(poseFor(165), timestamp + 1_900);

    expect(analyzer.getSummary().totalReps).toBe(0);
  });

  it("does not count a small knee bend as a squat attempt", () => {
    const analyzer = new SquatAnalyzer();
    const start = calibrate(analyzer);

    feed(
      analyzer,
      [
        { angle: 155 },
        { angle: 148 },
        { angle: 143 },
        { angle: 148 },
        { angle: 158 },
        { angle: 168 },
        { angle: 168 },
        { angle: 168 },
      ],
      start,
    );

    expect(analyzer.getSummary().totalReps).toBe(0);
  });

  it("counts only once when angles oscillate near the bottom and lockout", () => {
    const analyzer = new SquatAnalyzer();
    const start = calibrate(analyzer);

    feed(
      analyzer,
      [
        { angle: 134 },
        { angle: 118 },
        { angle: 107 },
        { angle: 112 },
        { angle: 104 },
        { angle: 109 },
        { angle: 102 },
        { angle: 111 },
        { angle: 128 },
        { angle: 148 },
        { angle: 160 },
        { angle: 154 },
        { angle: 162 },
        { angle: 168 },
        { angle: 166 },
        { angle: 168 },
        { angle: 168 },
      ],
      start,
    );

    expect(analyzer.getSummary().totalReps).toBe(1);
  });

  it("does not turn one bottom wobble into an early completed rep", () => {
    const analyzer = new SquatAnalyzer();
    const start = calibrate(analyzer);
    const result = feedAndCollect(
      analyzer,
      [
        { angle: 150, step: 100 },
        { angle: 135, step: 100 },
        { angle: 112, step: 100 },
        { angle: 96, step: 100 },
        { angle: 101, step: 100 },
        { angle: 95, step: 100 },
        { angle: 108, step: 100 },
        { angle: 130, step: 100 },
        { angle: 155, step: 100 },
        { angle: 168, step: 100 },
        { angle: 168, step: 200 },
        { angle: 168, step: 200 },
      ],
      start,
    );

    expect(result.completedReps).toHaveLength(1);
    expect(analyzer.getSummary().totalReps).toBe(1);
  });

  it("ignores a small upward world-angle wobble before a real reversal", () => {
    const analyzer = new SquatAnalyzer();
    let timestamp = calibrate(analyzer);
    const phases: SquatPhase[] = [];
    for (const angle of [150, 135, 120, 122, 105, 90, 106, 130, 155, 168, 168]) {
      const pose = poseFor(angle);
      pose.worldLandmarks = pose.landmarks.map((point) => ({ ...point }));
      const analysis = analyzer.analyze(pose, timestamp);
      phases.push(analysis.phase);
      timestamp += 100;
    }

    expect(phases[3]).not.toBe("ascending");
    expect(analyzer.getSummary().totalReps).toBe(1);
    expect(analyzer.getSummary().issueCounts.depth).toBe(0);
  });

  it("requires consecutive upward evidence before switching to ascent", () => {
    const analyzer = new SquatAnalyzer();
    let timestamp = calibrate(analyzer);
    const phases: SquatPhase[] = [];

    for (const angle of [
      150, 135, 120, 121, 120.8, 121.8, 105, 90, 110, 145, 165, 170,
      170, 170,
    ]) {
      const pose = poseFor(angle);
      pose.worldLandmarks = pose.landmarks.map((point) => ({ ...point }));
      const analysis = analyzer.analyze(pose, timestamp);
      phases.push(analysis.phase);
      timestamp += 100;
    }

    expect(phases[5]).not.toBe("ascending");
    expect(analyzer.getSummary().totalReps).toBe(1);
    expect(analyzer.getSummary().issueCounts.depth).toBe(0);
  });

  it("does not treat a temporary world-to-image fallback as an ascent", () => {
    const analyzer = new SquatAnalyzer();
    let timestamp = calibrate(analyzer);
    const phases: SquatPhase[] = [];
    const worldAngles = [150, 135, 120, null, 105, 90, 110, 145, 165, 170, 170, 170];

    for (const worldAngle of worldAngles) {
      const pose = poseFor(170);
      if (worldAngle !== null) {
        pose.worldLandmarks = poseFor(worldAngle).landmarks.map((point) => ({
          ...point,
        }));
      }
      const analysis = analyzer.analyze(pose, timestamp);
      phases.push(analysis.phase);
      timestamp += 100;
    }

    expect(phases[3]).not.toBe("ascending");
    expect(analyzer.getSummary().totalReps).toBe(1);
    expect(analyzer.getSummary().issueCounts.depth).toBe(0);
  });

  it("establishes the metric source baseline when calibration completes", () => {
    const analyzer = new SquatAnalyzer({
      calibrationMs: 100,
      calibrationMinSamples: 2,
    });
    analyzer.analyze(poseFor(170), 0);
    analyzer.analyze(poseFor(170), 100);

    const firstWorldFrame = poseFor(170);
    firstWorldFrame.worldLandmarks = poseFor(130).landmarks.map((point) => ({
      ...point,
    }));
    const analysis = analyzer.analyze(firstWorldFrame, 200);

    expect(analysis.phase).toBe("standing");
    expect(analyzer.getSummary().totalReps).toBe(0);
  });

  it.each([30, 50, 100, 200, 300])(
    "keeps fast squat cue order and speed result at %dms sampling",
    (step) => {
      const analyzer = new SquatAnalyzer();
      let timestamp = calibrate(analyzer);
      const keys: string[] = [];
      const sequence = [150, 135, 112, 95, 108, 130, 155, 168, 168];
      for (const angle of sequence) {
        const analysis = analyzer.analyze(poseFor(angle), timestamp);
        keys.push(...analysis.events.map((event) => event.key));
        timestamp += step;
      }
      const deadline = timestamp + 2_000;
      while (analyzer.getSummary().totalReps === 0 && timestamp < deadline) {
        const analysis = analyzer.analyze(poseFor(168), timestamp);
        keys.push(...analysis.events.map((event) => event.key));
        timestamp += Math.max(step, 100);
      }

      const downIndex = keys.findIndex((key) => key.startsWith("phase:descent"));
      const bottomIndex = keys.findIndex((key) => key.startsWith("phase:bottom"));
      const ascentIndex = keys.findIndex((key) => key.startsWith("phase:ascent"));
      expect(downIndex).toBeGreaterThanOrEqual(0);
      expect(bottomIndex).toBeGreaterThan(downIndex);
      expect(ascentIndex).toBeGreaterThan(bottomIndex);
      expect(analyzer.getSummary().totalReps).toBe(1);
      if (step <= 100) {
        expect(analyzer.getSummary().issueCounts.speed).toBe(1);
      }
    },
  );

  it("uses the camera aspect ratio when analyzing a widescreen pose", () => {
    const analyzer = new SquatAnalyzer();
    let timestamp = 0;
    for (let index = 0; index < 22; index += 1) {
      analyzer.analyze(widePoseFor(170), timestamp);
      timestamp += 100;
    }

    for (const angle of [142, 126, 108, 94, 99, 112, 132, 150, 160, 168, 168, 168, 168]) {
      analyzer.analyze(widePoseFor(angle), timestamp);
      timestamp += 200;
    }

    expect(analyzer.getSummary().totalReps).toBe(1);
  });

  it("captures a raw 2D minimum on the same frame a sparse rep starts", () => {
    const analyzer = new SquatAnalyzer();
    let timestamp = calibrate(analyzer);
    const keys: string[] = [];
    for (const angle of [150, 95, 125, 160, 168, 168, 168]) {
      const analysis = analyzer.analyze(poseFor(angle), timestamp);
      keys.push(...analysis.events.map((event) => event.key));
      timestamp += 300;
    }

    expect(keys.some((key) => key.startsWith("phase:bottom"))).toBe(true);
    expect(analyzer.getSummary().totalReps).toBe(1);
    expect(analyzer.getSummary().issueCounts.depth).toBe(0);
  });

  it("does not let a hidden heel or foot tip block squat analysis", () => {
    const analyzer = new SquatAnalyzer();
    let timestamp = calibrate(analyzer);

    for (const angle of [136, 118, 101, 94, 102, 118, 145, 160, 168, 168, 168, 168]) {
      const pose = poseFor(angle);
      const heel = pose.landmarks[29];
      const foot = pose.landmarks[31];
      if (heel) heel.visibility = 0.1;
      if (foot) foot.visibility = 0.1;
      analyzer.analyze(pose, timestamp);
      timestamp += 200;
    }

    expect(analyzer.getSummary().totalReps).toBe(1);
  });

  it("keeps the current phase through a brief core-landmark dropout", () => {
    const analyzer = new SquatAnalyzer();
    const timestamp = calibrate(analyzer);
    const incompletePose = poseFor(120);
    const ankle = incompletePose.landmarks[27];
    if (ankle) {
      ankle.visibility = 0;
    }

    const briefDropout = analyzer.analyze(incompletePose, timestamp);

    expect(briefDropout.phase).not.toBe("paused");
    expect(briefDropout.trackingState).toBe("grace");
  });

  it("pauses only after a core landmark stays unreliable beyond the grace period", () => {
    const analyzer = new SquatAnalyzer();
    const timestamp = calibrate(analyzer);
    const incompletePose = poseFor(120);
    const ankle = incompletePose.landmarks[27];
    if (ankle) ankle.visibility = 0.1;

    const firstFrame = analyzer.analyze(incompletePose, timestamp);
    const persistentDropout = analyzer.analyze(incompletePose, timestamp + 400);

    expect(firstFrame.phase).not.toBe("paused");
    expect(persistentDropout.phase).toBe("paused");
    expect(persistentDropout.events[0]?.message).toBe(
      "关键点暂时不稳定，请调整朝向或稍微放慢动作",
    );
  });

  it("uses the edge prompt only when the detected body is actually near an edge", () => {
    const analyzer = new SquatAnalyzer();
    const timestamp = calibrate(analyzer);
    const edgePose = poseFor(120);
    const shoulder = edgePose.landmarks[11];
    if (shoulder) {
      shoulder.x = 0.01;
      shoulder.visibility = 0.1;
    }

    analyzer.analyze(edgePose, timestamp);
    const analysis = analyzer.analyze(edgePose, timestamp + 400);

    expect(analysis.events[0]?.message).toBe(
      "身体靠近画面边缘，请稍微后退一点",
    );
  });

  it("does not blame a low-confidence ankle on a visible foot near the bottom", () => {
    const analyzer = new SquatAnalyzer();
    const timestamp = calibrate(analyzer);
    const pose = poseFor(120);
    const ankle = pose.landmarks[27];
    const foot = pose.landmarks[31];
    if (ankle) ankle.visibility = 0.1;
    if (foot) foot.y = 0.99;

    analyzer.analyze(pose, timestamp);
    const analysis = analyzer.analyze(pose, timestamp + 400);

    expect(analysis.events[0]?.message).toBe(
      "关键点暂时不稳定，请调整朝向或稍微放慢动作",
    );
  });

  it("does not blame one unstable core point on a different point near the edge", () => {
    const analyzer = new SquatAnalyzer();
    const timestamp = calibrate(analyzer);
    const pose = poseFor(120);
    const hip = pose.landmarks[23];
    const ankle = pose.landmarks[27];
    if (hip) hip.visibility = 0.1;
    if (ankle) ankle.y = 0.98;

    analyzer.analyze(pose, timestamp);
    const analysis = analyzer.analyze(pose, timestamp + 400);

    expect(analysis.events[0]?.message).toBe(
      "关键点暂时不稳定，请调整朝向或稍微放慢动作",
    );
  });

  it("switches to the clearer side while standing after sustained occlusion", () => {
    const analyzer = new SquatAnalyzer();
    const timestamp = calibrate(analyzer);
    const pose = copyLeftSideToRight(poseFor(170));
    const leftAnkle = pose.landmarks[27];
    if (leftAnkle) leftAnkle.visibility = 0.44;
    for (const index of [12, 24, 26, 28]) {
      const point = pose.landmarks[index];
      if (point) point.visibility = 0.5;
    }

    const firstFrame = analyzer.analyze(pose, timestamp);
    const switched = analyzer.analyze(pose, timestamp + 400);

    expect(firstFrame.trackingState).toBe("grace");
    expect(switched.trackingState).toBe("stable");
    expect(switched.side).toBe("right");
  });

  it("switches sides safely during a rep when the locked side stays occluded", () => {
    const analyzer = new SquatAnalyzer();
    let timestamp = calibrate(analyzer);

    timestamp = feed(
      analyzer,
      [
        { angle: 136, step: 200 },
        { angle: 118, step: 200 },
      ],
      timestamp,
    );

    const occluded = copyLeftSideToRight(poseFor(108));
    const leftAnkle = occluded.landmarks[27];
    if (leftAnkle) leftAnkle.visibility = 0.1;
    analyzer.analyze(occluded, timestamp);
    const switched = analyzer.analyze(occluded, timestamp + 400);

    expect(switched.trackingState).toBe("stable");
    expect(switched.side).toBe("right");
    expect(switched.phase).not.toBe("paused");

    timestamp += 600;
    for (const angle of [96, 104, 120, 145, 160, 168, 168, 168]) {
      const pose = copyLeftSideToRight(poseFor(angle));
      const hiddenLeftAnkle = pose.landmarks[27];
      if (hiddenLeftAnkle) hiddenLeftAnkle.visibility = 0.1;
      analyzer.analyze(pose, timestamp);
      timestamp += 200;
    }

    expect(analyzer.getSummary().totalReps).toBe(1);
  });

  it("drops stale smoothing history when switching to a previously noisy side", () => {
    const analyzer = new SquatAnalyzer();
    let timestamp = calibrate(analyzer);

    for (const angle of [136, 118]) {
      const pose = poseFor(angle);
      const noisyRight = [
        [12, 0.1, 0.1],
        [24, 0.1, 0.9],
        [26, 0.9, 0.1],
        [28, 0.9, 0.9],
      ] as const;
      for (const [index, x, y] of noisyRight) {
        const point = pose.landmarks[index];
        if (point) {
          point.x = x;
          point.y = y;
          point.visibility = 0.1;
        }
      }
      analyzer.analyze(pose, timestamp);
      timestamp += 200;
    }

    const switchPose = copyLeftSideToRight(poseFor(108));
    const leftAnkle = switchPose.landmarks[27];
    if (leftAnkle) leftAnkle.visibility = 0.1;
    analyzer.analyze(switchPose, timestamp);
    const switched = analyzer.analyze(switchPose, timestamp + 400);

    expect(switched.trackingState).toBe("stable");
    expect(switched.side).toBe("right");
    expect(switched.kneeAngle).toBeCloseTo(108, 0);
  });

  it("does not let a low-confidence coordinate pollute the recovery frame", () => {
    const analyzer = new SquatAnalyzer();
    const timestamp = calibrate(analyzer);
    const badFrame = poseFor(170);
    const ankle = badFrame.landmarks[27];
    if (ankle) {
      ankle.visibility = 0.1;
      ankle.x = 0.02;
      ankle.y = 0.02;
    }

    analyzer.analyze(badFrame, timestamp);
    const recovered = analyzer.analyze(poseFor(170), timestamp + 200);

    expect(recovered.trackingState).toBe("stable");
    expect(recovered.phase).toBe("standing");
    expect(recovered.kneeAngle).toBeGreaterThan(155);
  });

  it("skips grace when the first missing pose arrives after a long gap", () => {
    const analyzer = new SquatAnalyzer();
    const timestamp = calibrate(analyzer);

    const analysis = analyzer.analyze(null, timestamp + 600);

    expect(analysis.trackingState).toBe("lost");
    expect(analysis.phase).toBe("paused");
    expect(analysis.events[0]?.message).toBe(
      "没有稳定识别到人体，请站到画面中央并保持全身入镜",
    );
  });

  it("expires tracking when total time since the last valid frame exceeds the limit", () => {
    const analyzer = new SquatAnalyzer();
    let timestamp = calibrate(analyzer);
    timestamp = feed(
      analyzer,
      [
        { angle: 136, step: 200 },
        { angle: 118, step: 200 },
      ],
      timestamp,
    );

    const lastValidTimestamp = timestamp - 200;
    const firstMissing = analyzer.analyze(null, lastValidTimestamp + 400);
    const expired = analyzer.analyze(null, lastValidTimestamp + 550);

    expect(firstMissing.trackingState).toBe("grace");
    expect(expired.trackingState).toBe("lost");
    expect(expired.phase).toBe("paused");
  });

  it("keeps counting at a sustained low inference frame rate", () => {
    const analyzer = new SquatAnalyzer();
    const timestamp = calibrate(analyzer);

    feed(
      analyzer,
      [136, 118, 100, 94, 102, 120, 145, 160, 168, 168, 168, 168].map(
        (angle) => ({ angle, step: 300 }),
      ),
      timestamp,
    );

    const summary = analyzer.getSummary();
    expect(summary.totalReps).toBe(1);
    expect(summary.averageTempoSeconds).toBeGreaterThan(1);
  });

  it("restarts an unfinished calibration after a long tracking loss", () => {
    const analyzer = new SquatAnalyzer();
    let timestamp = 0;
    for (let index = 0; index < 12; index += 1) {
      analyzer.analyze(poseFor(170), timestamp);
      timestamp += 100;
    }

    analyzer.analyze(null, timestamp + 600);
    const recovered = analyzer.analyze(poseFor(170), timestamp + 700);

    expect(recovered.calibrated).toBe(false);
    expect(recovered.phase).toBe("calibrating");
  });

  it("requires fresh stable lockout time after a brief tracking dropout", () => {
    const analyzer = new SquatAnalyzer();
    let timestamp = calibrate(analyzer);
    timestamp = feed(
      analyzer,
      [
        { angle: 136 },
        { angle: 118 },
        { angle: 100 },
        { angle: 95 },
        { angle: 104 },
        { angle: 120 },
        { angle: 145 },
        { angle: 160 },
      ],
      timestamp,
    );

    let lockoutFrame = analyzer.analyze(poseFor(168), timestamp);
    for (let index = 0; index < 20; index += 1) {
      if (
        lockoutFrame.phase === "ascending" &&
        (lockoutFrame.kneeAngle ?? 0) >= 155
      ) {
        break;
      }
      timestamp += 70;
      lockoutFrame = analyzer.analyze(poseFor(168), timestamp);
    }
    expect(lockoutFrame.phase).toBe("ascending");
    expect(lockoutFrame.kneeAngle).toBeGreaterThanOrEqual(155);

    const dropout = poseFor(168);
    const ankle = dropout.landmarks[27];
    if (ankle) ankle.visibility = 0.1;
    analyzer.analyze(dropout, timestamp + 70);
    const recovered = analyzer.analyze(poseFor(168), timestamp + 270);

    expect(recovered.totalReps).toBe(0);
    const relocked = analyzer.analyze(poseFor(168), timestamp + 470);
    expect(relocked.totalReps).toBe(1);
  });

  it("excludes a brief tracking pause from the recorded rep tempo", () => {
    const runRep = (pauseMs: number): number => {
      const analyzer = new SquatAnalyzer();
      let timestamp = calibrate(analyzer);
      timestamp = feed(
        analyzer,
        [
          { angle: 136, step: 200 },
          { angle: 118, step: 200 },
        ],
        timestamp,
      );

      if (pauseMs > 0) {
        analyzer.analyze(null, timestamp);
      }
      const offset = pauseMs;
      timestamp += offset;
      timestamp = feed(
        analyzer,
        [
          { angle: 100 },
          { angle: 95 },
          { angle: 104 },
          { angle: 120 },
          { angle: 145 },
          { angle: 160 },
          { angle: 168 },
          { angle: 168 },
          { angle: 168 },
          { angle: 168 },
        ],
        timestamp,
      );

      expect(timestamp).toBeGreaterThan(0);
      const summary = analyzer.getSummary();
      expect(summary.totalReps).toBe(1);
      return summary.averageTempoSeconds ?? 0;
    };

    expect(runRep(300)).toBeCloseTo(runRep(0), 1);
  });
});
