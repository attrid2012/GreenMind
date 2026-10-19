"use strict";

const $ = (selector) => document.querySelector(selector);

const STORAGE_KEY = "greenmind-v1";

const quotes = [
  "Great things are done by a series of small things brought together.",
  "Your future is created by what you do today.",
  "Little by little, a little becomes a lot.",
  "Focus on progress, not perfection.",
  "Every focused minute is a seed for tomorrow.",
  "Small steps every day lead to big changes."
];

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function yesterdayKey() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return localDateKey(date);
}

function defaultState() {
  return {
    totalSeconds: 0,
    sessions: 0,
    trees: [],
    tasks: [],
    streak: 0,
    lastSessionDate: "",
    dailySeconds: {},
    theme: "light"
  };
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) return defaultState();

    const data = JSON.parse(saved);
    const defaults = defaultState();

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return defaults;
    }

    return {
      ...defaults,
      totalSeconds: Number.isFinite(data.totalSeconds)
        ? Math.max(0, data.totalSeconds) : 0,
      sessions: Number.isFinite(data.sessions)
        ? Math.max(0, data.sessions) : 0,
      trees: Array.isArray(data.trees)
        ? data.trees.filter(t =>
            t && typeof t.date === "string" &&
            Number.isFinite(t.minutes)
          ).slice(-500) : [],
      tasks: Array.isArray(data.tasks)
        ? data.tasks.filter(t =>
            t && typeof t.id === "string" &&
            typeof t.text === "string" &&
            typeof t.completed === "boolean"
          ).slice(-200) : [],
      streak: Number.isFinite(data.streak)
        ? Math.max(0, data.streak) : 0,
      lastSessionDate: typeof data.lastSessionDate === "string"
        ? data.lastSessionDate : "",
      dailySeconds: data.dailySeconds &&
        typeof data.dailySeconds === "object" &&
        !Array.isArray(data.dailySeconds)
        ? data.dailySeconds : {},
      theme: data.theme === "dark" ? "dark" : "light"
    };
  } catch (error) {
    console.warn("Could not load GreenMind data.", error);
    return defaultState();
  }
}

let state = loadState();

let selectedMinutes = 25;
let remainingSeconds = selectedMinutes * 60;
let timerEnd = null;
let timerInterval = null;
let running = false;
let toastTimeout = null;

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Could not save GreenMind data.", error);
    showToast("Unable to save. Check your browser storage.");
  }
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimeout);

  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return `${minutes} min`;
}

function updateTimerDisplay() {
  $("#timerDisplay").textContent = formatTime(remainingSeconds);
  document.title = running
    ? `${formatTime(remainingSeconds)} — GreenMind`
    : "GreenMind — Focus. Grow. Achieve.";

  updateTreeGrowth();
}

function updateTreeGrowth() {
  const tree = $("#growingTree");

  const elapsed = selectedMinutes * 60 - remainingSeconds;
  const progress = Math.max(0, Math.min(1, elapsed / (selectedMinutes * 60)));

  const scale = 0.72 + progress * 0.5;

  tree.style.transform = `translateX(-50%) scale(${scale})`;
  tree.classList.toggle("grown", progress >= 0.15);

  if (running) {
    $("#treeMessage").textContent =
      progress >= 0.9
        ? "Almost there! Your tree is flourishing 🌳"
        : "Your tree is growing with your focus 🌱";
  } else if (remainingSeconds === 0) {
    $("#treeMessage").textContent = "You did it! A new tree is yours! 🌳";
  } else if (elapsed > 0) {
    $("#treeMessage").textContent = "Your tree is waiting for its next session 🌿";
  } else {
    $("#treeMessage").textContent = "Your next tree starts here 🌱";
  }
}

function updateStatus() {
  $("#status").textContent = running ? "FOCUSING" : "READY";
  $("#startBtn").textContent = running ? "Ⅱ Pause session" : "▶ Start focusing";

  $("#timerCaption").textContent = running
    ? "Stay present. One minute at a time."
    : "Choose your focus duration and begin.";
}

