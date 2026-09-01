import type { ActivityLevel, FormulaSex } from "./body/metrics";
import type { LoadMode, PerformanceType } from "./capacity";
import { EXERCISE_ORDER, EXERCISE_PROFILES } from "./exercises";
import type { ExerciseId } from "./types";

export interface BodyProfileVoicePatch {
  age?: number;
  formulaSex?: FormulaSex;
  heightCm?: number;
  weightKg?: number;
  activityLevel?: ActivityLevel;
  chestCm?: number;
  waistCm?: number;
  neckCm?: number;
  hipCm?: number;
}

export interface EquipmentVoicePatch {
  exerciseId?: ExerciseId;
  performanceType?: PerformanceType;
  loadMode?: LoadMode;
  loadKg?: number;
  reps?: number;
  sets?: number;
  rir?: number;
}

export interface BodyweightVoicePatch {
  exerciseId?: ExerciseId;
  mode?: "bodyweight-reps" | "timed-hold";
  reps?: number;
  holdSeconds?: number;
  sets?: number;
  assistance?: string;
}

export type VoiceIntent =
  | { kind: "body-profile"; patch: BodyProfileVoicePatch; matchedFields: string[]; warnings: string[] }
  | { kind: "equipment"; patch: EquipmentVoicePatch; matchedFields: string[]; warnings: string[] }
  | { kind: "bodyweight"; patch: BodyweightVoicePatch; matchedFields: string[]; warnings: string[] }
  | { kind: "unknown"; patch: Record<string, never>; matchedFields: string[]; warnings: string[] };

const NUMBER_TOKEN = "[零〇一二两三四五六七八九十百点\\d.]+";
const DIGIT: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
  五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

export function parseSpokenNumber(raw: string): number | null {
  const normalized = raw.trim().replace(/，/g, ".").replace(/点/g, ".");
  if (/^\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);

  const numberParts = normalized.split(".");
  const integerText = numberParts[0] ?? "";
  const decimalText = numberParts[1];
  let integer = 0;
  if (integerText.includes("百") || integerText.includes("十")) {
    let remaining = integerText;
    const hundred = remaining.match(/([一二两三四五六七八九])百/);
    if (hundred) {
      integer += (DIGIT[hundred[1] ?? ""] ?? 0) * 100;
      remaining = remaining.replace(hundred[0], "");
    }
    const ten = remaining.match(/([一二两三四五六七八九]?)十/);
    if (ten) {
      integer += (ten[1] ? DIGIT[ten[1]] ?? 0 : 1) * 10;
      remaining = remaining.replace(ten[0], "");
    }
    for (const character of remaining) integer += DIGIT[character] ?? 0;
  } else {
    const digits = [...integerText].map((character) => DIGIT[character]);
    if (digits.some((digit) => digit === undefined)) return null;
    integer = Number(digits.join(""));
  }

  if (!decimalText) return integer;
  const decimalDigits = [...decimalText].map((character) => DIGIT[character]);
  if (decimalDigits.some((digit) => digit === undefined)) return null;
  return Number(`${integer}.${decimalDigits.join("")}`);
}

function captureAfter(text: string, labels: string): number | null {
  const match = text.match(new RegExp(`(?:${labels})\\s*(?:是|为|有|大概|约)?\\s*(${NUMBER_TOKEN})`, "i"));
  return match?.[1] ? parseSpokenNumber(match[1]) : null;
}

function captureBeforeUnit(text: string, units: string): number | null {
  const match = text.match(new RegExp(`(${NUMBER_TOKEN})\\s*(?:${units})`, "i"));
  return match?.[1] ? parseSpokenNumber(match[1]) : null;
}

function addBounded(
  patch: Record<string, number | string | undefined>,
  key: string,
  label: string,
  value: number | null,
  min: number,
  max: number,
  matchedFields: string[],
  warnings: string[],
): void {
  if (value === null) return;
  if (value < min || value > max) {
    warnings.push(`${label} ${value} 超出可填写范围 ${min}–${max}`);
    return;
  }
  patch[key] = value;
  matchedFields.push(`${label} ${value}`);
}

