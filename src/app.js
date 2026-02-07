const TAG_URL = "data/tags.json";
const PRESET_URL = "data/presets.json";
const FJUD_URL = "https://judgment.judicial.gov.tw/FJUD/default.aspx";
const LOCKED_CORE_TAG_IDS = ["traffic_accident", "tort_compensation"];
const DEFAULT_EXCLUDE_TAG_IDS = ["exclude_worksite", "exclude_occupational"];
const SALARY_NARROW_TAG_IDS = ["salary_loss", "labor_loss"];
const RARE_DETAIL_TAG_IDS = ["labor_loss", "death_mixed", "contributory"];
const CUSTOM_COMMON_TAG_IDS = [
  "vehicle_damage",
  "injury_general",
  "medical_fee",
  "salary_loss",
  "nursing_fee"
];
const CUSTOM_SETTINGS_TAG_IDS = [
  "fracture",
  "labor_loss",
  "death_mixed",
  "contusion",
  "mental_damage",
  "transport_fee",
  "drunk_driving",
  "pedestrian",
  "contributory"
];

const state = {
  mode: "simple",
  searchMode: "quick",
  scope: "both",
  intensity: "balanced",
  queryFitness: "balanced",
  dateRange: "5y",
  useSalaryNarrow: false,
  hasGenerated: false,
  selected: new Map(),
  advanced: {
    court: "",
    caseNo: "",
    startDate: "",
    endDate: ""
  }
};

const intensityGroups = {
  loose: new Set(["core", "context", "damages"]),
  balanced: new Set(["core", "context", "detail", "damages"]),
  strict: new Set(["core", "context", "detail", "damages", "responsibility"])
};

const intensityLabels = {
  balanced: "平衡"
};

let tags = [];
let presets = [];

const elements = {
  modeToggle: document.getElementById("modeToggle"),
  searchModeToggle: document.getElementById("searchModeToggle"),
  quickSection: document.getElementById("quickSection"),
  customSection: document.getElementById("customSection"),
  scopeToggle: document.getElementById("scopeToggle"),
  dateToggle: document.getElementById("dateToggle"),
  presetGrid: document.getElementById("presetGrid"),
  customCommonTags: document.getElementById("customCommonTags"),
  customSettingsTags: document.getElementById("customSettingsTags"),
  selectedCount: document.getElementById("selectedCount"),
  selectedChips: document.getElementById("selectedChips"),
  fitnessBadge: document.getElementById("fitnessBadge"),
  fitnessHint: document.getElementById("fitnessHint"),
  clearSelectedBtn: document.getElementById("clearSelectedBtn"),
  customActionHint: document.getElementById("customActionHint"),
  coreLockedTags: document.getElementById("coreLockedTags"),
  generateBtn: document.getElementById("generateBtn"),
  outputBody: document.getElementById("outputBody"),
  outputCards: document.getElementById("outputCards"),
  salaryNarrowWrap: document.getElementById("salaryNarrowWrap"),
  salaryNarrowToggle: document.getElementById("salaryNarrowToggle"),
  shareBtn: document.getElementById("shareBtn"),
  openFjudBtn: document.getElementById("openFjudBtn"),
  warningBox: document.getElementById("warningBox"),
  warningText: document.getElementById("warningText"),
  plainTermsInput: document.getElementById("plainTermsInput"),
  plainMapBtn: document.getElementById("plainMapBtn"),
  plainMapHint: document.getElementById("plainMapHint"),
  excludePresetBtn: document.getElementById("excludePresetBtn"),
  excludeTags: document.getElementById("excludeTags"),
  courtInput: document.getElementById("courtInput"),
  caseNoInput: document.getElementById("caseNoInput"),
  startDateInput: document.getElementById("startDateInput"),
  endDateInput: document.getElementById("endDateInput")
};