function updateStats() {
  $("#totalTime").textContent = formatDuration(state.totalSeconds);
  $("#treeCount").textContent = state.trees.length;
  $("#sessionCount").textContent = state.sessions;
  $("#streakCount").textContent = `${state.streak} days`;
  $("#forestLabel").textContent = `${state.trees.length} trees`;

  const completed = state.tasks.filter(task => task.completed).length;
  $("#taskTotal").textContent =
    `${completed}/${state.tasks.length} done`;

  const todaySeconds = Number(state.dailySeconds[localDateKey()]) || 0;

  $("#greeting").textContent = todaySeconds > 0
    ? "You're growing today!"
    : "Ready to grow?";
}

function renderTasks() {
  const list = $("#taskList");
  list.replaceChildren();

  $("#emptyTasks").hidden = state.tasks.length > 0;

  for (const task of state.tasks) {
    const row = document.createElement("div");
    row.className = "task-item";
    row.classList.toggle("completed", task.completed);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-check";
    checkbox.checked = task.completed;
    checkbox.setAttribute("aria-label", `Complete ${task.text}`);

    checkbox.addEventListener("change", () => {
      task.completed = checkbox.checked;
      saveState();
      renderTasks();
      updateStats();
    });

    const label = document.createElement("span");
    label.className = "task-text";
    label.textContent = task.text;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-task";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Delete ${task.text}`);

    remove.addEventListener("click", () => {
      state.tasks = state.tasks.filter(item => item.id !== task.id);
      saveState();
      renderTasks();
      updateStats();
      showToast("Task removed.");
    });

    row.append(checkbox, label, remove);
    list.appendChild(row);
  }
}

function renderForest() {
  const grid = $("#forestGrid");
  grid.replaceChildren();

  const trees = state.trees.slice(-60);

  $("#emptyForest").hidden = trees.length > 0;

  trees.forEach((tree, index) => {
    const item = document.createElement("div");
    item.className = "forest-tree";

    const emoji = document.createElement("span");
    emoji.textContent = ["🌳", "🌲", "🌴", "🌿", "🎄"][index % 5];
    emoji.setAttribute("aria-hidden", "true");

    const label = document.createElement("small");
    label.textContent = tree.minutes >= 60
      ? `${Math.floor(tree.minutes / 60)}h focus`
      : `${tree.minutes} min`;

    item.title = `Focus session: ${tree.minutes} minutes, ${tree.date}`;
    item.append(emoji, label);
    grid.appendChild(item);
  });
}

function updateStreak() {
  const today = localDateKey();
  const yesterday = yesterdayKey();

  if (state.lastSessionDate === today) {
    return;
  }

  if (state.lastSessionDate === yesterday) {
    state.streak += 1;
  } else {
    state.streak = 1;
  }

  state.lastSessionDate = today;
}

function recordCompletedSession() {
  const minutes = selectedMinutes;
  const today = localDateKey();
  const seconds = minutes * 60;

  state.sessions += 1;
  state.totalSeconds += seconds;
  state.dailySeconds[today] =
    (Number(state.dailySeconds[today]) || 0) + seconds;

  updateStreak();

  state.trees.push({
    date: today,
    minutes,
    id: `${Date.now()}-${state.sessions}`
  });

  if (state.trees.length > 500) {
    state.trees = state.trees.slice(-500);
  }

  saveState();
  updateStats();
  renderForest();

  $("#treeMessage").textContent = "You did it! A new tree is yours! 🌳";
  $("#timerCaption").textContent = "Session completed. Wonderful work!";
  $("#status").textContent = "COMPLETED";

  showToast("Amazing! Your focus session is complete. 🌳");

  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification("GreenMind", {
        body: "Your focus session is complete. Your tree has grown! 🌳"
      });
    } catch (error) {
      console.warn("Notification unavailable.", error);
    }
  }

  remainingSeconds = 0;
  running = false;
  timerEnd = null;
  clearInterval(timerInterval);
  timerInterval = null;

  updateTimerDisplay();
  updateStatus();
}

