type ErrorEventPayload = {
  type: "runtime" | "promise" | "storage";
  name: string;
  message: string;
  path: string;
  occurredAt: string;
};

function clean(value: unknown, fallback: string): string {
  const raw = value instanceof Error ? `${value.name}: ${value.message}` : String(value ?? fallback);
  return raw
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\b\d{7,}\b/g, "[number]")
    .slice(0, 240);
}

function report(payload: ErrorEventPayload): void {
  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/errors", new Blob([body], { type: "application/json" }));
    return;
  }
  void fetch("/api/errors", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
}

export function installPrivacySafeErrorReporting(): void {
  window.addEventListener("error", (event) => report({
    type: "runtime",
    name: event.error instanceof Error ? event.error.name : "Error",
    message: clean(event.error ?? event.message, "页面运行错误"),
    path: window.location.pathname,
    occurredAt: new Date().toISOString(),
  }));
  window.addEventListener("unhandledrejection", (event) => report({
    type: "promise",
    name: event.reason instanceof Error ? event.reason.name : "UnhandledRejection",
    message: clean(event.reason, "异步操作失败"),
    path: window.location.pathname,
    occurredAt: new Date().toISOString(),
  }));
  window.addEventListener("form:local-storage-error", (event) => report({
    type: "storage",
    name: "LocalStorageError",
    message: clean((event as CustomEvent).detail, "本机数据保存失败"),
    path: window.location.pathname,
    occurredAt: new Date().toISOString(),
  }));
}
