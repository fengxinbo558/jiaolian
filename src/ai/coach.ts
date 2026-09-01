import type { BodyProfile, BodySnapshot } from "../body/profile";
import { calculateBodyMetrics } from "../body/metrics";
import { EXERCISE_PROFILES, type ExerciseCoachProfile } from "../exercises";

const THREADS_KEY = "form:coach-threads:v1";
const THREAD_LIMIT = 30;
const MESSAGE_LIMIT = 80;

type CoachStorage = Pick<Storage, "getItem" | "setItem">;
export type CoachSource = "ai" | "local";
export type CoachRole = "user" | "assistant";

export interface CoachMessage {
  id: string;
  role: CoachRole;
  text: string;
  evidence: string[];
  createdAt: string;
  source?: CoachSource;
}

export interface CoachThread {
  id: string;
  title: string;
  messages: CoachMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface CoachSessionContext {
  exerciseId?: string;
  exerciseName?: string;
  endedAt: string;
  totalReps: number;
  qualifiedReps: number;
  issueCounts: Record<string, number>;
  planName?: string;
  activeDurationMs?: number | null;
  estimatedCalories?: number | null;
}

export interface CoachContext {
  body: BodyProfile | null;
  bodyHistory?: BodySnapshot[];
  totalSessionCount?: number;
  recentSessions: CoachSessionContext[];
  savedPlans: Array<{ id: string; name: string; goal: string; durationMinutes: number }>;
}

export interface CoachAnswer {
  text: string;
  evidence: string[];
  source: CoachSource;
  notice?: string;
}

export interface CoachAvailability {
  available: boolean;
  authenticated: boolean;
  configured: boolean;
  label: string;
}

type ExerciseGuide = {
  pattern: RegExp;
  name: string;
  prescription: string;
  cue: string;
};

const GUIDES: ExerciseGuide[] = [
  { pattern: /俯卧撑|push[ -]?up/i, name: "俯卧撑", prescription: "先做 3 组，每组 6–12 次，组间休息 60–90 秒", cue: "身体保持一条直线，肘部约向后下方打开；做不到标准次数就改跪姿或上斜俯卧撑" },
  { pattern: /深蹲|蹲起/, name: "深蹲", prescription: "先做 3 组，每组 10–15 次，组间休息 60–90 秒", cue: "膝盖跟随脚尖方向，脚掌压稳；下蹲深度以腰背稳定、没有疼痛为准" },
  { pattern: /平板支撑/, name: "平板支撑", prescription: "先做 3 组，每组 20–40 秒，组间休息 45–75 秒", cue: "收紧腹部和臀部，避免塌腰、耸肩；一旦腰部代偿就结束本组" },
  { pattern: /开合跳/, name: "开合跳", prescription: "先做 4 组，每组 20–30 秒，组间休息 30–45 秒", cue: "轻柔落地，膝盖跟随脚尖；动作快时以落地稳定优先" },
  { pattern: /弓步|箭步/, name: "弓步", prescription: "每侧 3 组，每组 8–12 次，组间休息 60–90 秒", cue: "前脚踩稳、骨盆朝前，后膝向下而不是身体向前冲" },
  { pattern: /臀桥/, name: "臀桥", prescription: "先做 3 组，每组 12–18 次，组间休息 45–75 秒", cue: "肋骨不要外翻，顶端夹臀，不要用腰部过度后仰" },
  { pattern: /鸟狗/, name: "鸟狗式", prescription: "每侧 3 组，每组 6–10 次，组间休息 45–60 秒", cue: "骨盆保持水平，手脚伸远而不是抬得过高" },
  { pattern: /波比|burpee/i, name: "波比跳", prescription: "先做 4 组，每组 5–8 次，组间休息 60–90 秒", cue: "先保证落地和支撑稳定；体能不足时去掉跳跃或俯卧撑" },
];

const CATALOG_PROFILES = Object.values(EXERCISE_PROFILES)
  .filter((profile) => profile.name.length >= 2)
  .sort((a, b) => b.name.length - a.name.length);
const FIXED_GUIDE_IDS = new Set(["push-up", "squat", "plank", "jumping-jack", "reverse-lunge", "glute-bridge", "bird-dog", "burpee"]);

const FITNESS_WORDS = /训练|健身|运动|动作|组数|次数|休息|体重|身高|腰围|臀围|胸围|体脂|BMI|热量|卡路里|减脂|增肌|力量|心肺|拉伸|恢复|计划|摄像头|语音|记录|备份|导入|导出|教练|怎么练|练什么|适合我/;
const RISK_WORDS = /疼痛|疼|痛|不舒服|胸闷|眩晕|头晕|呼吸困难|麻木|发麻|刺痛|酸痛|扭伤|拉伤|心悸/;
const NEGATED_RISK = /没(?:有)?(?:疼痛|疼|痛|不舒服|胸闷|眩晕|头晕|呼吸困难|麻木|发麻|受伤)|不疼|无痛/;
const MEDICAL_WORDS = /诊断|治疗|吃什么药|用什么药|药物|处方|康复治疗/;

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizedEvidence(values: unknown): string[] {
  return Array.isArray(values)
    ? values.map(String).map((value) => value.trim()).filter(Boolean).slice(0, 4)
    : [];
}

export function createCoachMessage(
  role: CoachRole,
  text: string,
  evidence: string[] = [],
  source?: CoachSource,
): CoachMessage {
  return { id: id("message"), role, text, evidence, source, createdAt: new Date().toISOString() };
}

function normalizeThread(value: unknown): CoachThread | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<CoachThread>;
  if (typeof input.id !== "string" || !Array.isArray(input.messages)) return null;
  const messages = input.messages.filter((message): message is CoachMessage => Boolean(
    message && typeof message === "object"
      && (message.role === "user" || message.role === "assistant")
      && typeof message.text === "string",
  )).slice(-MESSAGE_LIMIT).map((message) => ({
    ...message,
    id: typeof message.id === "string" ? message.id : id("message"),
    evidence: normalizedEvidence(message.evidence),
    source: message.source === "ai" || message.source === "local" ? message.source : undefined,
    createdAt: typeof message.createdAt === "string" ? message.createdAt : new Date().toISOString(),
  }));
  const now = new Date().toISOString();
  return {
    id: input.id,
    title: typeof input.title === "string" ? input.title : "新的对话",
    messages,
    createdAt: typeof input.createdAt === "string" ? input.createdAt : now,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : now,
  };
}

