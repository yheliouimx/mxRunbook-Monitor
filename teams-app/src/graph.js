/**
 * graph.js — Microsoft Graph API file I/O for the Teams tab.
 *
 * Replaces the Electron IPC layer:
 *   Electron: dialog:openFolder → folder:readFileAsDataUrl → runbook:writeToExcel
 *   Teams:    pickFile()        → readExcelBytes()         → writeExcelBytes()
 *
 * The caller (index.html teamsAPI shim) wraps these in the same interface that
 * app.js already guards with `if (!window.electronAPI)` / `if (!window.teamsAPI)`.
 */

import { getAccessToken } from "./auth.js";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// ── Core fetch wrapper ─────────────────────────────────────────────────────────

async function graphFetch(path, options = {}) {
    const token = await getAccessToken();
    const resp = await fetch(GRAPH_BASE + path, {
        ...options,
        headers: {
            Authorization: "Bearer " + token,
            ...(!options.rawBody ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {}),
        },
    });
    if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`Graph ${options.method || "GET"} ${path} → ${resp.status}: ${body}`);
    }
    return resp;
}

// ── File picker ────────────────────────────────────────────────────────────────

/**
 * Open the Microsoft file/folder picker and let the user choose a runbook Excel file
 * from OneDrive or SharePoint.
 *
 * Uses the OneDrive picker SDK v8 (window.open + postMessage).
 * Returns { driveId, itemId, name, webUrl } or null if cancelled.
 *
 * NOTE: The picker popup requires that {{YOUR_APP_DOMAIN}} is listed in the
 * Teams manifest validDomains and that third-party cookies are not fully blocked.
 */
export async function pickFile() {
    const token = await getAccessToken();

    return new Promise((resolve) => {
        const pickerParams = {
            sdk: "8.0",
            entry: { oneDrive: {} },
            authentication: {},
            messaging: {
                origin: window.location.origin,
                channelId: "teams-runbook-picker",
            },
            typesAndSources: {
                mode: "files",
                pivots: { oneDrive: true, sharePoint: true },
                filters: [".xlsx"],
            },
            selection: { mode: "single" },
        };

        const baseUrl = "https://onedrive.live.com/picker";
        const pickerUrl = `${baseUrl}?${new URLSearchParams({ pickerParams: JSON.stringify(pickerParams) })}`;
        const pickerWindow = window.open(pickerUrl, "onedrive-picker", "width=800,height=600");

        let resolved = false;

        const messageHandler = async (ev) => {
            const msg = ev.data;
            if (!msg || typeof msg !== "object") return;

            // Token request from the picker SDK
            if (msg.type === "initialize" && msg.channelId === "teams-runbook-picker") {
                pickerWindow.postMessage({ type: "authenticate", token }, "*");
                return;
            }

            if (msg.type === "success") {
                resolved = true;
                window.removeEventListener("message", messageHandler);
                pickerWindow.close();
                const item = msg.items?.[0];
                resolve(item ? {
                    driveId: item.parentReference?.driveId,
                    itemId:  item.id,
                    name:    item.name,
                    webUrl:  item.webUrl,
                } : null);
            }

            if (msg.type === "cancel") {
                resolved = true;
                window.removeEventListener("message", messageHandler);
                pickerWindow.close();
                resolve(null);
            }
        };

        window.addEventListener("message", messageHandler);

        // Clean up if the user closes the popup window directly
        const poll = setInterval(() => {
            if (!resolved && pickerWindow.closed) {
                clearInterval(poll);
                window.removeEventListener("message", messageHandler);
                resolve(null);
            }
        }, 500);
    });
}

// ── File read / write ──────────────────────────────────────────────────────────

/**
 * Download the raw Excel bytes for a OneDrive / SharePoint file.
 * @param {string} driveId
 * @param {string} itemId
 * @returns {Promise<ArrayBuffer>}
 */
export async function readExcelBytes(driveId, itemId) {
    const resp = await graphFetch(`/drives/${driveId}/items/${itemId}/content`);
    return resp.arrayBuffer();
}

/**
 * Upload modified Excel bytes back to OneDrive (simple PUT — overwrites existing content).
 * The file must already exist at the given driveId/itemId.
 *
 * For files larger than 4 MB, use the resumable upload session API instead.
 * Most runbook Excel files are well under this limit.
 *
 * @param {string} driveId
 * @param {string} itemId
 * @param {ArrayBuffer} arrayBuffer — modified workbook bytes (from SheetJS XLSX.write)
 * @returns {Promise<object>} updated DriveItem metadata
 */
export async function writeExcelBytes(driveId, itemId, arrayBuffer) {
    const token = await getAccessToken();
    const resp = await fetch(
        `${GRAPH_BASE}/drives/${driveId}/items/${itemId}/content`,
        {
            method: "PUT",
            headers: {
                Authorization: "Bearer " + token,
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
            body: arrayBuffer,
        }
    );
    if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`Graph PUT /content → ${resp.status}: ${body}`);
    }
    return resp.json();
}

// ── User profile ───────────────────────────────────────────────────────────────

/**
 * Fetch the signed-in user's display name and email from Graph.
 * Used to pre-fill the assignee field when a user creates a task.
 * @returns {Promise<{ displayName: string, mail: string }>}
 */
export async function getCurrentUser() {
    const resp = await graphFetch("/me?$select=displayName,mail,userPrincipalName");
    return resp.json();
}
