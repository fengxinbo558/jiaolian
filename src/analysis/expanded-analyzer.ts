import type {
  BodySide,
  BodyView,
  CoachEvent,
  CompletedRep,
  DetectedPose,
  ExerciseAnalyzer,
  FrameAnalysis,
  IssueKey,
  PoseLandmark,
  RepRecord,
  SessionSummary,
  WorkoutPhase,
} from "../types";
import {
  angleAt,
  angleAt3D,
  estimateBodyView,
  trunkLeanFromVertical,
} from "./geometry";

export type RealtimeExpandedExerciseId =
  | "chair-pose"
  | "warrior-two"
  | "tree-pose"
  | "downward-dog"
  | "sumo-squat"
  | "goblet-squat"
  | "dumbbell-rdl"
  | "dumbbell-shoulder-press"
  | "dumbbell-lateral-raise"
  | "dumbbell-biceps-curl";

interface ExpandedMetrics {
  visibility: number;
  side: BodySide;
  bodyView: BodyView;
  leftKnee: number;
  rightKnee: number;
  leftElbow: number;
  rightElbow: number;
  leftArm: number;
  rightArm: number;
  trunkLean: number;
  hipAngle: number;
  ankleGap: number;
  shoulderGap: number;
  kneeRatio: number;
  liftedAnkleDelta: number;
  hipApex: number;
}

interface PoseVerdict {
  valid: boolean;
  issue: IssueKey | null;
  message: string;
  speech: string;
  primary: number;
  secondary: number;
}

const MIN_VISIBILITY = 0.45;
const TRACKING_GRACE_MS = 350;
const CALIBRATION_MS = 450;
const REACQUIRE_MS = 280;

const TIMED_EXERCISES = new Set<RealtimeExpandedExerciseId>([
  "chair-pose",
  "warrior-two",
  "tree-pose",
  "downward-dog",
]);

function landmark(points: PoseLandmark[], index: number): PoseLandmark | null {
  return points[index] ?? null;
}

function minimumVisibility(points: PoseLandmark[], indices: number[]): number {
  if (points.length < 33) return 0;
  return Math.min(...indices.map((index) => points[index]?.visibility ?? 0));
}

function distance(first: PoseLandmark, second: PoseLandmark, aspectRatio: number): number {
  return Math.hypot((first.x - second.x) * aspectRatio, first.y - second.y);
}

function hasUsefulWorld(points: PoseLandmark[]): boolean {
  if (points.length < 33) return false;
  const shoulder = points[11];
  const ankle = points[27];
  if (!shoulder || !ankle) return false;
  return Math.hypot(
    shoulder.x - ankle.x,
    shoulder.y - ankle.y,
    shoulder.z - ankle.z,
  ) > 0.03;
}

function angle(
  pose: DetectedPose,
  firstIndex: number,
  middleIndex: number,
  lastIndex: number,
): number {
  const image = [
    landmark(pose.landmarks, firstIndex),
    landmark(pose.landmarks, middleIndex),
    landmark(pose.landmarks, lastIndex),
  ];
  if (image.some((point) => point === null)) return 0;
  if (hasUsefulWorld(pose.worldLandmarks)) {
    const world = [
      landmark(pose.worldLandmarks, firstIndex),
      landmark(pose.worldLandmarks, middleIndex),
      landmark(pose.worldLandmarks, lastIndex),
    ];
    if (world.every((point) => point !== null)) {
      return angleAt3D(
        world[0] as PoseLandmark,
        world[1] as PoseLandmark,
        world[2] as PoseLandmark,
      );
    }
  }
  return angleAt(
    image[0] as PoseLandmark,
    image[1] as PoseLandmark,
    image[2] as PoseLandmark,
    pose.aspectRatio,
  );
}

function average(first: number, second: number): number {
  return (first + second) / 2;
}

function viewValue(
  bodyView: BodyView,
  side: BodySide,
  left: number,
  right: number,
): number {
  return bodyView === "front" ? average(left, right) : side === "left" ? left : right;
}

