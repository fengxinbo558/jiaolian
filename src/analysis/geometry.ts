import type { BodySide, PoseLandmark } from "../types";

export const LANDMARK_INDEX = {
  left: {
    shoulder: 11,
    hip: 23,
    knee: 25,
    ankle: 27,
    heel: 29,
    foot: 31,
  },
  right: {
    shoulder: 12,
    hip: 24,
    knee: 26,
    ankle: 28,
    heel: 30,
    foot: 32,
  },
} as const;

const CORE_LANDMARK_KEYS = ["shoulder", "hip", "knee", "ankle"] as const;

function getLandmark(
  landmarks: PoseLandmark[],
  index: number,
): PoseLandmark | null {
  return landmarks[index] ?? null;
}

export function angleAt(
  first: PoseLandmark,
  middle: PoseLandmark,
  last: PoseLandmark,
  aspectRatio = 1,
): number {
  const vectorA = {
    x: (first.x - middle.x) * aspectRatio,
    y: first.y - middle.y,
  };
  const vectorB = {
    x: (last.x - middle.x) * aspectRatio,
    y: last.y - middle.y,
  };
  const dot = vectorA.x * vectorB.x + vectorA.y * vectorB.y;
  const lengthA = Math.hypot(vectorA.x, vectorA.y);
  const lengthB = Math.hypot(vectorB.x, vectorB.y);

  if (lengthA === 0 || lengthB === 0) {
    return 0;
  }

  const cosine = Math.min(1, Math.max(-1, dot / (lengthA * lengthB)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

export function angleAt3D(
  first: PoseLandmark,
  middle: PoseLandmark,
  last: PoseLandmark,
): number {
  const vectorA = {
    x: first.x - middle.x,
    y: first.y - middle.y,
    z: first.z - middle.z,
  };
  const vectorB = {
    x: last.x - middle.x,
    y: last.y - middle.y,
    z: last.z - middle.z,
  };
  const dot =
    vectorA.x * vectorB.x +
    vectorA.y * vectorB.y +
    vectorA.z * vectorB.z;
  const lengthA = Math.hypot(vectorA.x, vectorA.y, vectorA.z);
  const lengthB = Math.hypot(vectorB.x, vectorB.y, vectorB.z);

  if (lengthA === 0 || lengthB === 0) {
    return 0;
  }

  const cosine = Math.min(1, Math.max(-1, dot / (lengthA * lengthB)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

export function trunkLeanFromVertical(
  shoulder: PoseLandmark,
  hip: PoseLandmark,
  aspectRatio = 1,
): number {
  const horizontal = Math.abs(shoulder.x - hip.x) * aspectRatio;
  const vertical = Math.abs(shoulder.y - hip.y);
  return (Math.atan2(horizontal, Math.max(vertical, 0.0001)) * 180) / Math.PI;
}

export function trunkLeanFromVertical3D(
  shoulder: PoseLandmark,
  hip: PoseLandmark,
): number {
  const horizontal = Math.hypot(shoulder.x - hip.x, shoulder.z - hip.z);
  const vertical = Math.abs(shoulder.y - hip.y);
  return (Math.atan2(horizontal, Math.max(vertical, 0.0001)) * 180) / Math.PI;
}

function hasFiniteCoordinates(point: PoseLandmark | null): point is PoseLandmark {
  return (
    point !== null &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Number.isFinite(point.z)
  );
}

function hasUsefulWorldScale(points: PoseLandmark[]): boolean {
  let maximumDistance = 0;
  for (let firstIndex = 0; firstIndex < points.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < points.length; secondIndex += 1) {
      const first = points[firstIndex];
      const second = points[secondIndex];
      if (!first || !second) continue;
      maximumDistance = Math.max(
        maximumDistance,
        Math.hypot(
          first.x - second.x,
          first.y - second.y,
          first.z - second.z,
        ),
      );
    }
  }
  return maximumDistance > 0.03;
}

export function estimateBodyView(
  landmarks: PoseLandmark[],
  worldLandmarks: PoseLandmark[],
  minVisibility = 0.45,
  aspectRatio = 1,
): "front" | "side" | "oblique" | "unknown" {
  if (landmarks.length < 33) {
    return "unknown";
  }

  const fallbackFromImage = (): "front" | "side" | "oblique" | "unknown" => {
    const coreVisibility = 0.45;
    const leftVisibility = sideVisibility(landmarks, "left");
    const rightVisibility = sideVisibility(landmarks, "right");
    if (
      (leftVisibility >= coreVisibility) !==
      (rightVisibility >= coreVisibility)
    ) {
      return "side";
    }

    const leftShoulder = getLandmark(landmarks, LANDMARK_INDEX.left.shoulder);
    const rightShoulder = getLandmark(landmarks, LANDMARK_INDEX.right.shoulder);
    const leftHip = getLandmark(landmarks, LANDMARK_INDEX.left.hip);
    const rightHip = getLandmark(landmarks, LANDMARK_INDEX.right.hip);
    if (
      !leftShoulder ||
      !rightShoulder ||
      !leftHip ||
      !rightHip ||
      [leftShoulder, rightShoulder, leftHip, rightHip].some(
        (point) => point.visibility < coreVisibility,
      )
    ) {
      return "unknown";
    }

    const horizontalSpan =
      (Math.abs(leftShoulder.x - rightShoulder.x) +
        Math.abs(leftHip.x - rightHip.x)) /
      2 * aspectRatio;
    const torsoLength =
      (Math.hypot(
        (leftShoulder.x - leftHip.x) * aspectRatio,
        leftShoulder.y - leftHip.y,
      ) +
        Math.hypot(
          (rightShoulder.x - rightHip.x) * aspectRatio,
          rightShoulder.y - rightHip.y,
        )) /
      2;
    if (torsoLength < 0.03) {
      return "unknown";
    }
    const spanRatio = horizontalSpan / torsoLength;
    if (spanRatio >= 0.62) return "front";
    if (spanRatio <= 0.28) return "side";
    return "oblique";
  };

  if (worldLandmarks.length < 33) {
    return fallbackFromImage();
  }

  const pairs = [
    [LANDMARK_INDEX.left.shoulder, LANDMARK_INDEX.right.shoulder],
    [LANDMARK_INDEX.left.hip, LANDMARK_INDEX.right.hip],
  ] as const;
  const depthShares: number[] = [];

  for (const [leftIndex, rightIndex] of pairs) {
    const leftImage = getLandmark(landmarks, leftIndex);
    const rightImage = getLandmark(landmarks, rightIndex);
    const leftWorld = getLandmark(worldLandmarks, leftIndex);
    const rightWorld = getLandmark(worldLandmarks, rightIndex);
    if (
      !leftImage ||
      !rightImage ||
      leftImage.visibility < minVisibility ||
      rightImage.visibility < minVisibility ||
      !hasFiniteCoordinates(leftWorld) ||
      !hasFiniteCoordinates(rightWorld)
    ) {
      return fallbackFromImage();
    }

    const deltaX = Math.abs(leftWorld.x - rightWorld.x);
    const deltaZ = Math.abs(leftWorld.z - rightWorld.z);
    const horizontalSpan = Math.hypot(deltaX, deltaZ);
    if (horizontalSpan < 0.0001) {
      return fallbackFromImage();
    }
    depthShares.push(deltaZ / horizontalSpan);
  }

  const depthShare =
    depthShares.reduce((sum, value) => sum + value, 0) / depthShares.length;
  if (depthShare <= 0.32) {
    return "front";
  }
  if (depthShare >= 0.72) {
    return "side";
  }
  return "oblique";
}

export function frontKneeAlignmentRatio(
  landmarks: PoseLandmark[],
  minVisibility = 0.45,
): number | null {
  const leftKnee = getLandmark(landmarks, LANDMARK_INDEX.left.knee);
  const rightKnee = getLandmark(landmarks, LANDMARK_INDEX.right.knee);
  const leftAnkle = getLandmark(landmarks, LANDMARK_INDEX.left.ankle);
  const rightAnkle = getLandmark(landmarks, LANDMARK_INDEX.right.ankle);
  const points = [leftKnee, rightKnee, leftAnkle, rightAnkle];
  if (
    points.some(
      (point) => point === null || point.visibility < minVisibility,
    )
  ) {
    return null;
  }

  const kneeSpan = Math.abs((leftKnee?.x ?? 0) - (rightKnee?.x ?? 0));
  const ankleSpan = Math.abs((leftAnkle?.x ?? 0) - (rightAnkle?.x ?? 0));
  if (ankleSpan < 0.02) {
    return null;
  }
  return kneeSpan / ankleSpan;
}

export function sideVisibility(
  landmarks: PoseLandmark[],
  side: BodySide,
): number {
  const indices = CORE_LANDMARK_KEYS.map(
    (key) => LANDMARK_INDEX[side][key],
  );
  const scores = indices.map(
    (index) => getLandmark(landmarks, index)?.visibility ?? 0,
  );
  return Math.min(...scores);
}

export function isSideNearFrameEdge(
  landmarks: PoseLandmark[],
  side: BodySide,
  margin = 0.035,
  minVisibility = 0.45,
): boolean {
  return CORE_LANDMARK_KEYS
    .map((key) => LANDMARK_INDEX[side][key])
    .map((index) => getLandmark(landmarks, index))
    .some(
    (point) =>
      point !== null &&
      point.visibility < minVisibility &&
      (point.x <= margin ||
        point.x >= 1 - margin ||
        point.y <= margin ||
        point.y >= 1 - margin),
  );
}

export function bestVisibleSide(landmarks: PoseLandmark[]): BodySide {
  return sideVisibility(landmarks, "left") >= sideVisibility(landmarks, "right")
    ? "left"
    : "right";
}

export function sideMetrics(
  landmarks: PoseLandmark[],
  side: BodySide,
  aspectRatio = 1,
  worldLandmarks: PoseLandmark[] = [],
): {
  kneeAngle: number;
  trunkLean: number;
  hipToKneeDepth: number;
  visibility: number;
  source: "world" | "image";
} | null {
  const indices = LANDMARK_INDEX[side];
  const shoulder = getLandmark(landmarks, indices.shoulder);
  const hip = getLandmark(landmarks, indices.hip);
  const knee = getLandmark(landmarks, indices.knee);
  const ankle = getLandmark(landmarks, indices.ankle);

  if (!shoulder || !hip || !knee || !ankle) {
    return null;
  }

  const worldShoulder = getLandmark(worldLandmarks, indices.shoulder);
  const worldHip = getLandmark(worldLandmarks, indices.hip);
  const worldKnee = getLandmark(worldLandmarks, indices.knee);
  const worldAnkle = getLandmark(worldLandmarks, indices.ankle);
  const hasWorldMetrics =
    hasFiniteCoordinates(worldShoulder) &&
    hasFiniteCoordinates(worldHip) &&
    hasFiniteCoordinates(worldKnee) &&
    hasFiniteCoordinates(worldAnkle) &&
    hasUsefulWorldScale([worldShoulder, worldHip, worldKnee, worldAnkle]);

  return {
    kneeAngle: hasWorldMetrics
      ? angleAt3D(worldHip, worldKnee, worldAnkle)
      : angleAt(hip, knee, ankle, aspectRatio),
    trunkLean: hasWorldMetrics
      ? trunkLeanFromVertical3D(worldShoulder, worldHip)
      : trunkLeanFromVertical(shoulder, hip, aspectRatio),
    hipToKneeDepth: hip.y - knee.y,
    visibility: sideVisibility(landmarks, side),
    source: hasWorldMetrics ? "world" : "image",
  };
}
