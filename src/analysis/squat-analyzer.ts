import {
  bestVisibleSide,
  estimateBodyView,
  frontKneeAlignmentRatio,
  isSideNearFrameEdge,
  sideMetrics,
  sideVisibility,
} from "./geometry";
import { LandmarkSmoother } from "./landmark-smoother";
import { buildRepAdvice } from "../coaching";
import type {
  BodySide,
  BodyView,
  CoachEvent,
  CompletedRep,
  DetectedPose,
  FrameAnalysis,
  IssueKey,
  RepRecord,
  SessionSummary,
  SquatPhase,
  TrackingState,
} from "../types";

type ActivePhase = Exclude<SquatPhase, "paused">;
type TrackingReason = "no-pose" | "low-confidence" | "edge";

interface AnalyzerConfig {
  calibrationMs: number;
  calibrationMinSamples: number;
  minVisibility: number;
  standingAngle: number;
  descentStartAngle: number;
  descentCueAngle: number;
  depthKneeAngle: number;
  depthHipOffset: number;
  riseDelta: number;
  strongRiseDelta: number;
  riseFrames: number;
  leanPersistMs: number;
  kneeAlignmentRatio: number;
  kneeAlignmentDrop: number;
  kneeAlignmentPersistMs: number;
  viewConfirmMs: number;
  minDescentMs: number;
  minRepMs: number;
  maxRepMs: number;
  trackingGraceMs: number;
  trackingLossResetMs: number;
  maxFrameGapMs: number;
  sideSwitchMs: number;
  lockoutConfirmMs: number;
}

interface CurrentRep {
  startedAt: number;
  descentStartedAt: number;
  descentMs: number | null;
  minKneeAngle: number;
  maxTrunkLean: number;
  depthReached: boolean;
  bottomCueSent: boolean;
  reversalStartedAt: number | null;
  baselineKneeAlignmentRatio: number | null;
  pausedMs: number;
  descentPausedMs: number;
  issues: Set<IssueKey>;
}

interface StableMetrics {
  kneeAngle: number;
  trunkLean: number;
  side: BodySide;
  bodyView: BodyView;
}

const DEFAULT_CONFIG: AnalyzerConfig = {
  calibrationMs: 1_800,
  calibrationMinSamples: 12,
  minVisibility: 0.45,
  standingAngle: 155,
  descentStartAngle: 138,
  descentCueAngle: 158,
  depthKneeAngle: 115,
  depthHipOffset: -0.025,
  riseDelta: 0.8,
  strongRiseDelta: 8,
  riseFrames: 2,
  leanPersistMs: 240,
  kneeAlignmentRatio: 0.62,
  kneeAlignmentDrop: 0.18,
  kneeAlignmentPersistMs: 180,
  viewConfirmMs: 260,
  minDescentMs: 450,
  minRepMs: 450,
  maxRepMs: 15_000,
  trackingGraceMs: 350,
  trackingLossResetMs: 500,
  maxFrameGapMs: 250,
  sideSwitchMs: 350,
  lockoutConfirmMs: 180,
};

const PHASE_MESSAGE: Record<ActivePhase, string> = {
  calibrating: "请站直并保持全身入镜",
  standing: "准备好了，我会跟随你的动作",
  descending: "正在下蹲｜吸气，保持脚掌稳定",
  bottom: "到达最低点｜不用停留，准备起身",
  ascending: "正在起身｜呼气，臀腿发力站直",
};

export class SquatAnalyzer {
  private readonly config: AnalyzerConfig;
  private readonly smoother = new LandmarkSmoother();
  private calibrated = false;
  private phase: ActivePhase = "calibrating";
  private side: BodySide | null = null;
  private calibrationStartedAt: number | null = null;
  private calibrationLeanSamples: number[] = [];
  private baselineTrunkLean = 0;
  private lastKneeAngle: number | null = null;
  private lastKneeAt: number | null = null;
  private lastMetricSource: "world" | "image" | null = null;
  private lastValidAt: number | null = null;
  private lastStableMetrics: StableMetrics | null = null;
  private trackingState: TrackingState = "lost";
  private trackingConfidence: number | null = null;
  private trackingUnstableSince: number | null = null;
  private trackingPauseStartedAt: number | null = null;
  private alternateSideSince: number | null = null;
  private currentRep: CurrentRep | null = null;
  private risingFrames = 0;
  private leanViolationSince: number | null = null;
  private kneeViolationSince: number | null = null;
  private lockoutStartedAt: number | null = null;
  private needsStandingReset = false;
  private repRecords: RepRecord[] = [];
  private completedRep: CompletedRep | null = null;
  private bodyView: BodyView = "unknown";
  private descentCueActive = false;
  private descentCueStartedAt: number | null = null;
  private attemptSequence = 0;
  private viewCandidate: BodyView | null = null;
  private viewCandidateSince: number | null = null;
  private standingKneeAlignmentRatio: number | null = null;
  private analysisTimestamp = 0;

