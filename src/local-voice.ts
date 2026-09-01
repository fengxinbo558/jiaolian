export interface AudioChannel {
  src: string;
  preload: string;
  currentTime: number;
  onerror: HTMLMediaElement["onerror"];
  onended: HTMLMediaElement["onended"];
  play(): Promise<void> | void;
  pause(): void;
  load?(): void;
}

export interface LocalVoiceChannel {
  isAvailable(): boolean;
  play(message: string, onError?: () => void): boolean;
  cancel(): void;
}

const AUDIO_ROOT = "/audio";

const clip = (name: string): string => `${AUDIO_ROOT}/${name}.wav`;

export function resolveLocalVoiceClip(message: string): string | null {
  const normalized = message.replace(/[，。｜·\s]/g, "");
  if (normalized.includes("语音已开启")) return clip("voice-on");
  if (normalized.includes("开始训练")) return clip("start");
  if (normalized.includes("识别")) return clip("tracking");
  if (
    normalized.includes("校准完成") ||
    normalized.includes("可以开始") ||
    normalized.includes("可以继续")
  ) {
    return clip("ready");
  }
  if (normalized.includes("合格")) return clip("qualified");
  if (normalized.includes("膝盖向胸口")) return clip("knee-to-chest");
  if (normalized.includes("触肩")) return clip("shoulder-tap");
  if (normalized.includes("双手撑地")) return clip("hands-down");
  if (normalized.includes("撑稳收紧核心")) return clip("plank-core");
  if (normalized.includes("收腿站直")) return clip("stand-up");
  if (normalized.includes("夹紧臀部") && normalized.includes("抬")) {
    return clip("glutes-up");
  }
  if (normalized.includes("控制髋部落下") || normalized === "控制落下") {
    return clip("controlled-down");
  }
  if (normalized.includes("对侧手脚伸远")) return clip("opposite-reach");
  if (normalized.includes("骨盆保持稳定")) return clip("pelvis-stable");
  if (normalized.includes("腰背保持贴稳")) return clip("back-stable");
  if (normalized.includes("支撑膝保持稳定")) return clip("support-knee");
  if (normalized.includes("支撑脚踩稳") && normalized.includes("髋部向后")) {
    return clip("hip-hinge");
  }
  if (normalized.includes("臀部发力") && normalized.includes("回到直立")) {
    return clip("return-upright");
  }
  if (normalized.includes("髋部向后坐")) return clip("hip-back");
  if (normalized.includes("膝盖抬高") || normalized.includes("膝主动抬高")) {
    return clip("knee-up");
  }
  if (normalized.includes("膝盖")) return clip("knees");
  if (
    normalized.includes("抬胸") ||
    normalized.includes("胸口") ||
    normalized.includes("背部稳定")
  ) return clip("lean");
  if (normalized.includes("调整髋部")) return clip("hip-adjust");
  if (normalized.includes("髋部") || normalized.includes("深度不足")) {
    return clip("depth");
  }
  if (normalized.includes("下蹲慢") || normalized.includes("下蹲偏快")) {
    return clip("speed");
  }
  if (
    normalized.includes("手举高") ||
    normalized.includes("双手举") ||
    normalized.includes("手臂高度")
  ) return clip("arms");
  if (normalized.includes("脚打开") || normalized.includes("双脚打开")) {
    return clip("feet");
  }
  if (normalized.includes("手脚同步") || normalized.includes("手脚同时")) {
    return clip("sync");
  }
  if (normalized.includes("两侧同高") || normalized.includes("左右幅度")) {
    return clip("symmetry");
  }
  if (normalized.includes("前脚踩稳") || normalized.includes("正在下沉")) {
    return clip("lunge-down");
  }
  if (normalized.includes("臀腿发力") || normalized.includes("正在回正")) {
    return clip("lunge-up");
  }
  if (normalized.includes("脚跟抬高") || normalized.includes("脚跟向上抬")) {
    return clip("heel-up");
  }
  if (normalized.includes("控制脚跟") || normalized.includes("慢慢落下")) {
    return clip("heel-down");
  }
  if (normalized.includes("控制下降") || normalized.includes("胸口控制下降")) {
    return clip("push-down");
  }
  if (normalized.includes("用胸部和手臂推起") || normalized === "推起") {
    return clip("push-up");
  }
  if (normalized.includes("身体成一直线") || normalized.includes("身体保持直线")) {
    return clip("body-line");
  }
  if (normalized.includes("保持自然呼吸") || normalized.includes("稳住保持呼吸")) {
    return clip("hold");
  }
  if (normalized.includes("先稳住") || normalized.includes("先稳定身体")) {
    return clip("steady");
  }
  if (normalized.includes("身体保持直立")) return clip("steady");
  if (normalized.includes("幅度再完整") || normalized.includes("动作幅度不足")) {
    return clip("range");
  }
  if (normalized.includes("膝盖对准脚尖") || normalized.includes("关节方向")) {
    return clip("alignment");
  }
  if (normalized.includes("左右节奏")) return clip("rhythm");
  if (normalized.includes("下蹲")) return clip("squat-down");
  if (normalized.includes("起身") || normalized.includes("站起")) {
    return clip("squat-up");
  }
  if (normalized.includes("张开")) return clip("jack-open");
  if (normalized.includes("收回")) return clip("jack-close");
  if (normalized.includes("完成")) return clip("complete");
  return null;
}

function createBrowserAudioChannel(): AudioChannel | null {
  if (typeof document === "undefined" || !document.createElement) return null;
  const existing = document.getElementById("local-voice-player");
  if (existing instanceof HTMLAudioElement) return existing;
  const audio = document.createElement("audio");
  audio.id = "local-voice-player";
  audio.hidden = true;
  audio.preload = "auto";
  audio.setAttribute("aria-hidden", "true");
  document.body.append(audio);
  return audio;
}

export class LocalVoicePlayer implements LocalVoiceChannel {
  private readonly audio: AudioChannel | null;
  private failed = false;

  constructor(factory: () => AudioChannel | null = createBrowserAudioChannel) {
    this.audio = factory();
  }

  isAvailable(): boolean {
    return this.audio !== null && !this.failed;
  }

  play(message: string, onError?: () => void): boolean {
    const source = resolveLocalVoiceClip(message);
    if (!source || !this.audio || this.failed) return false;

    this.cancel();
    this.audio.src = source;
    this.audio.preload = "auto";
    this.audio.onerror = () => this.markFailed(onError);
    this.audio.onended = () => {
      if (this.audio) this.audio.currentTime = 0;
    };

    try {
      this.audio.load?.();
      const playback = this.audio.play();
      if (playback && typeof playback.catch === "function") {
        void playback.catch(() => this.markFailed(onError));
      }
      return true;
    } catch {
      this.markFailed(onError);
      return false;
    }
  }

  cancel(): void {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  private markFailed(onError?: () => void): void {
    if (this.failed) return;
    this.failed = true;
    this.cancel();
    onError?.();
  }
}
