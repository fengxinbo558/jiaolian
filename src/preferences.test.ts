import { describe, expect, it } from "vitest";
import { PreferencesStore } from "./preferences";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe("PreferencesStore", () => {
  it("starts without an invented body weight", () => {
    expect(new PreferencesStore(new MemoryStorage()).load()).toEqual({
      weightKg: null,
      showSkeleton: false,
    });
  });

  it("persists valid local preferences and rejects invalid weight", () => {
    const store = new PreferencesStore(new MemoryStorage());
    store.save({ weightKg: 72, showSkeleton: true });
    expect(store.load()).toEqual({ weightKg: 72, showSkeleton: true });
    expect(store.save({ weightKg: 12, showSkeleton: false }).weightKg).toBeNull();
  });
});
