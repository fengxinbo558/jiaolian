import { AccountStorage, setCurrentAccountStorage } from "./data/account-storage";
import { installPrivacySafeErrorReporting } from "./error-reporting";

type SessionResponse = { authenticated: boolean; accountId?: string; inviteRequired?: boolean; devHint?: string };

async function resolveAccountId(): Promise<string> {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "1") {
    return "local-preview-account";
  }
  const response = await fetch("/api/auth/session", { credentials: "include" });
  if (!response.ok) throw new Error("Authentication service unavailable");
  const session = await response.json() as SessionResponse;
  if (session.authenticated && session.accountId) return session.accountId;
  return waitForAuthentication(session);
}

function waitForAuthentication(session: SessionResponse): Promise<string> {
  document.documentElement.classList.add("auth-locked");
  const shell = document.createElement("section");
  shell.className = "invite-gate";
  shell.innerHTML = `
    <div class="invite-card">
      <span class="invite-brand">F/ FORM</span>
      <p class="invite-eyebrow">受邀体验</p>
      <h1>先验证访问资格</h1>
      <p class="invite-copy">首次使用输入邀请码；以前激活过则使用恢复码。你的身体、训练和对话仍只保存在当前账户的本机空间。</p>
      <div class="invite-tabs"><button type="button" data-mode="invite" aria-pressed="true">邀请码</button><button type="button" data-mode="recover" aria-pressed="false">恢复码</button></div>
      <label><span id="invite-label">邀请码</span><input id="invite-code" type="text" autocomplete="one-time-code" spellcheck="false" placeholder="输入邀请码" /></label>
      <button class="invite-submit" id="invite-submit" type="button">验证并进入</button>
      <p class="invite-status" id="invite-status" role="status">${session.devHint ? `本地测试邀请码：${session.devHint}` : "邀请码由产品方发放"}</p>
    </div>`;
  const style = document.createElement("style");
  style.textContent = `
    .auth-locked body > *:not(.invite-gate){display:none!important}.invite-gate{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:24px;background:#f3f0e9;color:#171916;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}.invite-card{width:min(520px,100%);box-sizing:border-box;padding:clamp(28px,6vw,54px);border:1px solid #dedbd2;border-radius:32px;background:#fffdf9;box-shadow:0 30px 90px rgba(42,39,31,.14)}.invite-brand{display:inline-flex;padding:10px 14px;border:1px solid #dedbd2;border-radius:999px;font-weight:800}.invite-eyebrow{margin:44px 0 8px;color:#74802b;font-size:.75rem;font-weight:800;letter-spacing:.12em}.invite-card h1{margin:0 0 16px;font-size:clamp(2.3rem,8vw,4.2rem);line-height:1;letter-spacing:-.06em}.invite-copy{color:#73776f;line-height:1.7}.invite-tabs{display:flex;gap:8px;margin:28px 0 16px}.invite-tabs button{min-height:40px;padding:0 16px;border:1px solid #dedbd2;border-radius:999px;background:transparent;font:inherit}.invite-tabs button[aria-pressed=true]{background:#222821;color:white}.invite-card label{display:grid;gap:8px;font-weight:700}.invite-card input{height:54px;padding:0 16px;border:1px solid #cfcfc7;border-radius:14px;background:white;font:inherit;font-size:1rem}.invite-submit{width:100%;height:54px;margin-top:14px;border:0;border-radius:999px;background:#d5ef5b;color:#151914;font:inherit;font-weight:800;cursor:pointer}.invite-status{min-height:24px;margin:16px 0 0;color:#73776f;font-size:.78rem;line-height:1.5}.recovery-result{margin-top:22px;padding:18px;border-radius:18px;background:#222821;color:white}.recovery-result strong{display:block;margin:8px 0;font-size:1.25rem;letter-spacing:.06em;word-break:break-all}.recovery-result button{height:44px;padding:0 16px;border:0;border-radius:999px;background:#d5ef5b;font:inherit;font-weight:800}`;
  document.head.append(style);
  document.body.append(shell);
  return new Promise((resolve) => {
    let mode: "invite" | "recover" = "invite";
    const input = shell.querySelector<HTMLInputElement>("#invite-code")!;
    const label = shell.querySelector<HTMLElement>("#invite-label")!;
    const submit = shell.querySelector<HTMLButtonElement>("#invite-submit")!;
    const status = shell.querySelector<HTMLElement>("#invite-status")!;
    for (const tab of shell.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
      tab.addEventListener("click", () => {
        mode = tab.dataset.mode === "recover" ? "recover" : "invite";
        for (const candidate of shell.querySelectorAll<HTMLButtonElement>("[data-mode]")) candidate.setAttribute("aria-pressed", String(candidate === tab));
        label.textContent = mode === "invite" ? "邀请码" : "账户恢复码";
        input.placeholder = mode === "invite" ? "输入邀请码" : "输入首次激活时保存的恢复码";
        submit.textContent = mode === "invite" ? "验证并进入" : "恢复账户访问";
        input.value = "";
        input.focus();
      });
    }
    const authenticate = async () => {
      const code = input.value.trim();
      if (!code) { status.textContent = `请输入${mode === "invite" ? "邀请码" : "恢复码"}。`; return; }
      submit.disabled = true;
      status.textContent = "正在验证……";
      try {
        const response = await fetch(mode === "invite" ? "/api/auth/activate" : "/api/auth/recover", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const result = await response.json() as { accountId?: string; recoveryCode?: string; error?: string };
        if (!response.ok || !result.accountId) throw new Error(result.error || "验证失败");
        if (result.recoveryCode) {
          const recovery = document.createElement("div");
          recovery.className = "recovery-result";
          recovery.innerHTML = `<span>只显示这一次，请保存账户恢复码</span><strong></strong><button type="button">我已保存，进入 FORM</button>`;
          recovery.querySelector("strong")!.textContent = result.recoveryCode;
          shell.querySelector(".invite-tabs")?.remove();
          shell.querySelector("label")?.remove();
          submit.remove();
          status.remove();
          shell.querySelector(".invite-card")?.append(recovery);
          recovery.querySelector("button")!.addEventListener("click", () => finish(result.accountId!));
          return;
        }
        finish(result.accountId);
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "验证失败，请重试";
        submit.disabled = false;
      }
    };
    const finish = (accountId: string) => {
      shell.remove();
      style.remove();
      document.documentElement.classList.remove("auth-locked");
      resolve(accountId);
    };
    submit.addEventListener("click", () => void authenticate());
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") void authenticate(); });
    input.focus();
  });
}

async function start(): Promise<void> {
  const accountId = await resolveAccountId();
  const storage = await AccountStorage.create(accountId);
  setCurrentAccountStorage(storage);
  installPrivacySafeErrorReporting();
  window.addEventListener("pagehide", () => { void storage.flush(); }, { capture: true });
  await import("./main");
}

void start().catch((error: unknown) => {
  document.body.innerHTML = `<main class="bootstrap-error"><h1>本地数据没有打开</h1><p>请刷新页面；如果仍然失败，可在浏览器设置中允许本站存储数据。</p></main>`;
  window.dispatchEvent(new CustomEvent("form:bootstrap-error", { detail: error }));
});
