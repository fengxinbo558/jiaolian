import {
  CapacityStore,
  estimateE1rm,
  estimateWorkingLoadRange,
  suggestNextLoad,
  type CapacityMode,
  type CapacityRecord,
  type LoadMode,
  type PerformanceType,
} from "../capacity";
import { EXERCISE_ORDER, EXERCISE_PROFILES, exerciseName } from "../exercises";
import { calculateBodyMetrics, type ActivityLevel, type FormulaSex } from "../body/metrics";
import { BodyProfileStore, type BodyProfile, type BodySnapshot } from "../body/profile";
import type { ExerciseId } from "../types";
import { BrowserVoiceInput, type VoiceInputState } from "../voice-input";
import { parseVoiceIntent, type VoiceIntent } from "../voice-intent";

type BodyStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

interface BodyCenterOptions {
  storage: BodyStorage;
  legacyWeightKg: number | null;
  onProfileChange: (profile: BodyProfile) => void;
  onCapacityChange: () => void;
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing body center element: ${id}`);
  return found as T;
}

function numericValue(input: HTMLInputElement): number | null {
  const raw = input.value.trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function setInputValue(input: HTMLInputElement, value: number | null): void {
  input.value = value === null ? "" : String(value);
}

function formatNumber(value: number | null, suffix = ""): string {
  return value === null ? "—" : `${value}${suffix}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "尚未保存";
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    .format(new Date(iso));
}

function clearNode(node: HTMLElement): void {
  node.replaceChildren();
}

function appendOption(select: HTMLSelectElement, value: ExerciseId, label: string): void {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.append(option);
}

function signedChange(current: number | null, previous: number | null, suffix: string): string {
  if (current === null || previous === null) return "首次记录";
  const change = Math.round((current - previous) * 10) / 10;
  if (Math.abs(change) < 0.05) return "与上次持平";
  return `${change > 0 ? "+" : ""}${change}${suffix}`;
}

