import { describe, expect, it } from "vitest";
import {
  CapacityStore,
  estimateE1rm,
  estimateWorkingLoadRange,
  suggestNextLoad,
  type CapacityRecord,
} from "./capacity";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function equipmentRecord(overrides: Partial<CapacityRecord> = {}): CapacityRecord {
  return {
    schemaVersion: 1,
    id: "record-1",
    exerciseId: "dumbbell-floor-press",
    mode: "equipment",
    performanceType: "working",
    recordedAt: "2026-08-21T08:00:00.000Z",
    loadKg: 20,
    loadMode: "pair-total",
    reps: 8,
    sets: 3,
    holdSeconds: null,
    rir: 3,
    qualityPercent: 90,
    assistance: null,
    ...overrides,
  };
}

describe("capacity estimates", () => {
  it("estimates e1RM only for a useful 2–10 repetition set", () => {
    expect(estimateE1rm(20, 8)).toBe(25.5);
    expect(estimateE1rm(20, 1)).toBeNull();
    expect(estimateE1rm(20, 12)).toBeNull();
    expect(estimateWorkingLoadRange(25.5)).toEqual({ low: 18, high: 21.5 });
  });

  it("waits for two records before suggesting progression", () => {
    expect(suggestNextLoad([equipmentRecord()]).direction).toBe("insufficient");
  });

  it("suggests a small increase after two comfortable, high-quality records", () => {
    const previous = equipmentRecord({ id: "record-0", recordedAt: "2026-08-20T08:00:00.000Z" });
    const suggestion = suggestNextLoad([equipmentRecord(), previous]);
    expect(suggestion.direction).toBe("increase");
    expect(suggestion.suggestedLoadKg).toBe(21);
  });

  it("suggests reducing load when recent form broke down", () => {
    const latest = equipmentRecord({ qualityPercent: 65 });
    const previous = equipmentRecord({ id: "record-0", recordedAt: "2026-08-20T08:00:00.000Z" });
    expect(suggestNextLoad([latest, previous]).direction).toBe("decrease");
  });
});

describe("CapacityStore", () => {
  it("persists valid records and ignores malformed storage", () => {
    const storage = new MemoryStorage();
    const store = new CapacityStore(storage);
    store.add(equipmentRecord());
    expect(store.load()).toHaveLength(1);
    storage.setItem("form:capacity-records:v1", "not-json");
    expect(store.load()).toEqual([]);
  });
});
