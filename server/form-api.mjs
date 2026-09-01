import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const sessionSecret = process.env.SESSION_SECRET || "local-development-session-secret-change-before-deploy";
const invitePepper = process.env.INVITE_HASH_PEPPER || "local-development-invite-pepper";
const production = process.env.NODE_ENV === "production";
const defaultInvite = process.env.FORM_DEV_INVITE_CODE || (production ? null : "FORM-DEMO-2026");
const configuredInviteHashes = String(process.env.FORM_INVITE_HASHES || "")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => /^[a-f0-9]{64}$/i.test(value));
const productionConfigurationError = production && (
  !process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32
  || !process.env.INVITE_HASH_PEPPER || process.env.INVITE_HASH_PEPPER.length < 24
  || configuredInviteHashes.length === 0
);

function hash(value) {
  return createHash("sha256").update(`${invitePepper}:${value.trim()}`).digest("hex");
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function validInvite(code) {
  if (typeof code !== "string" || !code.trim()) return false;
  const candidate = hash(code);
  const hashes = production ? configuredInviteHashes : [
    ...configuredInviteHashes,
    ...(defaultInvite ? [hash(defaultInvite)] : []),
  ];
  return hashes.some((value) => safeEqual(value, candidate));
}

function signToken(type, accountId, lifetimeMs) {
  const payload = Buffer.from(JSON.stringify({ type, accountId, exp: Date.now() + lifetimeMs })).toString("base64url");
  const signature = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyToken(token, expectedType) {
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  const expected = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  if (!safeEqual(signature, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return parsed.type === expectedType && typeof parsed.accountId === "string" && parsed.exp > Date.now() ? parsed.accountId : null;
  } catch {
    return null;
  }
}

function signSession(accountId) {
  return signToken("session", accountId, 30 * 24 * 60 * 60 * 1000);
}

function recoveryCode(accountId) {
  return `FORMR-${signToken("recovery", accountId, 5 * 365 * 24 * 60 * 60 * 1000)}`;
}

function accountFromRecoveryCode(code) {
  if (typeof code !== "string") return null;
  return verifyToken(code.trim().replace(/^FORMR-/i, ""), "recovery");
}

function cookieValue(headers, name) {
  const cookie = headers.cookie || "";
  return cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || null;
}

function sessionCookie(token, secure) {
  return `form_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure ? "; Secure" : ""}`;
}

function json(status, body, headers = {}) {
  return { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }, body: JSON.stringify(body) };
}

function parseBody(raw) {
  if (!raw || raw.length > 100_000) throw new Error("invalid body");
  return JSON.parse(raw);
}

function accountFromRequest(headers) {
  if (!production && headers["x-form-preview"] === "1") return { id: "local-preview-account", enabled: true };
  const accountId = verifyToken(cookieValue(headers, "form_session"), "session");
  return accountId ? { id: accountId, enabled: true } : null;
}

function coachSystemPrompt() {
  return `你是 FORM AI 健身教练。只回答训练计划、动作练习、训练复盘、身体趋势、一般营养常识和 FORM 产品操作。
规则：
1. 必须使用提供的身体资料、训练记录和已收藏计划，但资料不足时明确说明，绝不虚构用户做过训练。
2. 训练建议尽量给出动作、组数、次数或时长、组间休息和降阶方式；用户追问时结合此前对话，不重复固定模板。
3. 不能做医疗诊断、用药或治疗建议；出现疼痛、胸闷、眩晕、呼吸困难等风险时先建议停止训练并寻求专业帮助。
4. 用户问产品操作时只根据上下文中的 productCapabilities 回答；不确定时明确说明。
5. 完全无关健身与 FORM 的问题，用一句话说明范围并引导回训练、身体趋势或产品操作。
6. 回答使用自然、简洁中文。只返回合法 JSON：{"text":"回答","evidence":["依据1"]}。`;
}

function minimalContext(input, question = "") {
  const compact = String(question).replace(/\s+/g, "");
  const bodyNeeded = /身体|身高|体重|体脂|围度|BMI|减脂|增肌|适合|练什么|训练|计划|热量|卡路里/i.test(compact);
  const bodyHistoryNeeded = /趋势|变化|相比|上次|历史/.test(compact);
  const sessionsNeeded = /训练|动作|练什么|适合|计划|复盘|表现|上次|记录|组数|次数|休息/.test(compact);
  const plansNeeded = /计划|收藏|安排/.test(compact);
  const fullBodyNeeded = /身体|体脂|围度|腰围|臀围|胸围|颈围|BMI|趋势|变化/i.test(compact);
  const suppliedBody = input?.body && typeof input.body === "object" ? input.body : null;
  const body = bodyNeeded && suppliedBody
    ? fullBodyNeeded ? suppliedBody : { ...suppliedBody, chestCm: null, waistCm: null, neckCm: null, hipCm: null }
    : null;
  const bodyHistory = bodyHistoryNeeded && Array.isArray(input?.bodyHistory) ? input.bodyHistory.slice(0, 6) : [];
  const totalSessionCount = sessionsNeeded && Number.isFinite(input?.totalSessionCount) ? Math.max(0, Math.floor(input.totalSessionCount)) : 0;
  const recentSessions = sessionsNeeded && Array.isArray(input?.recentSessions) ? input.recentSessions.slice(0, 8) : [];
  const savedPlans = plansNeeded && Array.isArray(input?.savedPlans) ? input.savedPlans.slice(0, 8) : [];
  return {
    body,
    bodyHistory,
    totalSessionCount,
    recentSessions,
    savedPlans,
    productCapabilities: [
      "身体页可填写年龄、身高、体重、活动水平和可选围度",
      "支持训练记录、身体历史、收藏计划和教练对话的本机保存与删除",
      "支持导出和导入加密本机备份",
      "支持摄像头实时动作识别与语音提示",
    ],
  };
}

function minimalHistory(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(-10).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    if (item.role !== "user" && item.role !== "assistant") return [];
    const content = typeof item.text === "string" ? item.text.trim().slice(0, 3000) : "";
    return content ? [{ role: item.role, content }] : [];
  });
}

