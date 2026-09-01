import { describe, expect, it } from "vitest";
import {
  angleAt,
  angleAt3D,
  estimateBodyView,
  frontKneeAlignmentRatio,
  isSideNearFrameEdge,
  sideMetrics,
  trunkLeanFromVertical,
  trunkLeanFromVertical3D,
} from "./geometry";
import type { PoseLandmark } from "../types";

const ASPECT_RATIO = 16 / 9;

function point(x: number, y: number): PoseLandmark {
  return { x, y, z: 0, visibility: 1 };
}

function landmarks(): PoseLandmark[] {
  return Array.from({ length: 33 }, () => point(0.5, 0.5));
}

describe("camera geometry", () => {
  it("corrects knee angles for a widescreen camera", () => {
    const knee = point(0.5, 0.5);
    const hip = point(0.5 + 0.1414 / ASPECT_RATIO, 0.5 - 0.1414);
    const ankle = point(0.5, 0.7);

    expect(angleAt(hip, knee, ankle, ASPECT_RATIO)).toBeCloseTo(135, 1);
    expect(angleAt(hip, knee, ankle)).toBeGreaterThan(150);
  });

  it("corrects trunk lean for a widescreen camera", () => {
    const hip = point(0.5, 0.7);
    const shoulder = point(0.5 + 0.2 / ASPECT_RATIO, 0.5);

    expect(trunkLeanFromVertical(shoulder, hip, ASPECT_RATIO)).toBeCloseTo(45, 5);
  });

  it("keeps 3D angles stable when a leg rotates toward the camera", () => {
    const knee = { ...point(0, 0), z: 0 };
    const hip = { ...point(0.1, -0.1414), z: 0.1 };
    const ankle = { ...point(0, 0.2), z: 0 };

    expect(angleAt3D(hip, knee, ankle)).toBeCloseTo(135, 1);
  });

  it("measures 3D trunk lean across both image axes", () => {
    const hip = { ...point(0, 0), z: 0 };
    const shoulder = { ...point(0.1, -0.2), z: 0.1 };

    expect(trunkLeanFromVertical3D(shoulder, hip)).toBeCloseTo(35.26, 1);
  });

  it("prefers world landmarks for side metrics", () => {
    const image = landmarks();
    const world = landmarks();
    image[23] = point(0.51, 0.48);
    image[25] = point(0.5, 0.6);
    image[27] = point(0.5, 0.8);
    image[11] = point(0.51, 0.3);
    world[25] = { ...point(0, 0), z: 0 };
    world[23] = { ...point(0.1, -0.1414), z: 0.1 };
    world[27] = { ...point(0, 0.2), z: 0 };
    world[11] = { ...point(0.2, -0.3414), z: 0.1 };

    expect(sideMetrics(image, "left", 1, world)?.kneeAngle).toBeCloseTo(
      135,
      1,
    );
  });

  it("classifies front, side and oblique camera views from 3D shoulder and hip lines", () => {
    const image = landmarks();
    const world = landmarks();
    const setPair = (xSpan: number, zSpan: number): void => {
      for (const [leftIndex, rightIndex] of [
        [11, 12],
        [23, 24],
      ] as const) {
        world[leftIndex] = { ...point(-xSpan / 2, 0), z: -zSpan / 2 };
        world[rightIndex] = { ...point(xSpan / 2, 0), z: zSpan / 2 };
      }
    };

    setPair(0.4, 0.02);
    expect(estimateBodyView(image, world)).toBe("front");
    setPair(0.02, 0.4);
    expect(estimateBodyView(image, world)).toBe("side");
    setPair(0.3, 0.3);
    expect(estimateBodyView(image, world)).toBe("oblique");
  });

  it("uses knee-to-ankle span to detect a front-view inward knee path", () => {
    const pose = landmarks();
    pose[25] = point(0.43, 0.6);
    pose[26] = point(0.57, 0.6);
    pose[27] = point(0.35, 0.8);
    pose[28] = point(0.65, 0.8);

    expect(frontKneeAlignmentRatio(pose)).toBeCloseTo(0.47, 1);
  });

  it("does not call a visible foot tip at the bottom a body-edge failure", () => {
    const landmarks = Array.from({ length: 33 }, () => point(0.5, 0.5));
    const ankle = landmarks[27];
    const foot = landmarks[31];
    if (ankle) ankle.visibility = 0.1;
    if (foot) foot.y = 0.99;

    expect(isSideNearFrameEdge(landmarks, "left")).toBe(false);
  });

  it("requires the unreliable core point itself to be near the edge", () => {
    const landmarks = Array.from({ length: 33 }, () => point(0.5, 0.5));
    const hip = landmarks[23];
    const ankle = landmarks[27];
    if (hip) hip.visibility = 0.1;
    if (ankle) ankle.y = 0.99;

    expect(isSideNearFrameEdge(landmarks, "left")).toBe(false);

    if (hip) hip.x = 0.01;
    expect(isSideNearFrameEdge(landmarks, "left")).toBe(true);
  });
});
