# fitness-coach × Ant Design 规范梳理

> 查证日期：2026-08-28  
> 官方文档页面版本：Ant Design **6.6.1**（页面当日显示）  
> 范围：Ant Design React v6 官方规范、官方 GitHub 仓库、Ant Design Mobile 官方入口，以及 WCAG 2.2 官方无障碍要求。  
> 本文目标：作为 fitness-coach 网页端与未来移动 Web 的设计基线；不是要求把页面做成 Ant Design 默认后台，也不等于必须引入 `antd` 依赖。

## 0. 先说结论

当前项目是原生 TypeScript + Vite，并未使用 React 或 Ant Design。最合适的改法是：

1. **第一阶段只采用规范**：把颜色、字号、间距、圆角、层级、状态、组件行为统一成项目自己的 CSS Token 和组件规则，不为“套规范”重写技术栈。
2. **桌面 Web 借 Ant Design 的系统性**：信息层级、表单校验、反馈、空状态、加载、错误恢复、可访问状态直接借鉴。
3. **移动 Web 不照搬桌面 Ant Design**：桌面默认 32px 控件不适合训练中的触控；移动端优先采用 Ant Design Mobile 的交互思路，核心按钮至少 48px 高。
4. **保留健身产品个性**：训练图片、真人视觉、实时镜头、训练状态、数据进度必须定制；默认蓝色、密集表格、办公软件式菜单不直接使用。
5. **先统一，再美化**：先确定 Token 和组件契约，再逐页换 UI。后续需求只改 Token 或组件，不整体翻修。

---

## 1. 官方设计价值观，如何转成健身产品规则

