# 瑜伽、徒手与哑铃动作扩展实施计划

**依据：** `docs/superpowers/specs/2026-08-21-yoga-bodyweight-dumbbell-expansion-design.md`  
**目标：** 将动作库扩展到 52 个，全部新增动作具备完整资料，首批 10 个动作开放经过验证的实时训练。

## 阶段 1：数据协议与动作资料

涉及文件：

- `src/types.ts`
- `src/exercises.ts`
- `src/calories.ts`
- `src/exercises.test.ts`
- `src/calories.test.ts`
- `src/storage.ts`

任务：

1. 扩展 35 个 `ExerciseId`。
2. 增加 discipline、equipment、difficulty、breathingCue、safetyNotes、commonMistakes 和 met。
3. 加入 5 个瑜伽、10 个徒手、20 个哑铃完整资料。
4. 更新动作顺序、动作名称、热量记录和本地历史兼容。
5. 测试数量必须精确为 52，新增分类数量必须为 5/10/20。

## 阶段 2：素材审核与映射

涉及文件：

- `reference/exercises-dataset/data/exercises.json`（只读）
- `scripts/review-exercise-assets.mjs`
- `src/reviewed-exercise-assets.ts`
- `public/assets/exercise-catalog/`

任务：

1. 按英文名称、器械、动作说明和媒体实际内容筛选候选。
2. 输出审核清单，记录通过、拒绝和拒绝原因。
3. 只复制完全匹配的本地图片/GIF到运行时目录。
4. 缺失素材进入项目自有生成列表，不用相似素材补位。

## 阶段 3：动作库与详情界面

涉及文件：

- `index.html`
- `src/main.ts`
- `src/style.css`
- `tests/browser_smoke.py`

任务：

1. 增加瑜伽、哑铃筛选。
2. 动作卡显示器械、难度、主要/辅助肌群和审核状态。
3. 动作详情显示呼吸、安全提示、常见错误和拍摄视角。
4. 审核中的动作保持可浏览，但训练按钮必须禁用并解释原因。
5. 手机动作卡不出现横向滚动，按钮触控面积不小于 44px。

## 阶段 4：瑜伽与相扑深蹲实时分析

涉及文件：

- `src/analysis/yoga-analyzer.ts`
- `src/analysis/yoga-analyzer.test.ts`
- `src/analysis/strength-analyzer.ts`
- `src/analysis/strength-analyzer.test.ts`
- `src/main.ts`
- `src/coaching.ts`

任务：

1. 实现幻椅式、战士二式、树式、下犬式有效保持。
2. 实现相扑深蹲完整闭环和个人站距基线。
3. 遮挡时冻结，恢复后重新确认，不补算中断时间。
4. 语音只播当前可执行问题，同类问题使用冷却时间。

## 阶段 5：哑铃实时分析

涉及文件：

- `src/analysis/strength-analyzer.ts`
- `src/analysis/strength-analyzer.test.ts`
- `src/feedback.ts`
- `src/main.ts`

任务：

1. 实现高脚杯深蹲和罗马尼亚硬拉。
2. 实现推举、侧平举和弯举。
3. 正面支持左右对称，侧面支持躯干借力和动作幅度。
4. 不检测哑铃重量、握力或真实器械轨迹。

## 阶段 6：统一示范素材

涉及文件：

- `public/assets/exercise-catalog/`
- `src/reviewed-exercise-assets.ts`

任务：

1. 为本地库没有匹配素材的动作生成统一风格示范。
2. 每张图核对动作、器械、阶段、视角和发力肌群。
3. 生成素材必须标为项目自有，不混用第三方署名。

## 阶段 7：最终验证

验证命令与流程：

1. `npm test`
2. `npm run build`
3. 10 个实时动作的标准、错误、遮挡、恢复和多帧率矩阵。
4. 375px、390px、横屏和 1440px 页面检查。
5. 真实摄像头逐动作检查素材、计量、语音取消和总结。

只有同时通过素材、规则、自动测试和真实摄像头验收的动作，才把 `available` 切换为 `true`。
