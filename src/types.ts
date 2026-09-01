export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface DetectedPose {
  landmarks: PoseLandmark[];
  worldLandmarks: PoseLandmark[];
  aspectRatio: number;
}

export type BodySide = "left" | "right";

import type { ExerciseId } from "./exercise-ids";

export type { ExerciseId } from "./exercise-ids";

export type SquatPhase =
  | "calibrating"
  | "standing"
  | "descending"
  | "bottom"
  | "ascending"
  | "paused";

export type JumpingJackPhase =
  | "calibrating"
  | "closed"
  | "opening"
  | "open"
  | "closing"
  | "resting"
  | "paused";

export type BodyweightPhase =
  | "calibrating"
  | "standing"
  | "descending"
  | "bottom"
  | "ascending"
  | "lifting"
  | "top"
  | "lowering"
  | "left-lift"
  | "right-lift"
  | "plank"
  | "pressing"
  | "holding"
  | "paused";

export type WorkoutPhase = SquatPhase | JumpingJackPhase | BodyweightPhase;

export type TrackingState = "stable" | "grace" | "lost";

export type BodyView = "front" | "side" | "oblique" | "unknown";

export type IssueKey =
  | "depth"
  | "lean"
  | "knees"
  | "speed"
  | "arms"
  | "feet"
  | "sync"
  | "symmetry"
  | "range"
  | "alignment"
  | "stability"
  | "body-line"
  | "rhythm";

export type CoachEventScope =
  | "current-phase"
  | "current-rep"
  | "next-rep"
  | "session";

export type CoachEventKind =
  | "tracking"
  | "result"
  | "correction"
  | "phase"
  | "status";

export interface CoachEvent {
  key: string;
  kind: CoachEventKind;
  message: string;
  priority: number;
  speak: boolean;
  speechMessage?: string;
  speechCooldownMs?: number;
  interrupt?: boolean;
  holdMs?: number;
  exerciseId?: ExerciseId;
  repId?: number;
  phase?: WorkoutPhase;
  createdAt?: number;
  expiresAt?: number;
  scope?: CoachEventScope;
  confidence?: number;
}

export interface RepRecord {
  durationMs: number;
  descentMs: number;
  qualified: boolean;
  issues: IssueKey[];
}

export interface CompletedRep extends RepRecord {
  repNumber: number;
  exerciseId?: ExerciseId;
}

export interface FrameAnalysis<TPhase extends WorkoutPhase = WorkoutPhase> {
  exerciseId?: ExerciseId;
  calibrated: boolean;
  phase: TPhase;
  totalReps: number;
  qualifiedReps: number;
  kneeAngle: number | null;
  trunkLean: number | null;
  side: BodySide | null;
  bodyView: BodyView;
  currentRepMs: number | null;
  trackingState: TrackingState;
  trackingConfidence: number | null;
  completedRep: CompletedRep | null;
  motionScore?: number | null;
  secondaryScore?: number | null;
  validHoldMs?: number | null;
  statusMessage: string;
  events: CoachEvent[];
}

export interface SessionSummary {
  id: string;
  endedAt: string;
  totalReps: number;
  qualifiedReps: number;
  averageTempoSeconds: number | null;
  averageResponseMs?: number | null;
  p95ResponseMs?: number | null;
  exerciseId?: ExerciseId;
  issueCounts: Partial<Record<IssueKey, number>>;
  measurementMode?: "repetitions" | "timed-hold";
  validDurationMs?: number | null;
  activeDurationMs?: number | null;
  estimatedCalories?: number | null;
  weightKgAtSession?: number | null;
  planId?: string;
  planName?: string;
  planCompletedSets?: number;
  planTotalSets?: number;
  planCompleted?: boolean;
  averageRestSeconds?: number | null;
  restPaceCounts?: {
    fast: number;
    standard: number;
    extended: number;
  };
}

export interface ExerciseAnalyzer {
  reset(): void;
  analyze(pose: DetectedPose | null, timestamp: number): FrameAnalysis;
  getSummary(endedAt?: Date): SessionSummary;
}

export type PoseWorkerRequest =
  | { type: "frame"; bitmap: ImageBitmap; timestamp: number }
  | { type: "dispose" };

export type PoseWorkerResponse =
  | { type: "status"; message: string }
  | { type: "ready"; backend: "GPU" | "CPU" }
  | {
      type: "result";
      timestamp: number;
      inferenceMs: number;
      poses: DetectedPose[];
    }
  | { type: "error"; message: string };
