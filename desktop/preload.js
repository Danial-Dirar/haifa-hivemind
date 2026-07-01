// Minimal, secure preload. The UI talks to the backend over HTTP, so we only
// expose small conveniences here (keeps contextIsolation intact).
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("hivemind", {
  desktop: true,
  version: process.env.npm_package_version || "0.1.0",
});