Ant Design 官方四个价值观是 Natural、Certain、Meaningful、Growing（[官方设计价值观](https://ant.design/docs/spec/values/)；[v6 DESIGN.md](https://github.com/ant-design/ant-design/blob/master/DESIGN.md)）。

| 官方价值观 | 在 fitness-coach 中的落地规则 | 不允许出现 |
|---|---|---|
| 自然 Natural | 页面顺序贴合“选训练 → 准备 → 实时训练 → 休息/切换 → 总结”；常见动作使用常见叫法；视觉、语音、震动互补 | 系统播报落后于动作；为了动画而动画；用户找不到下一步 |
| 确定 Certain | 每个按钮有明确状态；训练中始终显示当前动作、目标、已完成、下一步；保存/未保存、识别中/失去识别清晰 | 同一按钮既像标签又能点击；只靠颜色表达状态；未训练却给“完成不错” |
| 有意义 Meaningful | 每一块信息帮助用户做决定；主操作一屏只有一个；训练反馈要说事实、原因和下一次怎么做 | 大标题压过内容；装饰卡片堆叠；空洞夸奖；数字没有单位或意义 |
| 成长 Growing | 新手能直接开始，进阶用户能看历史、组数、重量、趋势；AI 建议必须说明依据和置信度 | 一开始塞满高级参数；系统假装知道用户未提供的数据 |

### 信息层级固定为四级

1. **任务级**：当前用户最需要完成的任务，例如“开始下肢训练”“继续第 2 组”。一屏只允许一个最强视觉焦点。
2. **决策级**：完成任务必须知道的 3–5 项信息，例如动作、次数、组数、休息、器械。
3. **解释级**：为什么推荐、主要训练部位、注意事项、数据来源。
4. **辅助级**：收藏、分享、更多、历史详情、说明。

禁止用字号代替结构。页面 H1 不应无限放大；移动端主标题建议 28–32px，桌面 36–48px，只有封面营销语允许更大。

---

## 2. Token 架构：官方层级与项目实现

Ant Design v6 采用 **Seed Token → Map Token → Alias Token → Component Token** 的派生关系；优先改 Seed，局部差异再改组件 Token。官方支持 `ConfigProvider`、CSS Variables、明暗算法、嵌套主题和 v6 zero-runtime（[官方主题文档](https://ant.design/docs/react/customize-theme/)）。

本项目即使不安装 Ant Design，也要复用这个分层：

```text
品牌种子（brand / success / warning / error / info）
  → 色阶、背景阶梯、字号阶梯、间距阶梯
    → 语义变量（text-primary / surface-card / action-primary）
      → 组件变量（button-height / card-radius / input-border）
```

业务代码只用语义变量，不直接写 `#fff`、`#000`、任意阴影和任意间距。

### 2.1 颜色

#### Ant Design v6 官方默认值

| 语义 | 默认值 |
|---|---|
| Primary / Info | `#1677FF` |
| Success | `#52C41A` |
| Warning | `#FAAD14` |
| Error | `#FF4D4F` |
| 页面背景 | `#F5F5F5` |
| 容器 / 浮层 | `#FFFFFF` / `#FFFFFF`（浮层用阴影区分） |
| 主文字 | `rgba(0,0,0,.88)` |
| 次文字 | `rgba(0,0,0,.65)` |
| 描述文字 | `rgba(0,0,0,.45)` |
| 禁用文字 | `rgba(0,0,0,.25)` |
| 一级 / 次级边框 | `#D9D9D9` / `#F0F0F0` |

#### fitness-coach 建议主题（可直接采用）

这是**日间浅色优先**的健身主题，不使用纯黑通铺：

| 项目语义变量 | 建议值 | 用途 |
|---|---:|---|
| `--color-bg-layout` | `#F3F0E9` | 页面底色，暖灰纸张感 |
| `--color-bg-container` | `#FBF9F4` | 卡片、表单、数据面板 |
| `--color-bg-elevated` | `#FFFFFF` | 弹窗、菜单、浮层 |
| `--color-text` | `#191815` | 标题、正文 |
| `--color-text-secondary` | `#6D6A62` | 描述、辅助信息 |
| `--color-border` | `rgba(25,24,21,.16)` | 控件、卡片边界 |
| `--color-border-secondary` | `rgba(25,24,21,.09)` | 分割线 |
| `--color-primary` | `#206B68` | 主操作、选中、焦点；沉稳青绿 |
| `--color-primary-hover` | `#2B7E79` | 桌面 hover |
| `--color-primary-active` | `#155653` | press / active |
| `--color-accent` | `#EF6A45` | 训练强度、重点提醒；不能代替主操作 |
| `--color-success` | `#217158` | 真正完成、识别稳定 |
| `--color-warning` | `#B66F16` | 姿势风险、数据待确认 |
| `--color-error` | `#A33F32` | 失败、危险动作、不可恢复错误 |
| `--color-info` | `#326B92` | 系统说明、模型状态 |

规则：

- 一屏主色实心按钮最多一个；辅助动作使用描边或文字按钮。
- 成功、警告、错误、信息颜色固定语义，不能随页面换色。
- 肌肉发力红色属于内容可视化色，不能同时拿来表示系统错误。
- 选中状态必须同时拥有颜色以外的提示：底色、边框、图标、文字或 `aria-current`。
- 图表用预设分类色；同一指标跨页面保持同色。

### 2.2 字体、字号、行高

官方建议系统字体、正文基准 14px、常用字重 400/600，并控制字号种类；数字列使用 `tabular-nums`（[官方字体规范](https://ant.design/docs/spec/font/)）。

fitness-coach 建议：

| Token | 桌面 | 移动 | 用途 |
|---|---:|---:|---|
| `--font-body-sm` | 12/20 | 13/20 | 标签、次要说明 |
| `--font-body` | 14/22 | 15/23 | 默认正文 |
| `--font-body-lg` | 16/24 | 16/24 | 引导文字、关键表单 |
| `--font-title-sm` | 18/26, 600 | 18/26, 600 | 卡片标题 |
| `--font-title` | 24/32, 600 | 22/30, 600 | 区块标题 |
| `--font-page-title` | 36–48/1.08, 600 | 28–32/1.15, 600 | 页面标题 |
| `--font-metric` | 28–44/1, 600 | 26–36/1, 600 | 训练次数、时间、热量 |

- 中文界面优先系统中文字体；展示字体只用于品牌和封面，不用于表单、数据和训练反馈。
- 不用 300 以下细体，不用 700+ 大面积粗体。
- 数字、计时器、组数统一 `font-variant-numeric: tabular-nums`。
- 正文每行约 35–45 个中文字符；说明文字不铺满大屏。

### 2.3 间距与布局

Ant Design v6 使用 4px 栅格，核心阶梯 4 / 8 / 16 / 24 / 32；24 栅格用于桌面复杂布局（[v6 DESIGN.md](https://github.com/ant-design/ant-design/blob/master/DESIGN.md)、[Grid](https://ant.design/components/grid/)）。

项目采用：

```text
spacing: 4, 8, 12, 16, 24, 32, 40, 48, 64
mobile page padding: 16
tablet page padding: 24
desktop page padding: 32–48
card inner padding: mobile 16 / desktop 20–24
related items gap: 8–12
sections gap: 24–40
```

- 同一组件内以 4px 为单位；页面大区块允许 8px 倍数。
- 禁止随手写 13、19、27px 等魔法数字。
- 桌面采用 24 栅格或 CSS Grid；最多 4 张并排卡片。
- 移动端以单列为主；关键数据最多 2 列，不能把桌面 4 列硬缩。

### 2.4 响应式断点

采用 Ant Design 的断点名称，便于未来迁移：

```text
xs < 576
sm ≥ 576
md ≥ 768
lg ≥ 992
xl ≥ 1200
xxl ≥ 1600
```

项目补充：`< 768px` 进入移动导航、单列内容、底部固定主操作；`≥ 992px` 使用侧栏或顶部导航；摄像头训练页同时根据**高度和横竖屏**布局，不能只看宽度。

### 2.5 圆角

Ant Design 默认：控件 6px，卡片/弹窗 8px，小标签 4px；官方明确不建议所有按钮都做全胶囊。

健身项目可以更亲和，但要限制层级：

| 组件 | 项目建议 |
|---|---:|
| 输入框、普通按钮 | 10–12px |
| 小标签、筛选项 | 8–10px |
| 普通卡片 | 16px |
| 大图课程卡 | 20–24px |
| 弹窗 / 底部面板 | 20px |
| 圆形图标按钮 | 50% |

同一容器内圆角最多相差一级；全胶囊只用于短筛选、状态和极少数主 CTA。

### 2.6 阴影和层级

Ant Design 是“扁平优先”：靠背景阶梯和边框分层，真正浮起的内容才使用阴影。

- 普通卡片：无阴影或极轻阴影。
- hover 可点击卡：轻微边框/背景变化，不做夸张漂浮。
- 弹窗、下拉、悬浮训练控制：使用中等阴影。
- 不允许每张卡片都发光、玻璃化、重阴影。

建议：

```text
shadow-sm: 0 1px 2px rgba(30,26,20,.06), 0 6px 18px rgba(30,26,20,.05)
shadow-popup: 0 8px 24px rgba(30,26,20,.12), 0 20px 48px rgba(30,26,20,.08)
overlay-mask: rgba(0,0,0,.45)
```

### 2.7 动效

官方动效原则：Natural、Performant、Concise；默认时长 0.1s / 0.2s / 0.3s（[官方动效](https://ant.design/docs/spec/motion/)）。

- 0.1s：hover、按下、选中。
- 0.2s：折叠、标签切换、局部状态。
- 0.3s：弹窗、抽屉、页面级面板。
- 训练实时反馈不排队播放长动画；状态必须立即更新。
- 支持 `prefers-reduced-motion: reduce`；计时、识别和结果不能依赖动画才能理解。

---

## 3. 组件使用规范

### 3.1 导航

| 场景 | 采用 | 规则 |
|---|---|---|
| 桌面一级模块 | 侧栏 / 顶栏 Menu | 5–7 个一级入口；当前项同时有底色与文字/图标状态 |
| 移动一级模块 | 底部 Tab Bar | 建议 4–5 项：首页、动作、计划、记录/身体、我的；实时语音入口可做独立主操作但不能挤压标签 |
| 页面内分类 | Tabs | 平级内容切换；不用于步骤流程 |
| 少量互斥筛选 | Segmented | 2–5 项；例如轻松/中等/进阶 |
| 训练流程 | Steps / 自定义步骤条 | 展示动作、组、休息、下一个动作；允许继续/暂停，不允许用 Tabs 冒充流程 |
| 深层返回 | Back + Breadcrumb（桌面） | 移动端保留清晰返回；不要只依赖浏览器后退 |

### 3.2 卡片

Ant Design 定义 Card 为“围绕一个主题的内容容器”，默认内部 padding 24px（[Card](https://ant.design/components/card/)）。本项目卡片必须有明确类型：

1. **课程封面卡**：真人/训练场景图 + 课程名 + 时长/难度/动作数 + 一个入口；图片与实际课程必须一致。
2. **动作卡**：统一模型的动作示范 + 动作名 + 主要肌群 + 可否实时纠正；点开进入三阶段拆解。
3. **数据卡**：一个核心数字 + 单位 + 时间范围 + 趋势，不放无意义大空白。
4. **状态卡**：状态 + 原因 + 下一步；警告、错误不能只有颜色。

禁止：所有卡片同一张人物图、卡片套卡片超过两层、整卡可点但内部又塞多个冲突按钮、无数据时只显示“—”。

### 3.3 按钮

官方规则：一个区域最多一个 Primary；Loading 防止重复提交；Danger 只用于风险操作（[Button](https://ant.design/components/button/)）。

- 训练主操作：开始、继续、下一组，使用 Primary，移动端高度 52–56px。
- 次操作：暂停、稍后、编辑，使用 Default / Outlined。
- 弱操作：查看详情、清空筛选，使用 Text。
- 删除计划、清空记录：Danger，并二次确认或提供撤销。
- 图标按钮必须有可读名称（`aria-label`），不能只让用户猜图标。
- Loading 状态保留原按钮宽度和文案语义；不得闪烁位移。

### 3.4 表单与语音录入

官方 Form 用于收集、校验信息，支持 `success / warning / error / validating` 状态（[Form](https://ant.design/components/form/)）。

- 移动端使用垂直表单；标签在输入框上方。
- 必填、单位、输入范围、用途在填写前说明；错误紧贴字段显示。
- 身高、体重、年龄等实时做合理性检查，但不要用户每输入一位就报错。
- 语音输入是输入方式，不是提交：录音 → 可编辑转写 → 识别到的字段高亮 → 用户确认保存。
- 无法识别时保留原转写并允许手改；不能把错误识别直接写入身体数据。
- 保存后明确显示“保存到本机 / 未上传”，它是状态说明，不伪装成按钮。

### 3.5 反馈体系

| 反馈类型 | 组件 | 适用 | 项目例子 |
|---|---|---|---|
| 即时轻反馈 | Message / Toast | 已完成且无需进一步处理，自动消失 | “计划已收藏” |
| 页面内持续提示 | Alert | 用户必须看见、可采取行动 | “摄像头未检测到全身，调整后继续” |
| 后台或跨页面事件 | Notification | 非当前操作、信息较长 | 下载完成、月报告生成 |
| 需要确认 | Modal / Popconfirm | 不可逆或高风险 | 清空训练记录 |
| 整页结果 | Result | 完成、空、权限、严重错误 | 摄像头权限被拒绝及恢复步骤 |

官方 Message 是顶部居中、自动消失的轻量反馈，默认 3 秒；Alert 是持续存在、可关闭的静态容器（[Message](https://ant.design/components/message/)、[Alert](https://ant.design/components/alert/)）。

训练语音反馈另有约束：

- 同类提醒合并并设冷却时间；用户已进入下一阶段时取消旧播报。
- 屏幕状态先更新，语音只说最短可执行建议。
- 严重安全问题可打断；普通建议在动作落点或组间播报。
- 同一时间只保留一个“当前最重要问题”。

### 3.6 数据展示

- 单值：Statistic，自带单位、时间范围、数据来源。
- 目标进度：Progress；必须同时显示文字或数字，不能只靠颜色。
- 周/月趋势：折线或柱状图；零值与缺失值分开。
- 训练动作列表：List；移动端不使用宽表格。
- 桌面管理型数据才用 Table；固定重要列，长表支持排序/筛选/空状态。
- 热量、体脂、BMI 必须标“估算/参考”，并显示输入数据与更新时间。

### 3.7 空状态、加载、错误

| 状态 | 必须包含 |
|---|---|
| 首次空状态 | 发生原因 + 能得到什么 + 一个主操作；例如“还没有训练记录，完成一次训练后查看动作质量趋势” |
| 筛选为空 | 当前筛选条件 + 清空/修改筛选；不要引导用户新建不存在的内容 |
| 加载 | Skeleton 保留最终布局；摄像头/模型加载显示阶段和预计下一步 |
| 局部失败 | 出错区域内 Alert + 重试；其他区域继续可用 |
| 整页失败 | Result + 原因 + 可执行恢复步骤 + 返回入口 |
| 网络离线 | 明确哪些本机功能仍可用；不把离线当作通用未知错误 |
| 权限拒绝 | 指明摄像头/麦克风权限，以及浏览器设置的恢复路径 |

不要用无限 Spin 掩盖无响应；超过约 8–10 秒应更新解释并提供取消/重试。

---

## 4. 无障碍与移动 Web

Ant Design v6 新增/强化语义结构、`classNames`/`styles`、焦点轮廓，并持续修复 `prefers-reduced-motion` 与键盘可访问性。项目最低标准按 WCAG 2.2 AA：

1. 正文对比度至少 4.5:1，大字至少 3:1（[W3C 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)）。
2. 所有键盘可操作项有清晰 `:focus-visible`，不能移除 outline；建议至少 2px、3:1（[W3C Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)）。
3. WCAG 最低点击目标为 24×24 CSS px（[W3C 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)）；本项目训练场景内部标准提高到 **44×44，主要控制 48–56px**。
4. 所有功能可键盘操作；弹窗锁定焦点并返回触发点；Esc 可关闭非强制弹窗。
5. 图标不单独表达关键状态；姿势正确/错误必须有文字或语音。
6. 动作图有准确 alt；纯装饰图 `alt=""`；动作分解不能只靠图片。
7. 实时数字使用 `aria-live` 要节流，避免读屏每帧播报；只播报阶段变化、完成和关键风险。
8. 固定底栏不得遮挡输入框、错误信息或焦点元素；适配安全区 `env(safe-area-inset-bottom)`。
9. 支持 320px 宽度、200% 文本缩放、横屏训练和摄像头权限弹窗后的恢复。
10. 深色模式由 Token/算法生成，不能简单颜色取反；动作图片、骨架和语义色需分别验证。

---

## 5. 不适合健身产品直接照搬的 Ant Design 默认项

| Ant Design 默认倾向 | 为什么不适合 | 项目定制 |
|---|---|---|
| 企业中后台、信息密度高 | 健身用户在移动、距离屏幕远、注意力有限 | 减少同时可见信息；训练中只保留当前任务和关键纠正 |
| 14px 正文、32px 控件 | 训练时阅读和点击太小 | 移动正文 15–16px；触控 44px 起，主按钮 52–56px |
| 默认蓝 `#1677FF` | 容易产生办公 SaaS 感，且官方 DESIGN.md 提醒部分组合不足 WCAG AA | 使用项目青绿主色，逐个验证对比度 |
| 6/8px 小圆角 | 对当前运动视觉偏硬 | 控件 10–12、卡片 16–24，但限定层级 |
| Menu / Table / Modal 较强 | 手机上笨重，占空间 | 底部导航、List、Bottom Sheet/Drawer、移动表单 |
| Card 24px padding | 小屏容易浪费空间 | 移动卡 16px；大图卡以图像构图决定 |
| hover 反馈 | 触屏没有 hover | 明确 pressed、selected、focus 和 loading |
| 通用 Message / Notification | 不能解决实时运动语音冲突 | 自建“反馈优先级 + 冷却 + 取消过期播报”机制 |

---

## 6. fitness-coach 组件映射表

| 当前业务模块 | 采用的规范组件/模式 | 关键定制 |
|---|---|---|
| 首页 | Layout + Bottom/Side Navigation + Hero Card + List/Card | 真人大卡只做主推荐；下方动作卡图文对应 |
| 动作分类 | Tabs/Segmented + List/Card + Filter Drawer | 选中不用纯白块；图标、文字、颜色三重提示 |
| 动作库 | Search + Filter/Chips + List/Card + Empty | 100 动作统一素材风格；可纠正状态明确 |
| 课程详情 | Page Header + Statistic + Steps/List + Sticky CTA | 动作顺序、组数、次数、休息一屏可理解 |
| 实时训练 | Camera Stage + Progress + Alert + Fixed Controls | 示例动作常驻可见；不需下滑；语音反馈去重 |
| 休息阶段 | Countdown + Progress + Primary/Default Buttons | 正常/偏快/偏慢提示；允许跳过或延长 |
| 训练总结 | Result + Statistics + Issue List + Next-action Card | 不空夸；基于有效次数、质量和真实问题 |
| 训练计划 | Cards + Segmented + Drawer/Modal + Steps | 计划详情逐层展开；固定计划可收藏和复用 |
| 训练记录 | Statistics + Trend Chart + List + Empty | 0 与无数据分开；显示周期和估算来源 |
| 身体状态 | Vertical Form + Validation + Statistics + Alert | 语音转写可编辑确认；不诊断；缺失不补造 |
| AI 建议 | Assistant Card/Alert + Sources + Confidence | 明确依据、缺失数据、是否规则/模型生成 |
| 权限与设备 | Result/Alert + Step-by-step Recovery | 摄像头、麦克风、离线分别处理 |

---

## 7. 可直接执行的 25 条精简规则

1. 页面背景、卡片、浮层必须使用三层 Surface Token，禁止纯黑通铺和散写白色。
2. 日间浅色为默认；深色是可切换模式，不是唯一模式。
3. 一屏一个 Primary 主操作。
4. 移动触控最小 44×44；主按钮 52–56px 高。
5. 移动正文 15–16px，辅助文字不低于 12px。
6. 移动 H1 28–32px；非封面页面不使用超大营销字。
7. 字重只用 400/500/600；避免大面积极粗体。
8. 所有间距落在 4px 栅格上。
9. 普通卡片圆角 16px；大图卡 20–24px；不每个元素都胶囊化。
10. 卡片必须属于课程、动作、数据或状态四类之一。
11. 同类卡片图片必须和标题、详情、实际动作一致。
12. 普通卡片不使用重阴影；只有浮层才明显抬升。
13. 选中状态不能只靠颜色；加背景/边框/图标/文字或 ARIA。
14. 状态色固定语义；发力红不等于错误红。
15. 所有数字带单位、周期和来源；缺失显示“暂无数据”，不是“—”。
16. 表单移动端垂直排列；错误贴近字段；保存状态明确。
17. 语音录入必须可停止、可编辑、可确认、可取消。
18. 实时训练始终可见：当前动作、示范、目标、进度、主控制。
19. 旧语音提示一旦过期立即取消；同类提示冷却去重。
20. 空状态必须解释原因并给一个下一步。
21. 加载超过 8–10 秒必须解释并提供重试/取消。
22. 局部错误不摧毁整页；权限错误给恢复路径。
23. 所有交互可键盘操作并有清晰 `focus-visible`。
24. 支持 `prefers-reduced-motion`、200% 文字缩放与移动安全区。
25. 新功能优先复用 Token 和现有组件；只有确有新交互契约时才新增组件。

---

## 8. 建议实施顺序（不整体推倒）

1. **Token 层**：统一浅色背景、语义色、字体、字号、间距、圆角、阴影、动效。
2. **原子组件**：Button、IconButton、Input、Select、Chip、Alert、Skeleton、Empty。
3. **业务卡片**：课程卡、动作卡、数据卡、状态卡。
4. **导航与响应式**：桌面侧栏、移动底栏、页面标题与安全区。
5. **高价值页面**：首页 → 实时训练 → 课程详情 → 训练总结。
6. **数据页面**：身体状态 → 记录 → 计划。
7. **状态审查**：空、加载、错误、权限、离线、低置信度、无有效训练。
8. **无障碍与回归**：键盘、读屏、对比度、缩放、横屏、触控、低性能设备。

每一步只改对应 Token/组件及其调用，不跨页重写业务逻辑。

---

## 9. 版本与许可证注意

- 查证时官方文档显示 **Ant Design 6.6.1**；版本会更新，开始正式迁移前再次查看[官方更新日志](https://github.com/ant-design/ant-design/releases)与[迁移说明](https://ant.design/docs/react/migration-v6/)。
- Ant Design React 官方仓库为 **MIT License**（[仓库](https://github.com/ant-design/ant-design)、[LICENSE](https://github.com/ant-design/ant-design/blob/master/LICENSE)），允许商业使用、修改与分发，但分发其代码或大量复制内容时应保留版权与许可文本。
- Ant Design Icons 也为 MIT，但仍应以对应仓库 LICENSE 为准；第三方摄影、动作素材、字体不自动继承 Ant Design 的 MIT 许可。
- 本文提炼设计原则与公开 Token；不得把 Ant Design 商标、官网截图或第三方素材误当成本项目资产。

## 10. 主要一手来源

- [Ant Design 官方 GitHub](https://github.com/ant-design/ant-design)
- [Ant Design v6 DESIGN.md](https://github.com/ant-design/ant-design/blob/master/DESIGN.md)
- [Ant Design 官方设计价值观](https://ant.design/docs/spec/values/)
- [Ant Design 官方主题与 Token](https://ant.design/docs/react/customize-theme/)
- [Ant Design 官方字体规范](https://ant.design/docs/spec/font/)
- [Ant Design 官方色彩规范](https://ant.design/docs/spec/colors/)
- [Ant Design 官方动效规范](https://ant.design/docs/spec/motion/)
- [Ant Design Grid](https://ant.design/components/grid/)
- [Ant Design Button](https://ant.design/components/button/)
- [Ant Design Card](https://ant.design/components/card/)
- [Ant Design Form](https://ant.design/components/form/)
- [Ant Design Alert](https://ant.design/components/alert/)
- [Ant Design Message](https://ant.design/components/message/)
- [Ant Design Mobile](https://mobile.ant.design/)
- [W3C WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/)

