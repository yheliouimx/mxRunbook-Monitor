/**
 * auth.js — Azure AD authentication for the Teams tab.
 *
 * Two modes:
 *   1. Teams SSO (preferred when running inside Teams client):
 *      microsoftTeams.authentication.getAuthToken() returns a token scoped to your app.
 *      This must be exchanged for a Graph token via an On-Behalf-Of (OBO) server endpoint.
 *      See README.md § "OBO flow" for the minimal Azure Function needed.
 *
 *   2. MSAL interactive fallback (standalone browser / local dev):
 *      Standard MSAL.js popup login — no backend required.
 *      Use this path for development and testing outside Teams.
 *
 * Azure AD app registration checklist (do this once in Azure Portal):
 *   □ Platform: Single-page application
 *   □ Redirect URI: https://{{YOUR_APP_DOMAIN}}/teams-app/auth-end.html
 *   □ Expose an API: api://{{YOUR_APP_DOMAIN}}/{{AAD_APP_CLIENT_ID}} → scope "access_as_user"
 *   □ Delegated permissions: Files.ReadWrite, Sites.ReadWrite.All, User.Read
 *   □ Grant admin consent for delegated permissions
 */

const CLIENT_ID  = "{{AAD_APP_CLIENT_ID}}";   // replace with your Azure AD app client ID
const TENANT_ID  = "{{TENANT_ID}}";           // replace with your Azure AD tenant ID, or "common"
const APP_DOMAIN = "{{YOUR_APP_DOMAIN}}";     // e.g. "mxrunbook.azurestaticapps.net"

// OBO exchange endpoint (your own Azure Function / backend — see README)
const OBO_ENDPOINT = "{{OBO_EXCHANGE_URL}}";  // e.g. "https://mxrunbook-api.azurewebsites.net/api/token"

const GRAPH_SCOPES = ["Files.ReadWrite", "Sites.ReadWrite.All", "User.Read"];

const MSAL_CONFIG = {
    auth: {
        clientId: CLIENT_ID,
        authority: `https://login.microsoftonline.com/${TENANT_ID}`,
        redirectUri: `https://${APP_DOMAIN}/teams-app/auth-end.html`,
    },
    cache: { cacheLocation: "sessionStorage", storeAuthStateInCookie: false },
};

let _msalInstance = null;
let _graphToken   = null;

/**
 * Acquire a Microsoft Graph API access token.
 * Tries Teams SSO first; falls back to MSAL interactive popup.
 * Result is cached for the session (token will be refreshed silently by MSAL).
 */
export async function getAccessToken() {
    if (_graphToken && !_isTokenExpired(_graphToken)) return _graphToken;

    // --- Path 1: Teams SSO ---
    if (_isInTeams()) {
        try {
            const teamsToken = await _acquireTeamsToken();

            if (OBO_EXCHANGE_URL !== "{{OBO_EXCHANGE_URL}}") {
                // Exchange via backend OBO flow → Graph token
                const resp = await fetch(OBO_ENDPOINT, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token: teamsToken }),
                });
                if (!resp.ok) throw new Error("OBO exchange failed: " + resp.status);
                const { access_token } = await resp.json();
                _graphToken = access_token;
                return _graphToken;
            }
            // No OBO endpoint configured → use Teams token directly (only works if
            // Graph permissions are consented at the app level with .default scope)
            _graphToken = teamsToken;
            return _graphToken;
        } catch (err) {
            console.warn("[auth] Teams SSO failed, falling back to MSAL popup:", err.message);
        }
    }

    // --- Path 2: MSAL interactive (standalone browser / dev) ---
    const msal = await _getMsal();
    try {
        const accounts = msal.getAllAccounts();
        if (accounts.length > 0) {
            const resp = await msal.acquireTokenSilent({ scopes: GRAPH_SCOPES, account: accounts[0] });
            _graphToken = resp.accessToken;
        } else {
            throw new Error("no accounts");
        }
    } catch {
        const resp = await msal.loginPopup({ scopes: GRAPH_SCOPES });
        _graphToken = resp.accessToken;
    }
    return _graphToken;
}

/** Force sign-out (clears cached tokens). */
export function signOut() {
    _graphToken = null;
    if (_msalInstance) {
        const accounts = _msalInstance.getAllAccounts();
        if (accounts.length > 0) _msalInstance.logout({ account: accounts[0] });
    }
}

// ── Private helpers ────────────────────────────────────────────────────────────

function _isInTeams() {
    return typeof window !== "undefined" && !!window.microsoftTeams;
}

function _acquireTeamsToken() {
    return new Promise((resolve, reject) => {
        window.microsoftTeams.authentication.getAuthToken({
            successCallback: resolve,
            failureCallback: (err) => reject(new Error(err)),
        });
    });
}

async function _getMsal() {
    if (_msalInstance) return _msalInstance;
    if (!window.msal) {
        await _loadScript("https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js");
    }
    _msalInstance = new window.msal.PublicClientApplication(MSAL_CONFIG);
    await _msalInstance.initialize();
    return _msalInstance;
}

function _isTokenExpired(token) {
    try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        return Date.now() / 1000 > payload.exp - 60; // 60s buffer
    } catch {
        return true;
    }
}

function _loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error("Failed to load: " + src));
        document.head.appendChild(s);
    });
}
