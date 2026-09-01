import type { ExerciseId } from "./types";

const CAPACITY_KEY = "form:capacity-records:v1";
const RECORD_LIMIT = 120;

type CapacityStorage = Pick<Storage, "getItem" | "setItem">;

export type CapacityMode = "equipment" | "bodyweight-reps" | "timed-hold";
export type LoadMode = "single" | "pair-total" | "machine-total";
export type PerformanceType = "working" | "max-test";

export interface CapacityRecord {
  schemaVersion: 1;
  id: string;
  exerciseId: ExerciseId;
  mode: CapacityMode;
  performanceType: PerformanceType;
  recordedAt: string;
  loadKg: number | null;
  loadMode: LoadMode | null;
  reps: number | null;
  sets: number | null;
  holdSeconds: number | null;
  rir: number | null;
  qualityPercent: number | null;
  assistance: string | null;
}

export interface LoadSuggestion {
  direction: "increase" | "maintain" | "decrease" | "insufficient";
  suggestedLoadKg: number | null;
  message: string;
}

function numberOrNull(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

export function estimateE1rm(loadKg: number | null, reps: number | null): number | null {
  if (loadKg === null || reps === null
    || !Number.isFinite(loadKg) || loadKg <= 0
    || !Number.isInteger(reps) || reps < 2 || reps > 10) return null;
  return roundToHalf(loadKg * (1 + reps / 30));
}

export function estimateWorkingLoadRange(e1rmKg: number | null): { low: number; high: number } | null {
  if (e1rmKg === null || !Number.isFinite(e1rmKg) || e1rmKg <= 0) return null;
  return { low: roundToHalf(e1rmKg * 0.7), high: roundToHalf(e1rmKg * 0.85) };
}

export function suggestNextLoad(records: CapacityRecord[]): LoadSuggestion {
  const equipmentRecords = records
    .filter((record) => record.mode === "equipment" && record.loadKg !== null)
    .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt));
  const latest = equipmentRecords[0];
  const previous = equipmentRecords[1];
  if (!latest || !previous || latest.loadKg === null) {
    return {
      direction: "insufficient",
      suggestedLoadKg: latest?.loadKg ?? null,
      message: "再记录 1 次同动作表现后，才给负重调整建议。",
    };
  }

  const bothComfortable = [latest, previous].every((record) =>
    record.rir !== null && record.rir >= 3
    && record.qualityPercent !== null && record.qualityPercent >= 85
  );
  const anyStrained = [latest, previous].some((record) =>
    record.rir === 0
    || (record.qualityPercent !== null && record.qualityPercent < 75)
  );

  if (bothComfortable) {
    return {
      direction: "increase",
      suggestedLoadKg: roundToHalf(latest.loadKg * 1.05),
      message: "最近两次都保留至少 3 次余力且动作质量良好，可尝试增加约 5%。",
    };
  }
  if (anyStrained) {
    return {
      direction: "decrease",
      suggestedLoadKg: roundToHalf(latest.loadKg * 0.925),
      message: "近期出现力竭或动作质量下降，建议先降低约 5–10%。",
    };
  }
  return {
    direction: "maintain",
    suggestedLoadKg: latest.loadKg,
    message: "当前负重与动作质量较平衡，下一次先保持。",
  };
}

function normalizeRecord(value: unknown): CapacityRecord | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<CapacityRecord>;
  if (typeof input.id !== "string"
    || typeof input.exerciseId !== "string"
    || typeof input.recordedAt !== "string"
    || Number.isNaN(Date.parse(input.recordedAt))) return null;
  const mode = input.mode === "equipment" || input.mode === "bodyweight-reps" || input.mode === "timed-hold"
    ? input.mode
    : null;
  if (!mode) return null;
  const loadMode = input.loadMode === "single" || input.loadMode === "pair-total" || input.loadMode === "machine-total"
    ? input.loadMode
    : null;
  return {
    schemaVersion: 1,
    id: input.id,
    exerciseId: input.exerciseId as ExerciseId,
    mode,
    performanceType: input.performanceType === "max-test" ? "max-test" : "working",
    recordedAt: input.recordedAt,
    loadKg: numberOrNull(input.loadKg, 0.5, 500),
    loadMode,
    reps: numberOrNull(input.reps, 1, 500),
    sets: numberOrNull(input.sets, 1, 30),
    holdSeconds: numberOrNull(input.holdSeconds, 1, 3600),
    rir: numberOrNull(input.rir, 0, 5),
    qualityPercent: numberOrNull(input.qualityPercent, 0, 100),
    assistance: typeof input.assistance === "string" && input.assistance.trim()
      ? input.assistance.trim().slice(0, 80)
      : null,
  };
}

export class CapacityStore {
  constructor(
    private readonly storage: CapacityStorage,
    private readonly key = CAPACITY_KEY,
  ) {}

  load(): CapacityRecord[] {
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map(normalizeRecord)
        .filter((item): item is CapacityRecord => item !== null)
        .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))
        .slice(0, RECORD_LIMIT);
    } catch {
      return [];
    }
  }

  add(record: CapacityRecord): CapacityRecord[] {
    const normalized = normalizeRecord(record);
    if (!normalized) return this.load();
    const records = [normalized, ...this.load().filter((item) => item.id !== normalized.id)]
      .slice(0, RECORD_LIMIT);
    try {
      this.storage.setItem(this.key, JSON.stringify(records));
    } catch {
      // Private browsing can make local storage unavailable.
    }
    return records;
  }

  remove(id: string): CapacityRecord[] {
    const records = this.load().filter((record) => record.id !== id);
    try {
      this.storage.setItem(this.key, JSON.stringify(records));
    } catch {
      return this.load();
    }
    return records;
  }

  clear(): void {
    try {
      this.storage.setItem(this.key, "[]");
    } catch {
      // Storage can be unavailable in private browsing.
    }
  }
}
