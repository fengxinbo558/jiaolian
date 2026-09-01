import { describe, expect, it } from "vitest";
import { SessionStore } from "./storage";
import type { SessionSummary } from "./types";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function summary(index: number): SessionSummary {
  return {
    id: `session-${index}`,
    endedAt: new Date(2026, 7, index + 1).toISOString(),
    totalReps: index,
    qualifiedReps: Math.max(0, index - 1),
    averageTempoSeconds: 2.4,
    averageResponseMs: 108,
    p95ResponseMs: 146,
    issueCounts: { depth: 1, lean: 0, knees: 0, speed: 0 },
  };
}

describe("SessionStore", () => {
  it("keeps the complete valid training history", () => {
    const store = new SessionStore(new MemoryStorage());
    for (let index = 0; index < 15; index += 1) {
      store.save(summary(index));
    }

    const sessions = store.load();
    expect(sessions).toHaveLength(15);
    expect(sessions[0]?.id).toBe("session-14");
    expect(sessions.at(-1)?.id).toBe("session-0");
  });

  it("ignores malformed storage data", () => {
    const storage = new MemoryStorage();
    storage.setItem("test", "not-json");
    const store = new SessionStore(storage, "test");
    expect(store.load()).toEqual([]);
  });

  it("keeps the coach response measurements in saved summaries", () => {
    const store = new SessionStore(new MemoryStorage());
    store.save(summary(2));

    expect(store.load()[0]).toMatchObject({
      averageResponseMs: 108,
      p95ResponseMs: 146,
    });
  });

  it("keeps expanded exercises and timed-hold measurements", () => {
    const store = new SessionStore(new MemoryStorage());
    store.save({
      ...summary(8),
      exerciseId: "plank",
      measurementMode: "timed-hold",
      validDurationMs: 12_400,
      issueCounts: { "body-line": 2 },
    });

    expect(store.load()[0]).toMatchObject({
      exerciseId: "plank",
      measurementMode: "timed-hold",
      validDurationMs: 12_400,
      issueCounts: { "body-line": 2 },
    });
  });

  it("keeps optional active time, calories and session weight", () => {
    const store = new SessionStore(new MemoryStorage());
    store.save({
      ...summary(4),
      exerciseId: "jumping-jack",
      activeDurationMs: 92_000,
      estimatedCalories: 18.4,
      weightKgAtSession: 68,
    });

    expect(store.load()[0]).toMatchObject({
      activeDurationMs: 92_000,
      estimatedCalories: 18.4,
      weightKgAtSession: 68,
    });
  });

  it("updates a saved in-progress session instead of duplicating it", () => {
    const store = new SessionStore(new MemoryStorage());
    store.upsert({ ...summary(3), totalReps: 2 });
    store.upsert({ ...summary(3), totalReps: 7, qualifiedReps: 6 });

    expect(store.load()).toHaveLength(1);
    expect(store.load()[0]).toMatchObject({
      id: "session-3",
      totalReps: 7,
      qualifiedReps: 6,
    });
  });

  it("migrates older summaries that predate front-view knee feedback", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "test",
      JSON.stringify([
        {
          ...summary(1),
          issueCounts: { depth: 1, lean: 0, speed: 0 },
        },
      ]),
    );

    expect(new SessionStore(storage, "test").load()[0]?.issueCounts.knees).toBe(
      0,
    );
  });
});
