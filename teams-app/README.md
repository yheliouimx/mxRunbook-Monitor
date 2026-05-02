# MX Runbook Monitor — Microsoft Teams Tab

This folder contains the Teams tab shell for MX Runbook Monitor.
The shared `dashboard/` module tree (task logic, rendering, state) is reused verbatim.
Only the file I/O layer is replaced: Electron IPC → Graph API calls.

See `Tasks/teams_deployment.md` for the full backlog and implementation order.

---

## Folder structure

```
teams-app/
├── manifest/
│   ├── manifest.json     ← Teams app manifest (fill in placeholders before deploying)
│   ├── color.png         ← 192×192 app icon  (create from assets/icon.png)
│   └── outline.png       ← 32×32 monochrome icon
├── src/
│   ├── auth.js           ← Azure AD / MSAL authentication
│   ├── graph.js          ← Microsoft Graph API file read/write
│   ├── sheetjs-parser.js ← Client-side Excel parser (replaces Python openpyxl)
│   └── teams-bridge.js   ← Teams JS SDK: theme sync, user context, tab config
├── index.html            ← Teams tab shell (loads shared dashboard/ modules)
├── config.html           ← Configurable tab setup page (channel owner file picker)
├── auth-end.html         ← MSAL auth popup redirect callback
├── package.json
└── README.md             ← you are here
```

---

## Prerequisites

| Tool | Purpose |
|------|---------|
| Azure subscription | Hosting (Azure Static Web Apps, free tier) |
| Azure AD (Entra ID) | App registration for Graph API auth |
| Teams admin access | Sideload or publish the tab app |
| Node.js ≥ 18 | Local development server |

---

## Step 1 — Azure AD app registration

1. Go to **Azure Portal → Microsoft Entra ID → App registrations → New registration**
2. Name: `MX Runbook Monitor`
3. Supported account types: *Single tenant* (or *Multi-tenant* for org-wide rollout)
4. Redirect URI: `Single-page application` →
   `https://YOUR_APP_DOMAIN/teams-app/auth-end.html`
5. After creation, note the **Application (client) ID** and **Directory (tenant) ID**
6. **API permissions** → Add:
   - `Files.ReadWrite` (delegated)
   - `Sites.ReadWrite.All` (delegated)
   - `User.Read` (delegated)
   → Grant admin consent
7. **Expose an API** → Add a scope:
   - Application ID URI: `api://YOUR_APP_DOMAIN/CLIENT_ID`
   - Scope name: `access_as_user`
   - Who can consent: Admins and users

---

## Step 2 — Fill in placeholders

Replace all `{{PLACEHOLDER}}` tokens in these files:

| File | Placeholder | Value |
|------|-------------|-------|
| `manifest/manifest.json` | `{{YOUR_APP_DOMAIN}}` | e.g. `mxrunbook.azurestaticapps.net` |
| `manifest/manifest.json` | `{{AAD_APP_CLIENT_ID}}` | Azure AD client ID (GUID) |
| `src/auth.js` | `{{AAD_APP_CLIENT_ID}}` | same GUID |
| `src/auth.js` | `{{TENANT_ID}}` | Azure AD tenant ID or `common` |
| `src/auth.js` | `{{YOUR_APP_DOMAIN}}` | same domain |
| `auth-end.html` | `{{AAD_APP_CLIENT_ID}}` | same GUID |

---

## Step 3 — Static hosting

### Option A — Azure Static Web Apps (recommended)

```bash
# Install Azure Static Web Apps CLI
npm install -g @azure/static-web-apps-cli

# Login and create the SWA resource
az login
az staticwebapp create --name mxrunbook --resource-group myRG --location westeurope

# Deploy (from project root — serves dashboard/ relative to teams-app/)
swa deploy . --app-location . --output-location .
```

The free tier includes a `*.azurestaticapps.net` domain with HTTPS — no custom domain needed
for an internal tool.

### Option B — GitHub Pages

Push the repo to GitHub and enable GitHub Pages (root of `main` branch).
The tab URL will be `https://your-org.github.io/mxRunbook-Monitor/teams-app/index.html`.

---

## Step 4 — Package and sideload in Teams

```bash
cd teams-app/manifest
# Replace icons with your own 192×192 and 32×32 PNG files
zip -r ../dist-teams/MXRunbook.zip manifest.json color.png outline.png
```

In Teams:
1. Go to **Apps → Manage your apps → Upload an app → Upload a custom app**
2. Select `dist-teams/MXRunbook.zip`
3. Add it as a personal app or to a channel

---

## Step 5 — Local development

```bash
cd teams-app
npm install         # installs optional xlsx npm package
npm run dev         # starts serve on http://localhost:3001
```

Open `http://localhost:3001/index.html` in a browser.
Auth will use the MSAL popup fallback (no Teams SDK available outside Teams client).
The file picker will open an OneDrive popup — sign in with your Microsoft account.

To test inside Teams:
1. Use **Teams Toolkit** (VS Code extension) or the **Developer Portal**
2. Set the content URL to your ngrok / Codespaces tunnel URL
3. Sideload the manifest zip

---

## OBO flow (Teams SSO → Graph token)

Teams SSO via `getAuthToken()` returns a token scoped to your app, not Graph directly.
To call Graph with it you need a server-side **On-Behalf-Of** exchange.

Minimal Azure Function (Node.js):

```javascript
// api/token/index.js
const { ConfidentialClientApplication } = require("@azure/msal-node");

const cca = new ConfidentialClientApplication({
    auth: {
        clientId:     process.env.AAD_CLIENT_ID,
        clientSecret: process.env.AAD_CLIENT_SECRET,
        authority:    `https://login.microsoftonline.com/${process.env.AAD_TENANT_ID}`,
    },
});

module.exports = async function (context, req) {
    const { token } = req.body;
    const result = await cca.acquireTokenOnBehalfOf({
        oboAssertion: token,
        scopes: ["https://graph.microsoft.com/Files.ReadWrite",
                 "https://graph.microsoft.com/Sites.ReadWrite.All"],
    });
    context.res = { body: { access_token: result.accessToken } };
};
```

Set `OBO_ENDPOINT` in `src/auth.js` to this function's URL.
Add `AAD_CLIENT_ID`, `AAD_CLIENT_SECRET`, `AAD_TENANT_ID` as environment variables.

For simpler internal deployments: skip Teams SSO and use MSAL popup auth only
(delete the Teams SSO path in `auth.js`). Users sign in via a popup once per session.

---

## Relationship to other distributions

| Distribution | Entry point | File I/O | Parser |
|---|---|---|---|
| Standalone HTML | `runbookDashboard.html` | local filesystem (drag-drop / paste JSON) | Python openpyxl (external) |
| Electron desktop | `electron-main.js` | Electron IPC + local filesystem | Python openpyxl |
| **Teams tab** | `teams-app/index.html` | Graph API (OneDrive/SharePoint) | SheetJS (client-side) |

The `dashboard/` folder (state, actions, render, selectors) is shared and unchanged
across all three distributions.
