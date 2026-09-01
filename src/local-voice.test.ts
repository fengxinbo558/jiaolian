import { describe, expect, it, vi } from "vitest";
import {
  LocalVoicePlayer,
  resolveLocalVoiceClip,
  type AudioChannel,
} from "./local-voice";

function audioStub() {
  return {
    src: "",
    preload: "",
    currentTime: 0,
    onerror: null,
    onended: null,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    load: vi.fn(),
  } satisfies AudioChannel;
}

describe("local voice fallback", () => {
  it("maps core squat and jumping-jack cues to local clips", () => {
    expect(resolveLocalVoiceClip("语音已开启")).toBe("/audio/voice-on.wav");
    expect(resolveLocalVoiceClip("下蹲")).toBe("/audio/squat-down.wav");
    expect(resolveLocalVoiceClip("正在起身｜呼气站直")).toBe("/audio/squat-up.wav");
    expect(resolveLocalVoiceClip("张开")).toBe("/audio/jack-open.wav");
    expect(resolveLocalVoiceClip("收回")).toBe("/audio/jack-close.wav");
    expect(resolveLocalVoiceClip("第 3 次，合格")).toBe("/audio/qualified.wav");
  });

  it("maps actionable corrections before generic phase words", () => {
    expect(resolveLocalVoiceClip("下次下蹲慢一点")).toBe("/audio/speed.wav");
    expect(resolveLocalVoiceClip("呼气，膝盖朝脚尖站起")).toBe("/audio/knees.wav");
    expect(resolveLocalVoiceClip("下一次手脚同步")).toBe("/audio/sync.wav");
  });

  it("maps the first bodyweight expansion to short local coaching clips", () => {
    expect(resolveLocalVoiceClip("下沉，前脚踩稳")).toBe("/audio/lunge-down.wav");
    expect(resolveLocalVoiceClip("回正，臀腿发力")).toBe("/audio/lunge-up.wav");
    expect(resolveLocalVoiceClip("脚跟抬高")).toBe("/audio/heel-up.wav");
    expect(resolveLocalVoiceClip("慢慢落下")).toBe("/audio/heel-down.wav");
    expect(resolveLocalVoiceClip("膝盖抬高")).toBe("/audio/knee-up.wav");
    expect(resolveLocalVoiceClip("控制下降")).toBe("/audio/push-down.wav");
    expect(resolveLocalVoiceClip("推起")).toBe("/audio/push-up.wav");
    expect(resolveLocalVoiceClip("调整髋部，身体成一直线")).toBe("/audio/hip-adjust.wav");
    expect(resolveLocalVoiceClip("保持左右节奏")).toBe("/audio/rhythm.wav");
  });

  it("maps the second bodyweight expansion without falling back to stale cues", () => {
    expect(resolveLocalVoiceClip("膝盖向胸口")).toBe("/audio/knee-to-chest.wav");
    expect(resolveLocalVoiceClip("触肩，髋部稳住")).toBe("/audio/shoulder-tap.wav");
    expect(resolveLocalVoiceClip("下蹲，双手撑地")).toBe("/audio/hands-down.wav");
    expect(resolveLocalVoiceClip("撑稳，收紧核心")).toBe("/audio/plank-core.wav");
    expect(resolveLocalVoiceClip("收腿站直")).toBe("/audio/stand-up.wav");
  });

  it("maps the final bodyweight expansion to exercise-specific live cues", () => {
    expect(resolveLocalVoiceClip("髋部向后坐")).toBe("/audio/hip-back.wav");
    expect(resolveLocalVoiceClip("夹紧臀部，抬起髋部")).toBe("/audio/glutes-up.wav");
    expect(resolveLocalVoiceClip("控制落下")).toBe("/audio/controlled-down.wav");
    expect(resolveLocalVoiceClip("对侧手脚伸远")).toBe("/audio/opposite-reach.wav");
    expect(resolveLocalVoiceClip("骨盆保持稳定")).toBe("/audio/pelvis-stable.wav");
    expect(resolveLocalVoiceClip("腰背保持贴稳")).toBe("/audio/back-stable.wav");
    expect(resolveLocalVoiceClip("支撑脚踩稳，髋部向后")).toBe("/audio/hip-hinge.wav");
    expect(resolveLocalVoiceClip("臀部发力，回到直立")).toBe("/audio/return-upright.wav");
    expect(resolveLocalVoiceClip("支撑膝保持稳定")).toBe("/audio/support-knee.wav");
  });

  it("stops the old clip before playing the newest one", () => {
    const audio = audioStub();
    const player = new LocalVoicePlayer(() => audio);

    expect(player.play("下蹲")).toBe(true);
    expect(audio.src).toBe("/audio/squat-down.wav");
    expect(player.play("起身")).toBe(true);
    expect(audio.src).toBe("/audio/squat-up.wav");
    expect(audio.pause).toHaveBeenCalledTimes(2);
    expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it("marks the channel unavailable after playback fails", async () => {
    const audio = audioStub();
    audio.play.mockRejectedValueOnce(new Error("blocked"));
    const failed = vi.fn();
    const player = new LocalVoicePlayer(() => audio);

    expect(player.play("开始训练", failed)).toBe(true);
    await Promise.resolve();
    expect(failed).toHaveBeenCalledOnce();
    expect(player.isAvailable()).toBe(false);
  });
});