const sanitize = (value) => {
  if (!value) return "";
  return value
    .replace(/[^\p{L}\p{N}\s+\-&()]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
};

const escapeHtml = (value) => {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const termsForTag = (tag) => {
  const terms = [tag.legalCore, ...(tag.legalSynonyms || [])]
    .map((term) => sanitize(term))
    .filter(Boolean);
  return terms;
};

const includeTermForTag = (tag) => {
  const terms = termsForTag(tag);
  if (!terms.length) return "";
  if (terms.length === 1) return terms[0];
  return `(${terms.join("+")})`;
};

const excludeTermForTag = (tag) => {
  const terms = termsForTag(tag);
  if (!terms.length) return "";
  return `-(${terms.join("+")})`;
};

const applyDateRange = (range) => {
  const today = new Date();
  if (range === "all") {
    state.advanced.startDate = "";
    state.advanced.endDate = "";
  } else {
    const years = range === "10y" ? 10 : 5;
    const start = new Date(today.getFullYear() - years, today.getMonth(), today.getDate());
    state.advanced.startDate = start.toISOString().slice(0, 10);
    state.advanced.endDate = today.toISOString().slice(0, 10);
  }
  elements.startDateInput.value = state.advanced.startDate;
  elements.endDateInput.value = state.advanced.endDate;
};

const updateToggle = (container, value) => {
  [...container.querySelectorAll("button")].forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.value === value);
  });
};

const isLockedCoreTag = (tagId) => LOCKED_CORE_TAG_IDS.includes(tagId);

const applyBaselineSelections = () => {
  LOCKED_CORE_TAG_IDS.forEach((tagId) => {
    state.selected.set(tagId, "include");
  });
  DEFAULT_EXCLUDE_TAG_IDS.forEach((tagId) => {
    if (!state.selected.has(tagId)) {
      state.selected.set(tagId, "exclude");
    }
  });
};

const updateSearchMode = () => {
  const isQuick = state.searchMode === "quick";
  if (elements.quickSection) elements.quickSection.hidden = !isQuick;
  if (elements.customSection) elements.customSection.hidden = isQuick;
  if (elements.generateBtn) elements.generateBtn.hidden = isQuick;
  if (elements.salaryNarrowWrap) elements.salaryNarrowWrap.hidden = !isQuick;
  if (elements.outputBody) elements.outputBody.hidden = true;
  state.hasGenerated = false;
  updateActionStates();
};

const cycleTagState = (tagId) => {
  const tag = tags.find((item) => item.id === tagId);
  if (!tag) return;
  if (tag.group === "exclude" || isLockedCoreTag(tagId)) return;
  const current = state.selected.get(tagId);
  if (!current) {
    state.selected.set(tagId, "include");
  } else if (current === "include") {
    state.selected.delete(tagId);
  } else {
    state.selected.delete(tagId);
  }
  renderTags();
  updateActionStates();
  maybeRenderOutputs();
  updateUrl();
};

const isModeScopeMatched = (tag) => {
  if (tag.mode === "hidden") return false;
  const modeOk = tag.mode === "both" || tag.mode === state.mode;
  const scopeOk =
    state.scope === "both" || tag.scope === "both" || tag.scope === state.scope;
  return modeOk && scopeOk;
};

const isCustomSelectableTag = (tag) => {
  if (tag.group === "exclude") return false;
  if (tag.group === "core") return false;
  if (isLockedCoreTag(tag.id)) return false;
  return true;
};

const getCustomTierTags = (tier, orderedIds) => {
  const mapById = new Map(
    tags
      .filter((tag) => isCustomSelectableTag(tag) && isModeScopeMatched(tag))
      .filter((tag) => (tag.customTier || "hidden") === tier)
      .map((tag) => [tag.id, tag])
  );

  if (orderedIds?.length) {
    return orderedIds.map((id) => mapById.get(id)).filter(Boolean);
  }

  return [...mapById.values()];
};

