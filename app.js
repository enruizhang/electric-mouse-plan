(function () {
  "use strict";

  const KEYS = {
    state: "electric_mouse_plan_v1_state",
    history: "electric_mouse_plan_v1_history",
    settings: "electric_mouse_plan_v1_settings",
    speech: "electric_mouse_plan_v1_speech",
    background: "electric_mouse_plan_v1_background",
    mouseImage: "electric_mouse_plan_v1_mouse_image"
  };

  const PERIODS = [
    ["daily", "每日"],
    ["weekly", "每周"],
    ["monthly", "每月"],
    ["quarterly", "每季度"],
    ["halfyear", "每半年"],
    ["yearly", "每年"],
    ["anniversary", "周年 / 年度类周期"]
  ];

  const DEFAULT_SPEECH = {
    click: ["吱——我在这里。", "你点到一只带电的小鼠了。", "今天也慢慢来。", "我会帮你记住的。"],
    add: ["好，这件事先放进来。", "新的小石头出现了。", "先记下，不一定马上做。", "我帮你收好了。"],
    complete: ["完成一次，已经很不错了。", "吱！这次也记下来了。", "你刚刚真的做到了。", "小小的一次也算数。"],
    stats: ["来看看你已经做过什么。", "这些不是空白，它们都发生过。", "记录会慢慢变多。", "你做过的事都在这里。"],
    encourage: ["不用一次做完。", "可以只做一点点。", "今天做不到也没关系，先放着。", "重要的是还能回来。"],
    random: ["电流很小，陪伴刚好。", "吱吱。", "我在角落里发光。", "让我看看今天有什么。"]
  };

  const SPEECH_LABELS = {
    click: "点击电鼠",
    add: "添加任务",
    complete: "完成任务",
    stats: "进入统计",
    encourage: "鼓励",
    random: "随机闲聊"
  };

  const app = document.getElementById("app");
  const toastEl = document.getElementById("toast");
  const bgLayer = document.getElementById("backgroundLayer");
  let route = { view: "home" };
  let toastTimer = 0;
  let drag = null;
  let suppressClickUntil = 0;
  let lastCompleteToggle = { key: "", time: 0 };
  let lastMouseId = "";

  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const nowIso = () => new Date().toISOString();
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const normalize = (value) => String(value || "").trim().normalize("NFKC").toLowerCase();
  const cssEscape = (value) => (window.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/"/g, '\\"'));
  const formatTime = (iso) => new Date(iso).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const todayRealKey = () => dateKey(new Date());

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function dateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function actionDayKey(date = new Date()) {
    const shifted = new Date(date);
    if (shifted.getHours() < 12) shifted.setDate(shifted.getDate() - 1);
    return dateKey(shifted);
  }

  function nextNoonDelay() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(12, 0, 2, 0);
    if (now >= next) next.setDate(next.getDate() + 1);
    return Math.max(1000, next - now);
  }

  function defaultModule(id, name, locked, color, textColor) {
    return { id, name, locked, color, textColor, alpha: .92, tasks: [], maybe: [], compare: true, position: null };
  }

  function defaultState() {
    return {
      version: 3,
      mode: "plan",
      activeDay: actionDayKey(),
      dailyArchives: {},
      futureTasks: [],
      mousePos: { x: 18, y: 160 },
      mice: [],
      collapsedPeriods: {},
      calendar: {},
      modules: [
        defaultModule("today", "只有今日做的事", true, "#ffffff", "#2e2a24"),
        defaultModule("period", "周期计划", true, "#ffffff", "#2e2a24"),
        defaultModule("important", "重要的事", true, "#ffffff", "#2e2a24")
      ]
    };
  }

  function defaultSettings() {
    return {
      title: "电鼠行动记录",
      subtitle: "计划、周期、重要事项，还有那些已经真的发生过的小小记录。",
      quote: "可以慢一点，但别把自己做过的事弄丢。",
      quoteAuthor: "电鼠",
      mouseName: "电鼠",
      overlay: 35,
      blur: 0,
      bgFit: "cover",
      bgX: 50,
      bgY: 50,
      bgScale: 100,
      moduleAlpha: 92,
      taskAlpha: 92,
      defaultModuleColor: "#ffffff",
      defaultModuleText: "#2e2a24",
      defaultTaskColor: "#ffffff",
      defaultTaskText: "#2e2a24"
    };
  }

  function defaultMousePosition(index = 0) {
    if (typeof window === "undefined") return { x: 18 + index * 72, y: 160 + index * 48 };
    const compact = window.innerWidth <= 720;
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const spots = compact
      ? [
        { x: w - 86, y: h - 132 },
        { x: 12, y: h - 132 },
        { x: w - 86, y: Math.max(80, h - 260) },
        { x: 12, y: Math.max(80, h - 260) }
      ]
      : [
        { x: 18, y: 160 },
        { x: 126, y: 160 },
        { x: 18, y: 292 },
        { x: 126, y: 292 }
      ];
    return spots[index % spots.length];
  }

  function normalizeSpeechSet(value = {}) {
    const merged = Object.assign(clone(DEFAULT_SPEECH), value || {});
    Object.keys(DEFAULT_SPEECH).forEach((kind) => {
      merged[kind] = Array.isArray(merged[kind]) ? merged[kind].filter(Boolean) : clone(DEFAULT_SPEECH[kind]);
    });
    return merged;
  }

  function defaultMouse(index = 0, overrides = {}) {
    return {
      id: overrides.id || uid(),
      name: overrides.name || `电鼠 ${index + 1}`,
      image: overrides.image || "",
      position: overrides.position || defaultMousePosition(index),
      speech: normalizeSpeechSet(overrides.speech),
      speechBubbleSide: overrides.speechBubbleSide === "left" ? "left" : "right",
      visible: overrides.visible !== false,
      createdAt: overrides.createdAt || nowIso()
    };
  }

  let state = loadJson(KEYS.state, null) || defaultState();
  let history = loadJson(KEYS.history, []);
  let settings = Object.assign(defaultSettings(), loadJson(KEYS.settings, {}));
  let speech = Object.assign(clone(DEFAULT_SPEECH), loadJson(KEYS.speech, {}));
  let background = loadJson(KEYS.background, null);
  let customMouseImage = loadJson(KEYS.mouseImage, null);

  migrate();
  rolloverDailyIfNeeded();
  activateFutureTasks();
  persist();

  function migrate() {
    const fresh = defaultState();
    state.version = 3;
    state.modules = Array.isArray(state.modules) ? state.modules : fresh.modules;
    state.dailyArchives = state.dailyArchives || {};
    state.futureTasks = Array.isArray(state.futureTasks) ? state.futureTasks : [];
    state.collapsedPeriods = state.collapsedPeriods || {};
    state.calendar = state.calendar || {};
    state.mousePos = state.mousePos || { x: 18, y: 160 };
    state.mice = Array.isArray(state.mice) ? state.mice : [];
    if (!state.mice.length) {
      state.mice = [defaultMouse(0, {
        id: "mouse-1",
        name: settings.mouseName || "电鼠 1",
        image: customMouseImage?.dataUrl || "",
        position: state.mousePos,
        speech
      })];
    }
    state.mice = state.mice.map((mouse, index) => defaultMouse(index, {
      id: mouse.id,
      name: String(mouse.name || "").trim() || `电鼠 ${index + 1}`,
      image: typeof mouse.image === "string" ? mouse.image : (mouse.image?.dataUrl || mouse.dataUrl || ""),
      position: mouse.position || (index === 0 ? state.mousePos : defaultMousePosition(index)),
      speech: mouse.speech || (index === 0 ? speech : DEFAULT_SPEECH),
      speechBubbleSide: mouse.speechBubbleSide === "left" ? "left" : "right",
      visible: mouse.visible,
      createdAt: mouse.createdAt
    }));
    state.mousePos = state.mice[0]?.position || state.mousePos;
    state.activeDay = state.activeDay || actionDayKey();

    if (!getModule("today")) state.modules.unshift(defaultModule("today", "只有今日做的事", true, "#ffffff", "#2e2a24"));
    if (!getModule("period")) state.modules.splice(1, 0, defaultModule("period", "周期计划", true, "#ffffff", "#2e2a24"));
    if (!getModule("important")) state.modules.splice(2, 0, defaultModule("important", "重要的事", true, "#ffffff", "#2e2a24"));

    state.modules.forEach((module, moduleIndex) => {
      module.name = displayModuleName(module.name || module.id);
      migrateDefaultModuleColor(module);
      module.tasks = Array.isArray(module.tasks) ? module.tasks : [];
      module.maybe = Array.isArray(module.maybe) ? module.maybe : [];
      module.compare = module.compare !== false;
      module.alpha = module.alpha ?? .92;
      module.position = module.position || defaultModulePosition(moduleIndex);
      module.tasks = module.tasks.flatMap((task, taskIndex) => migrateTask(task, module, taskIndex));
      module.maybe.forEach((item, itemIndex) => migrateMaybe(item, itemIndex));
    });

    Object.values(state.dailyArchives).forEach((archive) => {
      archive.tasks = Array.isArray(archive.tasks) ? archive.tasks : [];
      archive.tasks = archive.tasks.flatMap((task, index) => migrateTask(task, getModule("today"), index));
    });

    state.futureTasks.forEach((task, index) => migrateTask(task, getModule("today"), index));

    history = Array.isArray(history) ? history : [];
    history.forEach((item) => {
      if (item.type === "check" || item.type === "note") item.type = "once";
      if (item.type === "target" || item.type === "counter") item.type = "count";
      item.eventType = item.eventType || (item.type === "count" ? "count_increment" : "task_completed");
      item.context = item.context || inferContext(item);
      item.moduleName = displayModuleName(item.moduleName || getModule(item.moduleId)?.name || "");
      item.note = item.note || "";
      item.taskTime = item.taskTime || "";
      item.historyDate = item.historyDate || item.time?.slice(0, 10) || "";
    });

    settings.mouseName = state.mice[0]?.name || settings.mouseName || "电鼠";
  }

  function migrateDefaultModuleColor(module) {
    const oldDefaultColors = {
      today: "#fff3bd",
      period: "#dff4ec",
      important: "#f7dfdf"
    };
    if (!module.color || module.color.toLowerCase() === oldDefaultColors[module.id]) {
      module.color = "#ffffff";
    }
    if (!module.textColor) module.textColor = "#2e2a24";
  }

  function migrateTask(task, module, index) {
    task.id = task.id || uid();
    task.title = task.title || "新的事项";
    task.keyword = task.keyword || "";
    task.note = task.note || task.remark || "";
    task.time = task.time || "";
    task.count = Number(task.count || 0);
    task.color = task.color || settings.defaultTaskColor || "#ffffff";
    task.textColor = task.textColor || settings.defaultTaskText || "#2e2a24";
    task.alpha = task.alpha ?? .92;
    task.position = task.position || defaultTaskPosition(index);
    task.done = !!task.done;
    if (task.type === "check" || task.type === "note") task.type = "once";
    if (task.type === "target" || task.type === "counter") task.type = "count";
    if (task.type === "parent") {
      const children = (task.children || []).map((child, childIndex) => {
        child.parentMigratedFrom = task.id;
        return migrateTask(child, module, index + childIndex + 1)[0];
      });
      task.children = undefined;
      task.type = "once";
      delete task.target;
      return [task].concat(children);
    }
    if (module?.id === "period") {
      task.isCount = task.isCount || task.type === "count";
      task.type = "periodic";
      if (!PERIODS.some(([key]) => key === task.period)) task.period = "daily";
    } else if (task.type === "periodic" && module?.id === "today") {
      task.type = "once";
      task.period = "";
    } else if (!["once", "count", "periodic", "non_today"].includes(task.type)) {
      task.type = "once";
    }
    task.dueDate = task.dueDate || task.date || "";
    task.dueKind = task.dueKind || "once";
    task.datePoint = task.datePoint || "";
    task.deadline = task.deadline || "";
    delete task.target;
    return [task];
  }

  function migrateMaybe(item, index) {
    item.id = item.id || uid();
    item.title = item.title || "备用事项";
    item.note = item.note || "";
    item.color = item.color || settings.defaultTaskColor || "#ffffff";
    item.textColor = item.textColor || settings.defaultTaskText || "#2e2a24";
    item.alpha = item.alpha ?? .92;
    item.position = item.position || defaultTaskPosition(index);
  }

  function displayModuleName(name) {
    if (name === "今日计划" || name === "浠婃棩璁″垝") return "只有今日做的事";
    if (name === "也许该做的重要的事" || name === "涔熻璇ュ仛鐨勯噸瑕佺殑浜?") return "重要的事";
    return name;
  }

  function persist() {
    const primaryMouse = state.mice?.[0];
    if (primaryMouse) {
      settings.mouseName = primaryMouse.name || "电鼠 1";
      speech = normalizeSpeechSet(primaryMouse.speech);
      customMouseImage = primaryMouse.image ? { dataUrl: primaryMouse.image } : null;
      state.mousePos = primaryMouse.position || state.mousePos;
    }
    saveJson(KEYS.state, state);
    saveJson(KEYS.history, history);
    saveJson(KEYS.settings, settings);
    saveJson(KEYS.speech, speech);
    saveJson(KEYS.background, background);
    saveJson(KEYS.mouseImage, customMouseImage);
  }

  function getModule(id) {
    return state.modules.find((module) => module.id === id);
  }

  function findTask(module, taskId) {
    return module?.tasks.find((task) => task.id === taskId);
  }

  function findMaybe(module, itemId) {
    return module?.maybe.find((item) => item.id === itemId);
  }

  function findArchiveTask(date, taskId) {
    return state.dailyArchives[date]?.tasks.find((task) => task.id === taskId);
  }

  function getPeriodSnapshot(date) {
    const period = getModule("period");
    if (!period) return [];
    return clone(period.tasks).map((task, index) => {
      task.position = task.position || defaultTaskPosition(index);
      return task;
    });
  }

  function getTaskSource(moduleId, taskId, sourceDate = "") {
    const module = getModule(moduleId);
    if (!module) return {};
    if (sourceDate && moduleId === "today") {
      return {
        module,
        task: findArchiveTask(sourceDate, taskId) || state.futureTasks.find((task) => task.id === taskId && task.dueDate === sourceDate),
        sourceDate
      };
    }
    if (sourceDate && moduleId === "period") return { module, task: findTask(module, taskId), sourceDate };
    if (sourceDate) return { module, task: findTask(module, taskId), sourceDate };
    return { module, task: findTask(module, taskId), sourceDate: "" };
  }

  function makeTask(data = {}, moduleId = "") {
    let type = data.type || "once";
    if (moduleId === "period") type = "periodic";
    if (type === "note") type = "once";
    return {
      id: uid(),
      title: data.title || "新的事项",
      note: data.note || "",
      type,
      isCount: moduleId === "period" ? !!data.isCount : type === "count",
      count: 0,
      period: moduleId === "period" ? (data.period || "daily") : "",
      datePoint: data.datePoint || "",
      deadline: data.deadline || "",
      dueDate: data.dueDate || "",
      displayDate: data.displayDate || "",
      time: data.time || "",
      color: data.color || settings.defaultTaskColor,
      textColor: data.textColor || settings.defaultTaskText,
      alpha: Number(data.alpha || 92) / 100,
      done: false,
      position: null
    };
  }

  function inferContext(item) {
    if (item.fromArchiveDate && item.moduleId === "period") return "往日周期任务补打卡";
    if (item.fromArchiveDate) return "往日任务补打卡";
    if (item.eventType === "count_increment") return "点击计数增加";
    if (item.moduleId === "today") return "今日完成";
    if (item.moduleId === "period" || item.type === "periodic") return "周期任务完成";
    if (item.moduleId === "important") return "重要事项完成";
    return "普通完成";
  }

  function addHistory(module, task, amount = 1, note = "", extra = {}) {
    const eventType = extra.eventType || (task.type === "count" || task.isCount ? "count_increment" : "task_completed");
    const entry = {
      id: uid(),
      completionId: eventType === "task_completed" ? uid() : "",
      time: nowIso(),
      createdAt: nowIso(),
      historyDate: todayRealKey(),
      moduleId: module.id,
      moduleName: module.name,
      taskId: task.id,
      taskTitle: task.title,
      type: task.type,
      eventType,
      amount,
      note,
      taskNote: task.note || "",
      taskTime: task.time || "",
      fromChild: false,
      parentId: null,
      context: extra.context || inferContext({ moduleId: module.id, type: task.type, eventType, fromArchiveDate: extra.fromArchiveDate }),
      fromArchiveDate: extra.fromArchiveDate || "",
      sourceDate: extra.fromArchiveDate || "",
      action: eventType,
      correction: !!extra.correction
    };
    history.push(entry);
    return entry;
  }

  function activeHistory(items = history) {
    return items.filter((item) => !item.correction && !item.reverted && !item.undone);
  }

  function rolloverDailyIfNeeded() {
    const nextDay = actionDayKey();
    if (!state.activeDay) state.activeDay = nextDay;
    if (state.activeDay === nextDay) return;
    const today = getModule("today");
    if (today && today.tasks.length) {
      const existing = state.dailyArchives[state.activeDay]?.tasks || [];
      state.dailyArchives[state.activeDay] = {
        date: state.activeDay,
        archivedAt: nowIso(),
        tasks: existing.concat(clone(today.tasks))
      };
      today.tasks = [];
    }
    state.activeDay = nextDay;
  }

  function activateFutureTasks() {
    const today = getModule("today");
    if (!today) return;
    const active = todayRealKey();
    const ready = state.futureTasks.filter((task) => task.dueDate && task.dueDate <= active);
    state.futureTasks = state.futureTasks.filter((task) => !(task.dueDate && task.dueDate <= active));
    ready.forEach((task) => {
      task.type = "once";
      task.done = false;
      task.position = defaultTaskPosition(today.tasks.length);
      today.tasks.push(task);
    });
  }

  function sortByTime(tasks) {
    return [...tasks].sort((a, b) => {
      if (a.time && b.time) return a.time.localeCompare(b.time);
      if (a.time) return -1;
      if (b.time) return 1;
      return 0;
    });
  }

  function visiblePeriodTasks(tasks, date = todayRealKey()) {
    return tasks.filter((task) => !task.datePoint || task.datePoint <= date);
  }

  function isTaskDueToday(task, moduleId, date = todayRealKey()) {
    if (!task) return false;
    if (moduleId === "today") return task.type !== "non_today";
    if (moduleId === "important") return task.displayDate === date;
    if (moduleId === "period") {
      if (task.datePoint) return task.datePoint === date;
      if (task.deadline) return task.deadline <= date;
      return task.period === "daily";
    }
    return false;
  }

  function getTodayTasksFromModule(moduleId, date = todayRealKey()) {
    const module = getModule(moduleId);
    if (!module) return [];
    const tasks = moduleId === "today" ? module.tasks : module.tasks.filter((task) => isTaskDueToday(task, moduleId, date));
    return sortByTime(tasks).map((task) => ({ module, task, sourceDate: "", sourceName: module.name }));
  }

  function getTodayOverviewTasks(date = todayRealKey()) {
    return ["today", "period", "important"].flatMap((id) => getTodayTasksFromModule(id, date));
  }

  function applyBackground() {
    document.documentElement.style.setProperty("--module-alpha", String(settings.moduleAlpha / 100));
    document.documentElement.style.setProperty("--task-alpha", String(settings.taskAlpha / 100));
    bgLayer.style.backgroundImage = background?.dataUrl
      ? `url(${background.dataUrl})`
      : "radial-gradient(circle at 18% 16%, rgba(247,210,92,.34), transparent 28%), linear-gradient(135deg, #fff8e9 0%, #eff7ed 54%, #f9efe4 100%)";
    bgLayer.style.backgroundRepeat = settings.bgFit === "repeat" ? "repeat" : "no-repeat";
    bgLayer.style.backgroundPosition = settings.bgFit === "center" ? "center" : `${settings.bgX}% ${settings.bgY}%`;
    bgLayer.style.backgroundSize = settings.bgScale !== 100 ? `${settings.bgScale}%` : settings.bgFit;
    let style = document.getElementById("dynamicBackgroundStyle");
    if (!style) {
      style = document.createElement("style");
      style.id = "dynamicBackgroundStyle";
      document.head.appendChild(style);
    }
    style.textContent = `#backgroundLayer::after{background:rgba(255,250,240,${settings.overlay / 100});backdrop-filter:blur(${settings.blur}px);}`;
  }

  function mouseImageSrc(mouse) {
    return mouse?.image || "electric-mouse.png";
  }

  function effectiveBubbleSide(mouse, pos) {
    const preferred = mouse?.speechBubbleSide === "left" ? "left" : "right";
    if (typeof window === "undefined") return preferred;
    const bubbleWidth = window.innerWidth <= 720 ? 190 : 220;
    const mouseWidth = window.innerWidth <= 720 ? 76 : 92;
    const gap = window.innerWidth <= 720 ? 52 : 70;
    if (preferred === "right" && pos.x + gap + bubbleWidth > window.innerWidth - 8) return "left";
    if (preferred === "left" && pos.x + mouseWidth - gap - bubbleWidth < 8) return "right";
    return preferred;
  }

  function applyBubbleSide(target, mouse, pos) {
    const bubble = target?.querySelector?.(".mouse-bubble");
    if (!bubble || !mouse) return;
    const side = effectiveBubbleSide(mouse, pos);
    bubble.classList.toggle("side-left", side === "left");
    bubble.classList.toggle("side-right", side === "right");
  }

  function renderMice() {
    return (state.mice || []).filter((mouse) => mouse.visible !== false).map((mouse, index) => {
      const pos = clampViewportPosition(mouse.position || defaultMousePosition(index), 92, 92);
      mouse.position = pos;
      const text = (mouse.speech?.random || DEFAULT_SPEECH.random)[0] || "吱。";
      const side = effectiveBubbleSide(mouse, pos);
      return `
        <div class="mouse-float" style="left:${pos.x}px;top:${pos.y}px;z-index:${30 + index}" data-mouse-wrap data-mouse-id="${esc(mouse.id)}">
          <div class="mouse-bubble side-${side}" data-mouse-bubble="${esc(mouse.id)}">${esc(text)}</div>
          <button class="electric-mouse" title="点击${esc(mouse.name)}" data-action="mouse" data-id="${esc(mouse.id)}" data-drag="mouse">
            <img src="${esc(mouseImageSrc(mouse))}" alt="${esc(mouse.name)}">
          </button>
        </div>`;
    }).join("");
  }

  function renderShell(inner, options = {}) {
    const showIntro = !!options.showIntro;
    app.innerHTML = `
      <header class="topbar">
        ${showIntro ? `<div class="title-wrap">
          <h1>${esc(settings.title)}</h1>
          <p class="subtitle">${esc(settings.subtitle)}</p>
          <p class="quote">“${esc(settings.quote)}” — ${esc(settings.quoteAuthor)}</p>
          <p class="current-date">当前日期：${esc(state.activeDay)}（每天 12:00 切换）</p>
        </div>` : `<div></div>`}
        <nav class="toolbar">
          <button class="ghost" data-action="home">首页</button>
          <button class="ghost" data-action="compare">对比</button>
          <button class="ghost" data-action="settings">设置</button>
        </nav>
      </header>
      ${inner}
      ${renderMice()}
    `;
  }

  function render() {
    rolloverDailyIfNeeded();
    activateFutureTasks();
    applyBackground();
    if (route.view === "module") return renderModule(route.id);
    if (route.view === "stats") return renderStats(route.id);
    if (route.view === "maybe") return renderMaybe(route.id);
    if (route.view === "day") return renderDay(route.id || "today", route.date || todayRealKey());
    if (route.view === "compare") return renderCompare();
    if (route.view === "settings") return renderSettings();
    return renderHome();
  }

  function renderHome() {
    renderShell(`
      <section class="panel home-controls">
        <div class="row" style="justify-content:space-between">
          <strong>模块便签</strong>
          <button class="primary" data-action="add-module">新增模块</button>
        </div>
      </section>
      <main class="note-board module-board" data-board="modules">
        ${state.modules.map((module, index) => moduleCard(module, index)).join("")}
      </main>
    `, { showIntro: true });
  }

  function moduleCard(module, index) {
    const done = activeHistory().filter((item) => item.moduleId === module.id).reduce((sum, item) => sum + Number(item.amount || 1), 0);
    const pos = clampSavedNotePosition(module.position || defaultModulePosition(index), "module");
    module.position = pos;
    return `
      <article class="module-card sticky-note" style="left:${pos.x}px;top:${pos.y}px;--note-color:${module.color};color:${module.textColor};opacity:${module.alpha ?? .92};--rot:${((index % 5) - 2) * 1.2}deg" data-action="open-module" data-id="${module.id}">
        <button class="drag-handle" data-drag="module" data-id="${module.id}" title="拖动">拖</button>
        <div>
          <h2>${esc(module.name)}</h2>
          <p class="module-meta">${module.tasks.length} 个事项 · 已完成 ${done} 次</p>
        </div>
        <div class="card-actions">
          <button class="small" data-action="edit-module" data-id="${module.id}">编辑</button>
          ${module.locked ? "" : `<button class="small danger" data-action="delete-module" data-id="${module.id}">删除</button>`}
        </div>
      </article>`;
  }

  function renderModule(moduleId) {
    const module = getModule(moduleId);
    if (!module) return goHome();
    const isToday = module.id === "today";
    const isPeriod = module.id === "period";
    const hasCalendar = isToday || isPeriod || module.id === "important";
    const content = `
      <section class="panel">
        <div class="row" style="justify-content:space-between">
          <div>
            <h2>${esc(module.name)}</h2>
            <p class="hint">${isToday ? "今日任务每天 12:00 归档清空；非今日事项会在到期后自动出现。" : isPeriod ? "这里的每一张便签默认都是周期任务。" : "添加、完成、计数或整理这个模块里的行动。"}</p>
          </div>
          <div class="row">
            ${isToday ? `<button data-action="today-overview-toggle">今日总览</button>` : ""}
            ${(isToday || isPeriod) ? `<button data-action="maybe" data-id="${module.id}">也许自己可以做的事</button>` : ""}
            ${hasCalendar ? `<button data-action="day" data-module="${module.id}" data-date="${todayRealKey()}">日期记录</button>` : ""}
            <button data-action="stats" data-id="${module.id}">看已做统计</button>
          </div>
        </div>
      </section>
      <details class="panel collapsible-form">
        <summary>新增便签</summary>
        ${taskForm(module.id)}
      </details>
      ${isPeriod ? renderTaskBoard(module, sortByTime(visiblePeriodTasks(module.tasks))) : renderTaskBoard(module, sortByTime(module.tasks))}
      ${hasCalendar ? renderCalendar(module.id) : ""}
    `;
    const page = isToday && route.todayPanel
      ? `<div class="today-overview-layout"><div class="today-main">${content}</div>${renderTodayExtension(route.todayPanelTab || "period")}</div>`
      : content;
    renderShell(page);
  }

  function renderTodayExtension(tab = "period") {
    const moduleId = tab === "important" ? "important" : "period";
    const rows = getTodayTasksFromModule(moduleId);
    const title = moduleId === "period" ? "周期计划" : "重要的事";
    return `
      <aside class="today-extension panel">
        <div class="row" style="justify-content:space-between">
          <div>
            <h2>今日总览</h2>
            <p class="hint">在当前页查看，不跳转。</p>
          </div>
          <button class="small" data-action="today-overview-close">收起</button>
        </div>
        <div class="row overview-tabs">
          <button class="${moduleId === "period" ? "primary" : "ghost"}" data-action="today-overview-tab" data-tab="period">周期计划</button>
          <button class="${moduleId === "important" ? "primary" : "ghost"}" data-action="today-overview-tab" data-tab="important">重要的事</button>
        </div>
        <h3>${esc(title)} · 今天</h3>
        <section class="overview-notes side-overview-notes">
          ${rows.length ? rows.map((row, index) => overviewTaskCard(row, index)).join("") : `<p class="empty">今天这里暂时没有要做的事。</p>`}
        </section>
      </aside>`;
  }

  function taskForm(moduleId) {
    if (moduleId === "period") {
      return `
        <form class="form-grid" data-form="task" data-module="${moduleId}">
          <label>标题<input name="title" required placeholder="例如：每周整理一次"></label>
          <label>备注<input name="note" placeholder="可选备注"></label>
          <label>时间<input name="time" type="time"></label>
          <label>周期<select name="period">${PERIODS.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
          <label>定点日期<input name="datePoint" type="date"></label>
          <label>截止日期<input name="deadline" type="date"></label>
          <label class="checkbox-line"><input name="isCount" type="checkbox" value="1"> 点击计数型任务</label>
          <label>颜色<input name="color" type="color" value="${settings.defaultTaskColor}"></label>
          <label>文字颜色<input name="textColor" type="color" value="${settings.defaultTaskText}"></label>
          <label>透明度<input name="alpha" type="range" min="35" max="100" value="92"></label>
          <button class="primary" type="submit">添加</button>
        </form>`;
    }
    const typeOptions = moduleId === "today"
      ? [["once", "一次性任务"], ["count", "点击计数型任务"], ["non_today", "非今日事项"]]
      : [["once", "一次性任务"], ["count", "点击计数型任务"]];
    return `
        <form class="form-grid" data-form="task" data-module="${moduleId}">
          <label>标题<input name="title" required placeholder="例如：整理 10 分钟"></label>
          <label>备注<input name="note" placeholder="可选备注"></label>
          <label>时间<input name="time" type="time"></label>
          <label>类型<select name="type" data-role="type-select">${typeOptions.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
        ${moduleId === "today" ? `<label class="future-date-field hidden">非今日日期<input name="dueDate" type="date"></label>` : ""}
        ${moduleId === "important" ? `<label>日期<input name="displayDate" type="date"></label>` : ""}
        <label>颜色<input name="color" type="color" value="${settings.defaultTaskColor}"></label>
        <label>文字颜色<input name="textColor" type="color" value="${settings.defaultTaskText}"></label>
        <label>透明度<input name="alpha" type="range" min="35" max="100" value="92"></label>
        <button class="primary" type="submit">添加</button>
      </form>`;
  }

  function renderTaskBoard(module, tasks = module.tasks, sourceDate = "") {
    return `
      <section class="note-board task-board" data-board="tasks" data-module="${module.id}">
        ${tasks.length ? tasks.map((task, index) => taskCard(module, task, index, sourceDate)).join("") : `<div class="panel empty">这里还没有便签。</div>`}
      </section>`;
  }

  function taskCard(module, task, index, sourceDate = "") {
    const total = activeHistory().filter((item) => item.taskId === task.id).reduce((sum, item) => sum + Number(item.amount || 1), 0);
    const pos = clampSavedNotePosition(task.position || defaultTaskPosition(index), "task");
    task.position = pos;
    const countLike = task.type === "count" || task.isCount;
    const doneClass = task.done ? " done" : "";
    return `
      <article class="task-card sticky-note${doneClass}" style="left:${pos.x}px;top:${pos.y}px;--note-color:${task.color};color:${task.textColor};opacity:${task.alpha ?? .92}" data-task-id="${task.id}">
        <button class="drag-handle" data-drag="task" data-module="${module.id}" data-task="${task.id}" data-source-date="${sourceDate}" title="拖动">拖</button>
        <div class="task-title">${esc(task.title)}</div>
        <div class="module-meta">${esc(typeLabel(task, module.id))} · 已记录 ${total} 次</div>
        ${task.time ? `<div class="badge-line">时间：${esc(task.time)}</div>` : ""}
        ${task.note ? `<div class="badge-line">备注：${esc(task.note)}</div>` : ""}
        ${task.displayDate ? `<div class="badge-line">日期：${esc(task.displayDate)}</div>` : ""}
        ${task.dueDate && task.type === "non_today" ? `<div class="badge-line">非今日日期：${esc(task.dueDate)}</div>` : ""}
        ${module.id === "period" ? `<div class="badge-line">${esc(periodInfo(task))}</div>` : ""}
        ${sourceDate ? `<div class="badge-line">来源日期：${esc(sourceDate)}</div>` : ""}
        ${countLike ? `
          <div class="counter-box">
            <button data-action="count-minus" data-module="${module.id}" data-task="${task.id}" data-source-date="${sourceDate}">−1</button>
            <strong>${task.count || 0}</strong>
            <button data-action="count-plus" data-module="${module.id}" data-task="${task.id}" data-source-date="${sourceDate}">+1</button>
          </div>` : ""}
        <div class="task-actions">
          <button class="primary complete-button" data-action="complete-task" data-module="${module.id}" data-task="${task.id}" data-source-date="${sourceDate}">${task.done ? "已完成" : "完成"}</button>
          <button class="small" data-action="edit-task" data-module="${module.id}" data-task="${task.id}" data-source-date="${sourceDate}">编辑</button>
          ${sourceDate ? "" : `<button class="small danger" data-action="delete-task" data-module="${module.id}" data-task="${task.id}">删除</button>`}
        </div>
      </article>`;
  }

  function overviewTaskCard(item, index) {
    const { module, task, sourceDate = "" } = item;
    const total = activeHistory().filter((entry) => entry.taskId === task.id).reduce((sum, entry) => sum + Number(entry.amount || 1), 0);
    const countLike = task.type === "count" || task.isCount;
    const doneClass = task.done ? " done" : "";
    return `
      <article class="overview-note task-card sticky-note${doneClass}" style="--note-color:${task.color || "#ffffff"};color:${task.textColor || "#2e2a24"};opacity:${task.alpha ?? .92};--rot:${((index % 5) - 2) * .7}deg" data-task-id="${task.id}">
        <div class="task-title">${esc(task.title)}</div>
        <div class="module-meta">来源：${esc(module.name)} · 已记录 ${total} 次</div>
        ${task.time ? `<div class="badge-line">时间：${esc(task.time)}</div>` : ""}
        ${task.note ? `<div class="badge-line">备注：${esc(task.note)}</div>` : ""}
        ${task.displayDate ? `<div class="badge-line">日期：${esc(task.displayDate)}</div>` : ""}
        ${module.id === "period" ? `<div class="badge-line">${esc(periodInfo(task))}</div>` : ""}
        ${countLike ? `
          <div class="counter-box">
            <button data-action="count-minus" data-module="${module.id}" data-task="${task.id}" data-source-date="${sourceDate}">−1</button>
            <strong>${task.count || 0}</strong>
            <button data-action="count-plus" data-module="${module.id}" data-task="${task.id}" data-source-date="${sourceDate}">+1</button>
          </div>` : ""}
        <div class="task-actions">
          <button class="primary complete-button" data-action="complete-task" data-module="${module.id}" data-task="${task.id}" data-source-date="${sourceDate}">${task.done ? "已完成" : "完成"}</button>
          <button class="small" data-action="edit-task" data-module="${module.id}" data-task="${task.id}" data-source-date="${sourceDate}">编辑</button>
        </div>
      </article>`;
  }

  function periodInfo(task) {
    const labelMap = {
      daily: "日任务",
      weekly: "周任务",
      monthly: "月任务",
      quarterly: "季度任务",
      halfyear: "半年任务",
      yearly: "年任务",
      anniversary: "周年任务"
    };
    const label = labelMap[task.period] || "周期任务";
    const dateText = task.datePoint ? `定点：${task.datePoint}` : task.deadline ? `截止：${task.deadline}` : "未设日期";
    return `${label} · ${dateText}${isPeriodDue(task) ? " · 到期" : ""}`;
  }

  function isPeriodDue(task) {
    const today = todayRealKey();
    if (task.deadline) return task.deadline <= today;
    if (task.datePoint) return task.datePoint <= today;
    return false;
  }

  function typeLabel(task, moduleId = "") {
    if (moduleId === "period" || task.type === "periodic") return task.isCount ? "点击计数型周期任务" : "周期任务";
    if (task.type === "count") return "点击计数型任务";
    if (task.type === "non_today") return "非今日事项";
    return "一次性任务";
  }

  function renderMaybe(moduleId) {
    const module = getModule(moduleId);
    if (!module) return goHome();
    renderShell(`
      <section class="panel">
        <div class="row" style="justify-content:space-between">
          <div>
            <h2>${esc(module.name)} · 也许自己可以做的事</h2>
            <p class="hint">备用事项池。加入计划后默认保留原便签，也可以选择移除。</p>
          </div>
          <button data-action="open-module" data-id="${module.id}">返回模块</button>
        </div>
      </section>
      <details class="panel collapsible-form">
        <summary>添加备用便签</summary>
        <form class="form-grid" data-form="maybe" data-module="${module.id}">
          <label>事项<input name="title" required placeholder="先放在这里"></label>
          <label>备注<input name="note" placeholder="可选备注"></label>
          <label>颜色<input name="color" type="color" value="${settings.defaultTaskColor}"></label>
          <label>文字颜色<input name="textColor" type="color" value="${settings.defaultTaskText}"></label>
          <label>透明度<input name="alpha" type="range" min="35" max="100" value="92"></label>
          <button class="primary" type="submit">添加备用便签</button>
        </form>
      </details>
      <section class="note-board task-board maybe-board">
        ${module.maybe.length ? module.maybe.map((item, index) => maybeCard(module, item, index)).join("") : `<div class="panel empty">备用池还是空的。</div>`}
      </section>
    `);
  }

  function maybeCard(module, item, index) {
    const pos = clampSavedNotePosition(item.position || defaultTaskPosition(index), "task");
    item.position = pos;
    return `
      <article class="task-card sticky-note" style="left:${pos.x}px;top:${pos.y}px;--note-color:${item.color};color:${item.textColor};opacity:${item.alpha ?? .92}">
        <button class="drag-handle" data-drag="maybe" data-module="${module.id}" data-id="${item.id}" title="拖动">拖</button>
        <div class="task-title">${esc(item.title)}</div>
        ${item.note ? `<div class="badge-line">备注：${esc(item.note)}</div>` : ""}
        <div class="card-actions">
          ${state.modules.map((target) => `<button class="small" data-action="maybe-add" data-module="${module.id}" data-id="${item.id}" data-target="${target.id}">加入${esc(target.name)}</button>`).join("")}
          <button class="small" data-action="edit-maybe" data-module="${module.id}" data-id="${item.id}">编辑</button>
          <button class="small danger" data-action="delete-maybe" data-module="${module.id}" data-id="${item.id}">删除</button>
        </div>
      </article>`;
  }

  function renderCalendar(moduleId) {
    const view = calendarState(moduleId);
    const monthDate = new Date(view.year, view.month - 1, 1);
    const firstDay = monthDate.getDay();
    const days = new Date(view.year, view.month, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(`<div class="calendar-cell empty-cell"></div>`);
    for (let day = 1; day <= days; day++) {
      const key = `${view.year}-${String(view.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const marked = hasDateData(moduleId, key);
      cells.push(`<button class="calendar-cell ${marked ? "marked" : ""} ${view.selected === key ? "selected" : ""}" data-action="select-day" data-module="${moduleId}" data-date="${key}"><span>${day}</span>${marked ? "<i></i>" : ""}</button>`);
    }
    return `
      <section class="panel calendar-panel">
        <div class="row" style="justify-content:space-between">
          <h2>日期记录</h2>
          <div class="row">
            <button data-action="calendar-month" data-module="${moduleId}" data-dir="-1">上月</button>
            <strong>${view.year}-${String(view.month).padStart(2, "0")}</strong>
            <button data-action="calendar-month" data-module="${moduleId}" data-dir="1">下月</button>
          </div>
        </div>
        <div class="calendar-grid calendar-week"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>
        <div class="calendar-grid">${cells.join("")}</div>
        <div class="row" style="margin-top:10px"><button data-action="day" data-module="${moduleId}" data-date="${view.selected}">查看 ${esc(view.selected)}</button></div>
      </section>`;
  }

  function calendarState(moduleId) {
    const now = new Date();
    state.calendar[moduleId] = state.calendar[moduleId] || { year: now.getFullYear(), month: now.getMonth() + 1, selected: todayRealKey() };
    return state.calendar[moduleId];
  }

  function hasDateData(moduleId, date) {
    if (moduleId === "today" && state.dailyArchives[date]?.tasks?.length) return true;
    if (moduleId === "today" && state.futureTasks.some((task) => task.dueDate === date)) return true;
    if (moduleId === "period" && getModule("period")?.tasks.some((task) => task.datePoint === date)) return true;
    if (moduleId === "important" && getModule("important")?.tasks.some((task) => task.displayDate === date)) return true;
    return history.some((item) => item.moduleId === moduleId && ((item.fromArchiveDate || item.historyDate || item.time?.slice(0, 10)) === date));
  }

  function renderDay(moduleId, date) {
    const module = getModule(moduleId);
    if (!module) return goHome();
    const tasks = moduleId === "today"
      ? (state.dailyArchives[date]?.tasks || []).concat(state.futureTasks.filter((task) => task.dueDate === date))
      : moduleId === "period" ? visiblePeriodTasks(getPeriodSnapshot(date), date) : sortByTime(module.tasks.filter((task) => task.displayDate === date));
    const records = activeHistory().filter((item) => item.moduleId === moduleId && ((item.fromArchiveDate || item.historyDate || item.time?.slice(0, 10)) === date)).sort((a, b) => b.time.localeCompare(a.time));
    renderShell(`
      <section class="panel">
        <div class="row" style="justify-content:space-between">
          <div>
            <h2>${esc(date)} · ${esc(module.name)}</h2>
            <p class="hint">${moduleId === "period" ? "这里查看当天周期任务和往日补打卡记录。" : "这里查看当天任务、非今日事项和完成记录。"}</p>
          </div>
          <button data-action="open-module" data-id="${moduleId}">返回模块</button>
        </div>
      </section>
      <section class="panel"><h2>当天完成记录</h2>${records.length ? records.map(historyLine).join("") : `<p class="empty">这一天还没有完成记录。</p>`}</section>
      ${renderTaskBoard(module, sortByTime(tasks), date)}
      ${renderCalendar(moduleId)}
    `);
  }

  function renderStats(moduleId) {
    const module = getModule(moduleId);
    if (!module) return goHome();
    if (Math.random() < .45) setTimeout(() => speak("stats"), 80);
    const records = activeHistory().filter((item) => item.moduleId === module.id).sort((a, b) => b.time.localeCompare(a.time));
    const total = records.reduce((sum, item) => sum + Number(item.amount || 1), 0);
    renderShell(`
      <section class="panel">
        <div class="row" style="justify-content:space-between">
          <div><h2>${esc(module.name)} · 已做统计</h2><p class="hint">这里记录这个模块里已经发生过的事。</p></div>
          <button data-action="open-module" data-id="${module.id}">返回计划</button>
        </div>
      </section>
      <section class="stats-layout">
        <article class="stat-card"><h3>总完成次数</h3><div class="stat-number">${total}</div></article>
        ${statList("按任务统计", groupRecords(records, "taskTitle"))}
        ${statList("完成类型", groupRecords(records, "context"))}
        ${statList("事件类型", groupRecords(records, "eventType"))}
        ${statList("点击计数累计次数", module.tasks.filter((t) => t.type === "count" || t.isCount).map((t) => [t.title, t.count || 0]))}
        ${dailyPieCard()}
      </section>
      <section class="panel">
        <h2>最近完成记录</h2>
        <div class="history-list">${records.slice(0, 36).map(historyLine).join("") || `<p class="empty">还没有完成记录。</p>`}</div>
      </section>
    `);
  }

  function statList(title, rows) {
    return `<article class="stat-card"><h3>${esc(title)}</h3>${rows.length ? rows.slice(0, 24).map(([name, count]) => `<div class="list-line"><span>${esc(name || "未命名")}</span><strong>${esc(count)}</strong></div>`).join("") : `<p class="empty">暂无记录。</p>`}</article>`;
  }

  function dailyPieCard() {
    const today = todayRealKey();
    const rows = groupRecords(activeHistory().filter((item) => (item.historyDate || item.time?.slice(0, 10)) === today), "moduleName");
    if (!rows.length) return `<article class="stat-card"><h3>每日完成构成</h3><p class="empty">今天还没有完成记录。</p></article>`;
    const total = rows.reduce((sum, [, count]) => sum + Number(count), 0);
    const colors = ["#f4ce59", "#79b8a3", "#f0a6a6", "#9db7e8", "#d4b5e8", "#b7c78a"];
    let acc = 0;
    const segments = rows.map(([, count], index) => {
      const start = acc / total;
      acc += Number(count);
      const end = acc / total;
      return `${colors[index % colors.length]} ${Math.round(start * 100)}% ${Math.round(end * 100)}%`;
    }).join(", ");
    return `
      <article class="stat-card pie-card">
        <h3>每日完成构成</h3>
        <div class="pie-wrap">
          <div class="pie-chart" style="background:conic-gradient(${segments})"></div>
          <div>${rows.map(([name, count], index) => `<div class="legend-line"><span style="background:${colors[index % colors.length]}"></span>${esc(displayModuleName(name))}：${count}</div>`).join("")}</div>
        </div>
      </article>`;
  }

  function groupRecords(records, key) {
    const map = new Map();
    records.forEach((item) => {
      const name = item[key] || "未命名";
      map.set(name, (map.get(name) || 0) + Number(item.amount || 1));
    });
    return [...map.entries()].sort((a, b) => Number(b[1]) - Number(a[1]));
  }

  function historyLine(item) {
    const date = item.fromArchiveDate ? ` · 来源 ${item.fromArchiveDate}` : "";
    const note = [item.note, item.taskNote].filter(Boolean).join(" / ");
    return `<div class="list-line"><span>${esc(item.taskTitle)} <span class="history-note">${esc(item.context || "")}${esc(date)} ${esc(item.taskTime ? "· " + item.taskTime : "")} ${esc(note)}</span></span><strong>${formatTime(item.time)}</strong></div>`;
  }

  function renderCompare() {
    const rows = getTodayOverviewTasks();
    renderShell(`
      <section class="panel">
        <h2>今日要做总览</h2>
        <p class="hint">只显示本机日期 ${esc(todayRealKey())} 需要处理的事项。</p>
      </section>
      <section class="overview-notes compare-notes">
        ${rows.length ? rows.map((row, index) => overviewTaskCard(row, index)).join("") : `<div class="panel empty">今天暂时没有要做的事。</div>`}
      </section>
    `);
  }

  function compareRows(records, query = "") {
    const q = normalize(query);
    const map = new Map();
    records.forEach((item) => {
      const key = normalize(item.taskTitle || item.taskId);
      if (!key) return;
      if (q && key !== q && !key.includes(q)) return;
      if (!map.has(key)) map.set(key, { title: item.taskTitle || key, count: 0, modules: new Set(), titles: new Set(), times: [], notes: [] });
      const row = map.get(key);
      row.count += Number(item.amount || 1);
      row.modules.add(displayModuleName(item.moduleName));
      row.titles.add(item.taskTitle);
      row.times.push(item.time);
      if (item.note || item.taskNote) row.notes.push(item.note || item.taskNote);
    });
    return [...map.values()].map((row) => ({
      title: row.title,
      count: row.count,
      modules: [...row.modules],
      titles: [...row.titles],
      times: row.times.sort((a, b) => b.localeCompare(a)).slice(0, 5),
      notes: [...new Set(row.notes)].slice(0, 4)
    })).sort((a, b) => b.count - a.count);
  }

  function compareNote(row, index) {
    return `
      <article class="compare-note sticky-note" style="--note-color:#ffffff;--rot:${((index % 5) - 2) * .7}deg">
        <h3>${esc(row.title)}</h3>
        <div class="stat-number">${row.count}</div>
        <p class="history-note">来源：${esc(row.modules.join("、"))}</p>
        <p class="history-note">最近：${esc(row.times.map(formatTime).join("、"))}</p>
        <p class="history-note">标题：${esc(row.titles.join("、"))}</p>
        ${row.notes.length ? `<p class="history-note">备注：${esc(row.notes.join("；"))}</p>` : ""}
      </article>`;
  }

  function renderSettings() {
    renderShell(`
      <section class="panel">
        <div class="row" style="justify-content:space-between"><h2>设置</h2><button class="primary" data-action="save-settings">保存设置</button></div>
        <div class="settings-grid">
          <label>首页标题<input data-setting="title" value="${esc(settings.title)}"></label>
          <label>首页副标题<input data-setting="subtitle" value="${esc(settings.subtitle)}"></label>
          <label>引言文字<input data-setting="quote" value="${esc(settings.quote)}"></label>
          <label>引言作者<input data-setting="quoteAuthor" value="${esc(settings.quoteAuthor)}"></label>
          <label>自定义背景图片<input type="file" accept="image/*" data-action="background-file"></label>
          <label>背景透明度 / 遮罩强度<input type="range" min="0" max="85" data-setting="overlay" value="${settings.overlay}"></label>
          <label>背景模糊<input type="range" min="0" max="18" data-setting="blur" value="${settings.blur}"></label>
          <label>背景显示方式<select data-setting="bgFit">${["cover","contain","repeat","center"].map((v) => `<option value="${v}" ${settings.bgFit === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
          <label>背景位置 X<input type="range" min="0" max="100" data-setting="bgX" value="${settings.bgX}"></label>
          <label>背景位置 Y<input type="range" min="0" max="100" data-setting="bgY" value="${settings.bgY}"></label>
          <label>背景缩放<input type="range" min="50" max="200" data-setting="bgScale" value="${settings.bgScale}"></label>
          <label>项目卡片透明度<input type="range" min="35" max="100" data-setting="moduleAlpha" value="${settings.moduleAlpha}"></label>
          <label>任务卡片透明度<input type="range" min="35" max="100" data-setting="taskAlpha" value="${settings.taskAlpha}"></label>
          <label>默认模块颜色<input type="color" data-setting="defaultModuleColor" value="${settings.defaultModuleColor}"></label>
          <label>默认模块文字颜色<input type="color" data-setting="defaultModuleText" value="${settings.defaultModuleText}"></label>
          <label>默认任务颜色<input type="color" data-setting="defaultTaskColor" value="${settings.defaultTaskColor}"></label>
          <label>默认任务文字颜色<input type="color" data-setting="defaultTaskText" value="${settings.defaultTaskText}"></label>
        </div>
        <div class="row" style="margin-top:12px">
          <button data-action="reset-background">恢复默认背景</button>
        </div>
      </section>
      ${mouseSettingsSection()}
    `);
  }

  function mouseSettingsSection() {
    return `
      <section class="panel">
        <div class="row" style="justify-content:space-between">
          <h2>电鼠</h2>
          <button class="primary" data-action="add-mouse">增加电鼠</button>
        </div>
        <div class="mouse-settings-list">
          ${(state.mice || []).map((mouse, index) => mouseSettingsCard(mouse, index)).join("")}
        </div>
      </section>`;
  }

  function mouseSettingsCard(mouse, index) {
    return `
      <article class="mouse-settings-card">
        <div class="row" style="justify-content:space-between">
          <strong data-mouse-title="${esc(mouse.id)}">${esc(mouse.name || `电鼠 ${index + 1}`)}</strong>
          <label class="checkbox-line"><input type="checkbox" data-mouse-visible="${esc(mouse.id)}" ${mouse.visible !== false ? "checked" : ""}> 显示</label>
        </div>
        <div class="settings-grid">
          <label>名字<input data-mouse-setting="name" data-mouse-id="${esc(mouse.id)}" value="${esc(mouse.name || `电鼠 ${index + 1}`)}"></label>
          <label>聊天框位置<select data-mouse-setting="speechBubbleSide" data-mouse-id="${esc(mouse.id)}">
            <option value="right" ${mouse.speechBubbleSide !== "left" ? "selected" : ""}>右侧</option>
            <option value="left" ${mouse.speechBubbleSide === "left" ? "selected" : ""}>左侧</option>
          </select></label>
          <label>替换图片<input type="file" accept="image/*" data-action="mouse-file" data-mouse-id="${esc(mouse.id)}"></label>
        </div>
        <div class="row">
          <button class="small" data-action="reset-mouse-image" data-id="${esc(mouse.id)}">恢复默认图片</button>
          <button class="small danger" data-action="delete-mouse" data-id="${esc(mouse.id)}" ${state.mice.length <= 1 ? "disabled" : ""}>删除这只电鼠</button>
        </div>
        <details class="speech-fold">
          <summary data-speech-summary="${esc(mouse.id)}">${esc(mouse.name || `电鼠 ${index + 1}`)} 语料区</summary>
          <div class="settings-grid">${Object.keys(SPEECH_LABELS).map((kind) => speechEditor(mouse, kind)).join("")}</div>
        </details>
      </article>`;
  }

  function speechEditor(mouse, kind) {
    return `
      <div class="speech-editor">
        <strong>${SPEECH_LABELS[kind]}</strong>
        ${((mouse.speech || {})[kind] || []).map((line, index) => `
          <div class="row">
            <input data-mouse-speech="${kind}" data-mouse-id="${esc(mouse.id)}" data-index="${index}" value="${esc(line)}">
            <button class="small danger" data-action="delete-speech" data-id="${esc(mouse.id)}" data-kind="${kind}" data-index="${index}">删</button>
          </div>`).join("")}
        <div class="row">
          <input placeholder="添加一句" data-new-speech="${kind}" data-mouse-id="${esc(mouse.id)}">
          <button class="small" data-action="add-speech" data-id="${esc(mouse.id)}" data-kind="${kind}">添加</button>
        </div>
      </div>`;
  }

  function defaultModulePosition(index) {
    if (isCompactViewport()) return { x: 8 + (index % 2) * 132, y: 10 + Math.floor(index / 2) * 122 };
    return { x: 18 + (index % 3) * 255, y: 18 + Math.floor(index / 3) * 190 };
  }

  function defaultTaskPosition(index) {
    if (isCompactViewport()) return { x: 8 + (index % 2) * 132, y: 10 + Math.floor(index / 2) * 136 };
    return { x: 14 + (index % 3) * 250, y: 14 + Math.floor(index / 3) * 198 };
  }

  function isCompactViewport() {
    return typeof window !== "undefined" && window.innerWidth <= 720;
  }

  function clampSavedNotePosition(pos, kind) {
    if (typeof window === "undefined") return pos;
    const width = isCompactViewport() ? (kind === "module" ? 124 : 126) : 236;
    const maxX = Math.max(0, window.innerWidth - width - 24);
    return {
      x: Math.max(0, Math.min(Number(pos.x) || 0, maxX)),
      y: Math.max(0, Number(pos.y) || 0)
    };
  }

  function clampViewportPosition(pos, width, height) {
    return { x: Math.max(0, Math.min(pos.x, Math.max(0, window.innerWidth - width - 8))), y: Math.max(0, Math.min(pos.y, Math.max(0, window.innerHeight - height - 8))) };
  }

  function clampBoardPosition(pos, target) {
    const board = target.parentElement;
    return { x: Math.max(0, Math.min(pos.x, Math.max(0, board.clientWidth - target.offsetWidth - 8))), y: Math.max(0, Math.min(pos.y, Math.max(0, board.clientHeight - target.offsetHeight - 8))) };
  }

  function findMouse(mouseId) {
    return (state.mice || []).find((mouse) => mouse.id === mouseId);
  }

  function speakerMouse(mouseId = "") {
    const visible = (state.mice || []).filter((mouse) => mouse.visible !== false);
    return findMouse(mouseId) || findMouse(lastMouseId) || visible[Math.floor(Math.random() * visible.length)] || state.mice?.[0];
  }

  function speak(kind, mouseId = "") {
    const mouse = speakerMouse(mouseId);
    if (!mouse) return;
    lastMouseId = mouse.id;
    const mouseSpeech = normalizeSpeechSet(mouse.speech);
    const pool = [...(mouseSpeech[kind] || []), ...(kind === "complete" ? mouseSpeech.encourage || [] : [])].filter(Boolean);
    const text = pool.length ? pool[Math.floor(Math.random() * pool.length)] : "吱。";
    const bubble = document.querySelector(`[data-mouse-bubble="${cssEscape(mouse.id)}"]`);
    if (bubble) bubble.textContent = text;
    showToast(text);
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.classList.add("show");
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  function openModal(title, body, onSave) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h2>${esc(title)}</h2>
        <div>${body}</div>
        <div class="row" style="justify-content:flex-end;margin-top:12px">
          <button data-modal-close>取消</button>
          <button class="primary" data-modal-save>保存</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop || event.target.matches("[data-modal-close]")) backdrop.remove();
      if (event.target.matches("[data-modal-save]")) {
        onSave(backdrop);
        backdrop.remove();
      }
    });
  }

  function namedValues(root) {
    const data = {};
    root.querySelectorAll("[name]").forEach((input) => {
      data[input.name] = input.type === "checkbox" ? input.checked : input.value;
    });
    return data;
  }

  document.addEventListener("click", (event) => {
    if (Date.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const dragHandle = event.target.closest("[data-drag]");
    if (dragHandle && !dragHandle.dataset.action) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const el = event.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    if (action === "complete-task") return handleCompleteToggle(event, el);
    if (action !== "open-module") event.stopPropagation();
    if (action === "home") return goHome();
    if (action === "settings") { route = { view: "settings" }; return render(); }
    if (action === "compare") {
      if (route.view === "module" && route.id === "today") {
        route.todayPanel = true;
        route.todayPanelTab = route.todayPanelTab || "period";
        return render();
      }
      route = { view: "compare" };
      return render();
    }
    if (action === "compare-search") { route.query = document.querySelector("[data-compare-query]")?.value || ""; return renderCompare(); }
    if (action === "today-overview-toggle") { route.todayPanel = true; route.todayPanelTab = route.todayPanelTab || "period"; return render(); }
    if (action === "today-overview-close") { route.todayPanel = false; return render(); }
    if (action === "today-overview-tab") { route.todayPanel = true; route.todayPanelTab = el.dataset.tab || "period"; return render(); }
    if (action === "mouse") return speak("click", el.dataset.id);
    if (action === "open-module") { route = { view: "module", id: el.dataset.id }; return render(); }
    if (action === "stats") { route = { view: "stats", id: el.dataset.id }; return render(); }
    if (action === "maybe") { route = { view: "maybe", id: el.dataset.id }; return render(); }
    if (action === "day") { route = { view: "day", id: el.dataset.module, date: el.dataset.date }; return render(); }
    if (action === "select-day") { const view = calendarState(el.dataset.module); view.selected = el.dataset.date; persist(); route = { view: "day", id: el.dataset.module, date: el.dataset.date }; return render(); }
    if (action === "calendar-month") return moveCalendar(el.dataset.module, Number(el.dataset.dir));
    if (action === "add-module") return editModule();
    if (action === "edit-module") return editModule(el.dataset.id);
    if (action === "delete-module") return deleteModule(el.dataset.id);
    if (action === "move-module") { moveInArray(state.modules, el.dataset.id, el.dataset.dir); persist(); return render(); }
    if (action === "count-plus") return changeCount(el.dataset.module, el.dataset.task, 1, el.dataset.sourceDate);
    if (action === "count-minus") return changeCount(el.dataset.module, el.dataset.task, -1, el.dataset.sourceDate);
    if (action === "edit-task") return editTask(el.dataset.module, el.dataset.task, el.dataset.sourceDate);
    if (action === "delete-task") return deleteTask(el.dataset.module, el.dataset.task);
    if (action === "move-task") return moveTask(el.dataset.module, el.dataset.task, el.dataset.dir);
    if (action === "delete-maybe") return deleteMaybe(el.dataset.module, el.dataset.id);
    if (action === "edit-maybe") return editMaybe(el.dataset.module, el.dataset.id);
    if (action === "maybe-add") return addMaybeToModule(el.dataset.module, el.dataset.id, el.dataset.target);
    if (action === "save-settings") return saveSettingsFromDom();
    if (action === "reset-background") { background = null; persist(); render(); showToast("背景已恢复默认"); }
    if (action === "add-mouse") return addMouse();
    if (action === "reset-mouse-image") { const mouse = findMouse(el.dataset.id); if (mouse) mouse.image = ""; persist(); render(); showToast("已恢复默认图片"); }
    if (action === "delete-mouse") return deleteMouse(el.dataset.id);
    if (action === "delete-speech") { const mouse = findMouse(el.dataset.id); if (mouse?.speech?.[el.dataset.kind]) mouse.speech[el.dataset.kind].splice(Number(el.dataset.index), 1); persist(); render(); }
    if (action === "add-speech") return addSpeechLine(el.dataset.id, el.dataset.kind);
  }, true);

  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-action='background-file']")) return saveImageFile(event.target.files[0], "background");
    if (event.target.matches("[data-action='mouse-file']")) return saveImageFile(event.target.files[0], "mouse", event.target.dataset.mouseId);
    if (event.target.matches("[data-mouse-visible]")) {
      const mouse = findMouse(event.target.dataset.mouseVisible);
      if (mouse) mouse.visible = event.target.checked;
      persist();
      render();
      return;
    }
    if (event.target.matches("[data-mouse-setting='speechBubbleSide']")) {
      const mouse = findMouse(event.target.dataset.mouseId);
      if (mouse) mouse.speechBubbleSide = event.target.value === "left" ? "left" : "right";
      persist();
      render();
      return;
    }
    if (event.target.matches("[data-action='toggle-compare']")) {
      const module = getModule(event.target.dataset.id);
      module.compare = event.target.checked;
      persist();
      render();
    }
    if (event.target.matches("[data-role='type-select']")) {
      const form = event.target.closest("form");
      const field = form?.querySelector(".future-date-field");
      if (field) field.classList.toggle("hidden", event.target.value !== "non_today");
    }
    if (event.target.matches("[data-compare-query]")) {
      route.query = event.target.value;
      renderCompare();
    }
  });

  document.addEventListener("input", (event) => {
    if (!event.target.matches("[data-mouse-setting='name']")) return;
    const mouse = findMouse(event.target.dataset.mouseId);
    if (!mouse) return;
    mouse.name = event.target.value.trim() || defaultMouseName(mouse);
    document.querySelector(`[data-mouse-title="${cssEscape(mouse.id)}"]`)?.replaceChildren(document.createTextNode(mouse.name));
    document.querySelector(`[data-speech-summary="${cssEscape(mouse.id)}"]`)?.replaceChildren(document.createTextNode(`${mouse.name} 语料区`));
    persist();
  });

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!form.matches("[data-form]")) return;
    event.preventDefault();
    if (form.dataset.form === "task") submitTask(form);
    if (form.dataset.form === "maybe") submitMaybe(form);
  });

  document.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest("[data-drag]");
    if (!handle) return;
    const target = handle.closest(".sticky-note,.mouse-float");
    if (!target) return;
    handle.setPointerCapture?.(event.pointerId);
    drag = {
      kind: handle.dataset.drag,
      id: handle.dataset.id || handle.dataset.task || "mouse",
      moduleId: handle.dataset.module || "",
      sourceDate: handle.dataset.sourceDate || "",
      target,
      startX: event.clientX,
      startY: event.clientY,
      left: target.offsetLeft,
      top: target.offsetTop,
      moved: false
    };
    target.classList.add("dragging");
  });

  document.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    const raw = { x: drag.left + dx, y: drag.top + dy };
    const pos = drag.kind === "mouse" ? clampViewportPosition(raw, drag.target.offsetWidth, drag.target.offsetHeight) : clampBoardPosition(raw, drag.target);
    drag.target.style.left = `${pos.x}px`;
    drag.target.style.top = `${pos.y}px`;
    if (drag.kind === "mouse") applyBubbleSide(drag.target, findMouse(drag.id), pos);
    event.preventDefault();
  }, { passive: false });

  document.addEventListener("pointerup", () => {
    if (!drag) return;
    const pos = { x: drag.target.offsetLeft, y: drag.target.offsetTop };
    drag.target.classList.remove("dragging");
    if (drag.kind === "mouse") {
      const mouse = findMouse(drag.id);
      if (mouse) mouse.position = pos;
      applyBubbleSide(drag.target, mouse, pos);
      state.mousePos = state.mice?.[0]?.position || pos;
    }
    if (drag.kind === "module") {
      const module = getModule(drag.id);
      if (module) module.position = pos;
    }
    if (drag.kind === "task") {
      const task = drag.sourceDate ? getTaskSource(drag.moduleId, drag.id, drag.sourceDate).task : findTask(getModule(drag.moduleId), drag.id);
      if (task) task.position = pos;
    }
    if (drag.kind === "maybe") {
      const item = findMaybe(getModule(drag.moduleId), drag.id);
      if (item) item.position = pos;
    }
    persist();
    const hadMoved = drag.moved;
    drag = null;
    if (hadMoved) suppressClickUntil = Date.now() + 180;
  });

  document.addEventListener("pointerup", (event) => {
    if (drag || Date.now() < suppressClickUntil) return;
    const button = event.target.closest(".complete-button");
    if (!button) return;
    handleCompleteToggle(event, button, { skipPrompt: true });
  }, true);

  function handleCompleteToggle(event, button, options = {}) {
    event.preventDefault();
    event.stopPropagation();
    const key = `${button.dataset.module || ""}:${button.dataset.task || ""}:${button.dataset.sourceDate || ""}`;
    const now = Date.now();
    if (lastCompleteToggle.key === key && now - lastCompleteToggle.time < 250) return;
    lastCompleteToggle = { key, time: now };
    toggleTaskDone(button.dataset.module, button.dataset.task, button.dataset.sourceDate, options);
  }

  function moveCalendar(moduleId, dir) {
    const view = calendarState(moduleId);
    const date = new Date(view.year, view.month - 1 + dir, 1);
    view.year = date.getFullYear();
    view.month = date.getMonth() + 1;
    view.selected = `${view.year}-${String(view.month).padStart(2, "0")}-01`;
    persist();
    render();
  }

  function editModule(id = "") {
    const module = id ? getModule(id) : { name: "", color: settings.defaultModuleColor, textColor: settings.defaultModuleText, alpha: .92 };
    openModal(id ? "编辑模块" : "新增模块", `
      <div class="form-grid">
        <label>名称<input name="name" value="${esc(module.name)}"></label>
        <label>颜色<input name="color" type="color" value="${module.color}"></label>
        <label>文字颜色<input name="textColor" type="color" value="${module.textColor}"></label>
        <label>透明度<input name="alpha" type="range" min="35" max="100" value="${Math.round((module.alpha ?? .92) * 100)}"></label>
      </div>`, (modal) => {
        const data = namedValues(modal);
        if (!data.name.trim()) return;
        if (id) Object.assign(module, { name: data.name.trim(), color: data.color, textColor: data.textColor, alpha: Number(data.alpha) / 100 });
        else state.modules.push({ id: uid(), name: data.name.trim(), locked: false, color: data.color, textColor: data.textColor, alpha: Number(data.alpha) / 100, tasks: [], maybe: [], compare: false, position: defaultModulePosition(state.modules.length) });
        persist();
        render();
        speak("add");
      });
  }

  function deleteModule(id) {
    const module = getModule(id);
    if (!module || module.locked) return;
    if (confirm(`删除模块「${module.name}」？它的任务会一起删除，历史记录仍保留。`)) {
      state.modules = state.modules.filter((item) => item.id !== id);
      persist();
      render();
    }
  }

  function submitTask(form) {
    const module = getModule(form.dataset.module);
    if (!module) return;
    const data = Object.fromEntries(new FormData(form).entries());
    data.isCount = form.querySelector("[name='isCount']")?.checked || false;
    if (module.id === "today" && data.type === "non_today") {
      if (!data.dueDate) return showToast("非今日事项需要选择日期");
      const task = makeTask(data, module.id);
      task.type = "non_today";
      task.position = defaultTaskPosition(state.futureTasks.length);
      state.futureTasks.push(task);
    } else {
      const task = makeTask(data, module.id);
      if (module.id === "today") task.period = "";
      task.position = defaultTaskPosition(module.tasks.length);
      module.tasks.push(task);
    }
    persist();
    render();
    speak("add");
  }

  function toggleTaskDone(moduleId, taskId, sourceDate = "", options = {}) {
    const { task } = getTaskSource(moduleId, taskId, sourceDate);
    if (!task) return;
    return task.done ? undoCompleteTask(moduleId, taskId, sourceDate) : completeTask(moduleId, taskId, sourceDate, options);
  }

  function completeTask(moduleId, taskId, sourceDate = "", options = {}) {
    const { module, task } = getTaskSource(moduleId, taskId, sourceDate);
    if (!module || !task) return;
    if (task.done) return;
    const note = options.skipPrompt ? "" : (prompt("完成备注（可留空）：", "") || "");
    task.done = true;
    addHistory(module, task, 1, note, {
      fromArchiveDate: sourceDate || "",
      eventType: "task_completed",
      context: sourceDate ? (moduleId === "period" ? "往日周期任务补打卡" : "往日任务补打卡") : undefined
    });
    persist();
    render();
    speak("complete");
  }

  function undoCompleteTask(moduleId, taskId, sourceDate = "") {
    const { task } = getTaskSource(moduleId, taskId, sourceDate);
    if (!task) return;
    const latest = history
      .filter((item) =>
        item.taskId === taskId &&
        item.eventType === "task_completed" &&
        item.action === "task_completed" &&
        !item.reverted &&
        !item.undone &&
        (sourceDate ? (item.fromArchiveDate || item.sourceDate) === sourceDate : !item.fromArchiveDate && !item.sourceDate)
      )
      .sort((a, b) => String(b.time || b.createdAt).localeCompare(String(a.time || a.createdAt)))[0];
    if (latest) {
      latest.reverted = true;
      latest.undone = true;
      latest.revertedAt = nowIso();
    }
    task.done = false;
    persist();
    render();
  }

  function changeCount(moduleId, taskId, delta, sourceDate = "") {
    const { module, task } = getTaskSource(moduleId, taskId, sourceDate);
    if (!module || !task) return;
    task.count = Math.max(0, Number(task.count || 0) + delta);
    if (delta > 0) {
      addHistory(module, task, 1, "", {
        fromArchiveDate: sourceDate || "",
        eventType: "count_increment",
        context: sourceDate ? (moduleId === "period" ? "往日周期任务补打卡" : "往日任务补打卡") : "点击计数增加"
      });
      speak("complete");
    }
    if (delta < 0) addHistory(module, task, -1, "修正计数", { correction: true, eventType: "count_correction", context: "修正" });
    persist();
    render();
  }

  function editTask(moduleId, taskId, sourceDate = "") {
    const { module, task } = getTaskSource(moduleId, taskId, sourceDate);
    if (!task) return;
    const periodFields = moduleId === "period";
    const typeFields = moduleId === "today";
    openModal("编辑便签", `
      <div class="form-grid">
        <label>标题<input name="title" value="${esc(task.title)}"></label>
        <label>备注<input name="note" value="${esc(task.note)}"></label>
        <label>时间<input name="time" type="time" value="${esc(task.time)}"></label>
        ${typeFields ? `<label>类型<select name="type"><option value="once" ${task.type === "once" ? "selected" : ""}>一次性任务</option><option value="count" ${task.type === "count" ? "selected" : ""}>点击计数型任务</option></select></label>` : ""}
        ${moduleId === "important" ? `<label>日期<input name="displayDate" type="date" value="${esc(task.displayDate || "")}"></label>` : ""}
        ${periodFields ? `<label>周期<select name="period">${PERIODS.map(([v,l]) => `<option value="${v}" ${task.period === v ? "selected" : ""}>${l}</option>`).join("")}</select></label><label>定点日期<input name="datePoint" type="date" value="${esc(task.datePoint)}"></label><label>截止日期<input name="deadline" type="date" value="${esc(task.deadline)}"></label><label class="checkbox-line"><input name="isCount" type="checkbox" ${task.isCount ? "checked" : ""}> 点击计数型任务</label>` : ""}
        <label>颜色<input name="color" type="color" value="${task.color}"></label>
        <label>文字颜色<input name="textColor" type="color" value="${task.textColor}"></label>
        <label>透明度<input name="alpha" type="range" min="35" max="100" value="${Math.round((task.alpha ?? .92) * 100)}"></label>
      </div>`, (modal) => {
        const data = namedValues(modal);
        Object.assign(task, {
          title: data.title.trim() || task.title,
          note: data.note,
          time: data.time,
          displayDate: data.displayDate || task.displayDate || "",
          color: data.color,
          textColor: data.textColor,
          alpha: Number(data.alpha) / 100
        });
        if (typeFields) task.type = data.type || "once";
        if (periodFields) Object.assign(task, { type: "periodic", period: data.period || "daily", datePoint: data.datePoint, deadline: data.deadline, isCount: !!data.isCount });
        persist();
        render();
      });
  }

  function deleteTask(moduleId, taskId) {
    const module = getModule(moduleId);
    if (!module || !confirm("删除这个便签？")) return;
    module.tasks = module.tasks.filter((task) => task.id !== taskId);
    persist();
    render();
  }

  function moveTask(moduleId, taskId, dir) {
    const module = getModule(moduleId);
    if (!module) return;
    moveInArray(module.tasks, taskId, dir);
    persist();
    render();
  }

  function moveInArray(list, id, dir) {
    const index = list.findIndex((item) => item.id === id);
    const next = index + Number(dir);
    if (index < 0 || next < 0 || next >= list.length) return;
    [list[index], list[next]] = [list[next], list[index]];
  }

  function submitMaybe(form) {
    const module = getModule(form.dataset.module);
    const data = Object.fromEntries(new FormData(form).entries());
    module.maybe.push({ id: uid(), title: data.title.trim(), note: data.note || "", color: data.color, textColor: data.textColor, alpha: Number(data.alpha || 92) / 100, position: defaultTaskPosition(module.maybe.length) });
    persist();
    render();
    speak("add");
  }

  function editMaybe(moduleId, itemId) {
    const item = findMaybe(getModule(moduleId), itemId);
    if (!item) return;
    openModal("编辑备用便签", `
      <div class="form-grid">
        <label>事项<input name="title" value="${esc(item.title)}"></label>
        <label>备注<input name="note" value="${esc(item.note)}"></label>
        <label>颜色<input name="color" type="color" value="${item.color}"></label>
        <label>文字颜色<input name="textColor" type="color" value="${item.textColor}"></label>
        <label>透明度<input name="alpha" type="range" min="35" max="100" value="${Math.round((item.alpha ?? .92) * 100)}"></label>
      </div>`, (modal) => {
        const data = namedValues(modal);
        Object.assign(item, { title: data.title.trim() || item.title, note: data.note, color: data.color, textColor: data.textColor, alpha: Number(data.alpha) / 100 });
        persist();
        render();
      });
  }

  function deleteMaybe(moduleId, itemId) {
    const module = getModule(moduleId);
    module.maybe = module.maybe.filter((item) => item.id !== itemId);
    persist();
    render();
  }

  function addMaybeToModule(moduleId, itemId, targetId) {
    const source = getModule(moduleId);
    const target = getModule(targetId);
    const item = findMaybe(source, itemId);
    if (!item || !target) return;
    const remove = confirm("点“确定”加入并移除原备用便签，点“取消”加入但保留原便签。");
    const task = makeTask({ title: item.title, note: item.note, type: targetId === "period" ? "periodic" : "once", color: item.color, textColor: item.textColor, alpha: Math.round((item.alpha ?? .92) * 100) }, targetId);
    task.position = defaultTaskPosition(target.tasks.length);
    target.tasks.push(task);
    if (remove) source.maybe = source.maybe.filter((entry) => entry.id !== itemId);
    persist();
    render();
    speak("add");
  }

  function saveSettingsFromDom() {
    document.querySelectorAll("[data-setting]").forEach((input) => {
      settings[input.dataset.setting] = input.type === "range" ? Number(input.value) : input.value;
    });
    document.querySelectorAll("[data-mouse-setting]").forEach((input) => {
      const mouse = findMouse(input.dataset.mouseId);
      if (!mouse) return;
      if (input.dataset.mouseSetting === "name") mouse.name = input.value.trim() || defaultMouseName(mouse);
      if (input.dataset.mouseSetting === "speechBubbleSide") mouse.speechBubbleSide = input.value === "left" ? "left" : "right";
    });
    document.querySelectorAll("[data-mouse-speech]").forEach((input) => {
      const mouse = findMouse(input.dataset.mouseId);
      if (!mouse) return;
      mouse.speech = normalizeSpeechSet(mouse.speech);
      mouse.speech[input.dataset.mouseSpeech][Number(input.dataset.index)] = input.value;
    });
    persist();
    render();
    showToast("设置已保存");
  }

  function defaultMouseName(mouse) {
    const index = Math.max(0, (state.mice || []).findIndex((item) => item.id === mouse.id));
    return `电鼠 ${index + 1}`;
  }

  function addSpeechLine(mouseId, kind) {
    const input = document.querySelector(`[data-new-speech="${kind}"][data-mouse-id="${mouseId}"]`);
    const value = input?.value.trim();
    if (!value) return;
    const mouse = findMouse(mouseId);
    if (!mouse) return;
    mouse.speech = normalizeSpeechSet(mouse.speech);
    mouse.speech[kind] = mouse.speech[kind] || [];
    mouse.speech[kind].push(value);
    persist();
    render();
  }

  function addMouse() {
    const index = state.mice.length;
    state.mice.push(defaultMouse(index, {
      name: `电鼠 ${index + 1}`,
      position: defaultMousePosition(index),
      speech: DEFAULT_SPEECH
    }));
    persist();
    render();
    speak("click", state.mice[index].id);
  }

  function deleteMouse(mouseId) {
    if ((state.mice || []).length <= 1) return showToast("至少保留一只电鼠");
    const mouse = findMouse(mouseId);
    if (!mouse) return;
    if (!confirm(`删除「${mouse.name || "电鼠"}」？`)) return;
    state.mice = state.mice.filter((item) => item.id !== mouseId);
    if (lastMouseId === mouseId) lastMouseId = state.mice[0]?.id || "";
    persist();
    render();
  }

  function saveImageFile(file, target, mouseId = "") {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (target === "background") background = { name: file.name, dataUrl: reader.result };
      if (target === "mouse") {
        const mouse = findMouse(mouseId) || state.mice?.[0];
        if (mouse) mouse.image = reader.result;
      }
      persist();
      render();
      showToast(target === "mouse" ? "图片已保存到本地" : "背景已保存到本地");
    };
    reader.readAsDataURL(file);
  }

  function goHome() {
    route = { view: "home" };
    render();
  }

  setTimeout(function scheduleNoon() {
    rolloverDailyIfNeeded();
    activateFutureTasks();
    persist();
    render();
    setTimeout(scheduleNoon, nextNoonDelay());
  }, nextNoonDelay());

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
  }

  render();
})();
