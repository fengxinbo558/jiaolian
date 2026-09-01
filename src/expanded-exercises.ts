import type {
  ExerciseCategory,
  ExerciseCoachProfile,
  ExerciseDifficulty,
  ExerciseDiscipline,
  ExerciseEquipment,
  ExerciseMode,
} from "./exercises";
import type { ExerciseId, WorkoutPhase } from "./types";

interface ExpandedExerciseInput {
  exerciseId: ExerciseId;
  name: string;
  discipline: ExerciseDiscipline;
  category: ExerciseCategory;
  mode: ExerciseMode;
  equipment: ExerciseEquipment;
  difficulty: ExerciseDifficulty;
  primary: string[];
  secondary: string[];
  cue: string;
  breath: string;
  views: string[];
  metrics: [string, string];
  met: number;
  catalog?: { id: string; sourceBasename: string };
  generated?: string;
  checkpoints?: Array<{ label: string; detail: string }>;
  mistakes?: Array<{ label: string; correction: string }>;
}

export const REALTIME_EXPANDED_EXERCISE_IDS = [
  "chair-pose",
  "warrior-two",
  "tree-pose",
  "downward-dog",
  "sumo-squat",
  "goblet-squat",
  "dumbbell-rdl",
  "dumbbell-shoulder-press",
  "dumbbell-lateral-raise",
  "dumbbell-biceps-curl",
] as const satisfies readonly ExerciseId[];

const realtimeExerciseIds = new Set<ExerciseId>(REALTIME_EXPANDED_EXERCISE_IDS);

const MODEST_CATALOG_EXERCISE_IDS = new Set<ExerciseId>([
  "curtsy-lunge",
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
  "skater-jump",
]);

function phases(mode: ExerciseMode): Array<{ phase: WorkoutPhase; label: string }> {
  if (mode === "timed-hold") {
    return [
      { phase: "calibrating", label: "准备" },
      { phase: "holding", label: "有效保持" },
      { phase: "paused", label: "调整" },
    ];
  }
  if (mode === "alternating") {
    return [
      { phase: "standing", label: "起始" },
      { phase: "left-lift", label: "左侧" },
      { phase: "right-lift", label: "右侧" },
      { phase: "ascending", label: "完成" },
    ];
  }
  return [
    { phase: "standing", label: "起始" },
    { phase: "lifting", label: "发力" },
    { phase: "top", label: "顶点" },
    { phase: "lowering", label: "还原" },
  ];
}

function media(input: ExpandedExerciseInput): ExerciseCoachProfile["media"] {
  if (input.generated) {
    return {
      kind: "project-generated",
      licenseStatus: "owned",
      reviewStatus: "verified",
      thumbnailUrl: `/assets/exercise-catalog/${input.generated}.png`,
      animationUrl: `/assets/exercise-catalog/${input.generated}.png`,
      attribution: "项目自有动作素材 · 按动作库黑白红肌群风格制作",
    };
  }
  if (!input.catalog) {
    return {
      kind: "project-generated",
      licenseStatus: "owned",
      reviewStatus: "pending",
      attribution: "等待项目自有示范素材审核",
    };
  }
  if (MODEST_CATALOG_EXERCISE_IDS.has(input.exerciseId)) {
    const correctedUrl = `/assets/exercise-catalog/${input.exerciseId}-modest-v2.png`;
    return {
      kind: "project-generated",
      licenseStatus: "user-authorized",
      reviewStatus: "verified",
      thumbnailUrl: correctedUrl,
      animationUrl: correctedUrl,
      sourceUrl: `https://github.com/hasaneyldrm/exercises-dataset/blob/main/images/${input.catalog.sourceBasename}.jpg`,
      attribution: "动作库授权素材 · 项目服装遮挡修正版",
    };
  }
  return {
    kind: "catalog",
    licenseStatus: "user-authorized",
    reviewStatus: "verified",
    thumbnailUrl: `/assets/exercise-catalog/${input.exerciseId}.jpg`,
    animationUrl: `/assets/exercise-catalog/${input.exerciseId}.gif`,
    sourceUrl: `https://github.com/hasaneyldrm/exercises-dataset/blob/main/images/${input.catalog.sourceBasename}.jpg`,
    attribution: "© Gym visual — https://gymvisual.com/",
  };
}