const renderCoreLockedTags = () => {
  if (!elements.coreLockedTags) return;
  const coreTags = LOCKED_CORE_TAG_IDS.map((tagId) => tags.find((item) => item.id === tagId))
    .filter(Boolean)
    .filter((tag) => {
      if (tag.mode === "hidden") return false;
      const modeOk = tag.mode === "both" || tag.mode === state.mode;
      const scopeOk =
        state.scope === "both" || tag.scope === "both" || tag.scope === state.scope;
      return modeOk && scopeOk;
    });

  elements.coreLockedTags.innerHTML = coreTags
    .map((tag) => {
      const label = state.mode === "simple" ? tag.labels.simple : tag.labels.pro;
      return `<span class="tag tag-locked" data-state="include">${escapeHtml(label)}</span>`;
    })
    .join("");
};

const renderExcludeTags = () => {
  const excludeList = tags.filter((tag) => {
    if (tag.group !== "exclude") return false;
    return isModeScopeMatched(tag);
  });

  elements.excludeTags.innerHTML = excludeList
    .map((tag) => {
      const stateLabel = state.selected.get(tag.id);
      const label = state.mode === "simple" ? tag.labels.simple : tag.labels.pro;
      return `<button class="tag" data-id="${tag.id}" data-state="${stateLabel || ""}" data-state-label="${stateLabel === "exclude" ? "排" : ""}">${escapeHtml(label)}</button>`;
    })
    .join("");

  elements.excludeTags.querySelectorAll(".tag").forEach((tagEl) => {
    tagEl.addEventListener("click", () => {
      const current = state.selected.get(tagEl.dataset.id);
      if (current === "exclude") {
        state.selected.delete(tagEl.dataset.id);
      } else {
        state.selected.set(tagEl.dataset.id, "exclude");
      }
      renderExcludeTags();
      updateActionStates();
      maybeRenderOutputs();
      updateUrl();
    });
  });
};

const renderTags = () => {
  renderCoreLockedTags();
  const toTagButtons = (items) =>
    items
      .map((tag) => {
        const stateLabel = state.selected.get(tag.id);
        const label = state.mode === "simple" ? tag.labels.simple : tag.labels.pro;
        return `<button class="tag" data-id="${tag.id}" data-state="${stateLabel || ""}" data-state-label="${stateLabel === "include" ? "含" : stateLabel === "exclude" ? "排" : ""}">${escapeHtml(label)}</button>`;
      })
      .join("");
  const renderTier = (container, tierTags, emptyText) => {
    if (!container) return;
    container.innerHTML = tierTags.length
      ? toTagButtons(tierTags)
      : `<p class="tier-empty">${escapeHtml(emptyText)}</p>`;
  };

  const commonTags = getCustomTierTags("common", CUSTOM_COMMON_TAG_IDS);
  const settingsTags = getCustomTierTags("settings", CUSTOM_SETTINGS_TAG_IDS);
  renderTier(elements.customCommonTags, commonTags, "目前沒有可用的常見關鍵字。");
  renderTier(elements.customSettingsTags, settingsTags, "目前沒有可用的進階設定。");

  [elements.customCommonTags, elements.customSettingsTags].forEach((container) => {
    if (!container) return;
    container.querySelectorAll(".tag").forEach((tagEl) => {
      tagEl.addEventListener("click", () => cycleTagState(tagEl.dataset.id));
    });
  });

  renderSelectedSummary();
  renderCustomActionBar();
  renderExcludeTags();
};

const getUserIncludedTags = () => {
  return tags.filter((tag) => {
    if (!isCustomSelectableTag(tag)) return false;
    if (!isModeScopeMatched(tag)) return false;
    return state.selected.get(tag.id) === "include";
  });
};

const computeQueryFitness = () => {
  const userIncluded = getUserIncludedTags();
  const selectedCount = userIncluded.length;
  const rareCount = userIncluded.filter((tag) => RARE_DETAIL_TAG_IDS.includes(tag.id)).length;

  if (selectedCount <= 1) return "broad";
  if (selectedCount >= 6 || rareCount >= 2) return "narrow";
  return "balanced";
};

