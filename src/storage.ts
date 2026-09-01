import type { ExerciseId, IssueKey, SessionSummary } from "./types";
import { ALL_EXERCISE_IDS } from "./exercise-ids";

const STORAGE_KEY = "squat-lab:sessions:v1";

function isIssueCounts(value: unknown): value is Record<IssueKey, number> {
  if (!value || typeof value !== "object") {
    return false;
  }
  const counts = value as Record<string, unknown>;
  const knownIssues: IssueKey[] = [
    "depth", "lean", "knees", "speed", "arms", "feet", "sync", "symmetry",
    "range", "alignment", "stability", "body-line", "rhythm",
  ];
  return knownIssues.some((key) => typeof counts[key] === "number") &&
    knownIssues.every(
      (key) => counts[key] === undefined || typeof counts[key] === "number",
    );
}

const KNOWN_EXERCISES: readonly ExerciseId[] = ALL_EXERCISE_IDS;

function isSessionSummary(value: unknown): value is SessionSummary {
  if (!value || typeof value !== "object") {
    return false;
  }
  const session = value as Record<string, unknown>;
  return (
    typeof session.id === "string" &&
    typeof session.endedAt === "string" &&
    typeof session.totalReps === "number" &&
    typeof session.qualifiedReps === "number" &&
    (session.exerciseId === undefined ||
      KNOWN_EXERCISES.includes(session.exerciseId as ExerciseId)) &&
    (session.averageTempoSeconds === null ||
      typeof session.averageTempoSeconds === "number") &&
    (session.averageResponseMs === undefined ||
      session.averageResponseMs === null ||
      typeof session.averageResponseMs === "number") &&
    (session.p95ResponseMs === undefined ||
      session.p95ResponseMs === null ||
      typeof session.p95ResponseMs === "number") &&
    (session.measurementMode === undefined ||
      session.measurementMode === "repetitions" ||
      session.measurementMode === "timed-hold") &&
    (session.validDurationMs === undefined ||
      session.validDurationMs === null ||
      typeof session.validDurationMs === "number") &&
    (session.activeDurationMs === undefined ||
      session.activeDurationMs === null ||
      typeof session.activeDurationMs === "number") &&
    (session.estimatedCalories === undefined ||
      session.estimatedCalories === null ||
      typeof session.estimatedCalories === "number") &&
    (session.weightKgAtSession === undefined ||
      session.weightKgAtSession === null ||
      typeof session.weightKgAtSession === "number") &&
    (session.planId === undefined || typeof session.planId === "string") &&
    (session.planName === undefined || typeof session.planName === "string") &&
    (session.planCompletedSets === undefined || typeof session.planCompletedSets === "number") &&
    (session.planTotalSets === undefined || typeof session.planTotalSets === "number") &&
    (session.planCompleted === undefined || typeof session.planCompleted === "boolean") &&
    (session.averageRestSeconds === undefined ||
      session.averageRestSeconds === null ||
      typeof session.averageRestSeconds === "number") &&
    (session.restPaceCounts === undefined ||
      (typeof session.restPaceCounts === "object" &&
        session.restPaceCounts !== null &&
        typeof (session.restPaceCounts as Record<string, unknown>).fast === "number" &&
        typeof (session.restPaceCounts as Record<string, unknown>).standard === "number" &&
        typeof (session.restPaceCounts as Record<string, unknown>).extended === "number")) &&
    isIssueCounts(session.issueCounts)
  );
}

export class SessionStore {
  constructor(
    private readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
    private readonly key = STORAGE_KEY,
  ) {}

  load(): SessionSummary[] {
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) {
        return [];
      }
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter(isSessionSummary).map((session) => ({
          ...session,
            exerciseId: session.exerciseId ?? "squat",
            issueCounts: {
              ...session.issueCounts,
              ...(session.exerciseId === "jumping-jack"
                ? { arms: session.issueCounts.arms ?? 0, feet: session.issueCounts.feet ?? 0, sync: session.issueCounts.sync ?? 0, symmetry: session.issueCounts.symmetry ?? 0 }
                : { knees: session.issueCounts.knees ?? 0 }),
            },
          }))
        : [];
    } catch {
      return [];
    }
  }

  save(summary: SessionSummary): SessionSummary[] {
    const sessions = [summary, ...this.load()];
    try {
      this.storage.setItem(this.key, JSON.stringify(sessions));
    } catch {
      return this.load();
    }
    return sessions;
  }

  upsert(summary: SessionSummary): SessionSummary[] {
    const sessions = [summary, ...this.load().filter((item) => item.id !== summary.id)]
      .sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt));
    try {
      this.storage.setItem(this.key, JSON.stringify(sessions));
    } catch {
      return this.load();
    }
    return sessions;
  }

  clear(): void {
    try {
      this.storage.removeItem(this.key);
    } catch {
      // Storage may be unavailable in a strict private-browsing context.
    }
  }

  remove(id: string): SessionSummary[] {
    const sessions = this.load().filter((session) => session.id !== id);
    try {
      this.storage.setItem(this.key, JSON.stringify(sessions));
    } catch {
      return this.load();
    }
    return sessions;
  }
}
