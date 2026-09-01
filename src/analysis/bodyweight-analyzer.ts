import type {
  BodySide,
  BodyView,
  BodyweightPhase,
  CoachEvent,
  CompletedRep,
  DetectedPose,
  ExerciseAnalyzer,
  FrameAnalysis,
  IssueKey,
  PoseLandmark,
  RepRecord,
  SessionSummary,
} from "../types";
import {
  LANDMARK_INDEX,
  angleAt,
  angleAt3D,
  estimateBodyView,
  trunkLeanFromVertical,
} from "./geometry";

export type FirstBatchExerciseId =
  | "reverse-lunge"
  | "calf-raise"
  | "high-knees"
  | "push-up"
  | "plank"
  | "knee-push-up"
  | "mountain-climber"
  | "shoulder-tap"
  | "side-plank"
  | "burpee"
  | "side-lunge"
  | "glute-bridge"
  | "bird-dog"
  | "single-leg-deadlift"
  | "dead-bug";

interface MovementMetrics {
  visibility: number;
  side: BodySide | null;
  bodyView: BodyView;
  kneeAngle: number | null;
  elbowAngle: number | null;
  trunkLean: number | null;
  bodyDeviation: number | null;
  heelGap: number | null;
  shoulderX: number | null;
  leftKneeHeight: number | null;
  rightKneeHeight: number | null;
  horizontalBody: boolean;
  leftKneeToShoulder: number | null;
  rightKneeToShoulder: number | null;
  leftWristToOppositeShoulder: number | null;
  rightWristToOppositeShoulder: number | null;
  leftKneeAngle: number | null;
  rightKneeAngle: number | null;
  bridgeAngle: number | null;
  torsoHorizontal: boolean;
  leftWristReach: number | null;
  rightWristReach: number | null;
  leftAnkleReach: number | null;
  rightAnkleReach: number | null;
}

const MIN_VISIBILITY = 0.45;
const TRACKING_GRACE_MS = 350;
const CALIBRATION_MS = 500;
const REACQUIRE_MS = 300;

function point(points: PoseLandmark[], index: number): PoseLandmark | null {
  return points[index] ?? null;
}

function minimumVisibility(points: PoseLandmark[], indices: number[]): number {
  if (points.length < 33) return 0;
  return Math.min(...indices.map((index) => points[index]?.visibility ?? 0));
}

function sideIndices(side: BodySide, includeArm = false): number[] {
  const index = LANDMARK_INDEX[side];
  const result: number[] = [index.shoulder, index.hip, index.knee, index.ankle];
  if (includeArm) {
    result.push(side === "left" ? 13 : 14, side === "left" ? 15 : 16);
  }
  return result;
}

function bestSide(points: PoseLandmark[], includeArm = false): BodySide {
  const left = minimumVisibility(points, sideIndices("left", includeArm));
  const right = minimumVisibility(points, sideIndices("right", includeArm));
  return right > left ? "right" : "left";
}

function angle(
  pose: DetectedPose,
  first: number,
  middle: number,
  last: number,
): number | null {
  const imagePoints = [
    point(pose.landmarks, first),
    point(pose.landmarks, middle),
    point(pose.landmarks, last),
  ];
  if (imagePoints.some((candidate) => candidate === null)) return null;
  const [imageFirst, imageMiddle, imageLast] = imagePoints as [
    PoseLandmark,
    PoseLandmark,
    PoseLandmark,
  ];
  const worldPoints = [
    point(pose.worldLandmarks, first),
    point(pose.worldLandmarks, middle),
    point(pose.worldLandmarks, last),
  ];
  if (
    worldPoints.every((candidate) => candidate !== null) &&
    worldPoints.some((candidate) =>
      Math.abs(candidate?.x ?? 0) + Math.abs(candidate?.y ?? 0) + Math.abs(candidate?.z ?? 0) > 0.03
    )
  ) {
    const [worldFirst, worldMiddle, worldLast] = worldPoints as [
      PoseLandmark,
      PoseLandmark,
      PoseLandmark,
    ];
    return angleAt3D(worldFirst, worldMiddle, worldLast);
  }
  return angleAt(imageFirst, imageMiddle, imageLast, pose.aspectRatio);
}

export class BodyweightAnalyzer implements ExerciseAnalyzer {
  private phase: BodyweightPhase = "calibrating";
  private calibrated = false;
  private calibrationStartedAt: number | null = null;
  private lastValidAt: number | null = null;
  private lastTimestamp: number | null = null;
  private lastMetrics: MovementMetrics | null = null;
  private baselineHeelGap: number | null = null;
  private baselineShoulderX: number | null = null;
  private records: RepRecord[] = [];
  private currentIssues = new Set<IssueKey>();
  private repStartedAt: number | null = null;
  private minPrimary = Number.POSITIVE_INFINITY;
  private maxPrimary = Number.NEGATIVE_INFINITY;
  private previousPrimary: number | null = null;
  private completedRep: CompletedRep | null = null;
  private activeLiftSide: BodySide | null = null;
  private activeLiftQualified = false;
  private activeRangeCueSent = false;
  private reachedFloorPosition = false;
  private validHoldMs = 0;
  private holdIssueActive = false;
  private plankIssueCount = 0;
  private reacquireStartedAt: number | null = null;
  private now = 0;

  constructor(private readonly exerciseId: FirstBatchExerciseId) {}

  reset(): void {
    this.phase = "calibrating";
    this.calibrated = false;
    this.calibrationStartedAt = null;
    this.lastValidAt = null;
    this.lastTimestamp = null;
    this.lastMetrics = null;
    this.baselineHeelGap = null;
    this.baselineShoulderX = null;
    this.records = [];
    this.currentIssues.clear();
    this.repStartedAt = null;
    this.minPrimary = Number.POSITIVE_INFINITY;
    this.maxPrimary = Number.NEGATIVE_INFINITY;
    this.previousPrimary = null;
    this.completedRep = null;
    this.activeLiftSide = null;
    this.activeLiftQualified = false;
    this.activeRangeCueSent = false;
    this.reachedFloorPosition = false;
    this.validHoldMs = 0;
    this.holdIssueActive = false;
    this.plankIssueCount = 0;
    this.reacquireStartedAt = null;
    this.now = 0;
  }