const renderSelectedSummary = () => {
  if (!elements.selectedCount || !elements.selectedChips) return;
  const userIncluded = getUserIncludedTags();
  elements.selectedCount.textContent = `已選 ${userIncluded.length} 個條件`;

  const lockedTags = LOCKED_CORE_TAG_IDS.map((id) => tags.find((tag) => tag.id === id))
    .filter(Boolean)
    .filter((tag) => isModeScopeMatched(tag));
  const toLabel = (tag) => (state.mode === "simple" ? tag.labels.simple : tag.labels.pro);

  const lockedHtml = lockedTags
    .map(
      (tag) =>
        `<span class="selected-chip selected-chip-locked">${escapeHtml(toLabel(tag))}</span>`
    )
    .join("");

  const selectedHtml = userIncluded
    .map(
      (tag) =>
        `<span class="selected-chip">${escapeHtml(
          toLabel(tag)
        )}<button type="button" data-remove-id="${tag.id}" aria-label="移除此條件">×</button></span>`
    )
    .join("");

  elements.selectedChips.innerHTML = lockedHtml + (selectedHtml || "");

  elements.selectedChips.querySelectorAll("button[data-remove-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selected.delete(btn.dataset.removeId);
      renderTags();
      updateActionStates();
      maybeRenderOutputs();
      updateUrl();
    });
  });
};

const renderCustomActionBar = () => {
  if (!elements.fitnessBadge || !elements.fitnessHint) return;
  state.queryFitness = computeQueryFitness();
  const meta = {
    broad: {
      label: "偏寬",
      hint: "條件偏少，建議再加 1-2 個細項提高精準度。"
    },
    balanced: {
      label: "適中",
      hint: "條件適中，可直接產出。"
    },
    narrow: {
      label: "偏窄",
      hint: "條件較嚴格，若結果太少可先移除 1-2 個細項。"
    }
  }[state.queryFitness];

  elements.fitnessBadge.dataset.level = state.queryFitness;
  elements.fitnessBadge.textContent = meta.label;
  elements.fitnessHint.textContent = meta.hint;
};

const clearSelectedIncludes = () => {
  const preserved = new Map();
  state.selected.forEach((value, id) => {
    if (isLockedCoreTag(id)) {
      preserved.set(id, "include");
      return;
    }
    if (value === "exclude") preserved.set(id, "exclude");
  });
  state.selected = preserved;
};

const renderPresets = () => {
  elements.presetGrid.innerHTML = presets
    .map(
      (preset) => `<button class="preset" data-id="${preset.id}">${preset.label}</button>`
    )
    .join("");

  elements.presetGrid.querySelectorAll(".preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = presets.find((item) => item.id === btn.dataset.id);
      if (!preset) return;
      state.selected.clear();
      applyBaselineSelections();
      preset.tags.forEach((tagId) => state.selected.set(tagId, "include"));
      state.scope = preset.scope;
      updateToggle(elements.scopeToggle, state.scope);
      renderTags();
      updateActionStates();
      if (state.searchMode === "quick") {
        state.hasGenerated = true;
        elements.outputBody.hidden = false;
        renderOutputs();
        elements.outputBody.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        maybeRenderOutputs();
      }
      updateUrl();
    });
  });
};

const getScopedSelectedTags = (allowedGroups) => {
  const included = [];
  const excluded = [];

  tags.forEach((tag) => {
    const tagState = state.selected.get(tag.id);
    if (!tagState) return;
    const modeOk = tag.mode === "both" || tag.mode === state.mode;
    const scopeOk =
      state.scope === "both" || tag.scope === "both" || tag.scope === state.scope;
    if (!modeOk || !scopeOk) return;

    if (tagState === "include" && allowedGroups.has(tag.group)) {
      included.push(tag);
    }
    if (tagState === "exclude") {
      excluded.push(tag);
    }
  });

  return { included, excluded };
};

