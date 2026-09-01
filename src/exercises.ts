import type { ExerciseId, IssueKey, WorkoutPhase } from "./types";
import {
  EXPANDED_EXERCISE_IDS,
  EXPANDED_EXERCISE_PROFILES,
} from "./expanded-exercises";
import {
  NEW_EXERCISE_IDS,
  NEW_EXERCISE_PROFILES,
} from "./catalog-expansion";

export type ExerciseCategory = "下肢" | "上肢" | "核心" | "全身有氧" | "瑜伽" | "哑铃" | "弹力带";
export type ExerciseMode = "repetition" | "alternating" | "timed-hold";
export type ExerciseDiscipline = "bodyweight" | "yoga" | "dumbbell" | "band";
export type ExerciseEquipment = "none" | "single-dumbbell" | "pair-dumbbells" | "single-or-pair" | "resistance-band";
export type ExerciseDifficulty = "入门" | "进阶";
export type RealtimeSupportTier = "realtime-candidate" | "guided-only";

export interface ExerciseCoachProfile {
  exerciseId: ExerciseId;
  name: string;
  catalogSourceId: string;
  category: ExerciseCategory;
  mode: ExerciseMode;
  available: boolean;
  discipline?: ExerciseDiscipline;
  equipment?: ExerciseEquipment;
  additionalEquipment?: string[];
  difficulty?: ExerciseDifficulty;
  realtimeSupportTier?: RealtimeSupportTier;
  supportedViews: string[];
  muscles: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  activationCue: string;
  breathingCue?: string;
  safetyNotes?: string[];
  commonMistakes?: Array<{ label: string; correction: string }>;
  met?: number;
  suggestedTraining?: {
    beginner: string;
    regular: string;
    restSeconds: number;
  };
  preparation: string;
  stageTitle: string;
  cameraTitle: string;
  cameraDetail: string;
  metricLabels: [string, string];
  checkpoints: Array<{ label: string; detail: string }>;
  phases: Array<{ phase: WorkoutPhase; label: string }>;
  issueKeys: IssueKey[];
  media: {
    kind: "self-drawn" | "project-generated" | "catalog";
    licenseStatus: "owned" | "user-authorized";
    reviewStatus: "verified" | "rejected-content-mismatch" | "pending";
    animationUrl?: string;
    thumbnailUrl?: string;
    sourceUrl?: string;
    attribution?: string;
  };
  catalogMediaReview?: {
    status: "verified" | "rejected-content-mismatch" | "pending";
    sourceUrl: string;
  };
}

const MODEST_CATALOG_SLUGS = new Set([
  "burpee",
  "dead-bug",
  "mountain-climber",
  "side-plank",
]);

const catalogMedia = (
  mediaFile: string,
  slug: string,
): ExerciseCoachProfile["media"] => {
  const usesModestCorrection = MODEST_CATALOG_SLUGS.has(slug);
  const correctedUrl = `/assets/exercise-catalog/${slug}-modest-v2.png`;

  return {
    kind: usesModestCorrection ? "project-generated" : "catalog",
    licenseStatus: "user-authorized",
    reviewStatus: "verified",
    thumbnailUrl: usesModestCorrection
      ? correctedUrl
      : `/assets/exercise-catalog/${slug}.jpg`,
    animationUrl: usesModestCorrection
      ? correctedUrl
      : `/assets/exercise-catalog/${slug}.gif`,
    sourceUrl: `https://github.com/hasaneyldrm/exercises-dataset/blob/main/images/${mediaFile}`,
    attribution: usesModestCorrection
      ? "动作库授权素材 · 项目服装遮挡修正版"
      : "© Gym visual — https://gymvisual.com/",
  };
};

const pendingMedia: ExerciseCoachProfile["media"] = {
  kind: "catalog",
  licenseStatus: "user-authorized",
  reviewStatus: "pending",
};