export class CoachThreadStore {
  constructor(private readonly storage: CoachStorage, private readonly key = THREADS_KEY) {}

  load(): CoachThread[] {
    try {
      const parsed = JSON.parse(this.storage.getItem(this.key) || "[]") as unknown;
      return Array.isArray(parsed)
        ? parsed.map(normalizeThread).filter((thread): thread is CoachThread => thread !== null)
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, THREAD_LIMIT)
        : [];
    } catch { return []; }
  }

  create(): CoachThread {
    const now = new Date().toISOString();
    return { id: id("thread"), title: "新的对话", messages: [], createdAt: now, updatedAt: now };
  }

  save(thread: CoachThread): void {
    const normalized = normalizeThread({ ...thread, updatedAt: new Date().toISOString() });
    if (!normalized) return;
    const threads = this.load().filter((item) => item.id !== normalized.id);
    this.storage.setItem(this.key, JSON.stringify([normalized, ...threads].slice(0, THREAD_LIMIT)));
  }

  remove(threadId: string): void {
    this.storage.setItem(this.key, JSON.stringify(this.load().filter((item) => item.id !== threadId)));
  }
}

function lastUserMessage(history: CoachMessage[]): string {
  return [...history].reverse().find((message) => message.role === "user")?.text ?? "";
}

function effectiveQuestion(message: string, history: CoachMessage[]): string {
  if (/^(那|然后|这个|呢|多久|多少|为什么|怎么做|继续)/.test(message.trim()) && message.length < 36) {
    return `${lastUserMessage(history)}；追问：${message}`;
  }
  return message;
}

