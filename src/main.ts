import "./style.css";
import "./security-theme.css";
import { SquatAnalyzer } from "./analysis/squat-analyzer";
import { JumpingJackAnalyzer } from "./analysis/jumping-jack-analyzer";
import {
  BodyweightAnalyzer,
  type FirstBatchExerciseId,
} from "./analysis/bodyweight-analyzer";
import {
  ExpandedExerciseAnalyzer,
  type RealtimeExpandedExerciseId,
} from "./analysis/expanded-analyzer";
import { CoachFeedback } from "./feedback";
import { buildRepAdvice, buildSessionAdvice } from "./coaching";
import {
  EXERCISE_ORDER,
  EXERCISE_PROFILES,
  exerciseName,
  type ExerciseCategory,
} from "./exercises";
import { summarizeLatency } from "./latency";
import { SessionStore } from "./storage";
import {
  EXERCISE_MET,
  estimateCalorieRange,
  estimateCalories,
  formatCalories,
} from "./calories";
import {
  CalorieEquivalentPreferenceStore,
  calorieEquivalentDisclaimer,
  formatCalorieEquivalent,
  type CalorieEquivalentKind,
} from "./calorie-equivalents";
import {
  findWorkoutPlan,
  formatWorkoutTarget,
  workoutPlanExercises,
  workoutPlanTotalSets,
  type WorkoutPlan,
} from "./plans";
import { SCIENTIFIC_WORKOUT_PLANS } from "./scientific-plans";
import { BodyProfileStore } from "./body/profile";
import { CapacityStore } from "./capacity";
import {
  recommendWorkoutPlans,
  type PlanEquipmentPreference,
  type PlanGoal,
} from "./plan-recommendation";
import { weeklyProgressCopy } from "./weekly-progress";
import {
  CustomPlanDraftStore,
  CustomPlanStore,
  type CustomPlanEquipment,
  type CustomPlanGoal,
  type CustomPlanIntensity,
  type CustomPlanRequest,
} from "./custom-plans";
import { SafePlanModelProvider } from "./plan-model-provider";
import { BrowserVoiceInput, type VoiceInputState } from "./voice-input";
import { WorkoutPlanRunner, type PlanPhase } from "./plan-runner";
import { PreferencesStore, type UserPreferences } from "./preferences";
import {
  isAppView,
  navigationNeedsSessionConfirmation,
  type AppView,
} from "./ui/view-state";
import { BodyCenter } from "./ui/body-center";
import {
  buildSingleExercisePlan,
  defaultSingleSessionSettings,
  IdleGuidanceScheduler,
  isActiveMotionPhase,
  normalizeSingleSessionSettings,
  recommendRest,
  type SingleSessionSettings,
} from "./single-session";
import {
  buildLocalSessionInsight,
  SafeSessionInsightProvider,
  type SessionInsight,
} from "./session-insight";
import type {
  DetectedPose,
  ExerciseAnalyzer,
  ExerciseId,
  FrameAnalysis,
  PoseWorkerRequest,
  PoseWorkerResponse,
  SessionSummary,
  WorkoutPhase,
} from "./types";
import { getCurrentAccountStorage } from "./data/account-storage";
import { createEncryptedBackup, readEncryptedBackup } from "./data/backup";
import {
  askCoach,
  CoachThreadStore,
  createCoachMessage,
  getCoachAvailability,
  type CoachContext,
  type CoachThread,
} from "./ai/coach";

type HomeExerciseCategory = "下肢" | "胸肩" | "背部" | "核心" | "有氧";

type CategoryPresentation = {
  title: string;
  heroTitle: string;
  heroNote: string;
  imageUrl: string;
  imageAlt: string;
  planIds: string[];
};

const CATEGORY_PRESENTATIONS: Record<HomeExerciseCategory, CategoryPresentation> = {
  下肢: {
    title: "下肢训练",
    heroTitle: "建立下肢基础力量",
    heroNote: "从深蹲与单腿控制开始，逐步提升髋、膝、踝的稳定。",
    imageUrl: "/assets/category-heroes/lower-body.jpg",
    imageAlt: "运动者进行杠铃深蹲训练",
    planIds: ["light-lower-mobility", "moderate-lower-control", "moderate-dumbbell-full"],
  },
  胸肩: {
    title: "胸肩训练",
    heroTitle: "建立稳定推举力量",
    heroNote: "先控制肩胛位置，再逐步增加推、举和支撑训练量。",
    imageUrl: "/assets/category-heroes/chest-shoulder.jpg",
    imageAlt: "运动者进行哑铃上肢推举训练",
    planIds: ["light-recovery-flow", "moderate-dumbbell-full", "high-dumbbell-complex"],
  },
  背部: {
    title: "背部训练",
    heroTitle: "找回背部发力感",
    heroNote: "从肩胛控制和划船模式开始，让拉力更稳定、更清晰。",
    imageUrl: "/assets/category-heroes/back.jpg",
    imageAlt: "运动者进行单臂哑铃划船训练",
    planIds: ["light-recovery-flow", "moderate-dumbbell-full", "high-dumbbell-complex"],
  },
  核心: {
    title: "核心训练",
    heroTitle: "建立躯干稳定能力",
    heroNote: "先保持呼吸和骨盆稳定，再延长支撑时间与动作幅度。",
    imageUrl: "/assets/category-heroes/core.jpg",
    imageAlt: "运动者进行平板支撑核心训练",
    planIds: ["light-core-reset", "moderate-core-cardio", "high-core-endurance"],
  },
  有氧: {
    title: "有氧训练",
    heroTitle: "把心率带到合适区间",
    heroNote: "用可控制的节奏提高心肺，不追求盲目加速。",
    imageUrl: "/assets/category-heroes/cardio.jpg",
    imageAlt: "运动者进行跳绳有氧训练",
    planIds: ["light-cardio-primer", "moderate-core-cardio", "high-hiit"],
  },
};

const PLAN_COVER_URLS: Record<string, string> = {
  "light-recovery-flow": "/assets/plan-covers/light-recovery-flow.jpg",
  "light-lower-mobility": "/assets/plan-covers/light-lower-mobility.jpg",
  "light-core-reset": "/assets/plan-covers/light-core-reset.jpg",
  "light-cardio-primer": "/assets/plan-covers/light-cardio-primer.jpg",
  "moderate-balanced-30": "/assets/plan-covers/moderate-balanced-30.jpg",
  "moderate-lower-control": "/assets/plan-covers/moderate-lower-control.jpg",
  "moderate-dumbbell-full": "/assets/plan-covers/moderate-dumbbell-full.jpg",
  "moderate-core-cardio": "/assets/plan-covers/moderate-core-cardio.jpg",
  "high-hiit": "/assets/plan-covers/high-hiit.jpg",
  "high-dumbbell-complex": "/assets/plan-covers/high-dumbbell-complex.jpg",
  "high-bodyweight-power": "/assets/plan-covers/high-bodyweight-power.jpg",
  "high-core-endurance": "/assets/plan-covers/high-core-endurance.jpg",
};

const FALLBACK_CAPTURE_INTERVAL_MS = 45;
const DRAW_VISIBILITY_THRESHOLD = 0.45;
const POSE_CONNECTIONS: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 7],
  [0, 4],
  [4, 5],
  [5, 6],
  [6, 8],
  [9, 10],
  [11, 12],
  [11, 13],
  [13, 15],
  [15, 17],
  [17, 19],
  [19, 15],
  [15, 21],
  [12, 14],
  [14, 16],
  [16, 18],
  [18, 20],
  [20, 16],
  [16, 22],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [27, 29],
  [29, 31],
  [27, 31],
  [24, 26],
  [26, 28],
  [28, 30],
  [30, 32],
  [28, 32],
];

const PHASE_LABEL: Record<WorkoutPhase, string> = {
  calibrating: "校准中",
  standing: "站立",
  descending: "下蹲",
  bottom: "最低点",
  ascending: "起身",
  paused: "已暂停",
  closed: "并拢",
  opening: "张开",
  open: "最大幅度",
  closing: "收回",
  resting: "暂歇",
  lifting: "抬起",
  top: "最高点",
  lowering: "下降",
  "left-lift": "左侧",
  "right-lift": "右侧",
  plank: "支撑",
  pressing: "推起",
  holding: "保持",
};

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`Missing required element: ${id}`);
  }
  return found as T;
}

const systemState = element<HTMLDivElement>("system-state");
const systemStateText = element<HTMLSpanElement>("system-state-text");
const video = element<HTMLVideoElement>("camera-video");
const canvas = element<HTMLCanvasElement>("pose-canvas");
const cameraFrame = element<HTMLDivElement>("camera-frame");
const cameraEmpty = element<HTMLDivElement>("camera-empty");
const cameraEmptyTitle = element<HTMLElement>("camera-empty-title");
const cameraEmptyDetail = element<HTMLElement>("camera-empty-detail");
const liveDemoCard = element<HTMLElement>("live-demo-card");
const liveDemoMedia = element<HTMLImageElement>("live-demo-media");
const liveDemoPending = element<HTMLElement>("live-demo-pending");
const liveDemoName = element<HTMLElement>("live-demo-name");
const liveDemoPhase = element<HTMLElement>("live-demo-phase");
const liveDemoToggle = element<HTMLButtonElement>("live-demo-toggle");
const liveDemoSide = element<HTMLButtonElement>("live-demo-side");
const modelLoading = element<HTMLDivElement>("model-loading");
const coachOverlay = element<HTMLDivElement>("coach-overlay");
const coachLabel = element<HTMLSpanElement>("coach-label");
const coachMessage = element<HTMLElement>("coach-message");
const coachAnnouncer = element<HTMLElement>("coach-announcer");
const coachSpeaking = element<HTMLElement>("coach-speaking");
const cameraButton = element<HTMLButtonElement>("camera-button");
const startButton = element<HTMLButtonElement>("start-button");
const endButton = element<HTMLButtonElement>("end-button");
const soundButton = element<HTMLButtonElement>("sound-button");
const soundLabel = element<HTMLElement>("sound-label");
const voiceTestButton = element<HTMLButtonElement>("voice-test-button");
const retryModelButton = element<HTMLButtonElement>("retry-model-button");
const cameraError = element<HTMLParagraphElement>("camera-error");
const totalReps = element<HTMLElement>("total-reps");
const totalRepsLabel = element<HTMLElement>("total-reps-label");
const totalRepsNote = element<HTMLElement>("total-reps-note");
const qualifiedReps = element<HTMLElement>("qualified-reps");
const qualifiedRepsLabel = element<HTMLElement>("qualified-reps-label");
const qualityRate = element<HTMLElement>("quality-rate");
const phaseValue = element<HTMLElement>("phase-value");
const kneeAngle = element<HTMLElement>("knee-angle");
const trunkAngle = element<HTMLElement>("trunk-angle");
const tempoValue = element<HTMLElement>("tempo-value");
const trackingValue = element<HTMLElement>("tracking-value");
const latencyValue = element<HTMLElement>("latency-value");
const sideLabel = element<HTMLElement>("side-label");
const primaryMetricLabel = element<HTMLElement>("primary-metric-label");
const secondaryMetricLabel = element<HTMLElement>("secondary-metric-label");
const stageTitle = element<HTMLElement>("stage-title");
const stageViewNote = element<HTMLElement>("stage-view-note");
const guideTitle = element<HTMLElement>("guide-title");
const squatDemo = element<HTMLElement>("squat-demo");
const jumpingJackDemo = element<HTMLElement>("jumping-jack-demo");
const catalogExerciseDemo = element<HTMLElement>("catalog-exercise-demo");
const catalogExerciseMedia = element<HTMLImageElement>("catalog-exercise-media");
const catalogMediaPending = element<HTMLElement>("catalog-media-pending");
const catalogDemoTitle = element<HTMLElement>("catalog-demo-title");
const catalogDemoStatus = element<HTMLElement>("catalog-demo-status");
const catalogDemoAttribution = element<HTMLElement>("catalog-demo-attribution");
const primaryMuscles = element<HTMLElement>("primary-muscles");
const secondaryMuscles = element<HTMLElement>("secondary-muscles");
const activationCue = element<HTMLElement>("activation-cue");
const movementCheckpoints = element<HTMLUListElement>("movement-checkpoints");
const exerciseLibraryGrid = element<HTMLElement>("exercise-library-grid");
const libraryFilters = element<HTMLElement>("library-filters");
const phaseRail = element<HTMLElement>("phase-rail");
const lastRepCard = element<HTMLElement>("last-rep-card");
const lastRepNumber = element<HTMLElement>("last-rep-number");
const lastRepStatus = element<HTMLElement>("last-rep-status");
const lastRepMessage = element<HTMLElement>("last-rep-message");
const lastRepOther = element<HTMLElement>("last-rep-other");
const summaryPanel = element<HTMLElement>("summary-panel");
const summaryTitle = element<HTMLElement>("summary-title");
const summarySubtitle = element<HTMLElement>("summary-subtitle");
const summaryTotal = element<HTMLElement>("summary-total");
const summaryTotalLabel = element<HTMLElement>("summary-total-label");
const summaryQualified = element<HTMLElement>("summary-qualified");
const summaryQualifiedLabel = element<HTMLElement>("summary-qualified-label");
const summaryTempo = element<HTMLElement>("summary-tempo");
const summaryTempoLabel = element<HTMLElement>("summary-tempo-label");
const summaryIssue = element<HTMLElement>("summary-issue");
const summaryLatency = element<HTMLElement>("summary-latency");
const summaryLatencyNote = element<HTMLElement>("summary-latency-note");
const summaryAdviceTitle = element<HTMLElement>("summary-advice-title");
const summaryAdviceMessage = element<HTMLElement>("summary-advice-message");
const summaryIssueBreakdown = element<HTMLElement>("summary-issue-breakdown");
const summaryInsightSource = element<HTMLElement>("summary-insight-source");
const historyEmpty = element<HTMLElement>("history-empty");
const historyList = element<HTMLOListElement>("history-list");
const clearHistoryButton = element<HTMLButtonElement>("clear-history-button");
const historyStartButton = element<HTMLButtonElement>("history-start-button");
const historySessionsNote = element<HTMLElement>("history-sessions-note");
const historyRepsNote = element<HTMLElement>("history-reps-note");
const historyCaloriesNote = element<HTMLElement>("history-calories-note");
const repeatButton = element<HTMLButtonElement>("repeat-button");
const chooseExerciseButton = element<HTMLButtonElement>("choose-exercise-button");
const controlsHelp = element<HTMLParagraphElement>("controls-help");
const liveCalories = element<HTMLElement>("live-calories");
const summaryCalories = element<HTMLElement>("summary-calories");
const summaryActiveTime = element<HTMLElement>("summary-active-time");
const quickStartButton = element<HTMLButtonElement>("quick-start-button");
const browseLibraryButton = element<HTMLButtonElement>("browse-library-button");
const trainingBackButton = element<HTMLButtonElement>("training-back-button");
const homePlanGrid = element<HTMLElement>("home-plan-grid");
const categoryBackButton = element<HTMLButtonElement>("category-back-button");
const categoryToolbarTitle = element<HTMLElement>("category-toolbar-title");
const categoryHeroImage = element<HTMLImageElement>("category-hero-image");
const categoryHeroKicker = element<HTMLElement>("category-hero-kicker");
const categoryViewTitle = element<HTMLElement>("category-view-title");
const categoryHeroNote = element<HTMLElement>("category-hero-note");
const categoryFeaturedButton = element<HTMLButtonElement>("category-featured-button");
const categoryCourseGrid = element<HTMLElement>("category-course-grid");
const categoryCourseCount = element<HTMLElement>("category-course-count");
const categoryActionList = element<HTMLElement>("category-action-list");
const categoryAllActions = element<HTMLButtonElement>("category-all-actions");
const courseBackButton = element<HTMLButtonElement>("course-back-button");
const courseSaveButton = element<HTMLButtonElement>("course-save-button");
const courseHeroImage = element<HTMLImageElement>("course-hero-image");
const courseViewKicker = element<HTMLElement>("course-view-kicker");
const courseViewTitle = element<HTMLElement>("course-view-title");
const courseViewSummary = element<HTMLElement>("course-view-summary");
const courseStatGrid = element<HTMLElement>("course-stat-grid");
const courseDescriptionText = element<HTMLElement>("course-description-text");
const courseExerciseCount = element<HTMLElement>("course-exercise-count");
const courseExerciseList = element<HTMLOListElement>("course-exercise-list");
const courseStartButton = element<HTMLButtonElement>("course-start-button");
const planPageGrid = element<HTMLElement>("plan-page-grid");
const planRecommendGrid = element<HTMLElement>("plan-recommend-grid");
const planRecommendNote = element<HTMLElement>("plan-recommend-note");
const planGoalSelect = element<HTMLSelectElement>("plan-goal");
const planMinutesSelect = element<HTMLSelectElement>("plan-minutes");
const planEquipmentSelect = element<HTMLSelectElement>("plan-equipment");
const planRecommendButton = element<HTMLButtonElement>("plan-recommend-button");
const planPrompt = element<HTMLTextAreaElement>("plan-prompt");
const planVoiceButton = element<HTMLButtonElement>("plan-voice-button");
const planGenerateButton = element<HTMLButtonElement>("plan-generate-button");
const planBuilderStatus = element<HTMLElement>("plan-builder-status");
const planGeneratedResult = element<HTMLElement>("plan-generated-result");
const savedPlanSection = element<HTMLElement>("saved-plan-section");
const savedPlanGrid = element<HTMLElement>("saved-plan-grid");
const homeWeekSessions = element<HTMLElement>("home-week-sessions");
const homeWeekReps = element<HTMLElement>("home-week-reps");
const homeWeekCalories = element<HTMLElement>("home-week-calories");
const homeCalories = element<HTMLElement>("home-calories");
const planWeekCount = element<HTMLElement>("plan-week-count");
const planWeekBar = element<HTMLElement>("plan-week-bar");
const planWeekNote = element<HTMLElement>("plan-week-note");
const planSessionBar = element<HTMLElement>("plan-session-bar");
const planSessionKicker = element<HTMLElement>("plan-session-kicker");
const planSessionName = element<HTMLElement>("plan-session-name");
const planSessionNext = element<HTMLElement>("plan-session-next");
const planSessionSet = element<HTMLElement>("plan-session-set");
const planSessionExercise = element<HTMLElement>("plan-session-exercise");
const planSessionGoal = element<HTMLElement>("plan-session-goal");
const planSessionCompleted = element<HTMLElement>("plan-session-completed");
const planSessionTotal = element<HTMLElement>("plan-session-total");
const planSessionProgressBar = element<HTMLElement>("plan-session-progress-bar");
const planSessionPause = element<HTMLButtonElement>("plan-session-pause");
const planPhaseOverlay = element<HTMLElement>("plan-phase-overlay");
const planPhaseAnnouncer = element<HTMLElement>("plan-phase-announcer");
const planPhaseLabel = element<HTMLElement>("plan-phase-label");
const planPhaseTime = element<HTMLElement>("plan-phase-time");
const planPhaseTitle = element<HTMLElement>("plan-phase-title");
const planPhaseDetail = element<HTMLElement>("plan-phase-detail");
const planPhasePrimary = element<HTMLButtonElement>("plan-phase-primary");
const planExtendRest = element<HTMLButtonElement>("plan-extend-rest");
const planPause = element<HTMLButtonElement>("plan-pause");
const singleSessionFields = element<HTMLElement>("single-session-fields");
const singleSessionFreeNote = element<HTMLElement>("single-session-free-note");
const singleSessionSets = element<HTMLInputElement>("single-session-sets");
const singleSessionTarget = element<HTMLInputElement>("single-session-target");
const singleSessionRest = element<HTMLInputElement>("single-session-rest");
const singleSessionTargetLabel = element<HTMLElement>("single-session-target-label");
const singleSessionTargetUnit = element<HTMLElement>("single-session-target-unit");
const singleSessionRecommendation = element<HTMLElement>("single-session-recommendation");
const singleSessionReason = element<HTMLElement>("single-session-reason");
const sessionModeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-session-mode]"));
const pauseSessionButton = element<HTMLButtonElement>("pause-session-button");
const saveProgressButton = element<HTMLButtonElement>("save-progress-button");
const liveCalorieNote = element<HTMLElement>("live-calorie-note");
const summaryCalorieBasis = element<HTMLElement>("summary-calorie-basis");
const historyTotalSessions = element<HTMLElement>("history-total-sessions");
const historyTotalReps = element<HTMLElement>("history-total-reps");
const historyTotalCalories = element<HTMLElement>("history-total-calories");
const historyCalorieEquivalent = element<HTMLSelectElement>("history-calorie-equivalent");
const historyCalorieEquivalentOutput = element<HTMLElement>("history-calorie-equivalent-output");
const historyCalorieEquivalentNote = element<HTMLElement>("history-calorie-equivalent-note");
const summaryCalorieEquivalent = element<HTMLSelectElement>("summary-calorie-equivalent");
const summaryCalorieEquivalentOutput = element<HTMLElement>("summary-calorie-equivalent-output");
const summaryCalorieEquivalentNote = element<HTMLElement>("summary-calorie-equivalent-note");
const skeletonToggle = element<HTMLInputElement>("skeleton-toggle");
const summaryPlanProgressCard = element<HTMLElement>("summary-plan-progress-card");
const summaryPlanProgress = element<HTMLElement>("summary-plan-progress");
const summaryPlanName = element<HTMLElement>("summary-plan-name");
const summaryRestCard = element<HTMLElement>("summary-rest-card");
const summaryRestPace = element<HTMLElement>("summary-rest-pace");
const summaryRestNote = element<HTMLElement>("summary-rest-note");
const aiConversation = element<HTMLElement>("ai-conversation");
const aiEmptyState = element<HTMLElement>("ai-empty-state");
const aiMessageList = element<HTMLOListElement>("ai-message-list");
const aiComposer = element<HTMLFormElement>("ai-composer");
const aiInput = element<HTMLTextAreaElement>("ai-input");
const aiSend = element<HTMLButtonElement>("ai-send");
const aiStatus = element<HTMLElement>("ai-status");
const aiNewThread = element<HTMLButtonElement>("ai-new-thread");
const aiHistoryToggle = element<HTMLButtonElement>("ai-history-toggle");
const aiHistoryClose = element<HTMLButtonElement>("ai-history-close");
const aiThreadHistory = element<HTMLElement>("ai-thread-history");
const aiThreadList = element<HTMLOListElement>("ai-thread-list");
const mySessionCount = element<HTMLElement>("my-session-count");
const myBodyCount = element<HTMLElement>("my-body-count");
const myPlanCount = element<HTMLElement>("my-plan-count");
const myThreadCount = element<HTMLElement>("my-thread-count");
const dataExportButton = element<HTMLButtonElement>("data-export");
const dataImportButton = element<HTMLButtonElement>("data-import");
const dataImportFile = element<HTMLInputElement>("data-import-file");
const dataDeleteAllButton = element<HTMLButtonElement>("data-delete-all");
const dataPrivacyStatus = element<HTMLElement>("data-privacy-status");
const exerciseButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-exercise]"),
);
let phaseRailItems = Array.from(
  document.querySelectorAll<HTMLElement>("[data-phase]"),
);