function createRecordId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `capacity-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

const LOAD_MODE_LABELS: Record<LoadMode, string> = {
  single: "单只",
  "pair-total": "两只合计",
  "machine-total": "器械总重",
};

export class BodyCenter {
  private readonly profileStore: BodyProfileStore;
  private readonly capacityStore: CapacityStore;
  private profile: BodyProfile;
  private records: CapacityRecord[];

  private readonly profileForm = requiredElement<HTMLFormElement>("body-profile-form");
  private readonly ageInput = requiredElement<HTMLInputElement>("body-age");
  private readonly sexSelect = requiredElement<HTMLSelectElement>("body-sex");
  private readonly heightInput = requiredElement<HTMLInputElement>("body-height");
  private readonly weightInput = requiredElement<HTMLInputElement>("weight-input");
  private readonly activitySelect = requiredElement<HTMLSelectElement>("body-activity");
  private readonly chestInput = requiredElement<HTMLInputElement>("body-chest");
  private readonly waistInput = requiredElement<HTMLInputElement>("body-waist");
  private readonly neckInput = requiredElement<HTMLInputElement>("body-neck");
  private readonly hipInput = requiredElement<HTMLInputElement>("body-hip");
  private readonly profileError = requiredElement<HTMLElement>("weight-error");
  private readonly profileSuccess = requiredElement<HTMLElement>("body-profile-success");
  private readonly statusPanel = requiredElement<HTMLElement>("body-status-panel");
  private readonly voiceButton = requiredElement<HTMLButtonElement>("body-voice-button");
  private readonly voiceButtonLabel = requiredElement<HTMLElement>("body-voice-button-label");
  private readonly voicePanel = requiredElement<HTMLElement>("body-voice-panel");
  private readonly voiceState = requiredElement<HTMLElement>("body-voice-state");
  private readonly voiceTranscript = requiredElement<HTMLTextAreaElement>("body-voice-transcript");
  private readonly voiceActions = requiredElement<HTMLElement>("body-voice-actions");
  private readonly voiceSessionButton = requiredElement<HTMLButtonElement>("body-voice-session-button");
  private readonly voiceUseButton = requiredElement<HTMLButtonElement>("body-voice-use-button");
  private readonly voiceDiscardButton = requiredElement<HTMLButtonElement>("body-voice-discard-button");
  private readonly voiceFields = requiredElement<HTMLElement>("body-voice-fields");
  private readonly voiceFeedback = requiredElement<HTMLElement>("body-voice-feedback");
  private readonly trendList = requiredElement<HTMLOListElement>("body-trend-list");
  private readonly recordDialog = requiredElement<HTMLDialogElement>("body-record-dialog");
  private readonly recordForm = requiredElement<HTMLFormElement>("body-record-form");
  private readonly recordOriginalDate = requiredElement<HTMLInputElement>("body-record-original-date");
  private readonly recordWeight = requiredElement<HTMLInputElement>("body-record-weight");
  private readonly recordHeight = requiredElement<HTMLInputElement>("body-record-height");
  private readonly recordChest = requiredElement<HTMLInputElement>("body-record-chest");
  private readonly recordWaist = requiredElement<HTMLInputElement>("body-record-waist");
  private readonly recordNeck = requiredElement<HTMLInputElement>("body-record-neck");
  private readonly recordHip = requiredElement<HTMLInputElement>("body-record-hip");

  private readonly equipmentForm = requiredElement<HTMLFormElement>("equipment-capacity-form");
  private readonly equipmentExercise = requiredElement<HTMLSelectElement>("equipment-exercise");
  private readonly equipmentPerformance = requiredElement<HTMLSelectElement>("equipment-performance");
  private readonly equipmentLoadMode = requiredElement<HTMLSelectElement>("equipment-load-mode");
  private readonly equipmentLoad = requiredElement<HTMLInputElement>("equipment-load");
  private readonly equipmentReps = requiredElement<HTMLInputElement>("equipment-reps");
  private readonly equipmentSets = requiredElement<HTMLInputElement>("equipment-sets");
  private readonly equipmentRir = requiredElement<HTMLSelectElement>("equipment-rir");
  private readonly equipmentQuality = requiredElement<HTMLInputElement>("equipment-quality");
  private readonly equipmentQualityOutput = requiredElement<HTMLOutputElement>("equipment-quality-output");
  private readonly equipmentError = requiredElement<HTMLElement>("equipment-capacity-error");

  private readonly bodyweightForm = requiredElement<HTMLFormElement>("bodyweight-capacity-form");
  private readonly bodyweightExercise = requiredElement<HTMLSelectElement>("bodyweight-exercise");
  private readonly bodyweightMode = requiredElement<HTMLSelectElement>("bodyweight-mode");
  private readonly bodyweightValue = requiredElement<HTMLInputElement>("bodyweight-value");
  private readonly bodyweightSets = requiredElement<HTMLInputElement>("bodyweight-sets");
  private readonly bodyweightAssistance = requiredElement<HTMLInputElement>("bodyweight-assistance");
  private readonly bodyweightQuality = requiredElement<HTMLInputElement>("bodyweight-quality");
  private readonly bodyweightQualityOutput = requiredElement<HTMLOutputElement>("bodyweight-quality-output");
  private readonly bodyweightError = requiredElement<HTMLElement>("bodyweight-capacity-error");
  private voiceInput: BrowserVoiceInput | null = null;
  private voicePauseRequested = false;
  private voiceDraftAccepted = false;

  constructor(private readonly options: BodyCenterOptions) {
    this.profileStore = new BodyProfileStore(options.storage);
    this.capacityStore = new CapacityStore(options.storage);
    this.profile = this.profileStore.load(options.legacyWeightKg);
    this.records = this.capacityStore.load();
  }

  init(): void {
    // Keep the editable data in the first content block; calculated summaries follow it.
    this.statusPanel.insertAdjacentElement("beforebegin", this.profileForm);
    this.populateExerciseOptions();
    this.hydrateProfileForm();
    this.initializeVoiceInput();
    this.bindEvents();
    this.render();
  }

  private initializeVoiceInput(): void {
    this.voiceInput = new BrowserVoiceInput({
      onStateChange: (state) => this.renderVoiceState(state),
      onTranscript: (transcript, isFinal) => this.handleVoiceTranscript(transcript, isFinal),
      onError: (message) => {
        this.voiceFeedback.textContent = message;
      },
    });
  }

  private populateExerciseOptions(): void {
    clearNode(this.equipmentExercise);
    clearNode(this.bodyweightExercise);
    for (const exerciseId of EXERCISE_ORDER) {
      const profile = EXERCISE_PROFILES[exerciseId];
      if (profile.equipment && profile.equipment !== "none") {
        appendOption(this.equipmentExercise, exerciseId, profile.name);
      } else {
        appendOption(this.bodyweightExercise, exerciseId, profile.name);
      }
    }
  }

  private hydrateProfileForm(): void {
    setInputValue(this.ageInput, this.profile.age);
    this.sexSelect.value = this.profile.formulaSex ?? "";
    setInputValue(this.heightInput, this.profile.heightCm);
    setInputValue(this.weightInput, this.profile.weightKg);
    this.activitySelect.value = this.profile.activityLevel ?? "";
    setInputValue(this.chestInput, this.profile.chestCm);
    setInputValue(this.waistInput, this.profile.waistCm);
    setInputValue(this.neckInput, this.profile.neckCm);
    setInputValue(this.hipInput, this.profile.hipCm);
    const details = this.profileForm.querySelector<HTMLDetailsElement>("details");
    if (details) details.open = true;
  }

  private bindEvents(): void {
    this.profileForm.addEventListener("submit", (event) => this.saveProfile(event));
    requiredElement<HTMLButtonElement>("body-data-jump-button").addEventListener("click", () => {
      this.profileForm.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
      window.setTimeout(() => this.weightInput.focus({ preventScroll: true }), 350);
    });
    this.equipmentForm.addEventListener("submit", (event) => this.saveEquipmentRecord(event));
    this.bodyweightForm.addEventListener("submit", (event) => this.saveBodyweightRecord(event));
    this.equipmentQuality.addEventListener("input", () => {
      this.equipmentQualityOutput.value = `${this.equipmentQuality.value}%`;
    });
    this.bodyweightQuality.addEventListener("input", () => {
      this.bodyweightQualityOutput.value = `${this.bodyweightQuality.value}%`;
    });
    this.bodyweightMode.addEventListener("change", () => this.renderBodyweightMode());
    this.voiceButton.addEventListener("click", () => this.toggleVoiceInput());
    this.voiceSessionButton.addEventListener("click", () => this.toggleVoiceInput());
    this.voiceTranscript.addEventListener("input", () => this.handleVoiceDraftInput());
    this.voiceUseButton.addEventListener("click", () => this.confirmVoiceDraft());
    this.voiceDiscardButton.addEventListener("click", () => this.discardVoiceDraft());
    this.trendList.addEventListener("click", (event) => this.handleTrendAction(event));
    this.recordForm.addEventListener("submit", (event) => this.saveSnapshotCorrection(event));
    requiredElement("body-record-dialog-close").addEventListener("click", () => this.recordDialog.close());
    requiredElement("body-record-dialog-cancel").addEventListener("click", () => this.recordDialog.close());
    window.addEventListener("pagehide", () => this.voiceInput?.destroy(), { once: true });
    this.renderBodyweightMode();
  }

  private toggleVoiceInput(): void {
    if (!this.voiceInput?.isSupported()) return;
    this.voicePanel.classList.remove("hidden");
    this.voiceButton.setAttribute("aria-expanded", "true");
    if (this.voiceInput.isListening()) {
      this.voicePauseRequested = true;
      this.voiceInput.stop();
      return;
    }
    this.voicePauseRequested = false;
    this.voiceDraftAccepted = false;
    this.voiceFields.replaceChildren();
    this.updateVoiceDraftActions();
    this.voiceFeedback.textContent = this.voiceTranscript.value.trim()
      ? "正在从现有文字后继续录音；说完点击“暂停录音”，原文字不会被覆盖。"
      : "请自然说出身体数据或运动能力；说完点击“暂停录音”。";
    if (!this.voiceInput.start(this.voiceTranscript.value)) this.voiceTranscript.readOnly = false;
  }

  private renderVoiceState(state: VoiceInputState): void {
    this.voicePanel.dataset.state = state;
    this.voiceButton.dataset.state = state;
    this.voiceSessionButton.dataset.state = state;
    this.voicePanel.setAttribute("aria-busy", String(state === "processing"));
    if (state === "unsupported") {
      this.voicePanel.classList.remove("hidden");
      this.voiceButton.disabled = true;
      this.voiceSessionButton.disabled = true;
      this.voiceTranscript.readOnly = false;
      this.voiceButton.setAttribute("aria-expanded", "true");
      this.voiceButtonLabel.textContent = "浏览器不支持语音录入";
      this.voiceSessionButton.textContent = "仅手动输入";
      this.voiceState.textContent = "当前浏览器没有语音识别能力";
      this.voiceFeedback.textContent = "可以在识别文字框中直接输入，或使用支持中文语音识别的 Chrome / Edge 打开本页。";
      this.updateVoiceDraftActions();
      return;
    }
    if (state === "listening") {
      this.voiceButton.disabled = false;
      this.voiceSessionButton.disabled = false;
      this.voiceTranscript.readOnly = true;
      this.voiceButtonLabel.textContent = "暂停录音";
      this.voiceSessionButton.textContent = "暂停录音";
      this.voiceState.textContent = "正在录音，点“暂停录音”后可修改";
      this.updateVoiceDraftActions();
      return;
    }
    if (state === "reconnecting") {
      this.voiceButton.disabled = false;
      this.voiceSessionButton.disabled = false;
      this.voiceTranscript.readOnly = true;
      this.voiceButtonLabel.textContent = "暂停录音";
      this.voiceSessionButton.textContent = "暂停录音";
      this.voiceState.textContent = "连接波动，正在自动恢复录音";
      this.updateVoiceDraftActions();
      return;
    }
    if (state === "processing") {
      this.voiceButton.disabled = true;
      this.voiceSessionButton.disabled = true;
      this.voiceTranscript.readOnly = true;
      this.voiceButtonLabel.textContent = "正在暂停";
      this.voiceSessionButton.textContent = "正在暂停";
      this.voiceState.textContent = "正在整理最后一段语音，请稍候";
      this.updateVoiceDraftActions();
      return;
    }
    if (state === "error") {
      this.voicePauseRequested = false;
      this.voiceButton.disabled = false;
      this.voiceSessionButton.disabled = false;
      this.voiceTranscript.readOnly = false;
      const hasDraft = this.voiceTranscript.value.trim().length > 0;
      this.voiceButtonLabel.textContent = hasDraft ? "继续录音" : "开始录音";
      this.voiceSessionButton.textContent = hasDraft ? "继续录音" : "开始录音";
      this.voiceState.textContent = this.voiceTranscript.value.trim()
        ? "识别中断，文字已保留并可修改"
        : "识别中断，也可以直接手动输入";
      this.updateVoiceDraftActions();
      return;
    }
    this.voiceButton.disabled = false;
    this.voiceSessionButton.disabled = false;
    this.voiceTranscript.readOnly = false;
    const hasDraft = this.voiceTranscript.value.trim().length > 0;
    this.voiceButtonLabel.textContent = hasDraft ? "继续录音" : "开始录音";
    this.voiceSessionButton.textContent = hasDraft ? "继续录音" : "开始录音";
    this.voiceState.textContent = hasDraft
      ? "已暂停，可修改、继续录音或确认保存"
      : this.voicePauseRequested
        ? "已暂停，没有听到内容，也可以直接输入"
        : "点击“开始录音”或直接输入";
    this.voicePauseRequested = false;
    this.updateVoiceDraftActions();
  }

  private handleVoiceTranscript(transcript: string, _isFinal: boolean): void {
    this.voicePanel.classList.remove("hidden");
    this.voiceDraftAccepted = false;
    this.voiceTranscript.value = transcript;
    this.voiceState.textContent = "正在录音，点“暂停录音”后可修改";
    this.voiceFeedback.textContent = "录音会持续到你主动暂停；尚未保存，暂停后再检查文字。";
    this.updateVoiceDraftActions();
  }

  private handleVoiceDraftInput(): void {
    this.voiceDraftAccepted = false;
    this.voiceFields.replaceChildren();
    this.voiceFeedback.textContent = this.voiceTranscript.value.trim()
      ? "文字已修改。确认无误后可直接“确认并保存”。"
      : "可以直接输入，也可以点击“开始录音”。";
    this.updateVoiceDraftActions();
  }

  private confirmVoiceDraft(): void {
    const transcript = this.voiceTranscript.value.trim();
    if (!transcript) {
      this.voiceFeedback.textContent = "请先录入或输入内容。";
      this.updateVoiceDraftActions();
      return;
    }
    const intent = parseVoiceIntent(transcript);
    this.applyVoiceIntent(intent);
    if (intent.matchedFields.length > 0) {
      this.voiceDraftAccepted = true;
      const targetForm = intent.kind === "body-profile"
        ? this.profileForm
        : intent.kind === "equipment"
          ? this.equipmentForm
          : this.bodyweightForm;
      if (targetForm.checkValidity()) {
        targetForm.requestSubmit();
        this.voiceState.textContent = "已按检查后的文字填入并保存";
        this.voiceFeedback.textContent = "保存完成；如需补充，可继续录音或直接修改文字。";
      } else {
        this.voiceState.textContent = "已填入，仍有必填项需要补全";
        this.voiceFeedback.textContent = "识别内容已填入表单，但尚未保存。请补全必填项后点击保存。";
      }
    }
    this.updateVoiceDraftActions();
  }

  private discardVoiceDraft(): void {
    this.voiceDraftAccepted = false;
    this.voiceTranscript.value = "";
    this.voiceFields.replaceChildren();
    this.voiceFeedback.textContent = "文字已清空；已填入或已保存的数据不会被删除。";
    this.voiceState.textContent = "点击“开始录音”或直接输入";
    this.updateVoiceDraftActions();
    this.voiceButton.focus();
  }

  private updateVoiceDraftActions(): void {
    const hasText = this.voiceTranscript.value.trim().length > 0;
    const listening = this.voiceInput?.isListening() ?? false;
    const state = this.voicePanel.dataset.state;
    const processing = state === "processing";
    if (!listening && !processing && state !== "unsupported") {
      const readyLabel = hasText ? "继续录音" : "开始录音";
      this.voiceButtonLabel.textContent = readyLabel;
      this.voiceSessionButton.textContent = readyLabel;
    }
    this.voiceUseButton.disabled = !hasText || listening || processing || this.voiceDraftAccepted;
    this.voiceDiscardButton.disabled = !hasText || listening || processing;
    this.voiceActions.classList.remove("hidden");
  }

  private applyVoiceIntent(intent: VoiceIntent): void {
    this.voiceFields.replaceChildren();
    for (const label of intent.matchedFields) {
      const chip = document.createElement("span");
      chip.textContent = label;
      this.voiceFields.append(chip);
    }
    if (intent.kind === "body-profile") {
      if (intent.patch.age !== undefined) setInputValue(this.ageInput, intent.patch.age);
      if (intent.patch.formulaSex !== undefined) this.sexSelect.value = intent.patch.formulaSex;
      if (intent.patch.heightCm !== undefined) setInputValue(this.heightInput, intent.patch.heightCm);
      if (intent.patch.weightKg !== undefined) setInputValue(this.weightInput, intent.patch.weightKg);
      if (intent.patch.activityLevel !== undefined) this.activitySelect.value = intent.patch.activityLevel;
      if (intent.patch.chestCm !== undefined) setInputValue(this.chestInput, intent.patch.chestCm);
      if (intent.patch.waistCm !== undefined) setInputValue(this.waistInput, intent.patch.waistCm);
      if (intent.patch.neckCm !== undefined) setInputValue(this.neckInput, intent.patch.neckCm);
      if (intent.patch.hipCm !== undefined) setInputValue(this.hipInput, intent.patch.hipCm);
      if (intent.patch.chestCm !== undefined || intent.patch.waistCm !== undefined || intent.patch.neckCm !== undefined || intent.patch.hipCm !== undefined) {
        const details = this.profileForm.querySelector<HTMLDetailsElement>("details");
        if (details) details.open = true;
      }
    } else if (intent.kind === "equipment") {
      if (intent.patch.exerciseId !== undefined) this.equipmentExercise.value = intent.patch.exerciseId;
      if (intent.patch.performanceType !== undefined) this.equipmentPerformance.value = intent.patch.performanceType;
      if (intent.patch.loadMode !== undefined) this.equipmentLoadMode.value = intent.patch.loadMode;
      if (intent.patch.loadKg !== undefined) setInputValue(this.equipmentLoad, intent.patch.loadKg);
      if (intent.patch.reps !== undefined) setInputValue(this.equipmentReps, intent.patch.reps);
      if (intent.patch.sets !== undefined) setInputValue(this.equipmentSets, intent.patch.sets);
      if (intent.patch.rir !== undefined) this.equipmentRir.value = String(intent.patch.rir);
    } else if (intent.kind === "bodyweight") {
      if (intent.patch.exerciseId !== undefined) this.bodyweightExercise.value = intent.patch.exerciseId;
      if (intent.patch.mode !== undefined) this.bodyweightMode.value = intent.patch.mode;
      this.renderBodyweightMode();
      const value = intent.patch.mode === "timed-hold" ? intent.patch.holdSeconds : intent.patch.reps;
      if (value !== undefined) setInputValue(this.bodyweightValue, value);
      if (intent.patch.sets !== undefined) setInputValue(this.bodyweightSets, intent.patch.sets);
      if (intent.patch.assistance !== undefined) this.bodyweightAssistance.value = intent.patch.assistance;
    }
    const warningText = intent.warnings.join("；");
    this.voiceFeedback.textContent = intent.matchedFields.length
      ? `已填入 ${intent.matchedFields.length} 项，但尚未保存。${warningText ? ` ${warningText}` : " 请检查后点击对应的保存按钮。"}`
      : warningText || "没有识别出可填写的字段，请换一种说法重试。";
  }

  private saveProfile(event: SubmitEvent): void {
    event.preventDefault();
    this.profileError.classList.add("hidden");
    this.profileSuccess.classList.add("hidden");
    if (!this.profileForm.checkValidity()) {
      this.profileError.textContent = "请先完成带 * 的项目，并检查数字范围。";
      this.profileError.classList.remove("hidden");
      this.profileForm.reportValidity();
      return;
    }

    const formulaSex = this.sexSelect.value as FormulaSex;
    const activityLevel = this.activitySelect.value as ActivityLevel;
    this.profile = this.profileStore.save({
      schemaVersion: 1,
      age: numericValue(this.ageInput),
      formulaSex,
      heightCm: numericValue(this.heightInput),
      weightKg: numericValue(this.weightInput),
      activityLevel,
      chestCm: numericValue(this.chestInput),
      waistCm: numericValue(this.waistInput),
      neckCm: numericValue(this.neckInput),
      hipCm: numericValue(this.hipInput),
      updatedAt: this.profile.updatedAt,
    });
    this.render();
    this.options.onProfileChange(this.profile);
    const metrics = calculateBodyMetrics(this.profile);
    const calculated = [
      metrics.bmi === null ? null : `BMI ${metrics.bmi}`,
      metrics.bmrKcal === null ? null : `基础代谢 ${metrics.bmrKcal} 千卡/天`,
      metrics.tdeeKcal === null ? null : `日常总消耗 ${metrics.tdeeKcal} 千卡/天`,
      metrics.bodyFatPercent === null ? null : `体脂参考 ${metrics.bodyFatPercent}%`,
    ].filter((item): item is string => item !== null);
    this.profileSuccess.textContent = `已保存到当前设备的浏览器。${calculated.join("；")}。首页热量、训练消耗和计划推荐已同步更新。`;
    this.profileSuccess.classList.remove("hidden");
    this.statusPanel.focus({ preventScroll: true });
    this.statusPanel.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }

  private saveEquipmentRecord(event: SubmitEvent): void {
    event.preventDefault();
    this.equipmentError.classList.add("hidden");
    if (!this.equipmentForm.checkValidity()) {
      this.equipmentError.textContent = "请把动作、重量口径、重量、次数、组数和余力填写完整。";
      this.equipmentError.classList.remove("hidden");
      this.equipmentForm.reportValidity();
      return;
    }
    const record: CapacityRecord = {
      schemaVersion: 1,
      id: createRecordId(),
      exerciseId: this.equipmentExercise.value as ExerciseId,
      mode: "equipment",
      performanceType: this.equipmentPerformance.value as PerformanceType,
      recordedAt: new Date().toISOString(),
      loadKg: numericValue(this.equipmentLoad),
      loadMode: this.equipmentLoadMode.value as LoadMode,
      reps: numericValue(this.equipmentReps),
      sets: numericValue(this.equipmentSets),
      holdSeconds: null,
      rir: Number(this.equipmentRir.value),
      qualityPercent: Number(this.equipmentQuality.value),
      assistance: null,
    };
    this.records = this.capacityStore.add(record);
    this.equipmentLoad.value = "";
    this.equipmentReps.value = "";
    this.renderCapacity();
    this.options.onCapacityChange();
  }

  private saveBodyweightRecord(event: SubmitEvent): void {
    event.preventDefault();
    this.bodyweightError.classList.add("hidden");
    if (!this.bodyweightForm.checkValidity()) {
      this.bodyweightError.textContent = "请把动作、成绩和组数填写完整。";
      this.bodyweightError.classList.remove("hidden");
      this.bodyweightForm.reportValidity();
      return;
    }
    const mode = this.bodyweightMode.value as CapacityMode;
    const value = numericValue(this.bodyweightValue);
    const record: CapacityRecord = {
      schemaVersion: 1,
      id: createRecordId(),
      exerciseId: this.bodyweightExercise.value as ExerciseId,
      mode,
      performanceType: "working",
      recordedAt: new Date().toISOString(),
      loadKg: null,
      loadMode: null,
      reps: mode === "bodyweight-reps" ? value : null,
      sets: numericValue(this.bodyweightSets),
      holdSeconds: mode === "timed-hold" ? value : null,
      rir: null,
      qualityPercent: Number(this.bodyweightQuality.value),
      assistance: this.bodyweightAssistance.value.trim() || null,
    };
    this.records = this.capacityStore.add(record);
    this.bodyweightValue.value = "";
    this.bodyweightAssistance.value = "";
    this.renderCapacity();
    this.options.onCapacityChange();
  }

  private render(): void {
    this.renderBodyMetrics();
    this.renderTrends();
    this.renderCapacity();
  }

  private renderBodyMetrics(): void {
    const metrics = calculateBodyMetrics(this.profile);
    requiredElement("body-profile-date").textContent = this.profile.updatedAt
      ? `更新于 ${formatDate(this.profile.updatedAt)}`
      : this.profile.weightKg !== null ? "已带入原体重设置" : "尚未保存";
    requiredElement("body-metric-bmi-card").dataset.state = metrics.bmi === null ? "empty" : "ready";
    requiredElement("body-metric-bmr-card").dataset.state = metrics.bmrKcal === null ? "empty" : "ready";
    requiredElement("body-metric-tdee-card").dataset.state = metrics.tdeeKcal === null ? "empty" : "ready";
    requiredElement("body-metric-fat-card").dataset.state = metrics.bodyFatPercent === null ? "empty" : "ready";
    requiredElement("body-metric-bmi").textContent = metrics.bmi === null ? "待录入" : formatNumber(metrics.bmi);
    requiredElement("body-metric-bmi-note").textContent = metrics.bmiBand ?? "填写身高与体重";
    requiredElement("body-metric-bmr").textContent = metrics.bmrKcal === null ? "待计算" : formatNumber(metrics.bmrKcal);
    requiredElement("body-metric-bmr-note").textContent = metrics.bmrKcal === null
      ? "补全年龄与公式参数"
      : "千卡/天 · 公式估算";
    requiredElement("body-metric-tdee").textContent = metrics.tdeeKcal === null ? "待估算" : formatNumber(metrics.tdeeKcal);
    requiredElement("body-metric-tdee-note").textContent = metrics.tdeeKcal === null
      ? "设置日常活动水平"
      : "千卡/天 · 活动系数估算";
    requiredElement("body-metric-fat").textContent = metrics.bodyFatPercent === null ? "可选评估" : formatNumber(metrics.bodyFatPercent, "%");
    requiredElement("body-metric-fat-note").textContent = metrics.bodyFatPercent === null
      ? "补充腰围、颈围等数据"
      : "美国海军围度公式估算";
    requiredElement("body-metric-whtr").textContent = formatNumber(metrics.waistToHeightRatio);
    requiredElement("body-metric-whr").textContent = formatNumber(metrics.waistToHipRatio);
    requiredElement("body-metric-fat-mass").textContent = formatNumber(metrics.fatMassKg, " kg");
    requiredElement("body-metric-lean").textContent = formatNumber(metrics.leanMassKg, " kg");
    requiredElement("body-metric-ffmi").textContent = formatNumber(metrics.ffmi);
    requiredElement("body-weight-range").textContent = metrics.healthyWeightRangeKg
      ? `健康体重参考范围：${metrics.healthyWeightRangeKg.low}–${metrics.healthyWeightRangeKg.high} kg`
      : "填写身高后显示健康体重参考范围";
    requiredElement("body-status-summary").textContent = metrics.bmi !== null && metrics.tdeeKcal !== null
      ? `当前 BMI 为 ${metrics.bmi}（${metrics.bmiBand}）；按所选活动水平，日常总消耗约 ${metrics.tdeeKcal} 千卡。`
      : "填写身高、体重、年龄和活动水平后，这里会生成个人参考，不会补全你没有提供的数据。";
  }

  private renderTrends(): void {
    const snapshots = this.profileStore.loadSnapshots();
    requiredElement("body-trend-count").textContent = `${snapshots.length} 条`;
    this.renderTrendSummary(snapshots);
    clearNode(this.trendList);
    if (snapshots.length === 0) {
      const empty = document.createElement("li");
      empty.className = "body-empty";
      empty.textContent = "保存身体数据后，这里会保留变化记录。";
      this.trendList.append(empty);
      return;
    }
    for (const [index, snapshot] of snapshots.entries()) {
      this.trendList.append(this.createTrendItem(snapshot, snapshots[index + 1] ?? null));
    }
  }

  private renderTrendSummary(snapshots: BodySnapshot[]): void {
    const container = requiredElement("body-change-summary");
    clearNode(container);
    const current = snapshots[0];
    const previous = snapshots[1];
    if (!current || !previous) {
      const empty = document.createElement("p");
      empty.className = "body-empty";
      empty.textContent = current
        ? "再保存一次不同日期的数据，就能看到与上次的直观差值。"
        : "保存两次不同日期的数据后，这里会显示体重、体脂、腰围和脂肪量变化。";
      container.append(empty);
      return;
    }
    const currentMetrics = calculateBodyMetrics(current);
    const previousMetrics = calculateBodyMetrics(previous);
    const fields = [
      { label: "体重", current: current.weightKg, previous: previous.weightKg, suffix: " kg" },
      { label: "体脂率", current: currentMetrics.bodyFatPercent, previous: previousMetrics.bodyFatPercent, suffix: " 个百分点" },
      { label: "胸围", current: current.chestCm, previous: previous.chestCm, suffix: " cm" },
      { label: "腰围", current: current.waistCm, previous: previous.waistCm, suffix: " cm" },
      { label: "脂肪量", current: currentMetrics.fatMassKg, previous: previousMetrics.fatMassKg, suffix: " kg" },
    ];
    for (const field of fields) {
      const card = document.createElement("article");
      const label = document.createElement("span");
      const value = document.createElement("strong");
      const delta = document.createElement("small");
      label.textContent = field.label;
      value.textContent = field.current === null
        ? "待补充"
        : field.label === "体脂率"
          ? `${field.current}%`
          : `${field.current}${field.suffix}`;
      delta.textContent = field.current === null || field.previous === null
        ? "缺少可比较数据"
        : `比上次 ${signedChange(field.current, field.previous, field.suffix)}`;
      if (field.current !== null && field.previous !== null) {
        const difference = field.current - field.previous;
        card.dataset.direction = Math.abs(difference) < 0.05 ? "flat" : difference > 0 ? "up" : "down";
      }
      card.append(label, value, delta);
      container.append(card);
    }
  }

  private createTrendItem(snapshot: BodySnapshot, previous: BodySnapshot | null): HTMLLIElement {
    const item = document.createElement("li");
    const date = document.createElement("time");
    date.dateTime = snapshot.recordedAt;
    date.textContent = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" })
      .format(new Date(snapshot.recordedAt));
    const data = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = snapshot.weightKg === null ? "身体档案已更新" : `${snapshot.weightKg} kg`;
    const detail = document.createElement("small");
    const bodyFat = calculateBodyMetrics(snapshot).bodyFatPercent;
    detail.textContent = [
      snapshot.chestCm === null ? null : `胸围 ${snapshot.chestCm} cm`,
      snapshot.waistCm === null ? null : `腰围 ${snapshot.waistCm} cm`,
      bodyFat === null ? null : `体脂参考 ${bodyFat}%`,
    ].filter((text): text is string => text !== null).join(" · ") || "基础资料记录";
    data.append(title, detail);
    const change = document.createElement("span");
    change.textContent = signedChange(snapshot.weightKg, previous?.weightKg ?? null, " kg");
    const actions = document.createElement("div");
    actions.className = "body-trend-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.dataset.trendAction = "edit";
    edit.dataset.recordedAt = snapshot.recordedAt;
    edit.textContent = "更正";
    edit.setAttribute("aria-label", `更正 ${date.textContent} 的身体记录`);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.trendAction = "delete";
    remove.dataset.recordedAt = snapshot.recordedAt;
    remove.textContent = "删除";
    remove.setAttribute("aria-label", `删除 ${date.textContent} 的身体记录`);
    actions.append(edit, remove);
    item.append(date, data, change, actions);
    return item;
  }

  private handleTrendAction(event: Event): void {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-trend-action]");
    const recordedAt = button?.dataset.recordedAt;
    if (!button || !recordedAt) return;
    if (button.dataset.trendAction === "edit") {
      this.openSnapshotDialog(recordedAt);
      return;
    }
    const snapshot = this.profileStore.loadSnapshots().find((item) => item.recordedAt === recordedAt);
    if (!snapshot) return;
    const dateLabel = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" })
      .format(new Date(snapshot.recordedAt));
    if (!window.confirm(`删除 ${dateLabel} 的身体记录？删除后会重新计算前后变化。`)) return;
    this.profile = this.profileStore.deleteSnapshot(recordedAt);
    this.hydrateProfileForm();
    this.render();
    this.options.onProfileChange(this.profile);
    this.profileSuccess.textContent = "记录已删除，身体趋势和关联参考已重新计算。";
    this.profileSuccess.classList.remove("hidden");
  }

  private openSnapshotDialog(recordedAt: string): void {
    const snapshot = this.profileStore.loadSnapshots().find((item) => item.recordedAt === recordedAt);
    if (!snapshot) return;
    this.recordOriginalDate.value = recordedAt;
    setInputValue(this.recordWeight, snapshot.weightKg);
    setInputValue(this.recordHeight, snapshot.heightCm);
    setInputValue(this.recordChest, snapshot.chestCm);
    setInputValue(this.recordWaist, snapshot.waistCm);
    setInputValue(this.recordNeck, snapshot.neckCm);
    setInputValue(this.recordHip, snapshot.hipCm);
    requiredElement("body-record-dialog-date").textContent = new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(snapshot.recordedAt));
    this.recordDialog.showModal();
    this.recordWeight.focus();
  }

  private saveSnapshotCorrection(event: SubmitEvent): void {
    event.preventDefault();
    if (!this.recordForm.checkValidity()) {
      this.recordForm.reportValidity();
      return;
    }
    this.profile = this.profileStore.updateSnapshot(this.recordOriginalDate.value, {
      heightCm: numericValue(this.recordHeight),
      weightKg: numericValue(this.recordWeight),
      chestCm: numericValue(this.recordChest),
      waistCm: numericValue(this.recordWaist),
      neckCm: numericValue(this.recordNeck),
      hipCm: numericValue(this.recordHip),
    });
    this.recordDialog.close();
    this.hydrateProfileForm();
    this.render();
    this.options.onProfileChange(this.profile);
    this.profileSuccess.textContent = "历史记录已更正，差值和所有关联参考已重新计算。";
    this.profileSuccess.classList.remove("hidden");
  }

  private renderBodyweightMode(): void {
    const timed = this.bodyweightMode.value === "timed-hold";
    requiredElement("bodyweight-value-label").textContent = timed ? "保持时长" : "合格次数";
    requiredElement("bodyweight-value-unit").textContent = timed ? "秒" : "次";
    this.bodyweightValue.max = timed ? "3600" : "500";
  }

  private renderCapacity(): void {
    requiredElement("capacity-record-count").textContent = `${this.records.length} 条`;
    this.renderCapacityHighlight();
    const list = requiredElement<HTMLOListElement>("capacity-record-list");
    clearNode(list);
    if (this.records.length === 0) {
      const empty = document.createElement("li");
      empty.className = "body-empty";
      empty.textContent = "还没有运动能力记录。";
      list.append(empty);
      return;
    }
    for (const record of this.records) list.append(this.createCapacityItem(record));
  }

  private renderCapacityHighlight(): void {
    const container = requiredElement("capacity-highlight");
    clearNode(container);
    const latest = this.records[0];
    if (!latest) {
      const empty = document.createElement("p");
      empty.textContent = "完成第一条记录后，这里会计算可解释的训练参考。";
      container.append(empty);
      return;
    }

    const label = document.createElement("span");
    label.textContent = `${exerciseName(latest.exerciseId)} · 下一次参考`;
    const result = document.createElement("strong");
    const note = document.createElement("p");
    if (latest.mode === "equipment") {
      const sameExercise = this.records.filter((record) =>
        record.exerciseId === latest.exerciseId
        && record.mode === "equipment"
        && record.loadMode === latest.loadMode
      );
      const e1rm = estimateE1rm(latest.loadKg, latest.reps);
      const workingRange = estimateWorkingLoadRange(e1rm);
      const suggestion = suggestNextLoad(sameExercise);
      const loadModeLabel = latest.loadMode ? LOAD_MODE_LABELS[latest.loadMode] : "同一重量口径";
      label.textContent = `${exerciseName(latest.exerciseId)} · ${loadModeLabel} · 下一次参考`;
      result.textContent = suggestion.suggestedLoadKg === null
        ? "先建立第二次记录"
        : `${suggestion.suggestedLoadKg} kg`;
      const e1rmText = e1rm === null
        ? "当前次数不在 2–10 次范围，不显示 e1RM"
        : `估算 e1RM ${e1rm} kg${workingRange ? `，常见组重量参考 ${workingRange.low}–${workingRange.high} kg` : ""}`;
      note.textContent = `${suggestion.message} ${e1rmText}。`;
    } else {
      const comparable = this.records.filter((record) =>
        record.exerciseId === latest.exerciseId
        && record.mode === latest.mode
        && record.assistance === latest.assistance
        && (record.qualityPercent ?? 0) >= 75
      );
      const best = Math.max(...comparable.map((record) => record.reps ?? record.holdSeconds ?? 0));
      const unit = latest.mode === "timed-hold" ? "秒" : "次";
      result.textContent = best > 0 ? `当前合格最佳 ${best} ${unit}` : "继续建立记录";
      note.textContent = latest.assistance
        ? `本次使用“${latest.assistance}”，后续比较时请保持辅助方式一致。`
        : "建议保持相同动作标准，先稳定完成，再逐步增加次数或时间。";
    }
    container.append(label, result, note);
  }

  private createCapacityItem(record: CapacityRecord): HTMLLIElement {
    const item = document.createElement("li");
    const heading = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = exerciseName(record.exerciseId);
    const date = document.createElement("time");
    date.dateTime = record.recordedAt;
    date.textContent = formatDate(record.recordedAt);
    heading.append(name, date);
    const result = document.createElement("p");
    if (record.mode === "equipment") {
      const loadLabel = record.loadMode ? LOAD_MODE_LABELS[record.loadMode] : "重量";
      result.textContent = `${loadLabel} ${record.loadKg ?? "—"} kg · ${record.sets ?? "—"} 组 × ${record.reps ?? "—"} 次`;
    } else {
      const score = record.mode === "timed-hold" ? `${record.holdSeconds ?? "—"} 秒` : `${record.reps ?? "—"} 次`;
      result.textContent = `${record.sets ?? "—"} 组 · ${score}${record.assistance ? ` · ${record.assistance}` : ""}`;
    }
    const quality = document.createElement("span");
    quality.textContent = `质量 ${record.qualityPercent ?? "—"}%${record.rir === null ? "" : ` · RIR ${record.rir}`}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "record-delete-button";
    remove.textContent = "删除";
    remove.setAttribute("aria-label", `删除 ${name.textContent} 的这次能力记录`);
    remove.addEventListener("click", () => {
      if (!window.confirm(`删除 ${name.textContent} 的这次能力记录？`)) return;
      this.records = this.capacityStore.remove(record.id);
      this.renderCapacity();
      this.options.onCapacityChange();
    });
    item.append(heading, result, quality, remove);
    return item;
  }
}
