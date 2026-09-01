import { buildRepAdvice } from "../coaching";
import type {
  CoachEvent,
  CompletedRep,
  DetectedPose,
  ExerciseAnalyzer,
  FrameAnalysis,
  IssueKey,
  JumpingJackPhase,
  PoseLandmark,
  RepRecord,
  SessionSummary,
} from "../types";

interface JumpingJackMetrics {
  visibility: number;
  armProgress: number;
  footProgress: number;
  symmetryError: number;
  trunkLean: number;
}

interface ActiveJump {
  startedAt: number;
  maxArm: number;
  maxFeet: number;
  maxSymmetryError: number;
  armOpenedAt: number | null;
  feetOpenedAt: number | null;
  reachedPeak: boolean;
  peakAt: number | null;
  issues: Set<IssueKey>;
  correctionSent: boolean;
}

const REQUIRED = [0, 11, 12, 15, 16, 23, 24, 27, 28] as const;
const MIN_VISIBILITY = 0.45;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function average(first: number, second: number): number {
  return (first + second) / 2;
}

function point(landmarks: PoseLandmark[], index: number): PoseLandmark | null {
  return landmarks[index] ?? null;
}

function measure(
  pose: DetectedPose,
  closedFootRatio: number | null,
): JumpingJackMetrics | null {
  const points = REQUIRED.map((index) => point(pose.landmarks, index));
  if (points.some((current) => current === null)) return null;
  const visibility = Math.min(...points.map((current) => current?.visibility ?? 0));
  const leftShoulder = point(pose.landmarks, 11)!;
  const rightShoulder = point(pose.landmarks, 12)!;
  const leftWrist = point(pose.landmarks, 15)!;
  const rightWrist = point(pose.landmarks, 16)!;
  const leftHip = point(pose.landmarks, 23)!;
  const rightHip = point(pose.landmarks, 24)!;
  const leftAnkle = point(pose.landmarks, 27)!;
  const rightAnkle = point(pose.landmarks, 28)!;
  const ratio = pose.aspectRatio || 1;
  const shoulderY = average(leftShoulder.y, rightShoulder.y);
  const hipY = average(leftHip.y, rightHip.y);
  const torso = Math.max(0.08, Math.abs(hipY - shoulderY));
  const leftRaise = (leftShoulder.y - leftWrist.y) / torso;
  const rightRaise = (rightShoulder.y - rightWrist.y) / torso;
  const armProgress = clamp01((Math.min(leftRaise, rightRaise) + 0.15) / 0.82);
  const hipSpan = Math.max(0.025, Math.abs(leftHip.x - rightHip.x) * ratio);
  const footRatio = Math.abs(leftAnkle.x - rightAnkle.x) * ratio / hipSpan;
  const baseline = closedFootRatio ?? 1;
  const footProgress = clamp01((footRatio - baseline) / 1.35);
  const symmetryError = Math.abs(leftWrist.y - rightWrist.y) / torso;
  const shoulderX = average(leftShoulder.x, rightShoulder.x);
  const hipX = average(leftHip.x, rightHip.x);
  const trunkLean = Math.atan2(
    Math.abs(shoulderX - hipX) * ratio,
    Math.max(0.001, Math.abs(shoulderY - hipY)),
  ) * 180 / Math.PI;
  return { visibility, armProgress, footProgress, symmetryError, trunkLean };
}

export class JumpingJackAnalyzer implements ExerciseAnalyzer {
  private calibrated = false;
  private phase: JumpingJackPhase = "calibrating";
  private calibrationStartedAt: number | null = null;
  private calibrationFootRatios: number[] = [];
  private closedFootRatio: number | null = null;
  private currentJump: ActiveJump | null = null;
  private records: RepRecord[] = [];
  private completedRep: CompletedRep | null = null;
  private lastValidAt: number | null = null;
  private unstableSince: number | null = null;
  private lastActivityAt: number | null = null;
  private lastMotionScore = 0;
  private now = 0;