export async function handleFormApi({ method, pathname, headers = {}, rawBody = "", secure = false }) {
  if (productionConfigurationError) return json(503, { error: "生产环境安全配置不完整" });

  if (method === "GET" && pathname === "/api/auth/session") {
    const account = accountFromRequest(headers);
    return json(200, { authenticated: Boolean(account), accountId: account?.id, inviteRequired: true, devHint: process.env.NODE_ENV === "production" ? undefined : defaultInvite });
  }

  if (method === "POST" && pathname === "/api/auth/activate") {
    let input;
    try { input = parseBody(rawBody); } catch { return json(400, { error: "请求格式错误" }); }
    if (!validInvite(input.code)) return json(403, { error: "邀请码无效" });
    const accountId = randomUUID();
    return json(200, { accountId, recoveryCode: recoveryCode(accountId) }, { "Set-Cookie": sessionCookie(signSession(accountId), secure) });
  }

  if (method === "POST" && pathname === "/api/auth/recover") {
    let input;
    try { input = parseBody(rawBody); } catch { return json(400, { error: "请求格式错误" }); }
    const accountId = accountFromRecoveryCode(input.code);
    if (!accountId) return json(403, { error: "恢复码无效或已过期" });
    return json(200, { accountId }, { "Set-Cookie": sessionCookie(signSession(accountId), secure) });
  }

  if (method === "POST" && pathname === "/api/admin/invites") {
    return json(410, { error: "首版邀请码由云端环境配置管理" });
  }

  if (method === "POST" && pathname === "/api/errors") {
    const account = accountFromRequest(headers);
    if (!account) return json(401, { error: "请先登录" });
    let input;
    try { input = parseBody(rawBody); } catch { return json(400, { error: "请求格式错误" }); }
    const allowedTypes = new Set(["runtime", "promise", "storage"]);
    const event = {
      type: allowedTypes.has(input.type) ? input.type : "runtime",
      name: String(input.name || "Error").slice(0, 80),
      message: String(input.message || "").slice(0, 240),
      path: String(input.path || "/").split("?")[0].slice(0, 120),
      occurredAt: typeof input.occurredAt === "string" ? input.occurredAt : new Date().toISOString(),
      account: createHmac("sha256", sessionSecret).update(account.id).digest("hex").slice(0, 12),
    };
    console.error(`[FORM_CLIENT_ERROR] ${JSON.stringify(event)}`);
    return json(202, { accepted: true });
  }

  if (method === "GET" && pathname === "/api/ai/status") {
    const account = accountFromRequest(headers);
    return json(200, {
      authenticated: Boolean(account),
      configured: Boolean(process.env.DEEPSEEK_API_KEY),
      provider: process.env.DEEPSEEK_API_KEY ? "deepseek" : null,
    });
  }

  if (method === "POST" && pathname === "/api/ai/coach") {
    const account = accountFromRequest(headers);
    if (!account) return json(401, { error: "请先登录" });
    if (!process.env.DEEPSEEK_API_KEY) return json(503, { error: "AI 服务尚未配置" });
    let input;
    try { input = parseBody(rawBody); } catch { return json(400, { error: "请求格式错误" }); }
    if (typeof input.message !== "string" || !input.message.trim() || input.message.length > 3000) return json(400, { error: "问题为空或过长" });
    const context = minimalContext(input.context, input.message);
    const history = minimalHistory(input.history);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const upstream = await fetch(`${process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
        body: JSON.stringify({
          model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
          response_format: { type: "json_object" },
          temperature: 0.3,
          max_tokens: 1200,
          user: createHmac("sha256", sessionSecret).update(account.id).digest("hex").slice(0, 32),
          messages: [
            { role: "system", content: coachSystemPrompt() },
            ...history,
            { role: "user", content: JSON.stringify({ question: input.message.trim(), context }) },
          ],
        }),
      });
      if (!upstream.ok) {
        console.error(`[FORM_AI_ERROR] upstream_status=${upstream.status}`);
        return json(upstream.status === 429 ? 429 : 502, { error: upstream.status === 429 ? "AI 请求过多" : "AI 服务暂时不可用" });
      }
      const payload = await upstream.json();
      const content = payload?.choices?.[0]?.message?.content;
      try {
        const result = JSON.parse(content);
        const text = String(result.text || "").trim().slice(0, 5000);
        if (!text) return json(502, { error: "AI 返回内容为空" });
        return json(200, { text, evidence: Array.isArray(result.evidence) ? result.evidence.map(String).slice(0, 4) : [] });
      } catch {
        return json(502, { error: "AI 返回格式异常" });
      }
    } catch (error) {
      console.error(`[FORM_AI_ERROR] ${error instanceof Error ? error.message : "request failed"}`);
      return json(502, { error: error?.name === "AbortError" ? "AI 响应超时" : "AI 服务暂时不可用" });
    } finally {
      clearTimeout(timeout);
    }
  }

  return json(404, { error: "Not found" });
}
