export type AppView = "home" | "category" | "course" | "library" | "training" | "ai" | "plan" | "my" | "history" | "body" | "summary";

export const APP_VIEWS: AppView[] = [
  "home", "category", "course", "library", "training", "ai", "plan", "my", "history", "body", "summary",
];

export function isAppView(value: string | undefined): value is AppView {
  return APP_VIEWS.includes(value as AppView);
}

export function navigationNeedsSessionConfirmation(
  current: AppView,
  next: AppView,
  sessionActive: boolean,
): boolean {
  return sessionActive && current === "training" && next !== "training";
}
