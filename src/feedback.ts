import type {
  CoachEvent,
  CoachEventKind,
  ExerciseId,
  WorkoutPhase,
} from "./types";
import {
  LocalVoicePlayer,
  type LocalVoiceChannel,
} from "./local-voice";

export interface FeedbackContext {
  exerciseId?: ExerciseId;
  repId?: number;
  phase?: WorkoutPhase;
}

export type VoiceEngine = "system" | "local" | "unavailable";

const DEFAULT_HOLD_MS: Record<CoachEventKind, number> = {
  tracking: 2_200,
  result: 2_200,
  correction: 2_200,
  phase: 350,
  status: 350,
};

const TRACKING_RECOVERY_CONFIRM_MS = 600;

function eventRank(event: CoachEvent): number {
  if (event.kind === "tracking") return 0;
  if (event.kind === "result" && event.interrupt === true) return 1;
  if (event.kind === "correction") return 2;
  if (event.kind === "phase" && event.interrupt === true) return 3;
  if (event.kind === "phase") return 4;
  if (event.kind === "result") return 5;
  return 6;
}

export class CoachFeedback {
  private enabled = true;
  private readonly lastSpokenAt = new Map<string, number>();
  private activeMessage = "先开启摄像头";
  private activeKey: string | null = null;
  private activeKind: CoachEventKind | null = null;
  private activePriority = Number.POSITIVE_INFINITY;
  private activeStartedAt = 0;
  private activeUntil = 0;
  private activeSpeaks = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private playbackErrorHandler: (() => void) | null = null;
  private trackingEpisodeActive = false;
  private trackingEpisodeSpoken = false;
  private trackingRecoverySince: number | null = null;

  constructor(
    private readonly cooldownMs = 2_500,
    private readonly localVoice: LocalVoiceChannel = new LocalVoicePlayer(),
  ) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.activeSpeaks = false;
      this.cancelSpeech();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getActiveKey(): string | null {
    return this.activeKey;
  }

  getActiveKind(): CoachEventKind | null {
    return this.activeKind;
  }

  activeMessageUsesSpeech(): boolean {
    return (
      this.enabled &&
      this.activeSpeaks &&
      this.getVoiceEngine() !== "unavailable"
    );
  }

  speechIsEnabledAndAvailable(): boolean {
    return this.enabled && this.getVoiceEngine() !== "unavailable";
  }

  getVoiceEngine(): VoiceEngine {
    if (this.localVoice.isAvailable()) return "local";
    if (this.systemSpeechAvailable()) return "system";
    return "unavailable";
  }

  setPlaybackErrorHandler(handler: (() => void) | null): void {
    this.playbackErrorHandler = handler;
  }

  speakNow(message: string): boolean {
    if (!this.speechIsEnabledAndAvailable()) return false;
    return this.playSpeech(message, true);
  }

  interruptSpeech(): void {
    this.activeSpeaks = false;
    this.cancelSpeech();
  }

  process(
    events: CoachEvent[],
    fallbackMessage: string,
    timestamp = performance.now(),
    context: FeedbackContext = {},
  ): string {
    const event = events.map((candidate, order) => ({ candidate, order })).filter(({ candidate }) => {
      if (candidate.expiresAt !== undefined && timestamp > candidate.expiresAt) {
        return false;
      }
      if (
        candidate.exerciseId !== undefined &&
        context.exerciseId !== undefined &&
        candidate.exerciseId !== context.exerciseId
      ) {
        return false;
      }
      if (
        candidate.scope === "current-phase" &&
        candidate.phase !== undefined &&
        context.phase !== undefined &&
        candidate.phase !== context.phase
      ) {
        return false;
      }
      if (
        candidate.scope === "current-rep" &&
        candidate.repId !== undefined &&
        context.repId !== undefined &&
        candidate.repId !== context.repId
      ) {
        return false;
      }
      return candidate.confidence === undefined || candidate.confidence >= 0.45;
    }).sort((first, second) => {
      return (
        eventRank(first.candidate) - eventRank(second.candidate) ||
        first.candidate.priority - second.candidate.priority ||
        second.order - first.order
      );
    })[0]?.candidate;
    let speechWasCancelled = false;

    if (event?.kind === "tracking") {
      if (!this.trackingEpisodeActive) {
        this.trackingEpisodeActive = true;
        this.trackingEpisodeSpoken = false;
      }
      this.trackingRecoverySince = null;
    } else if (this.trackingEpisodeActive) {
      this.trackingRecoverySince ??= timestamp;
      if (timestamp - this.trackingRecoverySince >= TRACKING_RECOVERY_CONFIRM_MS) {
        this.trackingEpisodeActive = false;
        this.trackingEpisodeSpoken = false;
        this.trackingRecoverySince = null;
      }
    }

    if (event && this.activeKind === "tracking" && event.kind !== "tracking") {
      this.cancelSpeech();
      speechWasCancelled = true;
      this.clearActive(fallbackMessage);
    }

    if (event && this.canReplaceActive(event, timestamp)) {
      const sameEventAlreadyUsesSpeech =
        event.key === this.activeKey && this.activeSpeaks;
      const startsNewPhase =
        event.kind === "phase" &&
        (this.activeKind !== "phase" || this.activeKey !== event.key);
      if (startsNewPhase && !speechWasCancelled) {
        // A stage change must never wait behind speech from the previous stage.
        this.cancelSpeech();
        speechWasCancelled = true;
      }
      this.activate(event, timestamp);
      if (event.speak) {
        const suppressRepeatedTracking =
          event.kind === "tracking" && this.trackingEpisodeSpoken;
        const started = suppressRepeatedTracking
          ? false
          : this.speak(event, timestamp, !speechWasCancelled);
        if (event.kind === "tracking" && started) {
          this.trackingEpisodeSpoken = true;
        }
        this.activeSpeaks = started || sameEventAlreadyUsesSpeech;
      }
    } else if (this.activeKind === "tracking" || timestamp >= this.activeUntil) {
      if (this.activeKind === "tracking" || this.activeSpeaks) {
        this.cancelSpeech();
      }
      this.clearActive(fallbackMessage);
    }

    return this.activeMessage;
  }

