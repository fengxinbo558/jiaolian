import { describe, expect, it } from "vitest";
import { LEGACY_STORAGE_KEYS } from "./account-storage";

describe("account storage migration contract", () => {
  it("covers every existing persistent product key", () => {
    expect(LEGACY_STORAGE_KEYS).toEqual(expect.arrayContaining([
      "squat-lab:sessions:v1",
      "form:body-profile:v1",
      "form:body-snapshots:v1",
      "form:capacity-records:v1",
      "form:custom-workout-plans:v1",
    ]));
  });
});

