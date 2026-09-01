import { describe, expect, it } from "vitest";
import { isAppView, navigationNeedsSessionConfirmation } from "./view-state";

describe("view state", () => {
  it("accepts only known views", () => {
    expect(isAppView("home")).toBe(true);
    expect(isAppView("body")).toBe(true);
    expect(isAppView("settings")).toBe(false);
    expect(isAppView("billing")).toBe(false);
  });

  it("protects only a live training session", () => {
    expect(navigationNeedsSessionConfirmation("training", "history", true)).toBe(true);
    expect(navigationNeedsSessionConfirmation("training", "training", true)).toBe(false);
    expect(navigationNeedsSessionConfirmation("home", "history", false)).toBe(false);
  });
});