const FRONT_BILATERAL_EXERCISES = new Set<RealtimeExpandedExerciseId>([
  "warrior-two",
  "tree-pose",
  "dumbbell-lateral-raise",
]);

function exerciseViewValue(
  exerciseId: RealtimeExpandedExerciseId,
  bodyView: BodyView,
  side: BodySide,
  left: number,
  right: number,
): number {
  return FRONT_BILATERAL_EXERCISES.has(exerciseId)
    ? average(left, right)
    : viewValue(bodyView, side, left, right);
}

export class ExpandedExerciseAnalyzer implements ExerciseAnalyzer {
  private phase: WorkoutPhase = "calibrating";
  private calibrated = false;
  private calibrationStartedAt: number | null = null;
  private lastTimestamp: number | null = null;
  private lastValidAt: number | null = null;
  private reacquireStartedAt: number | null = null;
  private lastMetrics: ExpandedMetrics | null = null;
  private lastPrimary: number | null = null;
  private repStartedAt: number | null = null;
  private maxPrimary = Number.NEGATIVE_INFINITY;
  private baselineKneeRatio: number | null = null;
  private currentIssues = new Set<IssueKey>();
  private records: RepRecord[] = [];
  private completedRep: CompletedRep | null = null;
  private validHoldMs = 0;
  private holdIssueCounts: Partial<Record<IssueKey, number>> = {};
  private lastHoldIssue: IssueKey | null = null;
  private lastHoldCueAt = Number.NEGATIVE_INFINITY;
  private now = 0;

  constructor(private readonly exerciseId: RealtimeExpandedExerciseId) {}

  reset(): void {
    this.phase = "calibrating";
    this.calibrated = false;
    this.calibrationStartedAt = null;
    this.lastTimestamp = null;
    this.lastValidAt = null;
    this.reacquireStartedAt = null;
    this.lastMetrics = null;
    this.lastPrimary = null;
    this.repStartedAt = null;
    this.maxPrimary = Number.NEGATIVE_INFINITY;
    this.baselineKneeRatio = null;
    this.currentIssues.clear();
    this.records = [];
    this.completedRep = null;
    this.validHoldMs = 0;
    this.holdIssueCounts = {};
    this.lastHoldIssue = null;
    this.lastHoldCueAt = Number.NEGATIVE_INFINITY;
    this.now = 0;
  }

  analyze(pose: DetectedPose | null, timestamp: number): FrameAnalysis {
    this.now = timestamp;
    this.completedRep = null;
    const delta = this.lastTimestamp === null
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

    if (!this.calibrated) {
      const startReady = this.isTimedHold() || this.startPositionReady(metrics);
      if (!startReady) {
        this.calibrationStartedAt = null;
        return this.analysis(metrics, this.calibrationPrompt(), [], "stable");
      }
      this.calibrationStartedAt ??= timestamp;
      if (timestamp - this.calibrationStartedAt < CALIBRATION_MS) {
        return this.analysis(metrics, "保持姿势，正在确认身体比例", [], "stable");
      }
      this.calibrated = true;
      this.baselineKneeRatio = metrics.kneeRatio;
      this.phase = this.isTimedHold() ? "paused" : "standing";
      this.lastPrimary = this.primary(metrics);
    }

    if (this.phase === "paused" && !this.isTimedHold()) {
      if (!this.startPositionReady(metrics)) {
        this.reacquireStartedAt = null;
        return this.analysis(metrics, "先回到起始姿势，再继续训练", [], "stable");
      }
      this.reacquireStartedAt ??= timestamp;
      if (timestamp - this.reacquireStartedAt < REACQUIRE_MS) {
        return this.analysis(metrics, "保持起始姿势，正在恢复识别", [], "stable");
      }
      this.phase = "standing";
      this.lastPrimary = this.primary(metrics);
      this.reacquireStartedAt = null;
    }

    const events: CoachEvent[] = [];
    if (this.isTimedHold()) this.analyzeHold(metrics, delta, events);
    else this.analyzeRepetition(metrics, timestamp, events);
    return this.analysis(metrics, this.statusMessage(), events, "stable");
  }

