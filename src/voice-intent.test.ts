import { describe, expect, it } from "vitest";
import { parseSpokenNumber, parseVoiceIntent } from "./voice-intent";

describe("voice intent parser", () => {
  it("parses common spoken Chinese numbers", () => {
    expect(parseSpokenNumber("二十八")).toBe(28);
    expect(parseSpokenNumber("一百七十五")).toBe(175);
    expect(parseSpokenNumber("七十二点五")).toBe(72.5);
  });

  it("fills a body profile sentence without saving it", () => {
    expect(parseVoiceIntent("我 28 岁，男，身高 175，体重 72 公斤，胸围 96，腰围 82")).toMatchObject({
      kind: "body-profile",
      patch: { age: 28, formulaSex: "male", heightCm: 175, weightKg: 72, chestCm: 96, waistCm: 82 },
      warnings: [],
    });
  });

  it("parses an equipment capacity sentence", () => {
    expect(parseVoiceIntent("哑铃弯举每只 12 公斤，做 10 次，4 组，余力 2 次")).toMatchObject({
      kind: "equipment",
      patch: {
        exerciseId: "dumbbell-biceps-curl",
        loadMode: "single",
        loadKg: 12,
        reps: 10,
        sets: 4,
        rir: 2,
      },
    });
  });

  it("parses a timed bodyweight sentence", () => {
    expect(parseVoiceIntent("平板支撑 45 秒，做 3 组")).toMatchObject({
      kind: "bodyweight",
      patch: { exerciseId: "plank", mode: "timed-hold", holdSeconds: 45, sets: 3 },
    });
  });

  it("rejects out-of-range body data instead of filling it", () => {
    const result = parseVoiceIntent("我 12 岁，身高 260，体重 20 公斤");
    expect(result.kind).toBe("body-profile");
    expect(result.patch).toEqual({});
    expect(result.warnings).toHaveLength(3);
  });
});