const EXERCISE_ALIASES: Partial<Record<ExerciseId, string[]>> = {
  "dumbbell-biceps-curl": ["哑铃弯举", "哑铃二头弯举"],
  plank: ["平板支撑", "平板"],
  squat: ["徒手深蹲", "深蹲"],
  "jumping-jack": ["开合跳"],
  "push-up": ["标准俯卧撑", "俯卧撑"],
};

function findExercise(text: string): ExerciseId | undefined {
  const candidates = EXERCISE_ORDER.flatMap((exerciseId) => [
    EXERCISE_PROFILES[exerciseId].name,
    ...(EXERCISE_ALIASES[exerciseId] ?? []),
  ].map((label) => ({ exerciseId, label }))).sort((left, right) => right.label.length - left.label.length);
  return candidates.find(({ label }) => text.includes(label))?.exerciseId;
}

function parseBodyProfile(text: string): VoiceIntent {
  const patch: BodyProfileVoicePatch = {};
  const writable = patch as Record<string, number | string | undefined>;
  const matchedFields: string[] = [];
  const warnings: string[] = [];
  addBounded(writable, "age", "年龄", captureAfter(text, "年龄|年纪|我"), 18, 60, matchedFields, warnings);
  addBounded(writable, "heightCm", "身高", captureAfter(text, "身高"), 120, 230, matchedFields, warnings);
  addBounded(writable, "weightKg", "体重", captureAfter(text, "体重"), 30, 250, matchedFields, warnings);
  addBounded(writable, "chestCm", "胸围", captureAfter(text, "胸围"), 50, 200, matchedFields, warnings);
  addBounded(writable, "waistCm", "腰围", captureAfter(text, "腰围"), 40, 200, matchedFields, warnings);
  addBounded(writable, "neckCm", "颈围", captureAfter(text, "颈围|脖围"), 20, 80, matchedFields, warnings);
  addBounded(writable, "hipCm", "臀围", captureAfter(text, "臀围"), 50, 200, matchedFields, warnings);

  if (/(?:女性|女生|女)(?:性)?/.test(text)) {
    patch.formulaSex = "female";
    matchedFields.push("公式参数 女");
  } else if (/(?:男性|男生|男)(?:性)?/.test(text)) {
    patch.formulaSex = "male";
    matchedFields.push("公式参数 男");
  }

  const activity = (() => {
    if (/体力工作|高强度训练|每天高强度/.test(text)) return "extra";
    if (/每周\s*(?:6|7|六|七)\s*(?:到|至|-)?\s*(?:7|七)?\s*次|每天运动/.test(text)) return "very";
    if (/每周\s*(?:3|三)\s*(?:到|至|-)\s*(?:5|五)\s*次|中等活动/.test(text)) return "moderate";
    if (/每周\s*(?:1|一)\s*(?:到|至|-)\s*(?:3|三)\s*次|轻度活动/.test(text)) return "light";
    if (/久坐|很少运动|基本不运动/.test(text)) return "sedentary";
    return null;
  })();
  if (activity) {
    patch.activityLevel = activity;
    matchedFields.push(`活动水平 ${{ sedentary: "久坐", light: "轻度", moderate: "中等", very: "较高", extra: "很高" }[activity]}`);
  }
  return { kind: "body-profile", patch, matchedFields, warnings };
}

