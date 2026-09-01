import type { CompletedRep, IssueKey, SessionSummary } from "./types";

export interface IssueCoaching {
  label: string;
  repAdvice: string;
  speechAdvice: string;
  sessionTitle: string;
  sessionAdvice: string;
}

export interface RepAdvice {
  status: "qualified" | "adjust";
  title: string;
  message: string;
  primaryIssue: IssueKey | null;
  secondaryLabels: string[];
  speech: string;
}

export interface SessionAdvice {
  title: string;
  message: string;
  primaryIssue: IssueKey | null;
  issueSummary: string[];
}

const ISSUE_PRIORITY: readonly IssueKey[] = [
  "knees",
  "lean",
  "arms",
  "feet",
  "sync",
  "symmetry",
  "body-line",
  "alignment",
  "range",
  "stability",
  "rhythm",
  "depth",
  "speed",
];

export const ISSUE_COACHING: Record<IssueKey, IssueCoaching> = {
  knees: {
    label: "膝盖内扣",
    repAdvice: "下次让膝盖跟着脚尖方向移动",
    speechAdvice: "下次膝盖朝向脚尖",
    sessionTitle: "膝盖朝向脚尖",
    sessionAdvice: "下蹲和起身时，保持膝盖与脚尖方向大致一致",
  },
  lean: {
    label: "身体前倾",
    repAdvice: "下次抬起胸口，保持背部稳定",
    speechAdvice: "下次抬胸，背部稳定",
    sessionTitle: "抬起胸口",
    sessionAdvice: "收紧核心，保持背部稳定后再起身",
  },
  depth: {
    label: "深度不足",
    repAdvice: "下次让髋部再低一点，接近膝盖高度",
    speechAdvice: "下次髋部再低一点",
    sessionTitle: "让髋部再低一点",
    sessionAdvice: "接近膝盖高度后再起身，下降时保持稳定",
  },
  speed: {
    label: "下蹲偏快",
    repAdvice: "下次慢一点，控制下蹲",
    speechAdvice: "下次下蹲慢一点",
    sessionTitle: "放慢下蹲",
    sessionAdvice: "控制下降节奏，到达最低点后再稳定起身",
  },
  arms: {
    label: "手臂高度不足",
    repAdvice: "下一次把双手举过头顶",
    speechAdvice: "下一次手举高",
    sessionTitle: "双手举过头顶",
    sessionAdvice: "张开时让双臂充分上举，再顺势收回身体两侧",
  },
  feet: {
    label: "双脚打开不足",
    repAdvice: "下一次双脚再打开一点",
    speechAdvice: "下一次脚打开",
    sessionTitle: "双脚充分打开",
    sessionAdvice: "起跳时双脚向两侧打开，回落时重新并拢",
  },
  sync: {
    label: "手脚不同步",
    repAdvice: "下一次让手脚同时张开、同时收回",
    speechAdvice: "下一次手脚同步",
    sessionTitle: "让手脚同步",
    sessionAdvice: "手臂上举和双脚打开同时开始，并同时回到起始位",
  },
  symmetry: {
    label: "左右幅度不一致",
    repAdvice: "下一次两侧手臂保持同高",
    speechAdvice: "下一次两侧同高",
    sessionTitle: "保持左右对称",
    sessionAdvice: "正面完成动作，让左右手臂和双脚保持接近的幅度",
  },
  "body-line": {
    label: "身体没有保持直线",
    repAdvice: "下一次收紧核心，让肩、髋和脚踝保持一条线",
    speechAdvice: "收紧核心，身体成一直线",
    sessionTitle: "保持身体直线",
    sessionAdvice: "收紧腹部和臀部，避免髋部下沉或抬得过高",
  },
  alignment: {
    label: "关节方向需要调整",
    repAdvice: "下一次让膝盖和脚尖保持同一方向",
    speechAdvice: "膝盖对准脚尖",
    sessionTitle: "保持关节方向",
    sessionAdvice: "动作中让膝盖沿脚尖方向移动，不向内侧塌陷",
  },
  range: {
    label: "动作幅度不足",
    repAdvice: "下一次在稳定的前提下把动作再做完整一点",
    speechAdvice: "幅度再完整一点",
    sessionTitle: "完成动作幅度",
    sessionAdvice: "先保持身体稳定，再逐步完成完整的起落范围",
  },
  stability: {
    label: "身体不够稳定",
    repAdvice: "下一次放慢一点，先稳定身体再继续",
    speechAdvice: "先稳住身体",
    sessionTitle: "先保持稳定",
    sessionAdvice: "缩小速度波动，让核心和支撑脚先稳定下来",
  },
  rhythm: {
    label: "左右节奏不一致",
    repAdvice: "下一次保持左右交替和相近节奏",
    speechAdvice: "保持左右节奏",
    sessionTitle: "保持左右节奏",
    sessionAdvice: "左右侧依次完成，不抢拍也不漏掉一侧",
  },
};

