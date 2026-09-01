import { isValidWeightKg } from "./calories";

const SETTINGS_KEY = "move-local:settings:v1";

export interface UserPreferences {
  weightKg: number | null;
  showSkeleton: boolean;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  weightKg: null,
  showSkeleton: false,
};

export class PreferencesStore {
  constructor(
    private readonly storage: Pick<Storage, "getItem" | "setItem">,
    private readonly key = SETTINGS_KEY,
  ) {}

  load(): UserPreferences {
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return { ...DEFAULT_PREFERENCES };
      const parsed = JSON.parse(raw) as Partial<UserPreferences>;
      return {
        weightKg: typeof parsed.weightKg === "number" && isValidWeightKg(parsed.weightKg)
          ? parsed.weightKg
          : null,
        showSkeleton: parsed.showSkeleton === true,
      };
    } catch {
      return { ...DEFAULT_PREFERENCES };
    }
  }

  save(preferences: UserPreferences): UserPreferences {
    const normalized: UserPreferences = {
      weightKg: preferences.weightKg !== null && isValidWeightKg(preferences.weightKg)
        ? preferences.weightKg
        : null,
      showSkeleton: preferences.showSkeleton,
    };
    try {
      this.storage.setItem(this.key, JSON.stringify(normalized));
    } catch {
      // Private browsing can make local storage unavailable.
    }
    return normalized;
  }
}