  constructor(config: Partial<AnalyzerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  reset(): void {
    this.smoother.reset();
    this.calibrated = false;
    this.phase = "calibrating";
    this.side = null;
    this.calibrationStartedAt = null;
    this.calibrationLeanSamples = [];
    this.baselineTrunkLean = 0;
    this.lastKneeAngle = null;
    this.lastKneeAt = null;
    this.lastMetricSource = null;
    this.lastValidAt = null;
    this.lastStableMetrics = null;
    this.trackingState = "lost";
    this.trackingConfidence = null;
    this.trackingUnstableSince = null;
    this.trackingPauseStartedAt = null;
    this.alternateSideSince = null;
    this.currentRep = null;
    this.risingFrames = 0;
    this.leanViolationSince = null;
    this.kneeViolationSince = null;
    this.lockoutStartedAt = null;
    this.needsStandingReset = false;
    this.repRecords = [];
    this.completedRep = null;
    this.bodyView = "unknown";
    this.descentCueActive = false;
    this.descentCueStartedAt = null;
    this.attemptSequence = 0;
    this.viewCandidate = null;
    this.viewCandidateSince = null;
    this.standingKneeAlignmentRatio = null;
  }

  analyze(pose: DetectedPose | null, timestamp: number): FrameAnalysis<SquatPhase> {
    this.analysisTimestamp = timestamp;
    const events: CoachEvent[] = [];
    this.completedRep = null;

    if (!pose || pose.landmarks.length < 33) {
      this.alternateSideSince = null;
      return this.handleTrackingInstability(
        timestamp,
        events,
        "no-pose",
        null,
      );
    }

    let activeSide = this.selectActiveSide(pose.landmarks, timestamp);
    let rawMetrics = sideMetrics(
      pose.landmarks,
      activeSide,
      pose.aspectRatio,
      pose.worldLandmarks,
    );

    if (!rawMetrics || rawMetrics.visibility < this.config.minVisibility) {
      const reason: TrackingReason = isSideNearFrameEdge(
        pose.landmarks,
        activeSide,
      )
        ? "edge"
        : "low-confidence";
      return this.handleTrackingInstability(
        timestamp,
        events,
        reason,
        rawMetrics?.visibility ?? null,
      );
    }

    if (this.hasTrackingGapExpired(timestamp)) {
      this.resetAfterTrackingGap();
      activeSide = this.selectActiveSide(pose.landmarks, timestamp);
      rawMetrics = sideMetrics(
        pose.landmarks,
        activeSide,
        pose.aspectRatio,
        pose.worldLandmarks,
      );
      if (!rawMetrics || rawMetrics.visibility < this.config.minVisibility) {
        return this.handleTrackingInstability(
          timestamp,
          events,
          "low-confidence",
          rawMetrics?.visibility ?? null,
        );
      }
    }

    this.updateBodyView(
      estimateBodyView(
        pose.landmarks,
        pose.worldLandmarks,
        0.2,
        pose.aspectRatio,
      ),
      timestamp,
      events,
    );

    const smoothed = this.smoother.update(pose.landmarks);
    const metrics = sideMetrics(
      smoothed,
      activeSide,
      pose.aspectRatio,
      pose.worldLandmarks,
    );
    if (!metrics) {
      return this.handleTrackingInstability(
        timestamp,
        events,
        "low-confidence",
        rawMetrics.visibility,
      );
    }

    this.resumeRepAfterTrackingPause(timestamp);
    this.trackingUnstableSince = null;
    this.trackingState = "stable";
    this.trackingConfidence = rawMetrics.visibility;
    this.lastStableMetrics = {
      kneeAngle: metrics.kneeAngle,
      trunkLean: metrics.trunkLean,
      side: activeSide,
      bodyView: this.bodyView,
    };
    this.lastValidAt = timestamp;

    if (!this.calibrated) {
      return this.handleCalibration(
        activeSide,
        metrics.kneeAngle,
        metrics.trunkLean,
        metrics.source,
        smoothed,
        timestamp,
        events,
      );
    }

    if (this.needsStandingReset) {
      if (metrics.kneeAngle >= this.config.standingAngle) {
        this.needsStandingReset = false;
        this.phase = "standing";
        this.lastKneeAngle = metrics.kneeAngle;
        this.lastKneeAt = timestamp;
      } else {
        return this.buildAnalysis({
          phase: "paused",
          kneeAngle: metrics.kneeAngle,
          trunkLean: metrics.trunkLean,
          statusMessage: "请先站直，再开始下一次动作",
          events,
        });
      }
    }

    if (
      this.lastMetricSource !== null &&
      this.lastMetricSource !== metrics.source
    ) {
      this.lastKneeAngle = null;
      this.lastKneeAt = null;
      this.risingFrames = 0;
      if (this.currentRep) {
        this.currentRep.reversalStartedAt = null;
      }
    }
    this.lastMetricSource = metrics.source;

    const previousKneeAt = this.lastKneeAt;
    const previousKneeAngle = this.lastKneeAngle;
    const delta =
      previousKneeAngle === null ? 0 : metrics.kneeAngle - previousKneeAngle;
    this.lastKneeAngle = metrics.kneeAngle;
    this.lastKneeAt = timestamp;

    if (
      this.phase === "standing" &&
      this.bodyView === "front" &&
      metrics.kneeAngle >= this.config.standingAngle
    ) {
      const standingRatio = frontKneeAlignmentRatio(
        smoothed,
        this.config.minVisibility,
      );
      if (standingRatio !== null) {
        this.standingKneeAlignmentRatio = this.standingKneeAlignmentRatio === null
          ? standingRatio
          : this.standingKneeAlignmentRatio * 0.8 + standingRatio * 0.2;
      }
    }

    if (this.currentRep) {
      this.currentRep.minKneeAngle = Math.min(
        this.currentRep.minKneeAngle,
        metrics.kneeAngle,
        rawMetrics.kneeAngle,
      );
      this.currentRep.maxTrunkLean = Math.max(
        this.currentRep.maxTrunkLean,
        metrics.trunkLean,
      );
      this.currentRep.depthReached ||=
        rawMetrics.kneeAngle <= this.config.depthKneeAngle ||
        ((this.bodyView === "side" || this.bodyView === "oblique") &&
          rawMetrics.hipToKneeDepth >= this.config.depthHipOffset);
      if (this.bodyView === "side" || this.bodyView === "oblique") {
        this.kneeViolationSince = null;
        this.checkLean(metrics.trunkLean, timestamp, events);
      } else {
        this.leanViolationSince = null;
        if (this.bodyView === "front") {
          this.checkKneeAlignment(
            smoothed,
            metrics.kneeAngle,
            timestamp,
            events,
          );
        } else {
          this.kneeViolationSince = null;
        }
      }
    }

    if (this.phase === "standing") {
      if (
        !this.descentCueActive &&
        metrics.kneeAngle < this.config.descentCueAngle &&
        delta < -0.8
      ) {
        this.descentCueActive = true;
        this.descentCueStartedAt = previousKneeAt ?? timestamp;
        events.push({
          key: `phase:descent-cue:${this.attemptSequence + 1}`,
          kind: "phase",
          message: "跟上了｜吸气下蹲，脚掌保持稳定",
          priority: 3,
          speak: true,
          speechMessage: "下蹲",
          speechCooldownMs: 450,
        });
      }
      if (metrics.kneeAngle >= this.config.descentCueAngle + 4) {
        this.descentCueActive = false;
        this.descentCueStartedAt = null;
      }
      if (
        this.descentCueActive &&
        this.descentCueStartedAt !== null &&
        timestamp - this.descentCueStartedAt > 1_200
      ) {
        this.descentCueActive = false;
        this.descentCueStartedAt = null;
      }
      if (
        metrics.kneeAngle < this.config.descentStartAngle &&
        delta < -0.3
      ) {
        this.startRep(
          this.descentCueStartedAt ?? timestamp,
          metrics.kneeAngle,
          metrics.trunkLean,
          rawMetrics.kneeAngle,
          rawMetrics.hipToKneeDepth,
        );
        this.phase = "descending";
        if (this.currentRep?.depthReached && !this.currentRep.bottomCueSent) {
          this.currentRep.bottomCueSent = true;
          this.phase = "bottom";
          events.push({
            key: `phase:bottom:${this.attemptSequence}`,
            kind: "phase",
            message: "深度到位｜不用停留，顺势准备起身",
            priority: 3,
            speak: false,
            speechMessage: "深度到位",
            speechCooldownMs: 450,
          });
        }
        if (!this.descentCueActive) {
          events.push({
            key: `phase:descent:${this.attemptSequence}`,
            kind: "phase",
            message: "正在下蹲｜吸气，脚掌保持稳定",
            priority: 3,
            speak: true,
            speechMessage: "下蹲",
            speechCooldownMs: 450,
          });
        }
      }
    } else if (this.phase === "descending" || this.phase === "bottom") {
      if (this.currentRep?.depthReached && !this.currentRep.bottomCueSent) {
        this.currentRep.bottomCueSent = true;
        this.phase = "bottom";
        events.push({
          key: `phase:bottom:${this.attemptSequence}`,
          kind: "phase",
          message: "深度到位｜不用停留，顺势准备起身",
          priority: 3,
          speak: false,
          speechMessage: "深度到位",
          speechCooldownMs: 450,
        });
      }

      if (delta > this.config.riseDelta) {
        if (this.risingFrames === 0 && this.currentRep) {
          this.currentRep.reversalStartedAt = previousKneeAt ?? timestamp;
        }
        this.risingFrames =
          delta >= this.config.strongRiseDelta
            ? this.config.riseFrames
            : this.risingFrames + 1;
      } else {
        this.risingFrames = 0;
        if (this.currentRep) {
          this.currentRep.reversalStartedAt = null;
        }
      }

      if (this.risingFrames >= this.config.riseFrames && this.currentRep) {
        this.currentRep.descentMs =
          (this.currentRep.reversalStartedAt ?? timestamp) -
          this.currentRep.descentStartedAt -
          this.currentRep.descentPausedMs;

        if (!this.currentRep.depthReached) {
          this.currentRep.issues.add("depth");
        }

        if (this.currentRep.descentMs < this.config.minDescentMs) {
          this.currentRep.issues.add("speed");
        }

        this.phase = "ascending";
        this.risingFrames = 0;
        const ascentCorrection = this.currentRep.issues.has("knees")
          ? {
              message: "正在起身｜呼气，膝盖朝向脚尖并稳定站直",
              speech: "呼气，膝盖朝脚尖站起",
            }
          : this.currentRep.issues.has("lean")
            ? {
                message: "正在起身｜呼气，抬起胸口并稳定站直",
                speech: "呼气，抬胸站起",
              }
            : {
                message: "正在起身｜呼气，臀腿发力站直",
                speech: "起身",
              };
        const hasLiveAscentCorrection =
          this.currentRep.issues.has("knees") ||
          this.currentRep.issues.has("lean");
        events.push({
          key: `phase:ascent:${this.attemptSequence}`,
          kind: "phase",
          message: ascentCorrection.message,
          priority: 3,
          speak: true,
          speechMessage: ascentCorrection.speech,
          speechCooldownMs: 450,
          interrupt: !hasLiveAscentCorrection,
        });
      }
    } else if (this.phase === "ascending") {
      if (metrics.kneeAngle >= this.config.standingAngle && delta >= -0.2) {
        this.lockoutStartedAt ??= timestamp;
        if (timestamp - this.lockoutStartedAt >= this.config.lockoutConfirmMs) {
          this.finishRep(timestamp, events);
        }
      } else {
        this.lockoutStartedAt = null;
      }
    }

    if (
      this.currentRep &&
      timestamp -
        this.currentRep.startedAt -
        this.currentRep.pausedMs >
        this.config.maxRepMs
    ) {
      this.cancelCurrentRep();
      this.needsStandingReset = true;
      return this.buildAnalysis({
        phase: "paused",
        kneeAngle: metrics.kneeAngle,
        trunkLean: metrics.trunkLean,
        statusMessage: "本次动作时间过长，请站直后重新开始",
        events,
      });
    }

    return this.buildAnalysis({
      phase: this.phase,
      kneeAngle: metrics.kneeAngle,
      trunkLean: metrics.trunkLean,
      statusMessage: PHASE_MESSAGE[this.phase],
      events,
    });
  }

  getSummary(endedAt = new Date()): SessionSummary {
    const averageTempoSeconds = this.repRecords.length
      ? this.repRecords.reduce((sum, rep) => sum + rep.durationMs, 0) /
        this.repRecords.length /
        1_000
      : null;
    const issueCounts: Partial<Record<IssueKey, number>> = {
      depth: 0,
      lean: 0,
      knees: 0,
      speed: 0,
    };

    for (const rep of this.repRecords) {
      for (const issue of rep.issues) {
        issueCounts[issue] = (issueCounts[issue] ?? 0) + 1;
      }
    }

    return {
      id: `${endedAt.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      endedAt: endedAt.toISOString(),
      exerciseId: "squat",
      totalReps: this.repRecords.length,
      qualifiedReps: this.repRecords.filter((rep) => rep.qualified).length,
      averageTempoSeconds,
      issueCounts,
    };
  }

  private selectActiveSide(
    landmarks: DetectedPose["landmarks"],
    timestamp: number,
  ): BodySide {
    if (!this.side) {
      return bestVisibleSide(landmarks);
    }

    if (!this.calibrated) {
      this.alternateSideSince = null;
      return this.side;
    }

    const currentSide = this.side;
    const alternateSide: BodySide = currentSide === "left" ? "right" : "left";
    const currentVisibility = sideVisibility(landmarks, currentSide);
    const alternateVisibility = sideVisibility(landmarks, alternateSide);
    const alternateIsClearlyBetter =
      currentVisibility < this.config.minVisibility &&
      alternateVisibility >= this.config.minVisibility;

    if (!alternateIsClearlyBetter) {
      this.alternateSideSince = null;
      return currentSide;
    }

    this.alternateSideSince ??= timestamp;
    if (timestamp - this.alternateSideSince < this.config.sideSwitchMs) {
      return currentSide;
    }

    this.side = alternateSide;
    this.alternateSideSince = null;
    this.lastKneeAngle = null;
    this.lastKneeAt = null;
    this.lastMetricSource = null;
    this.smoother.reset();
    return alternateSide;
  }

  private handleCalibration(
    activeSide: BodySide,
    kneeAngle: number,
    trunkLean: number,
    metricSource: "world" | "image",
    landmarks: DetectedPose["landmarks"],
    timestamp: number,
    events: CoachEvent[],
  ): FrameAnalysis<SquatPhase> {
    if (kneeAngle < this.config.standingAngle - 5) {
      this.calibrationStartedAt = null;
      this.calibrationLeanSamples = [];
      return this.buildAnalysis({
        phase: "calibrating",
        kneeAngle,
        trunkLean,
        statusMessage: "请站直并保持全身入镜",
        events,
        side: activeSide,
      });
    }

    this.calibrationStartedAt ??= timestamp;
    this.calibrationLeanSamples.push(trunkLean);
    if (this.bodyView === "front") {
      const standingRatio = frontKneeAlignmentRatio(
        landmarks,
        this.config.minVisibility,
      );
      if (standingRatio !== null) {
        this.standingKneeAlignmentRatio = this.standingKneeAlignmentRatio === null
          ? standingRatio
          : this.standingKneeAlignmentRatio * 0.8 + standingRatio * 0.2;
      }
    }
    const elapsed = timestamp - this.calibrationStartedAt;

    if (
      elapsed >= this.config.calibrationMs &&
      this.calibrationLeanSamples.length >= this.config.calibrationMinSamples
    ) {
      this.calibrated = true;
      this.side = activeSide;
      this.phase = "standing";
      this.baselineTrunkLean =
        this.calibrationLeanSamples.reduce((sum, value) => sum + value, 0) /
        this.calibrationLeanSamples.length;
      this.lastKneeAngle = kneeAngle;
      this.lastKneeAt = timestamp;
      this.lastMetricSource = metricSource;
      events.push({
        key: "calibrated",
        kind: "status",
        message: "校准完成，可以开始",
        priority: 1,
        speak: true,
        speechMessage: "校准完成。下降吸气，起身呼气",
      });
    }

    return this.buildAnalysis({
      phase: this.phase,
      kneeAngle,
      trunkLean,
      statusMessage: this.calibrated
        ? "校准完成｜按自己的节奏，下降吸气，起身呼气"
        : `保持站直，正在校准 ${Math.min(100, Math.round((elapsed / this.config.calibrationMs) * 100))}%`,
      events,
      side: activeSide,
    });
  }

  private handleTrackingInstability(
    timestamp: number,
    events: CoachEvent[],
    reason: TrackingReason,
    confidence: number | null,
  ): FrameAnalysis<SquatPhase> {
    if (this.currentRep && this.trackingPauseStartedAt === null) {
      const gapSinceLastValid =
        this.lastValidAt === null ? 0 : timestamp - this.lastValidAt;
      this.trackingPauseStartedAt =
        this.lastValidAt !== null &&
        gapSinceLastValid > this.config.maxFrameGapMs
          ? this.lastValidAt
          : timestamp;
      this.lockoutStartedAt = null;
      this.leanViolationSince = null;
      this.kneeViolationSince = null;
    }
    this.trackingUnstableSince ??= timestamp;
    this.viewCandidate = null;
    this.viewCandidateSince = null;
    this.trackingConfidence = confidence;
    const withinLossWindow = !this.hasTrackingGapExpired(timestamp);

    if (
      this.lastStableMetrics &&
      withinLossWindow &&
      timestamp - this.trackingUnstableSince < this.config.trackingGraceMs
    ) {
      this.trackingState = "grace";
      return this.buildAnalysis({
        phase: this.phase,
        kneeAngle: this.lastStableMetrics.kneeAngle,
        trunkLean: this.lastStableMetrics.trunkLean,
        statusMessage: "识别短暂波动，正在保持当前动作",
        events,
        side: this.lastStableMetrics.side,
      });
    }

    return this.handleTrackingLoss(timestamp, events, reason, confidence);
  }

  private handleTrackingLoss(
    timestamp: number,
    events: CoachEvent[],
    reason: TrackingReason,
    confidence: number | null,
  ): FrameAnalysis<SquatPhase> {
    this.trackingState = "lost";
    this.trackingConfidence = confidence;
    if (this.hasTrackingGapExpired(timestamp)) {
      this.resetAfterTrackingGap();
    }

    const message: Record<TrackingReason, string> = {
      "no-pose": "没有稳定识别到人体，请站到画面中央并保持全身入镜",
      "low-confidence": "关键点暂时不稳定，请调整朝向或稍微放慢动作",
      edge: "身体靠近画面边缘，请稍微后退一点",
    };
    const speechMessage: Record<TrackingReason, string> = {
      "no-pose": "没有识别到人体，请回到画面",
      "low-confidence": "识别不稳，请调整朝向",
      edge: "身体靠近边缘，请稍微后退",
    };

    events.push({
      key: "tracking",
      kind: "tracking",
      message: message[reason],
      priority: 0,
      speak: true,
      speechMessage: speechMessage[reason],
      speechCooldownMs: 1_500,
    });

    return this.buildAnalysis({
      phase: "paused",
      kneeAngle: null,
      trunkLean: null,
      statusMessage: `${message[reason]}，已暂停计数`,
      events,
    });
  }

  private hasTrackingGapExpired(timestamp: number): boolean {
    if (this.trackingUnstableSince !== null) {
      const gapBeforeFirstInvalid =
        this.lastValidAt === null
          ? 0
          : this.trackingUnstableSince - this.lastValidAt;
      const gapStartedAt =
        this.lastValidAt !== null &&
        gapBeforeFirstInvalid > this.config.maxFrameGapMs
          ? this.lastValidAt
          : this.trackingUnstableSince;
      return timestamp - gapStartedAt > this.config.trackingLossResetMs;
    }

    return (
      this.lastValidAt !== null &&
      timestamp - this.lastValidAt > this.config.trackingLossResetMs
    );
  }

  private resetAfterTrackingGap(): void {
    this.smoother.reset();
    this.cancelCurrentRep();
    this.needsStandingReset = this.calibrated;
    this.lastValidAt = null;
    this.lastStableMetrics = null;
    this.trackingUnstableSince = null;
    this.alternateSideSince = null;
    this.viewCandidate = null;
    this.viewCandidateSince = null;
    if (!this.calibrated) {
      this.calibrationStartedAt = null;
      this.calibrationLeanSamples = [];
      this.baselineTrunkLean = 0;
      this.side = null;
    }
  }

  private resumeRepAfterTrackingPause(timestamp: number): void {
    if (!this.currentRep || this.trackingPauseStartedAt === null) {
      this.trackingPauseStartedAt = null;
      return;
    }

    const pausedMs = Math.max(0, timestamp - this.trackingPauseStartedAt);
    this.currentRep.pausedMs += pausedMs;
    if (this.phase === "descending" || this.phase === "bottom") {
      this.currentRep.descentPausedMs += pausedMs;
    }
    this.trackingPauseStartedAt = null;
  }

  private startRep(
    timestamp: number,
    kneeAngle: number,
    trunkLean: number,
    rawKneeAngle = kneeAngle,
    rawHipToKneeDepth = Number.NEGATIVE_INFINITY,
  ): void {
    const depthReached =
      rawKneeAngle <= this.config.depthKneeAngle ||
      ((this.bodyView === "side" || this.bodyView === "oblique") &&
        rawHipToKneeDepth >= this.config.depthHipOffset);
    this.currentRep = {
      startedAt: timestamp,
      descentStartedAt: timestamp,
      descentMs: null,
      minKneeAngle: Math.min(kneeAngle, rawKneeAngle),
      maxTrunkLean: trunkLean,
      depthReached,
      bottomCueSent: false,
      reversalStartedAt: null,
      baselineKneeAlignmentRatio: this.standingKneeAlignmentRatio,
      pausedMs: 0,
      descentPausedMs: 0,
      issues: new Set<IssueKey>(),
    };
    this.risingFrames = 0;
    this.attemptSequence += 1;
    this.descentCueActive = true;
    this.descentCueStartedAt = timestamp;
    this.leanViolationSince = null;
    this.kneeViolationSince = null;
    this.lockoutStartedAt = null;
  }

  private updateBodyView(
    observedView: BodyView,
    timestamp: number,
    events: CoachEvent[],
  ): void {
    if (observedView === "unknown") {
      this.viewCandidate = null;
      this.viewCandidateSince = null;
      return;
    }

    if (observedView === this.bodyView) {
      this.viewCandidate = null;
      this.viewCandidateSince = null;
      return;
    }

    if (this.viewCandidate !== observedView) {
      this.viewCandidate = observedView;
      this.viewCandidateSince = timestamp;
      return;
    }

    const candidateSince = this.viewCandidateSince ?? timestamp;
    if (timestamp - candidateSince < this.config.viewConfirmMs) {
      return;
    }

    const previousView = this.bodyView;
    this.bodyView = observedView;
    this.leanViolationSince = null;
    this.kneeViolationSince = null;
    if (observedView === "front" && previousView !== "front") {
      this.standingKneeAlignmentRatio = null;
    }
    this.viewCandidate = null;
    this.viewCandidateSince = null;
    if (!this.calibrated || this.phase !== "standing" || previousView === "unknown") {
      return;
    }

    const viewMessage: Record<Exclude<BodyView, "unknown">, string> = {
      front: "已切到正面｜现在检查膝盖是否跟着脚尖移动",
      side: "已切到侧面｜现在检查深度和躯干稳定",
      oblique: "当前是斜侧面｜继续基础计数，纠正项目会减少",
    };
    const speechMessage: Record<Exclude<BodyView, "unknown">, string> = {
      front: "正面，检查膝盖方向",
      side: "侧面，检查深度",
      oblique: "斜侧面，基础识别",
    };
    events.push({
      key: `view:${observedView}`,
      kind: "status",
      message: viewMessage[observedView],
      priority: 4,
      speak: true,
      speechMessage: speechMessage[observedView],
      speechCooldownMs: 2_000,
      holdMs: 900,
    });
  }

  private checkLean(
    trunkLean: number,
    timestamp: number,
    events: CoachEvent[],
  ): void {
    if (!this.currentRep) {
      return;
    }

    const leanLimit = Math.max(45, this.baselineTrunkLean + 35);
    if (trunkLean > leanLimit) {
      this.leanViolationSince ??= timestamp;
      if (
        timestamp - this.leanViolationSince >= this.config.leanPersistMs
      ) {
        this.currentRep.issues.add("lean");
        events.push({
          key: "lean",
          kind: "correction",
          message: "抬起胸口｜保持背部稳定，继续当前动作",
          priority: 1,
          speak: true,
          speechMessage: "抬胸，背部稳定",
          holdMs: 800,
        });
      }
    } else {
      this.leanViolationSince = null;
    }
  }

  private checkKneeAlignment(
    landmarks: DetectedPose["landmarks"],
    kneeAngle: number,
    timestamp: number,
    events: CoachEvent[],
  ): void {
    if (!this.currentRep || kneeAngle >= 145) {
      this.kneeViolationSince = null;
      return;
    }

    const alignmentRatio = frontKneeAlignmentRatio(
      landmarks,
      this.config.minVisibility,
    );
    const baselineRatio =
      this.currentRep.baselineKneeAlignmentRatio ??
      this.standingKneeAlignmentRatio;
    const inwardDrop =
      alignmentRatio !== null && baselineRatio !== null
        ? baselineRatio - alignmentRatio
        : null;
    if (
      alignmentRatio !== null &&
      baselineRatio !== null &&
      inwardDrop !== null &&
      inwardDrop >= this.config.kneeAlignmentDrop
    ) {
      this.kneeViolationSince ??= timestamp;
      if (
        timestamp - this.kneeViolationSince >=
        this.config.kneeAlignmentPersistMs
      ) {
        this.currentRep.issues.add("knees");
        events.push({
          key: "knees",
          kind: "correction",
          message: "膝盖向内了｜让膝盖跟着脚尖方向移动",
          priority: 1,
          speak: true,
          speechMessage: "膝盖朝向脚尖",
          holdMs: 800,
        });
      }
    } else {
      this.kneeViolationSince = null;
    }
  }

  private finishRep(timestamp: number, events: CoachEvent[]): void {
    const rep = this.currentRep;
    if (!rep) {
      this.phase = "standing";
      return;
    }

    const durationMs = timestamp - rep.startedAt - rep.pausedMs;
    if (durationMs >= this.config.minRepMs && durationMs <= this.config.maxRepMs) {
      const issues = [...rep.issues];
      const qualified = issues.length === 0;
      const record: RepRecord = {
        durationMs,
        descentMs: rep.descentMs ?? durationMs / 2,
        qualified,
        issues,
      };
      this.repRecords.push(record);
      this.completedRep = {
        repNumber: this.repRecords.length,
        exerciseId: "squat",
        ...record,
      };
      const advice = buildRepAdvice(this.completedRep);
      events.push({
        key: `rep-complete:${this.repRecords.length}`,
        kind: "result",
        message: advice.speech,
        priority: 4,
        speak: true,
        speechMessage: advice.speech,
        interrupt: true,
        holdMs: 2_200,
      });
    }

    this.currentRep = null;
    this.trackingPauseStartedAt = null;
    this.phase = "standing";
    this.risingFrames = 0;
    this.leanViolationSince = null;
    this.kneeViolationSince = null;
    this.descentCueActive = false;
    this.descentCueStartedAt = null;
    this.lockoutStartedAt = null;
  }

  private cancelCurrentRep(): void {
    this.currentRep = null;
    this.trackingPauseStartedAt = null;
    this.phase = this.calibrated ? "standing" : "calibrating";
    this.lastKneeAngle = null;
    this.lastKneeAt = null;
    this.risingFrames = 0;
    this.leanViolationSince = null;
    this.kneeViolationSince = null;
    this.descentCueActive = false;
    this.descentCueStartedAt = null;
    this.lockoutStartedAt = null;
  }

  private buildAnalysis({
    phase,
    kneeAngle,
    trunkLean,
    statusMessage,
    events,
    side = this.side,
  }: {
    phase: SquatPhase;
    kneeAngle: number | null;
    trunkLean: number | null;
    statusMessage: string;
      events: CoachEvent[];
    side?: BodySide | null;
  }): FrameAnalysis<SquatPhase> {
    const enrichedEvents = events.map((event) => {
      const lifetime = event.kind === "phase"
        ? 700
        : event.kind === "correction"
          ? 950
          : event.kind === "result"
            ? 1_200
            : event.kind === "tracking"
              ? 1_200
              : 1_000;
      return {
        exerciseId: "squat" as const,
        phase,
        createdAt: this.analysisTimestamp,
        expiresAt: this.analysisTimestamp + lifetime,
        scope: event.kind === "result" ? "next-rep" as const : "current-phase" as const,
        confidence: this.trackingConfidence ?? 1,
        ...event,
      };
    });
    return {
      exerciseId: "squat",
      calibrated: this.calibrated,
      phase,
      totalReps: this.repRecords.length,
      qualifiedReps: this.repRecords.filter((rep) => rep.qualified).length,
      kneeAngle,
      trunkLean,
      side,
      bodyView: this.bodyView,
      currentRepMs: this.currentRep
        ? Math.max(
            0,
            (this.lastValidAt ?? this.currentRep.startedAt) -
              this.currentRep.startedAt -
              this.currentRep.pausedMs,
          )
        : null,
      trackingState: this.trackingState,
      trackingConfidence: this.trackingConfidence,
      completedRep: this.completedRep,
      statusMessage,
      events: enrichedEvents,
    };
  }
}