  analyze(pose: DetectedPose | null, timestamp: number): FrameAnalysis {
    this.now = timestamp;
    this.completedRep = null;
    const frameDelta = this.lastTimestamp === null
      ? 0
      : Math.max(0, Math.min(250, timestamp - this.lastTimestamp));
    this.lastTimestamp = timestamp;

    if (!pose) return this.trackingLoss(timestamp);
    const metrics = this.metrics(pose);
    if (!metrics || metrics.visibility < MIN_VISIBILITY) {
      return this.trackingLoss(timestamp, metrics ?? undefined);
    }

    this.lastValidAt = timestamp;
    this.lastMetrics = metrics;
    if (!this.calibrated) return this.calibrate(metrics, timestamp);
    if (this.phase === "paused" && !this.isTimedHold()) {
      if (!this.startPositionReady(metrics)) {
        this.reacquireStartedAt = null;
        return this.analysis(metrics, "识别已恢复｜先回到起始姿势", [], "stable");
      }
      this.reacquireStartedAt ??= timestamp;
      if (timestamp - this.reacquireStartedAt < REACQUIRE_MS) {
        return this.analysis(metrics, "保持起始姿势｜正在重新确认", [], "stable");
      }
      this.phase = this.startsOnFloor() ? "plank" : "standing";
      this.previousPrimary = this.primaryMetric(metrics);
      this.reacquireStartedAt = null;
      return this.analysis(
        metrics,
        "识别已恢复｜按自己的节奏继续",
        [],
        "stable",
      );
    }

    const events: CoachEvent[] = [];
    if (this.exerciseId === "reverse-lunge") {
      this.analyzeLunge(metrics, timestamp, events);
    } else if (this.exerciseId === "calf-raise") {
      this.analyzeCalfRaise(metrics, timestamp, events);
    } else if (this.exerciseId === "high-knees") {
      this.analyzeHighKnees(metrics, timestamp, events);
    } else if (this.exerciseId === "push-up" || this.exerciseId === "knee-push-up") {
      this.analyzePushUp(metrics, timestamp, events);
    } else if (this.exerciseId === "plank" || this.exerciseId === "side-plank") {
      this.analyzePlank(metrics, frameDelta, events);
    } else if (this.exerciseId === "mountain-climber") {
      this.analyzeMountainClimber(metrics, timestamp, events);
    } else if (this.exerciseId === "shoulder-tap") {
      this.analyzeShoulderTap(metrics, timestamp, events);
    } else if (this.exerciseId === "burpee") {
      this.analyzeBurpee(metrics, timestamp, events);
    } else if (this.exerciseId === "side-lunge") {
      this.analyzeSideLunge(metrics, timestamp, events);
    } else if (this.exerciseId === "glute-bridge") {
      this.analyzeGluteBridge(metrics, timestamp, events);
    } else if (this.exerciseId === "bird-dog") {
      this.analyzeBirdDog(metrics, timestamp, events);
    } else if (this.exerciseId === "single-leg-deadlift") {
      this.analyzeSingleLegDeadlift(metrics, timestamp, events);
    } else {
      this.analyzeDeadBug(metrics, timestamp, events);
    }

    return this.analysis(metrics, this.statusMessage(), events, "stable");
  }