function parseEquipment(text: string): VoiceIntent {
  const patch: EquipmentVoicePatch = {};
  const writable = patch as Record<string, number | string | undefined>;
  const matchedFields: string[] = [];
  const warnings: string[] = [];
  const exerciseId = findExercise(text);
  if (exerciseId) {
    patch.exerciseId = exerciseId;
    matchedFields.push(`动作 ${EXERCISE_PROFILES[exerciseId].name}`);
  } else {
    warnings.push("没有识别出器械动作名称");
  }
  const loadKg = captureBeforeUnit(text, "公斤|千克|kg");
  addBounded(writable, "loadKg", "重量", loadKg, 0.5, 500, matchedFields, warnings);
  patch.loadMode = /每只|单只/.test(text)
    ? "single"
    : /两只合计|一对合计|总重量/.test(text)
      ? "pair-total"
      : /器械/.test(text) ? "machine-total" : undefined;
  if (patch.loadMode) matchedFields.push(`重量口径 ${{ single: "单只", "pair-total": "两只合计", "machine-total": "器械总重" }[patch.loadMode]}`);
  patch.performanceType = /最大|极限|测试/.test(text) ? "max-test" : "working";

  const withoutRir = text.replace(new RegExp(`(?:余力|还剩)\\s*${NUMBER_TOKEN}\\s*次`, "g"), "");
  addBounded(writable, "reps", "次数", captureBeforeUnit(withoutRir, "次"), 1, 100, matchedFields, warnings);
  addBounded(writable, "sets", "组数", captureBeforeUnit(text, "组"), 1, 30, matchedFields, warnings);
  const rir = /力竭/.test(text) ? 0 : captureAfter(text, "余力|还剩");
  addBounded(writable, "rir", "余力", rir, 0, 5, matchedFields, warnings);
  return { kind: "equipment", patch, matchedFields, warnings };
}

function parseBodyweight(text: string): VoiceIntent {
  const patch: BodyweightVoicePatch = {};
  const writable = patch as Record<string, number | string | undefined>;
  const matchedFields: string[] = [];
  const warnings: string[] = [];
  const exerciseId = findExercise(text);
  if (exerciseId) {
    patch.exerciseId = exerciseId;
    matchedFields.push(`动作 ${EXERCISE_PROFILES[exerciseId].name}`);
  } else {
    warnings.push("没有识别出徒手动作名称");
  }
  const minutes = captureBeforeUnit(text, "分钟");
  const seconds = captureBeforeUnit(text, "秒");
  if (minutes !== null || seconds !== null) {
    patch.mode = "timed-hold";
    addBounded(writable, "holdSeconds", "保持", (minutes ?? 0) * 60 + (seconds ?? 0), 1, 3600, matchedFields, warnings);
  } else {
    patch.mode = "bodyweight-reps";
    addBounded(writable, "reps", "次数", captureBeforeUnit(text, "次"), 1, 3600, matchedFields, warnings);
  }
  addBounded(writable, "sets", "组数", captureBeforeUnit(text, "组"), 1, 30, matchedFields, warnings);
  const assistance = text.match(/(跪姿|扶墙|弹力带|辅助完成)/)?.[1];
  if (assistance) {
    patch.assistance = assistance;
    matchedFields.push(`辅助 ${assistance}`);
  }
  return { kind: "bodyweight", patch, matchedFields, warnings };
}

export function parseVoiceIntent(transcript: string): VoiceIntent {
  const text = transcript.trim().replace(/\s+/g, " ");
  if (!text) return { kind: "unknown", patch: {}, matchedFields: [], warnings: ["没有听到可解析的内容"] };
  if (/年龄|年纪|\d+\s*岁|[一二三四五六七八九十]+\s*岁|身高|体重|腰围|颈围|脖围|臀围|久坐|活动水平/.test(text)) {
    return parseBodyProfile(text);
  }
  if (/哑铃|公斤|千克|\bkg\b|余力|力竭|器械/.test(text.toLowerCase())) {
    return parseEquipment(text);
  }
  if (findExercise(text) || /\d+\s*(?:次|秒|分钟|组)/.test(text)) {
    return parseBodyweight(text);
  }
  return { kind: "unknown", patch: {}, matchedFields: [], warnings: ["没有识别出身体指标或运动能力记录"] };
}