  getSummary(endedAt = new Date()): SessionSummary {
    const issueCounts: Partial<Record<IssueKey, number>> = { ...this.holdIssueCounts };
    for (const record of this.records) {
      for (const issue of record.issues) {
        issueCounts[issue] = (issueCounts[issue] ?? 0) + 1;
      }
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
      averageTempoSeconds: this.isTimedHold() || this.records.length === 0
        ? null
        : this.records.reduce((sum, record) => sum + record.durationMs, 0) /
          this.records.length /
          1_000,
      issueCounts,
      measurementMode: this.isTimedHold() ? "timed-hold" : "repetitions",
      validDurationMs: this.isTimedHold() ? this.validHoldMs : null,
    };
  }

  private isTimedHold(): boolean {
    return TIMED_EXERCISES.has(this.exerciseId);
  }

  private requiredIndices(): number[] {
    if (
      this.exerciseId === "chair-pose" ||
      this.exerciseId === "warrior-two" ||
      this.exerciseId === "downward-dog" ||
      this.exerciseId === "dumbbell-shoulder-press" ||
      this.exerciseId === "dumbbell-lateral-raise" ||
      this.exerciseId === "dumbbell-biceps-curl"
    ) {
      return [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
    }
    return [11, 12, 23, 24, 25, 26, 27, 28];
  }

  private metrics(pose: DetectedPose): ExpandedMetrics | null {
    if (pose.landmarks.length < 33) return null;
    const points = pose.landmarks;
    const required = this.requiredIndices();
    const bodyView = estimateBodyView(points, pose.worldLandmarks, MIN_VISIBILITY, pose.aspectRatio);
    const requiresArms = required.includes(13);
    const leftRequired = requiresArms
      ? [11, 13, 15, 23, 25, 27]
      : [11, 23, 25, 27];
    const rightRequired = requiresArms
      ? [12, 14, 16, 24, 26, 28]
      : [12, 24, 26, 28];
    const leftVisibility = minimumVisibility(points, leftRequired);
    const rightVisibility = minimumVisibility(points, rightRequired);
    const side: BodySide = leftVisibility >= rightVisibility ? "left" : "right";
    const visibility = bodyView === "side" || bodyView === "oblique"
      ? Math.max(leftVisibility, rightVisibility)
      : minimumVisibility(points, required);
    const leftShoulder = points[11];
    const rightShoulder = points[12];
    const leftHip = points[23];
    const rightHip = points[24];
    const leftKneePoint = points[25];
    const rightKneePoint = points[26];
    const leftAnkle = points[27];
    const rightAnkle = points[28];
    if (
      !leftShoulder || !rightShoulder || !leftHip || !rightHip ||
      !leftKneePoint || !rightKneePoint || !leftAnkle || !rightAnkle
    ) return null;
    const shoulderGap = distance(leftShoulder, rightShoulder, pose.aspectRatio);
    const ankleGap = distance(leftAnkle, rightAnkle, pose.aspectRatio);
    const kneeGap = distance(leftKneePoint, rightKneePoint, pose.aspectRatio);
    const torsoLength = Math.max(
      0.05,
      average(
        distance(leftShoulder, leftHip, pose.aspectRatio),
        distance(rightShoulder, rightHip, pose.aspectRatio),
      ),
    );
    const leftTrunk = trunkLeanFromVertical(leftShoulder, leftHip, pose.aspectRatio);
    const rightTrunk = trunkLeanFromVertical(rightShoulder, rightHip, pose.aspectRatio);
    const leftHipApex = (leftShoulder.y - leftHip.y) / torsoLength;
    const rightHipApex = (rightShoulder.y - rightHip.y) / torsoLength;
    const leftHipAngle = angle(pose, 11, 23, 25);
    const rightHipAngle = angle(pose, 12, 24, 26);
    return {
      visibility,
      side,
      bodyView,
      leftKnee: angle(pose, 23, 25, 27),
      rightKnee: angle(pose, 24, 26, 28),
      leftElbow: angle(pose, 11, 13, 15),
      rightElbow: angle(pose, 12, 14, 16),
      leftArm: angle(pose, 23, 11, 15),
      rightArm: angle(pose, 24, 12, 16),
      trunkLean: exerciseViewValue(this.exerciseId, bodyView, side, leftTrunk, rightTrunk),
      hipAngle: exerciseViewValue(this.exerciseId, bodyView, side, leftHipAngle, rightHipAngle),
      ankleGap,
      shoulderGap,
      kneeRatio: kneeGap / Math.max(ankleGap, 0.04),
      liftedAnkleDelta: Math.abs(leftAnkle.y - rightAnkle.y) / torsoLength,
      hipApex: exerciseViewValue(this.exerciseId, bodyView, side, leftHipApex, rightHipApex),
    };
  }

  private startPositionReady(metrics: ExpandedMetrics): boolean {
    const knee = exerciseViewValue(
      this.exerciseId,
      metrics.bodyView,
      metrics.side,
      metrics.leftKnee,
      metrics.rightKnee,
    );
    if (this.exerciseId === "sumo-squat" || this.exerciseId === "goblet-squat") {
      return knee >= 150;
    }
    if (this.exerciseId === "dumbbell-rdl") return metrics.trunkLean <= 16;
    if (this.exerciseId === "dumbbell-shoulder-press") {
      const arm = exerciseViewValue(
        this.exerciseId,
        metrics.bodyView,
        metrics.side,
        metrics.leftArm,
        metrics.rightArm,
      );
      return arm >= 45 && arm <= 115;
    }
    if (this.exerciseId === "dumbbell-lateral-raise") {
      return exerciseViewValue(
        this.exerciseId,
        metrics.bodyView,
        metrics.side,
        metrics.leftArm,
        metrics.rightArm,
      ) <= 25;
    }
    return exerciseViewValue(
      this.exerciseId,
      metrics.bodyView,
      metrics.side,
      metrics.leftElbow,
      metrics.rightElbow,
    ) >= 145;
  }

  private calibrationPrompt(): string {
    if (this.exerciseId === "dumbbell-shoulder-press") return "把哑铃稳定放到肩侧，保持全身入镜";
    if (this.exerciseId === "dumbbell-lateral-raise") return "双臂自然垂下，正面站稳";
    if (this.exerciseId === "dumbbell-biceps-curl") return "肘部靠近身体，双臂自然下垂";
    if (this.exerciseId === "dumbbell-rdl") return "侧面站直，膝盖微屈，哑铃放在腿前";
    return "先站直，让头、髋、膝和双脚完整入镜";
  }

  private analyzeHold(
    metrics: ExpandedMetrics,
    frameDelta: number,
    events: CoachEvent[],
  ): void {
    const verdict = this.holdVerdict(metrics);
    if (verdict.valid) {
      const enteringHold = this.phase !== "holding";
      this.phase = "holding";
      this.validHoldMs += frameDelta;
      this.lastHoldIssue = null;
      if (enteringHold) {
        events.push(this.event(
          "phase",
          "hold",
          "姿势到位｜保持自然呼吸",
          "姿势到位，保持呼吸",
          500,
          true,
        ));
      }
      return;
    }

    this.phase = "paused";
    if (verdict.issue && verdict.issue !== this.lastHoldIssue) {
      this.holdIssueCounts[verdict.issue] = (this.holdIssueCounts[verdict.issue] ?? 0) + 1;
    }
    const shouldCue = verdict.issue !== this.lastHoldIssue || this.now - this.lastHoldCueAt >= 1_800;
    this.lastHoldIssue = verdict.issue;
    if (shouldCue) {
      this.lastHoldCueAt = this.now;
      events.push(this.event(
        "correction",
        verdict.issue ?? "alignment",
        `有效计时暂停｜${verdict.message}`,
        verdict.speech,
        1_000,
        true,
      ));
    }
  }

  private holdVerdict(metrics: ExpandedMetrics): PoseVerdict {
    const kneeMin = Math.min(metrics.leftKnee, metrics.rightKnee);
    const kneeMax = Math.max(metrics.leftKnee, metrics.rightKnee);
    const kneeAverage = exerciseViewValue(
      this.exerciseId,
      metrics.bodyView,
      metrics.side,
      metrics.leftKnee,
      metrics.rightKnee,
    );
    const armAverage = exerciseViewValue(
      this.exerciseId,
      metrics.bodyView,
      metrics.side,
      metrics.leftArm,
      metrics.rightArm,
    );
    const armDifference = Math.abs(metrics.leftArm - metrics.rightArm);
    if (this.exerciseId === "chair-pose") {
      if (kneeAverage > 142) return this.verdict(false, "range", "髋部再向后坐一点", "髋部再向后坐", 180 - kneeAverage, metrics.trunkLean);
      if (kneeAverage < 72) return this.verdict(false, "alignment", "不要继续下沉，膝髋保持可控", "稍微抬高一点", 180 - kneeAverage, metrics.trunkLean);
      if (metrics.trunkLean > 42) return this.verdict(false, "stability", "抬起胸口，背部保持稳定", "抬起胸口", 180 - kneeAverage, metrics.trunkLean);
      if (armAverage < 112) return this.verdict(false, "range", "双臂向上延伸到耳侧", "手臂向上延伸", armAverage, metrics.trunkLean);
      return this.verdict(true, null, "保持", "保持", 180 - kneeAverage, metrics.trunkLean);
    }
    if (this.exerciseId === "warrior-two") {
      if (metrics.ankleGap < metrics.shoulderGap * 1.45) return this.verdict(false, "range", "双脚再打开一点", "双脚再打开", metrics.ankleGap / Math.max(metrics.shoulderGap, 0.04), armDifference);
      if (kneeMin > 138) return this.verdict(false, "range", "前膝再屈一点，保持对准脚尖", "前膝再屈一点", 180 - kneeMin, armDifference);
      if (kneeMax < 145) return this.verdict(false, "alignment", "后腿伸稳，不要两边一起下沉", "后腿伸直", kneeMax, armDifference);
      if (armAverage < 68 || armAverage > 112) return this.verdict(false, "range", "双臂抬到肩膀高度", "手臂抬到肩高", armAverage, armDifference);
      if (armDifference > 35) return this.verdict(false, "symmetry", "双手保持同一高度", "双手保持同高", armAverage, armDifference);
      return this.verdict(true, null, "保持", "保持", 180 - kneeMin, armDifference);
    }
    if (this.exerciseId === "tree-pose") {
      if (kneeMax < 152) return this.verdict(false, "stability", "支撑腿伸稳，脚掌压住地面", "支撑腿伸稳", kneeMax, metrics.trunkLean);
      if (kneeMin > 148 || metrics.liftedAnkleDelta < 0.38) return this.verdict(false, "range", "抬起一只脚，避开膝关节", "抬起一只脚", 180 - kneeMin, metrics.liftedAnkleDelta);
      if (metrics.trunkLean > 16) return this.verdict(false, "stability", "身体回到正中，目视固定点", "身体回到正中", 180 - kneeMin, metrics.trunkLean);
      return this.verdict(true, null, "保持", "保持", 180 - kneeMin, metrics.trunkLean);
    }
    if (exerciseViewValue(
      this.exerciseId,
      metrics.bodyView,
      metrics.side,
      metrics.leftElbow,
      metrics.rightElbow,
    ) < 145) {
      return this.verdict(false, "alignment", "双手推地，把手臂伸稳", "手臂推直", metrics.hipAngle, metrics.hipApex);
    }
    if (kneeAverage < 125) {
      return this.verdict(false, "alignment", "膝盖可以微屈，先把背部拉长", "先把背部拉长", metrics.hipAngle, metrics.hipApex);
    }
    if (metrics.hipApex < 0.45 || metrics.hipAngle < 48 || metrics.hipAngle > 128) {
      return this.verdict(false, "range", "髋部向后上方延伸，形成稳定倒 V", "髋部向后上方", metrics.hipAngle, metrics.hipApex);
    }
    return this.verdict(true, null, "保持", "保持", metrics.hipAngle, metrics.hipApex);
  }

  private verdict(
    valid: boolean,
    issue: IssueKey | null,
    message: string,
    speech: string,
    primary: number,
    secondary: number,
  ): PoseVerdict {
    return { valid, issue, message, speech, primary, secondary };
  }

  private primary(metrics: ExpandedMetrics): number {
    if (this.exerciseId === "sumo-squat" || this.exerciseId === "goblet-squat") {
      return 180 - exerciseViewValue(
        this.exerciseId,
        metrics.bodyView,
        metrics.side,
        metrics.leftKnee,
        metrics.rightKnee,
      );
    }
    if (this.exerciseId === "dumbbell-rdl") return metrics.trunkLean;
    if (this.exerciseId === "dumbbell-shoulder-press" || this.exerciseId === "dumbbell-lateral-raise") {
      return exerciseViewValue(
        this.exerciseId,
        metrics.bodyView,
        metrics.side,
        metrics.leftArm,
        metrics.rightArm,
      );
    }
    return 180 - exerciseViewValue(
      this.exerciseId,
      metrics.bodyView,
      metrics.side,
      metrics.leftElbow,
      metrics.rightElbow,
    );
  }

  private thresholds(): { start: number; top: number; end: number } {
    if (this.exerciseId === "sumo-squat" || this.exerciseId === "goblet-squat") {
      return { start: 32, top: 68, end: 25 };
    }
    if (this.exerciseId === "dumbbell-rdl") return { start: 20, top: 43, end: 15 };
    if (this.exerciseId === "dumbbell-shoulder-press") return { start: 112, top: 154, end: 108 };
    if (this.exerciseId === "dumbbell-lateral-raise") return { start: 28, top: 76, end: 22 };
    return { start: 38, top: 98, end: 28 };
  }

  private analyzeRepetition(
    metrics: ExpandedMetrics,
    timestamp: number,
    events: CoachEvent[],
  ): void {
    const primary = this.primary(metrics);
    const previous = this.lastPrimary ?? primary;
    const threshold = this.thresholds();
    if (this.phase === "standing" && primary >= threshold.start) {
      this.repStartedAt = timestamp;
      this.maxPrimary = primary;
      this.currentIssues.clear();
      this.phase = "lifting";
      events.push(this.event(
        "phase",
        "start",
        this.startCue(false),
        this.startCue(true),
        430,
        true,
      ));
    } else if (this.repStartedAt !== null) {
      this.maxPrimary = Math.max(this.maxPrimary, primary);
      this.checkLiveIssues(metrics, events);
      if (primary >= threshold.top) this.phase = "top";
      if (
        (this.phase === "lifting" || this.phase === "top") &&
        previous - primary >= 4 &&
        this.maxPrimary >= threshold.start + 12
      ) {
        this.phase = "lowering";
        events.push(this.event(
          "phase",
          "return",
          this.returnCue(false),
          this.returnCue(true),
          430,
          true,
        ));
      }
      if (this.phase === "lowering" && primary <= threshold.end) {
        if (this.maxPrimary < threshold.top) this.currentIssues.add("range");
        this.finishRep(timestamp, events);
        this.phase = "standing";
      }
    }
    this.lastPrimary = primary;
  }

  private checkLiveIssues(metrics: ExpandedMetrics, events: CoachEvent[]): void {
    let issue: IssueKey | null = null;
    let message = "";
    let speech = "";
    if (this.exerciseId === "sumo-squat") {
      if (metrics.bodyView === "front" && metrics.ankleGap < metrics.shoulderGap * 1.25) {
        issue = "alignment";
        message = "双脚再打开一点｜膝盖跟随脚尖";
        speech = "双脚打开，膝盖跟脚尖";
      } else if (
        metrics.bodyView === "front" &&
        this.baselineKneeRatio !== null &&
        metrics.kneeRatio < this.baselineKneeRatio * 0.8
      ) {
        issue = "alignment";
        message = "膝盖正在向内收｜主动向脚尖方向打开";
        speech = "膝盖向脚尖方向打开";
      }
    } else if (this.exerciseId === "goblet-squat") {
      if (metrics.trunkLean > 38) {
        issue = "stability";
        message = "哑铃靠近胸口｜抬起胸口保持稳定";
        speech = "哑铃靠近胸口，抬起胸口";
      }
    } else if (this.exerciseId === "dumbbell-rdl") {
      if (exerciseViewValue(
        this.exerciseId,
        metrics.bodyView,
        metrics.side,
        metrics.leftKnee,
        metrics.rightKnee,
      ) < 128) {
        issue = "alignment";
        message = "膝盖只需微屈｜继续把髋部向后推";
        speech = "膝盖微屈，髋部向后";
      }
    } else if (this.exerciseId === "dumbbell-shoulder-press") {
      if (metrics.trunkLean > 20) {
        issue = "stability";
        message = "肋骨收住｜不要后仰借力";
        speech = "收住肋骨，不要后仰";
      } else if (
        metrics.bodyView === "front" &&
        Math.abs(metrics.leftArm - metrics.rightArm) > 25
      ) {
        issue = "symmetry";
        message = "两只哑铃保持同一高度";
        speech = "两边保持同高";
      }
    } else if (this.exerciseId === "dumbbell-lateral-raise") {
      if (metrics.trunkLean > 16) {
        issue = "stability";
        message = "身体不要摆动｜减小重量或放慢速度";
        speech = "身体不要摆动";
      } else if (
        metrics.bodyView === "front" &&
        Math.abs(metrics.leftArm - metrics.rightArm) > 22
      ) {
        issue = "symmetry";
        message = "双臂同步抬起，保持同一高度";
        speech = "双臂保持同高";
      }
    } else {
      if (metrics.trunkLean > 16) {
        issue = "stability";
        message = "肘部靠近身体｜不要摆动借力";
        speech = "肘部贴近身体，不要借力";
      } else if (
        metrics.bodyView === "front" &&
        Math.abs(metrics.leftElbow - metrics.rightElbow) > 24
      ) {
        issue = "symmetry";
        message = "双臂同步弯举，保持相同幅度";
        speech = "双臂保持同步";
      }
    }
    if (!issue || this.currentIssues.has(issue)) return;
    this.currentIssues.add(issue);
    events.push(this.event("correction", issue, message, speech, 850, true));
  }

  private startCue(speech: boolean): string {
    if (this.exerciseId === "sumo-squat") return speech ? "下蹲，膝盖向外" : "正在下蹲｜膝盖跟随脚尖";
    if (this.exerciseId === "goblet-squat") return speech ? "下蹲，哑铃靠近胸口" : "正在下蹲｜哑铃靠近胸口";
    if (this.exerciseId === "dumbbell-rdl") return speech ? "髋部向后" : "髋部向后折叠｜背部保持稳定";
    if (this.exerciseId === "dumbbell-shoulder-press") return speech ? "向上推，呼气" : "向上推起｜呼气";
    if (this.exerciseId === "dumbbell-lateral-raise") return speech ? "侧向抬起" : "双臂侧向抬起｜身体稳住";
    return speech ? "弯举，呼气" : "肘部不动｜向上弯举";
  }

  private returnCue(speech: boolean): string {
    if (this.exerciseId === "sumo-squat" || this.exerciseId === "goblet-squat") {
      return speech ? "站起，呼气" : "脚掌压地｜稳定站起";
    }
    if (this.exerciseId === "dumbbell-rdl") return speech ? "臀部发力站直" : "臀部发力｜回到直立";
    return speech ? "控制放下" : "控制下降｜不要让哑铃掉落";
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
    const speech = issues.includes("alignment")
      ? "完成，下次先调整动作方向"
      : issues.includes("stability")
        ? "完成，下次先稳住身体"
        : issues.includes("symmetry")
          ? "完成，下次保持两边同步"
          : issues.includes("range")
            ? "完成，下次幅度再完整一点"
            : `第 ${this.records.length} 次，合格`;
    events.push(this.event(
      "result",
      `complete:${this.records.length}`,
      issues.length
        ? `第 ${this.records.length} 次完成｜下一次重点调整`
        : `第 ${this.records.length} 次合格`,
      speech,
      1_200,
      true,
    ));
    this.repStartedAt = null;
    this.currentIssues.clear();
    this.maxPrimary = Number.NEGATIVE_INFINITY;
  }

  private statusMessage(): string {
    if (this.isTimedHold()) {
      return this.phase === "holding"
        ? `姿势有效｜已保持 ${(this.validHoldMs / 1_000).toFixed(1)} 秒`
        : "有效计时暂停｜按提示调整姿势";
    }
    const messages: Partial<Record<WorkoutPhase, string>> = {
      standing: "准备好了｜按自己的节奏开始",
      lifting: this.startCue(false),
      top: "幅度到位｜准备控制返回",
      lowering: this.returnCue(false),
      paused: "识别已暂停｜先回到起始姿势",
      calibrating: "正在确认起始姿势",
    };
    return messages[this.phase] ?? "保持动作可控";
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
      this.phase = "paused";
      this.reacquireStartedAt = null;
    }
    return this.analysis(
      metrics ?? this.emptyMetrics(),
      withinGrace ? "识别短暂波动｜继续当前动作" : "识别已暂停｜请让全身完整入镜",
      withinGrace
        ? []
        : [this.event("tracking", "tracking", "识别已暂停｜请让全身完整入镜", "请让全身完整入镜", 1_100, true)],
      withinGrace ? "grace" : "lost",
    );
  }

