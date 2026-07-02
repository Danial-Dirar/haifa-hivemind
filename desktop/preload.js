// Minimal, secure preload. The UI talks to the backend over HTTP, so we only
// expose small conveniences here (keeps contextIsolation intact).
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("hivemind", {
  desktop: true,
  platform: process.platform, // "win32" | "linux" | "darwin"
  version: process.env.npm_package_version || "0.1.0",
});
