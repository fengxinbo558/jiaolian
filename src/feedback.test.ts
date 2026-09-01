import { afterEach, describe, expect, it, vi } from "vitest";
import { CoachFeedback } from "./feedback";
import type { LocalVoiceChannel } from "./local-voice";
import type { CoachEvent, CoachEventKind } from "./types";

function coachEvent(
  kind: CoachEventKind,
  key: string,
  message: string,
  options: Partial<CoachEvent> = {},
): CoachEvent {
  return {
    kind,
    key,
    message,
    priority: 3,
    speak: false,
    ...options,
  };
}

function stubSpeech(): {
  cancel: ReturnType<typeof vi.fn>;
  speak: ReturnType<typeof vi.fn>;
  utterances: Array<{ text: string; rate: number }>;
} {
  const cancel = vi.fn();
  const speak = vi.fn();
  const utterances: Array<{ text: string; rate: number }> = [];

  vi.stubGlobal("window", {
    speechSynthesis: {
      cancel,
      speak: (utterance: { text: string; rate: number }) => {
        utterances.push(utterance);
        speak(utterance);
      },
      getVoices: () => [],
    },
  });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      lang = "";
      rate = 1;
      pitch = 1;
      volume = 1;

      constructor(public readonly text: string) {}
    },
  );

  return { cancel, speak, utterances };
}

function stubLocalVoice() {
  return {
    isAvailable: () => true,
    play: vi.fn(() => true),
    cancel: vi.fn(),
  } satisfies LocalVoiceChannel;
}