const normalizePlainTermToTagIds = (inputTerms) => {
  const matchedIds = new Set();
  const cleanTerms = inputTerms.map((term) => sanitize(term)).filter(Boolean);

  cleanTerms.forEach((term) => {
    tags.forEach((tag) => {
      const aliases = [
        ...(tag.plainAlias || []),
        tag.labels?.simple || "",
        tag.labels?.pro || ""
      ]
        .map((entry) => sanitize(entry))
        .filter(Boolean);
      const found = aliases.some(
        (alias) => alias === term || alias.includes(term) || term.includes(alias)
      );
      if (found) matchedIds.add(tag.id);
    });
  });

  return [...matchedIds];
};

const parsePlainTerms = (value) => {
  return value
    .split(/[\s,，、;；]+/g)
    .map((term) => term.trim())
    .filter(Boolean);
};

const getAllowedGroupsByIntensity = (intensity) => {
  if (intensity === "loose") return intensityGroups.loose;
  if (intensity === "strict") return intensityGroups.strict;
  return intensityGroups.balanced;
};

const getIntensityLabel = (level) => {
  if (level === "balanced") return intensityLabels.balanced;
  return "平衡";
};

const buildUnifiedQuery = (intensity) => {
  const allowedGroups = getAllowedGroupsByIntensity(intensity);
  const { included, excluded } = getScopedSelectedTags(allowedGroups);
  const sortByWeight = (items) => items.slice().sort((a, b) => (b.weight || 0) - (a.weight || 0));
  const lockedCoreTags = LOCKED_CORE_TAG_IDS.map((tagId) => tags.find((tag) => tag.id === tagId))
    .filter(Boolean)
    .filter((tag) => {
      const modeOk = tag.mode === "both" || tag.mode === state.mode;
      const scopeOk =
        state.scope === "both" || tag.scope === "both" || tag.scope === state.scope;
      return modeOk && scopeOk;
    });
  const selectedTags = included.filter((tag) => !isLockedCoreTag(tag.id));
  const shouldKeepSalaryTags =
    state.searchMode === "quick" &&
    selectedTags.some((tag) => SALARY_NARROW_TAG_IDS.includes(tag.id));
  const effectiveSelectedTags =
    state.searchMode === "custom"
      ? selectedTags
      : state.useSalaryNarrow || shouldKeepSalaryTags
        ? selectedTags
        : selectedTags.filter((tag) => !SALARY_NARROW_TAG_IDS.includes(tag.id));
  const byIntent = {
    context: sortByWeight(effectiveSelectedTags.filter((tag) => tag.intent === "context")),
    damages: sortByWeight(effectiveSelectedTags.filter((tag) => tag.intent === "damages")),
    injury: sortByWeight(effectiveSelectedTags.filter((tag) => tag.intent === "injury")),
    other: sortByWeight(
      effectiveSelectedTags.filter((tag) => !["context", "damages", "injury"].includes(tag.intent))
    )
  };

  let chosen = [...lockedCoreTags];
  if (intensity === "balanced") {
    chosen = [
      ...chosen,
      ...byIntent.damages.slice(0, 4),
      ...byIntent.injury.slice(0, 4),
      ...byIntent.context.slice(0, 2),
      ...byIntent.other.slice(0, 1)
    ];
  } else {
    chosen = [...chosen, ...byIntent.damages, ...byIntent.injury, ...byIntent.context, ...byIntent.other];
  }

  const uniqueById = [];
  const seenIds = new Set();
  chosen.forEach((tag) => {
    if (!seenIds.has(tag.id)) {
      seenIds.add(tag.id);
      uniqueById.push(tag);
    }
  });

  const includeTerms = uniqueById.map(includeTermForTag).filter(Boolean);
  const excludeTerms = excluded.map(excludeTermForTag).filter(Boolean);
  const tokens = [];

  const courtTerm = sanitize(state.advanced.court);
  const caseNoTerm = sanitize(state.advanced.caseNo);
  if (courtTerm) tokens.push(courtTerm);
  if (caseNoTerm) tokens.push(caseNoTerm);
  if (includeTerms.length) tokens.push(includeTerms.join("&"));
  if (excludeTerms.length) tokens.push(excludeTerms.join("&"));

  return sanitize(tokens.join("&"));
};