const canvasContext = (() => {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("当前浏览器不支持画布绘制");
  }
  return context;
})();

const accountStorage = getCurrentAccountStorage();
const sessionStore = new SessionStore(accountStorage);
const preferencesStore = new PreferencesStore(accountStorage);
const bodyProfileStore = new BodyProfileStore(accountStorage);
const calorieEquivalentStore = new CalorieEquivalentPreferenceStore(accountStorage);
let calorieEquivalentKind = calorieEquivalentStore.load();
let currentSummaryCalories: number | null = null;
let cumulativeCalories = 0;
const capacityStore = new CapacityStore(accountStorage);
const customPlanStore = new CustomPlanStore(accountStorage);
const customPlanDraftStore = new CustomPlanDraftStore(accountStorage);
const coachThreadStore = new CoachThreadStore(accountStorage);
const planModelProvider = new SafePlanModelProvider(null);
const feedback = new CoachFeedback();
const sessionInsightProvider = new SafeSessionInsightProvider(null);
let summaryInsightRequest = 0;
let preferences: UserPreferences = preferencesStore.load();
let activeCoachThread: CoachThread | null = coachThreadStore.load()[0] ?? null;
let coachStatusRevision = 0;
const bodyCenter = new BodyCenter({
  storage: accountStorage,
  legacyWeightKg: preferences.weightKg,
  onProfileChange: (profile) => {
    preferences = preferencesStore.save({ ...preferences, weightKg: profile.weightKg });
    renderDashboard(sessionStore.load());
    renderRecommendedPlans();
    renderSingleSessionSetup(true);
  },
  onCapacityChange: () => renderRecommendedPlans(),
});
let currentView: AppView = "home";
let selectedExercise: ExerciseId = "squat";
let analyzer: ExerciseAnalyzer = new SquatAnalyzer();
let poseWorker: Worker | null = null;
let mediaStream: MediaStream | null = null;
let modelReady = false;
let cameraReady = false;
let cameraStarting = false;
let sessionActive = false;
let inferencePending = false;
let inferenceGeneration: number | null = null;
let captureGeneration = 0;
let lastCaptureAt = 0;
let captureFailureCount = 0;
let captureAnimationFrame = 0;
let captureVideoFrameCallback = 0;
let lastPose: DetectedPose | null = null;
let lastAnalysis: FrameAnalysis | null = null;
let lastExerciseMotionAt = 0;
let sessionActiveDurationMs = 0;
let lastAnalysisRenderAt: number | null = null;
let structuredSingleSession = true;
let freeSessionPaused = false;
let sessionRecordId: string | null = null;
const idleGuidance = new IdleGuidanceScheduler();
let selectedCategory: HomeExerciseCategory = "下肢";
let selectedCourse: WorkoutPlan | null = null;
let courseReturnView: AppView = "category";
let trainingReturnView: AppView = "library";
let generatedCustomPlan: WorkoutPlan | null = null;
let generatedCustomRequest: CustomPlanRequest | null = null;
let planRunner: WorkoutPlanRunner | null = null;
let planTimer = 0;
let planPendingCameraStart = false;
let planSetSummaries: SessionSummary[] = [];
let planTotalActiveDurationMs = 0;
const planLatencySamples: number[] = [];
let planCountdownAnnouncement = "";
const latencySamples: number[] = [];
const sessionLatencySamples: number[] = [];

function updatePlanVoiceState(state: VoiceInputState): void {
  const listening = state === "listening" || state === "reconnecting";
  planVoiceButton.classList.toggle("plan-voice-listening", listening);
  planVoiceButton.setAttribute("aria-pressed", String(listening));
  planVoiceButton.textContent = listening ? "暂停语音" : "语音输入";
  if (state === "unsupported") {
    planVoiceButton.disabled = true;
    planVoiceButton.textContent = "浏览器不支持语音";
  } else if (state === "processing") {
    updateText(planBuilderStatus, "正在整理识别文字，稍等一下……");
  } else if (state === "reconnecting") {
    updateText(planBuilderStatus, "识别连接波动，正在自动恢复；不用重复说已经显示的内容。");
  }
}

const planVoiceInput = new BrowserVoiceInput({
  onStateChange: updatePlanVoiceState,
  onTranscript: (transcript) => {
    planPrompt.value = transcript;
    updateText(planBuilderStatus, "识别文字会持续追加；说完后点击“暂停语音”。");
  },
  onError: (message) => updateText(planBuilderStatus, message),
});

function recordLatency(frameTimestamp: number, inferenceMs: number): void {
  const measuredEndToEnd = performance.now() - frameTimestamp;
  const endToEndMs = Number.isFinite(measuredEndToEnd) && measuredEndToEnd >= 0 && measuredEndToEnd < 5_000
    ? Math.max(inferenceMs, measuredEndToEnd)
    : inferenceMs;
  latencySamples.push(endToEndMs);
  if (latencySamples.length > 60) latencySamples.shift();
  if (sessionActive) sessionLatencySamples.push(endToEndMs);
  if (sessionActive && planRunner) planLatencySamples.push(endToEndMs);
  const response = summarizeLatency(latencySamples);
  if (!response) return;
  updateText(latencyValue, `${response.label} · ${Math.round(endToEndMs)} 毫秒`);
  latencyValue.dataset.state = response.state;
  latencyValue.title = `最近 95% 的动作判断在 ${Math.round(response.p95Ms)} 毫秒内完成`;
}

function updateText(node: Node, value: string): void {
  if (node.textContent !== value) {
    node.textContent = value;
  }
}