  private emptyMetrics(): ExpandedMetrics {
    return {
      visibility: 0,
      side: "left",
      bodyView: "unknown",
      leftKnee: 0,
      rightKnee: 0,
      leftElbow: 0,
      rightElbow: 0,
      leftArm: 0,
      rightArm: 0,
      trunkLean: 0,
      hipAngle: 0,
      ankleGap: 0,
      shoulderGap: 0,
      kneeRatio: 0,
      liftedAnkleDelta: 0,
      hipApex: 0,
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
      speechCooldownMs: kind === "phase" ? 250 : 850,
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
    metrics: ExpandedMetrics,
    statusMessage: string,
    events: CoachEvent[],
    trackingState: "stable" | "grace" | "lost",
  ): FrameAnalysis {
    const verdict = this.isTimedHold() ? this.holdVerdict(metrics) : null;
    const primary = verdict?.primary ?? this.primary(metrics);
    const secondary = verdict?.secondary ?? metrics.trunkLean;
    return {
      exerciseId: this.exerciseId,
      calibrated: this.calibrated,
      phase: this.phase,
      totalReps: this.isTimedHold() ? Math.floor(this.validHoldMs / 1_000) : this.records.length,
      qualifiedReps: this.isTimedHold()
        ? Math.floor(this.validHoldMs / 1_000)
        : this.records.filter((record) => record.qualified).length,
      kneeAngle: primary,
      trunkLean: secondary,
      side: metrics.side,
      bodyView: metrics.bodyView,
      currentRepMs: this.isTimedHold()
        ? this.validHoldMs
        : this.repStartedAt === null ? null : this.now - this.repStartedAt,
      trackingState,
      trackingConfidence: metrics.visibility || null,
      completedRep: this.completedRep,
      motionScore: primary,
      secondaryScore: secondary,
      validHoldMs: this.isTimedHold() ? this.validHoldMs : null,
      statusMessage,
      events,
    };
  }
}