function profileEvidence(context: CoachContext): string[] {
  const body = context.body;
  if (!body) return ["尚未填写完整身体资料"];
  const values = [body.heightCm ? `身高 ${body.heightCm} cm` : "", body.weightKg ? `体重 ${body.weightKg} kg` : ""].filter(Boolean);
  return values.length ? values : ["身体资料尚不完整"];
}

function catalogGuidance(profile: ExerciseCoachProfile, context: CoachContext): CoachAnswer {
  const training = profile.suggestedTraining;
  const prescription = training
    ? `${training.beginner}，组间休息约 ${training.restSeconds} 秒`
    : profile.mode === "timed-hold" ? "先做 3 组，每组保持 15–30 秒，组间休息 45–75 秒" : "先做 2–3 组，以动作稳定、不勉强为停止标准";
  const mistake = profile.commonMistakes?.[0];
  const text = `${profile.name}建议从${prescription}开始。发力提示：${profile.activationCue}${mistake ? ` 常见问题是“${mistake.label}”：${mistake.correction}` : ""}${profile.safetyNotes?.[0] ? ` 安全提示：${profile.safetyNotes[0]}` : ""}`;
  return {
    text,
    evidence: [profile.name, `主要训练：${profile.primaryMuscles.join("、")}`, ...profileEvidence(context)].slice(0, 4),
    source: "local",
    notice: "当前由本机动作库回答；云端教练可用时会进一步结合多轮对话调整。",
  };
}

function sessionEvidence(context: CoachContext): string[] {
  const sessions = context.recentSessions;
  if (!sessions.length) return ["暂时没有训练记录"];
  const completed = sessions.reduce((sum, item) => sum + item.totalReps, 0);
  const qualified = sessions.reduce((sum, item) => sum + item.qualifiedReps, 0);
  return [context.totalSessionCount && context.totalSessionCount > sessions.length
    ? `累计 ${context.totalSessionCount} 次训练（读取最近 ${sessions.length} 次）`
    : `最近 ${sessions.length} 次训练`, `有效动作 ${qualified}/${completed || 0}`];
}