function formatDuration(activeDurationMs: number | null | undefined): string {
  if (!activeDurationMs || activeDurationMs <= 0) return "—";
  const totalSeconds = Math.round(activeDurationMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}分${String(seconds).padStart(2, "0")}秒` : `${seconds}秒`;
}

function isSingleExercisePlan(plan: WorkoutPlan | string | null | undefined): boolean {
  const id = typeof plan === "string" ? plan : plan?.id;
  return id?.startsWith("custom-single-") === true;
}

function readSingleSessionSettings(): SingleSessionSettings {
  const profile = EXERCISE_PROFILES[selectedExercise];
  return normalizeSingleSessionSettings({
    sets: Number(singleSessionSets.value),
    target: Number(singleSessionTarget.value),
    restSeconds: Number(singleSessionRest.value),
  }, profile.mode);
}

function renderSingleSessionSetup(resetValues = false): void {
  const profile = EXERCISE_PROFILES[selectedExercise];
  const body = bodyProfileStore.load(preferences.weightKg);
  const suggested = defaultSingleSessionSettings(profile, body);
  const rest = recommendRest(profile, body);
  if (resetValues) {
    singleSessionSets.value = String(suggested.sets);
    singleSessionTarget.value = String(suggested.target);
    singleSessionRest.value = String(suggested.restSeconds);
  }
  const timed = profile.mode === "timed-hold";
  updateText(singleSessionTargetLabel, timed ? "每组保持" : "每组目标");
  updateText(singleSessionTargetUnit, timed ? "秒" : "次");
  singleSessionTarget.max = timed ? "300" : "100";
  updateText(singleSessionRecommendation, `建议休息 ${rest.seconds} 秒`);
  updateText(singleSessionReason, `${rest.reason}。这是可修改的本机建议，不代替你的实际感受。`);
  singleSessionFields.classList.toggle("hidden", !structuredSingleSession);
  singleSessionFreeNote.classList.toggle("hidden", structuredSingleSession);
  for (const button of sessionModeButtons) {
    button.setAttribute("aria-pressed", String(
      (button.dataset.sessionMode === "structured") === structuredSingleSession,
    ));
  }
}

function singleSessionShortCue(phase: WorkoutPhase): string {
  if (phase === "bottom") return "准备起身";
  if (phase === "plank" || phase === "holding") return "收紧核心，开始保持";
  if (phase === "closed") return "准备张开";
  return EXERCISE_PROFILES[selectedExercise].mode === "timed-hold"
    ? "进入标准姿势"
    : `准备，开始${EXERCISE_PROFILES[selectedExercise].name}`;
}

function singleSessionDetailedCue(phase: WorkoutPhase, exerciseId: ExerciseId): string {
  const profile = EXERCISE_PROFILES[exerciseId];
  const breathing = profile.breathingCue ? ` ${profile.breathingCue}` : "";
  return `${singleSessionShortCue(phase)}。${profile.activationCue}${breathing}`;
}

function setDemoIdleState(idle: boolean): void {
  cameraFrame.classList.toggle("demo-idle", idle);
}

function calorieBasisText(
  exerciseId: ExerciseId,
  activeDurationMs: number | null | undefined,
  weightKg: number | null | undefined,
): string {
  if (weightKg == null) return "未填写体重，暂不生成数值";
  if (!activeDurationMs || activeDurationMs <= 0) return "等待识别到有效运动时间";
  const met = EXERCISE_MET[exerciseId];
  return `${weightKg} kg × ${met} MET × ${formatDuration(activeDurationMs)}有效运动`;
}

function showView(view: AppView, moveFocus = true): void {
  currentView = view;
  document.body.dataset.currentView = view;
  document.title = ({
    home: "FORM｜私人动作教练",
    category: `${CATEGORY_PRESENTATIONS[selectedCategory].title}｜FORM`,
    course: `${selectedCourse?.name ?? "训练课程"}｜FORM`,
    library: "动作库｜FORM",
    training: `${exerciseName(selectedExercise)}｜实时训练`,
    ai: "AI 教练｜FORM",
    plan: "训练计划｜FORM",
    my: "我的｜FORM",
    history: "训练记录｜FORM",
    body: "身体状态｜FORM",
    summary: "训练总结｜FORM",
  })[view];
  for (const section of document.querySelectorAll<HTMLElement>("[data-view-section]")) {
    section.classList.toggle("hidden", section.dataset.viewSection !== view);
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>(".app-nav [data-app-view]")) {
    const navView = view === "category"
      ? "library"
      : view === "course"
        ? "plan"
        : view === "history" || view === "body"
          ? "my"
          : view;
    const active = button.dataset.appView === navView;
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  window.scrollTo({ top: 0, behavior: moveFocus ? "smooth" : "auto" });
  if (moveFocus) {
    element<HTMLElement>("app-content").focus({ preventScroll: true });
  }
  if (view === "ai") {
    renderCoachThread();
    void refreshCoachAvailability();
  }
  if (view === "my") renderMyOverview();
}

function coachContext(): CoachContext {
  const profile = bodyProfileStore.load(preferences.weightKg);
  const sessions = sessionStore.load();
  return {
    body: profile.updatedAt ? { ...profile } : null,
    bodyHistory: bodyProfileStore.loadSnapshots().slice(0, 6),
    totalSessionCount: sessions.length,
    recentSessions: sessions.slice(0, 8).map((session) => ({
      exerciseId: session.exerciseId,
      exerciseName: session.exerciseId ? exerciseName(session.exerciseId) : undefined,
      endedAt: session.endedAt,
      totalReps: session.totalReps,
      qualifiedReps: session.qualifiedReps,
      issueCounts: session.issueCounts,
      planName: session.planName,
      activeDurationMs: session.activeDurationMs,
      estimatedCalories: session.estimatedCalories,
    })),
    savedPlans: customPlanStore.load().slice(0, 8).map((item) => ({
      id: item.plan.id,
      name: item.plan.name,
      goal: item.plan.goal,
      durationMinutes: item.plan.durationMinutes,
    })),
  };
}

function ensureCoachThread(): CoachThread {
  activeCoachThread ??= coachThreadStore.create();
  return activeCoachThread;
}

function renderCoachThread(): void {
  const messages = activeCoachThread?.messages ?? [];
  aiEmptyState.classList.toggle("hidden", messages.length > 0);
  aiMessageList.replaceChildren();
  for (const message of messages) {
    const item = document.createElement("li");
    item.className = `ai-message ai-message-${message.role}`;
    const label = document.createElement("span");
    label.textContent = message.role === "assistant"
      ? message.source === "local" ? "FORM 本机教练" : message.source === "ai" ? "FORM AI 教练" : "FORM 教练"
      : "你";
    const text = document.createElement("p");
    text.textContent = message.text;
    item.append(label, text);
    if (message.evidence.length) {
      const evidence = document.createElement("div");
      evidence.className = "ai-evidence";
      const heading = document.createElement("strong");
      heading.textContent = "建议依据";
      evidence.append(heading);
      for (const entry of message.evidence) {
        const chip = document.createElement("span");
        chip.textContent = entry;
        evidence.append(chip);
      }
      item.append(evidence);
    }
    aiMessageList.append(item);
  }
  if (messages.length) aiConversation.scrollTop = aiConversation.scrollHeight;
  renderCoachHistory();
}

function renderCoachHistory(): void {
  const threads = coachThreadStore.load();
  aiThreadList.replaceChildren();
  if (!threads.length) {
    const empty = document.createElement("li");
    empty.className = "ai-thread-empty";
    empty.textContent = "还没有保存的对话。";
    aiThreadList.append(empty);
    return;
  }
  for (const thread of threads) {
    const item = document.createElement("li");
    if (thread.id === activeCoachThread?.id) item.dataset.active = "true";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "ai-thread-open";
    const title = document.createElement("strong");
    title.textContent = thread.title || "新的对话";
    const date = document.createElement("small");
    date.textContent = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(thread.updatedAt));
    open.append(title, date);
    open.addEventListener("click", () => {
      activeCoachThread = thread;
      aiThreadHistory.classList.add("hidden");
      aiHistoryToggle.setAttribute("aria-expanded", "false");
      renderCoachThread();
      aiInput.focus();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ai-thread-delete";
    remove.textContent = "删除";
    remove.setAttribute("aria-label", `删除对话${thread.title}`);
    remove.addEventListener("click", () => {
      if (!window.confirm(`删除“${thread.title}”？删除后无法恢复。`)) return;
      coachThreadStore.remove(thread.id);
      if (activeCoachThread?.id === thread.id) activeCoachThread = coachThreadStore.load()[0] ?? null;
      renderCoachThread();
      renderMyOverview();
    });
    item.append(open, remove);
    aiThreadList.append(item);
  }
}

async function sendCoachMessage(text: string): Promise<void> {
  const prompt = text.trim();
  if (!prompt || aiSend.disabled) return;
  const thread = ensureCoachThread();
  thread.messages.push(createCoachMessage("user", prompt));
  if (thread.messages.length === 1) thread.title = prompt.slice(0, 24);
  coachThreadStore.save(thread);
  aiInput.value = "";
  aiSend.disabled = true;
  const statusRevision = ++coachStatusRevision;
  updateText(aiStatus, "正在结合本机资料整理……");
  renderCoachThread();
  const history = thread.messages.slice(0, -1);
  const result = await askCoach(prompt, coachContext(), history);
  thread.messages.push(createCoachMessage("assistant", result.text, result.evidence, result.source));
  activeCoachThread = { ...thread, updatedAt: new Date().toISOString() };
  coachThreadStore.save(activeCoachThread);
  aiSend.disabled = false;
  if (statusRevision === coachStatusRevision) {
    updateText(aiStatus, result.source === "ai"
      ? "DeepSeek AI 回答 · 对话已保存在当前设备"
      : result.notice ?? "本机教练回答 · 对话已保存在当前设备");
  }
  renderCoachThread();
  renderMyOverview();
}

async function refreshCoachAvailability(): Promise<void> {
  const statusRevision = ++coachStatusRevision;
  const availability = await getCoachAvailability();
  if (statusRevision === coachStatusRevision) {
    updateText(aiStatus, `${availability.label} · 对话保存在当前设备`);
  }
}

function renderMyOverview(): void {
  const profile = bodyProfileStore.load(preferences.weightKg);
  updateText(mySessionCount, `${sessionStore.load().length} 条`);
  updateText(myBodyCount, profile.updatedAt ? "已建立" : "未填写");
  updateText(myPlanCount, `${customPlanStore.load().length} 套`);
  updateText(myThreadCount, `${coachThreadStore.load().length} 个`);
}

function requestView(view: AppView): void {
  if (view === currentView) return;
  const workoutInProgress = sessionActive || freeSessionPaused || planRunner !== null;
  if (navigationNeedsSessionConfirmation(currentView, view, workoutInProgress)) {
    if (!window.confirm(planRunner
      ? "整套训练还没有完成。结束计划并离开吗？已完成的有效动作会保存在记录中。"
      : "训练还在进行。结束本次训练并离开吗？结果会保存在记录中。")) {
      return;
    }
    if (planRunner) finishWorkoutPlan(false);
    else endSession();
  }
  showView(view);
}

function categoryForPlan(plan: WorkoutPlan): HomeExerciseCategory {
  for (const category of Object.keys(CATEGORY_PRESENTATIONS) as HomeExerciseCategory[]) {
    if (CATEGORY_PRESENTATIONS[category].planIds.includes(plan.id)) return category;
  }
  const counts = new Map<HomeExerciseCategory, number>();
  for (const category of Object.keys(CATEGORY_PRESENTATIONS) as HomeExerciseCategory[]) {
    counts.set(category, plan.steps.filter((step) => matchesHomeExerciseCategory(step.exerciseId, category)).length);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "下肢";
}

function planCoverUrl(plan: WorkoutPlan): string {
  return PLAN_COVER_URLS[plan.id] ?? CATEGORY_PRESENTATIONS[categoryForPlan(plan)].imageUrl;
}

function plansForCategory(category: HomeExerciseCategory, level = "全部"): WorkoutPlan[] {
  const plans = CATEGORY_PRESENTATIONS[category].planIds
    .map((id) => findWorkoutPlan(id))
    .filter((plan): plan is WorkoutPlan => Boolean(plan));
  if (level === "全部") return plans;
  return plans.filter((plan) => level === "入门" ? plan.level === "入门" : plan.intensity === level);
}

function renderCategoryCourseCard(plan: WorkoutPlan): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "category-course-card";
  button.setAttribute("aria-label", `查看${plan.name}课程`);
  const preview = document.createElement("span");
  preview.className = "category-course-preview";
  const image = document.createElement("img");
  image.src = planCoverUrl(plan);
  image.alt = "";
  image.loading = "lazy";
  preview.append(image);
  const coverBadge = document.createElement("span");
  coverBadge.className = "category-course-badge";
  coverBadge.textContent = plan.level;
  preview.append(coverBadge);
  const copy = document.createElement("span");
  copy.className = "category-course-copy";
  const title = document.createElement("strong");
  title.textContent = plan.name;
  const note = document.createElement("small");
  note.textContent = `${plan.steps.length} 个动作 · ${plan.durationMinutes} 分钟`;
  copy.append(title, note);
  const level = document.createElement("span");
  level.className = "category-course-level";
  level.textContent = "进入";
  button.append(preview, copy, level);
  button.addEventListener("click", () => openCourseView(plan, "category"));
  return button;
}

function renderCategoryView(category: HomeExerciseCategory, level = "全部"): void {
  selectedCategory = category;
  const presentation = CATEGORY_PRESENTATIONS[category];
  updateText(categoryToolbarTitle, presentation.title);
  categoryHeroImage.src = presentation.imageUrl;
  categoryHeroImage.alt = presentation.imageAlt;
  updateText(categoryHeroKicker, "本周推荐 · 完成度 72%");
  categoryViewTitle.textContent = presentation.heroTitle;
  updateText(categoryHeroNote, presentation.heroNote);

  const plans = plansForCategory(category, level);
  categoryCourseGrid.replaceChildren(...plans.map(renderCategoryCourseCard));
  updateText(categoryCourseCount, `${plans.length} 套`);
  categoryFeaturedButton.disabled = plans.length === 0;
  categoryFeaturedButton.dataset.planId = plans[0]?.id ?? "";

  categoryActionList.replaceChildren();
  const matching = EXERCISE_ORDER.filter((exerciseId) => {
    const profile = EXERCISE_PROFILES[exerciseId];
    if (!matchesHomeExerciseCategory(exerciseId, category)) return false;
    return category === "有氧" || profile.category !== "全身有氧";
  }).slice(0, 6);
  for (const exerciseId of matching) {
    const profile = EXERCISE_PROFILES[exerciseId];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-action-card";
    const media = document.createElement("span");
    media.className = "category-action-media";
    const imageUrl = profile.media.thumbnailUrl ?? profile.media.animationUrl;
    if (imageUrl) {
      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = "";
      image.loading = "lazy";
      media.append(image);
    }
    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = profile.name;
    const note = document.createElement("small");
    note.textContent = profile.available ? "摄像头实时纠正" : "动作示范与要点";
    copy.append(title, note);
    button.append(media, copy);
    button.addEventListener("click", () => {
      trainingReturnView = "category";
      renderExercise(exerciseId);
      showView("training");
      cameraButton.focus();
    });
    categoryActionList.append(button);
  }
}

function openCategoryView(category: HomeExerciseCategory): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-category-level]")) {
    button.setAttribute("aria-pressed", String(button.dataset.categoryLevel === "全部"));
  }
  renderCategoryView(category);
  showView("category");
}

function openCourseView(plan: WorkoutPlan, returnView: AppView = currentView): void {
  selectedCourse = plan;
  courseReturnView = returnView;
  const isSaved = customPlanStore.has(plan.id);
  courseSaveButton.setAttribute("aria-pressed", String(isSaved));
  courseSaveButton.textContent = isSaved ? "♥" : "♡";
  courseSaveButton.setAttribute("aria-label", isSaved ? "取消收藏这套训练" : "收藏这套训练");
  const category = categoryForPlan(plan);
  const presentation = CATEGORY_PRESENTATIONS[category];
  courseHeroImage.src = planCoverUrl(plan);
  courseHeroImage.alt = `${plan.name}课程头图`;
  updateText(courseViewKicker, `${presentation.title.replace("训练", "力量")} · ${plan.level}`);
  updateText(courseViewTitle, plan.name);
  updateText(courseViewSummary, `${plan.durationMinutes} 分钟 · ${plan.steps.length} 个动作 · ${plan.equipment}`);
  updateText(courseDescriptionText, `${plan.description}${plan.evidenceBasis ? ` ${plan.evidenceBasis}` : ""}`);
  updateText(courseExerciseCount, `${plan.steps.length} 个动作`);

  const stats: Array<[string, string]> = [
    ["训练组数", `${workoutPlanTotalSets(plan)} 组`],
    ["训练强度", plan.intensity ?? plan.level],
    ["动作间休息", `${plan.transitionSeconds ?? 45} 秒`],
  ];
  courseStatGrid.replaceChildren();
  for (const [label, value] of stats) {
    const item = document.createElement("div");
    const span = document.createElement("span");
    span.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    item.append(span, strong);
    courseStatGrid.append(item);
  }

  courseExerciseList.replaceChildren();
  plan.steps.forEach((step, index) => {
    const profile = EXERCISE_PROFILES[step.exerciseId];
    const item = document.createElement("li");
    const preview = document.createElement("button");
    preview.type = "button";
    preview.className = "course-exercise-preview";
    preview.setAttribute("aria-label", `单独查看${profile.name}`);
    const imageUrl = profile.media.thumbnailUrl ?? profile.media.animationUrl;
    if (imageUrl) {
      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = "";
      image.loading = "lazy";
      preview.append(image);
    }
    preview.addEventListener("click", () => {
      trainingReturnView = "course";
      renderExercise(step.exerciseId);
      showView("training");
      cameraButton.focus();
    });
    const indexLabel = document.createElement("span");
    indexLabel.className = "course-exercise-index";
    indexLabel.textContent = String(index + 1).padStart(2, "0");
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = profile.name;
    const note = document.createElement("small");
    note.textContent = `${step.sets} 组 × ${formatWorkoutTarget(step.target)} · 休息 ${step.restSeconds} 秒`;
    copy.append(title, note);
    const status = document.createElement("span");
    status.className = "course-exercise-status";
    status.textContent = profile.available ? "实时纠正" : "示范";
    item.append(indexLabel, preview, copy, status);
    courseExerciseList.append(item);
  });
  showView("course");
}

function createPlanCard(plan: WorkoutPlan, compact = false): HTMLElement {
  const article = document.createElement("article");
  article.className = "plan-card";
  article.dataset.accent = plan.accent;

  const cover = document.createElement("div");
  cover.className = "plan-card-cover";
  cover.setAttribute("aria-label", `${plan.name}课程封面`);
  if (compact) {
    article.classList.add("compact-plan-card");
    const image = document.createElement("img");
    image.src = planCoverUrl(plan);
    image.alt = "";
    image.loading = "lazy";
    const coverShade = document.createElement("span");
    coverShade.className = "plan-card-cover-shade";
    const coverLabel = document.createElement("span");
    coverLabel.className = "plan-card-cover-label";
    coverLabel.textContent = `${plan.level} · ${plan.steps.length} 个动作`;
    cover.append(image, coverShade, coverLabel);
  }

  const header = document.createElement("div");
  header.className = "plan-card-header";
  const copy = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = plan.name;
  const description = document.createElement("p");
  description.textContent = plan.description;
  copy.append(title, description);
  const duration = document.createElement("span");
  duration.className = "plan-duration";
  duration.textContent = `${plan.durationMinutes}′`;
  duration.setAttribute("aria-label", `${plan.durationMinutes} 分钟`);
  header.append(copy, duration);

  const exercises = document.createElement("div");
  exercises.className = "plan-exercises";
  for (const step of plan.steps.slice(0, compact ? 4 : plan.steps.length)) {
    const tag = document.createElement("span");
    tag.textContent = exerciseName(step.exerciseId);
    exercises.append(tag);
  }

  const metadata = document.createElement("div");
  metadata.className = "plan-card-meta";
  const metadataItems: Array<[string, string]> = [
    ["强度", plan.intensity ?? plan.level],
    ["总组数", `${workoutPlanTotalSets(plan)} 组`],
    ["器械", plan.equipment],
  ];
  for (const [label, value] of metadataItems) {
    const item = document.createElement("span");
    const strong = document.createElement("strong");
    item.append(document.createTextNode(label), strong);
    strong.textContent = value;
    metadata.append(item);
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button-primary";
  button.textContent = "查看并开始";
  button.setAttribute("aria-label", `查看${plan.name}的完整安排并开始训练`);
  button.addEventListener("click", () => openCourseView(plan, currentView));
  if (compact) article.append(cover);
  article.append(header, exercises, metadata, button);
  return article;
}

function currentPlanPreferences(): {
  goal: PlanGoal;
  availableMinutes: number;
  equipment: PlanEquipmentPreference;
} {
  return {
    goal: planGoalSelect.value as PlanGoal,
    availableMinutes: Number(planMinutesSelect.value),
    equipment: planEquipmentSelect.value as PlanEquipmentPreference,
  };
}

function recommendedPlans(): ReturnType<typeof recommendWorkoutPlans> {
  return recommendWorkoutPlans(SCIENTIFIC_WORKOUT_PLANS, {
    profile: bodyProfileStore.load(preferences.weightKg),
    capacityRecords: capacityStore.load(),
    sessions: sessionStore.load(),
    ...currentPlanPreferences(),
  });
}

function renderRecommendedPlans(): void {
  const recommendations = recommendedPlans().slice(0, 3);
  planRecommendGrid.replaceChildren();
  homePlanGrid.replaceChildren();
  for (const item of recommendations) {
    planRecommendGrid.append(createPlanCard(item.plan));
    homePlanGrid.append(createPlanCard(item.plan, true));
  }
  const profile = bodyProfileStore.load(preferences.weightKg);
  const hasProfile = profile.heightCm !== null && profile.weightKg !== null;
  const first = recommendations[0];
  updateText(
    planRecommendNote,
    first
      ? `${hasProfile ? "已参考身体和训练记录" : "身体资料不完整，先按保守强度推荐"}：${first.reasons.join("；")}${first.caution ? `。${first.caution}` : ""}`
      : "当前条件下没有合适的固定计划，请调整可用时间或器械。",
  );
}

function renderSavedPlans(): void {
  const saved = customPlanStore.load();
  savedPlanGrid.replaceChildren();
  savedPlanSection.classList.toggle("hidden", saved.length === 0);
  for (const item of saved) {
    const card = createPlanCard(item.plan);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "plan-card-remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `取消收藏${item.plan.name}`);
    remove.addEventListener("click", () => {
      customPlanStore.remove(item.plan.id);
      renderSavedPlans();
      updateText(planBuilderStatus, "已从本机收藏中移除。你之后仍可重新生成。 ");
    });
    card.append(remove);
    savedPlanGrid.append(card);
  }
}

function renderGeneratedPlan(plan: WorkoutPlan, request: CustomPlanRequest): void {
  generatedCustomPlan = plan;
  generatedCustomRequest = request;
  const card = createPlanCard(plan);
  const nameLabel = document.createElement("label");
  nameLabel.className = "plan-generated-name";
  nameLabel.append(document.createTextNode("计划名称"));
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.maxLength = 24;
  nameInput.value = plan.name;
  nameInput.setAttribute("aria-label", "计划名称");
  nameInput.addEventListener("input", () => {
    const name = nameInput.value.trim() || plan.name;
    generatedCustomPlan = { ...plan, name };
    const heading = card.querySelector("h3");
    if (heading) updateText(heading, name);
    if (generatedCustomPlan && generatedCustomRequest) customPlanDraftStore.save(generatedCustomPlan, generatedCustomRequest);
  });
  nameLabel.append(nameInput);
  const actions = document.createElement("div");
  actions.className = "plan-generated-actions";
  const save = document.createElement("button");
  save.type = "button";
  save.className = "button button-accent";
  save.textContent = "收藏这套计划";
  save.addEventListener("click", () => {
    if (!generatedCustomPlan || !generatedCustomRequest) return;
    customPlanStore.save(generatedCustomPlan, generatedCustomRequest);
    customPlanDraftStore.clear();
    renderSavedPlans();
    updateText(planBuilderStatus, "已收藏到当前设备，下次打开可直接调用。 ");
    save.disabled = true;
    save.textContent = "已收藏";
  });
  const discard = document.createElement("button");
  discard.type = "button";
  discard.className = "button button-quiet";
  discard.textContent = "放弃草稿";
  discard.addEventListener("click", () => {
    customPlanDraftStore.clear();
    generatedCustomPlan = null;
    generatedCustomRequest = null;
    planGeneratedResult.replaceChildren();
    planGeneratedResult.classList.add("hidden");
    updateText(planBuilderStatus, "未收藏的计划草稿已删除。 ");
  });
  actions.append(save, discard);
  card.append(nameLabel, actions);
  planGeneratedResult.replaceChildren(card);
  planGeneratedResult.classList.remove("hidden");
}

function buildCustomRequest(): CustomPlanRequest {
  const preferences = currentPlanPreferences();
  const intensity: CustomPlanIntensity = preferences.availableMinutes <= 18
    ? "light"
    : preferences.availableMinutes >= 35 ? "high" : "moderate";
  return {
    prompt: planPrompt.value.trim(),
    goal: preferences.goal as CustomPlanGoal,
    intensity,
    equipment: preferences.equipment as CustomPlanEquipment,
    durationMinutes: preferences.availableMinutes,
  };
}

async function generatePlanFromPrompt(): Promise<void> {
  planGenerateButton.disabled = true;
  updateText(planBuilderStatus, "正在按目标、时间、器械和可执行动作组合……");
  try {
    const request = buildCustomRequest();
    const plan = await planModelProvider.generate(request);
    customPlanDraftStore.save(plan, request);
    renderGeneratedPlan(plan, request);
    updateText(planBuilderStatus, "已生成。先查看动作、组数和休息，再决定是否开始或收藏。 ");
  } catch {
    updateText(planBuilderStatus, "这次没有生成成功，请调整要求后重试。 ");
  } finally {
    planGenerateButton.disabled = false;
  }
}

function renderPlans(): void {
  planPageGrid.replaceChildren();
  for (const plan of SCIENTIFIC_WORKOUT_PLANS) planPageGrid.append(createPlanCard(plan));
  renderRecommendedPlans();
  renderSavedPlans();
}

function findAnyWorkoutPlan(id: string | undefined): WorkoutPlan | undefined {
  return findWorkoutPlan(id) ?? customPlanStore.load().find((item) => item.plan.id === id)?.plan;
}

function renderCalorieEquivalentOutputs(): void {
  historyCalorieEquivalent.value = calorieEquivalentKind;
  summaryCalorieEquivalent.value = calorieEquivalentKind;
  updateText(
    historyCalorieEquivalentOutput,
    formatCalorieEquivalent(cumulativeCalories, calorieEquivalentKind),
  );
  updateText(
    summaryCalorieEquivalentOutput,
    formatCalorieEquivalent(currentSummaryCalories ?? 0, calorieEquivalentKind),
  );
  const disclaimer = calorieEquivalentDisclaimer(calorieEquivalentKind);
  updateText(historyCalorieEquivalentNote, disclaimer);
  updateText(summaryCalorieEquivalentNote, disclaimer);
}

function changeCalorieEquivalent(kind: string): void {
  calorieEquivalentKind = calorieEquivalentStore.save(kind as CalorieEquivalentKind);
  renderCalorieEquivalentOutputs();
}

function renderDashboard(sessions: SessionSummary[]): void {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1_000;
  const recent = sessions.filter((session) => new Date(session.endedAt).getTime() >= weekAgo);
  const recentReps = recent.reduce((sum, session) => sum + session.totalReps, 0);
  const recentCalories = recent.reduce((sum, session) => sum + (session.estimatedCalories ?? 0), 0);
  const allReps = sessions.reduce((sum, session) => sum + session.totalReps, 0);
  const allCalories = sessions.reduce((sum, session) => sum + (session.estimatedCalories ?? 0), 0);
  cumulativeCalories = allCalories;

  updateText(homeWeekSessions, `${recent.length} 次`);
  updateText(homeWeekReps, `${recentReps} 次`);
  updateText(homeWeekCalories, recentCalories > 0 ? `${formatCalories(recentCalories)} 千卡` : "—");
  const hasHistory = sessions.length > 0;
  updateText(historyTotalSessions, hasHistory ? `${sessions.length} 次` : "尚未开始");
  updateText(historyTotalReps, hasHistory ? `${allReps} 次` : "尚未开始");
  updateText(historyTotalCalories, allCalories > 0 ? `${formatCalories(allCalories)} 千卡` : hasHistory ? "未估算" : "待训练");
  updateText(historySessionsNote, hasHistory ? `最近 7 天完成 ${recent.length} 次` : "完成训练后自动累计");
  updateText(historyRepsNote, hasHistory ? `最近 7 天完成 ${recentReps} 次` : "每次有效动作都会记录");
  updateText(historyCaloriesNote, allCalories > 0 ? "按体重和有效时长估算" : hasHistory ? "填写体重后可估算" : "按体重和有效时长估算");
  renderCalorieEquivalentOutputs();
  const weeklyProgress = weeklyProgressCopy(recent.length);
  updateText(planWeekCount, weeklyProgress.countText);
  updateText(planWeekNote, weeklyProgress.note);
  planWeekBar.style.width = `${weeklyProgress.percent}%`;

  const balanced = findWorkoutPlan("balanced");
  const range = balanced && preferences.weightKg !== null
    ? estimateCalorieRange(
      workoutPlanExercises(balanced),
      preferences.weightKg,
      balanced.durationMinutes * 60_000,
    )
    : null;
  updateText(
    homeCalories,
    range
      ? `按 ${preferences.weightKg} kg 估算：全身均衡约 ${Math.round(range.low)}–${Math.round(range.high)} 千卡`
      : "在“身体”中填写体重后显示热量估算",
  );
}

function applyPreferences(): void {
  document.body.classList.toggle("show-skeleton", preferences.showSkeleton);
  skeletonToggle.checked = preferences.showSkeleton;
}

function updateCoachPresentation(): void {
  const kind = feedback.getActiveKind();
  const tracking = kind === "tracking";
  const result = kind === "result";
  const correction = kind === "correction";
  coachOverlay.dataset.tone = tracking
    ? "tracking"
    : result
      ? "result"
      : correction
        ? "correction"
        : "guidance";
  updateText(
    coachLabel,
    tracking
      ? "识别提示"
      : result
        ? "动作评价"
        : correction
          ? "姿势纠正"
          : "动作指导",
  );
}

function setCoachMessage(
  message: string,
  announcedBySpeech = false,
  suppressLiveRegion = false,
): void {
  updateText(coachMessage, message);
  coachSpeaking.classList.toggle("speaking", announcedBySpeech);
  updateText(
    coachAnnouncer,
    announcedBySpeech || suppressLiveRegion ? "" : message,
  );
  updateCoachPresentation();
}

function syncVoiceControl(): void {
  const engine = feedback.getVoiceEngine();
  soundButton.dataset.engine = engine;
  if (engine === "unavailable") {
    feedback.setEnabled(false);
    soundButton.disabled = true;
    soundButton.setAttribute("aria-pressed", "false");
    updateText(soundLabel, "语音不可用");
    soundButton.title = "当前浏览器无法播放语音";
    voiceTestButton.disabled = true;
    voiceTestButton.title = "当前浏览器无法播放语音";
    return;
  }

  soundButton.disabled = false;
  voiceTestButton.disabled = false;
  soundButton.setAttribute("aria-pressed", String(feedback.isEnabled()));
  updateText(soundLabel, feedback.isEnabled() ? "语音开启" : "语音关闭");
  soundButton.title = engine === "local"
    ? "当前使用内置本地语音"
    : "当前使用系统语音";
  voiceTestButton.title = "播放一句中文语音，检查当前声音通道";
}

function handleVoicePlaybackError(): void {
  feedback.setEnabled(false);
  syncVoiceControl();
  setCoachMessage("语音暂不可用，画面提示仍会继续");
}

feedback.setPlaybackErrorHandler(handleVoicePlaybackError);

function setSystemState(
  state: "loading" | "ready" | "error" | "training",
  message: string,
): void {
  systemState.dataset.state = state;
  updateText(systemStateText, message);
}

function setCameraError(message: string | null): void {
  updateText(cameraError, message ?? "");
}

function syncActionAvailability(): void {
  const selectedAvailable = EXERCISE_PROFILES[selectedExercise].available;
  const workoutInProgress = sessionActive || freeSessionPaused || planRunner !== null;
  startButton.classList.toggle("hidden", workoutInProgress);
  startButton.disabled = !selectedAvailable || !modelReady || !cameraReady || workoutInProgress;
  updateText(startButton, structuredSingleSession ? "开始按组训练" : "开始自由训练");
  pauseSessionButton.classList.toggle("hidden", !workoutInProgress);
  pauseSessionButton.disabled = planRunner?.getSnapshot().phase === "complete";
  updateText(
    pauseSessionButton,
    planRunner?.getSnapshot().phase === "paused" || freeSessionPaused ? "继续训练" : "暂停训练",
  );
  saveProgressButton.classList.toggle("hidden", !workoutInProgress);
  saveProgressButton.disabled = !workoutInProgress;
  endButton.disabled = !workoutInProgress;
  updateText(endButton, "结束并保存");
  cameraButton.setAttribute(
    "aria-disabled",
    String(cameraStarting || workoutInProgress),
  );
  cameraButton.disabled = cameraStarting || workoutInProgress;
  for (const button of exerciseButtons) {
    button.disabled = workoutInProgress;
  }

  if (planRunner) {
    const snapshot = planRunner.getSnapshot();
    updateText(
      controlsHelp,
      snapshot.phase === "active"
        ? "计划训练进行中；达到本组目标后会自动进入休息。"
        : "整套计划进行中；可在画面中的控制区继续、延长休息或暂停。",
    );
  } else if (freeSessionPaused) {
    updateText(controlsHelp, "训练已暂停；继续后会接着记录。保存后可在「记录」页查看，数据仅存当前浏览器。");
  } else if (sessionActive) {
    updateText(controlsHelp, "训练进行中；可暂停或保存进度。保存后可在「记录」页查看，数据仅存当前浏览器。");
  } else if (!selectedAvailable) {
    updateText(controlsHelp, "该动作示范已审核，实时识别规则尚未开放；可以先查看动作轨迹、肌群和训练提示。");
  } else if (modelReady && cameraReady) {
    updateText(controlsHelp, "摄像头和动作模型已就绪，可以开始训练。");
  } else if (!modelReady && !cameraReady) {
    updateText(
      controlsHelp,
      "开始训练前，请先开启摄像头并等待动作模型加载完成。",
    );
  } else if (!modelReady) {
    updateText(controlsHelp, "摄像头已开启，正在等待动作模型加载完成。");
  } else {
    updateText(controlsHelp, "动作模型已就绪，请先开启摄像头。");
  }
}

function createAnalyzer(exerciseId: ExerciseId): ExerciseAnalyzer {
  if (exerciseId === "squat") return new SquatAnalyzer();
  if (exerciseId === "jumping-jack") return new JumpingJackAnalyzer();
  if (
    exerciseId === "reverse-lunge" ||
    exerciseId === "calf-raise" ||
    exerciseId === "high-knees" ||
    exerciseId === "push-up" ||
    exerciseId === "plank" ||
    exerciseId === "knee-push-up" ||
    exerciseId === "mountain-climber" ||
    exerciseId === "shoulder-tap" ||
    exerciseId === "side-plank" ||
    exerciseId === "burpee" ||
    exerciseId === "side-lunge" ||
    exerciseId === "glute-bridge" ||
    exerciseId === "bird-dog" ||
    exerciseId === "single-leg-deadlift" ||
    exerciseId === "dead-bug"
  ) {
    return new BodyweightAnalyzer(exerciseId as FirstBatchExerciseId);
  }
  if (
    exerciseId === "chair-pose" ||
    exerciseId === "warrior-two" ||
    exerciseId === "tree-pose" ||
    exerciseId === "downward-dog" ||
    exerciseId === "sumo-squat" ||
    exerciseId === "goblet-squat" ||
    exerciseId === "dumbbell-rdl" ||
    exerciseId === "dumbbell-shoulder-press" ||
    exerciseId === "dumbbell-lateral-raise" ||
    exerciseId === "dumbbell-biceps-curl"
  ) {
    return new ExpandedExerciseAnalyzer(exerciseId as RealtimeExpandedExerciseId);
  }
  // Pending exercises cannot start; keep an inert analyzer only for rendering.
  return new SquatAnalyzer();
}

function renderExercise(exerciseId: ExerciseId): void {
  const profile = EXERCISE_PROFILES[exerciseId];
  selectedExercise = exerciseId;
  analyzer = createAnalyzer(exerciseId);
  feedback.reset("先开启摄像头");
  for (const button of exerciseButtons) {
    const active = button.dataset.exercise === exerciseId;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  updateText(stageTitle, profile.stageTitle);
  updateText(stageViewNote, profile.preparation);
  updateText(cameraEmptyTitle, profile.cameraTitle);
  updateText(cameraEmptyDetail, profile.cameraDetail);
  const liveMediaUrl = exerciseId === "squat"
    ? "/assets/squat-anatomy-sequence.png"
    : exerciseId === "jumping-jack"
      ? "/assets/jumping-jack-anatomy-sequence.png"
      : profile.media.animationUrl ?? profile.media.thumbnailUrl;
  liveDemoMedia.classList.toggle("hidden", !liveMediaUrl);
  liveDemoPending.classList.toggle("hidden", Boolean(liveMediaUrl));
  if (liveMediaUrl) {
    liveDemoMedia.src = liveMediaUrl;
    liveDemoMedia.alt = `${profile.name}标准动作示范`;
  } else {
    liveDemoMedia.removeAttribute("src");
    liveDemoMedia.alt = "";
  }
  updateText(liveDemoName, profile.name);
  updateText(liveDemoPhase, "动作流程");
  updateText(guideTitle, `${profile.name}动作示范与发力`);
  squatDemo.classList.toggle("hidden", exerciseId !== "squat");
  jumpingJackDemo.classList.toggle("hidden", exerciseId !== "jumping-jack");
  const usesCatalogDemo = exerciseId !== "squat" && exerciseId !== "jumping-jack";
  catalogExerciseDemo.classList.toggle("hidden", !usesCatalogDemo);
  if (usesCatalogDemo) {
    const mediaUrl = profile.media.animationUrl ?? profile.media.thumbnailUrl;
    catalogExerciseMedia.classList.toggle("hidden", !mediaUrl);
    catalogMediaPending.classList.toggle("hidden", Boolean(mediaUrl));
    if (mediaUrl) {
      catalogExerciseMedia.src = mediaUrl;
      catalogExerciseMedia.alt = `${profile.name}真人解剖动作示范，主要训练${profile.primaryMuscles.join("、")}`;
    } else {
      catalogExerciseMedia.removeAttribute("src");
      catalogExerciseMedia.alt = "";
    }
    updateText(catalogDemoTitle, `${profile.name} · ${profile.category}`);
    updateText(
      catalogDemoStatus,
      profile.media.reviewStatus === "verified" ? "素材已核对" : "等待完全匹配素材",
    );
    updateText(catalogDemoAttribution, profile.media.attribution ?? "不使用相似但错误的图片");
  }
  updateText(primaryMuscles, profile.primaryMuscles.join("、"));
  updateText(secondaryMuscles, profile.secondaryMuscles.join("、"));
  updateText(activationCue, profile.activationCue);
  movementCheckpoints.replaceChildren();
  const teachingPoints = [
    ...profile.checkpoints,
    ...(profile.breathingCue
      ? [{ label: "呼吸", detail: profile.breathingCue }]
      : []),
    ...(profile.safetyNotes ?? []).map((detail, index) => ({
      label: index === 0 ? "准备" : "安全",
      detail,
    })),
    ...(profile.commonMistakes ?? []).map((mistake) => ({
      label: `避免·${mistake.label}`,
      detail: mistake.correction,
    })),
  ];
  for (const checkpoint of teachingPoints) {
    const item = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = checkpoint.label;
    const span = document.createElement("span");
    span.textContent = checkpoint.detail;
    item.append(strong, span);
    movementCheckpoints.append(item);
  }
  phaseRail.replaceChildren();
  for (const { phase, label } of profile.phases) {
    const item = document.createElement("span");
    item.dataset.phase = phase;
    item.textContent = label;
    phaseRail.append(item);
  }
  phaseRailItems = Array.from(phaseRail.querySelectorAll<HTMLElement>("[data-phase]"));
  updateText(primaryMetricLabel, profile.metricLabels[0]);
  updateText(secondaryMetricLabel, profile.metricLabels[1]);
  const timedHold = profile.mode === "timed-hold";
  updateText(totalRepsLabel, timedHold ? "有效保持" : "完成次数");
  updateText(qualifiedRepsLabel, timedHold ? "连续有效" : "合格次数");
  updateText(totalRepsNote, timedHold ? "姿势正确时才累计秒数" : "完整回到起始姿势才计数");
  document.title = `${profile.name}｜动作教练实验室`;
  resetMetrics();
  resetLastRep();
  setCoachMessage(cameraReady ? "已经看到人体，可以开始训练" : "先开启摄像头");
  for (const card of exerciseLibraryGrid.querySelectorAll<HTMLElement>("[data-library-exercise]")) {
    card.classList.toggle("active", card.dataset.libraryExercise === exerciseId);
    if (card.dataset.libraryExercise === exerciseId) {
      card.setAttribute("aria-current", "true");
    } else {
      card.removeAttribute("aria-current");
    }
  }
  renderSingleSessionSetup(true);
  syncActionAvailability();
}

function matchesHomeExerciseCategory(
  exerciseId: ExerciseId,
  category: HomeExerciseCategory,
): boolean {
  const profile = EXERCISE_PROFILES[exerciseId];
  const muscles = profile.primaryMuscles.join("、");
  if (category === "下肢") return /臀|股|腿|腘|小腿|腓|内收|髋/.test(muscles);
  if (category === "胸肩") return /胸|三角肌|肩部|肩/.test(muscles);
  if (category === "背部") return /背|竖脊|菱形|斜方/.test(muscles);
  if (category === "核心") return /腹|核心/.test(muscles);
  return profile.category === "全身有氧";
}

function renderExerciseLibrary(
  category: ExerciseCategory | "全部" = "全部",
  homeCategory?: HomeExerciseCategory,
): void {
  exerciseLibraryGrid.replaceChildren();
  for (const exerciseId of EXERCISE_ORDER) {
    const profile = EXERCISE_PROFILES[exerciseId];
    const categoryMatches = homeCategory
      ? matchesHomeExerciseCategory(exerciseId, homeCategory)
      : category === "全部" || profile.category === category;
    if (!categoryMatches) continue;

    const card = document.createElement("button");
    card.type = "button";
    card.className = "exercise-library-card";
    card.dataset.libraryExercise = exerciseId;
    const reviewLabel = profile.available
      ? "可实时纠正"
      : profile.media.reviewStatus === "verified"
        ? "动作示范已审核，识别规则待开放"
        : "动作示范制作中";
    card.setAttribute("aria-label", `${profile.name}，主要训练${profile.primaryMuscles.join("、")}，${reviewLabel}`);

    const visual = document.createElement("span");
    visual.className = "exercise-card-visual";
    const preview = profile.media.thumbnailUrl ?? profile.media.animationUrl;
    if (preview) {
      const image = document.createElement("img");
      image.src = preview;
      image.alt = "";
      image.loading = "lazy";
      visual.append(image);
    } else {
      const monogram = document.createElement("span");
      monogram.className = "muscle-monogram";
      monogram.textContent = profile.primaryMuscles[0]?.slice(0, 2) ?? "训练";
      visual.append(monogram);
    }
    const categoryLabel = document.createElement("span");
    categoryLabel.className = "exercise-card-category";
    categoryLabel.textContent = profile.category;
    visual.append(categoryLabel);

    const body = document.createElement("span");
    body.className = "exercise-card-body";
    const titleRow = document.createElement("span");
    titleRow.className = "exercise-card-title-row";
    const title = document.createElement("strong");
    title.textContent = profile.name;
    const status = document.createElement("span");
    status.className = "exercise-card-status";
    status.dataset.state = profile.available ? "ready" : "review";
    status.textContent = profile.available
      ? "可实时纠正"
      : profile.media.reviewStatus === "verified"
        ? "示范已审核"
        : "素材制作中";
    titleRow.append(title, status);

    const muscles = document.createElement("span");
    muscles.className = "exercise-card-muscles";
    const main = document.createElement("span");
    main.textContent = `主要｜${profile.primaryMuscles.join("、")}`;
    const support = document.createElement("small");
    support.textContent = `辅助｜${profile.secondaryMuscles.join("、")}`;
    muscles.append(main, support);
    const equipmentNames = {
      none: "无需器械",
      "single-dumbbell": "单只哑铃",
      "pair-dumbbells": "一对哑铃",
      "single-or-pair": "单只或一对哑铃",
      "resistance-band": "弹力带",
    } as const;
    const metadata = document.createElement("span");
    metadata.className = "exercise-card-metadata";
    const equipment = document.createElement("small");
    equipment.textContent = profile.equipment
      ? [equipmentNames[profile.equipment], ...(profile.additionalEquipment ?? [])].join(" · ")
      : "徒手训练";
    const difficulty = document.createElement("small");
    difficulty.textContent = profile.difficulty ?? "入门";
    metadata.append(equipment, difficulty);
    body.append(titleRow, muscles, metadata);
    card.append(visual, body);
    card.addEventListener("click", () => {
      if (sessionActive) return;
      trainingReturnView = "library";
      renderExercise(exerciseId);
      showView("training");
      cameraButton.focus();
    });
    exerciseLibraryGrid.append(card);
  }
}

function initializeWorker(): void {
  poseWorker?.terminate();
  poseWorker = new Worker(new URL("./pose-worker.ts", import.meta.url), {
    type: "module",
  });
  modelReady = false;
  inferencePending = false;
  inferenceGeneration = null;
  retryModelButton.classList.add("hidden");
  modelLoading.classList.remove("hidden");
  setSystemState("loading", "正在加载动作模型");
  syncActionAvailability();

  poseWorker.onmessage = (event: MessageEvent<PoseWorkerResponse>) => {
    const message = event.data;

    if (message.type === "status") {
      setSystemState("loading", message.message);
      return;
    }

    if (message.type === "ready") {
      modelReady = true;
      modelLoading.classList.add("hidden");
      setSystemState("ready", "动作模型已就绪");
      syncActionAvailability();
      if (planPendingCameraStart && cameraReady) startPlanSet();
      if (cameraReady && document.activeElement === cameraButton) {
        startButton.focus();
      }
      return;
    }

    if (message.type === "error") {
      const failedGeneration = inferenceGeneration;
      inferencePending = false;
      inferenceGeneration = null;
      if (
        modelReady &&
        failedGeneration !== null &&
        failedGeneration !== captureGeneration
      ) {
        return;
      }
      if (!modelReady) {
        modelLoading.classList.add("hidden");
        retryModelButton.classList.remove("hidden");
        setSystemState("error", "动作模型加载失败");
        setCameraError(
          "动作模型没有加载成功，请确认网络可用后重新加载。",
        );
      } else {
        setSystemState("error", "当前画面识别失败，正在继续");
      }
      syncActionAvailability();
      return;
    }

    const resultGeneration = inferenceGeneration;
    inferencePending = false;
    inferenceGeneration = null;
    if (
      !cameraReady ||
      resultGeneration === null ||
      resultGeneration !== captureGeneration
    ) {
      return;
    }
    lastPose = message.poses[0] ?? null;
    recordLatency(message.timestamp, message.inferenceMs);
    drawPose(lastPose);

    if (sessionActive) {
      lastAnalysis = analyzer.analyze(lastPose, message.timestamp);
      renderAnalysis(lastAnalysis);
    } else if (!planRunner && !freeSessionPaused) {
      setCoachMessage(
        lastPose
          ? "已经看到人体，可以开始训练"
          : "请站到画面中央，让全身进入画面",
      );
    }

    if (systemState.dataset.state === "error" && modelReady) {
      setSystemState(
        sessionActive ? "training" : "ready",
        sessionActive ? "正在本机分析动作" : "动作模型已就绪",
      );
    }
  };

  poseWorker.onerror = () => {
    modelReady = false;
    inferencePending = false;
    inferenceGeneration = null;
    modelLoading.classList.add("hidden");
    retryModelButton.classList.remove("hidden");
    setSystemState("error", "动作识别线程启动失败");
    setCameraError("当前浏览器无法启动动作识别，请使用最新版 Chrome 或 Edge。");
    syncActionAvailability();
  };
}

async function startCamera(): Promise<void> {
  if (cameraReady || cameraStarting) {
    return;
  }
  setCameraError(null);

  if (!navigator.mediaDevices?.getUserMedia) {
    setCameraError("当前浏览器不支持摄像头访问，请使用最新版 Chrome 或 Edge。");
    return;
  }

  const generation = ++captureGeneration;
  cameraStarting = true;
  cameraButton.textContent = "正在开启…";
  syncActionAvailability();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
        facingMode: "user",
      },
    });
    if (generation !== captureGeneration) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    mediaStream = stream;
    video.srcObject = mediaStream;
    await video.play();
    if (generation !== captureGeneration) {
      stream.getTracks().forEach((track) => track.stop());
      if (video.srcObject === stream) {
        video.srcObject = null;
      }
      return;
    }
    resizeCanvas();
    cameraStarting = false;
    cameraReady = true;
    captureFailureCount = 0;
    cameraFrame.classList.add("camera-on");
    cameraEmpty.classList.add("hidden");
    cameraButton.textContent = "关闭摄像头";
    setCoachMessage("站到画面中央，让全身进入画面");
    const activeStream = mediaStream;
    for (const track of activeStream.getVideoTracks()) {
      track.addEventListener(
        "ended",
        () => {
          if (mediaStream === activeStream) {
            handleCameraInterruption("摄像头连接已中断，请检查设备后重新开启。");
          }
        },
        { once: true },
      );
    }
    syncActionAvailability();
    if (planPendingCameraStart && modelReady) startPlanSet();
    if (modelReady && document.activeElement === cameraButton) {
      startButton.focus();
    }
    startCaptureLoop(generation);
  } catch (error) {
    if (generation !== captureGeneration) {
      return;
    }
    mediaStream?.getTracks().forEach((track) => track.stop());
    mediaStream = null;
    video.srcObject = null;
    cameraStarting = false;
    cameraReady = false;
    cameraButton.textContent = "重新开启摄像头";
    setCameraError(cameraErrorMessage(error));
    setSystemState("error", "摄像头开启失败");
    syncActionAvailability();
  }
}

function stopCamera(): void {
  captureGeneration += 1;
  cameraReady = false;
  cameraStarting = false;
  captureFailureCount = 0;
  cancelAnimationFrame(captureAnimationFrame);
  captureAnimationFrame = 0;
  if (
    captureVideoFrameCallback !== 0 &&
    typeof video.cancelVideoFrameCallback === "function"
  ) {
    video.cancelVideoFrameCallback(captureVideoFrameCallback);
  }
  captureVideoFrameCallback = 0;
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;
  video.pause();
  video.srcObject = null;
  if (!inferencePending) {
    inferenceGeneration = null;
  }
  lastCaptureAt = 0;
  lastPose = null;
  canvasContext.clearRect(0, 0, canvas.width, canvas.height);
  cameraFrame.classList.remove("camera-on");
  cameraEmpty.classList.remove("hidden");
  cameraButton.textContent = "开启摄像头";
  syncActionAvailability();
}

function handleCameraInterruption(message: string): void {
  if (planRunner) {
    finishWorkoutPlan(false);
  } else if (sessionActive || freeSessionPaused) {
    endSession();
  } else {
    stopCamera();
  }
  setSystemState("error", "摄像头连接已中断");
  setCameraError(message);
  setCoachMessage("摄像头已中断，动作计数已停止");
}

function cameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "摄像头权限被拒绝。请在浏览器地址栏允许摄像头后重试。";
    }
    if (error.name === "NotFoundError") {
      return "没有找到可用摄像头，请连接摄像头后重试。";
    }
    if (error.name === "NotReadableError") {
      return "摄像头正在被其他应用占用，请关闭占用程序后重试。";
    }
  }
  return "摄像头开启失败，请检查浏览器权限和设备连接。";
}

function resizeCanvas(): void {
  if (!video.videoWidth || !video.videoHeight) {
    return;
  }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
}

function startCaptureLoop(generation: number): void {
  cancelAnimationFrame(captureAnimationFrame);
  captureAnimationFrame = 0;
  if (
    captureVideoFrameCallback !== 0 &&
    typeof video.cancelVideoFrameCallback === "function"
  ) {
    video.cancelVideoFrameCallback(captureVideoFrameCallback);
  }
  captureVideoFrameCallback = 0;

  const capture = async (timestamp: number): Promise<void> => {
    if (
      cameraReady &&
      !document.hidden &&
      generation === captureGeneration &&
      modelReady &&
      !inferencePending &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      inferencePending = true;
      inferenceGeneration = generation;
      lastCaptureAt = timestamp;
      let bitmap: ImageBitmap | null = null;
      try {
        bitmap = await createImageBitmap(video);
        if (
          !cameraReady ||
          generation !== captureGeneration ||
          inferenceGeneration !== generation
        ) {
          bitmap.close();
          if (inferenceGeneration === generation) {
            inferencePending = false;
            inferenceGeneration = null;
          }
          return;
        }
        captureFailureCount = 0;
        const request: PoseWorkerRequest = {
          type: "frame",
          bitmap,
          timestamp,
        };
        if (!poseWorker) {
          bitmap.close();
          inferencePending = false;
          inferenceGeneration = null;
        } else {
          poseWorker.postMessage(request, [bitmap]);
        }
      } catch {
        bitmap?.close();
        if (inferenceGeneration === generation) {
          inferencePending = false;
          inferenceGeneration = null;
        }
        if (!cameraReady || generation !== captureGeneration) {
          return;
        }
        captureFailureCount += 1;
        if (captureFailureCount >= 3) {
          handleCameraInterruption(
            "连续读取摄像头画面失败，请检查设备后重新开启。",
          );
        }
      }
    }
  };

  if (typeof video.requestVideoFrameCallback === "function") {
    const scheduleVideoFrame = (): void => {
      if (!cameraReady || generation !== captureGeneration) {
        return;
      }
      captureVideoFrameCallback = video.requestVideoFrameCallback(
        (_now, metadata) => {
          captureVideoFrameCallback = 0;
          void capture(metadata.presentationTime);
          scheduleVideoFrame();
        },
      );
    };
    scheduleVideoFrame();
    return;
  }

  const captureFallback = (timestamp: number): void => {
    captureAnimationFrame = 0;
    if (!cameraReady || generation !== captureGeneration) {
      return;
    }
    if (timestamp - lastCaptureAt >= FALLBACK_CAPTURE_INTERVAL_MS) {
      void capture(timestamp);
    }
    captureAnimationFrame = requestAnimationFrame(captureFallback);
  };

  captureAnimationFrame = requestAnimationFrame(captureFallback);
}

function drawPose(pose: DetectedPose | null): void {
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    resizeCanvas();
  }
  canvasContext.clearRect(0, 0, canvas.width, canvas.height);
  if (!pose || !preferences.showSkeleton) {
    return;
  }

  canvasContext.lineCap = "round";
  canvasContext.lineJoin = "round";
  canvasContext.lineWidth = Math.max(3, canvas.width / 360);
  canvasContext.strokeStyle = "rgba(108, 224, 213, 0.9)";
  canvasContext.shadowColor = "rgba(108, 224, 213, 0.35)";
  canvasContext.shadowBlur = 12;

  for (const [fromIndex, toIndex] of POSE_CONNECTIONS) {
    const from = pose.landmarks[fromIndex];
    const to = pose.landmarks[toIndex];
    if (
      !from ||
      !to ||
      from.visibility < DRAW_VISIBILITY_THRESHOLD ||
      to.visibility < DRAW_VISIBILITY_THRESHOLD
    ) {
      continue;
    }
    canvasContext.beginPath();
    canvasContext.moveTo(from.x * canvas.width, from.y * canvas.height);
    canvasContext.lineTo(to.x * canvas.width, to.y * canvas.height);
    canvasContext.stroke();
  }

  canvasContext.shadowBlur = 0;
  for (const [index, point] of pose.landmarks.entries()) {
    if (point.visibility < DRAW_VISIBILITY_THRESHOLD) {
      continue;
    }
    const lowerBody = [23, 24, 25, 26, 27, 28, 29, 30, 31, 32].includes(index);
    canvasContext.fillStyle = lowerBody ? "#ff7b50" : "#f7fbfa";
    canvasContext.beginPath();
    canvasContext.arc(
      point.x * canvas.width,
      point.y * canvas.height,
      lowerBody ? 5.5 : 4,
      0,
      Math.PI * 2,
    );
    canvasContext.fill();
  }
}

function formatPlanClock(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return String(seconds);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function planPhaseName(phase: PlanPhase): string {
  return ({
    idle: "准备计划",
    warmup: "训练前热身",
    preparing: "准备开始",
    active: "本组训练",
    resting: "组间休息",
    paused: "计划已暂停",
    cooldown: "结束放松",
    complete: "训练完成",
  })[phase];
}

function planSideCue(exerciseId: ExerciseId, setIndex: number): string {
  if (exerciseId !== "side-plank") return "";
  return setIndex % 2 === 0 ? " · 左侧" : " · 右侧";
}

function upcomingPlanLabel(): string {
  if (!planRunner) return "";
  const snapshot = planRunner.getSnapshot();
  if (snapshot.phase === "resting" || snapshot.phase === "preparing") {
    return `接下来：${exerciseName(snapshot.currentStep.exerciseId)}第 ${snapshot.setIndex + 1} 组`;
  }
  const step = snapshot.currentStep;
  if (snapshot.setIndex + 1 < step.sets) {
    return `下一组：${exerciseName(step.exerciseId)}第 ${snapshot.setIndex + 2} 组`;
  }
  const nextStep = planRunner.plan.steps[snapshot.stepIndex + 1];
  return nextStep ? `下一动作：${exerciseName(nextStep.exerciseId)}` : "完成本组后进入放松";
}

function updatePlanInterface(now = Date.now()): void {
  if (!planRunner) {
    planSessionBar.classList.add("hidden");
    planPhaseOverlay.classList.add("hidden");
    return;
  }
  const snapshot = planRunner.getSnapshot(now);
  const step = snapshot.currentStep;
  const exercise = exerciseName(step.exerciseId);
  planSessionBar.classList.remove("hidden");
  updateText(
    planSessionKicker,
    isSingleExercisePlan(planRunner.plan) ? `按组训练 · ${planPhaseName(snapshot.phase)}` : planPhaseName(snapshot.phase),
  );
  updateText(planSessionName, planRunner.plan.name);
  updateText(planSessionNext, upcomingPlanLabel());
  updateText(planSessionSet, `第 ${snapshot.setIndex + 1} / ${step.sets} 组`);
  updateText(planSessionExercise, exercise);
  updateText(
    planSessionGoal,
    `目标 ${formatWorkoutTarget(step.target)}${planSideCue(step.exerciseId, snapshot.setIndex)}`,
  );
  updateText(planSessionCompleted, String(snapshot.completedSets));
  updateText(planSessionTotal, String(snapshot.totalSets));
  planSessionProgressBar.style.width = `${snapshot.progressPercent}%`;
  updateText(planSessionPause, snapshot.phase === "paused" ? "继续" : "暂停");

  const waitingForCamera = snapshot.phase === "active" && !sessionActive;
  const showOverlay = snapshot.phase !== "active" || waitingForCamera;
  planPhaseOverlay.classList.toggle("hidden", !showOverlay);
  setDemoIdleState(showOverlay);
  if (!showOverlay) return;

  planExtendRest.classList.toggle("hidden", snapshot.phase !== "resting");
  planPause.classList.toggle(
    "hidden",
    snapshot.phase === "preparing" || snapshot.phase === "paused" || waitingForCamera,
  );
  planPhasePrimary.classList.remove("hidden");
  planPhasePrimary.disabled = false;

  if (waitingForCamera) {
    updateText(planPhaseLabel, "摄像头准备中");
    updateText(planPhaseTime, "···");
    updateText(planPhaseTitle, "正在准备动作识别");
    updateText(planPhaseDetail, "摄像头和模型就绪后，本组会自动开始，不会消耗你的动作次数。");
    updateText(planPhasePrimary, "等待就绪");
    planPhasePrimary.disabled = true;
    return;
  }

  updateText(planPhaseLabel, planPhaseName(snapshot.phase));
  updateText(planPhaseTime, formatPlanClock(snapshot.remainingSeconds));
  if (snapshot.phase === "warmup") {
    updateText(planPhaseTitle, "活动肩、髋、膝和脚踝");
    updateText(planPhaseDetail, "轻松原地踏步并活动关节；身体暖起来后可以提前开始。");
    updateText(planPhasePrimary, "热身完成，开始训练");
  } else if (snapshot.phase === "preparing") {
    updateText(planPhaseTitle, `准备 ${exercise}`);
    updateText(
      planPhaseDetail,
      `第 ${snapshot.setIndex + 1} / ${step.sets} 组 · 目标 ${formatWorkoutTarget(step.target)}${planSideCue(step.exerciseId, snapshot.setIndex)}`,
    );
    updateText(planPhasePrimary, "立即开始本组");
  } else if (snapshot.phase === "resting") {
    updateText(planPhaseTitle, `下一组：${exercise}`);
    updateText(
      planPhaseDetail,
      `第 ${snapshot.setIndex + 1} / ${step.sets} 组 · 目标 ${formatWorkoutTarget(step.target)}${planSideCue(step.exerciseId, snapshot.setIndex)}`,
    );
    updateText(planPhasePrimary, "立即开始下一组");
  } else if (snapshot.phase === "paused") {
    updateText(planPhaseTime, "Ⅱ");
    updateText(planPhaseTitle, "训练已暂停");
    updateText(planPhaseDetail, "摄像头仍然开启，但动作不会计数。准备好后继续。");
    updateText(planPhasePrimary, "继续训练");
  } else if (snapshot.phase === "cooldown") {
    updateText(planPhaseTitle, "放慢呼吸，舒展刚刚训练的部位");
    updateText(planPhaseDetail, "保持轻松，不需要追求拉伸幅度；也可以提前查看整套总结。");
    updateText(planPhasePrimary, "结束并查看总结");
  }

  const announcementKey = `${snapshot.phase}:${snapshot.remainingSeconds}`;
  if (
    snapshot.phase === "resting" &&
    (snapshot.remainingSeconds === 10 || snapshot.remainingSeconds === 3) &&
    planCountdownAnnouncement !== announcementKey
  ) {
    planCountdownAnnouncement = announcementKey;
    const message = snapshot.remainingSeconds === 10 ? "还有十秒" : "还有三秒";
    updateText(planPhaseAnnouncer, message);
    feedback.speakNow(message);
  }
}

function startPlanTimer(): void {
  window.clearInterval(planTimer);
  planTimer = window.setInterval(() => {
    if (!planRunner) return;
    const previous = planRunner.getSnapshot().phase;
    const changed = planRunner.tick();
    const next = planRunner.getSnapshot().phase;
    if (changed && previous !== next) handlePlanPhaseTransition(previous, next);
    updatePlanInterface();
  }, 250);
}

function handlePlanPhaseTransition(previous: PlanPhase, next: PlanPhase): void {
  planCountdownAnnouncement = "";
  if (next === "preparing") {
    const message = previous === "resting" ? "休息结束，三秒后开始" : "三秒后开始第一组";
    updateText(planPhaseAnnouncer, message);
    feedback.speakNow(message);
  } else if (next === "active") {
    setDemoIdleState(false);
    startPlanSet();
  } else if (next === "complete") {
    setDemoIdleState(false);
    finishWorkoutPlan(true);
  }
}

async function beginWorkoutPlan(plan: WorkoutPlan): Promise<void> {
  const firstStep = plan.steps[0];
  if (!firstStep) return;
  const singleExercise = isSingleExercisePlan(plan);
  planRunner = new WorkoutPlanRunner(plan);
  if (!singleExercise) trainingReturnView = selectedCourse?.id === plan.id ? "course" : "plan";
  sessionRecordId = `session-${Date.now()}`;
  freeSessionPaused = false;
  planRunner.start();
  if (singleExercise) planRunner.skipWarmup();
  planSetSummaries = [];
  planTotalActiveDurationMs = 0;
  planLatencySamples.length = 0;
  planCountdownAnnouncement = "";
  document.body.classList.add("plan-mode");
  renderExercise(firstStep.exerciseId);
  showView("training", false);
  summaryPanel.classList.add("hidden");
  updatePlanInterface();
  syncActionAvailability();
  startPlanTimer();
  const startSpeech = singleExercise
    ? `${plan.name}，三秒后开始第一组`
    : `开始${plan.name}，先热身两分钟`;
  const spoken = feedback.speakNow(startSpeech);
  setCoachMessage(
    singleExercise ? `${plan.name}已载入，三秒后开始第一组` : "先活动肩、髋、膝和脚踝，身体暖起来后开始第一组",
    spoken,
  );
  updateText(planPhaseAnnouncer, startSpeech);
  await startCamera();
  if (planRunner?.plan.id === plan.id) updatePlanInterface();
}

function startPlanSet(): void {
  if (!planRunner) return;
  const snapshot = planRunner.getSnapshot();
  if (snapshot.phase !== "active") return;
  if (!cameraReady || !modelReady) {
    planPendingCameraStart = true;
    updatePlanInterface();
    return;
  }
  planPendingCameraStart = false;
  if (selectedExercise !== snapshot.currentStep.exerciseId) {
    renderExercise(snapshot.currentStep.exerciseId);
  }
  analyzer = createAnalyzer(snapshot.currentStep.exerciseId);
  feedback.reset();
  lastAnalysis = null;
  sessionActive = true;
  sessionActiveDurationMs = 0;
  lastAnalysisRenderAt = null;
  lastExerciseMotionAt = performance.now();
  idleGuidance.reset(lastExerciseMotionAt);
  document.body.classList.add("session-running");
  cameraFrame.classList.add("session-active");
  setSystemState("training", `计划训练 · ${exerciseName(snapshot.currentStep.exerciseId)}`);
  resetMetrics();
  resetLastRep();
  const message = `${exerciseName(snapshot.currentStep.exerciseId)}第${snapshot.setIndex + 1}组，目标${formatWorkoutTarget(snapshot.currentStep.target)}`;
  const spoken = feedback.speakNow(message);
  setCoachMessage(`${message}；${EXERCISE_PROFILES[snapshot.currentStep.exerciseId].preparation}`, spoken);
  updatePlanInterface();
  syncActionAvailability();
}

function planTargetReached(analysis: FrameAnalysis): boolean {
  if (!planRunner || planRunner.getSnapshot().phase !== "active") return false;
  const target = planRunner.getSnapshot().currentStep.target;
  return target.kind === "seconds"
    ? (analysis.validHoldMs ?? 0) >= target.value * 1_000
    : analysis.totalReps >= target.value;
}

function buildCurrentSetSummary(): SessionSummary {
  const response = summarizeLatency(sessionLatencySamples);
  const estimatedCalories = preferences.weightKg === null
    ? null
    : estimateCalories({
      exerciseId: selectedExercise,
      weightKg: preferences.weightKg,
      activeDurationMs: sessionActiveDurationMs,
    });
  return {
    ...analyzer.getSummary(),
    averageResponseMs: response?.averageMs ?? null,
    p95ResponseMs: response?.p95Ms ?? null,
    activeDurationMs: sessionActiveDurationMs,
    estimatedCalories,
    weightKgAtSession: preferences.weightKg,
  };
}

function completePlanSet(): void {
  if (!planRunner || !sessionActive) return;
  const before = planRunner.getSnapshot();
  planSetSummaries.push(buildCurrentSetSummary());
  planTotalActiveDurationMs += sessionActiveDurationMs;
  sessionActive = false;
  document.body.classList.remove("session-running");
  cameraFrame.classList.remove("session-active");
  planRunner.markSetComplete();
  const after = planRunner.getSnapshot();
  if (after.phase === "cooldown" && isSingleExercisePlan(planRunner.plan)) {
    planRunner.skipCooldown();
    finishWorkoutPlan(true);
    return;
  }
  feedback.reset(`第${before.setIndex + 1}组完成`);
  const completedMessage = `第${before.setIndex + 1}组完成`;
  setCoachMessage(
    after.phase === "cooldown"
      ? `${completedMessage}，整套主要训练已完成`
      : `${completedMessage}，休息${before.currentStep.restSeconds}秒`,
    feedback.speakNow(after.phase === "cooldown"
      ? "主要训练完成，进入放松"
      : `${completedMessage}，休息${before.currentStep.restSeconds}秒`),
  );
  updatePlanInterface();
  syncActionAvailability();
}

function mergePlanIssueCounts(summaries = planSetSummaries): SessionSummary["issueCounts"] {
  const merged: SessionSummary["issueCounts"] = {};
  for (const summary of summaries) {
    for (const [key, count] of Object.entries(summary.issueCounts)) {
      merged[key as keyof SessionSummary["issueCounts"]] =
        (merged[key as keyof SessionSummary["issueCounts"]] ?? 0) + (count ?? 0);
    }
  }
  return merged;
}

function buildWorkoutPlanSummary(
  runner: WorkoutPlanRunner,
  completed: boolean,
): SessionSummary {
  const firstStep = runner.plan.steps[0];
  if (!firstStep) throw new Error("训练计划至少需要一个动作");
  const snapshot = runner.getSnapshot();
  const summaries = [...planSetSummaries];
  let activeDurationMs = planTotalActiveDurationMs;
  const hasCurrentSetProgress = sessionActive ||
    (snapshot.phase === "paused" && snapshot.pausedFrom === "active");
  if (hasCurrentSetProgress) {
    const partial = buildCurrentSetSummary();
    if (partial.totalReps > 0 || (partial.validDurationMs ?? 0) > 0) summaries.push(partial);
    activeDurationMs += sessionActiveDurationMs;
  }
  const response = summarizeLatency(planLatencySamples);
  const restCounts = { fast: 0, standard: 0, extended: 0 };
  for (const record of runner.restRecords) restCounts[record.pace] += 1;
  const averageRestSeconds = runner.restRecords.length
    ? runner.restRecords.reduce((sum, record) => sum + record.actualSeconds, 0) / runner.restRecords.length
    : null;
  const tempos = summaries
    .map((summary) => summary.averageTempoSeconds)
    .filter((value): value is number => value !== null);
  const totalRepsValue = summaries.reduce((sum, item) => sum + item.totalReps, 0);
  const qualifiedRepsValue = summaries.reduce((sum, item) => sum + item.qualifiedReps, 0);
  const validDurationMs = summaries.reduce((sum, item) => sum + (item.validDurationMs ?? 0), 0);
  const calories = summaries.reduce((sum, item) => sum + (item.estimatedCalories ?? 0), 0);
  return {
    id: sessionRecordId ?? `plan-${Date.now()}`,
    endedAt: new Date().toISOString(),
    totalReps: totalRepsValue,
    qualifiedReps: qualifiedRepsValue,
    averageTempoSeconds: tempos.length
      ? tempos.reduce((sum, value) => sum + value, 0) / tempos.length
      : null,
    averageResponseMs: response?.averageMs ?? null,
    p95ResponseMs: response?.p95Ms ?? null,
    exerciseId: firstStep.exerciseId,
    issueCounts: mergePlanIssueCounts(summaries),
    validDurationMs,
    activeDurationMs,
    estimatedCalories: preferences.weightKg === null ? null : calories,
    weightKgAtSession: preferences.weightKg,
    planId: runner.plan.id,
    planName: runner.plan.name,
    planCompletedSets: snapshot.completedSets,
    planTotalSets: snapshot.totalSets,
    planCompleted: completed && snapshot.completedSets === snapshot.totalSets,
    averageRestSeconds,
    restPaceCounts: restCounts,
  };
}

function finishWorkoutPlan(completed: boolean): void {
  if (!planRunner) return;
  const runner = planRunner;
  const snapshot = runner.getSnapshot();
  const summary = buildWorkoutPlanSummary(runner, completed);
  window.clearInterval(planTimer);
  planTimer = 0;
  planRunner = null;
  planPendingCameraStart = false;
  sessionActive = false;
  freeSessionPaused = false;
  document.body.classList.remove("plan-mode", "session-running", "free-session-paused");
  cameraFrame.classList.remove("session-active");
  planSessionBar.classList.add("hidden");
  planPhaseOverlay.classList.add("hidden");
  setDemoIdleState(false);
  stopCamera();
  feedback.reset("训练结束");
  const hasSavedResult = snapshot.completedSets > 0 || summary.totalReps > 0 ||
    (summary.validDurationMs ?? 0) > 0;
  const finishMessage = completed
    ? `${summary.planName}已完成，结果已保存`
    : hasSavedResult
      ? `${summary.planName}已结束，当前结果已保存`
      : `${summary.planName}已结束，本次没有有效训练数据`;
  const finishWasSpoken = feedback.speakNow(finishMessage);
  setCoachMessage(finishMessage, finishWasSpoken);
  setSystemState("ready", `${summary.planName}已结束 · 摄像头已关闭`);
  renderSummary(summary);
  summaryPanel.classList.remove("hidden");
  if (hasSavedResult) {
    renderHistory(sessionStore.upsert(summary));
  }
  sessionRecordId = null;
  syncActionAvailability();
  showView("summary", false);
  summaryPanel.focus();
}

function pauseWorkoutPlan(): void {
  if (!planRunner) return;
  if (planRunner.getSnapshot().phase === "paused") {
    resumeWorkoutPlan();
    return;
  }
  planRunner.pause();
  if (sessionActive) {
    sessionActive = false;
    lastAnalysisRenderAt = null;
    document.body.classList.remove("session-running");
    cameraFrame.classList.remove("session-active");
  }
  feedback.reset("训练已暂停");
  updateText(planPhaseAnnouncer, "训练已暂停");
  setCoachMessage("训练已暂停，摄像头仍然开启，但动作不会计数");
  updatePlanInterface();
  syncActionAvailability();
}

function resumeWorkoutPlan(): void {
  if (!planRunner || planRunner.getSnapshot().phase !== "paused") return;
  const pausedFrom = planRunner.getSnapshot().pausedFrom;
  planRunner.resume();
  const resumed = planRunner.getSnapshot().phase;
  if (resumed === "active" && pausedFrom === "active") {
    sessionActive = true;
    lastAnalysisRenderAt = null;
    document.body.classList.add("session-running");
    cameraFrame.classList.add("session-active");
    setSystemState("training", `计划训练 · ${exerciseName(selectedExercise)}`);
  }
  feedback.speakNow("继续训练");
  updateText(planPhaseAnnouncer, "继续训练");
  updatePlanInterface();
  syncActionAvailability();
}

function toggleCurrentSessionPause(): void {
  if (planRunner) {
    pauseWorkoutPlan();
    return;
  }
  if (sessionActive) {
    sessionActive = false;
    freeSessionPaused = true;
    lastAnalysisRenderAt = null;
    document.body.classList.remove("session-running");
    document.body.classList.add("free-session-paused");
    cameraFrame.classList.remove("session-active");
    setDemoIdleState(true);
    feedback.reset("训练已暂停");
    setCoachMessage("训练已暂停；准备好后点击继续训练");
  } else if (freeSessionPaused) {
    freeSessionPaused = false;
    sessionActive = true;
    lastAnalysisRenderAt = null;
    lastExerciseMotionAt = performance.now();
    idleGuidance.reset(lastExerciseMotionAt);
    document.body.classList.remove("free-session-paused");
    document.body.classList.add("session-running");
    cameraFrame.classList.add("session-active");
    setDemoIdleState(true);
    const spoken = feedback.speakNow("继续训练");
    setCoachMessage("训练已继续，站稳后完成下一次动作", spoken);
  }
  syncActionAvailability();
}

function saveCurrentProgress(): void {
  let summary: SessionSummary | null = null;
  if (planRunner) {
    summary = buildWorkoutPlanSummary(planRunner, false);
  } else if (sessionActive || freeSessionPaused) {
    summary = {
      ...buildCurrentSetSummary(),
      id: sessionRecordId ?? `session-${Date.now()}`,
      endedAt: new Date().toISOString(),
    };
  }
  if (!summary || (summary.totalReps === 0 && (summary.validDurationMs ?? 0) <= 0)) {
    setCoachMessage("还没有完成有效动作，完成一次后就可以保存进度");
    return;
  }
  sessionRecordId = summary.id;
  renderHistory(sessionStore.upsert(summary));
  const spoken = feedback.speakNow("进度已保存");
  setCoachMessage("当前训练进度已保存在这台设备中，可以继续训练", spoken);
  updateText(saveProgressButton, "已保存");
  window.setTimeout(() => {
    if (sessionActive || freeSessionPaused || planRunner) updateText(saveProgressButton, "保存当前进度");
  }, 1_500);
}

function startSession(): void {
  if (!cameraReady || !modelReady || planRunner) {
    return;
  }
  analyzer = createAnalyzer(selectedExercise);
  feedback.reset();
  lastAnalysis = null;
  sessionActive = true;
  freeSessionPaused = false;
  sessionRecordId = `session-${Date.now()}`;
  sessionActiveDurationMs = 0;
  lastAnalysisRenderAt = null;
  document.body.classList.add("session-running");
  showView("training", false);
  lastExerciseMotionAt = performance.now();
  idleGuidance.reset(lastExerciseMotionAt);
  setDemoIdleState(true);
  summaryPanel.classList.add("hidden");
  cameraFrame.classList.add("session-active");
  setSystemState("training", "正在本机分析动作");
  const profile = EXERCISE_PROFILES[selectedExercise];
  const startMessage = selectedExercise === "jumping-jack"
    ? "请正面站直，双手放下、双脚并拢，完成校准"
    : selectedExercise === "push-up"
      ? "请从侧面进入高位俯卧撑，完成校准"
      : selectedExercise === "knee-push-up"
        ? "请从侧面进入跪姿俯卧撑起始位，完成校准"
      : selectedExercise === "plank" || selectedExercise === "side-plank"
        ? "请从侧面进入平板支撑，姿势稳定后开始计时"
        : `请按提示进入${profile.name}起始姿势，完成校准`;
  resetMetrics();
  resetLastRep();
  const startWasSpoken = feedback.speakNow("开始训练");
  setCoachMessage(startMessage, startWasSpoken);
  syncActionAvailability();
  endButton.focus();
}

async function beginSelectedSession(): Promise<void> {
  if (!structuredSingleSession) {
    startSession();
    return;
  }
  const profile = EXERCISE_PROFILES[selectedExercise];
  const settings = readSingleSessionSettings();
  singleSessionSets.value = String(settings.sets);
  singleSessionTarget.value = String(settings.target);
  singleSessionRest.value = String(settings.restSeconds);
  const plan = buildSingleExercisePlan(selectedExercise, profile, settings);
  await beginWorkoutPlan(plan);
}

function endSession(): void {
  if (!sessionActive && !freeSessionPaused) {
    return;
  }
  sessionActive = false;
  freeSessionPaused = false;
  document.body.classList.remove("free-session-paused");
  document.body.classList.remove("session-running");
  cameraFrame.classList.remove("session-active");
  const response = summarizeLatency(sessionLatencySamples);
  const estimatedCalories = preferences.weightKg === null
    ? null
    : estimateCalories({
      exerciseId: selectedExercise,
      weightKg: preferences.weightKg,
      activeDurationMs: sessionActiveDurationMs,
    });
  const analyzerSummary = analyzer.getSummary();
  const summary: SessionSummary = {
    ...analyzerSummary,
    id: sessionRecordId ?? analyzerSummary.id,
    averageResponseMs: response?.averageMs ?? null,
    p95ResponseMs: response?.p95Ms ?? null,
    activeDurationMs: sessionActiveDurationMs,
    estimatedCalories,
    weightKgAtSession: preferences.weightKg,
  };
  stopCamera();
  feedback.reset("训练结束");
  const hasSavedResult = summary.totalReps > 0 || (summary.validDurationMs ?? 0) > 0;
  const finishMessage = hasSavedResult
    ? "训练结束，结果已保存，可以查看本次总结"
    : "训练结束，本次没有识别到有效训练数据";
  const finishWasSpoken = feedback.speakNow(finishMessage);
  setCoachMessage(finishMessage, finishWasSpoken);
  setSystemState("ready", `${exerciseName(summary.exerciseId)}训练已结束 · 摄像头已关闭`);
  renderSummary(summary);
  summaryPanel.classList.remove("hidden");
  if (hasSavedResult) {
    renderHistory(sessionStore.upsert(summary));
  }
  sessionRecordId = null;
  setDemoIdleState(false);
  syncActionAvailability();
  showView("summary", false);
  summaryPanel.focus();
}

function renderAnalysis(analysis: FrameAnalysis): void {
  const renderedAt = performance.now();
  const moving = isActiveMotionPhase(analysis.phase) ||
    analysis.events.some((event) => event.kind === "phase");
  if (lastAnalysisRenderAt !== null && moving) {
    sessionActiveDurationMs += Math.min(500, Math.max(0, renderedAt - lastAnalysisRenderAt));
  }
  lastAnalysisRenderAt = renderedAt;
  if (moving) {
    lastExerciseMotionAt = renderedAt;
  }
  const isTakingABreak =
    analysis.totalReps > 0 &&
    !moving &&
    renderedAt - lastExerciseMotionAt >= 8_000;
  const timedHold = analysis.exerciseId !== undefined &&
    EXERCISE_PROFILES[analysis.exerciseId].mode === "timed-hold";
  totalReps.textContent = timedHold
    ? `${Math.floor((analysis.validHoldMs ?? 0) / 1_000)} 秒`
    : String(analysis.totalReps);
  qualifiedReps.textContent = timedHold
    ? `${((analysis.validHoldMs ?? 0) / 1_000).toFixed(1)} 秒`
    : String(analysis.qualifiedReps);
  qualityRate.textContent = timedHold
    ? analysis.phase === "holding" ? "有效计时中" : "调整后继续计时"
    : analysis.totalReps
      ? `合格率 ${Math.round((analysis.qualifiedReps / analysis.totalReps) * 100)}%`
      : "合格率 —";
  const calories = preferences.weightKg === null
    ? null
    : estimateCalories({
      exerciseId: analysis.exerciseId ?? selectedExercise,
      weightKg: preferences.weightKg,
      activeDurationMs: sessionActiveDurationMs,
    });
  liveCalories.textContent = formatCalories(calories);
  updateText(
    liveCalorieNote,
    preferences.weightKg === null
      ? "填写体重后估算"
      : `${EXERCISE_MET[analysis.exerciseId ?? selectedExercise]} MET · ${formatDuration(sessionActiveDurationMs)}有效`,
  );
  phaseValue.textContent = PHASE_LABEL[analysis.phase];
  if (analysis.exerciseId === "jumping-jack") {
    kneeAngle.textContent = analysis.motionScore == null ? "—" : `${Math.round(analysis.motionScore * 100)}%`;
    trunkAngle.textContent = analysis.secondaryScore == null ? "—" : `${Math.round(analysis.secondaryScore * 100)}%`;
  } else if (
    analysis.exerciseId === "calf-raise" ||
    analysis.exerciseId === "high-knees" ||
    analysis.exerciseId === "mountain-climber" ||
    analysis.exerciseId === "shoulder-tap" ||
    analysis.exerciseId === "bird-dog" ||
    analysis.exerciseId === "dead-bug"
  ) {
    kneeAngle.textContent = analysis.motionScore == null ? "—" : `${Math.round(analysis.motionScore * 100)}%`;
    trunkAngle.textContent = analysis.secondaryScore == null ? "—" : `${Math.round(analysis.secondaryScore)}°`;
  } else if (timedHold) {
    kneeAngle.textContent = analysis.validHoldMs == null ? "—" : `${(analysis.validHoldMs / 1_000).toFixed(1)} 秒`;
    trunkAngle.textContent = analysis.secondaryScore == null ? "—" : `${Math.round(analysis.secondaryScore)}°`;
  } else if (
    analysis.exerciseId === "glute-bridge" ||
    analysis.exerciseId === "single-leg-deadlift"
  ) {
    kneeAngle.textContent = analysis.motionScore == null ? "—" : `${Math.round(analysis.motionScore)}°`;
    trunkAngle.textContent = analysis.secondaryScore == null ? "—" : `${Math.round(analysis.secondaryScore)}°`;
  } else {
    kneeAngle.textContent = analysis.kneeAngle === null ? "—" : `${Math.round(analysis.kneeAngle)}°`;
    trunkAngle.textContent = analysis.trunkLean === null ? "—" : `${Math.round(analysis.trunkLean)}°`;
  }
  tempoValue.textContent = analysis.currentRepMs === null
    ? "—"
    : `${(analysis.currentRepMs / 1_000).toFixed(1)} 秒`;
  trackingValue.dataset.state = analysis.trackingState;
  const confidence = analysis.trackingConfidence === null
    ? ""
    : ` · ${Math.round(analysis.trackingConfidence * 100)}%`;
  trackingValue.textContent = analysis.trackingState === "stable"
    ? `稳定${confidence}`
    : analysis.trackingState === "grace"
      ? `短暂波动${confidence}`
      : `不稳定${confidence}`;
  const viewLabel = analysis.exerciseId === "jumping-jack"
    ? "正面 · 检查手脚开合"
    : analysis.exerciseId && analysis.exerciseId !== "squat"
      ? `${EXERCISE_PROFILES[analysis.exerciseId].supportedViews.join(" / ")} · ${EXERCISE_PROFILES[analysis.exerciseId].name}`
    : ({
    front: "正面 · 检查膝盖轨迹",
    side: "侧面 · 检查深度与前倾",
    oblique: "斜侧 · 基础纠正",
    unknown: "视角识别中",
  }[analysis.bodyView]);
  sideLabel.textContent = analysis.side === null
    ? viewLabel
    : `${viewLabel} · ${analysis.side === "left" ? "左" : "右"}侧骨架`;
  const idleCue = idleGuidance.update({
    now: renderedAt,
    calibrated: analysis.calibrated,
    trackingStable: analysis.trackingState === "stable",
    moving,
  });
  if (idleCue?.kind === "cancel") {
    feedback.interruptSpeech();
    setDemoIdleState(false);
  }
  const coachingMessage = feedback.process(
    analysis.events,
    isTakingABreak
      ? "已暂歇｜还要继续吗？直接开始下一次，或结束并查看总结"
      : analysis.statusMessage,
    renderedAt,
    {
      exerciseId: analysis.exerciseId,
      phase: analysis.phase,
      repId: analysis.totalReps + 1,
    },
  );
  const activeKey = feedback.getActiveKey();
  const phaseWillUseSpeech =
    analysis.phase !== "paused" &&
    feedback.speechIsEnabledAndAvailable() &&
    (activeKey?.startsWith("phase:") === true || activeKey === null);
  const activeKind = feedback.getActiveKind();
  const idleCueCanOwnMessage = idleCue && idleCue.kind !== "cancel" &&
    (activeKind === null || activeKind === "status");
  if (idleCueCanOwnMessage) {
    const profile = EXERCISE_PROFILES[analysis.exerciseId ?? selectedExercise];
    const cueMessage = idleCue.kind === "ready"
      ? "已进入画面，可以开始动作"
      : idleCue.kind === "short"
        ? singleSessionShortCue(analysis.phase)
        : singleSessionDetailedCue(analysis.phase, profile.exerciseId);
    const spoken = feedback.speakNow(cueMessage);
    setCoachMessage(cueMessage, spoken);
    setDemoIdleState(true);
  } else {
    setCoachMessage(
      coachingMessage,
      feedback.activeMessageUsesSpeech(),
      phaseWillUseSpeech,
    );
    if (moving) setDemoIdleState(false);
  }
  if (analysis.completedRep) {
    renderLastRep(analysis.completedRep);
  }
  if (planTargetReached(analysis)) {
    completePlanSet();
    return;
  }
  updatePhaseRail(analysis.phase);
  cameraFrame.dataset.phase = analysis.phase;
}

function updatePhaseRail(phase: WorkoutPhase | null): void {
  updateText(liveDemoPhase, phase ? PHASE_LABEL[phase] : "动作流程");
  for (const item of phaseRailItems) {
    const active = item.dataset.phase === phase;
    item.classList.toggle("active", active);
    if (active) {
      item.setAttribute("aria-current", "step");
    } else {
      item.removeAttribute("aria-current");
    }
  }
}

function resetMetrics(): void {
  totalReps.textContent = "0";
  qualifiedReps.textContent = "0";
  qualityRate.textContent = "合格率 —";
  liveCalories.textContent = preferences.weightKg === null ? "—" : "0.0";
  updateText(liveCalorieNote, preferences.weightKg === null ? "填写体重后估算" : "等待有效运动时间");
  phaseValue.textContent = "校准中";
  kneeAngle.textContent = "—";
  trunkAngle.textContent = "—";
  tempoValue.textContent = "—";
  trackingValue.dataset.state = "lost";
  trackingValue.textContent = "等待识别";
  latencySamples.length = 0;
  sessionLatencySamples.length = 0;
  latencyValue.textContent = "等待测量";
  latencyValue.removeAttribute("title");
  delete latencyValue.dataset.state;
  sideLabel.textContent = "等待识别";
  updatePhaseRail(null);
}

function resetLastRep(): void {
  lastRepCard.dataset.status = "empty";
  updateText(lastRepNumber, "等待第 1 次");
  updateText(lastRepStatus, "完成一次后，这里会给出评价");
  updateText(
    lastRepMessage,
    "系统会告诉你哪里做得好，以及下一次最该调整什么。",
  );
  updateText(lastRepOther, "");
}

function renderLastRep(rep: NonNullable<FrameAnalysis["completedRep"]>): void {
  const advice = buildRepAdvice(rep);
  lastRepCard.dataset.status = advice.status;
  updateText(lastRepNumber, `第 ${rep.repNumber} 次`);
  updateText(lastRepStatus, advice.title.replace(/^第 \d+ 次 · /, ""));
  updateText(lastRepMessage, advice.message);
  updateText(
    lastRepOther,
    advice.secondaryLabels.length
      ? `另外：${advice.secondaryLabels.join("、")}`
      : advice.status === "qualified"
        ? `本次用时 ${(rep.durationMs / 1_000).toFixed(1)} 秒`
        : "",
  );
}

function renderSummary(summary: SessionSummary): void {
  const immediateInsight = buildLocalSessionInsight(summary);
  if (summary.planName) {
    const completedSets = summary.planCompletedSets ?? 0;
    const totalSets = summary.planTotalSets ?? 0;
    const quality = summary.totalReps > 0
      ? Math.round((summary.qualifiedReps / summary.totalReps) * 100)
      : null;
    summaryPanel.dataset.insightState = summary.planCompleted
      ? quality !== null && quality >= 75 ? "strong" : "developing"
      : completedSets > 0 ? "needs-work" : "empty";
    updateText(
      summaryTitle,
      summary.planCompleted ? `${summary.planName}已完成` : `${summary.planName}提前结束`,
    );
    updateText(
      summarySubtitle,
      `完成 ${completedSets} / ${totalSets} 组${quality === null ? "" : ` · 动作合格率 ${quality}%`}。摄像头已关闭，本次画面没有保存。`,
    );
    updateText(summaryAdviceTitle, immediateInsight.nextStepTitle);
    updateText(
      summaryAdviceMessage,
      summary.planCompleted
        ? immediateInsight.nextStepMessage
        : completedSets === 0
          ? "本次没有完成任何一组，因此不生成笼统表扬。下次可以先选择新手轻松起步，完成第一组再决定是否继续。"
          : `你实际完成了 ${completedSets} 组。下次先完成未完成动作，不需要为了补进度连续加量。${immediateInsight.nextStepMessage}`,
    );
    updateText(
      summaryIssueBreakdown,
      immediateInsight.issueSummary.length
        ? `本次主要问题：${immediateInsight.issueSummary.join("；")}`
        : "本次没有足够的错误记录，建议继续以稳定动作为先。",
    );
    updateText(
      summaryInsightSource,
      isSingleExercisePlan(summary.planId) ? "按组训练规则" : "整套计划规则",
    );
  } else {
    const requestId = ++summaryInsightRequest;
    renderSessionInsight(immediateInsight);
    void sessionInsightProvider.getInsight(summary).then((insight) => {
      if (requestId === summaryInsightRequest) renderSessionInsight(insight);
    });
  }
  const timedHold = summary.measurementMode === "timed-hold";
  updateText(summaryTotalLabel, timedHold ? "有效保持" : "总次数");
  updateText(summaryQualifiedLabel, timedHold ? "计时方式" : "合格次数");
  updateText(summaryTempoLabel, timedHold ? "训练类型" : "平均节奏");
  summaryTotal.textContent = timedHold
    ? `${((summary.validDurationMs ?? 0) / 1_000).toFixed(1)} 秒`
    : String(summary.totalReps);
  summaryQualified.textContent = timedHold ? "姿势达标累计" : String(summary.qualifiedReps);
  summaryTempo.textContent = timedHold
    ? "静态保持"
    : summary.averageTempoSeconds === null
      ? "—"
      : `${summary.averageTempoSeconds.toFixed(1)} 秒`;
  currentSummaryCalories = summary.estimatedCalories ?? null;
  summaryCalories.textContent = summary.estimatedCalories == null
    ? "—"
    : `${formatCalories(summary.estimatedCalories)} 千卡`;
  updateText(
    summaryCalorieBasis,
    calorieBasisText(
      summary.exerciseId ?? selectedExercise,
      summary.activeDurationMs,
      summary.weightKgAtSession,
    ),
  );
  renderCalorieEquivalentOutputs();
  summaryActiveTime.textContent = formatDuration(summary.activeDurationMs);
  summaryIssue.textContent = summary.totalReps === 0
    ? "—"
    : immediateInsight.issueSummary[0] ?? "无";
  if (summary.p95ResponseMs == null) {
    updateText(summaryLatency, "未测得");
    updateText(summaryLatencyNote, "从画面到动作判断");
    delete summaryLatency.dataset.state;
  } else {
    const response = summarizeLatency([summary.p95ResponseMs])!;
    updateText(
      summaryLatency,
      `${response.label} · ${Math.round(summary.p95ResponseMs)} 毫秒`,
    );
    updateText(
      summaryLatencyNote,
      `平均 ${Math.round(summary.averageResponseMs ?? summary.p95ResponseMs)} 毫秒 · 95% 判断完成时间`,
    );
    summaryLatency.dataset.state = response.state;
  }
  const planSummary = Boolean(summary.planName);
  summaryPlanProgressCard.classList.toggle("hidden", !planSummary);
  summaryRestCard.classList.toggle("hidden", !planSummary);
  if (planSummary) {
    updateText(
      summaryPlanProgress,
      `${summary.planCompletedSets ?? 0} / ${summary.planTotalSets ?? 0} 组`,
    );
    updateText(summaryPlanName, summary.planName ?? "");
    const rests = summary.restPaceCounts ?? { fast: 0, standard: 0, extended: 0 };
    const dominant = rests.standard >= rests.fast && rests.standard >= rests.extended
      ? "标准恢复"
      : rests.fast >= rests.extended ? "恢复较快" : "延长恢复";
    updateText(summaryRestPace, summary.averageRestSeconds === null ? "暂无休息" : dominant);
    updateText(
      summaryRestNote,
      summary.averageRestSeconds === null
        ? "未完成组间休息"
        : `平均 ${Math.round(summary.averageRestSeconds ?? 0)} 秒 · 快 ${rests.fast} / 标准 ${rests.standard} / 延长 ${rests.extended}`,
    );
  }
  updateText(
    repeatButton,
    isSingleExercisePlan(summary.planId)
      ? "按相同设置再练"
      : planSummary ? "再练这套" : "再练一组",
  );
  if (summary.planId) repeatButton.dataset.planId = summary.planId;
  else delete repeatButton.dataset.planId;
}

function renderSessionInsight(insight: SessionInsight): void {
  summaryPanel.dataset.insightState = insight.state;
  updateText(summaryTitle, insight.title);
  updateText(summarySubtitle, `${insight.evidence}。摄像头已关闭，本次画面没有保存。`);
  updateText(summaryAdviceTitle, insight.nextStepTitle);
  updateText(summaryAdviceMessage, insight.nextStepMessage);
  updateText(
    summaryIssueBreakdown,
    insight.issueSummary.length > 1
      ? `另外：${insight.issueSummary.slice(1).join("；")}`
      : insight.message,
  );
  updateText(summaryInsightSource, insight.source === "ai" ? "AI 个性化总结" : "本机规则");
}

function renderHistory(sessions: SessionSummary[]): void {
  historyList.replaceChildren();
  historyEmpty.classList.toggle("hidden", sessions.length > 0);
  clearHistoryButton.classList.toggle("hidden", sessions.length === 0);
  clearHistoryButton.disabled = sessions.length === 0;
  renderDashboard(sessions);
  renderRecommendedPlans();

  const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  for (const session of sessions) {
    const item = document.createElement("li");
    const date = document.createElement("time");
    date.dateTime = session.endedAt;
    date.textContent = dateFormatter.format(new Date(session.endedAt));
    const result = document.createElement("strong");
    result.textContent = session.planName
      ? `${session.planName} · ${session.planCompletedSets ?? 0} / ${session.planTotalSets ?? 0} 组`
      : session.measurementMode === "timed-hold"
        ? `${exerciseName(session.exerciseId)} · 有效保持 ${((session.validDurationMs ?? 0) / 1_000).toFixed(1)} 秒`
        : `${exerciseName(session.exerciseId)} · ${session.qualifiedReps} / ${session.totalReps} 次合格`;
    const issue = document.createElement("span");
    const calorieLabel = session.estimatedCalories == null
      ? ""
      : ` · ${formatCalories(session.estimatedCalories)} 千卡`;
    issue.textContent = session.planName
      ? `${session.planCompleted ? "完整完成" : "提前结束"}${calorieLabel}`
      : `${buildSessionAdvice(session).title}${calorieLabel}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "record-delete-button";
    remove.textContent = "删除";
    remove.setAttribute("aria-label", `删除 ${date.textContent} 的训练记录`);
    remove.addEventListener("click", () => {
      if (!window.confirm(`删除 ${date.textContent} 的这次训练记录？`)) return;
      renderHistory(sessionStore.remove(session.id));
    });
    item.append(date, result, issue, remove);
    historyList.append(item);
  }
}

