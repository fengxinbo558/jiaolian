import type {
  ExerciseCategory,
  ExerciseCoachProfile,
  ExerciseDifficulty,
  ExerciseDiscipline,
  ExerciseEquipment,
  ExerciseMode,
} from "./exercises";
import type { ExerciseId, WorkoutPhase } from "./types";
import { ACTIVE_NEW_EXERCISE_IDS } from "./exercise-ids";

interface NewExerciseSpec {
  id: ExerciseId;
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
  met: number;
  views: string[];
  additionalEquipment?: string[];
}

const NEW_EXERCISE_SPECS: NewExerciseSpec[] = [
  { id: "wall-sit", name: "靠墙静蹲", discipline: "bodyweight", category: "下肢", mode: "timed-hold", equipment: "none", difficulty: "入门", primary: ["股四头肌","臀大肌"], secondary: ["腘绳肌","小腿","腹部核心"], cue: "背部贴墙，膝盖沿脚尖方向，脚掌均匀压地。", breath: "保持时自然呼吸，不要憋气。", met: 3.5, views: ["侧面","斜侧面"], additionalEquipment: ["墙面"] },
  { id: "wall-push-up", name: "墙壁俯卧撑", discipline: "bodyweight", category: "上肢", mode: "repetition", equipment: "none", difficulty: "入门", primary: ["胸大肌","肱三头肌"], secondary: ["三角肌前束","腹部核心"], cue: "身体保持一条直线，胸口靠近墙面后推回。", breath: "靠近墙面时吸气，推开时呼气。", met: 3, views: ["侧面","斜侧面"], additionalEquipment: ["墙面"] },
  { id: "incline-push-up", name: "上斜俯卧撑", discipline: "bodyweight", category: "上肢", mode: "repetition", equipment: "none", difficulty: "入门", primary: ["胸大肌","肱三头肌"], secondary: ["三角肌前束","腹部核心"], cue: "双手压稳支撑面，胸口主动靠近手间。", breath: "下降吸气，推起呼气。", met: 4.5, views: ["侧面","斜侧面"], additionalEquipment: ["稳固高位支撑"] },
  { id: "decline-push-up", name: "下斜俯卧撑", discipline: "bodyweight", category: "上肢", mode: "repetition", equipment: "none", difficulty: "进阶", primary: ["胸大肌上部","肱三头肌"], secondary: ["三角肌前束","腹部核心"], cue: "脚放稳高处，收紧核心，胸口向双手之间下降。", breath: "下降吸气，推起呼气。", met: 6.5, views: ["侧面"], additionalEquipment: ["稳固脚部支撑"] },
  { id: "wide-push-up", name: "宽距俯卧撑", discipline: "bodyweight", category: "上肢", mode: "repetition", equipment: "none", difficulty: "进阶", primary: ["胸大肌"], secondary: ["肱三头肌","三角肌前束","腹部核心"], cue: "双手略宽于肩，肘部斜向后，胸口控制下降。", breath: "下降吸气，推起呼气。", met: 6, views: ["侧面","斜侧面"] },
  { id: "diamond-push-up", name: "钻石俯卧撑", discipline: "bodyweight", category: "上肢", mode: "repetition", equipment: "none", difficulty: "进阶", primary: ["肱三头肌","胸大肌"], secondary: ["三角肌前束","腹部核心"], cue: "双手靠近胸下，肘部贴近身体完成推起。", breath: "下降吸气，推起呼气。", met: 6.5, views: ["侧面","斜侧面"] },
  { id: "hindu-push-up", name: "印度俯卧撑", discipline: "bodyweight", category: "上肢", mode: "repetition", equipment: "none", difficulty: "进阶", primary: ["三角肌","胸大肌","肱三头肌"], secondary: ["背阔肌","腹部核心","髋部"], cue: "从倒V形向前下方穿过，再抬胸回到起点。", breath: "前移下降吸气，推回时呼气。", met: 6.5, views: ["侧面"] },
  { id: "plank-up-down", name: "平板上下撑", discipline: "bodyweight", category: "核心", mode: "alternating", equipment: "none", difficulty: "进阶", primary: ["腹部核心","肱三头肌"], secondary: ["胸大肌","三角肌","臀肌"], cue: "髋部保持稳定，左右手交替从前臂撑到手掌撑。", breath: "上撑时呼气，回落时吸气。", met: 6, views: ["正面","斜侧面"] },
  { id: "plank-jack", name: "平板开合跳", discipline: "bodyweight", category: "全身有氧", mode: "repetition", equipment: "none", difficulty: "进阶", primary: ["腹部核心","臀中肌"], secondary: ["肩部","小腿","股四头肌"], cue: "肩膀稳定在手腕上方，双脚轻快开合且不塌腰。", breath: "保持均匀短呼吸。", met: 8, views: ["正面","斜侧面"] },
  { id: "side-plank-hip-dip", name: "侧平板髋部升降", discipline: "bodyweight", category: "核心", mode: "repetition", equipment: "none", difficulty: "进阶", primary: ["腹斜肌","臀中肌"], secondary: ["肩部","腹横肌"], cue: "支撑肩稳定，髋部垂直下降后由侧腹抬起。", breath: "下降吸气，抬髋呼气。", met: 4.5, views: ["正面","斜侧面"] },
  { id: "bear-plank", name: "熊爬静态支撑", discipline: "bodyweight", category: "核心", mode: "timed-hold", equipment: "none", difficulty: "入门", primary: ["腹部核心","股四头肌"], secondary: ["肩部","髋屈肌"], cue: "膝盖离地少许，背部平稳，肩髋保持水平。", breath: "自然呼吸，不要憋气。", met: 4, views: ["侧面","斜侧面"] },
  { id: "bear-crawl", name: "熊爬", discipline: "bodyweight", category: "全身有氧", mode: "alternating", equipment: "none", difficulty: "进阶", primary: ["腹部核心","肩部","股四头肌"], secondary: ["臀肌","肱三头肌"], cue: "对侧手脚小步移动，膝盖始终贴近地面。", breath: "移动中保持均匀呼吸。", met: 7, views: ["侧面","斜侧面"] },
  { id: "crab-walk", name: "螃蟹走", discipline: "bodyweight", category: "全身有氧", mode: "alternating", equipment: "none", difficulty: "进阶", primary: ["肱三头肌","臀大肌"], secondary: ["肩部","腘绳肌","腹部核心"], cue: "髋部离地，手脚协调小步移动，肩膀不耸起。", breath: "移动中保持均匀呼吸。", met: 6, views: ["侧面","斜侧面"] },
  { id: "inchworm", name: "毛毛虫爬", discipline: "bodyweight", category: "全身有氧", mode: "repetition", equipment: "none", difficulty: "进阶", primary: ["肩部","腹部核心"], secondary: ["腘绳肌","胸大肌","髋部"], cue: "从髋部折叠，双手向前走到平板，再走回站起。", breath: "向前走吸气，回站呼气。", met: 6, views: ["侧面"] },
  { id: "squat-pulse", name: "深蹲脉冲", discipline: "bodyweight", category: "下肢", mode: "repetition", equipment: "none", difficulty: "进阶", primary: ["股四头肌","臀大肌"], secondary: ["腘绳肌","小腿","腹部核心"], cue: "停留在深蹲区间，小幅上下并保持膝盖对齐脚尖。", breath: "下降吸气，小幅推起呼气。", met: 6, views: ["正面","侧面"] },
  { id: "squat-hold", name: "深蹲静止保持", discipline: "bodyweight", category: "下肢", mode: "timed-hold", equipment: "none", difficulty: "入门", primary: ["股四头肌","臀大肌"], secondary: ["腘绳肌","小腿","腹部核心"], cue: "髋部向后坐，脚掌压稳，胸口保持抬起。", breath: "保持时自然呼吸。", met: 4.5, views: ["正面","侧面"] },
  { id: "lateral-squat-walk", name: "半蹲侧向行走", discipline: "bodyweight", category: "下肢", mode: "alternating", equipment: "none", difficulty: "入门", primary: ["臀中肌","股四头肌"], secondary: ["臀大肌","腹部核心"], cue: "保持半蹲高度，脚尖朝前，向侧面连续小步移动。", breath: "移动中保持均匀呼吸。", met: 5, views: ["正面"] },
  { id: "forward-lunge", name: "前向弓步", discipline: "bodyweight", category: "下肢", mode: "alternating", equipment: "none", difficulty: "入门", primary: ["臀大肌","股四头肌"], secondary: ["腘绳肌","小腿","腹部核心"], cue: "前脚踩稳后垂直下沉，再用前腿推回站立。", breath: "下沉吸气，推回呼气。", met: 5, views: ["正面","斜侧面"] },
  { id: "walking-lunge", name: "行进弓步", discipline: "bodyweight", category: "下肢", mode: "alternating", equipment: "none", difficulty: "进阶", primary: ["臀大肌","股四头肌"], secondary: ["腘绳肌","小腿","腹部核心"], cue: "每一步先站稳再下沉，前膝始终沿脚尖方向。", breath: "下沉吸气，站起换步时呼气。", met: 6, views: ["斜侧面"], additionalEquipment: ["安全行进空间"] },
  { id: "cossack-squat", name: "哥萨克深蹲", discipline: "bodyweight", category: "下肢", mode: "alternating", equipment: "none", difficulty: "进阶", primary: ["内收肌群","股四头肌","臀大肌"], secondary: ["腘绳肌","踝部稳定肌"], cue: "重心移向一侧，屈膝下坐，另一腿伸直且脚跟着地。", breath: "下坐吸气，回中呼气。", met: 5.5, views: ["正面"] },
  { id: "single-leg-glute-bridge", name: "单腿臀桥", discipline: "bodyweight", category: "下肢", mode: "alternating", equipment: "none", difficulty: "进阶", primary: ["臀大肌","腘绳肌"], secondary: ["腹部核心","臀中肌"], cue: "支撑脚跟压地，骨盆保持水平并抬髋。", breath: "下降吸气，抬髋呼气。", met: 4.5, views: ["侧面","斜侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "frog-pump", name: "蛙式臀桥", discipline: "bodyweight", category: "下肢", mode: "repetition", equipment: "none", difficulty: "入门", primary: ["臀大肌"], secondary: ["内收肌群","腹部核心"], cue: "脚掌相对、膝盖打开，收紧臀部把髋推高。", breath: "下降吸气，抬髋呼气。", met: 4, views: ["侧面","斜侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "donkey-kick", name: "跪姿后踢腿", discipline: "bodyweight", category: "下肢", mode: "alternating", equipment: "none", difficulty: "入门", primary: ["臀大肌"], secondary: ["腘绳肌","腹部核心"], cue: "膝盖保持弯曲，脚底向上推，腰部不要反弓。", breath: "回落吸气，上踢呼气。", met: 4, views: ["侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "fire-hydrant", name: "跪姿侧抬腿", discipline: "bodyweight", category: "下肢", mode: "alternating", equipment: "none", difficulty: "入门", primary: ["臀中肌"], secondary: ["臀大肌","腹部核心"], cue: "骨盆朝向地面，屈膝从侧面抬起并控制放下。", breath: "放下吸气，抬腿呼气。", met: 4, views: ["正面","斜侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "clamshell", name: "蚌式开合", discipline: "bodyweight", category: "下肢", mode: "alternating", equipment: "none", difficulty: "入门", primary: ["臀中肌"], secondary: ["臀小肌","腹部核心"], cue: "侧卧保持脚跟相触，骨盆不后倒，膝盖向上打开。", breath: "合拢吸气，打开呼气。", met: 3, views: ["正面","斜侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "hamstring-walkout", name: "臀桥脚跟走", discipline: "bodyweight", category: "下肢", mode: "repetition", equipment: "none", difficulty: "进阶", primary: ["腘绳肌","臀大肌"], secondary: ["小腿","腹部核心"], cue: "保持髋部抬起，脚跟小步向外再走回。", breath: "向外吸气，走回呼气。", met: 4.5, views: ["侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "reverse-crunch", name: "反向卷腹", discipline: "bodyweight", category: "核心", mode: "repetition", equipment: "none", difficulty: "入门", primary: ["腹直肌下部"], secondary: ["腹横肌","髋屈肌"], cue: "用腹部卷起骨盆，不靠甩腿获得幅度。", breath: "腿回落吸气，卷起呼气。", met: 4, views: ["侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "heel-tap", name: "仰卧触踵", discipline: "bodyweight", category: "核心", mode: "alternating", equipment: "none", difficulty: "入门", primary: ["腹斜肌"], secondary: ["腹直肌","腹横肌"], cue: "肩胛离地，左右侧屈触碰同侧脚跟。", breath: "左右移动时短促呼气。", met: 4, views: ["正面","斜侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "russian-twist", name: "俄罗斯转体", discipline: "bodyweight", category: "核心", mode: "alternating", equipment: "none", difficulty: "进阶", primary: ["腹斜肌"], secondary: ["腹直肌","髋屈肌"], cue: "胸口抬起，从胸椎带动左右转动，骨盆保持稳定。", breath: "转向一侧呼气，回中吸气。", met: 5, views: ["正面","斜侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "hollow-body-hold", name: "中空支撑", discipline: "bodyweight", category: "核心", mode: "timed-hold", equipment: "none", difficulty: "进阶", primary: ["腹直肌","腹横肌"], secondary: ["髋屈肌","股四头肌"], cue: "腰背贴地，肩和腿抬离地面，保持身体弧形。", breath: "保持时均匀呼吸。", met: 4, views: ["侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "v-up", name: "V字两头起", discipline: "bodyweight", category: "核心", mode: "repetition", equipment: "none", difficulty: "进阶", primary: ["腹直肌"], secondary: ["髋屈肌","股四头肌"], cue: "手脚同时向中间抬起，由腹部控制回落。", breath: "回落吸气，抬起呼气。", met: 5.5, views: ["侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "toe-touch-crunch", name: "仰卧摸脚尖", discipline: "bodyweight", category: "核心", mode: "repetition", equipment: "none", difficulty: "入门", primary: ["腹直肌"], secondary: ["腹横肌","髋屈肌"], cue: "双腿垂直抬起，卷起上背让双手靠近脚尖。", breath: "回落吸气，卷起呼气。", met: 4.5, views: ["正面","斜侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "butt-kick", name: "后踢腿跑", discipline: "bodyweight", category: "全身有氧", mode: "alternating", equipment: "none", difficulty: "入门", primary: ["腘绳肌","小腿"], secondary: ["股四头肌","臀肌","心肺系统"], cue: "身体直立，脚跟快速靠近臀部，前脚掌轻柔落地。", breath: "保持自然有节奏的呼吸。", met: 8, views: ["正面","侧面"] },
  { id: "step-jack", name: "低冲击开合步", discipline: "bodyweight", category: "全身有氧", mode: "alternating", equipment: "none", difficulty: "入门", primary: ["臀中肌","三角肌"], secondary: ["小腿","腹部核心"], cue: "左右脚交替侧点，同时双臂同步举过头顶。", breath: "打开时吸气，收回时呼气。", met: 4.5, views: ["正面"] },
  { id: "standing-power-knee", name: "站姿强力提膝", discipline: "bodyweight", category: "全身有氧", mode: "alternating", equipment: "none", difficulty: "入门", primary: ["腹部核心","髋屈肌"], secondary: ["臀肌","肩部","股四头肌"], cue: "双手向下拉的同时主动提膝，躯干保持稳定。", breath: "提膝时呼气，落脚时吸气。", met: 6, views: ["正面","斜侧面"] },
  { id: "dumbbell-deadlift", name: "哑铃硬拉", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "single-or-pair", difficulty: "入门", primary: ["臀大肌","腘绳肌"], secondary: ["竖脊肌","背阔肌","前臂"], cue: "髋部向后推，哑铃贴近腿部，脚掌压地站直。", breath: "下放吸气，站起呼气。", met: 6, views: ["侧面","斜侧面"] },
  { id: "dumbbell-front-squat", name: "哑铃前蹲", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "pair-dumbbells", difficulty: "进阶", primary: ["股四头肌","臀大肌"], secondary: ["腹部核心","上背部"], cue: "哑铃稳定在肩前，膝髋同步下沉后站起。", breath: "下蹲吸气，站起呼气。", met: 6.5, views: ["正面","侧面"] },
  { id: "dumbbell-walking-lunge", name: "哑铃行进弓步", discipline: "dumbbell", category: "哑铃", mode: "alternating", equipment: "pair-dumbbells", difficulty: "进阶", primary: ["臀大肌","股四头肌"], secondary: ["腘绳肌","前臂","腹部核心"], cue: "哑铃垂直稳定，每一步踩稳后再下沉。", breath: "下沉吸气，迈步站起呼气。", met: 7, views: ["斜侧面"], additionalEquipment: ["安全行进空间"] },
  { id: "dumbbell-forward-lunge", name: "哑铃前向弓步", discipline: "dumbbell", category: "哑铃", mode: "alternating", equipment: "single-or-pair", difficulty: "进阶", primary: ["臀大肌","股四头肌"], secondary: ["腘绳肌","前臂","腹部核心"], cue: "前脚完整踩地，垂直下沉后用前腿推回。", breath: "下沉吸气，推回呼气。", met: 6, views: ["正面","斜侧面"] },
  { id: "dumbbell-lateral-lunge", name: "哑铃侧弓步", discipline: "dumbbell", category: "哑铃", mode: "alternating", equipment: "single-or-pair", difficulty: "进阶", primary: ["臀大肌","内收肌群"], secondary: ["股四头肌","腘绳肌","腹部核心"], cue: "向侧面迈开，髋部后坐，支撑膝沿脚尖方向。", breath: "下坐吸气，回中呼气。", met: 6, views: ["正面"] },
  { id: "dumbbell-step-up", name: "哑铃登台阶", discipline: "dumbbell", category: "哑铃", mode: "alternating", equipment: "pair-dumbbells", difficulty: "进阶", primary: ["臀大肌","股四头肌"], secondary: ["腘绳肌","小腿","腹部核心"], cue: "整只脚踩稳台面，用上方腿发力站上去。", breath: "下台吸气，登台呼气。", met: 7, views: ["正面","斜侧面"], additionalEquipment: ["稳固踏台"] },
  { id: "dumbbell-calf-raise", name: "哑铃提踵", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "pair-dumbbells", difficulty: "入门", primary: ["腓肠肌","比目鱼肌"], secondary: ["前臂","足踝稳定肌"], cue: "哑铃稳定垂放，前脚掌压地，脚跟垂直抬高。", breath: "下降吸气，提踵呼气。", met: 4, views: ["正面","侧面"] },
  { id: "dumbbell-single-leg-rdl", name: "哑铃单腿罗马尼亚硬拉", discipline: "dumbbell", category: "哑铃", mode: "alternating", equipment: "single-or-pair", difficulty: "进阶", primary: ["臀大肌","腘绳肌"], secondary: ["臀中肌","竖脊肌","腹部核心"], cue: "支撑膝微屈，髋部向后，躯干和后腿同步倾斜。", breath: "下放吸气，回站呼气。", met: 6, views: ["侧面","斜侧面"] },
  { id: "dumbbell-hip-thrust", name: "哑铃臀推", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "single-dumbbell", difficulty: "进阶", primary: ["臀大肌"], secondary: ["腘绳肌","腹部核心"], cue: "上背支撑稳定，哑铃放在髋部，收臀把髋推平。", breath: "下降吸气，推髋呼气。", met: 6, views: ["侧面"], additionalEquipment: ["稳固长凳","髋部软垫"] },
  { id: "dumbbell-sumo-deadlift", name: "哑铃相扑硬拉", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "single-or-pair", difficulty: "入门", primary: ["臀大肌","内收肌群"], secondary: ["股四头肌","腘绳肌","背部"], cue: "宽站距脚尖外开，膝盖跟随脚尖，哑铃垂直升降。", breath: "下放吸气，站起呼气。", met: 6, views: ["正面","斜侧面"] },
  { id: "dumbbell-bench-press", name: "哑铃卧推", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "pair-dumbbells", difficulty: "进阶", primary: ["胸大肌","肱三头肌"], secondary: ["三角肌前束"], cue: "肩胛稳定贴住长凳，哑铃在胸部两侧控制升降。", breath: "下降吸气，推起呼气。", met: 5.5, views: ["侧面","斜侧面"], additionalEquipment: ["稳固长凳"] },
  { id: "incline-dumbbell-press", name: "上斜哑铃卧推", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "pair-dumbbells", difficulty: "进阶", primary: ["胸大肌上部","肱三头肌"], secondary: ["三角肌前束"], cue: "肩胛稳定，哑铃从上胸两侧向上推起。", breath: "下降吸气，推起呼气。", met: 5.5, views: ["侧面","斜侧面"], additionalEquipment: ["可调长凳"] },
  { id: "dumbbell-pullover", name: "哑铃仰卧上拉", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "single-dumbbell", difficulty: "进阶", primary: ["背阔肌","胸大肌"], secondary: ["肱三头肌","腹部核心"], cue: "肋骨保持收紧，双臂微屈把哑铃沿弧线移到头后。", breath: "后移吸气，拉回呼气。", met: 5, views: ["侧面"], additionalEquipment: ["稳固长凳"] },
  { id: "dumbbell-squeeze-press", name: "哑铃夹胸卧推", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "pair-dumbbells", difficulty: "入门", primary: ["胸大肌","肱三头肌"], secondary: ["三角肌前束"], cue: "两只哑铃相互挤压，保持贴合完成推举。", breath: "下降吸气，推起呼气。", met: 5, views: ["侧面","斜侧面"], additionalEquipment: ["稳固长凳"] },
  { id: "single-arm-floor-press", name: "单臂哑铃地板卧推", discipline: "dumbbell", category: "哑铃", mode: "alternating", equipment: "single-dumbbell", difficulty: "入门", primary: ["胸大肌","肱三头肌"], secondary: ["三角肌前束","腹部核心"], cue: "背部贴地，肘部轻触地面后垂直推起，躯干不旋转。", breath: "下降吸气，推起呼气。", met: 5, views: ["正面","斜侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "renegade-row", name: "俯撑哑铃划船", discipline: "dumbbell", category: "哑铃", mode: "alternating", equipment: "pair-dumbbells", difficulty: "进阶", primary: ["背阔肌","腹部核心"], secondary: ["肱二头肌","肩部","臀肌"], cue: "双脚打开保持骨盆稳定，哑铃沿身体一侧拉向腰部。", breath: "放下吸气，划船呼气。", met: 7, views: ["正面","斜侧面"] },
  { id: "chest-supported-row", name: "俯卧凳哑铃划船", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "pair-dumbbells", difficulty: "入门", primary: ["背阔肌","菱形肌"], secondary: ["肱二头肌","三角肌后束"], cue: "胸部贴稳斜凳，肩胛向后下方收紧并拉肘。", breath: "下放吸气，划船呼气。", met: 5, views: ["侧面","斜侧面"], additionalEquipment: ["可调长凳"] },
  { id: "dumbbell-upright-row", name: "哑铃直立划船", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "pair-dumbbells", difficulty: "进阶", primary: ["三角肌","斜方肌"], secondary: ["肱二头肌","前臂"], cue: "哑铃贴近身体向上拉，肘部不过度高于肩。", breath: "下放吸气，上拉呼气。", met: 5, views: ["正面"] },
  { id: "dumbbell-shrug", name: "哑铃耸肩", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "pair-dumbbells", difficulty: "入门", primary: ["斜方肌上部"], secondary: ["前臂","肩胛稳定肌"], cue: "手臂自然垂直，肩膀向耳朵方向抬起再控制放下。", breath: "下放吸气，耸肩呼气。", met: 4, views: ["正面","斜侧面"] },
  { id: "rear-delt-row", name: "哑铃后束划船", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "pair-dumbbells", difficulty: "进阶", primary: ["三角肌后束","菱形肌"], secondary: ["斜方肌","肱二头肌"], cue: "髋部折叠，肘部向外拉开，肩胛保持稳定。", breath: "下放吸气，上拉呼气。", met: 5, views: ["侧面","斜侧面"] },
  { id: "dumbbell-z-press", name: "哑铃Z式推举", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "pair-dumbbells", difficulty: "进阶", primary: ["三角肌","肱三头肌"], secondary: ["腹部核心","上背部"], cue: "坐姿双腿伸直，躯干直立，把哑铃从肩部推过头顶。", breath: "下放吸气，推起呼气。", met: 5, views: ["正面","斜侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "alternating-shoulder-press", name: "交替哑铃肩推", discipline: "dumbbell", category: "哑铃", mode: "alternating", equipment: "pair-dumbbells", difficulty: "入门", primary: ["三角肌","肱三头肌"], secondary: ["腹部核心","上胸"], cue: "一侧推起时另一侧稳定在肩部，躯干不侧弯。", breath: "下放吸气，推起呼气。", met: 5, views: ["正面"] },
  { id: "dumbbell-scaption", name: "哑铃肩胛面抬举", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "pair-dumbbells", difficulty: "入门", primary: ["三角肌","冈上肌"], secondary: ["斜方肌","前臂"], cue: "手臂在身体斜前方抬起，拇指朝上，不要耸肩。", breath: "下放吸气，抬起呼气。", met: 4, views: ["正面","斜侧面"] },
  { id: "concentration-curl", name: "哑铃集中弯举", discipline: "dumbbell", category: "哑铃", mode: "alternating", equipment: "single-dumbbell", difficulty: "入门", primary: ["肱二头肌"], secondary: ["肱肌","前臂"], cue: "肘部稳定贴住大腿内侧，只弯曲肘关节。", breath: "下放吸气，弯举呼气。", met: 4, views: ["正面","斜侧面"], additionalEquipment: ["稳固座椅"] },
  { id: "incline-dumbbell-curl", name: "上斜哑铃弯举", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "pair-dumbbells", difficulty: "进阶", primary: ["肱二头肌"], secondary: ["肱肌","前臂"], cue: "上臂自然垂直且不前移，完整弯举后控制下放。", breath: "下放吸气，弯举呼气。", met: 4, views: ["正面","斜侧面"], additionalEquipment: ["可调长凳"] },
  { id: "dumbbell-reverse-curl", name: "哑铃反握弯举", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "pair-dumbbells", difficulty: "入门", primary: ["肱桡肌","肱肌"], secondary: ["肱二头肌","前臂"], cue: "掌心向下，肘部贴近身体完成弯举。", breath: "下放吸气，弯举呼气。", met: 4, views: ["正面"] },
  { id: "cross-body-hammer-curl", name: "交叉锤式弯举", discipline: "dumbbell", category: "哑铃", mode: "alternating", equipment: "single-or-pair", difficulty: "入门", primary: ["肱肌","肱桡肌"], secondary: ["肱二头肌","前臂"], cue: "掌心相对，把哑铃朝对侧胸前弯举，肩膀保持稳定。", breath: "下放吸气，弯举呼气。", met: 4, views: ["正面","斜侧面"] },
  { id: "lying-triceps-extension", name: "仰卧哑铃臂屈伸", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "pair-dumbbells", difficulty: "进阶", primary: ["肱三头肌"], secondary: ["前臂","肩部稳定肌"], cue: "上臂保持垂直，只弯曲肘部让哑铃靠近头侧。", breath: "下放吸气，伸肘呼气。", met: 4.5, views: ["侧面","斜侧面"], additionalEquipment: ["瑜伽垫或长凳"] },
  { id: "close-grip-dumbbell-press", name: "窄距哑铃卧推", discipline: "dumbbell", category: "哑铃", mode: "repetition", equipment: "pair-dumbbells", difficulty: "入门", primary: ["肱三头肌","胸大肌"], secondary: ["三角肌前束"], cue: "哑铃靠近身体，肘部贴近躯干完成推举。", breath: "下降吸气，推起呼气。", met: 5, views: ["侧面","斜侧面"], additionalEquipment: ["瑜伽垫或长凳"] },
  { id: "suitcase-march", name: "单侧提箱原地踏步", discipline: "dumbbell", category: "哑铃", mode: "alternating", equipment: "single-dumbbell", difficulty: "入门", primary: ["腹斜肌","腹横肌"], secondary: ["髋屈肌","前臂","臀中肌"], cue: "单侧持铃保持身体直立，左右膝交替抬起且不侧弯。", breath: "抬膝呼气，落脚吸气。", met: 4.5, views: ["正面"] },
  { id: "warrior-one", name: "战士一式", discipline: "yoga", category: "瑜伽", mode: "timed-hold", equipment: "none", difficulty: "入门", primary: ["臀大肌","股四头肌"], secondary: ["小腿","肩部","腹部核心"], cue: "前膝对准脚尖，后脚压地，骨盆朝向前方。", breath: "保持中缓慢深呼吸。", met: 3, views: ["正面","斜侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "warrior-three", name: "战士三式", discipline: "yoga", category: "瑜伽", mode: "timed-hold", equipment: "none", difficulty: "进阶", primary: ["臀大肌","腘绳肌"], secondary: ["臀中肌","背部","腹部核心"], cue: "支撑腿稳定，躯干和后腿延伸成一条线。", breath: "保持中均匀呼吸。", met: 3.5, views: ["侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "triangle-pose", name: "三角式", discipline: "yoga", category: "瑜伽", mode: "timed-hold", equipment: "none", difficulty: "入门", primary: ["内收肌群","腘绳肌"], secondary: ["腹斜肌","肩部"], cue: "双腿伸展，胸口打开，身体向侧面延伸。", breath: "保持中缓慢深呼吸。", met: 3, views: ["正面"], additionalEquipment: ["瑜伽垫"] },
  { id: "reverse-warrior", name: "反战士式", discipline: "yoga", category: "瑜伽", mode: "timed-hold", equipment: "none", difficulty: "入门", primary: ["股四头肌","腹斜肌"], secondary: ["臀肌","肩部","背阔肌"], cue: "前膝保持弯曲，前侧手臂向上后方延伸。", breath: "保持中缓慢深呼吸。", met: 3, views: ["正面","斜侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "crescent-lunge", name: "新月弓步", discipline: "yoga", category: "瑜伽", mode: "timed-hold", equipment: "none", difficulty: "入门", primary: ["臀大肌","股四头肌"], secondary: ["髋屈肌","小腿","腹部核心"], cue: "后脚跟抬起，骨盆朝前，双臂向上延伸。", breath: "保持中均匀深呼吸。", met: 3.5, views: ["正面","斜侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "low-lunge", name: "低位弓步", discipline: "yoga", category: "瑜伽", mode: "timed-hold", equipment: "none", difficulty: "入门", primary: ["髋屈肌","臀大肌"], secondary: ["股四头肌","腹部核心"], cue: "后膝落地，骨盆轻向前下方移动，胸口抬起。", breath: "呼气时温和加深伸展。", met: 2.5, views: ["侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "half-split", name: "半神猴式", discipline: "yoga", category: "瑜伽", mode: "timed-hold", equipment: "none", difficulty: "入门", primary: ["腘绳肌"], secondary: ["小腿","下背部"], cue: "髋部向后，前腿伸直，背部延长后向前折叠。", breath: "呼气时温和前屈。", met: 2.5, views: ["侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "cat-cow", name: "猫牛式", discipline: "yoga", category: "瑜伽", mode: "alternating", equipment: "none", difficulty: "入门", primary: ["竖脊肌","腹部核心"], secondary: ["肩部","髋部"], cue: "四点支撑，随呼吸交替拱背和延展脊柱。", breath: "拱背呼气，延展吸气。", met: 2.5, views: ["侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "cobra-pose", name: "眼镜蛇式", discipline: "yoga", category: "瑜伽", mode: "timed-hold", equipment: "none", difficulty: "入门", primary: ["竖脊肌"], secondary: ["胸大肌","肩部","臀肌"], cue: "骨盆贴地，肩膀远离耳朵，胸口向前上方延伸。", breath: "抬胸吸气，保持中自然呼吸。", met: 2.5, views: ["侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "child-pose", name: "婴儿式", discipline: "yoga", category: "瑜伽", mode: "timed-hold", equipment: "none", difficulty: "入门", primary: ["背阔肌","下背部"], secondary: ["臀肌","肩部"], cue: "臀部向脚跟靠近，双臂向前延伸并放松呼吸。", breath: "缓慢深呼吸。", met: 2, views: ["侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "thread-the-needle", name: "穿针式", discipline: "yoga", category: "瑜伽", mode: "alternating", equipment: "none", difficulty: "入门", primary: ["胸椎旋转肌群","三角肌后束"], secondary: ["腹斜肌","肩部"], cue: "一侧手臂从身体下方穿过，肩和侧头轻放地面。", breath: "穿过时呼气，打开时吸气。", met: 2.5, views: ["正面","斜侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "seated-forward-fold", name: "坐姿前屈", discipline: "yoga", category: "瑜伽", mode: "timed-hold", equipment: "none", difficulty: "入门", primary: ["腘绳肌"], secondary: ["小腿","下背部"], cue: "坐骨压地，先延长脊柱，再从髋部向前折叠。", breath: "呼气时温和前屈。", met: 2, views: ["侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "butterfly-stretch", name: "蝴蝶式拉伸", discipline: "yoga", category: "瑜伽", mode: "timed-hold", equipment: "none", difficulty: "入门", primary: ["内收肌群"], secondary: ["臀肌","下背部"], cue: "脚掌相对，脊柱直立，膝盖自然向两侧下沉。", breath: "保持中缓慢深呼吸。", met: 2, views: ["正面"], additionalEquipment: ["瑜伽垫"] },
  { id: "supine-spinal-twist", name: "仰卧脊柱扭转", discipline: "yoga", category: "瑜伽", mode: "timed-hold", equipment: "none", difficulty: "入门", primary: ["腹斜肌","下背部"], secondary: ["臀肌","胸部"], cue: "双肩贴地，屈膝缓慢倒向一侧。", breath: "呼气时进入扭转。", met: 2, views: ["正面"], additionalEquipment: ["瑜伽垫"] },
  { id: "happy-baby", name: "快乐婴儿式", discipline: "yoga", category: "瑜伽", mode: "timed-hold", equipment: "none", difficulty: "入门", primary: ["内收肌群","臀肌"], secondary: ["腘绳肌","下背部"], cue: "腰背贴地，握住双脚，膝盖向身体两侧靠近。", breath: "保持中缓慢深呼吸。", met: 2, views: ["正面"], additionalEquipment: ["瑜伽垫"] },
  { id: "boat-pose", name: "船式", discipline: "yoga", category: "瑜伽", mode: "timed-hold", equipment: "none", difficulty: "进阶", primary: ["腹直肌","髋屈肌"], secondary: ["股四头肌","竖脊肌"], cue: "胸口抬起，坐骨稳定，双腿和躯干形成V形。", breath: "保持中均匀呼吸。", met: 3.5, views: ["侧面","斜侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "pigeon-pose", name: "鸽子式", discipline: "yoga", category: "瑜伽", mode: "timed-hold", equipment: "none", difficulty: "进阶", primary: ["臀肌","髋外旋肌群"], secondary: ["髋屈肌","下背部"], cue: "前腿舒适屈曲，骨盆尽量朝前且左右平衡。", breath: "呼气时温和放松髋部。", met: 2.5, views: ["侧面","斜侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "camel-pose", name: "骆驼式", discipline: "yoga", category: "瑜伽", mode: "timed-hold", equipment: "none", difficulty: "进阶", primary: ["髋屈肌","股四头肌"], secondary: ["胸部","腹部","竖脊肌"], cue: "大腿保持垂直，胸口向上打开，避免腰部挤压。", breath: "打开胸口时吸气。", met: 3, views: ["侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "ninety-ninety-hip-switch", name: "90/90髋部转换", discipline: "yoga", category: "瑜伽", mode: "alternating", equipment: "none", difficulty: "入门", primary: ["髋外旋肌群","髋内旋肌群"], secondary: ["臀肌","腹部核心"], cue: "坐姿双膝弯曲，脚掌落地，双膝受控左右倒换。", breath: "转换时呼气，回中吸气。", met: 2.5, views: ["正面"], additionalEquipment: ["瑜伽垫"] },
  { id: "open-book-rotation", name: "侧卧开书式", discipline: "yoga", category: "瑜伽", mode: "alternating", equipment: "none", difficulty: "入门", primary: ["胸椎旋转肌群"], secondary: ["胸部","腹斜肌","肩部"], cue: "双膝叠放不移动，上侧手臂沿地面打开到另一侧。", breath: "打开吸气，合回呼气。", met: 2.5, views: ["正面","斜侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "band-squat", name: "弹力带深蹲", discipline: "band", category: "弹力带", mode: "repetition", equipment: "resistance-band", difficulty: "入门", primary: ["臀大肌","股四头肌"], secondary: ["臀中肌","腘绳肌","腹部核心"], cue: "弹力带套在膝上方，主动向外撑带并完成深蹲。", breath: "下蹲吸气，站起呼气。", met: 5.5, views: ["正面","侧面"] },
  { id: "band-lateral-walk", name: "弹力带侧向走", discipline: "band", category: "弹力带", mode: "alternating", equipment: "resistance-band", difficulty: "入门", primary: ["臀中肌","臀小肌"], secondary: ["股四头肌","腹部核心"], cue: "保持半蹲，双脚始终维持带子张力并侧向小步移动。", breath: "移动中保持均匀呼吸。", met: 4.5, views: ["正面"] },
  { id: "band-monster-walk", name: "弹力带怪兽走", discipline: "band", category: "弹力带", mode: "alternating", equipment: "resistance-band", difficulty: "入门", primary: ["臀中肌","臀大肌"], secondary: ["股四头肌","腹部核心"], cue: "保持半蹲和带子张力，斜向前后稳定踏步。", breath: "移动中保持均匀呼吸。", met: 5, views: ["正面","斜侧面"], additionalEquipment: ["安全行进空间"] },
  { id: "band-glute-bridge", name: "弹力带臀桥", discipline: "band", category: "弹力带", mode: "repetition", equipment: "resistance-band", difficulty: "入门", primary: ["臀大肌"], secondary: ["臀中肌","腘绳肌","腹部核心"], cue: "膝盖主动向外撑带，脚跟压地把髋推高。", breath: "下降吸气，抬髋呼气。", met: 4.5, views: ["正面","侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "band-kickback", name: "弹力带后踢腿", discipline: "band", category: "弹力带", mode: "alternating", equipment: "resistance-band", difficulty: "入门", primary: ["臀大肌"], secondary: ["腘绳肌","腹部核心"], cue: "骨盆保持朝前，一侧腿克服阻力向后伸展。", breath: "回落吸气，后踢呼气。", met: 4.5, views: ["侧面"], additionalEquipment: ["固定锚点"] },
  { id: "band-hip-abduction", name: "弹力带站姿髋外展", discipline: "band", category: "弹力带", mode: "alternating", equipment: "resistance-band", difficulty: "入门", primary: ["臀中肌"], secondary: ["臀小肌","腹部核心"], cue: "躯干直立，一侧腿向侧面抬起，脚尖保持朝前。", breath: "回落吸气，外展呼气。", met: 4, views: ["正面"] },
  { id: "seated-band-row", name: "坐姿弹力带划船", discipline: "band", category: "弹力带", mode: "repetition", equipment: "resistance-band", difficulty: "入门", primary: ["背阔肌","菱形肌"], secondary: ["肱二头肌","三角肌后束"], cue: "胸口抬起，肘部贴近身体向后拉，肩膀不耸起。", breath: "手臂伸直吸气，划船呼气。", met: 4, views: ["正面","斜侧面"], additionalEquipment: ["瑜伽垫"] },
  { id: "single-arm-band-row", name: "单臂弹力带划船", discipline: "band", category: "弹力带", mode: "alternating", equipment: "resistance-band", difficulty: "入门", primary: ["背阔肌","菱形肌"], secondary: ["肱二头肌","腹部核心"], cue: "固定躯干，一侧肘部沿身体拉向腰部。", breath: "伸臂吸气，划船呼气。", met: 4.5, views: ["正面","斜侧面"], additionalEquipment: ["固定锚点"] },
  { id: "band-chest-press", name: "弹力带胸推", discipline: "band", category: "弹力带", mode: "repetition", equipment: "resistance-band", difficulty: "入门", primary: ["胸大肌","肱三头肌"], secondary: ["三角肌前束","腹部核心"], cue: "肩胛稳定，双手从胸侧向前推直，身体不后仰。", breath: "回收吸气，前推呼气。", met: 4.5, views: ["正面","斜侧面"], additionalEquipment: ["固定锚点"] },
  { id: "band-pull-apart", name: "弹力带水平拉开", discipline: "band", category: "弹力带", mode: "repetition", equipment: "resistance-band", difficulty: "入门", primary: ["三角肌后束","菱形肌"], secondary: ["斜方肌","肩袖肌群"], cue: "双臂与肩同高，把带子向两侧拉开到胸前。", breath: "回收吸气，拉开呼气。", met: 3.5, views: ["正面"] },
  { id: "band-face-pull", name: "弹力带面拉", discipline: "band", category: "弹力带", mode: "repetition", equipment: "resistance-band", difficulty: "进阶", primary: ["三角肌后束","菱形肌"], secondary: ["斜方肌","肩袖肌群","肱二头肌"], cue: "把带子拉向眉眼高度，肘部向外，肩膀远离耳朵。", breath: "伸臂吸气，拉回呼气。", met: 4.5, views: ["正面","斜侧面"], additionalEquipment: ["高位固定锚点"] },
  { id: "band-overhead-press", name: "弹力带过顶推举", discipline: "band", category: "弹力带", mode: "repetition", equipment: "resistance-band", difficulty: "入门", primary: ["三角肌","肱三头肌"], secondary: ["腹部核心","上胸"], cue: "双脚踩稳带子，收紧核心，把双手垂直推过头顶。", breath: "下放吸气，推起呼气。", met: 5, views: ["正面"] },
  { id: "band-lateral-raise", name: "弹力带侧平举", discipline: "band", category: "弹力带", mode: "repetition", equipment: "resistance-band", difficulty: "入门", primary: ["三角肌中束"], secondary: ["斜方肌","冈上肌"], cue: "双脚踩稳带子，手臂向两侧抬到肩高且不耸肩。", breath: "下放吸气，抬起呼气。", met: 4, views: ["正面"] },
  { id: "band-biceps-curl", name: "弹力带弯举", discipline: "band", category: "弹力带", mode: "repetition", equipment: "resistance-band", difficulty: "入门", primary: ["肱二头肌"], secondary: ["肱肌","前臂"], cue: "双脚踩稳带子，肘部贴近身体完成弯举。", breath: "下放吸气，弯举呼气。", met: 4, views: ["正面"] },
  { id: "band-triceps-pressdown", name: "弹力带下压", discipline: "band", category: "弹力带", mode: "repetition", equipment: "resistance-band", difficulty: "入门", primary: ["肱三头肌"], secondary: ["前臂","肩部稳定肌"], cue: "肘部固定在身体两侧，只伸直前臂把带子压下。", breath: "回收吸气，下压呼气。", met: 4, views: ["正面","斜侧面"], additionalEquipment: ["高位固定锚点"] },
];

function verifiedMedia(exerciseId: ExerciseId): ExerciseCoachProfile["media"] {
  return {
    kind: "project-generated",
    licenseStatus: "owned",
    reviewStatus: "verified",
    thumbnailUrl: `/assets/exercise-catalog/generated-batch-01/${exerciseId}-keyframes.webp`,
    animationUrl: `/assets/exercise-catalog/generated-batch-01/${exerciseId}.webp`,
    attribution: "项目统一人物素材 · 批次 01 审核通过",
  };
}

function verifiedMediaBatch02(exerciseId: ExerciseId): ExerciseCoachProfile["media"] {
  return {
    kind: "project-generated",
    licenseStatus: "owned",
    reviewStatus: "verified",
    thumbnailUrl: `/assets/exercise-catalog/generated-batch-02/${exerciseId}-keyframes.webp`,
    animationUrl: `/assets/exercise-catalog/generated-batch-02/${exerciseId}.webp`,
    attribution: "项目统一人物素材 · 批次 02 审核通过",
  };
}

const VERIFIED_MEDIA: Partial<Record<ExerciseId, ExerciseCoachProfile["media"]>> = {
  "wall-sit": {
    kind: "project-generated",
    licenseStatus: "owned",
    reviewStatus: "verified",
    thumbnailUrl: "/assets/exercise-catalog/generated-batch-01/wall-sit-keyframes.webp",
    animationUrl: "/assets/exercise-catalog/generated-batch-01/wall-sit.webp",
    attribution: "项目统一人物素材 · 批次 01 审核通过",
  },
  "wall-push-up": {
    kind: "project-generated",
    licenseStatus: "owned",
    reviewStatus: "verified",
    thumbnailUrl: "/assets/exercise-catalog/generated-batch-01/wall-push-up-keyframes.webp",
    animationUrl: "/assets/exercise-catalog/generated-batch-01/wall-push-up.webp",
    attribution: "项目统一人物素材 · 批次 01 审核通过",
  },
  "cat-cow": {
    kind: "project-generated",
    licenseStatus: "owned",
    reviewStatus: "verified",
    thumbnailUrl: "/assets/exercise-catalog/generated-batch-01/cat-cow-keyframes.webp",
    animationUrl: "/assets/exercise-catalog/generated-batch-01/cat-cow.webp",
    attribution: "项目统一人物素材 · 批次 01 审核通过",
  },
  "band-squat": {
    kind: "project-generated",
    licenseStatus: "owned",
    reviewStatus: "verified",
    thumbnailUrl: "/assets/exercise-catalog/generated-batch-01/band-squat-keyframes.webp",
    animationUrl: "/assets/exercise-catalog/generated-batch-01/band-squat.webp",
    attribution: "项目统一人物素材 · 批次 01 审核通过",
  },
  "incline-push-up": verifiedMedia("incline-push-up"),
  "bear-crawl": verifiedMedia("bear-crawl"),
  "squat-pulse": verifiedMedia("squat-pulse"),
  "reverse-crunch": verifiedMedia("reverse-crunch"),
  "dumbbell-deadlift": verifiedMedia("dumbbell-deadlift"),
  "dumbbell-bench-press": verifiedMedia("dumbbell-bench-press"),
  "alternating-shoulder-press": verifiedMedia("alternating-shoulder-press"),
  "suitcase-march": verifiedMedia("suitcase-march"),
  "warrior-one": verifiedMedia("warrior-one"),
  "warrior-three": verifiedMedia("warrior-three"),
  "ninety-ninety-hip-switch": verifiedMedia("ninety-ninety-hip-switch"),
  "child-pose": verifiedMedia("child-pose"),
  "band-lateral-walk": verifiedMedia("band-lateral-walk"),
  "seated-band-row": verifiedMedia("seated-band-row"),
  "band-chest-press": verifiedMedia("band-chest-press"),
  "band-pull-apart": verifiedMedia("band-pull-apart"),
  "cossack-squat": verifiedMedia("cossack-squat"),
  "single-leg-glute-bridge": verifiedMedia("single-leg-glute-bridge"),
  "plank-up-down": verifiedMedia("plank-up-down"),
  "standing-power-knee": verifiedMedia("standing-power-knee"),
  "triangle-pose": verifiedMedia("triangle-pose"),
  "decline-push-up": verifiedMediaBatch02("decline-push-up"),
  "wide-push-up": verifiedMediaBatch02("wide-push-up"),
  "plank-jack": verifiedMediaBatch02("plank-jack"),
  "side-plank-hip-dip": verifiedMediaBatch02("side-plank-hip-dip"),
  "bear-plank": verifiedMediaBatch02("bear-plank"),
  "squat-hold": verifiedMediaBatch02("squat-hold"),
  "step-jack": verifiedMediaBatch02("step-jack"),
  "dumbbell-front-squat": verifiedMediaBatch02("dumbbell-front-squat"),
  "dumbbell-forward-lunge": verifiedMediaBatch02("dumbbell-forward-lunge"),
  "dumbbell-calf-raise": verifiedMediaBatch02("dumbbell-calf-raise"),
  "dumbbell-single-leg-rdl": verifiedMediaBatch02("dumbbell-single-leg-rdl"),
  "dumbbell-sumo-deadlift": verifiedMediaBatch02("dumbbell-sumo-deadlift"),
  "renegade-row": verifiedMediaBatch02("renegade-row"),
  "dumbbell-upright-row": verifiedMediaBatch02("dumbbell-upright-row"),
  "dumbbell-shrug": verifiedMediaBatch02("dumbbell-shrug"),
  "dumbbell-scaption": verifiedMediaBatch02("dumbbell-scaption"),
  "cross-body-hammer-curl": verifiedMediaBatch02("cross-body-hammer-curl"),
  "crescent-lunge": verifiedMediaBatch02("crescent-lunge"),
  "low-lunge": verifiedMediaBatch02("low-lunge"),
  "cobra-pose": verifiedMediaBatch02("cobra-pose"),
  "open-book-rotation": verifiedMediaBatch02("open-book-rotation"),
  "band-overhead-press": verifiedMediaBatch02("band-overhead-press"),
  "band-biceps-curl": verifiedMediaBatch02("band-biceps-curl"),
};

function suggestedTraining(spec: NewExerciseSpec): ExerciseCoachProfile["suggestedTraining"] {
  if (spec.mode === "timed-hold") {
    return {
      beginner: spec.difficulty === "入门" ? "15–25 秒 × 2 组" : "10–20 秒 × 2 组",
      regular: "30–45 秒 × 3 组",
      restSeconds: spec.difficulty === "入门" ? 30 : 45,
    };
  }
  if (spec.mode === "alternating") {
    return {
      beginner: "每侧 6–8 次 × 2 组",
      regular: "每侧 10–12 次 × 3 组",
      restSeconds: spec.difficulty === "入门" ? 40 : 60,
    };
  }
  return {
    beginner: "8–10 次 × 2 组",
    regular: "10–15 次 × 3 组",
    restSeconds: spec.difficulty === "入门" ? 40 : 60,
  };
}

function phasesFor(mode: ExerciseMode): Array<{ phase: WorkoutPhase; label: string }> {
  if (mode === "timed-hold") {
    return [
      { phase: "calibrating", label: "准备" },
      { phase: "holding", label: "进入姿势" },
      { phase: "paused", label: "结束保持" },
    ];
  }
  if (mode === "alternating") {
    return [
      { phase: "standing", label: "准备" },
      { phase: "left-lift", label: "左侧" },
      { phase: "standing", label: "回中" },
      { phase: "right-lift", label: "右侧" },
    ];
  }
  return [
    { phase: "standing", label: "起始" },
    { phase: "descending", label: "离心阶段" },
    { phase: "bottom", label: "动作端点" },
    { phase: "ascending", label: "向心阶段" },
  ];
}

function safetyNotes(spec: NewExerciseSpec): string[] {
  const notes = [
    "动作范围以稳定、无疼痛为前提；出现锐痛、眩晕或明显不适时立即停止。",
    spec.difficulty === "进阶"
      ? "先熟练低难度版本，再逐步增加幅度、速度或阻力。"
      : "先用可控制的幅度完成，动作稳定后再逐步增加训练量。",
  ];
  if (spec.discipline === "dumbbell") {
    notes.push("选择能够全程控制的重量，器械和支撑面必须稳定。");
  }
  if (spec.discipline === "band") {
    notes.push("训练前检查弹力带有无裂口、老化，并确认锚点牢固。");
  }
  return notes;
}

function commonMistakes(spec: NewExerciseSpec): ExerciseCoachProfile["commonMistakes"] {
  return [
    {
      label: "借惯性完成",
      correction: `放慢动作，${spec.cue}`,
    },
    {
      label: "稳定位置改变",
      correction: "缩小动作幅度，先保持关节对齐和躯干稳定。",
    },
  ];
}

function toProfile(spec: NewExerciseSpec): ExerciseCoachProfile {
  const realtimeCandidate = spec.discipline !== "yoga"
    && !spec.additionalEquipment?.some((item) => item.includes("长凳") || item.includes("锚点"));
  return {
    exerciseId: spec.id,
    name: spec.name,
    catalogSourceId: `project-pending-${spec.id}`,
    category: spec.category,
    mode: spec.mode,
    available: false,
    discipline: spec.discipline,
    equipment: spec.equipment,
    additionalEquipment: spec.additionalEquipment,
    difficulty: spec.difficulty,
    realtimeSupportTier: realtimeCandidate ? "realtime-candidate" : "guided-only",
    supportedViews: spec.views,
    muscles: `${spec.primary.join("、")}；${spec.secondary.join("、")}辅助参与`,
    primaryMuscles: spec.primary,
    secondaryMuscles: spec.secondary,
    activationCue: spec.cue,
    breathingCue: spec.breath,
    safetyNotes: safetyNotes(spec),
    commonMistakes: commonMistakes(spec),
    met: spec.met,
    suggestedTraining: suggestedTraining(spec),
    preparation: `${spec.views.join("或")}完整入镜；先查看动作轨迹和安全提示，再开始训练。`,
    stageTitle: `${spec.name} · 示范已审核，识别规则待开放`,
    cameraTitle: "当前动作暂未开放摄像头训练",
    cameraDetail: "当前可查看训练部位、呼吸、常见错误和建议训练量",
    metricLabels: ["动作幅度", "身体稳定"],
    checkpoints: [
      { label: "主要发力", detail: spec.primary.join("、") },
      { label: "辅助稳定", detail: spec.secondary.join("、") },
      { label: "动作提示", detail: spec.cue },
    ],
    phases: phasesFor(spec.mode),
    issueKeys: ["range", "alignment", "stability"],
    media: VERIFIED_MEDIA[spec.id] ?? {
      kind: "project-generated",
      licenseStatus: "owned",
      reviewStatus: "pending",
      attribution: "项目统一人物素材制作中；逐项审核通过后开放",
    },
  };
}

const activeNewExerciseIdSet = new Set<ExerciseId>(ACTIVE_NEW_EXERCISE_IDS);
const ACTIVE_NEW_EXERCISE_SPECS = NEW_EXERCISE_SPECS.filter(
  (spec) => activeNewExerciseIdSet.has(spec.id),
);

export const NEW_EXERCISE_IDS = ACTIVE_NEW_EXERCISE_SPECS.map((spec) => spec.id);

export const NEW_EXERCISE_PROFILES = Object.fromEntries(
  ACTIVE_NEW_EXERCISE_SPECS.map((spec) => [spec.id, toProfile(spec)]),
) as Record<(typeof NEW_EXERCISE_IDS)[number], ExerciseCoachProfile>;