  getSummary(endedAt = new Date()): SessionSummary {
    const issueCounts: Partial<Record<IssueKey, number>> = {};
    for (const record of this.records) {
      for (const issue of record.issues) {
        issueCounts[issue] = (issueCounts[issue] ?? 0) + 1;
      }
    }
    if (
      (this.exerciseId === "plank" || this.exerciseId === "side-plank") &&
      this.plankIssueCount > 0
    ) {
      issueCounts["body-line"] = this.plankIssueCount;
    }
    return {
      id: `${endedAt.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      endedAt: endedAt.toISOString(),
      exerciseId: this.exerciseId,
      totalReps: this.isTimedHold()
        ? Math.floor(this.validHoldMs / 1_000)
        : this.records.length,
      qualifiedReps: this.isTimedHold()
        ? Math.floor(this.validHoldMs / 1_000)
        : this.records.filter((record) => record.qualified).length,
      averageTempoSeconds: this.isTimedHold()
        ? null
        : this.records.length
          ? this.records.reduce((total, record) => total + record.durationMs, 0) /
            this.records.length /
            1_000
          : null,
      issueCounts,
      measurementMode: this.isTimedHold() ? "timed-hold" : "repetitions",
      validDurationMs: this.isTimedHold() ? this.validHoldMs : null,
    };
  }

  private metrics(pose: DetectedPose): MovementMetrics | null {
    const includeArm = [
      "push-up", "plank", "knee-push-up", "mountain-climber",
      "shoulder-tap", "side-plank", "burpee", "bird-dog", "dead-bug",
    ].includes(this.exerciseId);
    const side = bestSide(pose.landmarks, includeArm);
    const indices = LANDMARK_INDEX[side];
    const needsBothSides = [
      "high-knees", "mountain-climber", "shoulder-tap", "side-lunge",
      "bird-dog", "dead-bug",
    ]
      .includes(this.exerciseId);
    const required = this.exerciseId === "high-knees" || this.exerciseId === "side-lunge"
      ? [11, 12, 23, 24, 25, 26, 27, 28]
      : needsBothSides
        ? [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
      : sideIndices(side, includeArm);
    if (this.exerciseId === "calf-raise") {
      required.push(indices.heel, indices.foot);
    }
    if (this.exerciseId === "plank" || this.exerciseId === "side-plank") {
      required.push(side === "left" ? 13 : 14);
    }
    const visibility = minimumVisibility(pose.landmarks, required);
    const shoulder = point(pose.landmarks, indices.shoulder);
    const hip = point(pose.landmarks, indices.hip);
    const knee = point(pose.landmarks, indices.knee);
    const ankle = point(pose.landmarks, indices.ankle);
    if (!shoulder || !hip || !knee || !ankle) return null;

    const torsoLength = Math.max(
      0.05,
      Math.hypot(
        (shoulder.x - hip.x) * pose.aspectRatio,
        shoulder.y - hip.y,
      ),
    );
    const bodyEnd = this.exerciseId === "knee-push-up" ? knee : ankle;
    const bodyEndIndex = this.exerciseId === "knee-push-up"
      ? indices.knee
      : indices.ankle;
    const bodyHorizontalShare =
      Math.abs(shoulder.x - bodyEnd.x) * pose.aspectRatio /
      Math.max(
        0.05,
        Math.hypot(
          (shoulder.x - bodyEnd.x) * pose.aspectRatio,
          shoulder.y - bodyEnd.y,
        ),
      );
    const bodyAngle = angle(pose, indices.shoulder, indices.hip, bodyEndIndex);
    const heel = point(pose.landmarks, indices.heel);
    const foot = point(pose.landmarks, indices.foot);
    const heelGap = heel && foot
      ? (foot.y - heel.y) / Math.max(0.08, Math.abs(hip.y - ankle.y))
      : null;
    const leftHip = point(pose.landmarks, 23);
    const rightHip = point(pose.landmarks, 24);
    const leftKnee = point(pose.landmarks, 25);
    const rightKnee = point(pose.landmarks, 26);
    const leftShoulder = point(pose.landmarks, 11);
    const rightShoulder = point(pose.landmarks, 12);
    const leftWrist = point(pose.landmarks, 15);
    const rightWrist = point(pose.landmarks, 16);
    const leftAnkle = point(pose.landmarks, 27);
    const rightAnkle = point(pose.landmarks, 28);
    const normalizedDistance = (
      first: PoseLandmark | null,
      second: PoseLandmark | null,
    ): number | null => first && second
      ? Math.hypot(
        (first.x - second.x) * pose.aspectRatio,
        first.y - second.y,
      ) / torsoLength
      : null;
    return {
      visibility,
      side,
      bodyView: estimateBodyView(
        pose.landmarks,
        pose.worldLandmarks,
        MIN_VISIBILITY,
        pose.aspectRatio,
      ),
      kneeAngle: angle(pose, indices.hip, indices.knee, indices.ankle),
      elbowAngle: angle(
        pose,
        indices.shoulder,
        side === "left" ? 13 : 14,
        side === "left" ? 15 : 16,
      ),
      trunkLean: trunkLeanFromVertical(shoulder, hip, pose.aspectRatio),
      bodyDeviation: bodyAngle === null ? null : Math.abs(180 - bodyAngle),
      heelGap,
      shoulderX: shoulder.x,
      leftKneeHeight: leftHip && leftKnee
        ? (leftHip.y - leftKnee.y) / torsoLength
        : null,
      rightKneeHeight: rightHip && rightKnee
        ? (rightHip.y - rightKnee.y) / torsoLength
        : null,
      horizontalBody: bodyHorizontalShare >= 0.62,
      leftKneeToShoulder: normalizedDistance(leftKnee, leftShoulder),
      rightKneeToShoulder: normalizedDistance(rightKnee, rightShoulder),
      leftWristToOppositeShoulder: normalizedDistance(leftWrist, rightShoulder),
      rightWristToOppositeShoulder: normalizedDistance(rightWrist, leftShoulder),
      leftKneeAngle: angle(pose, 23, 25, 27),
      rightKneeAngle: angle(pose, 24, 26, 28),
      bridgeAngle: angle(pose, indices.shoulder, indices.hip, indices.knee),
      torsoHorizontal: Math.abs(shoulder.x - hip.x) * pose.aspectRatio /
        Math.max(
          0.05,
          Math.hypot(
            (shoulder.x - hip.x) * pose.aspectRatio,
            shoulder.y - hip.y,
          ),
        ) >= 0.72,
      leftWristReach: normalizedDistance(leftWrist, leftShoulder),
      rightWristReach: normalizedDistance(rightWrist, rightShoulder),
      leftAnkleReach: normalizedDistance(leftAnkle, leftHip),
      rightAnkleReach: normalizedDistance(rightAnkle, rightHip),
    };
  }

  private calibrate(metrics: MovementMetrics, timestamp: number): FrameAnalysis {
    const startReady = this.startPositionReady(metrics);
    if (!startReady) {
      this.calibrationStartedAt = null;
      return this.analysis(metrics, this.calibrationPrompt(), [], "stable");
    }
    this.calibrationStartedAt ??= timestamp;
    if (timestamp - this.calibrationStartedAt < CALIBRATION_MS) {
      return this.analysis(metrics, "保持起始姿势，正在校准", [], "stable");
    }

    this.calibrated = true;
    this.phase = this.isTimedHold()
        ? "holding"
        : this.startsOnFloor()
          ? "plank"
          : "standing";
    this.baselineHeelGap = metrics.heelGap;
    this.baselineShoulderX = metrics.shoulderX;
    this.previousPrimary = this.primaryMetric(metrics);
    return this.analysis(
      metrics,
      this.isTimedHold() ? "姿势稳定，开始累计有效时间" : "校准完成｜按自己的节奏开始",
      [this.event("status", "ready", "校准完成，可以开始", "可以开始", 900, true)],
      "stable",
    );
  }

  private startPositionReady(metrics: MovementMetrics): boolean {
    if (this.exerciseId === "glute-bridge") {
      return metrics.torsoHorizontal &&
        (metrics.bridgeAngle ?? 180) >= 75 &&
        (metrics.bridgeAngle ?? 180) <= 145;
    }
    if (this.exerciseId === "bird-dog" || this.exerciseId === "dead-bug") {
      return metrics.torsoHorizontal;
    }
    if (this.startsOnFloor() || this.isTimedHold()) {
      return metrics.horizontalBody &&
        (metrics.bodyDeviation ?? 180) <= 24 &&
        (this.isTimedHold() || (metrics.elbowAngle ?? 0) >= 145);
    }
    return !metrics.horizontalBody && (metrics.kneeAngle ?? 0) >= 150;
  }

  private calibrationPrompt(): string {
    if (this.exerciseId === "push-up") return "请从侧面进入高位俯卧撑姿势";
    if (this.exerciseId === "knee-push-up") return "请从侧面进入跪姿俯卧撑起始位";
    if (this.exerciseId === "mountain-climber") return "请从侧面进入登山跑高位支撑";
    if (this.exerciseId === "shoulder-tap") return "请正面进入高位支撑，双手落地";
    if (this.exerciseId === "side-plank") return "请从侧面进入侧平板支撑姿势";
    if (this.exerciseId === "plank") return "请从侧面进入平板支撑姿势";
    if (this.exerciseId === "glute-bridge") return "请侧面仰卧屈膝，双脚踩稳地面";
    if (this.exerciseId === "bird-dog") return "请侧面进入四点支撑，双手双膝着地";
    if (this.exerciseId === "dead-bug") return "请侧面仰卧，双手上举并屈膝";
    if (this.exerciseId === "high-knees") return "请正面站直，双脚自然落地";
    return "请站直并保持全身和双脚入镜";
  }

  private analyzeLunge(
    metrics: MovementMetrics,
    timestamp: number,
    events: CoachEvent[],
  ): void {
    const knee = metrics.kneeAngle ?? 180;
    const previous = this.previousPrimary ?? knee;
    if (this.phase === "standing" && knee < 145) {
      this.startRep(timestamp, knee);
      this.phase = "descending";
      events.push(this.event("phase", "phase:down", "正在下沉｜前脚踩稳", "下沉，前脚踩稳", 450, true));
    } else if (this.repStartedAt !== null) {
      this.minPrimary = Math.min(this.minPrimary, knee);
      if ((metrics.trunkLean ?? 0) > 32) {
        this.currentIssues.add("stability");
        events.push(this.event("correction", "stability", "抬起胸口｜前脚继续踩稳", "抬起胸口，前脚踩稳", 700));
      }
      if (knee <= 112 && this.phase === "descending") {
        this.phase = "bottom";
      }
      if ((this.phase === "descending" || this.phase === "bottom") && knee - previous >= 5) {
        this.phase = "ascending";
        events.push(this.event("phase", "phase:up", "正在回正｜臀腿发力", "回正，臀腿发力", 450, true));
      }
      if (this.phase === "ascending" && knee >= 155) {
        if (this.minPrimary > 112) this.currentIssues.add("range");
        this.finishRep(timestamp, events);
        this.phase = "standing";
      }
    }
    this.previousPrimary = knee;
  }

  private analyzeCalfRaise(
    metrics: MovementMetrics,
    timestamp: number,
    events: CoachEvent[],
  ): void {
    const lift = (metrics.heelGap ?? 0) - (this.baselineHeelGap ?? 0);
    const previous = this.previousPrimary ?? lift;
    if (this.phase === "standing" && lift >= 0.025) {
      this.startRep(timestamp, lift);
      this.phase = "lifting";
      events.push(this.event("phase", "phase:lift", "脚跟向上抬｜身体保持稳定", "脚跟抬高", 420, true));
    } else if (this.repStartedAt !== null) {
      this.maxPrimary = Math.max(this.maxPrimary, lift);
      if ((metrics.kneeAngle ?? 180) < 155) {
        this.currentIssues.add("alignment");
        events.push(this.event("correction", "alignment", "膝盖保持伸直｜不要屈膝借力", "膝盖保持伸直", 700));
      }
      if (
        this.baselineShoulderX !== null &&
        metrics.shoulderX !== null &&
        Math.abs(metrics.shoulderX - this.baselineShoulderX) > 0.045
      ) {
        this.currentIssues.add("stability");
        events.push(this.event("correction", "stability", "身体左右晃动｜收紧核心稳住", "先稳住身体", 700));
      }
      if (lift >= 0.055) this.phase = "top";
      if ((this.phase === "lifting" || this.phase === "top") && previous - lift >= 0.012) {
        this.phase = "lowering";
        events.push(this.event("phase", "phase:lower", "控制脚跟落下", "慢慢落下", 420, true));
      }
      if (this.phase === "lowering" && lift <= 0.012) {
        if (this.maxPrimary < 0.05) this.currentIssues.add("range");
        this.finishRep(timestamp, events);
        this.phase = "standing";
      }
    }
    this.previousPrimary = lift;
  }

  private analyzeHighKnees(
    metrics: MovementMetrics,
    timestamp: number,
    events: CoachEvent[],
  ): void {
    const left = metrics.leftKneeHeight ?? -1;
    const right = metrics.rightKneeHeight ?? -1;
    const candidate: BodySide | null = left > -0.08 || right > -0.08
      ? left >= right ? "left" : "right"
      : null;
    const startSide = (side: BodySide): void => {
      const height = side === "left" ? left : right;
      this.startRep(timestamp, height);
      this.activeLiftSide = side;
      this.activeLiftQualified = height >= 0;
      this.activeRangeCueSent = false;
      this.phase = side === "left" ? "left-lift" : "right-lift";
      events.push(this.event(
        "phase",
        `phase:${side}`,
        `${side === "left" ? "左" : "右"}膝主动抬高｜身体直立`,
        "膝盖抬高",
        360,
        true,
      ));
    };
    if (this.activeLiftSide === null && candidate) {
      startSide(candidate);
    } else if (this.activeLiftSide) {
      const activeSide = this.activeLiftSide;
      const height = activeSide === "left" ? left : right;
      const oppositeSide: BodySide = activeSide === "left" ? "right" : "left";
      const oppositeHeight = oppositeSide === "left" ? left : right;
      this.activeLiftQualified ||= height >= 0;
      if ((metrics.trunkLean ?? 0) > 20) {
        this.currentIssues.add("stability");
        events.push(this.event("correction", "stability", "身体保持直立｜不要后仰", "身体保持直立", 650));
      }
      if (
        !this.activeLiftQualified &&
        !this.activeRangeCueSent &&
        this.repStartedAt !== null &&
        timestamp - this.repStartedAt >= 240
      ) {
        this.activeRangeCueSent = true;
        events.push(this.event("correction", "range-live", "膝盖再抬高一点｜保持身体直立", "膝盖再抬高一点", 500));
      }
      const switchedSides =
        oppositeHeight > -0.08 &&
        height <= -0.08 &&
        oppositeHeight - height >= 0.12;
      if (height <= -0.16 || switchedSides) {
        if (!this.activeLiftQualified) this.currentIssues.add("range");
        this.finishRep(timestamp, events);
        this.activeLiftSide = null;
        this.activeLiftQualified = false;
        this.activeRangeCueSent = false;
        this.phase = "standing";
        if (switchedSides) startSide(oppositeSide);
      }
    }
    this.previousPrimary = Math.max(left, right);
  }

  private analyzePushUp(
    metrics: MovementMetrics,
    timestamp: number,
    events: CoachEvent[],
  ): void {
    const elbow = metrics.elbowAngle ?? 180;
    const previous = this.previousPrimary ?? elbow;
    if (this.phase === "plank" && elbow < 145) {
      this.startRep(timestamp, elbow);
      this.phase = "lowering";
      events.push(this.event("phase", "phase:lower", "胸口控制下降｜身体保持直线", "控制下降", 430, true));
    } else if (this.repStartedAt !== null) {
      this.minPrimary = Math.min(this.minPrimary, elbow);
      if ((metrics.bodyDeviation ?? 0) > 24) {
        this.currentIssues.add("body-line");
        events.push(this.event("correction", "body-line", "收紧核心｜肩、髋、脚踝保持直线", "收紧核心，身体成一直线", 900));
      }
      if (elbow <= 100) this.phase = "bottom";
      if ((this.phase === "lowering" || this.phase === "bottom") && elbow - previous >= 7) {
        this.phase = "pressing";
        events.push(this.event("phase", "phase:press", "用胸部和手臂推起", "推起", 430, true));
      }
      if (this.phase === "pressing" && elbow >= 155) {
        if (this.minPrimary > 105) this.currentIssues.add("range");
        this.finishRep(timestamp, events);
        this.phase = "plank";
      }
    }
    this.previousPrimary = elbow;
  }

  private analyzeMountainClimber(
    metrics: MovementMetrics,
    timestamp: number,
    events: CoachEvent[],
  ): void {
    const left = metrics.leftKneeToShoulder ?? Number.POSITIVE_INFINITY;
    const right = metrics.rightKneeToShoulder ?? Number.POSITIVE_INFINITY;
    const candidate: BodySide | null = Math.min(left, right) <= 1
      ? left <= right ? "left" : "right"
      : null;
    const startSide = (side: BodySide): void => {
      const distance = side === "left" ? left : right;
      this.startRep(timestamp, distance);
      this.activeLiftSide = side;
      this.activeLiftQualified = distance <= 0.75;
      this.phase = side === "left" ? "left-lift" : "right-lift";
      events.push(this.event(
        "phase",
        `phase:knee-in:${side}`,
        `${side === "left" ? "左" : "右"}膝向胸口｜双手撑稳`,
        "膝盖向胸口",
        380,
        true,
      ));
    };
    if (this.activeLiftSide === null && candidate) {
      startSide(candidate);
    } else if (this.activeLiftSide) {
      const activeSide = this.activeLiftSide;
      const distance = activeSide === "left" ? left : right;
      const oppositeSide: BodySide = activeSide === "left" ? "right" : "left";
      const oppositeDistance = oppositeSide === "left" ? left : right;
      this.activeLiftQualified ||= distance <= 0.75;
      if ((metrics.bodyDeviation ?? 0) > 28) {
        this.currentIssues.add("body-line");
        events.push(this.event("correction", "body-line", "髋部不要下沉｜双手继续撑稳", "收紧核心，身体保持直线", 700));
      }
      const switchedSides = oppositeDistance <= 1 && distance - oppositeDistance >= 0.2;
      if (distance >= 1.3 || switchedSides) {
        if (!this.activeLiftQualified) this.currentIssues.add("range");
        this.finishRep(timestamp, events);
        this.activeLiftSide = null;
        this.activeLiftQualified = false;
        this.phase = "plank";
        if (switchedSides) startSide(oppositeSide);
      }
    }
  }

  private analyzeShoulderTap(
    metrics: MovementMetrics,
    timestamp: number,
    events: CoachEvent[],
  ): void {
    const left = metrics.leftWristToOppositeShoulder ?? Number.POSITIVE_INFINITY;
    const right = metrics.rightWristToOppositeShoulder ?? Number.POSITIVE_INFINITY;
    const candidate: BodySide | null = Math.min(left, right) <= 0.58
      ? left <= right ? "left" : "right"
      : null;
    const startSide = (side: BodySide): void => {
      const distance = side === "left" ? left : right;
      this.startRep(timestamp, distance);
      this.activeLiftSide = side;
      this.activeLiftQualified = distance <= 0.42;
      this.phase = side === "left" ? "left-lift" : "right-lift";
      events.push(this.event(
        "phase",
        `phase:tap:${side}`,
        `${side === "left" ? "左" : "右"}手触碰对侧肩｜髋部保持稳定`,
        "触肩，髋部稳住",
        420,
        true,
      ));
    };
    if (this.activeLiftSide === null && candidate) {
      startSide(candidate);
    } else if (this.activeLiftSide) {
      const activeSide = this.activeLiftSide;
      const distance = activeSide === "left" ? left : right;
      const oppositeSide: BodySide = activeSide === "left" ? "right" : "left";
      const oppositeDistance = oppositeSide === "left" ? left : right;
      this.activeLiftQualified ||= distance <= 0.42;
      if ((metrics.bodyDeviation ?? 0) > 28) {
        this.currentIssues.add("stability");
        events.push(this.event("correction", "stability", "髋部转动过多｜收紧核心", "髋部稳住", 750));
      }
      const switchedSides = oppositeDistance <= 0.58 && distance - oppositeDistance >= 0.15;
      if (distance >= 0.9 || switchedSides) {
        if (!this.activeLiftQualified) this.currentIssues.add("range");
        this.finishRep(timestamp, events);
        this.activeLiftSide = null;
        this.activeLiftQualified = false;
        this.phase = "plank";
        if (switchedSides) startSide(oppositeSide);
      }
    }
  }

  private analyzeBurpee(
    metrics: MovementMetrics,
    timestamp: number,
    events: CoachEvent[],
  ): void {
    const knee = metrics.kneeAngle ?? 180;
    if (this.phase === "standing" && (knee < 145 || metrics.horizontalBody)) {
      this.startRep(timestamp, knee);
      this.reachedFloorPosition = false;
      this.phase = "descending";
      events.push(this.event("phase", "phase:hands-down", "屈髋下蹲｜双手撑地", "下蹲，双手撑地", 450, true));
    }
    if (this.repStartedAt === null) return;

    if (metrics.horizontalBody) {
      if (!this.reachedFloorPosition) {
        this.reachedFloorPosition = true;
        this.phase = "plank";
        events.push(this.event("phase", "phase:plank", "身体进入高位支撑｜收紧核心", "撑稳，收紧核心", 450, true));
      }
      if ((metrics.bodyDeviation ?? 0) > 30) {
        this.currentIssues.add("body-line");
        events.push(this.event("correction", "body-line", "高位支撑时髋部保持稳定", "髋部稳住", 700));
      }
      return;
    }

    if (this.reachedFloorPosition && this.phase === "plank") {
      this.phase = "ascending";
      events.push(this.event("phase", "phase:stand", "收腿站直｜稳定落地", "收腿站直", 420, true));
    }
    if (this.reachedFloorPosition && this.phase === "ascending" && knee >= 155) {
      this.finishRep(timestamp, events);
      this.phase = "standing";
      this.reachedFloorPosition = false;
    } else if (
      !this.reachedFloorPosition &&
      knee >= 158 &&
      timestamp - this.repStartedAt >= 450
    ) {
      this.currentIssues.add("range");
      this.finishRep(timestamp, events);
      this.phase = "standing";
    }
  }

  private analyzeSideLunge(
    metrics: MovementMetrics,
    timestamp: number,
    events: CoachEvent[],
  ): void {
    const knee = Math.min(
      metrics.leftKneeAngle ?? 180,
      metrics.rightKneeAngle ?? 180,
    );
    const previous = this.previousPrimary ?? knee;
    if (this.phase === "standing" && knee < 145) {
      this.startRep(timestamp, knee);
      this.phase = "descending";
      events.push(this.event("phase", "phase:side-down", "髋部向后坐｜屈膝侧脚掌踩稳", "髋部向后坐", 450, true));
    } else if (this.repStartedAt !== null) {
      this.minPrimary = Math.min(this.minPrimary, knee);
      if ((metrics.trunkLean ?? 0) > 28) {
        this.currentIssues.add("stability");
        events.push(this.event("correction", "stability", "抬起胸口｜身体不要前扑", "抬起胸口", 700));
      }
      if (knee <= 112) this.phase = "bottom";
      if ((this.phase === "descending" || this.phase === "bottom") && knee - previous >= 5) {
        this.phase = "ascending";
        events.push(this.event("phase", "phase:side-up", "屈膝侧臀腿发力｜推回站立", "臀腿发力，回到站立", 450, true));
      }
      if (this.phase === "ascending" && knee >= 155) {
        if (this.minPrimary > 112) this.currentIssues.add("range");
        this.finishRep(timestamp, events);
        this.phase = "standing";
      }
    }
    this.previousPrimary = knee;
  }

  private analyzeGluteBridge(
    metrics: MovementMetrics,
    timestamp: number,
    events: CoachEvent[],
  ): void {
    const bridge = metrics.bridgeAngle ?? 90;
    const previous = this.previousPrimary ?? bridge;
    if (this.phase === "standing" && bridge >= 135) {
      this.startRep(timestamp, bridge);
      this.phase = "lifting";
      events.push(this.event("phase", "phase:bridge-up", "脚跟压地｜夹紧臀部抬髋", "夹紧臀部，抬起髋部", 500, true));
    } else if (this.repStartedAt !== null) {
      this.maxPrimary = Math.max(this.maxPrimary, bridge);
      if (bridge >= 155) this.phase = "top";
      if ((this.phase === "lifting" || this.phase === "top") && previous - bridge >= 5) {
        this.phase = "lowering";
        events.push(this.event("phase", "phase:bridge-down", "控制髋部落下", "控制落下", 450, true));
      }
      if (this.phase === "lowering" && bridge <= 125) {
        if (this.maxPrimary < 152) this.currentIssues.add("range");
        this.finishRep(timestamp, events);
        this.phase = "standing";
      }
    }
    this.previousPrimary = bridge;
  }

  private analyzeBirdDog(
    metrics: MovementMetrics,
    timestamp: number,
    events: CoachEvent[],
  ): void {
    this.analyzeOppositeReach(metrics, timestamp, events, "bird-dog");
  }

  private analyzeDeadBug(
    metrics: MovementMetrics,
    timestamp: number,
    events: CoachEvent[],
  ): void {
    this.analyzeOppositeReach(metrics, timestamp, events, "dead-bug");
  }

  private analyzeOppositeReach(
    metrics: MovementMetrics,
    timestamp: number,
    events: CoachEvent[],
    exercise: "bird-dog" | "dead-bug",
  ): void {
    const leftArmRightLeg = Math.min(
      metrics.leftWristReach ?? 0,
      metrics.rightAnkleReach ?? 0,
    );
    const rightArmLeftLeg = Math.min(
      metrics.rightWristReach ?? 0,
      metrics.leftAnkleReach ?? 0,
    );
    const candidate: BodySide | null = Math.max(leftArmRightLeg, rightArmLeftLeg) >= 1.25
      ? leftArmRightLeg >= rightArmLeftLeg ? "left" : "right"
      : null;
    const startSide = (side: BodySide): void => {
      const reach = side === "left" ? leftArmRightLeg : rightArmLeftLeg;
      this.startRep(timestamp, reach);
      this.activeLiftSide = side;
      this.activeLiftQualified = reach >= 1.45;
      this.phase = side === "left" ? "left-lift" : "right-lift";
      events.push(this.event(
        "phase",
        `phase:opposite:${side}`,
        `${side === "left" ? "左手右脚" : "右手左脚"}伸远｜核心保持稳定`,
        "对侧手脚伸远",
        500,
        true,
      ));
    };
    if (this.activeLiftSide === null && candidate) {
      startSide(candidate);
    } else if (this.activeLiftSide) {
      const activeSide = this.activeLiftSide;
      const reach = activeSide === "left" ? leftArmRightLeg : rightArmLeftLeg;
      const oppositeSide: BodySide = activeSide === "left" ? "right" : "left";
      const oppositeReach = oppositeSide === "left" ? leftArmRightLeg : rightArmLeftLeg;
      this.activeLiftQualified ||= reach >= 1.45;
      if (!metrics.torsoHorizontal) {
        this.currentIssues.add("stability");
        events.push(this.event("correction", "stability", exercise === "bird-dog" ? "骨盆保持水平｜不要转动" : "腰背保持贴稳｜缩小动作幅度", exercise === "bird-dog" ? "骨盆保持稳定" : "腰背保持贴稳", 800));
      }
      const switchedSides = oppositeReach >= 1.25 && oppositeReach - reach >= 0.2;
      if (reach <= 1 || switchedSides) {
        if (!this.activeLiftQualified) this.currentIssues.add("range");
        this.finishRep(timestamp, events);
        this.activeLiftSide = null;
        this.activeLiftQualified = false;
        this.phase = "plank";
        if (switchedSides) startSide(oppositeSide);
      }
    }
  }

  private analyzeSingleLegDeadlift(
    metrics: MovementMetrics,
    timestamp: number,
    events: CoachEvent[],
  ): void {
    const lean = metrics.trunkLean ?? 0;
    const previous = this.previousPrimary ?? lean;
    if (this.phase === "standing" && lean >= 22) {
      this.startRep(timestamp, lean);
      this.phase = "descending";
      events.push(this.event("phase", "phase:hinge", "支撑脚踩稳｜髋部向后折叠", "支撑脚踩稳，髋部向后", 500, true));
    } else if (this.repStartedAt !== null) {
      this.maxPrimary = Math.max(this.maxPrimary, lean);
      if ((metrics.kneeAngle ?? 180) < 140) {
        this.currentIssues.add("alignment");
        events.push(this.event("correction", "alignment", "支撑膝微屈即可｜不要深蹲", "支撑膝保持稳定", 750));
      }
      if (lean >= 45) this.phase = "bottom";
      if ((this.phase === "descending" || this.phase === "bottom") && previous - lean >= 5) {
        this.phase = "ascending";
        events.push(this.event("phase", "phase:hinge-up", "臀部发力｜身体回到直立", "臀部发力，回到直立", 500, true));
      }
      if (this.phase === "ascending" && lean <= 12) {
        if (this.maxPrimary < 40) this.currentIssues.add("range");
        this.finishRep(timestamp, events);
        this.phase = "standing";
      }
    }
    this.previousPrimary = lean;
  }

  private analyzePlank(
    metrics: MovementMetrics,
    frameDelta: number,
    events: CoachEvent[],
  ): void {
    const stableLine = metrics.horizontalBody && (metrics.bodyDeviation ?? 180) <= 22;
    if (stableLine) {
      const wasHolding = this.phase === "holding";
      this.phase = "holding";
      this.validHoldMs += frameDelta;
      this.holdIssueActive = false;
      if (!wasHolding) {
        events.push(this.event("phase", "phase:hold", "身体成一直线｜保持自然呼吸", "稳住，保持呼吸", 700, true));
      }
    } else {
      this.phase = "paused";
      this.reacquireStartedAt = null;
      if (!this.holdIssueActive) this.plankIssueCount += 1;
      this.holdIssueActive = true;
      events.push(this.event("correction", "body-line", "有效计时已暂停｜调整髋部到身体直线", "调整髋部，身体成一直线", 1_100));
    }
  }

  private startRep(timestamp: number, primary: number): void {
    this.repStartedAt = timestamp;
    this.currentIssues.clear();
    this.minPrimary = primary;
    this.maxPrimary = primary;
  }

  private finishRep(timestamp: number, events: CoachEvent[]): void {
    if (this.repStartedAt === null) return;
    const durationMs = Math.max(0, timestamp - this.repStartedAt);
    const issues = [...this.currentIssues];
    const record: RepRecord = {
      durationMs,
      descentMs: Math.round(durationMs / 2),
      qualified: issues.length === 0,
      issues,
    };
    this.records.push(record);
    this.completedRep = {
      ...record,
      repNumber: this.records.length,
      exerciseId: this.exerciseId,
    };
    const speech = issues.includes("body-line")
      ? "下次身体保持直线"
      : issues.includes("alignment")
        ? "下次膝盖对准脚尖"
        : issues.includes("range")
          ? "下次幅度再完整一点"
          : issues.includes("stability")
            ? "下次先稳住身体"
            : "动作合格";
    const resultEvent = this.event(
      "result",
      `rep-complete:${this.records.length}`,
      issues.length ? `第 ${this.records.length} 次完成｜下一次重点调整` : `第 ${this.records.length} 次合格`,
      speech,
      1_200,
      true,
    );
    const alternatingExercise = [
      "high-knees",
      "mountain-climber",
      "shoulder-tap",
      "bird-dog",
      "dead-bug",
    ].includes(this.exerciseId);
    if (alternatingExercise && issues.length === 0 && this.records.length % 5 !== 0) {
      resultEvent.speak = false;
    }
    events.push(resultEvent);
    this.repStartedAt = null;
    this.currentIssues.clear();
    this.minPrimary = Number.POSITIVE_INFINITY;
    this.maxPrimary = Number.NEGATIVE_INFINITY;
  }

  private primaryMetric(metrics: MovementMetrics): number | null {
    if (this.exerciseId === "calf-raise") {
      return metrics.heelGap === null || this.baselineHeelGap === null
        ? 0
        : metrics.heelGap - this.baselineHeelGap;
    }
    if (this.exerciseId === "high-knees") {
      return Math.max(metrics.leftKneeHeight ?? -1, metrics.rightKneeHeight ?? -1);
    }
    if (this.exerciseId === "mountain-climber") {
      const distance = Math.min(
        metrics.leftKneeToShoulder ?? 1.5,
        metrics.rightKneeToShoulder ?? 1.5,
      );
      return Math.max(0, Math.min(1, 1 - distance / 1.5));
    }
    if (this.exerciseId === "shoulder-tap") {
      const distance = Math.min(
        metrics.leftWristToOppositeShoulder ?? 1.2,
        metrics.rightWristToOppositeShoulder ?? 1.2,
      );
      return Math.max(0, Math.min(1, 1 - distance / 1.2));
    }
    if (this.exerciseId === "side-lunge") {
      return Math.min(metrics.leftKneeAngle ?? 180, metrics.rightKneeAngle ?? 180);
    }
    if (this.exerciseId === "glute-bridge") return metrics.bridgeAngle;
    if (this.exerciseId === "bird-dog" || this.exerciseId === "dead-bug") {
      return Math.max(
        Math.min(metrics.leftWristReach ?? 0, metrics.rightAnkleReach ?? 0),
        Math.min(metrics.rightWristReach ?? 0, metrics.leftAnkleReach ?? 0),
      ) / 1.5;
    }
    if (this.exerciseId === "single-leg-deadlift") return metrics.trunkLean;
    if (this.exerciseId === "push-up" || this.exerciseId === "knee-push-up") {
      return metrics.elbowAngle;
    }
    if (this.isTimedHold()) return this.validHoldMs / 1_000;
    return metrics.kneeAngle;
  }

  private isTimedHold(): boolean {
    return this.exerciseId === "plank" || this.exerciseId === "side-plank";
  }

  private startsOnFloor(): boolean {
    return [
      "push-up", "knee-push-up", "mountain-climber", "shoulder-tap",
      "bird-dog", "dead-bug",
    ].includes(this.exerciseId);
  }

  private statusMessage(): string {
    const messages: Partial<Record<BodyweightPhase, string>> = {
      standing: "准备好了｜按自己的节奏开始",
      descending: "正在下沉｜前脚踩稳",
      bottom: "幅度到位｜稳定回正",
      ascending: "正在回正｜臀腿发力",
      lifting: "脚跟向上抬｜身体保持稳定",
      top: "到达最高点｜控制落下",
      lowering: this.exerciseId === "push-up" || this.exerciseId === "knee-push-up"
        ? "胸口控制下降"
        : "控制落下",
      "left-lift": this.exerciseId === "shoulder-tap"
        ? "左手触碰对侧肩"
        : this.exerciseId === "bird-dog" || this.exerciseId === "dead-bug"
          ? "左手右脚向两端伸远"
          : "左膝主动抬高",
      "right-lift": this.exerciseId === "shoulder-tap"
        ? "右手触碰对侧肩"
        : this.exerciseId === "bird-dog" || this.exerciseId === "dead-bug"
          ? "右手左脚向两端伸远"
          : "右膝主动抬高",
      plank: this.exerciseId === "mountain-climber"
        ? "高位支撑｜左右膝交替向胸口"
        : this.exerciseId === "shoulder-tap"
          ? "高位支撑｜左右手交替触肩"
          : "高位支撑稳定｜按自己的节奏开始",
      pressing: "正在推起｜身体保持直线",
      holding: `有效保持 ${(this.validHoldMs / 1_000).toFixed(1)} 秒｜自然呼吸`,
      paused: this.isTimedHold() ? "有效计时暂停｜先调整身体直线" : "识别已暂停",
      calibrating: "正在校准",
    };
    return messages[this.phase] ?? "保持动作稳定";
  }

  private trackingLoss(
    timestamp: number,
    metrics = this.lastMetrics ?? undefined,
  ): FrameAnalysis {
    const withinGrace = this.lastValidAt !== null &&
      timestamp - this.lastValidAt <= TRACKING_GRACE_MS;
    if (!withinGrace) {
      this.repStartedAt = null;
      this.currentIssues.clear();
      this.activeLiftSide = null;
      this.reachedFloorPosition = false;
      this.phase = "paused";
    }
    const fallback = metrics ?? this.emptyMetrics();
    return this.analysis(
      fallback,
      withinGrace ? "识别短暂波动｜保持当前动作" : "识别已暂停｜请让身体完整入镜",
      withinGrace
        ? []
        : [this.event("tracking", "tracking", "识别已暂停｜请让身体完整入镜", "请让身体完整入镜", 1_200, true)],
      withinGrace ? "grace" : "lost",
    );
  }

  private emptyMetrics(): MovementMetrics {
    return {
      visibility: 0,
      side: null,
      bodyView: "unknown",
      kneeAngle: null,
      elbowAngle: null,
      trunkLean: null,
      bodyDeviation: null,
      heelGap: null,
      shoulderX: null,
      leftKneeHeight: null,
      rightKneeHeight: null,
      horizontalBody: false,
      leftKneeToShoulder: null,
      rightKneeToShoulder: null,
      leftWristToOppositeShoulder: null,
      rightWristToOppositeShoulder: null,
      leftKneeAngle: null,
      rightKneeAngle: null,
      bridgeAngle: null,
      torsoHorizontal: false,
      leftWristReach: null,
      rightWristReach: null,
      leftAnkleReach: null,
      rightAnkleReach: null,
    };
  }

  private event(
    kind: CoachEvent["kind"],
    key: string,
    message: string,
    speechMessage: string,
    lifetime: number,
    interrupt = false,
  ): CoachEvent {
    return {
      key: `${this.exerciseId}:${key}`,
      kind,
      message,
      priority: kind === "tracking" ? 0 : kind === "correction" ? 1 : kind === "result" ? 4 : 3,
      speak: true,
      speechMessage,
      speechCooldownMs: kind === "phase" ? 250 : 900,
      interrupt,
      holdMs: kind === "phase" ? 350 : lifetime,
      exerciseId: this.exerciseId,
      repId: this.records.length + 1,
      phase: this.phase,
      createdAt: this.now,
      expiresAt: this.now + lifetime,
      scope: kind === "result" ? "next-rep" : "current-phase",
      confidence: 0.9,
    };
  }

  private analysis(
    metrics: MovementMetrics,
    statusMessage: string,
    events: CoachEvent[],
    trackingState: "stable" | "grace" | "lost",
  ): FrameAnalysis {
    const primary = this.primaryMetric(metrics);
    return {
      exerciseId: this.exerciseId,
      calibrated: this.calibrated,
      phase: this.phase,
      totalReps: this.isTimedHold()
        ? Math.floor(this.validHoldMs / 1_000)
        : this.records.length,
      qualifiedReps: this.isTimedHold()
        ? Math.floor(this.validHoldMs / 1_000)
        : this.records.filter((record) => record.qualified).length,
      kneeAngle: this.exerciseId === "push-up" || this.exerciseId === "knee-push-up"
        ? metrics.elbowAngle
        : metrics.kneeAngle,
      trunkLean: this.startsOnFloor() || this.isTimedHold()
        ? metrics.bodyDeviation
        : metrics.trunkLean,
      side: metrics.side,
      bodyView: metrics.bodyView,
      currentRepMs: this.isTimedHold()
        ? this.validHoldMs
        : this.repStartedAt === null ? null : this.now - this.repStartedAt,
      trackingState,
      trackingConfidence: metrics.visibility || null,
      completedRep: this.completedRep,
      motionScore: this.isTimedHold()
        ? this.validHoldMs / 1_000
        : primary,
      secondaryScore: metrics.bodyDeviation ?? metrics.trunkLean,
      validHoldMs: this.isTimedHold() ? this.validHoldMs : null,
      statusMessage,
      events,
    };
  }
}