const renderQueryField = (value) => {
  const displayValue = value || "尚未產生檢索詞";
  const safeValue = escapeHtml(value || "");
  return `
    <div class="query-field">
      <label>推薦檢索字詞</label>
      <div class="query-text">${escapeHtml(displayValue)}</div>
      <button class="copy-btn copy-main-btn" data-copy-field="${safeValue}">一鍵複製檢索字詞</button>
    </div>
  `;
};

const getTagDisplayLabel = (tag) => {
  return state.mode === "simple" ? tag.labels.simple : tag.labels.pro;
};

const buildSelectionExplanation = () => {
  const locked = LOCKED_CORE_TAG_IDS.map((id) => tags.find((tag) => tag.id === id))
    .filter(Boolean)
    .filter((tag) => isModeScopeMatched(tag))
    .map((tag) => getTagDisplayLabel(tag));
  const included = getUserIncludedTags().map((tag) => getTagDisplayLabel(tag));
  const excluded = tags
    .filter((tag) => state.selected.get(tag.id) === "exclude")
    .filter((tag) => isModeScopeMatched(tag))
    .map((tag) => getTagDisplayLabel(tag));

  const includedText = included.length ? included.join("、") : "未額外選擇";
  const excludedText = excluded.length ? excluded.join("、") : "無";

  return `本次產出依據：固定核心（${locked.join("、")}）；你選擇（${includedText}）；排除（${excludedText}）。`;
};

const renderOutputs = () => {
  const level = "balanced";
  const query = buildUnifiedQuery(level);
  const narrowStatus =
    state.searchMode === "quick"
      ? state.useSalaryNarrow
        ? "開啟"
        : "關閉"
      : "自選模式不套用";

  elements.outputCards.innerHTML = `
    <div class="card result-card" data-intensity="${level}">
      <div class="result-header">
        <span class="result-title">推薦檢索字詞</span>
        <span class="result-label">${getIntensityLabel(level)}</span>
      </div>
      <div class="result-body">
        <div class="query-explain">${escapeHtml(buildSelectionExplanation())}</div>
        ${renderQueryField(query)}
        <div class="query-meta">範圍：${state.scope === "both" ? "刑事＋民事" : state.scope === "criminal" ? "刑事" : "民事"}｜期間：${state.dateRange === "5y" ? "近5年" : state.dateRange === "10y" ? "近10年" : "不限定"}｜窄搜：${narrowStatus}</div>
      </div>
    </div>
  `;

  elements.outputCards.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.copyField) {
        copyText(btn.dataset.copyField);
        const originalText = btn.dataset.originalText || btn.textContent;
        btn.dataset.originalText = originalText;
        btn.textContent = "已複製";
        btn.classList.add("is-copied");
        window.setTimeout(() => {
          btn.textContent = btn.dataset.originalText;
          btn.classList.remove("is-copied");
        }, 1400);
      }
    });
  });

  updateActionStates();
};

const hasIncludeSelection = () => {
  return [...state.selected.entries()].some(([tagId, value]) => {
    if (value !== "include" || isLockedCoreTag(tagId)) return false;
    const tag = tags.find((item) => item.id === tagId);
    if (!tag || tag.group === "exclude" || tag.mode === "hidden") return false;
    const modeOk = tag.mode === "both" || tag.mode === state.mode;
    const scopeOk =
      state.scope === "both" || tag.scope === "both" || tag.scope === state.scope;
    return modeOk && scopeOk;
  });
};

const updateActionStates = () => {
  const hasInclude = hasIncludeSelection();
  const hasExclude = [...state.selected.values()].some((value) => value === "exclude");
  const warningMessage = hasExclude
    ? "目前只有排除條件，請至少選擇一個求償主題或傷勢條件。"
    : "請至少選擇一個求償主題或傷勢條件。";
  if (!hasInclude) {
    elements.warningBox.hidden = false;
    elements.warningText.textContent = warningMessage;
  } else {
    elements.warningBox.hidden = true;
  }
  elements.openFjudBtn.disabled = !hasInclude;
  elements.generateBtn.disabled = !hasInclude || state.searchMode === "quick";
  if (elements.customActionHint) {
    elements.customActionHint.textContent = !hasInclude && state.searchMode === "custom"
      ? warningMessage
      : "";
  }
};

