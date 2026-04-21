// ============================================================
// preload.js — Electron contextBridge for RunbookDashboard
// ============================================================
// Runs in an isolated Node context before any renderer page loads.
// Exposes a minimal, typed surface as window.electronAPI.
// The renderer never gets direct Node/Electron access.
// ============================================================

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {

    // ── Constant ────────────────────────────────────────────
    // Feature-detect: welcome.html and dashboard can branch on this.
    isElectron: true,

    // ── Folder picker ────────────────────────────────────────
    // Opens a native OS folder dialog.
    // Resolves to the chosen absolute path string, or null if cancelled.
    openFolder: () =>
        ipcRenderer.invoke('dialog:openFolder'),

    // ── Folder file reading ──────────────────────────────────
    // Reads and parses config.json from the given folder path.
    // Resolves to a plain object, or null if missing / unparseable.
    readConfig: (folderPath) =>
        ipcRenderer.invoke('folder:readConfig', folderPath),

    // Reads an image file from within folderPath and returns a base64
    // data URL string (e.g. "data:image/png;base64,..."), or null.
    // filename must be a bare filename with no path separators.
    // Files larger than 256 KB are rejected (returns null).
    readFileAsDataUrl: (folderPath, filename) =>
        ipcRenderer.invoke('folder:readFileAsDataUrl', folderPath, filename),

    // ── Recent client store ──────────────────────────────────
    // Returns the array of RecentClient entries, newest first (max 10).
    // Shape: { path, clientName, projectName, subtitle, accentColor,
    //          logoFile, backgroundFile, logoDataUrl, lastOpened }
    getRecentClients: () =>
        ipcRenderer.invoke('store:getRecent'),

    // Upserts a RecentClient entry by its .path field.
    // Trims the list to 10, ordered by lastOpened descending.
    addRecentClient: (entry) =>
        ipcRenderer.invoke('store:addRecent', entry),

    // Removes the entry whose .path equals folderPath.
    removeRecentClient: (folderPath) =>
        ipcRenderer.invoke('store:removeRecent', folderPath),

    // ── Navigation ───────────────────────────────────────────
    // Set the active client directory and navigate the window to the
    // dashboard, injecting ?clientKey=<slug> for per-client localStorage.
    openDashboard: (folderPath) =>
        ipcRenderer.invoke('nav:openDashboard', folderPath),

    // Navigate the window back to the welcome page.
    openWelcome: () =>
        ipcRenderer.invoke('nav:openWelcome'),

    // ── Dashboard config (theme, background — irrespective of client) ─
    // Returns the current dashboard-config.json as a plain object.
    getDashboardConfig: () =>
        ipcRenderer.invoke('config:getDashboard'),

    // Persists allowed keys (theme, backgroundImage) back to dashboard-config.json.
    saveDashboardConfig: (updates) =>
        ipcRenderer.invoke('config:saveDashboard', updates),
});