function uniqueIssuesInPriorityOrder(issues: readonly IssueKey[]): IssueKey[] {
  const included = new Set(issues);
  return ISSUE_PRIORITY.filter((issue) => included.has(issue));
}

export function buildRepAdvice(rep: CompletedRep): RepAdvice {
  const issues = uniqueIssuesInPriorityOrder(rep.issues);
  const primaryIssue = issues[0] ?? null;

  if (primaryIssue === null) {
    const message = rep.exerciseId === "jumping-jack"
      ? "手脚同步、幅度到位，下一次继续保持"
      : rep.exerciseId === "squat" || rep.exerciseId === undefined
        ? "深度和节奏都不错，下一次继续保持"
        : "动作幅度和稳定性都不错，下一次继续保持";
    return {
      status: "qualified",
      title: `第 ${rep.repNumber} 次 · 合格`,
      message,
      primaryIssue: null,
      secondaryLabels: [],
      speech: `第 ${rep.repNumber} 次，合格`,
    };
  }

  const coaching = ISSUE_COACHING[primaryIssue];
  return {
    status: "adjust",
    title: `第 ${rep.repNumber} 次 · ${coaching.label}`,
    message: coaching.repAdvice,
    primaryIssue,
    secondaryLabels: issues
      .slice(1)
      .map((issue) => ISSUE_COACHING[issue].label),
    speech: coaching.speechAdvice,
  };
}

export function buildSessionAdvice(summary: SessionSummary): SessionAdvice {
  if (summary.totalReps === 0) {
    const isJumpingJack = summary.exerciseId === "jumping-jack";
    const isPlank = summary.measurementMode === "timed-hold";
    return {
      title: isPlank ? "先保持 1 秒有效姿势" : "先完成一次完整动作",
      message: isPlank
        ? "先从侧面进入平板支撑，让肩、髋和脚踝接近一条直线，系统会累计有效时间"
        : isJumpingJack
        ? "先手脚并拢完成校准，再完整张开并重新收回，系统才会评价这一动作"
        : summary.exerciseId === "squat" || summary.exerciseId === undefined
          ? "先站直校准，再下蹲并重新站直，系统才会评价这一动作"
          : "先按画面提示完成起始姿势，再完成一个完整动作，系统才会评价",
      primaryIssue: null,
      issueSummary: [],
    };
  }

  const issuesByFrequency = ISSUE_PRIORITY.filter(
    (issue) => (summary.issueCounts[issue] ?? 0) > 0,
  ).sort((left, right) => {
    const countDifference =
      (summary.issueCounts[right] ?? 0) - (summary.issueCounts[left] ?? 0);
    return countDifference !== 0
      ? countDifference
      : ISSUE_PRIORITY.indexOf(left) - ISSUE_PRIORITY.indexOf(right);
  });

  if (
    summary.qualifiedReps === summary.totalReps
  ) {
    const isJumpingJack = summary.exerciseId === "jumping-jack";
    const isPlank = summary.measurementMode === "timed-hold";
    const isSquat = summary.exerciseId === "squat" || summary.exerciseId === undefined;
    return {
      title: isPlank
        ? "保持现在的身体直线"
        : isJumpingJack
        ? "保持现在的幅度和同步"
        : isSquat
          ? "保持现在的深度和节奏"
          : "保持现在的动作幅度和稳定性",
      message: isPlank
        ? `本组有效保持 ${((summary.validDurationMs ?? 0) / 1_000).toFixed(1)} 秒，下一组继续自然呼吸`
        : isJumpingJack
        ? "本组动作全部合格，下一组继续让手脚同时张开、同时收回"
        : "本组动作全部合格，下一组继续稳定完成每一次",
      primaryIssue: null,
      issueSummary: [],
    };
  }

  if (issuesByFrequency.length === 0) {
    const percent = Math.round((summary.qualifiedReps / summary.totalReps) * 100);
    return {
      title: "先提高完整动作通过率",
      message: `本组合格率 ${percent}%，下一组放慢一点，完整回到起始姿势后再开始下一次`,
      primaryIssue: null,
      issueSummary: [`未通过完整标准 ${summary.totalReps - summary.qualifiedReps} 次`],
    };
  }

  const primaryIssue = issuesByFrequency[0];
  if (!primaryIssue) {
    throw new Error("训练总结缺少可用的问题统计");
  }

  const primaryCoaching = ISSUE_COACHING[primaryIssue];
  return {
    title: primaryCoaching.sessionTitle,
    message: primaryCoaching.sessionAdvice,
    primaryIssue,
    issueSummary: issuesByFrequency.map(
      (issue) =>
        `${ISSUE_COACHING[issue].label} ${summary.issueCounts[issue] ?? 0} 次`,
    ),
  };
}
