import { describe, expect, it } from "vitest";
import { NEW_EXERCISE_IDS } from "./catalog-expansion";
import { EXERCISE_ORDER, EXERCISE_PROFILES } from "./exercises";

describe("exercise media profiles", () => {
  it("rejects mismatched catalog media and keeps the reviewed project-owned anatomy demonstration", () => {
    const profile = EXERCISE_PROFILES["jumping-jack"];

    expect(profile.catalogSourceId).toBe("3224");
    expect(profile.media).toMatchObject({
      kind: "project-generated",
      licenseStatus: "owned",
      reviewStatus: "verified",
    });
    expect(profile.catalogMediaReview?.status).toBe("rejected-content-mismatch");
    expect(profile.media.animationUrl).toBe("/assets/jumping-jack-anatomy-sequence.png");
    expect(profile.media.thumbnailUrl).toBe("/assets/jumping-jack-anatomy-sequence.png");
  });

  it("keeps the squat anatomy demonstration reviewed and project-owned", () => {
    expect(EXERCISE_PROFILES.squat.media).toMatchObject({
      kind: "project-generated",
      licenseStatus: "owned",
      reviewStatus: "verified",
    });
  });

  it("exposes 100 unique actions while only enabling reviewed analyzers", () => {
    expect(Object.keys(EXERCISE_PROFILES)).toHaveLength(100);
    expect(EXERCISE_ORDER).toHaveLength(100);
    expect(new Set(EXERCISE_ORDER).size).toBe(100);
    expect(Object.values(EXERCISE_PROFILES).filter((profile) => profile.available))
      .toHaveLength(27);
    expect(EXERCISE_PROFILES["calf-raise"].media).toMatchObject({
      kind: "catalog",
      licenseStatus: "user-authorized",
      reviewStatus: "verified",
    });
    for (const exerciseId of [
      "side-lunge", "glute-bridge", "bird-dog", "single-leg-deadlift",
    ] as const) {
      expect(EXERCISE_PROFILES[exerciseId].media).toMatchObject({
        kind: "project-generated",
        licenseStatus: "owned",
        reviewStatus: "verified",
      });
    }
    expect(EXERCISE_PROFILES["dead-bug"].media).toMatchObject({
      kind: "project-generated",
      licenseStatus: "user-authorized",
      reviewStatus: "verified",
    });
  });

  it("uses the reviewed modest corrections anywhere the source artwork exposed the pelvis", () => {
    const correctedExerciseIds = [
      "burpee",
      "curtsy-lunge",
      "dead-bug",
      "dumbbell-biceps-curl",
      "dumbbell-front-raise",
      "dumbbell-kickback",
      "dumbbell-lateral-raise",
      "dumbbell-rdl",
      "dumbbell-reverse-lunge",
      "dumbbell-split-squat",
      "goblet-squat",
      "jump-squat",
      "leg-raise",
      "mountain-climber",
      "side-plank",
      "skater-jump",
    ] as const;

    for (const exerciseId of correctedExerciseIds) {
      const media = EXERCISE_PROFILES[exerciseId].media;
      expect(media).toMatchObject({
        kind: "project-generated",
        licenseStatus: "user-authorized",
        reviewStatus: "verified",
      });
      expect(media.thumbnailUrl).toBe(`/assets/exercise-catalog/${exerciseId}-modest-v2.png`);
      expect(media.animationUrl).toBe(`/assets/exercise-catalog/${exerciseId}-modest-v2.png`);
    }
  });

  it("adds the approved 5 yoga, 10 bodyweight and 20 dumbbell profiles with complete teaching data", () => {
    const newIds = new Set(NEW_EXERCISE_IDS);
    const expanded = Object.values(EXERCISE_PROFILES).filter(
      (profile) => profile.discipline && !newIds.has(profile.exerciseId),
    );
    expect(expanded.filter((profile) => profile.discipline === "yoga")).toHaveLength(5);
    expect(expanded.filter((profile) => profile.discipline === "bodyweight")).toHaveLength(10);
    expect(expanded.filter((profile) => profile.discipline === "dumbbell")).toHaveLength(20);

    for (const profile of expanded) {
      expect(profile.primaryMuscles.length).toBeGreaterThan(0);
      expect(profile.secondaryMuscles.length).toBeGreaterThan(0);
      expect(profile.activationCue.length).toBeGreaterThan(6);
      expect(profile.breathingCue?.length).toBeGreaterThan(4);
      expect(profile.safetyNotes?.length).toBeGreaterThan(0);
      expect(profile.commonMistakes?.length).toBeGreaterThan(0);
      expect(profile.equipment).toBeTruthy();
      expect(profile.difficulty).toBeTruthy();
      expect(profile.met).toBeGreaterThan(0);
      expect(profile.media.reviewStatus).toBe("verified");
      expect(profile.media.thumbnailUrl).toMatch(/^\/assets\/exercise-catalog\//);
      expect(profile.media.animationUrl).toMatch(/^\/assets\/exercise-catalog\//);
    }
  });

  it("registers the selected 48-action expansion with complete guidance and keeps unaudited media closed", () => {
    expect(NEW_EXERCISE_IDS).toHaveLength(48);
    expect(new Set(NEW_EXERCISE_IDS).size).toBe(48);
    const profiles = NEW_EXERCISE_IDS.map((id) => EXERCISE_PROFILES[id]);

    expect(profiles.filter((profile) => profile.discipline === "bodyweight")).toHaveLength(17);
    expect(profiles.filter((profile) => profile.discipline === "dumbbell")).toHaveLength(14);
    expect(profiles.filter((profile) => profile.discipline === "yoga")).toHaveLength(10);
    expect(profiles.filter((profile) => profile.discipline === "band")).toHaveLength(7);

    expect(profiles.filter((profile) => profile.media.reviewStatus === "verified")).toHaveLength(48);
    expect(profiles.filter((profile) => profile.media.reviewStatus === "pending")).toHaveLength(0);

    for (const profile of profiles) {
      expect(profile.available).toBe(false);
      expect(profile.media.kind).toBe("project-generated");
      expect(profile.media.licenseStatus).toBe("owned");
      expect(profile.media.reviewStatus).toBe("verified");
      expect(profile.media.thumbnailUrl).toMatch(/generated-batch-0[12]\/.*-keyframes\.png$/);
      expect(profile.media.animationUrl).toMatch(/generated-batch-0[12]\/.*\.gif$/);
      expect(profile.primaryMuscles.length).toBeGreaterThan(0);
      expect(profile.secondaryMuscles.length).toBeGreaterThan(0);
      expect(profile.activationCue.length).toBeGreaterThan(6);
      expect(profile.breathingCue?.length).toBeGreaterThan(4);
      expect(profile.safetyNotes?.length).toBeGreaterThanOrEqual(2);
      expect(profile.commonMistakes?.length).toBeGreaterThanOrEqual(2);
      expect(profile.met).toBeGreaterThan(0);
      expect(profile.suggestedTraining?.beginner.length).toBeGreaterThan(0);
      expect(profile.suggestedTraining?.regular.length).toBeGreaterThan(0);
      expect(profile.realtimeSupportTier).toMatch(/^(realtime-candidate|guided-only)$/);
    }
  });
});
