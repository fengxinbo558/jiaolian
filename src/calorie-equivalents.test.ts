import { describe, expect, it } from "vitest";
import {
  CalorieEquivalentPreferenceStore,
  formatCalorieEquivalent,
} from "./calorie-equivalents";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe("calorie equivalents", () => {
  it("formats a small banana equivalent as a readable fraction", () => {
    expect(formatCalorieEquivalent(9.5, "banana")).toBe("约 1/11 根中等香蕉");
  });

  it("uses grams for a small fat-energy reference", () => {
    expect(formatCalorieEquivalent(9.5, "fat-energy")).toBe("约 1.2 克脂肪能量参考");
  });

  it("persists the selected comparison", () => {
    const storage = new MemoryStorage();
    const store = new CalorieEquivalentPreferenceStore(storage);
    expect(store.load()).toBe("banana");
    store.save("rice");
    expect(store.load()).toBe("rice");
  });
});
