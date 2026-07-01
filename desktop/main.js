// Haifa HiveMind — Electron shell.
// Responsibilities:
//   1. Spawn & supervise the local Python backend (the AI brain).
//   2. Show a splash until the backend is healthy.
//   3. Load the compiled React UI.
//   4. Cleanly shut the backend down on quit (so no orphaned GPU/RAM usage).

const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const fs = require("fs");

const DEV = process.env.HIVEMIND_DEV === "1";
const PORT = process.env.HIVEMIND_PORT || 8756;
const HEALTH = `http://127.0.0.1:${PORT}/health`;

let backend = null;
let win = null;

// --- Backend resolution -----------------------------------------------------
function backendDir() {
  return DEV
    ? path.join(__dirname, "..", "backend")
    : path.join(process.resourcesPath, "backend");
}

// Prefer a bundled PyInstaller exe if present, else fall back to system Python.
function resolveBackendCommand() {
  const dir = backendDir();
  const exe = process.platform === "win32" ? "hivemind-backend.exe" : "hivemind-backend";
  const bundled = path.join(dir, "dist", exe);
  if (fs.existsSync(bundled)) return { cmd: bundled, args: [], cwd: dir };
  const py = process.platform === "win32" ? "python" : "python3";
  return { cmd: py, args: ["run.py"], cwd: dir };
}

function startBackend() {
  const { cmd, args, cwd } = resolveBackendCommand();
  backend = spawn(cmd, args, {
    cwd,
    env: { ...process.env, HIVEMIND_PORT: String(PORT) },
    stdio: "ignore",
  });
  backend.on("error", (err) => {
    dialog.showErrorBox(
      "Backend failed to start",
      `Could not launch the AI engine.\n\n${err.message}\n\n` +
        "Make sure Python and Ollama are installed (see the setup guide)."
    );
  });
}

function pingHealth() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1500, () => { req.destroy(); resolve(false); });
  });
}

async function waitForBackend(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await pingHealth()) return true;
    await new Promise((r) => setTimeout(r, 800));
  }
  return false;
}

// --- Window -----------------------------------------------------------------
function createWindow() {
  win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 940,
    minHeight: 620,
    backgroundColor: "#0a0b0d",
    show: false,
    autoHideMenuBar: true,
    title: "Haifa HiveMind",
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true },
  });

  // External links open in the system browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadFile(path.join(__dirname, "splash.html"));
  win.once("ready-to-show", () => win.show());
}

function loadApp() {
  if (DEV && process.env.HIVEMIND_VITE) {
    win.loadURL(process.env.HIVEMIND_VITE); // e.g. http://localhost:5219
  } else {
    const web = DEV
      ? path.join(__dirname, "..", "frontend", "dist", "index.html")
      : path.join(process.resourcesPath, "web", "index.html");
    win.loadFile(web);
  }
}

// --- Lifecycle --------------------------------------------------------------
app.whenReady().then(async () => {
  createWindow();
  startBackend();
  const ok = await waitForBackend();
  if (!ok) {
    dialog.showErrorBox(
      "AI engine not responding",
      "The backend did not start in time. Please check that Python and Ollama " +
        "are installed, then restart Haifa HiveMind."
    );
  }
  loadApp();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function stopBackend() {
  if (backend && !backend.killed) {
    try {
      if (process.platform === "win32") spawn("taskkill", ["/pid", backend.pid, "/f", "/t"]);
      else backend.kill("SIGTERM");
    } catch {}
  }
}

app.on("before-quit", stopBackend);
app.on("window-all-closed", () => {
  stopBackend();
  if (process.platform !== "darwin") app.quit();
});
process.on("exit", stopBackend);