  reset(): void {
    this.calibrated = false;
    this.phase = "calibrating";
    this.calibrationStartedAt = null;
    this.calibrationFootRatios = [];
    this.closedFootRatio = null;
    this.currentJump = null;
    this.records = [];
    this.completedRep = null;
    this.lastValidAt = null;
    this.unstableSince = null;
    this.lastActivityAt = null;
    this.lastMotionScore = 0;
  }

  analyze(pose: DetectedPose | null, timestamp: number): FrameAnalysis {
    this.now = timestamp;
    this.completedRep = null;
    const initialMetrics = pose ? measure(pose, this.closedFootRatio) : null;
    if (!initialMetrics || initialMetrics.visibility < MIN_VISIBILITY) {
      return this.handleTrackingLoss(timestamp);
    }

    const metrics = initialMetrics;
    this.lastValidAt = timestamp;
    this.unstableSince = null;
    const score = Math.max(metrics.armProgress, metrics.footProgress);
    this.lastMotionScore = score;

    if (!this.calibrated) {
      return this.calibrate(pose!, metrics, timestamp);
    }

    const events: CoachEvent[] = [];
    const closed = metrics.armProgress < 0.2 && metrics.footProgress < 0.2;
    const moving = score > 0.24;

    if ((this.phase === "closed" || this.phase === "resting") && moving) {
      this.currentJump = {
        startedAt: timestamp,
        maxArm: metrics.armProgress,
        maxFeet: metrics.footProgress,
        maxSymmetryError: metrics.symmetryError,
        armOpenedAt: metrics.armProgress >= 0.45 ? timestamp : null,
        feetOpenedAt: metrics.footProgress >= 0.45 ? timestamp : null,
        reachedPeak: false,
        peakAt: null,
        issues: new Set<IssueKey>(),
        correctionSent: false,
      };
      this.phase = "opening";
      this.lastActivityAt = timestamp;
      events.push(this.event("phase", `jack:opening:${this.records.length + 1}`, "正在张开｜手脚一起打开", "张开", 650));
    }

    if (this.currentJump) {
      const jump = this.currentJump;
      jump.maxArm = Math.max(jump.maxArm, metrics.armProgress);
      jump.maxFeet = Math.max(jump.maxFeet, metrics.footProgress);
      jump.maxSymmetryError = Math.max(jump.maxSymmetryError, metrics.symmetryError);
      if (jump.armOpenedAt === null && metrics.armProgress >= 0.45) jump.armOpenedAt = timestamp;
      if (jump.feetOpenedAt === null && metrics.footProgress >= 0.45) jump.feetOpenedAt = timestamp;

      if (!jump.reachedPeak && score >= 0.78) {
        jump.reachedPeak = true;
        jump.peakAt = timestamp;
        this.phase = "open";
        events.push(this.event("phase", `jack:open:${this.records.length + 1}`, "张开到位｜开始收回", "收回", 600));
      }

      if (
        jump.reachedPeak &&
        jump.peakAt !== null &&
        timestamp - jump.peakAt >= 120 &&
        score >= 0.65 &&
        !jump.correctionSent
      ) {
        if (jump.maxFeet >= 0.78 && jump.maxArm < 0.62) {
          jump.issues.add("arms");
          jump.correctionSent = true;
          events.push(this.event("correction", "arms", "手臂还可以更高｜下一次举过头顶", "手举高", 850));
        } else if (jump.maxArm >= 0.78 && jump.maxFeet < 0.62) {
          jump.issues.add("feet");
          jump.correctionSent = true;
          events.push(this.event("correction", "feet", "双脚打开不足｜下一次再打开一点", "脚打开", 850));
        } else if (metrics.symmetryError > 0.48) {
          jump.issues.add("symmetry");
          jump.correctionSent = true;
          events.push(this.event("correction", "symmetry", "左右手臂不齐｜下一次保持同高", "两侧同高", 850));
        }
      }

      if (jump.reachedPeak && score < 0.7 && !closed) {
        this.phase = "closing";
      }

      if (closed) {
        this.finishJump(timestamp, events);
      }
    } else if (closed) {
      this.phase =
        this.records.length > 0 &&
        this.lastActivityAt !== null &&
        timestamp - this.lastActivityAt >= 1_800
          ? "resting"
          : "closed";
    }

    const message: Record<JumpingJackPhase, string> = {
      calibrating: "请正面站直，手脚并拢",
      closed: "准备好了｜按自己的节奏开始",
      opening: "正在张开｜手脚同步",
      open: "幅度到位｜顺势收回",
      closing: "正在收回｜落地保持稳定",
      resting: "已暂停计时｜准备好后直接继续",
      paused: "识别已暂停",
    };
    return this.analysis(metrics, message[this.phase], events, "stable");
  }

