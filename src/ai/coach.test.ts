import { afterEach, describe, expect, it, vi } from "vitest";
import { askCoach, createCoachMessage, getCoachAvailability, localCoachReply, type CoachContext } from "./coach";

afterEach(() => vi.unstubAllGlobals());

function browserWindow(): void {
  vi.stubGlobal("window", {
    setTimeout,
    clearTimeout,
    location: { search: "?preview=1" },
  });
}

function context(overrides: Partial<CoachContext> = {}): CoachContext {
  return {
    body: {
      schemaVersion: 1,
      age: 30,
      formulaSex: "male",
      heightCm: 170,
      weightKg: 65,
      activityLevel: "light",
      chestCm: null,
      waistCm: null,
      neckCm: null,
      hipCm: null,
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
    bodyHistory: [],
    recentSessions: [],
    savedPlans: [],
    ...overrides,
  };
}

describe("FORM local coach", () => {
  it.each([
    ["深蹲", "10–15 次", "膝盖跟随脚尖"],
    ["平板支撑", "20–40 秒", "避免塌腰"],
    ["开合跳", "20–30 秒", "轻柔落地"],
    ["反向弓步", "8–12 次", "前脚踩稳"],
    ["臀桥", "12–18 次", "顶端夹臀"],
    ["鸟狗式", "6–10 次", "骨盆保持水平"],
    ["波比跳", "5–8 次", "体能不足时去掉跳跃"],
  ])("provides matched guidance for %s", (exercise, dose, cue) => {
    const result = localCoachReply(`${exercise}怎么练？`, context());
    expect(result.text).toContain(dose);
    expect(result.text).toContain(cue);
  });

  it("gives a concrete push-up prescription instead of a fixed generic answer", () => {
    const result = localCoachReply("我想做俯卧撑，今天做多少合适？", context());
    expect(result.text).toContain("3 组");
    expect(result.text).toMatch(/6–12 次/);
    expect(result.text).toMatch(/休息 60–90 秒/);
    expect(result.evidence).toContain("俯卧撑");
  });

  it.each([
    ["侧平板支撑怎么练", "侧平板支撑", "腹斜肌"],
    ["哑铃弯举怎么练", "哑铃弯举", "肱二头肌"],
    ["战士二式怎么练", "战士二式", "股四头肌"],
    ["弹力带水平拉开怎么练", "弹力带水平拉开", "三角肌后束"],
  ])("uses the full exercise catalog for %s", (question, name, muscle) => {
    const result = localCoachReply(question, context());
    expect(result.text).toContain(name);
    expect(result.evidence.join(" ")).toContain(muscle);
    expect(result.notice).toContain("本机动作库");
  });

  it("uses previous user turn for a short follow-up", () => {
    const history = [createCoachMessage("user", "我今天想做俯卧撑")];
    const result = localCoachReply("那休息多久？", context(), history);
    expect(result.text).toContain("60–90 秒");
  });

  it("does not treat negated knee pain as an injury", () => {
    const result = localCoachReply("我膝盖没疼，昨天练腿，今天15分钟练什么？", context());
    expect(result.text).not.toContain("先停止当前动作");
    expect(result.text).toContain("上斜俯卧撑");
    expect(result.text).not.toContain("深蹲 3×12");
  });

  it("uses a safety-first response for discomfort", () => {
    const result = localCoachReply("做完以后胳膊不舒服", context());
    expect(result.text).toContain("先停止当前动作");
    expect(result.text).toContain("不能在这里做医疗诊断");
  });

  it("explains where body measurements are entered", () => {
    const result = localCoachReply("我的体重和三围在哪里填？", context());
    expect(result.text).toContain("底部“身体”页");
    expect(result.text).toContain("添加围度");
  });

  it("does not praise a session with zero recognized reps", () => {
    const result = localCoachReply("评价一下我刚才练得怎么样", context({
      recentSessions: [{
        exerciseId: "squat",
        exerciseName: "徒手深蹲",
        endedAt: "2026-09-01T00:00:00.000Z",
        totalReps: 0,
        qualifiedReps: 0,
        issueCounts: {},
      }],
    }));
    expect(result.text).toContain("不能评价为“完成得不错”");
  });

  it("calculates current BMI and compares body history", () => {
    const result = localCoachReply("我的身体趋势和体重变化怎么样？", context({
      bodyHistory: [{
        schemaVersion: 1,
        age: 30,
        formulaSex: "male",
        heightCm: 170,
        weightKg: 67,
        activityLevel: "light",
        chestCm: null,
        waistCm: null,
        neckCm: null,
        hipCm: null,
        recordedAt: "2026-08-20T00:00:00.000Z",
      }],
    }));
    expect(result.text).toContain("BMI 约 22.5");
    expect(result.text).toContain("减少 2.0 kg");
  });

  it("keeps unrelated requests out of scope", () => {
    const result = localCoachReply("给我写一首关于月亮的诗", context());
    expect(result.text).toContain("超出了 FORM 的健身范围");
  });

  it("summarizes the latest recognized workout without inventing details", () => {
    const result = localCoachReply("我上次练了什么？", context({
      recentSessions: [{
        exerciseId: "squat",
        exerciseName: "徒手深蹲",
        endedAt: "2026-09-01T00:00:00.000Z",
        totalReps: 12,
        qualifiedReps: 9,
        issueCounts: { depth: 2 },
      }],
    }));
    expect(result.text).toContain("徒手深蹲");
    expect(result.text).toContain("识别 12 次、合格 9 次");
  });

  it("distinguishes total workout count from the limited recent context", () => {
    const result = localCoachReply("我总共训练了多少次？", context({
      totalSessionCount: 11,
      recentSessions: [{
        exerciseId: "squat", exerciseName: "徒手深蹲", endedAt: "2026-09-01T00:00:00.000Z",
        totalReps: 12, qualifiedReps: 9, issueCounts: {},
      }],
    }));
    expect(result.text).toContain("共保存 11 次训练记录");
    expect(result.evidence.join(" ")).toContain("累计 11 次训练");
  });

  it("explains where saved plans live", () => {
    const result = localCoachReply("我的计划在哪里看？", context({
      savedPlans: [{ id: "plan-1", name: "核心稳定", goal: "核心", durationMinutes: 20 }],
    }));
    expect(result.text).toContain("底部“计划”页");
    expect(result.text).toContain("1 套计划");
  });

  it("does not present the local fallback as a large model", () => {
    const result = localCoachReply("为什么你的回答总是固定的，AI连上了吗？", context());
    expect(result.text).toContain("本机教练");
    expect(result.text).toContain("不会假装成 AI");
    expect(result.source).toBe("local");
  });

  it("asks for missing constraints instead of inventing a personal plan", () => {
    const result = localCoachReply("我想训练", context({ body: null }));
    expect(result.text).toContain("补充你的目标");
    expect(result.evidence).toContain("问题信息不足，未虚构个人资料");
  });
});

describe("coach API fallback and transparency", () => {
  it("handles exercise discomfort locally without sending it to a model", async () => {
    browserWindow();
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    const result = await askCoach("我做深蹲时膝盖刺痛", context());
    expect(result.source).toBe("local");
    expect(result.text).toContain("先停止当前动作");
    expect(request).not.toHaveBeenCalled();
  });

  it("sends only the minimum context needed for a product question", async () => {
    browserWindow();
    let sent: { context?: CoachContext } = {};
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ text: "进入身体页操作。", evidence: [] }), { status: 200 });
    }));
    await askCoach("语音输入怎么用？", context({
      bodyHistory: [{
        schemaVersion: 1, age: 30, formulaSex: "male", heightCm: 170, weightKg: 65,
        activityLevel: "light", chestCm: 90, waistCm: 75, neckCm: 35, hipCm: 92,
        recordedAt: "2026-08-20T00:00:00.000Z",
      }],
    }));
    expect(sent.context?.body).toBeNull();
    expect(sent.context?.bodyHistory).toEqual([]);
    expect(sent.context?.recentSessions).toEqual([]);
  });

  it("returns and labels a genuine model response", async () => {
    browserWindow();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      text: "根据你的记录，今天做三组上斜俯卧撑。",
      evidence: ["最近训练 2 次"],
    }), { status: 200 })));
    const result = await askCoach("今天练什么", context());
    expect(result.source).toBe("ai");
    expect(result.text).toContain("上斜俯卧撑");
    expect(result.notice).toBeUndefined();
  });

  it("explains an unconfigured model and still answers locally", async () => {
    browserWindow();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "AI 服务尚未配置" }), { status: 503 })));
    const result = await askCoach("俯卧撑做多少", context());
    expect(result.source).toBe("local");
    expect(result.notice).toContain("DeepSeek 尚未配置");
    expect(result.text).toContain("3 组");
  });

  it.each([
    [401, "请先登录", "尚未通过邀请码登录"],
    [429, "AI 请求过多", "AI 请求过多"],
    [502, "AI 服务暂时不可用", "AI 服务暂时不可用"],
  ])("falls back safely for API status %i", async (statusCode, apiError, expectedNotice) => {
    browserWindow();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: apiError }), { status: statusCode })));
    const result = await askCoach("今天练什么", context());
    expect(result.source).toBe("local");
    expect(result.notice).toContain(expectedNotice);
    expect(result.text).toContain("分钟的保守方案");
  });

  it("falls back when the network request fails", async () => {
    browserWindow();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network down"); }));
    const result = await askCoach("深蹲做多少", context());
    expect(result.source).toBe("local");
    expect(result.notice).toContain("无法连接 AI 服务");
    expect(result.text).toContain("3 组");
  });

  it("rejects an empty successful response instead of showing a blank bubble", async () => {
    browserWindow();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ text: "", evidence: [] }), { status: 200 })));
    const result = await askCoach("平板支撑多久", context());
    expect(result.source).toBe("local");
    expect(result.text).toContain("20–40 秒");
  });

  it("reports availability without calling the model", async () => {
    browserWindow();
    const request = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["X-FORM-Preview"]).toBe("1");
      return new Response(JSON.stringify({ authenticated: true, configured: false }), { status: 200 });
    });
    vi.stubGlobal("fetch", request);
    const status = await getCoachAvailability();
    expect(status.available).toBe(false);
    expect(status.label).toContain("DeepSeek 尚未配置");
  });
});