function tick() {
  if (!running || timerEnd === null) return;

  remainingSeconds = Math.max(
    0,
    Math.ceil((timerEnd - Date.now()) / 1000)
  );

  updateTimerDisplay();

  if (remainingSeconds <= 0) {
    recordCompletedSession();
  }
}

function startTimer() {
  if (running) {
    pauseTimer();
    return;
  }

  if (remainingSeconds <= 0) {
    remainingSeconds = selectedMinutes * 60;
  }

  running = true;
  timerEnd = Date.now() + remainingSeconds * 1000;

  clearInterval(timerInterval);
  timerInterval = setInterval(tick, 250);

  updateStatus();
  tick();

  showToast("Your focus session has started. 🌱");

  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

function pauseTimer() {
  if (!running) return;

  tick();

  if (!running) return;

  running = false;
  timerEnd = null;

  clearInterval(timerInterval);
  timerInterval = null;

  updateStatus();
  updateTimerDisplay();

  showToast("Session paused. Take a breath.");
}

function resetTimer() {
  running = false;
  timerEnd = null;

  clearInterval(timerInterval);
  timerInterval = null;

  remainingSeconds = selectedMinutes * 60;

  updateTimerDisplay();
  updateStatus();

  $("#timerCaption").textContent = "Choose your focus duration and begin.";

  showToast("Timer reset.");
}

function chooseDuration(minutes) {
  if (running) {
    showToast("Pause your session before changing duration.");
    return;
  }

  selectedMinutes = minutes;
  remainingSeconds = minutes * 60;

  document.querySelectorAll(".duration-btn").forEach(button => {
    button.classList.toggle(
      "selected",
      Number(button.dataset.minutes) === minutes
    );
  });

  updateTimerDisplay();
  updateStatus();
}

function addTask(text) {
  const cleanText = text.trim();

  if (!cleanText) {
    showToast("Please enter a task.");
    return;
  }

  if (state.tasks.length >= 200) {
    showToast("You have reached the task limit.");
    return;
  }

  state.tasks.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    text: cleanText,
    completed: false
  });

  saveState();
  renderTasks();
  updateStats();
  showToast("Task added. One step closer! 🌿");
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";

  document.body.classList.toggle("dark", state.theme === "dark");
  $("#themeToggle").textContent = state.theme === "dark" ? "☀️" : "🌙";
  $("#themeToggle").setAttribute(
    "aria-label",
    state.theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
  );

  saveState();
}

function applyTheme() {
  const dark = state.theme === "dark";

  document.body.classList.toggle("dark", dark);
  $("#themeToggle").textContent = dark ? "☀️" : "🌙";
  $("#themeToggle").setAttribute(
    "aria-label",
    dark ? "Switch to light mode" : "Switch to dark mode"
  );
}

$("#startBtn").addEventListener("click", startTimer);
$("#resetBtn").addEventListener("click", resetTimer);
$("#themeToggle").addEventListener("click", toggleTheme);

document.querySelectorAll(".duration-btn").forEach(button => {
  button.addEventListener("click", () => {
    chooseDuration(Number(button.dataset.minutes));
  });
});

$("#taskForm").addEventListener("submit", event => {
  event.preventDefault();

  const input = $("#taskInput");
  addTask(input.value);
  input.value = "";
  input.focus();
});

$("#quoteText").textContent =
  quotes[Math.floor(Math.random() * quotes.length)];

applyTheme();
updateTimerDisplay();
updateStatus();
updateStats();
renderTasks();
renderForest();

// Keep the displayed countdown accurate when returning to the tab.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && running) {
    tick();
  }
});