function localCoachReply(message: string, context: CoachContext, history: CoachMessage[] = []): CoachAnswer {
  const question = effectiveQuestion(message, history);
  const compact = question.replace(/\s+/g, "");
  const local = (text: string, evidence: string[]): CoachAnswer => ({
    text, evidence, source: "local", notice: "当前由本机教练回答；云端教练可用时会提供更灵活的多轮分析。",
  });

  if (RISK_WORDS.test(compact) && !NEGATED_RISK.test(compact)) {
    return local("先停止当前动作，不要硬撑。若是不适由训练动作触发，可在无痛范围内休息并改做轻量活动；如果疼痛持续、加重，或伴随胸闷、眩晕、呼吸困难，请及时咨询医生或急救服务。我不能在这里做医疗诊断。", ["检测到运动不适或风险描述"]);
  }
  if (MEDICAL_WORDS.test(compact)) {
    return local("我不能提供诊断、用药或治疗方案。你可以告诉我医生已经允许的活动范围，我再帮你把训练动作、强度和休息安排得更保守；如果症状正在发生或加重，请先咨询医疗专业人员。", ["医疗问题不由健身教练判断"]);
  }

  if (/体重.*哪|身高.*哪|三围.*哪|身体数据|身体资料.*填|腰围.*填/.test(compact)) {
    return local("进入底部“身体”页，在“更新我的数据”里填写年龄、身高、体重和活动水平；点“添加围度”可填写胸围、腰围、颈围和臀围，最后点“保存并更新参考”。", ["产品操作：身体状态"]);
  }
  if (/语音.*(?:怎么|不能|没)|录音|说话输入/.test(compact)) {
    return local("在“身体”页点“语音录入”，再次点击“结束录音”才停止；识别文字可以先手动修改，再点“确认并保存”。浏览器未授权麦克风或不支持语音识别时，会保留文字输入方式。", ["产品操作：语音录入"]);
  }
  if (/备份|导出|导入|换设备|数据.*保存/.test(compact)) {
    return local("进入“我的”页的数据与隐私区域：可导出加密备份，换设备后再导入。训练记录、身体资料、收藏计划和教练对话都保存在当前账户对应的本机空间，其他用户不能直接看到。", ["产品操作：本机数据"]);
  }
  if (/记录.*删|计划.*删|对话.*删|怎么删除/.test(compact)) {
    return local("训练记录、身体历史、收藏计划和 AI 对话都有各自的删除入口。删除不可恢复，建议先导出加密备份。", ["产品操作：删除与恢复"]);
  }
  if (/训练记录.*(?:哪|看|找)|上次.*练|最近.*练|我做过/.test(compact)) {
    const latest = context.recentSessions[0];
    if (!latest) return local("进入底部“记录”页可以查看历史训练；目前本机还没有训练记录。", ["暂时没有训练记录"]);
    return local(`进入底部“记录”页可查看和删除历史训练。最近一次是${latest.exerciseName ?? latest.planName ?? "一次训练"}，识别 ${latest.totalReps} 次、合格 ${latest.qualifiedReps} 次。`, sessionEvidence(context));
  }
  if (/训练.*多少次|练了多少次|总共.*训练/.test(compact)) {
    return local(`当前本机共保存 ${context.totalSessionCount ?? context.recentSessions.length} 次训练记录。进入底部“记录”页可逐条查看、继续或删除。`, sessionEvidence(context));
  }
  if (/收藏.*计划|计划.*(?:哪|查看|找)|我的计划/.test(compact)) {
    return local(`进入底部“计划”页，在“已收藏的计划”查看、启动或删除。当前本机保存了 ${context.savedPlans.length} 套计划。`, [`已收藏计划 ${context.savedPlans.length} 套`]);
  }
  if (/AI|人工智能|DeepSeek|大模型|为什么.*固定|为什么.*一样/i.test(compact)) {
    return local("页面底部状态会明确显示当前回答来源：显示“DeepSeek AI 已连接”时由大模型生成；显示“本机教练”时是断网、未登录、未配置密钥或服务异常后的安全降级，不会假装成 AI。", ["产品操作：AI 连接状态"]);
  }

  const matchedProfile = CATALOG_PROFILES.find((profile) => compact.includes(profile.name.replace(/\s+/g, "")));
  const guide = GUIDES.find((item) => item.pattern.test(compact));
  if (matchedProfile && (!guide || !FIXED_GUIDE_IDS.has(matchedProfile.exerciseId))) {
    return catalogGuidance(matchedProfile, context);
  }
  if (guide) {
    const same = context.recentSessions.filter((session) => guide.pattern.test(`${session.exerciseName ?? ""}${session.exerciseId ?? ""}`));
    const basis = same.length ? `你已有 ${same.length} 条相关记录，先以动作质量稳定为目标` : "目前没有足够的同动作历史，先从保守训练量开始";
    return local(`${basis}。${guide.prescription}。动作要点：${guide.cue}。如果最后 2 次仍能稳定完成，下次每组加 1–2 次；动作变形就不要硬加。`, [guide.name, ...profileEvidence(context), ...sessionEvidence({ ...context, recentSessions: same })].slice(0, 4));
  }

  if (/复盘|表现|练得怎么样|完成得怎么样|动作质量|评价/.test(compact)) {
    const latest = context.recentSessions[0];
    if (!latest || latest.totalReps <= 0) return local("这次还没有识别到有效动作，所以不能评价为“完成得不错”。先确认摄像头能看见完整身体，再完成至少 1 次动作后复盘。", ["有效动作 0 次"]);
    const rate = Math.round(latest.qualifiedReps / Math.max(1, latest.totalReps) * 100);
    const topIssue = Object.entries(latest.issueCounts).sort((a, b) => b[1] - a[1])[0];
    return local(`最近一次共识别 ${latest.totalReps} 次，其中 ${latest.qualifiedReps} 次合格，合格率约 ${rate}%。${topIssue ? `最常见问题是“${topIssue[0]}”，出现 ${topIssue[1]} 次，下一次先只纠正这一项。` : "暂未记录到重复出现的动作问题。"}`, sessionEvidence(context));
  }

  if (/体重|身高|体脂|BMI|身体状态|身体趋势|变化/.test(compact)) {
    const body = context.body;
    if (!body?.weightKg || !body.heightCm) return local("还缺少身高或体重，暂时不能计算 BMI 和趋势。先到“身体”页补全资料；围度是可选项，但补充腰围、颈围和臀围后可获得更多估算参考。", profileEvidence(context));
    const metrics = calculateBodyMetrics(body);
    const previous = context.bodyHistory?.find((item) => item.recordedAt !== body.updatedAt && item.weightKg != null);
    const change = previous?.weightKg != null ? body.weightKg - previous.weightKg : null;
    const trend = change == null ? "目前只有一次有效记录，暂时不能判断变化趋势" : `相比上一条记录，体重${change === 0 ? "没有变化" : `${change > 0 ? "增加" : "减少"} ${Math.abs(change).toFixed(1)} kg`}`;
    return local(`当前体重 ${body.weightKg} kg，身高 ${body.heightCm} cm，BMI 约 ${metrics.bmi ?? "—"}（${metrics.bmiBand ?? "资料不足"}）。${trend}。体脂和围度属于估算参考，应看连续趋势，不把单次结果当诊断。`, [...profileEvidence(context), previous ? `上次体重 ${previous.weightKg} kg` : "暂无上一条可比记录"]);
  }

  if (/练什么|今天.*练|安排|推荐.*训练|计划|适合我|全身|核心|有氧|上肢|下肢/.test(compact)) {
    const minutes = Number(compact.match(/(\d{1,3})分钟/)?.[1] ?? 20);
    const avoidLegs = /昨天.*(?:腿|下肢)|腿.*酸|不练腿/.test(compact);
    const core = /核心/.test(compact);
    const cardio = /有氧|心肺/.test(compact);
    let work: string;
    if (avoidLegs) work = "上斜俯卧撑 3×8–12、鸟狗式每侧 3×8、平板支撑 3×20–30 秒";
    else if (core) work = "鸟狗式每侧 3×8、臀桥 3×12、平板支撑 3×20–30 秒";
    else if (cardio) work = "原地高抬腿 4×30 秒、开合跳 4×20 秒，组间休息 30–45 秒";
    else work = "深蹲 3×12、上斜俯卧撑 3×8–12、鸟狗式每侧 3×8、开合跳 3×20 秒";
    return local(`给你一套约 ${Math.min(60, Math.max(10, minutes))} 分钟的保守方案：热身 3 分钟；${work}；动作间休息 60 秒；最后慢走和拉伸 2–3 分钟。若动作质量下降或出现不适，立即减量或停止。`, [...profileEvidence(context), ...sessionEvidence(context)].slice(0, 4));
  }

  if (/吃|饮食|蛋白|碳水|营养|食物|热量缺口/.test(compact)) {
    return local("可以先记录一天饮食和训练消耗，再看一周平均趋势。每餐优先保证蛋白质、蔬菜和可控分量的主食；减脂不要只靠单次训练热量，也不要用极端热量缺口。若你告诉我目标和一天大致饮食，我可以帮你整理成可执行记录。", ["一般营养常识，不替代医疗或营养诊断"]);
  }

  if (FITNESS_WORDS.test(compact)) {
    return local("我理解这是健身相关问题，但还缺一个关键条件。请补充你的目标、可用时间、是否有器械，以及想练的部位；我会按组数、次数、休息和动作替代方案给你安排。", ["问题信息不足，未虚构个人资料"]);
  }

  return local("这个问题超出了 FORM 的健身范围。我可以继续帮你处理训练计划、动作纠正、训练复盘、身体趋势、一般营养常识或软件操作。", ["仅回答健身与 FORM 产品相关问题"]);
}