  getSummary(endedAt = new Date()): SessionSummary {
    const issueCounts: Partial<Record<IssueKey, number>> = {
      arms: 0,
      feet: 0,
      sync: 0,
      symmetry: 0,
    };
    for (const record of this.records) {
      for (const issue of record.issues) issueCounts[issue] = (issueCounts[issue] ?? 0) + 1;
    }
    return {
      id: `${endedAt.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      endedAt: endedAt.toISOString(),
      exerciseId: "jumping-jack",
      totalReps: this.records.length,
      qualifiedReps: this.records.filter((record) => record.qualified).length,
      averageTempoSeconds: this.records.length
        ? this.records.reduce((sum, record) => sum + record.durationMs, 0) / this.records.length / 1_000
        : null,
      issueCounts,
    };
  }

  private calibrate(
    pose: DetectedPose,
    metrics: JumpingJackMetrics,
    timestamp: number,
  ): FrameAnalysis {
    const leftHip = point(pose.landmarks, 23)!;
    const rightHip = point(pose.landmarks, 24)!;
    const leftAnkle = point(pose.landmarks, 27)!;
    const rightAnkle = point(pose.landmarks, 28)!;
    const hipSpan = Math.max(0.025, Math.abs(leftHip.x - rightHip.x) * pose.aspectRatio);
    const footRatio = Math.abs(leftAnkle.x - rightAnkle.x) * pose.aspectRatio / hipSpan;
    const closed = metrics.armProgress < 0.2 && footRatio < 1.55;
    if (!closed) {
      this.calibrationStartedAt = null;
      this.calibrationFootRatios = [];
      return this.analysis(metrics, "请正面站直，双手放下、双脚并拢", [], "stable");
    }
    this.calibrationStartedAt ??= timestamp;
    this.calibrationFootRatios.push(footRatio);
    const elapsed = timestamp - this.calibrationStartedAt;
    const events: CoachEvent[] = [];
    if (elapsed >= 700 && this.calibrationFootRatios.length >= 6) {
      this.closedFootRatio = this.calibrationFootRatios.reduce((sum, value) => sum + value, 0) / this.calibrationFootRatios.length;
      this.calibrated = true;
      this.phase = "closed";
      this.lastActivityAt = timestamp;
      events.push(this.event("status", "jack:calibrated", "校准完成｜可以直接开始", "可以开始", 900));
    }
    return this.analysis(
      metrics,
      this.calibrated ? "准备好了｜按自己的节奏开始" : `保持并拢，正在校准 ${Math.min(100, Math.round(elapsed / 7))}%`,
      events,
      "stable",
    );
  }

  private finishJump(timestamp: number, events: CoachEvent[]): void {
    const jump = this.currentJump;
    if (!jump) return;
    const durationMs = timestamp - jump.startedAt;
    if (jump.reachedPeak && durationMs >= 220 && durationMs <= 3_000) {
      if (jump.maxArm < 0.78) jump.issues.add("arms");
      if (jump.maxFeet < 0.78) jump.issues.add("feet");
      if (
        jump.armOpenedAt !== null &&
        jump.feetOpenedAt !== null &&
        Math.abs(jump.armOpenedAt - jump.feetOpenedAt) > 180
      ) jump.issues.add("sync");
      if (jump.maxSymmetryError > 0.48) jump.issues.add("symmetry");
      const record: RepRecord = {
        durationMs,
        descentMs: durationMs / 2,
        qualified: jump.issues.size === 0,
        issues: [...jump.issues],
      };
      this.records.push(record);
      this.completedRep = { repNumber: this.records.length, exerciseId: "jumping-jack", ...record };
      const advice = buildRepAdvice(this.completedRep);
      events.push(this.event("result", `jack:complete:${this.records.length}`, advice.message, advice.speech, 1_400, 4, true));
    }
    this.currentJump = null;
    this.phase = "closed";
    this.lastActivityAt = timestamp;
  }

  private handleTrackingLoss(timestamp: number): FrameAnalysis {
    this.unstableSince ??= timestamp;
    const withinGrace = this.lastValidAt !== null && timestamp - this.lastValidAt <= 280;
    if (!withinGrace && timestamp - this.unstableSince >= 420) {
      this.currentJump = null;
      this.phase = this.calibrated ? "paused" : "calibrating";
    }
    const event = this.event(
      "tracking",
      "jack:tracking",
      "关键点暂时不稳定｜请正面站在画面中央",
      "识别不稳",
      900,
      0,
    );
    return {
      exerciseId: "jumping-jack",
      calibrated: this.calibrated,
      phase: withinGrace ? this.phase : "paused",
      totalReps: this.records.length,
      qualifiedReps: this.records.filter((record) => record.qualified).length,
      kneeAngle: null,
      trunkLean: null,
      side: null,
      bodyView: "front",
      currentRepMs: this.currentJump ? timestamp - this.currentJump.startedAt : null,
      trackingState: withinGrace ? "grace" : "lost",
      trackingConfidence: null,
      completedRep: null,
      motionScore: this.lastMotionScore,
      secondaryScore: null,
      statusMessage: withinGrace ? "识别短暂波动，保持当前动作" : "识别已暂停，请回到画面中央",
      events: withinGrace ? [] : [event],
    };
  }

  private event(
    kind: CoachEvent["kind"],
    key: string,
    message: string,
    speechMessage: string,
    lifetime: number,
    priority = kind === "correction" ? 1 : 3,
    interrupt = false,
  ): CoachEvent {
    return {
      key,
      kind,
      message,
      priority,
      speak: true,
      speechMessage,
      speechCooldownMs: 350,
      interrupt,
      holdMs: Math.min(lifetime, kind === "phase" ? 350 : lifetime),
      exerciseId: "jumping-jack",
      repId: this.records.length + 1,
      phase: this.phase,
      createdAt: this.now,
      expiresAt: this.now + lifetime,
      scope: kind === "result" ? "next-rep" : "current-phase",
      confidence: 0.9,
    };
  }

  private analysis(
    metrics: JumpingJackMetrics,
    statusMessage: string,
    events: CoachEvent[],
    trackingState: "stable" | "grace" | "lost",
  ): FrameAnalysis {
    return {
      exerciseId: "jumping-jack",
      calibrated: this.calibrated,
      phase: this.phase,
      totalReps: this.records.length,
      qualifiedReps: this.records.filter((record) => record.qualified).length,
      kneeAngle: null,
      trunkLean: metrics.trunkLean,
      side: null,
      bodyView: "front",
      currentRepMs: this.currentJump ? this.now - this.currentJump.startedAt : null,
      trackingState,
      trackingConfidence: metrics.visibility,
      completedRep: this.completedRep,
      motionScore: Math.max(metrics.armProgress, metrics.footProgress),
      secondaryScore: Math.min(metrics.armProgress, metrics.footProgress),
      statusMessage,
      events,
    };
  }
}