const generatedLineart = (
  slug: string,
  version = "",
): ExerciseCoachProfile["media"] => ({
  kind: "project-generated",
  licenseStatus: "owned",
  reviewStatus: "verified",
  thumbnailUrl: `/assets/exercise-catalog/${slug}-lineart${version}.png`,
  animationUrl: `/assets/exercise-catalog/${slug}-lineart${version}.png`,
  attribution: "项目自有补充素材 · 按动作库黑白线稿风格统一制作",
});

function pendingProfile(
  exerciseId: ExerciseId,
  name: string,
  category: ExerciseCategory,
  mode: ExerciseMode,
  primaryMuscles: string[],
  secondaryMuscles: string[],
  activationCue: string,
  media: ExerciseCoachProfile["media"] = pendingMedia,
): ExerciseCoachProfile {
  return {
    exerciseId,
    name,
    catalogSourceId: media.reviewStatus === "verified"
      ? exerciseId
      : `review-required-${exerciseId}`,
    category,
    mode,
    available: false,
    supportedViews: ["待审核"],
    muscles: `${primaryMuscles.join("、")}；${secondaryMuscles.join("、")}辅助参与`,
    primaryMuscles,
    secondaryMuscles,
    activationCue,
    preparation: "动作规则和拍摄视角正在逐项验证，通过后开放训练。",
    stageTitle: `${name}正在验证识别规则`,
    cameraTitle: "该动作暂未开放摄像头训练",
    cameraDetail: "可以先查看真人素材、肌群和发力提示",
    metricLabels: ["动作幅度", "身体稳定"],
    checkpoints: [
      { label: "主要", detail: `主要训练${primaryMuscles.join("、")}。` },
      { label: "辅助", detail: `${secondaryMuscles.join("、")}参与稳定和协同发力。` },
      { label: "发力", detail: activationCue },
    ],
    phases: [
      { phase: "calibrating", label: "准备" },
      { phase: "standing", label: "开始" },
      { phase: "bottom", label: "动作" },
      { phase: "ascending", label: "完成" },
    ],
    issueKeys: ["range", "alignment", "stability"],
    media,
  };
}