  reset(message = "请站直，准备校准"): void {
    this.lastSpokenAt.clear();
    this.activeMessage = message;
    this.activeKey = null;
    this.activeKind = null;
    this.activePriority = Number.POSITIVE_INFINITY;
    this.activeStartedAt = 0;
    this.activeUntil = 0;
    this.activeSpeaks = false;
    this.trackingEpisodeActive = false;
    this.trackingEpisodeSpoken = false;
    this.trackingRecoverySince = null;
    this.cancelSpeech();
  }

  private canReplaceActive(event: CoachEvent, timestamp: number): boolean {
    if (this.activeKey === null || timestamp >= this.activeUntil) return true;
    if (event.kind === "tracking") return true;
    if (this.activeKind === "tracking") return false;
    if (event.key === this.activeKey) return true;

    if (event.kind === "phase" && event.interrupt === true) {
      return this.activeKind !== "correction" || timestamp - this.activeStartedAt >= 450;
    }
    if (event.kind === "result" && event.interrupt === true) return true;

    if (event.kind === "correction") {
      return (
        this.activeKind !== "correction" ||
        event.priority < this.activePriority
      );
    }

    if (event.kind === "phase") {
      return (
        this.activeKind === "phase" ||
        this.activeKind === "result" ||
        this.activeKind === "status"
      );
    }

    if (event.kind === "result") {
      return this.activeKind === "phase" || this.activeKind === "status";
    }

    return this.activeKind === "status";
  }

  private activate(event: CoachEvent, timestamp: number): void {
    const defaultHoldMs = DEFAULT_HOLD_MS[event.kind];
    const requestedHoldMs = event.holdMs ?? defaultHoldMs;
    const holdMs = Number.isFinite(requestedHoldMs)
      ? Math.max(0, requestedHoldMs)
      : defaultHoldMs;

    this.activeMessage = event.message;
    this.activeKey = event.key;
    this.activeKind = event.kind;
    this.activePriority = event.priority;
    this.activeStartedAt = timestamp;
    this.activeUntil = Math.min(
      timestamp + holdMs,
      event.expiresAt ?? Number.POSITIVE_INFINITY,
    );
    this.activeSpeaks = false;
  }

  private clearActive(message: string): void {
    this.activeMessage = message;
    this.activeKey = null;
    this.activeKind = null;
    this.activePriority = Number.POSITIVE_INFINITY;
    this.activeStartedAt = 0;
    this.activeUntil = 0;
    this.activeSpeaks = false;
  }

  private speak(
    event: CoachEvent,
    timestamp: number,
    cancelFirst: boolean,
  ): boolean {
    if (
      !this.speechIsEnabledAndAvailable()
    ) {
      return false;
    }

    const lastSpoken = this.lastSpokenAt.get(event.key) ?? -Infinity;
    const requestedCooldown = event.speechCooldownMs ?? this.cooldownMs;
    const cooldownMs = Number.isFinite(requestedCooldown)
      ? Math.max(0, requestedCooldown)
      : this.cooldownMs;
    if (timestamp - lastSpoken < cooldownMs) {
      return false;
    }

    const speechText = event.speechMessage ?? event.message;
    const estimatedSpeechMs = 80 + [...speechText].length * 55;
    if (
      event.expiresAt !== undefined &&
      event.expiresAt - timestamp < Math.min(100, estimatedSpeechMs)
    ) {
      return false;
    }

    this.lastSpokenAt.set(event.key, timestamp);
    return this.playSpeech(speechText, cancelFirst);
  }

  private playSpeech(speechText: string, cancelFirst: boolean): boolean {
    if (this.localVoice.isAvailable()) {
      const localStarted = this.localVoice.play(speechText, () => {
        const fallbackStarted = this.playSystemSpeech(speechText, true);
        this.activeSpeaks = fallbackStarted;
        if (!fallbackStarted) this.playbackErrorHandler?.();
      });
      if (localStarted) return true;
    }
    return this.playSystemSpeech(speechText, cancelFirst);
  }

  private playSystemSpeech(speechText: string, cancelFirst: boolean): boolean {
    if (this.systemSpeechAvailable()) {
      try {
        const utterance = this.createUtterance(speechText);
        this.currentUtterance = utterance;
        if (cancelFirst) window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        return true;
      } catch {
        this.currentUtterance = null;
      }
    }
    return false;
  }

  private createUtterance(speechText: string): SpeechSynthesisUtterance {
    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.lang = "zh-CN";
    utterance.rate = 1.35;
    utterance.pitch = 1;
    utterance.volume = 0.95;
    const chineseVoice = window.speechSynthesis
      .getVoices()
      .find((voice) => voice.lang.toLowerCase().startsWith("zh"));
    if (chineseVoice) {
      utterance.voice = chineseVoice;
    }
    const release = (): void => {
      if (this.currentUtterance === utterance) this.currentUtterance = null;
    };
    utterance.onend = release;
    utterance.onerror = release;
    return utterance;
  }

  private cancelSpeech(): void {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    this.localVoice.cancel();
    this.currentUtterance = null;
  }

  private systemSpeechAvailable(): boolean {
    return (
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      typeof SpeechSynthesisUtterance !== "undefined"
    );
  }
}
