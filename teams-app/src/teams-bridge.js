/**
 * teams-bridge.js — Microsoft Teams JS SDK integration layer.
 *
 * Handles:
 *   - SDK initialization and Teams context retrieval
 *   - Theme synchronization: Teams dark / light / high-contrast → dashboard tokens
 *   - User identity: pre-fill assignee / "current user" from Teams context
 *   - File reference persistence across page reloads (sessionStorage)
 *   - Detection of standalone browser mode vs. Teams client
 *
 * The Teams JS SDK (@microsoft/teams-js) is expected on window.microsoftTeams.
 * Load it in index.html before this module:
 *   <script src="https://res.cdn.office.net/teams-js/2.22.0/js/MicrosoftTeams.min.js"></script>
 */

// ── SDK access ─────────────────────────────────────────────────────────────────

function sdk() {
    return typeof window !== "undefined" ? window.microsoftTeams : null;
}

export function isRunningInTeams() {
    return !!sdk();
}

// ── Initialization ─────────────────────────────────────────────────────────────

/**
 * Initialize the Teams SDK and return the Teams app context.
 * Safe to call outside Teams — returns null without throwing.
 *
 * @returns {Promise<object|null>} Teams context object or null in standalone mode
 */
export async function initTeams() {
    const s = sdk();
    if (!s) return null;

    try {
        await s.app.initialize();
        const context = await s.app.getContext();

        // Apply theme on init and whenever the user changes their Teams theme
        _applyTheme(context.app?.theme || "dark");
        s.app.registerOnThemeChangeHandler(_applyTheme);

        // Notify Teams that the tab has loaded (removes the loading spinner)
        s.app.notifySuccess();

        return context;
    } catch (err) {
        console.warn("[teams-bridge] Teams SDK init failed:", err.message);
        return null;
    }
}

// ── Theme mapping ──────────────────────────────────────────────────────────────

/**
 * Map a Teams theme string to the dashboard's HTML data-attributes.
 *
 * Teams themes:  "default" (light), "dark", "contrast" (high-contrast)
 * Dashboard:     data-theme="light" / absent (dark), data-palette for accents
 */
function _applyTheme(theme) {
    const html = document.documentElement;
    if (theme === "dark") {
        html.removeAttribute("data-theme");           // dashboard default is dark
    } else if (theme === "contrast") {
        html.setAttribute("data-theme", "light");     // closest equivalent
        html.setAttribute("data-palette", "corporate");
    } else {
        // "default" = Teams light theme
        html.setAttribute("data-theme", "light");
    }
}

// ── User identity ──────────────────────────────────────────────────────────────

/**
 * Returns the short name of the current Teams user (first part of UPN),
 * for pre-filling the assignee field.
 * Returns null in standalone browser mode.
 *
 * @returns {Promise<string|null>}
 */
export async function getCurrentUserShortName() {
    const s = sdk();
    if (!s) return null;
    try {
        const ctx = await s.app.getContext();
        const upn = ctx.user?.userPrincipalName || "";
        return upn.split("@")[0] || null;
    } catch {
        return null;
    }
}

// ── File reference persistence ─────────────────────────────────────────────────

const FILE_REF_KEY = "mx_runbook_file_ref";

/**
 * Persist a picked file reference so it survives page reload.
 * @param {{ driveId: string, itemId: string, name: string, webUrl: string }} ref
 */
export function saveFileRef(ref) {
    if (!ref) { sessionStorage.removeItem(FILE_REF_KEY); return; }
    sessionStorage.setItem(FILE_REF_KEY, JSON.stringify(ref));
}

/**
 * Restore the last picked file reference from sessionStorage.
 * Returns null if none was saved.
 * @returns {{ driveId: string, itemId: string, name: string, webUrl: string } | null}
 */
export function loadFileRef() {
    const raw = sessionStorage.getItem(FILE_REF_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
}

export function clearFileRef() {
    sessionStorage.removeItem(FILE_REF_KEY);
}

// ── Configurable tab helpers ───────────────────────────────────────────────────

/**
 * Read the tab configuration saved by config.html.
 * Returns null when not in a configured channel tab context.
 * @returns {Promise<{ driveId, itemId, name } | null>}
 */
export async function getTabConfig() {
    const s = sdk();
    if (!s) return null;
    try {
        const config = await s.pages.getConfig();
        return config.entityId ? JSON.parse(config.entityId) : null;
    } catch {
        return null;
    }
}

/**
 * Save tab configuration (called from config.html only).
 * @param {{ driveId: string, itemId: string, name: string }} fileRef
 */
export async function saveTabConfig(fileRef) {
    const s = sdk();
    if (!s) throw new Error("Not in Teams context");
    await s.pages.config.setConfig({
        entityId:    JSON.stringify(fileRef),
        suggestedDisplayName: fileRef.name || "Runbook",
        contentUrl:  window.location.origin + "/teams-app/index.html",
        websiteUrl:  window.location.origin + "/teams-app/index.html",
    });
    s.pages.config.setValidityState(true);
}
