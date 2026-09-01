import { describe, expect, it } from "vitest";
import { BodyProfileStore, EMPTY_BODY_PROFILE, type BodyProfile } from "./profile";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

const profile: BodyProfile = {
  ...EMPTY_BODY_PROFILE,
  age: 32,
  formulaSex: "female",
  heightCm: 165,
  weightKg: 60,
  activityLevel: "light",
  chestCm: 88,
  waistCm: 72,
  neckCm: 31,
  hipCm: 94,
};

describe("BodyProfileStore", () => {
  it("uses a valid legacy weight only when no body profile exists", () => {
    const storage = new MemoryStorage();
    const store = new BodyProfileStore(storage);
    expect(store.load(68).weightKg).toBe(68);
    store.save(profile);
    expect(store.load(80).weightKg).toBe(60);
  });

  it("normalizes invalid persisted fields instead of trusting them", () => {
    const storage = new MemoryStorage();
    storage.setItem("form:body-profile:v1", JSON.stringify({
      age: 7,
      formulaSex: "unknown",
      heightCm: 900,
      weightKg: 60,
      activityLevel: "light",
    }));
    const loaded = new BodyProfileStore(storage).load();
    expect(loaded.age).toBeNull();
    expect(loaded.formulaSex).toBeNull();
    expect(loaded.heightCm).toBeNull();
    expect(loaded.weightKg).toBe(60);
  });

  it("replaces the same day's snapshot and keeps newer values", () => {
    const storage = new MemoryStorage();
    let date = new Date("2026-08-21T08:00:00.000Z");
    const store = new BodyProfileStore(storage, undefined, undefined, () => date);
    store.save(profile);
    date = new Date("2026-08-21T12:00:00.000Z");
    store.save({ ...profile, weightKg: 59.5 });
    expect(store.loadSnapshots()).toHaveLength(1);
    expect(store.loadSnapshots()[0]?.weightKg).toBe(59.5);
  });

  it("keeps snapshots from different days in newest-first order", () => {
    const storage = new MemoryStorage();
    let date = new Date("2026-08-20T08:00:00.000Z");
    const store = new BodyProfileStore(storage, undefined, undefined, () => date);
    store.save(profile);
    date = new Date("2026-08-21T08:00:00.000Z");
    store.save({ ...profile, weightKg: 59.8 });
    const snapshots = store.loadSnapshots();
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]?.weightKg).toBe(59.8);
  });

  it("updates a historical snapshot without replacing its date", () => {
    const storage = new MemoryStorage();
    let date = new Date("2026-08-20T08:00:00.000Z");
    const store = new BodyProfileStore(storage, undefined, undefined, () => date);
    store.save(profile);
    date = new Date("2026-08-21T08:00:00.000Z");
    store.save({ ...profile, weightKg: 59.8 });
    const older = store.loadSnapshots()[1]!;
    store.updateSnapshot(older.recordedAt, { weightKg: 61.2, waistCm: 71 });
    const updated = store.loadSnapshots()[1]!;
    expect(updated.recordedAt).toBe(older.recordedAt);
    expect(updated.weightKg).toBe(61.2);
    expect(updated.waistCm).toBe(71);
    expect(store.load().weightKg).toBe(59.8);
  });

  it("syncs the current profile when the latest snapshot is corrected", () => {
    const storage = new MemoryStorage();
    const store = new BodyProfileStore(storage, undefined, undefined, () => new Date("2026-08-21T08:00:00.000Z"));
    store.save(profile);
    const latest = store.loadSnapshots()[0]!;
    store.updateSnapshot(latest.recordedAt, { weightKg: 58.6, waistCm: 70 });
    expect(store.load().weightKg).toBe(58.6);
    expect(store.load().waistCm).toBe(70);
  });

  it("deletes a snapshot and falls back to the previous record when the latest is removed", () => {
    const storage = new MemoryStorage();
    let date = new Date("2026-08-20T08:00:00.000Z");
    const store = new BodyProfileStore(storage, undefined, undefined, () => date);
    store.save(profile);
    date = new Date("2026-08-21T08:00:00.000Z");
    store.save({ ...profile, weightKg: 59.8 });
    const latest = store.loadSnapshots()[0]!;
    store.deleteSnapshot(latest.recordedAt);
    expect(store.loadSnapshots()).toHaveLength(1);
    expect(store.load().weightKg).toBe(60);
  });
});