function expanded(input: ExpandedExerciseInput): ExerciseCoachProfile {
  const equipmentLabel = ({
    none: "无需器械",
    "single-dumbbell": "准备一只哑铃",
    "pair-dumbbells": "准备一对哑铃",
    "single-or-pair": "可使用一只或一对哑铃",
    "resistance-band": "准备一根完好的弹力带",
  } as const)[input.equipment];
  const defaultCheckpoints = [
    { label: "起始", detail: `先稳定进入${input.name}起始姿势。` },
    { label: "发力", detail: input.cue },
    { label: "控制", detail: "保持动作可控，不用惯性抢速度。" },
  ];
  return {
    exerciseId: input.exerciseId,
    name: input.name,
    catalogSourceId: input.catalog?.id ?? `project-${input.exerciseId}`,
    category: input.category,
    mode: input.mode,
    available: realtimeExerciseIds.has(input.exerciseId),
    discipline: input.discipline,
    equipment: input.equipment,
    difficulty: input.difficulty,
    supportedViews: input.views,
    muscles: `${input.primary.join("、")}；${input.secondary.join("、")}辅助参与`,
    primaryMuscles: input.primary,
    secondaryMuscles: input.secondary,
    activationCue: input.cue,
    breathingCue: input.breath,
    safetyNotes: [
      equipmentLabel,
      input.discipline === "dumbbell" ? "选择能够稳定控制的重量，头顶和脚下留出安全空间。" : "清理周围空间，动作过程中如有不适立即停止。",
    ],
    commonMistakes: input.mistakes ?? [
      { label: "动作幅度不足", correction: "在保持稳定的前提下完成目标幅度。" },
      { label: "身体晃动", correction: "收紧核心，放慢动作并重新稳定。" },
    ],
    met: input.met,
    preparation: `${input.views.join("或")}全身入镜。${equipmentLabel}，头、手和脚不要被画面裁切。`,
    stageTitle: `${input.name}｜${input.views.join(" / ")}视角`,
    cameraTitle: `${input.views[0]}站到画面中央，完整显示身体`,
    cameraDetail: `${equipmentLabel}；动作范围两侧和头顶都要留出空间`,
    metricLabels: input.metrics,
    checkpoints: input.checkpoints ?? defaultCheckpoints,
    phases: phases(input.mode),
    issueKeys: ["range", "alignment", "stability", "rhythm"],
    media: media(input),
  };
}