const maybeRenderOutputs = () => {
  if (!state.hasGenerated) return;
  renderOutputs();
};

const copyText = async (text) => {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
};

const updateUrl = () => {
  const params = new URLSearchParams();
  params.set("mode", state.mode);
  params.set("searchMode", state.searchMode);
  params.set("scope", state.scope);
  params.set("intensity", state.intensity);
  params.set("date", state.dateRange);
  params.set("salaryNarrow", state.useSalaryNarrow ? "1" : "0");
  if (state.advanced.court) params.set("court", state.advanced.court);
  if (state.advanced.caseNo) params.set("caseNo", state.advanced.caseNo);
  if (state.advanced.startDate) params.set("start", state.advanced.startDate);
  if (state.advanced.endDate) params.set("end", state.advanced.endDate);

  const includes = [];
  const excludes = [];
  state.selected.forEach((value, key) => {
    if (value === "include") includes.push(key);
    if (value === "exclude") excludes.push(key);
  });
  if (includes.length) params.set("sel", includes.join(","));
  if (excludes.length) params.set("exc", excludes.join(","));

  const newUrl = `${location.pathname}?${params.toString()}`;
  history.replaceState(null, "", newUrl);
};

const restoreFromUrl = () => {
  const params = new URLSearchParams(location.search);
  if (params.has("mode")) state.mode = params.get("mode") || state.mode;
  if (params.has("searchMode")) {
    state.searchMode = params.get("searchMode") || state.searchMode;
  }
  if (params.has("scope")) state.scope = params.get("scope") || state.scope;
  if (params.has("intensity")) state.intensity = params.get("intensity") || state.intensity;
  if (params.has("date")) state.dateRange = params.get("date") || state.dateRange;
  if (params.has("salaryNarrow")) {
    state.useSalaryNarrow = params.get("salaryNarrow") === "1";
  }

  state.advanced.court = params.get("court") || "";
  state.advanced.caseNo = params.get("caseNo") || "";
  state.advanced.startDate = params.get("start") || "";
  state.advanced.endDate = params.get("end") || "";

  const selected = params.get("sel");
  const excluded = params.get("exc");
  if (selected) {
    selected.split(",").forEach((id) => state.selected.set(id, "include"));
  }
  if (excluded) {
    excluded.split(",").forEach((id) => state.selected.set(id, "exclude"));
  }
};

