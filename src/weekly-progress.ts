export interface WeeklyProgressCopy {
  countText: string;
  note: string;
  percent: number;
}

export function weeklyProgressCopy(completed: number, target = 3): WeeklyProgressCopy {
  const safeCompleted = Math.max(0, Math.floor(completed));
  const safeTarget = Math.max(1, Math.floor(target));
  const remaining = Math.max(0, safeTarget - safeCompleted);
  const extra = Math.max(0, safeCompleted - safeTarget);

  if (extra > 0) {
    return {
      countText: `${safeCompleted} 次`,
      note: `已超过本周目标 ${extra} 次。继续训练时也要给身体留出恢复时间。`,
      percent: 100,
    };
  }

  if (remaining === 0) {
    return {
      countText: `${safeCompleted} 次`,
      note: `已达到每周 ${safeTarget} 次目标。保持稳定，比偶尔一次练很久更重要。`,
      percent: 100,
    };
  }

  return {
    countText: `${safeCompleted} 次`,
    note: `距离每周 ${safeTarget} 次目标还差 ${remaining} 次，按身体状态安排即可。`,
    percent: Math.min(100, safeCompleted / safeTarget * 100),
  };
}