function stopResources(): void {
  window.clearInterval(planTimer);
  stopCamera();
  if (poseWorker) {
    const message: PoseWorkerRequest = { type: "dispose" };
    poseWorker.postMessage(message);
    poseWorker = null;
  }
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

cameraButton.addEventListener("click", () => {
  if (cameraStarting || sessionActive || freeSessionPaused || planRunner) {
    return;
  }
  if (cameraReady) {
    stopCamera();
    setSystemState(
      modelReady ? "ready" : "loading",
      modelReady ? "动作模型已就绪" : "正在加载动作模型",
    );
    setCoachMessage("摄像头已关闭");
    return;
  }
  void startCamera();
});
liveDemoToggle.addEventListener("click", () => {
  const expanded = liveDemoCard.dataset.expanded === "true";
  liveDemoCard.dataset.expanded = String(!expanded);
  liveDemoToggle.setAttribute("aria-expanded", String(!expanded));
  updateText(liveDemoToggle, expanded ? "放大" : "缩小");
});
liveDemoSide.addEventListener("click", () => {
  const moveToLeft = liveDemoCard.dataset.side !== "left";
  liveDemoCard.dataset.side = moveToLeft ? "left" : "right";
  liveDemoSide.setAttribute("aria-label", moveToLeft ? "把示范窗换到右侧" : "把示范窗换到左侧");
});
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-app-view]")) {
  button.addEventListener("click", () => {
    const view = button.dataset.appView;
    if (isAppView(view)) requestView(view);
  });
}
quickStartButton.addEventListener("click", () => {
  trainingReturnView = "home";
  renderExercise("squat");
  showView("training");
  cameraButton.focus();
});
browseLibraryButton.addEventListener("click", () => {
  showView("library");
});
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-home-category]")) {
  button.addEventListener("click", () => {
    const homeCategory = button.dataset.homeCategory as HomeExerciseCategory | undefined;
    if (!homeCategory) return;
    for (const candidate of document.querySelectorAll<HTMLButtonElement>("[data-home-category]")) {
      candidate.dataset.active = String(candidate === button);
    }
    openCategoryView(homeCategory);
  });
}
categoryBackButton.addEventListener("click", () => requestView("home"));
courseBackButton.addEventListener("click", () => requestView(courseReturnView));
courseSaveButton.addEventListener("click", () => {
  if (!selectedCourse) return;
  const saved = customPlanStore.has(selectedCourse.id);
  if (saved) {
    customPlanStore.remove(selectedCourse.id);
  } else {
    const intensity: CustomPlanIntensity = selectedCourse.intensity === "高" ? "high" : selectedCourse.intensity === "轻" ? "light" : "moderate";
    const request: CustomPlanRequest = {
      prompt: `收藏固定课程：${selectedCourse.name}`,
      goal: "general",
      intensity,
      equipment: selectedCourse.equipment.includes("哑铃") ? "dumbbell" : "none",
      durationMinutes: selectedCourse.durationMinutes,
    };
    customPlanStore.save(selectedCourse, request);
  }
  courseSaveButton.setAttribute("aria-pressed", String(!saved));
  courseSaveButton.textContent = saved ? "♡" : "♥";
  courseSaveButton.setAttribute("aria-label", saved ? "收藏这套训练" : "取消收藏这套训练");
  renderSavedPlans();
  renderMyOverview();
});
courseStartButton.addEventListener("click", () => {
  if (selectedCourse) void beginWorkoutPlan(selectedCourse);
});
categoryFeaturedButton.addEventListener("click", () => {
  const plan = findWorkoutPlan(categoryFeaturedButton.dataset.planId);
  if (plan) openCourseView(plan, "category");
});
categoryAllActions.addEventListener("click", () => {
  const libraryCategory: ExerciseCategory = selectedCategory === "有氧"
    ? "全身有氧"
    : selectedCategory === "胸肩" || selectedCategory === "背部"
      ? "上肢"
      : selectedCategory;
  for (const filter of libraryFilters.querySelectorAll<HTMLButtonElement>("[data-category]")) {
    filter.setAttribute("aria-pressed", String(filter.dataset.category === libraryCategory));
  }
  renderExerciseLibrary(libraryCategory, selectedCategory);
  showView("library");
});
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-category-level]")) {
  button.addEventListener("click", () => {
    for (const candidate of document.querySelectorAll<HTMLButtonElement>("[data-category-level]")) {
      candidate.setAttribute("aria-pressed", String(candidate === button));
    }
    renderCategoryView(selectedCategory, button.dataset.categoryLevel ?? "全部");
  });
}
planRecommendButton.addEventListener("click", () => {
  renderRecommendedPlans();
  planRecommendGrid.querySelector<HTMLElement>(".plan-card")?.focus?.();
});
historyCalorieEquivalent.addEventListener("change", () => {
  changeCalorieEquivalent(historyCalorieEquivalent.value);
});
summaryCalorieEquivalent.addEventListener("change", () => {
  changeCalorieEquivalent(summaryCalorieEquivalent.value);
});
planGenerateButton.addEventListener("click", () => void generatePlanFromPrompt());
aiComposer.addEventListener("submit", (event) => {
  event.preventDefault();
  void sendCoachMessage(aiInput.value);
});
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-ai-prompt]")) {
  button.addEventListener("click", () => void sendCoachMessage(button.dataset.aiPrompt ?? ""));
}
aiNewThread.addEventListener("click", () => {
  activeCoachThread = coachThreadStore.create();
  renderCoachThread();
  aiInput.focus();
  renderMyOverview();
});
aiHistoryToggle.addEventListener("click", () => {
  const expanded = aiHistoryToggle.getAttribute("aria-expanded") === "true";
  aiHistoryToggle.setAttribute("aria-expanded", String(!expanded));
  aiThreadHistory.classList.toggle("hidden", expanded);
  if (!expanded) renderCoachHistory();
});
aiHistoryClose.addEventListener("click", () => {
  aiThreadHistory.classList.add("hidden");
  aiHistoryToggle.setAttribute("aria-expanded", "false");
  aiHistoryToggle.focus();
});
dataExportButton.addEventListener("click", async () => {
  const password = window.prompt("设置备份密码（至少 8 位）。该密码无法由平台找回：");
  if (!password) return;
  try {
    const blob = await createEncryptedBackup(accountStorage.exportPlainObject(), password);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `FORM-backup-${new Date().toISOString().slice(0, 10)}.formbackup`;
    link.click();
    URL.revokeObjectURL(link.href);
    updateText(dataPrivacyStatus, "加密备份已导出。请把文件和密码分开保管。");
  } catch (error) {
    updateText(dataPrivacyStatus, error instanceof Error ? error.message : "备份导出失败");
  }
});
dataImportButton.addEventListener("click", () => dataImportFile.click());
dataImportFile.addEventListener("change", async () => {
  const file = dataImportFile.files?.[0];
  if (!file) return;
  const password = window.prompt("输入该备份文件的密码：");
  if (!password) return;
  try {
    const data = await readEncryptedBackup(file, password);
    if (!window.confirm(`已验证备份，包含 ${Object.keys(data).length} 类本机数据。合并到当前账户吗？`)) return;
    await accountStorage.importPlainObject(data, "merge");
    updateText(dataPrivacyStatus, "导入完成，正在重新载入数据……");
    window.location.reload();
  } catch {
    updateText(dataPrivacyStatus, "无法导入：密码错误、文件损坏或格式不受支持。");
  } finally {
    dataImportFile.value = "";
  }
});
dataDeleteAllButton.addEventListener("click", () => {
  const confirmation = window.prompt("这会删除当前账户在本设备上的全部身体、训练、计划和对话数据。请输入“删除本机数据”确认：");
  if (confirmation !== "删除本机数据") {
    updateText(dataPrivacyStatus, "未删除任何数据。");
    return;
  }
  accountStorage.clear();
  void accountStorage.flush().then(() => window.location.reload());
});
planVoiceButton.addEventListener("click", () => {
  if (planVoiceInput.isListening()) {
    planVoiceInput.stop();
    return;
  }
  if (!planVoiceInput.start(planPrompt.value)) updateText(planBuilderStatus, "语音没有启动，可直接在文本框中输入要求。 ");
});
trainingBackButton.addEventListener("click", () => requestView(trainingReturnView));
startButton.addEventListener("click", () => void beginSelectedSession());
pauseSessionButton.addEventListener("click", toggleCurrentSessionPause);
saveProgressButton.addEventListener("click", saveCurrentProgress);
endButton.addEventListener("click", () => {
  if (planRunner) finishWorkoutPlan(false);
  else endSession();
});
for (const button of sessionModeButtons) {
  button.addEventListener("click", () => {
    if (sessionActive || freeSessionPaused || planRunner) return;
    structuredSingleSession = button.dataset.sessionMode === "structured";
    renderSingleSessionSetup(false);
    syncActionAvailability();
  });
}
planPhasePrimary.addEventListener("click", () => {
  if (!planRunner) return;
  const snapshot = planRunner.getSnapshot();
  if (snapshot.phase === "warmup") {
    planRunner.skipWarmup();
    handlePlanPhaseTransition("warmup", "preparing");
  } else if (snapshot.phase === "preparing") {
    planRunner.skipPreparation();
    handlePlanPhaseTransition("preparing", "active");
  } else if (snapshot.phase === "resting") {
    planRunner.skipRest();
    handlePlanPhaseTransition("resting", "preparing");
  } else if (snapshot.phase === "paused") {
    resumeWorkoutPlan();
    return;
  } else if (snapshot.phase === "cooldown") {
    planRunner.skipCooldown();
    finishWorkoutPlan(true);
    return;
  }
  updatePlanInterface();
  syncActionAvailability();
});
planExtendRest.addEventListener("click", () => {
  if (!planRunner) return;
  planRunner.extendRest(15);
  feedback.speakNow("休息延长十五秒");
  updatePlanInterface();
});
planPause.addEventListener("click", () => {
  pauseWorkoutPlan();
});
planSessionPause.addEventListener("click", pauseWorkoutPlan);
retryModelButton.addEventListener("click", () => {
  setCameraError(null);
  initializeWorker();
});
soundButton.addEventListener("click", () => {
  if (feedback.getVoiceEngine() === "unavailable") {
    handleVoicePlaybackError();
    return;
  }
  const enabled = !feedback.isEnabled();
  feedback.setEnabled(enabled);
  syncVoiceControl();
  if (enabled) {
    const spoken = feedback.speakNow("语音已开启");
    if (spoken) {
      const engineLabel = feedback.getVoiceEngine() === "local"
        ? "内置语音"
        : "系统语音";
      setCoachMessage(`${engineLabel}已开启，动作时会实时提醒`, true);
    } else {
      handleVoicePlaybackError();
    }
  } else {
    setCoachMessage("语音已关闭，画面提示仍会继续");
  }
});
voiceTestButton.addEventListener("click", () => {
  if (feedback.getVoiceEngine() === "unavailable") {
    handleVoicePlaybackError();
    return;
  }
  feedback.setEnabled(true);
  syncVoiceControl();
  voiceTestButton.textContent = "正在播放";
  voiceTestButton.setAttribute("aria-busy", "true");
  const spoken = feedback.speakNow("语音已开启");
  if (spoken) {
    const engineLabel = feedback.getVoiceEngine() === "local" ? "内置语音" : "系统语音";
    setCoachMessage(`${engineLabel}试听中，训练时会实时提醒`, true);
    window.setTimeout(() => {
      voiceTestButton.textContent = "试听";
      voiceTestButton.removeAttribute("aria-busy");
    }, 900);
  } else {
    voiceTestButton.textContent = "播放失败";
    voiceTestButton.removeAttribute("aria-busy");
    handleVoicePlaybackError();
  }
});
clearHistoryButton.addEventListener("click", () => {
  if (!window.confirm("清空保存在当前浏览器中的训练记录？")) {
    return;
  }
  sessionStore.clear();
  renderHistory([]);
});
historyStartButton.addEventListener("click", () => {
  trainingReturnView = "history";
  renderExercise("squat");
  showView("training");
  cameraButton.focus();
});
skeletonToggle.addEventListener("change", () => {
  preferences = preferencesStore.save({
    ...preferences,
    showSkeleton: skeletonToggle.checked,
  });
  applyPreferences();
  drawPose(lastPose);
});
for (const button of exerciseButtons) {
  button.addEventListener("click", () => {
    const exerciseId = button.dataset.exercise as ExerciseId | undefined;
    if (!exerciseId || sessionActive || exerciseId === selectedExercise) return;
    renderExercise(exerciseId);
  });
}
for (const filter of libraryFilters.querySelectorAll<HTMLButtonElement>("[data-category]")) {
  filter.addEventListener("click", () => {
    const category = filter.dataset.category as ExerciseCategory | "全部" | undefined;
    if (!category) return;
    for (const candidate of libraryFilters.querySelectorAll<HTMLButtonElement>("[data-category]")) {
      candidate.setAttribute("aria-pressed", String(candidate === filter));
    }
    renderExerciseLibrary(category);
    renderExercise(selectedExercise);
  });
}
repeatButton.addEventListener("click", async () => {
  if (repeatButton.dataset.planId?.startsWith("custom-single-")) {
    showView("training");
    summaryPanel.classList.add("hidden");
    await startCamera();
    if (cameraReady && modelReady) await beginSelectedSession();
    return;
  }
  const repeatPlan = findAnyWorkoutPlan(repeatButton.dataset.planId);
  if (repeatPlan) {
    await beginWorkoutPlan(repeatPlan);
    return;
  }
  showView("training");
  await startCamera();
  if (cameraReady && modelReady) {
    summaryPanel.classList.add("hidden");
    startSession();
  }
});
chooseExerciseButton.addEventListener("click", () => {
  summaryPanel.classList.add("hidden");
  showView("library");
  const first = exerciseLibraryGrid.querySelector<HTMLButtonElement>("[data-library-exercise]");
  first?.focus();
});
video.addEventListener("loadedmetadata", resizeCanvas);
window.addEventListener("resize", resizeCanvas);
window.addEventListener("beforeunload", stopResources);
window.addEventListener("beforeunload", () => planVoiceInput.destroy());
document.addEventListener("visibilitychange", () => {
  if (document.hidden && sessionActive) {
    feedback.reset("页面已切到后台，动作计数暂停");
    setCoachMessage("页面已切到后台，动作计数暂停");
  } else if (!document.hidden && sessionActive) {
    setCoachMessage("画面已恢复，请回到起始位后继续");
  }
});

applyPreferences();
bodyCenter.init();
renderPlans();
const restoredPlanDraft = customPlanDraftStore.load();
if (restoredPlanDraft) {
  renderGeneratedPlan(restoredPlanDraft.plan, restoredPlanDraft.request);
  updateText(planBuilderStatus, "已恢复上次未收藏的计划草稿；草稿会保留 7 天。 ");
}
renderHistory(sessionStore.load());
renderCoachThread();
renderMyOverview();
renderExerciseLibrary();
renderExercise(selectedExercise);
showView("home", false);
initializeWorker();
syncVoiceControl();
syncActionAvailability();