function requestNotice(status: number, error?: string): string {
  if (status === 401) return "尚未通过邀请码登录，当前由本机教练回答。";
  if (status === 503) return error?.includes("配置") ? "DeepSeek 尚未配置，当前由本机教练回答。" : "AI 服务维护中，当前由本机教练回答。";
  if (status === 429) return "AI 请求过多，已切换到本机教练。";
  return "AI 服务暂时不可用，已切换到本机教练。";
}

function previewHeaders(base: Record<string, string> = {}): Record<string, string> {
  return new URLSearchParams(window.location.search).get("preview") === "1"
    ? { ...base, "X-FORM-Preview": "1" }
    : base;
}

function remoteContextForQuestion(message: string, context: CoachContext): CoachContext {
  const compact = message.replace(/\s+/g, "");
  const bodyNeeded = /身体|身高|体重|体脂|围度|BMI|减脂|增肌|适合|练什么|训练|计划|热量|卡路里/.test(compact);
  const bodyHistoryNeeded = /趋势|变化|相比|上次|历史/.test(compact);
  const sessionsNeeded = /训练|动作|练什么|适合|计划|复盘|表现|上次|记录|组数|次数|休息/.test(compact);
  const plansNeeded = /计划|收藏|安排/.test(compact);
  const fullBodyNeeded = /身体|体脂|围度|腰围|臀围|胸围|颈围|BMI|趋势|变化/.test(compact);
  const body = bodyNeeded && context.body
    ? fullBodyNeeded ? context.body : {
      ...context.body,
      chestCm: null,
      waistCm: null,
      neckCm: null,
      hipCm: null,
    }
    : null;
  return {
    body,
    bodyHistory: bodyHistoryNeeded ? context.bodyHistory?.slice(0, 6) : [],
    totalSessionCount: sessionsNeeded ? context.totalSessionCount : 0,
    recentSessions: sessionsNeeded ? context.recentSessions.slice(0, 8) : [],
    savedPlans: plansNeeded ? context.savedPlans.slice(0, 8) : [],
  };
}

