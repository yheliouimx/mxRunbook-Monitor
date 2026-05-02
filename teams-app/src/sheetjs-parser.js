/**
 * sheetjs-parser.js — Client-side Excel parser using SheetJS (xlsx).
 *
 * Replaces the Python openpyxl adapter (adapter/parsers/excel_parser.py) for the
 * Teams tab context, where Node.js is not available.
 *
 * Input:  ArrayBuffer of an .xlsx file  +  a mapping config (same schema as mapping.yml)
 * Output: runbook JSON object (same schema as excel_parser.py output)
 *
 * Install: add `"xlsx": "^0.18.5"` to teams-app/package.json
 * Or load from CDN in index.html:
 *   <script src="https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js"></script>
 */

function getXLSX() {
    if (typeof window !== "undefined" && window.XLSX) return window.XLSX;
    // Node.js / bundled context
    if (typeof require !== "undefined") return require("xlsx");
    throw new Error(
        "SheetJS (xlsx) is not loaded. " +
        "Add <script src='https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js'> " +
        "to teams-app/index.html, or run: npm install xlsx"
    );
}

// Matches the DEFAULT_MAPPING in excel_parser.py
const DEFAULT_MAPPING = {
    columns: {
        task:          "task",
        status:        "status",
        startTime:     "startTime",
        endTime:       "endTime",
        item:          "item",
        assignee:      "assignee",
        startDate:     null,
        endDate:       null,
        actualStartTime: null,
        description:   null,
        parallelGroup: null,
        taskId:        null,
        system:        null,
        party:         null,
    },
    category_column:  null,
    default_category: "Tasks",
    status_mapping:   {},
    category_mapping: {},
    sheet:            null,
    runbook_date:     null,
};

/**
 * Parse an Excel ArrayBuffer into runbook JSON.
 *
 * @param {ArrayBuffer} buffer  — raw .xlsx file bytes
 * @param {object}      mapping — column mapping (same shape as mapping.yml)
 * @returns {object} runbook data keyed by category, matching adapter/schema.py output
 */
export function parseExcel(buffer, mapping = {}) {
    const XLSX = getXLSX();
    const m = { ...DEFAULT_MAPPING, ...mapping };
    const cols = { ...DEFAULT_MAPPING.columns, ...(m.columns || {}) };
    const catMapping = m.category_mapping || {};
    const statusMap  = m.status_mapping   || {};
    const catCol     = m.category_column;
    const defaultCat = m.default_category || "Tasks";

    const wb = XLSX.read(new Uint8Array(buffer), {
        type:       "array",
        cellDates:  true,   // parse date cells as JS Date objects
        cellNF:     false,
        cellStyles: false,
    });

    const wsName = m.sheet || wb.SheetNames[0];
    const ws = wb.Sheets[wsName];
    if (!ws) throw new Error(`Sheet '${wsName}' not found. Available: ${wb.SheetNames.join(", ")}`);

    // sheet_to_json with header:1 gives us raw rows (first row = headers)
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
    if (rawRows.length < 2) return {};

    const headers = rawRows[0].map(h => (h != null ? String(h).trim() : ""));
    const headerIdx = {};
    headers.forEach((h, i) => { if (h) headerIdx[h] = i; });

    // Validate category column exists
    if (catCol && !(catCol in headerIdx)) {
        const available = Object.keys(headerIdx).map(h => `'${h}'`).join(", ");
        throw new Error(
            `category_column '${catCol}' not found in sheet headers. ` +
            `Available: ${available}`
        );
    }

    const result = {};
    const anchorDate = m.runbook_date ? new Date(m.runbook_date) : null;

    for (let r = 1; r < rawRows.length; r++) {
        const row = rawRows[r];

        const get = (field) => {
            const colName = cols[field];
            if (!colName || !(colName in headerIdx)) return "";
            const val = row[headerIdx[colName]];
            if (val == null) return "";
            if (val instanceof Date) return _isoFromDate(val);
            return String(val).trim();
        };

        const getRaw = (field) => {
            const colName = cols[field];
            if (!colName || !(colName in headerIdx)) return null;
            return row[headerIdx[colName]];
        };

        const taskText = get("task").replace(/\n/g, " ").trim();
        if (!taskText) continue;

        // Category
        let category = defaultCat;
        if (catCol && catCol in headerIdx) {
            const rawCat = row[headerIdx[catCol]];
            const catStr = rawCat instanceof Date
                ? _formatCategoryDate(rawCat)
                : (rawCat != null ? String(rawCat).trim() : "");
            category = catMapping[catStr] || catStr || defaultCat;
        }

        // Status
        const rawStatus = get("status");
        const status = statusMap[rawStatus] || rawStatus || "Not Started";

        // Times — merge date + time columns when both are mapped
        const startDateRaw = getRaw("startDate");
        const endDateRaw   = getRaw("endDate");
        const taskStartAnchor = _rawToDate(startDateRaw) || anchorDate;
        const taskEndAnchor   = _rawToDate(endDateRaw)   || anchorDate;

        const startTime = _resolveTime(getRaw("startTime"), taskStartAnchor);
        const endTime   = _resolveTime(getRaw("endTime"),   taskEndAnchor);

        const descRaw = getRaw("description");
        const descText = descRaw != null ? String(descRaw).trim() : "";

        const task = {
            task:          taskText,
            status:        status,
            item:          get("item").replace(/\n/g, " ").trim() || null,
            assignee:      get("assignee").replace(/\n/g, " ").trim() || null,
            startTime:     startTime,
            endTime:       endTime,
            estimatedEnd:  endTime,
            taskId:        get("taskId").replace(/\n/g, " ").trim() || null,
            system:        get("system").replace(/\n/g, " ").trim() || null,
            party:         get("party").replace(/\n/g, " ").trim() || null,
            description:   descText || null,
            parallelGroup: get("parallelGroup").replace(/\n/g, " ").trim() || null,
        };

        result[category] = result[category] || [];
        result[category].push(task);
    }

    return result;
}

// ── Private date/time helpers (mirrors excel_parser.py logic) ─────────────────

function _isoFromDate(d) {
    if (!(d instanceof Date) || isNaN(d)) return null;
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
           `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function _rawToDate(val) {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val) ? null : val;
    if (typeof val === "string") {
        const d = new Date(val.trim());
        return isNaN(d) ? null : d;
    }
    return null;
}

function _resolveTime(val, anchor) {
    if (val == null) return null;
    if (val instanceof Date) {
        if (isNaN(val)) return null;
        // SheetJS may return a 1900-epoch date for time-only cells (day < 3)
        if (val.getFullYear() === 1899 || val.getFullYear() === 1900) {
            if (anchor) {
                const combined = new Date(anchor);
                combined.setHours(val.getHours(), val.getMinutes(), val.getSeconds());
                return _isoFromDate(combined);
            }
            const pad = (n) => String(n).padStart(2, "0");
            return `${pad(val.getHours())}:${pad(val.getMinutes())}:${pad(val.getSeconds())}`;
        }
        return _isoFromDate(val);
    }
    if (typeof val === "string") {
        const v = val.trim();
        if (!v || ["nan", "nat", "none", "null", "n/a", "tbd", "tbc", "-", "--"].includes(v.toLowerCase())) {
            return null;
        }
        const d = new Date(v);
        return isNaN(d) ? null : _isoFromDate(d);
    }
    return null;
}

function _formatCategoryDate(d) {
    const months = ["January","February","March","April","May","June",
                    "July","August","September","October","November","December"];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
