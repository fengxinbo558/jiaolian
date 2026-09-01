import type { PoseLandmark } from "../types";

export class LandmarkSmoother {
  private previous: PoseLandmark[] | null = null;

  constructor(private readonly alpha = 0.62) {}

  reset(): void {
    this.previous = null;
  }

  update(landmarks: PoseLandmark[]): PoseLandmark[] {
    if (!this.previous || this.previous.length !== landmarks.length) {
      this.previous = landmarks.map((landmark) => ({ ...landmark }));
      return this.previous.map((landmark) => ({ ...landmark }));
    }

    this.previous = landmarks.map((landmark, index) => {
      const old = this.previous?.[index] ?? landmark;
      return {
        x: old.x + this.alpha * (landmark.x - old.x),
        y: old.y + this.alpha * (landmark.y - old.y),
        z: old.z + this.alpha * (landmark.z - old.z),
        visibility: landmark.visibility,
      };
    });

    return this.previous.map((landmark) => ({ ...landmark }));
  }
}