export async function getCoachAvailability(): Promise<CoachAvailability> {
  try {
    const response = await fetch("/api/ai/status", { headers: previewHeaders({ Accept: "application/json" }) });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    const authenticated = payload.authenticated === true;
    const configured = payload.configured === true;
    return {
      available: response.ok && authenticated && configured,
      authenticated,
      configured,
      label: !authenticated ? "请先用邀请码登录；目前可使用本机教练" : !configured ? "DeepSeek 尚未配置；目前可使用本机教练" : "DeepSeek 已配置；发送问题时验证连接",
    };
  } catch {
    return { available: false, authenticated: false, configured: false, label: "AI 状态暂不可用；目前可使用本机教练" };
  }
}

export async function askCoach(
  message: string,
  context: CoachContext,
  history: CoachMessage[] = [],
): Promise<CoachAnswer> {
  const combined = effectiveQuestion(message, history).replace(/\s+/g, "");
  if ((RISK_WORDS.test(combined) && !NEGATED_RISK.test(combined)) || MEDICAL_WORDS.test(combined)) {
    return localCoachReply(message, context, history);
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch("/api/ai/coach", {
      method: "POST",
      headers: previewHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
      credentials: "same-origin",
      signal: controller.signal,
      body: JSON.stringify({
        message,
        context: remoteContextForQuestion(message, context),
        history: history.slice(-10).map(({ role, text }) => ({ role, text })),
      }),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const fallback = localCoachReply(message, context, history);
      return { ...fallback, notice: requestNotice(response.status, typeof payload.error === "string" ? payload.error : undefined) };
    }
    if (typeof payload.text !== "string" || !payload.text.trim()) throw new Error("invalid AI response");
    return { text: payload.text.trim(), evidence: normalizedEvidence(payload.evidence), source: "ai" };
  } catch (error) {
    const fallback = localCoachReply(message, context, history);
    return { ...fallback, notice: error instanceof DOMException && error.name === "AbortError"
      ? "AI 响应超时，已切换到本机教练。"
      : "无法连接 AI 服务，已切换到本机教练。" };
  } finally {
    window.clearTimeout(timeout);
  }
}

export { localCoachReply };
