/// <reference lib="webworker" />

import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type {
  DetectedPose,
  PoseLandmark,
  PoseWorkerRequest,
  PoseWorkerResponse,
} from "./types";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
let poseLandmarker: PoseLandmarker | null = null;
let lastFrameTimestamp = -Infinity;

function send(message: PoseWorkerResponse): void {
  workerScope.postMessage(message);
}

function normalizeLandmark(landmark: {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}): PoseLandmark {
  return {
    x: landmark.x,
    y: landmark.y,
    z: landmark.z,
    visibility: landmark.visibility ?? 0,
  };
}

async function createLandmarker(
  delegate: "CPU",
): Promise<PoseLandmarker> {
  if (typeof OffscreenCanvas === "undefined") {
    throw new Error("当前浏览器不支持后台画面处理");
  }
  if (!(await FilesetResolver.isSimdSupported(false))) {
    throw new Error("当前浏览器不支持动作识别所需的 WebAssembly SIMD");
  }
  const vision = await FilesetResolver.forVisionTasks(WASM_URL, true);
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate,
    },
    canvas: new OffscreenCanvas(1, 1),
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.55,
    minPosePresenceConfidence: 0.55,
    minTrackingConfidence: 0.55,
    outputSegmentationMasks: false,
  });
}

async function initialize(): Promise<void> {
  send({ type: "status", message: "正在下载动作模型" });
  try {
    poseLandmarker = await createLandmarker("CPU");
    send({ type: "ready", backend: "CPU" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "动作模型初始化失败";
    send({ type: "error", message });
  }
}

workerScope.onmessage = (event: MessageEvent<PoseWorkerRequest>) => {
  const message = event.data;

  if (message.type === "dispose") {
    poseLandmarker?.close();
    poseLandmarker = null;
    workerScope.close();
    return;
  }

  if (message.type !== "frame") {
    return;
  }

  if (!poseLandmarker) {
    message.bitmap.close();
    return;
  }

  const startedAt = performance.now();
  try {
    const safeTimestamp = Math.max(message.timestamp, lastFrameTimestamp + 0.001);
    lastFrameTimestamp = safeTimestamp;
    const aspectRatio = message.bitmap.width / Math.max(1, message.bitmap.height);
    const result = poseLandmarker.detectForVideo(message.bitmap, safeTimestamp);
    try {
      const poses: DetectedPose[] = result.landmarks.map((landmarks, index) => ({
        landmarks: landmarks.map(normalizeLandmark),
        worldLandmarks: (result.worldLandmarks[index] ?? []).map(normalizeLandmark),
        aspectRatio,
      }));
      send({
        type: "result",
        timestamp: safeTimestamp,
        inferenceMs: performance.now() - startedAt,
        poses,
      });
    } finally {
      result.close();
    }
  } catch (error) {
    send({
      type: "error",
      message: error instanceof Error ? error.message : "当前画面识别失败",
    });
  } finally {
    message.bitmap.close();
  }
};

void initialize();

export {};