const attachEvents = () => {
  elements.modeToggle.addEventListener("click", (event) => {
    if (event.target.tagName !== "BUTTON") return;
    state.mode = event.target.dataset.value;
    updateToggle(elements.modeToggle, state.mode);
    renderTags();
    maybeRenderOutputs();
    updateUrl();
  });

  elements.searchModeToggle.addEventListener("click", (event) => {
    if (event.target.tagName !== "BUTTON") return;
    state.searchMode = event.target.dataset.value;
    updateToggle(elements.searchModeToggle, state.searchMode);
    updateSearchMode();
    updateUrl();
  });

  elements.scopeToggle.addEventListener("click", (event) => {
    if (event.target.tagName !== "BUTTON") return;
    state.scope = event.target.dataset.value;
    updateToggle(elements.scopeToggle, state.scope);
    renderTags();
    maybeRenderOutputs();
    updateUrl();
  });

  elements.dateToggle.addEventListener("click", (event) => {
    if (event.target.tagName !== "BUTTON") return;
    state.dateRange = event.target.dataset.value;
    updateToggle(elements.dateToggle, state.dateRange);
    applyDateRange(state.dateRange);
    maybeRenderOutputs();
    updateUrl();
  });

  elements.generateBtn.addEventListener("click", () => {
    state.hasGenerated = true;
    elements.outputBody.hidden = false;
    renderOutputs();
    elements.outputBody.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  elements.clearSelectedBtn.addEventListener("click", () => {
    clearSelectedIncludes();
    renderTags();
    updateActionStates();
    maybeRenderOutputs();
    updateUrl();
  });

  elements.salaryNarrowToggle.addEventListener("change", (event) => {
    state.useSalaryNarrow = event.target.checked;
    maybeRenderOutputs();
    updateUrl();
  });

  elements.shareBtn.addEventListener("click", () => {
    copyText(location.href);
  });

  elements.openFjudBtn.addEventListener("click", () => {
    window.open(FJUD_URL, "_blank");
  });

  elements.plainMapBtn.addEventListener("click", () => {
    const terms = parsePlainTerms(elements.plainTermsInput.value);
    if (!terms.length) {
      elements.plainMapHint.textContent = "請先輸入至少一個白話關鍵字。";
      return;
    }

    const mappedTagIds = normalizePlainTermToTagIds(terms);
    mappedTagIds.forEach((tagId) => {
      const tag = tags.find((entry) => entry.id === tagId);
      if (!tag) return;
      if (tag.group === "exclude") return;
      state.selected.set(tagId, "include");
    });

    const mappedAlias = new Set();
    mappedTagIds.forEach((tagId) => {
      const tag = tags.find((entry) => entry.id === tagId);
      if (!tag) return;
      (tag.plainAlias || []).forEach((alias) => mappedAlias.add(alias));
    });

    const unmatched = terms.filter((term) => {
      return ![...mappedAlias].some(
        (alias) => alias.includes(term) || term.includes(alias)
      );
    });

    elements.plainMapHint.textContent = unmatched.length
      ? `已套用 ${mappedTagIds.length} 個標籤，未匹配：${unmatched.join("、")}`
      : `已套用 ${mappedTagIds.length} 個標籤。`;

    renderTags();
    updateActionStates();
    maybeRenderOutputs();
    updateUrl();
  });

  elements.excludePresetBtn.addEventListener("click", () => {
    const excludeIds = DEFAULT_EXCLUDE_TAG_IDS;
    const allExcluded = excludeIds.every((id) => state.selected.get(id) === "exclude");
    excludeIds.forEach((id) => {
      if (allExcluded) {
        state.selected.delete(id);
      } else {
        state.selected.set(id, "exclude");
      }
    });
    renderTags();
    updateActionStates();
    maybeRenderOutputs();
    updateUrl();
  });

  elements.courtInput.addEventListener("input", (event) => {
    state.advanced.court = event.target.value;
    updateUrl();
  });
  elements.caseNoInput.addEventListener("input", (event) => {
    state.advanced.caseNo = event.target.value;
    updateUrl();
  });
  elements.startDateInput.addEventListener("change", (event) => {
    state.advanced.startDate = event.target.value;
    updateUrl();
  });
  elements.endDateInput.addEventListener("change", (event) => {
    state.advanced.endDate = event.target.value;
    updateUrl();
  });
};

const init = async () => {
  const [tagRes, presetRes] = await Promise.all([fetch(TAG_URL), fetch(PRESET_URL)]);
  tags = await tagRes.json();
  presets = await presetRes.json();

  restoreFromUrl();
  applyBaselineSelections();

  updateToggle(elements.modeToggle, state.mode);
  updateToggle(elements.searchModeToggle, state.searchMode);
  updateToggle(elements.scopeToggle, state.scope);
  updateToggle(elements.dateToggle, state.dateRange);
  elements.salaryNarrowToggle.checked = state.useSalaryNarrow;

  elements.courtInput.value = state.advanced.court;
  elements.caseNoInput.value = state.advanced.caseNo;

  if (state.advanced.startDate || state.advanced.endDate) {
    elements.startDateInput.value = state.advanced.startDate;
    elements.endDateInput.value = state.advanced.endDate;
  } else {
    applyDateRange(state.dateRange);
  }

  renderPresets();
  renderTags();
  updateSearchMode();
  state.hasGenerated = false;
  elements.outputBody.hidden = true;
  updateActionStates();
  attachEvents();
  updateUrl();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
