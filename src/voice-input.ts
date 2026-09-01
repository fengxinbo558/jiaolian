export type VoiceInputState = "idle" | "listening" | "reconnecting" | "processing" | "unsupported" | "error";

export interface VoiceInputCallbacks {
  onStateChange: (state: VoiceInputState) => void;
  onTranscript: (transcript: string, isFinal: boolean) => void;
  onError: (message: string) => void;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike {
  error?: string;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort?(): void;
}

type RecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechRecognitionGlobal {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
}

export function createSpeechRecognition(
  source: SpeechRecognitionGlobal = globalThis as SpeechRecognitionGlobal,
): SpeechRecognitionLike | null {
  const Constructor = source.SpeechRecognition ?? source.webkitSpeechRecognition;
  return Constructor ? new Constructor() : null;
}

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "未获得麦克风权限，请允许后重试。",
  "service-not-allowed": "当前浏览器没有开放语音识别服务。",
  "audio-capture": "没有检测到可用麦克风。",
  "no-speech": "没有听清，请靠近麦克风再说一次。",
  network: "语音识别服务暂时不可用，请稍后重试。",
  aborted: "语音录入已停止。",
};

export function mergeTranscriptSegments(existing: string, incoming: string): string {
  const previous = existing.trim().replace(/\s+/g, " ");
  const next = incoming.trim().replace(/\s+/g, " ");
  if (!previous) return next;
  if (!next || previous === next || previous.endsWith(next)) return previous;
  if (next.startsWith(previous)) return next;

  const maximumOverlap = Math.min(previous.length, next.length);
  for (let overlap = maximumOverlap; overlap > 0; overlap -= 1) {
    if (previous.slice(-overlap) === next.slice(0, overlap)) {
      return `${previous}${next.slice(overlap)}`;
    }
  }
  return `${previous} ${next}`;
}

export class BrowserVoiceInput {
  private readonly recognition: SpeechRecognitionLike | null;
  private sessionActive = false;
  private recognitionRunning = false;
  private stopRequested = false;
  private destroyed = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private finalTranscript = "";
  private failedDuringCurrentRun = false;
  private reconnectAttempts = 0;

  constructor(
    private readonly callbacks: VoiceInputCallbacks,
    factory: () => SpeechRecognitionLike | null = createSpeechRecognition,
  ) {
    this.recognition = factory();
    if (!this.recognition) {
      this.callbacks.onStateChange("unsupported");
      return;
    }
    this.recognition.lang = "zh-CN";
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;
    this.bindRecognition();
    this.callbacks.onStateChange("idle");
  }

  isSupported(): boolean {
    return this.recognition !== null;
  }

  isListening(): boolean {
    return this.sessionActive;
  }

  start(initialTranscript = ""): boolean {
    if (!this.recognition || this.sessionActive || this.stopRequested || this.destroyed) return false;
    this.clearRestartTimer();
    this.finalTranscript = initialTranscript.trim();
    this.failedDuringCurrentRun = false;
    this.reconnectAttempts = 0;
    this.stopRequested = false;
    this.sessionActive = true;
    return this.startRecognition();
  }

  stop(): void {
    if (!this.recognition || !this.sessionActive) return;
    this.sessionActive = false;
    this.stopRequested = true;
    this.clearRestartTimer();
    this.callbacks.onStateChange("processing");
    if (!this.recognitionRunning) {
      this.finishSession();
      return;
    }
    try {
      this.recognition.stop();
    } catch {
      this.finishSession();
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.clearRestartTimer();
    this.sessionActive = false;
    this.stopRequested = true;
    this.recognition?.abort?.();
    this.recognitionRunning = false;
  }

  private bindRecognition(): void {
    if (!this.recognition) return;
    this.recognition.onstart = () => {
      if (this.destroyed || !this.sessionActive || this.stopRequested) {
        this.recognitionRunning = false;
        try {
          this.recognition?.stop();
        } catch {
          this.finishSession();
        }
        return;
      }
      this.recognitionRunning = true;
      this.callbacks.onStateChange("listening");
    };
    this.recognition.onresult = (event) => {
      this.reconnectAttempts = 0;
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result) continue;
        const transcript = result[0]?.transcript?.trim() ?? "";
        if (result.isFinal && transcript) {
          this.finalTranscript = mergeTranscriptSegments(this.finalTranscript, transcript);
        }
        else interim += transcript;
      }
      const visibleTranscript = mergeTranscriptSegments(this.finalTranscript, interim);
      if (visibleTranscript) this.callbacks.onTranscript(visibleTranscript, interim.length === 0);
    };
    this.recognition.onerror = (event) => {
      this.recognitionRunning = false;
      const code = event.error ?? "unknown";
      if (code === "no-speech") {
        if (this.sessionActive && !this.stopRequested) this.scheduleRestart();
        return;
      }
      if (code === "network" && this.sessionActive && !this.stopRequested) {
        this.reconnectAttempts += 1;
        this.callbacks.onStateChange("reconnecting");
        this.callbacks.onError("识别连接波动，正在自动恢复；不用重复说已经显示的内容。");
        this.scheduleRestart(this.reconnectDelay());
        return;
      }
      if (code === "aborted" && this.stopRequested) {
        this.finishSession();
        return;
      }
      this.failedDuringCurrentRun = true;
      this.sessionActive = false;
      this.stopRequested = false;
      this.clearRestartTimer();
      this.callbacks.onStateChange("error");
      this.callbacks.onError(ERROR_MESSAGES[code] ?? "语音识别失败，请重新尝试。");
    };
    this.recognition.onend = () => {
      this.recognitionRunning = false;
      if (this.destroyed || this.failedDuringCurrentRun) return;
      if (this.stopRequested) {
        this.finishSession();
        return;
      }
      if (this.restartTimer !== null) return;
      if (this.sessionActive) this.scheduleRestart();
    };
  }

  private startRecognition(): boolean {
    if (!this.recognition || !this.sessionActive || this.destroyed) return false;
    try {
      this.recognition.start();
      this.recognitionRunning = true;
      return true;
    } catch {
      if (this.sessionActive && !this.stopRequested && this.reconnectAttempts > 0) {
        this.recognitionRunning = false;
        this.reconnectAttempts += 1;
        this.callbacks.onStateChange("reconnecting");
        this.callbacks.onError("识别连接波动，正在自动恢复；不用重复说已经显示的内容。");
        this.scheduleRestart(this.reconnectDelay());
        return true;
      }
      this.sessionActive = false;
      this.recognitionRunning = false;
      this.failedDuringCurrentRun = true;
      this.callbacks.onStateChange("error");
      this.callbacks.onError("语音识别没有成功启动，请稍后再试。");
      return false;
    }
  }

  private scheduleRestart(delayMs = 160): void {
    this.clearRestartTimer();
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.sessionActive && !this.stopRequested && !this.destroyed) this.startRecognition();
    }, delayMs);
  }

  private reconnectDelay(): number {
    return Math.min(4_000, 600 * (2 ** Math.max(0, this.reconnectAttempts - 1)));
  }

  private clearRestartTimer(): void {
    if (this.restartTimer === null) return;
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  private finishSession(): void {
    this.clearRestartTimer();
    this.sessionActive = false;
    this.recognitionRunning = false;
    this.stopRequested = false;
    this.reconnectAttempts = 0;
    this.callbacks.onStateChange("idle");
  }
}