const inputs: ExpandedExerciseInput[] = [
  { exerciseId: "mountain-pose", name: "山式", discipline: "yoga", category: "瑜伽", mode: "timed-hold", equipment: "none", difficulty: "入门", primary: ["足底稳定肌", "腹部核心"], secondary: ["臀肌", "背部稳定肌"], cue: "双脚压地，头顶向上延伸，肩膀自然放松。", breath: "保持自然、均匀的鼻呼吸。", views: ["正面", "侧面"], metrics: ["身体直线", "左右平衡"], met: 2.5, generated: "mountain-pose" },
  { exerciseId: "chair-pose", name: "幻椅式", discipline: "yoga", category: "瑜伽", mode: "timed-hold", equipment: "none", difficulty: "入门", primary: ["股四头肌", "臀大肌"], secondary: ["小腿", "腹部核心", "竖脊肌"], cue: "髋部向后坐，膝盖跟随脚尖，胸口保持抬起。", breath: "进入动作时呼气，保持时均匀呼吸。", views: ["侧面", "斜侧面"], metrics: ["膝髋角度", "躯干稳定"], met: 3.0, generated: "chair-pose" },
  { exerciseId: "warrior-two", name: "战士二式", discipline: "yoga", category: "瑜伽", mode: "timed-hold", equipment: "none", difficulty: "入门", primary: ["股四头肌", "臀中肌"], secondary: ["内收肌", "三角肌", "腹部核心"], cue: "前膝对准脚尖，双臂向两侧延伸，骨盆保持稳定。", breath: "保持自然呼吸，每次呼气时放松肩膀。", views: ["正面"], metrics: ["前膝方向", "手臂水平"], met: 3.0, generated: "warrior-two" },
  { exerciseId: "tree-pose", name: "树式", discipline: "yoga", category: "瑜伽", mode: "timed-hold", equipment: "none", difficulty: "入门", primary: ["臀中肌", "足踝稳定肌"], secondary: ["内收肌", "腹部核心"], cue: "支撑脚压稳，抬起的脚避开膝关节，骨盆保持水平。", breath: "目视固定点，保持缓慢均匀呼吸。", views: ["正面"], metrics: ["单腿平衡", "骨盆水平"], met: 2.5, generated: "tree-pose" },
  { exerciseId: "downward-dog", name: "下犬式", discipline: "yoga", category: "瑜伽", mode: "timed-hold", equipment: "none", difficulty: "入门", primary: ["肩部稳定肌", "腘绳肌"], secondary: ["小腿", "背阔肌", "腹部核心"], cue: "双手推地，髋部向后上方延伸，背部保持拉长。", breath: "保持自然呼吸，呼气时轻轻延伸髋部。", views: ["侧面"], metrics: ["髋部高度", "背部延伸"], met: 3.0, generated: "downward-dog" },

  { exerciseId: "sumo-squat", name: "相扑深蹲", discipline: "bodyweight", category: "下肢", mode: "repetition", equipment: "none", difficulty: "入门", primary: ["臀大肌", "股四头肌", "内收肌"], secondary: ["腘绳肌", "腹部核心"], cue: "双脚宽站，膝盖跟着脚尖方向下蹲并稳定站起。", breath: "下降吸气，站起时呼气。", views: ["正面", "侧面"], metrics: ["膝关节角度", "站距与膝盖方向"], met: 5.0, generated: "sumo-squat" },
  { exerciseId: "bulgarian-split-squat", name: "保加利亚分腿蹲", discipline: "bodyweight", category: "下肢", mode: "alternating", equipment: "none", difficulty: "进阶", primary: ["臀大肌", "股四头肌"], secondary: ["腘绳肌", "小腿", "腹部核心"], cue: "前脚压稳地面，身体垂直下沉，再用前腿站起。", breath: "下沉吸气，站起呼气。", views: ["斜侧面"], metrics: ["前膝角度", "躯干稳定"], met: 5.5, generated: "bulgarian-split-squat" },
  { exerciseId: "curtsy-lunge", name: "交叉弓步", discipline: "bodyweight", category: "下肢", mode: "alternating", equipment: "none", difficulty: "进阶", primary: ["臀大肌", "臀中肌"], secondary: ["股四头肌", "内收肌", "腹部核心"], cue: "后脚斜向交叉，前膝保持对准脚尖后推回站立。", breath: "下沉吸气，推回时呼气。", views: ["正面", "斜侧面"], metrics: ["交叉幅度", "前膝方向"], met: 5.0, catalog: { id: "3769", sourceBasename: "3769-gUjqdei" } },
  { exerciseId: "jump-squat", name: "深蹲跳", discipline: "bodyweight", category: "全身有氧", mode: "repetition", equipment: "none", difficulty: "进阶", primary: ["股四头肌", "臀大肌", "小腿"], secondary: ["腘绳肌", "腹部核心"], cue: "髋膝屈曲后向上起跳，落地时轻稳缓冲。", breath: "下蹲吸气，起跳呼气。", views: ["正面", "侧面"], metrics: ["下蹲幅度", "落地缓冲"], met: 8.0, catalog: { id: "0514", sourceBasename: "0514-LIlE5Tn" } },
  { exerciseId: "skater-jump", name: "滑冰跳", discipline: "bodyweight", category: "全身有氧", mode: "alternating", equipment: "none", difficulty: "进阶", primary: ["臀中肌", "股四头肌"], secondary: ["小腿", "内收肌", "腹部核心"], cue: "侧向跳动后单脚稳定落地，膝盖保持对准脚尖。", breath: "保持连续自然呼吸。", views: ["正面"], metrics: ["侧向幅度", "落地稳定"], met: 8.0, catalog: { id: "3361", sourceBasename: "3361-zfNHMN9" } },
  { exerciseId: "pike-push-up", name: "派克俯卧撑", discipline: "bodyweight", category: "上肢", mode: "repetition", equipment: "none", difficulty: "进阶", primary: ["三角肌", "肱三头肌"], secondary: ["上胸部", "腹部核心"], cue: "髋部保持高位，头部向双手之间控制下降。", breath: "下降吸气，推起呼气。", views: ["侧面"], metrics: ["肘部角度", "髋部稳定"], met: 6.0, generated: "pike-push-up" },
  { exerciseId: "narrow-push-up", name: "窄距俯卧撑", discipline: "bodyweight", category: "上肢", mode: "repetition", equipment: "none", difficulty: "进阶", primary: ["肱三头肌", "胸大肌"], secondary: ["三角肌前束", "腹部核心"], cue: "双手窄于肩宽，肘部靠近身体，肩髋脚保持成线。", breath: "下降吸气，推起呼气。", views: ["侧面"], metrics: ["肘部角度", "身体直线"], met: 6.0, catalog: { id: "0259", sourceBasename: "0259-x6KpKpq" } },
  { exerciseId: "superman", name: "超人式", discipline: "bodyweight", category: "核心", mode: "timed-hold", equipment: "none", difficulty: "入门", primary: ["竖脊肌", "臀大肌"], secondary: ["肩后束", "腘绳肌"], cue: "俯卧同时抬起手臂和双腿，颈部保持自然。", breath: "抬起时呼气，保持时自然呼吸。", views: ["侧面"], metrics: ["手脚抬升", "腰背稳定"], met: 3.5, generated: "superman" },
  { exerciseId: "bicycle-crunch", name: "自行车卷腹", discipline: "bodyweight", category: "核心", mode: "alternating", equipment: "none", difficulty: "进阶", primary: ["腹直肌", "腹斜肌"], secondary: ["髋屈肌", "腹横肌"], cue: "对侧肘膝靠近，另一条腿控制伸直，腰背保持稳定。", breath: "转体时呼气，回中吸气。", views: ["侧面", "斜侧面"], metrics: ["对侧靠近", "躯干控制"], met: 5.0, generated: "bicycle-crunch" },
  { exerciseId: "leg-raise", name: "仰卧举腿", discipline: "bodyweight", category: "核心", mode: "repetition", equipment: "none", difficulty: "进阶", primary: ["腹直肌", "髋屈肌"], secondary: ["腹横肌", "股直肌"], cue: "腰背贴稳地面，双腿一起抬起并控制落下。", breath: "抬腿呼气，控制落下时吸气。", views: ["侧面"], metrics: ["抬腿角度", "腰背稳定"], met: 4.0, catalog: { id: "0865", sourceBasename: "0865-9IxJdtC" } },

  { exerciseId: "goblet-squat", name: "高脚杯深蹲", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "single-dumbbell", difficulty: "入门", primary: ["臀大肌", "股四头肌"], secondary: ["内收肌", "腹部核心", "上背部"], cue: "哑铃靠近胸口，髋膝同步下蹲并完整站起。", breath: "下降吸气，站起呼气。", views: ["正面", "侧面"], metrics: ["深蹲幅度", "躯干稳定"], met: 6.0, catalog: { id: "1760", sourceBasename: "1760-yn8yg1r" } },
  { exerciseId: "dumbbell-rdl", name: "哑铃罗马尼亚硬拉", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "pair-dumbbells", difficulty: "入门", primary: ["腘绳肌", "臀大肌"], secondary: ["竖脊肌", "背阔肌", "腹部核心"], cue: "膝盖微屈，髋部向后推，背部保持稳定后伸髋站直。", breath: "髋部后移吸气，站起呼气。", views: ["侧面", "斜侧面"], metrics: ["髋折叠角度", "背部稳定"], met: 6.0, catalog: { id: "1459", sourceBasename: "1459-rR0LJzx" } },
  { exerciseId: "dumbbell-reverse-lunge", name: "哑铃反向弓步", discipline: "dumbbell", category: "哑铃", mode: "alternating", equipment: "single-or-pair", difficulty: "进阶", primary: ["臀大肌", "股四头肌"], secondary: ["腘绳肌", "小腿", "腹部核心"], cue: "后撤时前脚压稳，身体垂直下沉后回到并脚。", breath: "下沉吸气，回站呼气。", views: ["斜侧面"], metrics: ["前膝角度", "躯干稳定"], met: 6.0, catalog: { id: "0381", sourceBasename: "0381-SSsBDwB" } },
  { exerciseId: "dumbbell-sumo-squat", name: "哑铃相扑深蹲", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "single-dumbbell", difficulty: "入门", primary: ["臀大肌", "内收肌", "股四头肌"], secondary: ["腘绳肌", "腹部核心"], cue: "宽站握住哑铃，膝盖跟随脚尖下蹲并稳定站起。", breath: "下降吸气，站起呼气。", views: ["正面", "侧面"], metrics: ["深蹲幅度", "膝盖方向"], met: 6.0, generated: "dumbbell-sumo-squat" },
  { exerciseId: "dumbbell-split-squat", name: "哑铃分腿蹲", discipline: "dumbbell", category: "哑铃", mode: "alternating", equipment: "single-or-pair", difficulty: "进阶", primary: ["臀大肌", "股四头肌"], secondary: ["腘绳肌", "小腿", "腹部核心"], cue: "分腿站稳后垂直下沉，前膝保持对准脚尖。", breath: "下沉吸气，站起呼气。", views: ["斜侧面"], metrics: ["前膝角度", "身体稳定"], met: 6.0, catalog: { id: "0410", sourceBasename: "0410-qx4fgX7" } },
  { exerciseId: "dumbbell-glute-bridge", name: "哑铃臀桥", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "single-dumbbell", difficulty: "入门", primary: ["臀大肌", "腘绳肌"], secondary: ["腹部核心", "内收肌"], cue: "哑铃稳定放在髋部，脚跟压地将髋部抬高。", breath: "抬髋呼气，控制落下吸气。", views: ["侧面"], metrics: ["髋部高度", "躯干稳定"], met: 5.0, generated: "dumbbell-glute-bridge" },
  { exerciseId: "dumbbell-shoulder-press", name: "哑铃推举", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "pair-dumbbells", difficulty: "入门", primary: ["三角肌", "肱三头肌"], secondary: ["上胸部", "斜方肌", "腹部核心"], cue: "哑铃从肩侧向上推起，肋骨和骨盆保持稳定。", breath: "推起呼气，下降吸气。", views: ["正面", "侧面"], metrics: ["手臂上举幅度", "躯干稳定"], met: 5.0, catalog: { id: "0426", sourceBasename: "0426-A6wtbuL" } },
  { exerciseId: "arnold-press", name: "阿诺德推举", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "pair-dumbbells", difficulty: "进阶", primary: ["三角肌", "肱三头肌"], secondary: ["上胸部", "斜方肌"], cue: "从掌心向内开始，旋转并向上推起，下降时原路返回。", breath: "推起呼气，下降吸气。", views: ["正面"], metrics: ["旋转与上举", "左右对称"], met: 5.0, catalog: { id: "2137", sourceBasename: "2137-Xy4jlWA" } },
  { exerciseId: "dumbbell-lateral-raise", name: "哑铃侧平举", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "pair-dumbbells", difficulty: "入门", primary: ["三角肌中束"], secondary: ["斜方肌", "冈上肌", "腹部核心"], cue: "手臂向两侧抬到接近肩高，肩膀保持放松并控制落下。", breath: "抬起呼气，下降吸气。", views: ["正面"], metrics: ["手臂高度", "左右对称"], met: 4.0, catalog: { id: "0334", sourceBasename: "0334-DsgkuIt" } },
  { exerciseId: "dumbbell-front-raise", name: "哑铃前平举", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "single-or-pair", difficulty: "入门", primary: ["三角肌前束"], secondary: ["上胸部", "腹部核心"], cue: "手臂向前抬到肩高，躯干不要后仰借力。", breath: "抬起呼气，下降吸气。", views: ["正面", "侧面"], metrics: ["手臂高度", "躯干稳定"], met: 4.0, catalog: { id: "0310", sourceBasename: "0310-3eGE2JC" } },
  { exerciseId: "dumbbell-bent-over-row", name: "哑铃俯身划船", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "pair-dumbbells", difficulty: "入门", primary: ["背阔肌", "菱形肌"], secondary: ["肱二头肌", "三角肌后束", "竖脊肌"], cue: "髋部后移保持背部稳定，肘部向后拉并控制下放。", breath: "拉起呼气，下放吸气。", views: ["侧面", "斜侧面"], metrics: ["肘部后拉", "背部稳定"], met: 5.5, catalog: { id: "0293", sourceBasename: "0293-BJ0Hz5L" } },
  { exerciseId: "single-arm-dumbbell-row", name: "单臂哑铃划船", discipline: "dumbbell", category: "哑铃", mode: "alternating", equipment: "single-dumbbell", difficulty: "入门", primary: ["背阔肌", "菱形肌"], secondary: ["肱二头肌", "三角肌后束", "腹部核心"], cue: "髋部保持稳定，肘部贴近身体向后拉。", breath: "拉起呼气，下放吸气。", views: ["侧面", "斜侧面"], metrics: ["单臂划船幅度", "躯干稳定"], met: 5.5, catalog: { id: "0292", sourceBasename: "0292-C0MA9bC" } },
  { exerciseId: "dumbbell-reverse-fly", name: "哑铃反向飞鸟", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "pair-dumbbells", difficulty: "进阶", primary: ["三角肌后束", "菱形肌"], secondary: ["斜方肌", "竖脊肌"], cue: "俯身保持背部稳定，双臂向两侧打开并控制回落。", breath: "打开呼气，回落吸气。", views: ["正面", "斜侧面"], metrics: ["手臂打开幅度", "背部稳定"], met: 5.0, catalog: { id: "0383", sourceBasename: "0383-EAs3xL9" } },
  { exerciseId: "dumbbell-biceps-curl", name: "哑铃弯举", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "pair-dumbbells", difficulty: "入门", primary: ["肱二头肌"], secondary: ["肱肌", "肱桡肌", "前臂"], cue: "肘部靠近身体，前臂向上弯举，控制哑铃下降。", breath: "弯举呼气，下降吸气。", views: ["正面", "侧面"], metrics: ["肘部屈曲", "躯干借力"], met: 4.0, catalog: { id: "0416", sourceBasename: "0416-3s4NnTh" } },
  { exerciseId: "hammer-curl", name: "锤式弯举", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "pair-dumbbells", difficulty: "入门", primary: ["肱肌", "肱桡肌"], secondary: ["肱二头肌", "前臂"], cue: "掌心相对，肘部保持稳定，将哑铃向肩部方向弯举。", breath: "弯举呼气，下降吸气。", views: ["正面", "侧面"], metrics: ["肘部屈曲", "左右对称"], met: 4.0, catalog: { id: "0313", sourceBasename: "0313-slDvUAU" } },
  { exerciseId: "overhead-triceps-extension", name: "过顶臂屈伸", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "single-dumbbell", difficulty: "入门", primary: ["肱三头肌"], secondary: ["三角肌", "腹部核心"], cue: "上臂靠近耳侧，伸直肘部举起哑铃并控制下降。", breath: "伸直呼气，屈肘吸气。", views: ["侧面", "正面"], metrics: ["肘部伸展", "上臂稳定"], met: 4.0, catalog: { id: "0430", sourceBasename: "0430-PdmaD0N" } },
  { exerciseId: "dumbbell-kickback", name: "哑铃臂后伸", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "single-or-pair", difficulty: "入门", primary: ["肱三头肌"], secondary: ["三角肌后束", "竖脊肌"], cue: "俯身保持上臂稳定，伸直肘部后控制返回。", breath: "伸直呼气，返回吸气。", views: ["侧面"], metrics: ["肘部伸展", "背部稳定"], met: 4.0, catalog: { id: "0420", sourceBasename: "0420-UmpPAAe" } },
  { exerciseId: "dumbbell-floor-press", name: "哑铃地板卧推", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "pair-dumbbells", difficulty: "入门", primary: ["胸大肌", "肱三头肌"], secondary: ["三角肌前束", "腹部核心"], cue: "仰卧屈膝，肘部轻触地面后向上推起哑铃。", breath: "下降吸气，推起呼气。", views: ["侧面", "斜侧面"], metrics: ["肘部角度", "左右对称"], met: 5.0, generated: "dumbbell-floor-press" },
  { exerciseId: "dumbbell-floor-fly", name: "哑铃地板飞鸟", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "pair-dumbbells", difficulty: "进阶", primary: ["胸大肌"], secondary: ["三角肌前束", "肱二头肌"], cue: "肘部微屈向两侧打开，接近地面后用胸部带回。", breath: "打开吸气，合拢呼气。", views: ["斜侧面"], metrics: ["手臂打开幅度", "左右对称"], met: 5.0, generated: "dumbbell-floor-fly" },
  { exerciseId: "dumbbell-thruster", name: "哑铃深蹲推举", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "pair-dumbbells", difficulty: "进阶", primary: ["股四头肌", "臀大肌", "三角肌"], secondary: ["肱三头肌", "腹部核心", "小腿"], cue: "深蹲站起的力量连续带动哑铃向上推起，再控制回到肩侧。", breath: "下蹲吸气，站起推举时呼气。", views: ["正面", "斜侧面"], metrics: ["深蹲与推举阶段", "全身稳定"], met: 8.0, generated: "dumbbell-thruster" },
];

export const EXPANDED_EXERCISE_PROFILES = Object.fromEntries(
  inputs.map((input) => [input.exerciseId, expanded(input)]),
) as Partial<Record<ExerciseId, ExerciseCoachProfile>>;

export const EXPANDED_EXERCISE_IDS = inputs.map((input) => input.exerciseId);