describe("CoachFeedback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clears a tracking warning immediately after a valid frame returns", () => {
    const cancel = vi.fn();
    vi.stubGlobal("window", { speechSynthesis: { cancel } });
    const feedback = new CoachFeedback();

    const warning = feedback.process(
      [coachEvent("tracking", "tracking", "识别不稳定")],
      "正在下蹲",
      0,
    );
    const recovered = feedback.process([], "正在下蹲", 100);

    expect(warning).toBe("识别不稳定");
    expect(recovered).toBe("正在下蹲");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("speaks only once during one sustained tracking-loss episode", () => {
    const { speak } = stubSpeech();
    const feedback = new CoachFeedback();
    const tracking = coachEvent("tracking", "tracking", "请回到画面", {
      speak: true,
      speechMessage: "请回到画面",
      speechCooldownMs: 500,
    });

    feedback.process([tracking], "识别暂停", 0);
    feedback.process([tracking], "识别暂停", 1_000);
    feedback.process([tracking], "识别暂停", 5_000);
    expect(speak).toHaveBeenCalledOnce();

    feedback.process([], "识别恢复", 5_100);
    feedback.process([tracking], "识别暂停", 5_400);
    expect(speak).toHaveBeenCalledOnce();

    feedback.process([], "识别恢复", 5_500);
    feedback.process([], "识别稳定", 6_100);
    feedback.process([tracking], "识别暂停", 6_200);
    expect(speak).toHaveBeenCalledTimes(2);
  });

  it("drops an expired cue instead of playing it later", () => {
    const { speak } = stubSpeech();
    const feedback = new CoachFeedback();
    const message = feedback.process(
      [coachEvent("phase", "old-phase", "继续下蹲", {
        speak: true,
        speechMessage: "下蹲",
        createdAt: 0,
        expiresAt: 120,
      })],
      "正在起身",
      200,
    );
    expect(message).toBe("正在起身");
    expect(speak).not.toHaveBeenCalled();
  });

  it("drops a cue that belongs to another exercise or phase", () => {
    const feedback = new CoachFeedback();
    const message = feedback.process(
      [coachEvent("phase", "squat-down", "继续下蹲", {
        exerciseId: "squat",
        phase: "descending",
        scope: "current-phase",
      })],
      "正在张开",
      100,
      { exerciseId: "jumping-jack", phase: "opening" },
    );
    expect(message).toBe("正在张开");
  });

  it("does not speak a cue when too little useful time remains", () => {
    const { speak } = stubSpeech();
    const feedback = new CoachFeedback();
    feedback.process(
      [coachEvent("correction", "late", "抬起胸口", {
        speak: true,
        speechMessage: "抬胸保持背部稳定",
        expiresAt: 90,
      })],
      "继续",
      0,
    );
    expect(speak).not.toHaveBeenCalled();
  });

  it("speaks an immediate confirmation from a user action", () => {
    const { cancel, utterances } = stubSpeech();
    const feedback = new CoachFeedback();

    expect(feedback.speakNow("开始训练")).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(utterances).toHaveLength(1);
    expect(utterances[0]).toMatchObject({ text: "开始训练", rate: 1.35 });
  });

  it("falls back to a local clip when system speech is unavailable", () => {
    const localVoice = stubLocalVoice();
    const feedback = new CoachFeedback(2_500, localVoice);

    expect(feedback.getVoiceEngine()).toBe("local");
    expect(feedback.speakNow("开始训练")).toBe(true);
    expect(localVoice.play).toHaveBeenCalledWith(
      "开始训练",
      expect.any(Function),
    );
  });

  it("prefers deterministic local clips over an unreliable system speech API", () => {
    const { speak } = stubSpeech();
    const localVoice = stubLocalVoice();
    const feedback = new CoachFeedback(2_500, localVoice);

    expect(feedback.getVoiceEngine()).toBe("local");
    expect(feedback.speakNow("开始训练")).toBe(true);
    expect(localVoice.play).toHaveBeenCalledOnce();
    expect(speak).not.toHaveBeenCalled();
  });

  it("falls back to system speech when a sentence has no matching local clip", () => {
    const { utterances } = stubSpeech();
    const localVoice = stubLocalVoice();
    localVoice.play.mockReturnValue(false);
    const feedback = new CoachFeedback(2_500, localVoice);

    expect(feedback.speakNow("下一组先稳定肩部再发力")).toBe(true);
    expect(utterances.map((utterance) => utterance.text)).toEqual([
      "下一组先稳定肩部再发力",
    ]);
  });

  it("falls back to system speech after local playback fails asynchronously", () => {
    const { utterances } = stubSpeech();
    let available = true;
    const localVoice: LocalVoiceChannel = {
      isAvailable: () => available,
      play: (_message, onError) => {
        available = false;
        onError?.();
        return true;
      },
      cancel: vi.fn(),
    };
    const failureHandler = vi.fn();
    const feedback = new CoachFeedback(2_500, localVoice);
    feedback.setPlaybackErrorHandler(failureHandler);

    expect(feedback.speakNow("开始训练")).toBe(true);
    expect(utterances.map((utterance) => utterance.text)).toEqual(["开始训练"]);
    expect(failureHandler).not.toHaveBeenCalled();
    expect(feedback.getVoiceEngine()).toBe("system");
  });

  it("reports the voice channel unavailable after local playback fails", () => {
    const failureHandler = vi.fn();
    let available = true;
    const localVoice: LocalVoiceChannel = {
      isAvailable: () => available,
      play: (_message, onError) => {
        available = false;
        onError?.();
        return false;
      },
      cancel: vi.fn(),
    };
    const feedback = new CoachFeedback(2_500, localVoice);
    feedback.setPlaybackErrorHandler(failureHandler);

    expect(feedback.speakNow("开始训练")).toBe(false);
    expect(feedback.getVoiceEngine()).toBe("unavailable");
    expect(failureHandler).toHaveBeenCalledOnce();
  });

  it("keeps a short result audible with realistic processing delay", () => {
    const { utterances } = stubSpeech();
    const feedback = new CoachFeedback();

    feedback.process(
      [coachEvent("result", "jack:complete:1", "第 1 次合格", {
        speak: true,
        speechMessage: "第 1 次，合格",
        createdAt: 0,
        expiresAt: 1_400,
      })],
      "继续",
      250,
    );

    expect(utterances.map((utterance) => utterance.text)).toEqual(["第 1 次，合格"]);
  });

  it("cancels tracking speech only once when recovery starts a new phase", () => {
    const { cancel, speak } = stubSpeech();
    const feedback = new CoachFeedback();

    feedback.process(
      [coachEvent("tracking", "tracking", "识别不稳定")],
      "已暂停",
      0,
    );
    feedback.process(
      [
        coachEvent("phase", "phase:down", "正在下蹲 · 吸气", {
          speak: true,
          speechMessage: "吸气",
        }),
      ],
      "正在下蹲",
      100,
    );

    expect(cancel).toHaveBeenCalledOnce();
    expect(speak).toHaveBeenCalledOnce();
  });

  it("uses a short 350 ms hold for visual phase guidance", () => {
    const feedback = new CoachFeedback();

    expect(
      feedback.process(
        [coachEvent("phase", "phase:down", "正在下蹲 · 吸气")],
        "继续",
        0,
      ),
    ).toBe("正在下蹲 · 吸气");
    expect(feedback.process([], "最新阶段", 349)).toBe("正在下蹲 · 吸气");
    expect(feedback.process([], "最新阶段", 350)).toBe("最新阶段");
  });

  it("lets a new phase immediately replace the previous phase", () => {
    const feedback = new CoachFeedback();

    feedback.process(
      [coachEvent("phase", "phase:down", "正在下蹲 · 吸气")],
      "继续",
      0,
    );
    const rising = feedback.process(
      [coachEvent("phase", "phase:up", "正在起身 · 呼气")],
      "继续",
      80,
    );

    expect(rising).toBe("正在起身 · 呼气");
  });

  it("uses the latest phase when one frame crosses multiple phase boundaries", () => {
    const feedback = new CoachFeedback();
    const message = feedback.process(
      [
        coachEvent("phase", "bottom", "到达最低点"),
        coachEvent("phase", "ascent", "正在起身"),
      ],
      "继续",
      0,
    );
    expect(message).toBe("正在起身");
  });

  it("cancels speech when its useful lifetime expires", () => {
    const { cancel } = stubSpeech();
    const feedback = new CoachFeedback();
    feedback.process(
      [coachEvent("phase", "short", "张开", {
        speak: true,
        speechMessage: "张开",
        holdMs: 300,
      })],
      "继续",
      0,
    );
    feedback.process([], "动作已变化", 300);
    expect(cancel).toHaveBeenCalledTimes(2);
  });

  it("lets a new action phase immediately end a held rep result", () => {
    const { cancel, speak } = stubSpeech();
    const feedback = new CoachFeedback();

    feedback.process(
      [
        coachEvent("result", "rep-complete:1", "第 1 次合格", {
          interrupt: true,
          holdMs: 3_200,
          speak: true,
          speechMessage: "第 1 次合格",
        }),
      ],
      "继续",
      0,
    );
    const nextRep = feedback.process(
      [coachEvent("phase", "phase:down:2", "正在下蹲 · 吸气", {
        speak: true,
        speechMessage: "吸气",
      })],
      "继续",
      100,
    );

    expect(nextRep).toBe("正在下蹲 · 吸气");
    expect(speak).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledTimes(2);
  });

  it("keeps a correction visible when a phase cue arrives during its hold", () => {
    const feedback = new CoachFeedback();

    feedback.process(
      [
        coachEvent("correction", "lean", "抬起胸口", {
          priority: 1,
          holdMs: 1_000,
        }),
      ],
      "继续",
      0,
    );

    expect(
      feedback.process(
        [coachEvent("phase", "phase:up", "正在起身 · 呼气")],
        "继续",
        500,
      ),
    ).toBe("抬起胸口");
    expect(
      feedback.process(
        [coachEvent("phase", "phase:up", "正在起身 · 呼气")],
        "继续",
        1_000,
      ),
    ).toBe("正在起身 · 呼气");
  });

  it("does not let an interrupting ascent cue hide an active correction", () => {
    const feedback = new CoachFeedback();
    feedback.process(
      [coachEvent("correction", "lean", "抬胸", { priority: 1 })],
      "下降",
      0,
    );

    const ascent = feedback.process(
      [
        coachEvent("phase", "phase:ascent:1", "呼气，抬胸站起", {
          interrupt: true,
        }),
      ],
      "起身",
      100,
    );

    expect(ascent).toBe("抬胸");
  });

  it("lets the new movement phase replace a correction before it becomes stale", () => {
    const feedback = new CoachFeedback();
    feedback.process(
      [coachEvent("correction", "lean", "抬胸", { priority: 1 })],
      "下降",
      0,
    );

    const ascent = feedback.process(
      [
        coachEvent("phase", "phase:ascent:1", "呼气，抬胸站起", {
          interrupt: true,
        }),
      ],
      "起身",
      500,
    );

    expect(ascent).toBe("呼气，抬胸站起");
  });

  it("prefers a correction over a simultaneous phase cue", () => {
    const feedback = new CoachFeedback();

    const message = feedback.process(
      [
        coachEvent("phase", "phase:down", "正在下蹲 · 吸气"),
        coachEvent("correction", "lean", "抬胸", { priority: 1 }),
      ],
      "继续",
      0,
    );

    expect(message).toBe("抬胸");
  });

  it("allows only a higher-priority correction to replace another correction", () => {
    const feedback = new CoachFeedback();

    feedback.process(
      [coachEvent("correction", "speed", "慢一点", { priority: 2 })],
      "继续",
      0,
    );
    expect(
      feedback.process(
        [coachEvent("correction", "depth", "蹲低些", { priority: 3 })],
        "继续",
        50,
      ),
    ).toBe("慢一点");
    expect(
      feedback.process(
        [coachEvent("correction", "lean", "抬胸", { priority: 1 })],
        "继续",
        100,
      ),
    ).toBe("抬胸");
  });

  it("allows an interrupting completion result to replace a correction", () => {
    const feedback = new CoachFeedback();

    feedback.process(
      [coachEvent("correction", "lean", "抬胸", { priority: 1 })],
      "继续",
      0,
    );
    const result = feedback.process(
      [
        coachEvent("result", "rep-complete:1", "第 1 次，注意抬胸", {
          interrupt: true,
          priority: 4,
        }),
      ],
      "继续",
      100,
    );

    expect(result).toBe("第 1 次，注意抬胸");
  });

  it("does not let a non-interrupting result steal an active correction", () => {
    const feedback = new CoachFeedback();

    feedback.process(
      [coachEvent("correction", "lean", "抬胸", { priority: 1 })],
      "继续",
      0,
    );
    const result = feedback.process(
      [coachEvent("result", "summary", "动作结果")],
      "继续",
      100,
    );

    expect(result).toBe("抬胸");
  });

  it("always prefers tracking over phase, correction, and result in one frame", () => {
    const feedback = new CoachFeedback();

    const message = feedback.process(
      [
        coachEvent("phase", "phase:up", "正在起身 · 呼气"),
        coachEvent("correction", "lean", "抬胸", { priority: 1 }),
        coachEvent("result", "rep-complete:1", "第 1 次完成", {
          interrupt: true,
        }),
        coachEvent("tracking", "tracking", "回到画面", { priority: 99 }),
      ],
      "继续",
      0,
    );

    expect(message).toBe("回到画面");
  });

  it("speaks the short speechMessage instead of the longer visual message", () => {
    const { utterances } = stubSpeech();
    const feedback = new CoachFeedback();

    feedback.process(
      [
        coachEvent("phase", "phase:down", "正在下蹲 · 吸气", {
          speak: true,
          speechMessage: "吸气",
        }),
      ],
      "继续",
      0,
    );

    expect(utterances).toHaveLength(1);
    expect(utterances[0]).toMatchObject({ text: "吸气", rate: 1.35 });
    expect(feedback.activeMessageUsesSpeech()).toBe(true);
  });

  it("cancels previous speech before speaking every new phase", () => {
    const { cancel, utterances } = stubSpeech();
    const feedback = new CoachFeedback();

    feedback.process(
      [
        coachEvent("phase", "phase:down", "正在下蹲 · 吸气", {
          speak: true,
          speechMessage: "吸气",
        }),
      ],
      "继续",
      0,
    );
    feedback.process(
      [
        coachEvent("phase", "phase:up", "正在起身 · 呼气", {
          speak: true,
          speechMessage: "呼气",
        }),
      ],
      "继续",
      100,
    );

    expect(cancel).toHaveBeenCalledTimes(2);
    expect(utterances.map((utterance) => utterance.text)).toEqual([
      "吸气",
      "呼气",
    ]);
  });

  it("does not restart speech for repeated frames in the same phase cooldown", () => {
    const { cancel, speak } = stubSpeech();
    const feedback = new CoachFeedback();
    const down = coachEvent("phase", "phase:down", "正在下蹲 · 吸气", {
      speak: true,
      speechMessage: "吸气",
      speechCooldownMs: 1_000,
    });

    feedback.process([down], "继续", 0);
    feedback.process([down], "继续", 100);

    expect(cancel).toHaveBeenCalledOnce();
    expect(speak).toHaveBeenCalledOnce();
    expect(feedback.activeMessageUsesSpeech()).toBe(true);
  });

  it("reports when the speech channel can own repeating phase text", () => {
    stubSpeech();
    const feedback = new CoachFeedback();

    expect(feedback.speechIsEnabledAndAvailable()).toBe(true);
    feedback.setEnabled(false);
    expect(feedback.speechIsEnabledAndAvailable()).toBe(false);
  });

  it("honors a per-event speech cooldown", () => {
    const { speak } = stubSpeech();
    const feedback = new CoachFeedback();
    const correction = coachEvent("correction", "lean", "抬起胸口", {
      speak: true,
      speechMessage: "抬胸",
      speechCooldownMs: 300,
    });

    feedback.process([correction], "继续", 0);
    feedback.process([correction], "继续", 299);
    feedback.process([correction], "继续", 300);

    expect(speak).toHaveBeenCalledTimes(2);
  });

  it("keeps a rapid result-down-correction-tracking-recovery sequence current", () => {
    const feedback = new CoachFeedback();

    expect(
      feedback.process(
        [
          coachEvent("result", "rep-complete:1", "第 1 次合格", {
            interrupt: true,
            holdMs: 3_200,
          }),
        ],
        "站立",
        0,
      ),
    ).toBe("第 1 次合格");
    expect(
      feedback.process(
        [coachEvent("phase", "phase:down:2", "正在下蹲 · 吸气")],
        "正在下蹲",
        50,
      ),
    ).toBe("正在下蹲 · 吸气");
    expect(
      feedback.process(
        [coachEvent("correction", "lean:2", "抬胸", { priority: 1 })],
        "正在下蹲",
        100,
      ),
    ).toBe("抬胸");
    expect(
      feedback.process(
        [coachEvent("phase", "phase:up:2", "正在起身 · 呼气")],
        "正在起身",
        150,
      ),
    ).toBe("抬胸");
    expect(
      feedback.process(
        [coachEvent("tracking", "tracking", "回到画面")],
        "已暂停",
        200,
      ),
    ).toBe("回到画面");
    expect(feedback.process([], "正在起身 · 呼气", 250)).toBe(
      "正在起身 · 呼气",
    );
  });
});
