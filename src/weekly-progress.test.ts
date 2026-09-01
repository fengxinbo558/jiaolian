import { describe, expect, it } from "vitest";
import { weeklyProgressCopy } from "./weekly-progress";

describe("weeklyProgressCopy", () => {
  it("shows the actual count before reaching the target", () => {
    expect(weeklyProgressCopy(2)).toEqual({
      countText: "2 次",
      note: "距离每周 3 次目标还差 1 次，按身体状态安排即可。",
      percent: 2 / 3 * 100,
    });
  });

  it("marks the target as reached at three sessions", () => {
    expect(weeklyProgressCopy(3)).toEqual({
      countText: "3 次",
      note: "已达到每周 3 次目标。保持稳定，比偶尔一次练很久更重要。",
      percent: 100,
    });
  });

  it("keeps counting sessions beyond the target", () => {
    expect(weeklyProgressCopy(5)).toEqual({
      countText: "5 次",
      note: "已超过本周目标 2 次。继续训练时也要给身体留出恢复时间。",
      percent: 100,
    });
  });
});
