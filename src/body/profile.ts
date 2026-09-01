import type { ActivityLevel, FormulaSex } from "./metrics";

const PROFILE_KEY = "form:body-profile:v1";
const SNAPSHOTS_KEY = "form:body-snapshots:v1";
const SNAPSHOT_LIMIT = 52;

type BodyStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface BodyProfile {
  schemaVersion: 1;
  age: number | null;
  formulaSex: FormulaSex | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: ActivityLevel | null;
  chestCm: number | null;
  waistCm: number | null;
  neckCm: number | null;
  hipCm: number | null;
  updatedAt: string | null;
}

export interface BodySnapshot extends Omit<BodyProfile, "updatedAt"> {
  recordedAt: string;
}

export const EMPTY_BODY_PROFILE: BodyProfile = {
  schemaVersion: 1,
  age: null,
  formulaSex: null,
  heightCm: null,
  weightKg: null,
  activityLevel: null,
  chestCm: null,
  waistCm: null,
  neckCm: null,
  hipCm: null,
  updatedAt: null,
};

const ACTIVITY_LEVELS: ActivityLevel[] = ["sedentary", "light", "moderate", "very", "extra"];

function numberOrNull(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

function normalizeProfile(value: unknown): BodyProfile {
  if (!value || typeof value !== "object") return { ...EMPTY_BODY_PROFILE };
  const input = value as Partial<BodyProfile>;
  return {
    schemaVersion: 1,
    age: numberOrNull(input.age, 18, 60),
    formulaSex: input.formulaSex === "male" || input.formulaSex === "female" ? input.formulaSex : null,
    heightCm: numberOrNull(input.heightCm, 120, 230),
    weightKg: numberOrNull(input.weightKg, 30, 250),
    activityLevel: ACTIVITY_LEVELS.includes(input.activityLevel as ActivityLevel)
      ? input.activityLevel as ActivityLevel
      : null,
    chestCm: numberOrNull(input.chestCm, 50, 200),
    waistCm: numberOrNull(input.waistCm, 40, 200),
    neckCm: numberOrNull(input.neckCm, 20, 80),
    hipCm: numberOrNull(input.hipCm, 50, 200),
    updatedAt: typeof input.updatedAt === "string" && !Number.isNaN(Date.parse(input.updatedAt))
      ? input.updatedAt
      : null,
  };
}

function toSnapshot(profile: BodyProfile, recordedAt: string): BodySnapshot {
  return {
    schemaVersion: 1,
    age: profile.age,
    formulaSex: profile.formulaSex,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    activityLevel: profile.activityLevel,
    chestCm: profile.chestCm,
    waistCm: profile.waistCm,
    neckCm: profile.neckCm,
    hipCm: profile.hipCm,
    recordedAt,
  };
}

function normalizeSnapshot(value: unknown): BodySnapshot | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<BodySnapshot>;
  if (typeof input.recordedAt !== "string" || Number.isNaN(Date.parse(input.recordedAt))) return null;
  return toSnapshot(normalizeProfile({ ...input, updatedAt: input.recordedAt }), input.recordedAt);
}

function localDateKey(isoDate: string): string {
  const date = new Date(isoDate);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export class BodyProfileStore {
  constructor(
    private readonly storage: BodyStorage,
    private readonly profileKey = PROFILE_KEY,
    private readonly snapshotsKey = SNAPSHOTS_KEY,
    private readonly now: () => Date = () => new Date(),
  ) {}

  load(legacyWeightKg: number | null = null): BodyProfile {
    try {
      const raw = this.storage.getItem(this.profileKey);
      if (raw) return normalizeProfile(JSON.parse(raw));
    } catch {
      // Fall through to a safe empty profile.
    }
    const migratedWeight = numberOrNull(legacyWeightKg, 30, 250);
    return { ...EMPTY_BODY_PROFILE, weightKg: migratedWeight };
  }

  save(profile: BodyProfile): BodyProfile {
    const timestamp = this.now().toISOString();
    const normalized = { ...normalizeProfile(profile), updatedAt: timestamp };
    try {
      this.storage.setItem(this.profileKey, JSON.stringify(normalized));
      this.saveSnapshot(toSnapshot(normalized, timestamp));
    } catch {
      // Private browsing can make local storage unavailable.
    }
    return normalized;
  }

  loadSnapshots(): BodySnapshot[] {
    try {
      const raw = this.storage.getItem(this.snapshotsKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map(normalizeSnapshot)
        .filter((item): item is BodySnapshot => item !== null)
        .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))
        .slice(0, SNAPSHOT_LIMIT);
    } catch {
      return [];
    }
  }

  updateSnapshot(recordedAt: string, patch: Partial<Omit<BodySnapshot, "recordedAt" | "schemaVersion">>): BodyProfile {
    const snapshots = this.loadSnapshots();
    const index = snapshots.findIndex((item) => item.recordedAt === recordedAt);
    if (index < 0) return this.load();
    const updated = normalizeSnapshot({ ...snapshots[index], ...patch, recordedAt });
    if (!updated) return this.load();
    const wasLatest = index === 0;
    snapshots[index] = updated;
    this.writeSnapshots(snapshots);
    if (!wasLatest) return this.load();
    const profile = { ...normalizeProfile(updated), updatedAt: this.now().toISOString() };
    this.storage.setItem(this.profileKey, JSON.stringify(profile));
    return profile;
  }

  deleteSnapshot(recordedAt: string): BodyProfile {
    const snapshots = this.loadSnapshots();
    const index = snapshots.findIndex((item) => item.recordedAt === recordedAt);
    if (index < 0) return this.load();
    const wasLatest = index === 0;
    snapshots.splice(index, 1);
    this.writeSnapshots(snapshots);
    if (!wasLatest) return this.load();
    const latest = snapshots[0];
    if (!latest) {
      this.storage.removeItem(this.profileKey);
      return { ...EMPTY_BODY_PROFILE };
    }
    const profile = { ...normalizeProfile(latest), updatedAt: latest.recordedAt };
    this.storage.setItem(this.profileKey, JSON.stringify(profile));
    return profile;
  }

  private writeSnapshots(snapshots: BodySnapshot[]): void {
    this.storage.setItem(
      this.snapshotsKey,
      JSON.stringify(
        snapshots
          .map(normalizeSnapshot)
          .filter((item): item is BodySnapshot => item !== null)
          .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))
          .slice(0, SNAPSHOT_LIMIT),
      ),
    );
  }

  private saveSnapshot(snapshot: BodySnapshot): void {
    const snapshots = this.loadSnapshots();
    const sameDayIndex = snapshots.findIndex((item) => localDateKey(item.recordedAt) === localDateKey(snapshot.recordedAt));
    if (sameDayIndex >= 0) snapshots.splice(sameDayIndex, 1);
    snapshots.unshift(snapshot);
    this.writeSnapshots(snapshots);
  }
}