const BASE_EXERCISE_PROFILES = {
  squat: {
    exerciseId: "squat",
    name: "徒手深蹲",
    catalogSourceId: "bodyweight-squat",
    category: "下肢",
    mode: "repetition",
    available: true,
    supportedViews: ["正面", "侧面"],
    muscles: "臀大肌、股四头肌；核心负责稳定",
    primaryMuscles: ["臀大肌", "股四头肌"],
    secondaryMuscles: ["腘绳肌", "小腿", "腹部核心"],
    activationCue: "脚掌稳稳压地，髋膝同步发力站起。",
    preparation: "全身入镜。侧面检查深度与前倾，正面检查膝盖轨迹。",
    stageTitle: "选好视角，让全身留在画面里",
    cameraTitle: "开启摄像头后，正面或侧面站到画面中央",
    cameraDetail: "肩、髋、膝、脚踝和脚尖都要清晰可见",
    metricLabels: ["膝关节角度", "躯干前倾"],
    checkpoints: [
      { label: "脚掌", detail: "全脚掌稳定压地，重心留在脚中部。" },
      { label: "膝盖", detail: "沿脚尖方向移动，不要向内塌。" },
      { label: "躯干", detail: "抬起胸口，核心收紧，背部保持稳定。" },
    ],
    phases: [
      { phase: "standing", label: "站立" },
      { phase: "descending", label: "下蹲" },
      { phase: "bottom", label: "最低点" },
      { phase: "ascending", label: "起身" },
    ],
    issueKeys: ["knees", "lean", "depth", "speed"],
    media: {
      kind: "project-generated",
      licenseStatus: "owned",
      reviewStatus: "verified",
      thumbnailUrl: "/assets/squat-anatomy-sequence.png",
      animationUrl: "/assets/squat-anatomy-sequence.png",
    },
  },
  "jumping-jack": {
    exerciseId: "jumping-jack",
    name: "开合跳",
    catalogSourceId: "3224",
    category: "全身有氧",
    mode: "repetition",
    available: true,
    supportedViews: ["正面"],
    muscles: "臀中肌、小腿、肩部；核心负责落地稳定",
    primaryMuscles: ["股四头肌", "小腿", "三角肌"],
    secondaryMuscles: ["臀中肌", "腹部核心", "腘绳肌"],
    activationCue: "手脚同时张开，落地时用膝髋轻轻缓冲。",
    preparation: "正面全身入镜，并在身体两侧和头顶留出足够空间。",
    stageTitle: "正面站立，为手脚留出张开空间",
    cameraTitle: "开启摄像头后，正面站到画面中央",
    cameraDetail: "头顶、双手、髋部和双脚都要完整入镜",
    metricLabels: ["当前张开幅度", "手脚共同幅度"],
    checkpoints: [
      { label: "手臂", detail: "张开时双手举过头顶，左右幅度接近。" },
      { label: "双脚", detail: "向两侧充分打开，收回时重新并拢。" },
      { label: "同步", detail: "手脚同时张开、同时收回，轻稳落地。" },
    ],
    phases: [
      { phase: "closed", label: "并拢" },
      { phase: "opening", label: "张开" },
      { phase: "open", label: "最大幅度" },
      { phase: "closing", label: "收回" },
    ],
    issueKeys: ["arms", "feet", "sync", "symmetry"],
    media: {
      kind: "project-generated",
      licenseStatus: "owned",
      reviewStatus: "verified",
      thumbnailUrl: "/assets/jumping-jack-anatomy-sequence.png",
      animationUrl: "/assets/jumping-jack-anatomy-sequence.png",
    },
    catalogMediaReview: {
      status: "rejected-content-mismatch",
      sourceUrl: "https://github.com/hasaneyldrm/exercises-dataset/blob/main/data/exercises.json",
    },
  },
  "reverse-lunge": {
    exerciseId: "reverse-lunge",
    name: "反向弓步",
    catalogSourceId: "review-required-reverse-lunge",
    category: "下肢",
    mode: "alternating",
    available: true,
    supportedViews: ["正面", "斜侧面"],
    muscles: "臀大肌、股四头肌；腘绳肌和核心辅助稳定",
    primaryMuscles: ["臀大肌", "股四头肌"],
    secondaryMuscles: ["腘绳肌", "小腿", "腹部核心"],
    activationCue: "前脚脚掌压稳地面，用臀腿发力回到站立。",
    preparation: "全身入镜，身后留出一步距离；正面或斜侧面站立。",
    stageTitle: "身后留出一步，完整拍到双脚",
    cameraTitle: "正面或斜侧站立，身后留出后撤空间",
    cameraDetail: "肩、髋、双膝和双脚必须完整可见",
    metricLabels: ["前膝角度", "躯干稳定"],
    checkpoints: [
      { label: "前膝", detail: "膝盖跟着脚尖方向，不向内塌。" },
      { label: "下沉", detail: "后膝向地面下降，前脚脚跟保持着地。" },
      { label: "躯干", detail: "胸口抬起，身体不要明显前扑。" },
    ],
    phases: [
      { phase: "standing", label: "并脚" },
      { phase: "descending", label: "后撤" },
      { phase: "bottom", label: "下沉" },
      { phase: "ascending", label: "回正" },
    ],
    issueKeys: ["range", "alignment", "stability"],
    media: generatedLineart("reverse-lunge"),
  },
  "calf-raise": {
    exerciseId: "calf-raise",
    name: "站姿提踵",
    catalogSourceId: "1373",
    category: "下肢",
    mode: "repetition",
    available: true,
    supportedViews: ["侧面", "正面"],
    muscles: "腓肠肌、比目鱼肌；足踝稳定肌辅助",
    primaryMuscles: ["腓肠肌", "比目鱼肌"],
    secondaryMuscles: ["足底肌群", "胫骨后肌", "腹部核心"],
    activationCue: "前脚掌压地，脚跟垂直抬高后控制落下。",
    preparation: "全身入镜并露出脚尖和脚跟，侧面视角最容易检查幅度。",
    stageTitle: "让脚尖和脚跟都清楚可见",
    cameraTitle: "侧面站立，脚尖和脚跟不要被画面裁切",
    cameraDetail: "肩、髋、膝、脚踝、脚跟和脚尖都要可见",
    metricLabels: ["脚跟抬升", "身体稳定"],
    checkpoints: [
      { label: "脚跟", detail: "垂直抬高，不向内外歪。" },
      { label: "膝盖", detail: "膝盖保持自然伸直，不用屈膝借力。" },
      { label: "节奏", detail: "到最高点后控制落下，不要弹跳。" },
    ],
    phases: [
      { phase: "standing", label: "落地" },
      { phase: "lifting", label: "抬起" },
      { phase: "top", label: "最高点" },
      { phase: "lowering", label: "落下" },
    ],
    issueKeys: ["range", "alignment", "stability"],
    media: catalogMedia("1373-bJYHBIN.jpg", "calf-raise"),
  },
  "high-knees": {
    exerciseId: "high-knees",
    name: "原地高抬腿",
    catalogSourceId: "review-required-high-knees",
    category: "全身有氧",
    mode: "alternating",
    available: true,
    supportedViews: ["正面"],
    muscles: "髋屈肌、股四头肌；小腿、臀部和核心辅助",
    primaryMuscles: ["髋屈肌", "股四头肌"],
    secondaryMuscles: ["小腿", "臀大肌", "腹部核心"],
    activationCue: "核心收紧，左右膝盖主动向髋部高度抬起。",
    preparation: "正面全身入镜，头顶和脚下留出少量空间。",
    stageTitle: "正面站立，保证双膝都能完整看到",
    cameraTitle: "正面站到画面中央，双脚完整入镜",
    cameraDetail: "肩、髋、双膝和双脚必须持续可见",
    metricLabels: ["抬膝高度", "左右节奏"],
    checkpoints: [
      { label: "膝盖", detail: "主动抬向髋部高度，不向身体外侧甩。" },
      { label: "躯干", detail: "身体保持直立，不明显后仰。" },
      { label: "节奏", detail: "左右交替，落地轻稳。" },
    ],
    phases: [
      { phase: "standing", label: "起始" },
      { phase: "left-lift", label: "左膝" },
      { phase: "standing", label: "换侧" },
      { phase: "right-lift", label: "右膝" },
    ],
    issueKeys: ["range", "stability", "rhythm"],
    media: generatedLineart("high-knees", "-v2"),
  },
  "push-up": {
    exerciseId: "push-up",
    name: "标准俯卧撑",
    catalogSourceId: "0662",
    category: "上肢",
    mode: "repetition",
    available: true,
    supportedViews: ["侧面"],
    muscles: "胸大肌、肱三头肌；肩部和核心辅助稳定",
    primaryMuscles: ["胸大肌", "肱三头肌"],
    secondaryMuscles: ["三角肌前束", "前锯肌", "腹部核心"],
    activationCue: "胸口朝地面下降，推起时胸部和手臂共同发力。",
    preparation: "摄像头放低并从侧面拍摄，让肩、髋、膝、脚踝和双手入镜。",
    stageTitle: "把摄像头放低，从侧面拍完整身体",
    cameraTitle: "侧面进入高位支撑，头脚都不要被裁切",
    cameraDetail: "肩、手肘、手腕、髋、膝和脚踝都要可见",
    metricLabels: ["肘关节角度", "身体直线"],
    checkpoints: [
      { label: "直线", detail: "肩、髋、脚踝保持接近一条线。" },
      { label: "深度", detail: "胸口控制下降，手肘充分弯曲。" },
      { label: "手掌", detail: "手掌稳定放在肩膀下方附近。" },
    ],
    phases: [
      { phase: "plank", label: "高位" },
      { phase: "lowering", label: "下降" },
      { phase: "bottom", label: "底部" },
      { phase: "pressing", label: "推起" },
    ],
    issueKeys: ["range", "body-line", "stability"],
    media: catalogMedia("0662-I4hDWkc.jpg", "push-up"),
  },
  plank: {
    exerciseId: "plank",
    name: "平板支撑",
    catalogSourceId: "review-required-front-plank",
    category: "核心",
    mode: "timed-hold",
    available: true,
    supportedViews: ["侧面"],
    muscles: "腹横肌、腹直肌；肩部、臀部和股四头肌辅助",
    primaryMuscles: ["腹横肌", "腹直肌"],
    secondaryMuscles: ["三角肌", "前锯肌", "臀大肌", "股四头肌"],
    activationCue: "收紧腹部和臀部，让肩、髋、脚踝连成直线。",
    preparation: "摄像头放低并从侧面拍摄，整个身体和双肘完整入镜。",
    stageTitle: "侧面拍摄整条身体线",
    cameraTitle: "侧面进入肘撑，肩到脚踝完整入镜",
    cameraDetail: "肩、手肘、髋、膝和脚踝都要可见",
    metricLabels: ["有效保持", "身体直线"],
    checkpoints: [
      { label: "髋部", detail: "不要下沉，也不要明显抬高。" },
      { label: "肩膀", detail: "肩膀稳定放在手肘上方。" },
      { label: "呼吸", detail: "保持自然呼吸，不要憋气。" },
    ],
    phases: [
      { phase: "calibrating", label: "准备" },
      { phase: "plank", label: "进入" },
      { phase: "holding", label: "保持" },
      { phase: "paused", label: "暂停" },
    ],
    issueKeys: ["body-line", "stability"],
    media: generatedLineart("plank"),
  },
  "side-lunge": {
    ...pendingProfile("side-lunge", "侧弓步", "下肢", "repetition", ["臀大肌", "股四头肌"], ["内收肌", "腘绳肌", "小腿"], "髋部向后坐，用屈膝一侧的臀腿推回站立。", generatedLineart("side-lunge")),
    catalogSourceId: "project-side-lunge",
    available: true,
    supportedViews: ["正面"],
    preparation: "正面全身入镜，身体两侧留出跨步空间。",
    stageTitle: "双脚宽站，身体两侧都留出空间",
    cameraTitle: "正面拍到肩、髋、双膝和双脚",
    cameraDetail: "两条腿和完整脚掌都必须可见",
    metricLabels: ["屈膝侧角度", "躯干稳定"],
    checkpoints: [
      { label: "髋部", detail: "向后坐向屈膝一侧。" },
      { label: "膝盖", detail: "跟随脚尖方向，不向内塌。" },
      { label: "直腿", detail: "另一侧腿伸直，脚掌保持着地。" },
    ],
    phases: [
      { phase: "standing", label: "宽站" },
      { phase: "descending", label: "侧移" },
      { phase: "bottom", label: "下沉" },
      { phase: "ascending", label: "回正" },
    ],
    issueKeys: ["range", "alignment", "stability"],
  },
  "glute-bridge": {
    ...pendingProfile("glute-bridge", "臀桥", "下肢", "repetition", ["臀大肌"], ["腘绳肌", "腹部核心"], "脚跟压地，夹紧臀部把髋部抬起。", generatedLineart("glute-bridge")),
    catalogSourceId: "project-glute-bridge",
    available: true,
    supportedViews: ["侧面"],
    preparation: "摄像头放低，从侧面拍到肩、髋、膝和双脚。",
    stageTitle: "侧面仰卧屈膝，双脚稳定踩地",
    cameraTitle: "肩、髋、膝和脚掌完整入镜",
    cameraDetail: "摄像头尽量与地面平行，不要从头顶俯拍",
    metricLabels: ["髋部抬升角度", "身体稳定"],
    checkpoints: [
      { label: "脚跟", detail: "持续压地，不用脚尖蹬起。" },
      { label: "髋部", detail: "夹紧臀部抬到肩髋膝成斜线。" },
      { label: "下落", detail: "控制髋部落下，不突然砸地。" },
    ],
    phases: [
      { phase: "standing", label: "落地" },
      { phase: "lifting", label: "抬髋" },
      { phase: "top", label: "顶端" },
      { phase: "lowering", label: "落下" },
    ],
    issueKeys: ["range", "alignment", "stability"],
  },
  "knee-push-up": {
    ...pendingProfile("knee-push-up", "跪姿俯卧撑", "上肢", "repetition", ["胸大肌", "肱三头肌"], ["三角肌前束", "腹部核心"], "肩、髋、膝保持直线，胸口控制下降。", catalogMedia("3211-ZOuKWir.jpg", "knee-push-up")),
    catalogSourceId: "3211",
    available: true,
    supportedViews: ["侧面"],
    preparation: "摄像头放低，从侧面拍到肩、髋、膝和双手。",
    stageTitle: "侧面进入跪姿高位支撑",
    cameraTitle: "双膝着地，肩到膝完整入镜",
    cameraDetail: "肩、手肘、手腕、髋和膝盖必须可见",
    metricLabels: ["肘关节角度", "肩髋膝直线"],
    checkpoints: [
      { label: "直线", detail: "肩、髋、膝保持接近一条直线。" },
      { label: "下降", detail: "胸口控制向地面下降，手肘充分弯曲。" },
      { label: "推起", detail: "胸部和手臂共同发力，不塌腰。" },
    ],
    phases: [
      { phase: "plank", label: "高位" },
      { phase: "lowering", label: "下降" },
      { phase: "bottom", label: "底部" },
      { phase: "pressing", label: "推起" },
    ],
    issueKeys: ["range", "body-line", "stability"],
  },
  "bird-dog": {
    ...pendingProfile("bird-dog", "鸟狗式", "核心", "alternating", ["竖脊肌", "臀大肌"], ["三角肌", "腹部核心"], "对侧手脚伸远，骨盆保持水平。", generatedLineart("bird-dog")),
    catalogSourceId: "project-bird-dog",
    available: true,
    supportedViews: ["侧面", "斜侧面"],
    preparation: "摄像头放低，完整拍到双手、双膝和伸出的脚。",
    stageTitle: "四点支撑，前后留出伸展空间",
    cameraTitle: "侧面拍到双肩、双手、髋、双膝和双脚",
    cameraDetail: "伸出的手和脚不能离开画面",
    metricLabels: ["对侧伸展幅度", "躯干稳定"],
    checkpoints: [
      { label: "对侧", detail: "左手配右脚，右手配左脚。" },
      { label: "骨盆", detail: "保持水平，不向一侧翻转。" },
      { label: "伸展", detail: "手脚向两端伸远，不必抬得过高。" },
    ],
    phases: [
      { phase: "plank", label: "四点支撑" },
      { phase: "left-lift", label: "左手右脚" },
      { phase: "plank", label: "回中" },
      { phase: "right-lift", label: "右手左脚" },
    ],
    issueKeys: ["range", "stability", "rhythm"],
  },
  "mountain-climber": {
    ...pendingProfile("mountain-climber", "登山跑", "全身有氧", "alternating", ["腹部核心", "髋屈肌"], ["肩部", "肱三头肌", "股四头肌"], "双手撑稳，左右膝盖交替向胸口。", catalogMedia("0630-RJgzwny.jpg", "mountain-climber")),
    catalogSourceId: "0630",
    available: true,
    supportedViews: ["侧面", "斜侧面"],
    preparation: "摄像头放低，完整拍到肩、双手、髋、双膝和双脚。",
    stageTitle: "侧面进入高位支撑，给双腿留出收膝空间",
    cameraTitle: "高位支撑时头脚都不要被裁切",
    cameraDetail: "双肩、双手、髋、双膝和双脚必须持续可见",
    metricLabels: ["膝盖靠近胸口", "身体直线"],
    checkpoints: [
      { label: "支撑", detail: "双手撑稳，肩膀不要明显后退。" },
      { label: "收膝", detail: "左右膝盖依次主动靠近胸口。" },
      { label: "髋部", detail: "控制上下晃动，不塌腰。" },
    ],
    phases: [
      { phase: "plank", label: "支撑" },
      { phase: "left-lift", label: "左膝" },
      { phase: "plank", label: "换侧" },
      { phase: "right-lift", label: "右膝" },
    ],
    issueKeys: ["range", "body-line", "rhythm"],
  },
  "single-leg-deadlift": {
    ...pendingProfile("single-leg-deadlift", "徒手单腿硬拉", "下肢", "alternating", ["臀大肌", "腘绳肌"], ["竖脊肌", "小腿", "腹部核心"], "支撑脚踩稳，髋部向后折叠并保持背部平直。", generatedLineart("single-leg-deadlift")),
    catalogSourceId: "project-single-leg-deadlift",
    available: true,
    supportedViews: ["侧面", "斜侧面"],
    preparation: "全身侧面入镜，身后给抬起的腿留出空间。",
    stageTitle: "单脚站稳，身后留出伸腿空间",
    cameraTitle: "侧面拍到肩、髋、支撑膝和双脚",
    cameraDetail: "抬起的脚和头部全程不要离开画面",
    metricLabels: ["髋铰链角度", "支撑腿稳定"],
    checkpoints: [
      { label: "髋部", detail: "向后折叠，不做成单腿深蹲。" },
      { label: "背部", detail: "保持平直，头部跟随躯干。" },
      { label: "支撑膝", detail: "保持微屈，不明显内扣。" },
    ],
    phases: [
      { phase: "standing", label: "单脚站立" },
      { phase: "descending", label: "髋折叠" },
      { phase: "bottom", label: "伸展" },
      { phase: "ascending", label: "回正" },
    ],
    issueKeys: ["range", "alignment", "stability"],
  },
  "shoulder-tap": {
    ...pendingProfile("shoulder-tap", "平板肩触碰", "核心", "alternating", ["腹部核心", "三角肌"], ["肱三头肌", "胸大肌", "臀部"], "双脚踩稳，触肩时尽量不让髋部旋转。", catalogMedia("3699-yRpV5TC.jpg", "shoulder-tap")),
    catalogSourceId: "3699",
    available: true,
    supportedViews: ["正面", "斜侧面"],
    preparation: "摄像头放低，正面或斜侧面完整拍到双肩和双手。",
    stageTitle: "高位支撑，双脚稍微分开保持稳定",
    cameraTitle: "正面拍到双肩、双手、髋部和双脚",
    cameraDetail: "触肩一侧的手腕和对侧肩膀都必须清楚可见",
    metricLabels: ["触肩距离", "髋部稳定"],
    checkpoints: [
      { label: "触肩", detail: "左右手依次触碰对侧肩膀。" },
      { label: "髋部", detail: "触肩时尽量不左右旋转。" },
      { label: "支撑", detail: "支撑手稳定压地，肩膀远离耳朵。" },
    ],
    phases: [
      { phase: "plank", label: "支撑" },
      { phase: "left-lift", label: "左手" },
      { phase: "plank", label: "换手" },
      { phase: "right-lift", label: "右手" },
    ],
    issueKeys: ["range", "stability", "rhythm"],
  },
  "side-plank": {
    ...pendingProfile("side-plank", "侧平板支撑", "核心", "timed-hold", ["腹斜肌"], ["臀中肌", "肩部"], "前臂压地，把髋部抬起并保持身体成直线。", catalogMedia("0705-RKjH6Lt.jpg", "side-plank")),
    catalogSourceId: "0705",
    available: true,
    supportedViews: ["正面", "斜侧面"],
    preparation: "摄像头放低，完整拍到支撑肘、肩、髋和双脚。",
    stageTitle: "前臂压地，侧面身体完整入镜",
    cameraTitle: "肩、髋、膝和脚踝不要被裁切",
    cameraDetail: "身体侧向摄像头，支撑肘和双脚都要可见",
    metricLabels: ["有效保持", "身体直线"],
    checkpoints: [
      { label: "髋部", detail: "向上抬起，不要下沉。" },
      { label: "肩膀", detail: "支撑肩稳定在手肘上方。" },
      { label: "直线", detail: "肩、髋、脚踝保持接近一条线。" },
    ],
    phases: [
      { phase: "calibrating", label: "准备" },
      { phase: "holding", label: "保持" },
      { phase: "paused", label: "暂停" },
    ],
    issueKeys: ["body-line", "stability"],
  },
  "dead-bug": {
    ...pendingProfile("dead-bug", "死虫式", "核心", "alternating", ["腹直肌", "腹横肌"], ["髋屈肌", "下背稳定肌"], "腰背贴稳地面，对侧手脚慢慢伸远。", catalogMedia("0276-iny3m5y.jpg", "dead-bug")),
    catalogSourceId: "0276",
    available: true,
    supportedViews: ["侧面", "斜侧面"],
    preparation: "摄像头放低，从侧面拍完整双手、躯干、双膝和双脚。",
    stageTitle: "仰卧屈膝抬腿，手脚两端留出空间",
    cameraTitle: "侧面拍到双手、肩、髋、双膝和双脚",
    cameraDetail: "伸出的手和脚不能被画面裁切",
    metricLabels: ["对侧伸展幅度", "躯干稳定"],
    checkpoints: [
      { label: "腰背", detail: "保持贴稳地面，不明显拱起。" },
      { label: "对侧", detail: "一侧手臂配另一侧腿伸远。" },
      { label: "节奏", detail: "慢慢伸展并回中，左右交替。" },
    ],
    phases: [
      { phase: "plank", label: "屈膝准备" },
      { phase: "left-lift", label: "左手右脚" },
      { phase: "plank", label: "回中" },
      { phase: "right-lift", label: "右手左脚" },
    ],
    issueKeys: ["range", "stability", "rhythm"],
  },
  burpee: {
    ...pendingProfile("burpee", "波比跳", "全身有氧", "repetition", ["股四头肌", "臀大肌", "心肺系统"], ["胸部", "肩部", "小腿", "腹部核心"], "双手先撑稳，完整收腿并站直后再开始下一次。", catalogMedia("1160-dK9394r.jpg", "burpee")),
    catalogSourceId: "1160",
    available: true,
    supportedViews: ["侧面", "斜侧面"],
    preparation: "全身入镜，在头顶和脚后方留出足够空间。",
    stageTitle: "侧面站立，给下蹲撑地和收腿留出空间",
    cameraTitle: "完整拍到头、双手和双脚",
    cameraDetail: "动作快，避免手脚离开画面边缘",
    metricLabels: ["动作阶段", "高位支撑直线"],
    checkpoints: [
      { label: "撑地", detail: "屈髋下蹲后双手稳定撑地。" },
      { label: "支撑", detail: "腿向后时收紧核心，不塌腰。" },
      { label: "回站", detail: "收腿后完整站直，再开始下一次。" },
    ],
    phases: [
      { phase: "standing", label: "站立" },
      { phase: "descending", label: "撑地" },
      { phase: "plank", label: "后伸" },
      { phase: "ascending", label: "回站" },
    ],
    issueKeys: ["range", "body-line", "stability"],
  },
} satisfies Partial<Record<ExerciseId, ExerciseCoachProfile>>;

export const EXERCISE_PROFILES = {
  ...BASE_EXERCISE_PROFILES,
  ...EXPANDED_EXERCISE_PROFILES,
  ...NEW_EXERCISE_PROFILES,
} as Record<ExerciseId, ExerciseCoachProfile>;

export const EXERCISE_ORDER: ExerciseId[] = [
  "squat", "jumping-jack", "reverse-lunge", "calf-raise", "high-knees",
  "push-up", "plank", "side-lunge", "glute-bridge", "knee-push-up",
  "bird-dog", "mountain-climber", "single-leg-deadlift", "shoulder-tap",
  "side-plank", "dead-bug", "burpee",
  ...EXPANDED_EXERCISE_IDS,
  ...NEW_EXERCISE_IDS,
];

export function exerciseName(id: ExerciseId | undefined): string {
  return EXERCISE_PROFILES[id ?? "squat"].name;
}
