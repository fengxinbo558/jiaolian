import { describe, expect, it, vi } from "vitest";
import { BrowserVoiceInput, createSpeechRecognition, mergeTranscriptSegments, type SpeechRecognitionLike } from "./voice-input";

function recognitionStub(): SpeechRecognitionLike {
  return {
    lang: "",
    continuous: true,
    interimResults: false,
    maxAlternatives: 0,
    onstart: null,
    onresult: null,
    onerror: null,
    onend: null,
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
  };
}

describe("browser voice input", () => {
  it("merges overlapping continuation text without repeating phrases", () => {
    expect(mergeTranscriptSegments("我想身高175体重", "身高175体重175")).toBe("我想身高175体重175");
    expect(mergeTranscriptSegments("体重六十五公斤", "体重六十五公斤")).toBe("体重六十五公斤");
    expect(mergeTranscriptSegments("身高一百七十五", "体重七十公斤")).toBe("身高一百七十五 体重七十公斤");
  });
  it("detects standard and prefixed recognition constructors", () => {
    const standard = recognitionStub();
    const prefixed = recognitionStub();
    expect(createSpeechRecognition({ SpeechRecognition: class { constructor() { return standard; } } as never })).toBe(standard);
    expect(createSpeechRecognition({ webkitSpeechRecognition: class { constructor() { return prefixed; } } as never })).toBe(prefixed);
    expect(createSpeechRecognition({})).toBeNull();
  });

  it("configures continuous Chinese recognition and forwards final transcripts", () => {
    const recognition = recognitionStub();
    const onStateChange = vi.fn();
    const onTranscript = vi.fn();
    const input = new BrowserVoiceInput({ onStateChange, onTranscript, onError: vi.fn() }, () => recognition);

    expect(input.isSupported()).toBe(true);
    expect(recognition).toMatchObject({ lang: "zh-CN", continuous: true, interimResults: true, maxAlternatives: 1 });
    expect(input.start()).toBe(true);
    recognition.onstart?.();
    recognition.onresult?.({ resultIndex: 0, results: { 0: { 0: { transcript: "体重七十二公斤" }, isFinal: true, length: 1 }, length: 1 } });
    expect(onTranscript).toHaveBeenCalledWith("体重七十二公斤", true);
    input.stop();
    expect(recognition.stop).toHaveBeenCalledOnce();
  });

  it("automatically resumes after browser silence until the user stops", () => {
    vi.useFakeTimers();
    const recognition = recognitionStub();
    const onStateChange = vi.fn();
    const input = new BrowserVoiceInput({ onStateChange, onTranscript: vi.fn(), onError: vi.fn() }, () => recognition);

    input.start();
    recognition.onstart?.();
    recognition.onerror?.({ error: "no-speech" });
    recognition.onend?.();
    expect(input.isListening()).toBe(true);
    expect(onStateChange).not.toHaveBeenCalledWith("error");

    vi.advanceTimersByTime(200);
    expect(recognition.start).toHaveBeenCalledTimes(2);

    input.stop();
    recognition.onend?.();
    vi.advanceTimersByTime(200);
    expect(recognition.start).toHaveBeenCalledTimes(2);
    expect(input.isListening()).toBe(false);
    vi.useRealTimers();
  });

  it("resumes after no-speech even when the browser omits the end event", () => {
    vi.useFakeTimers();
    const recognition = recognitionStub();
    const input = new BrowserVoiceInput({ onStateChange: vi.fn(), onTranscript: vi.fn(), onError: vi.fn() }, () => recognition);

    input.start();
    recognition.onstart?.();
    recognition.onerror?.({ error: "no-speech" });
    vi.advanceTimersByTime(200);

    expect(input.isListening()).toBe(true);
    expect(recognition.start).toHaveBeenCalledTimes(2);
    input.destroy();
    vi.useRealTimers();
  });

  it("keeps accumulated text across an automatic restart", () => {
    vi.useFakeTimers();
    const recognition = recognitionStub();
    const onTranscript = vi.fn();
    const input = new BrowserVoiceInput({ onStateChange: vi.fn(), onTranscript, onError: vi.fn() }, () => recognition);

    input.start();
    recognition.onstart?.();
    recognition.onresult?.({ resultIndex: 0, results: { 0: { 0: { transcript: "我身高一米七五" }, isFinal: true, length: 1 }, length: 1 } });
    recognition.onend?.();
    vi.advanceTimersByTime(200);
    recognition.onstart?.();
    recognition.onresult?.({ resultIndex: 0, results: { 0: { 0: { transcript: "体重七十二公斤" }, isFinal: true, length: 1 }, length: 1 } });

    expect(onTranscript).toHaveBeenLastCalledWith("我身高一米七五 体重七十二公斤", true);
    input.destroy();
    vi.useRealTimers();
  });

  it("continues after an edited draft instead of replacing it", () => {
    const recognition = recognitionStub();
    const onTranscript = vi.fn();
    const input = new BrowserVoiceInput({ onStateChange: vi.fn(), onTranscript, onError: vi.fn() }, () => recognition);

    input.start("我身高一米七五");
    recognition.onstart?.();
    recognition.onresult?.({ resultIndex: 0, results: { 0: { 0: { transcript: "体重七十二公斤" }, isFinal: true, length: 1 }, length: 1 } });

    expect(onTranscript).toHaveBeenLastCalledWith("我身高一米七五 体重七十二公斤", true);
  });

  it("automatically reconnects after a network error without clearing its transcript", () => {
    vi.useFakeTimers();
    const recognition = recognitionStub();
    const onStateChange = vi.fn();
    const onTranscript = vi.fn();
    const onError = vi.fn();
    const input = new BrowserVoiceInput({ onStateChange, onTranscript, onError }, () => recognition);

    input.start();
    recognition.onstart?.();
    recognition.onresult?.({ resultIndex: 0, results: { 0: { 0: { transcript: "体重七十二公斤" }, isFinal: true, length: 1 }, length: 1 } });
    recognition.onerror?.({ error: "network" });
    recognition.onend?.();

    expect(input.isListening()).toBe(true);
    expect(onTranscript).toHaveBeenLastCalledWith("体重七十二公斤", true);
    expect(onStateChange).toHaveBeenLastCalledWith("reconnecting");
    expect(onError).toHaveBeenCalledWith("识别连接波动，正在自动恢复；不用重复说已经显示的内容。");
    vi.advanceTimersByTime(599);
    expect(recognition.start).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(recognition.start).toHaveBeenCalledTimes(2);

    input.stop();
    expect(input.isListening()).toBe(false);
    recognition.onend?.();
    vi.useRealTimers();
  });

  it("backs off repeated network reconnects without ending the user session", () => {
    vi.useFakeTimers();
    const recognition = recognitionStub();
    const input = new BrowserVoiceInput({ onStateChange: vi.fn(), onTranscript: vi.fn(), onError: vi.fn() }, () => recognition);

    input.start();
    recognition.onstart?.();
    recognition.onerror?.({ error: "network" });
    recognition.onend?.();
    vi.advanceTimersByTime(600);
    expect(recognition.start).toHaveBeenCalledTimes(2);

    recognition.onerror?.({ error: "network" });
    recognition.onend?.();
    vi.advanceTimersByTime(1_199);
    expect(recognition.start).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(recognition.start).toHaveBeenCalledTimes(3);
    expect(input.isListening()).toBe(true);

    recognition.onerror?.({ error: "network" });
    input.stop();
    expect(input.isListening()).toBe(false);
    vi.advanceTimersByTime(5_000);
    expect(recognition.start).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("does not return to listening when a late start event arrives after pause", () => {
    const recognition = recognitionStub();
    const onStateChange = vi.fn();
    const input = new BrowserVoiceInput({ onStateChange, onTranscript: vi.fn(), onError: vi.fn() }, () => recognition);

    input.start();
    input.stop();
    recognition.onstart?.();

    expect(input.isListening()).toBe(false);
    expect(onStateChange).not.toHaveBeenLastCalledWith("listening");
    expect(recognition.stop).toHaveBeenCalled();
    recognition.onend?.();
  });

  it("stops the session on a non-recoverable error without clearing its transcript", () => {
    const recognition = recognitionStub();
    const onTranscript = vi.fn();
    const onError = vi.fn();
    const input = new BrowserVoiceInput({ onStateChange: vi.fn(), onTranscript, onError }, () => recognition);

    input.start();
    recognition.onstart?.();
    recognition.onresult?.({ resultIndex: 0, results: { 0: { 0: { transcript: "体重七十二公斤" }, isFinal: true, length: 1 }, length: 1 } });
    recognition.onerror?.({ error: "audio-capture" });

    expect(input.isListening()).toBe(false);
    expect(onTranscript).toHaveBeenLastCalledWith("体重七十二公斤", true);
    expect(onError).toHaveBeenCalledWith("没有检测到可用麦克风。");
  });

  it("reports an unsupported browser without throwing", () => {
    const onStateChange = vi.fn();
    const input = new BrowserVoiceInput({ onStateChange, onTranscript: vi.fn(), onError: vi.fn() }, () => null);
    expect(input.isSupported()).toBe(false);
    expect(onStateChange).toHaveBeenCalledWith("unsupported");
    expect(input.start()).toBe(false);
  });
});
