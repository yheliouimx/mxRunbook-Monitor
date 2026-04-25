import { RESERVED_KEYS } from "./constants.js";

// ── Validation (mirrors adapter/schema.py) ──

/**
 * Validate a parsed runbook object against the schema contract.
 * Returns an array of error strings (empty = valid).
 */
export function validate(data) {
    const errors = [];
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        return ["Root must be a JSON object"];
    }
    for (const key of Object.keys(data)) {
        if (key.startsWith("_")) continue; // reserved keys are free-form
        const value = data[key];
        if (!Array.isArray(value)) {
            errors.push(`Category '${key}' must be an array, got ${typeof value}`);
            continue;
        }
        for (let i = 0; i < value.length; i++) {
            const task = value[i];
            if (!task || typeof task !== "object" || Array.isArray(task)) {
                errors.push(`'${key}[${i}]' must be an object`);
                continue;
            }
            if (!("task" in task)) {
                errors.push(`'${key}[${i}]' missing required field 'task'`);
            }
            if (!("status" in task)) {
                errors.push(`'${key}[${i}]' missing required field 'status'`);
            }
        }
    }
    return errors;
}

// ── Normalization ──

/**
 * Normalize optional fields on every task so the UI always
 * receives a stable shape. Mutates in place, returns data.
 */
export function normalize(data) {
    for (const key of Object.keys(data)) {
        if (key.startsWith("_")) continue;
        const tasks = data[key];
        if (!Array.isArray(tasks)) continue;
        for (const t of tasks) {
            if (typeof t !== "object" || t === null) continue;
            if (t.item == null)      t.item = "";
            if (t.assignee == null)  t.assignee = "";
            // Time fields: coerce null→"" and guard against non-ISO strings
            // that would cause new Date(val) to return Invalid Date and crash renders
            for (const tf of ["startTime", "endTime", "estimatedEnd", "actualStartTime"]) {
                if (t[tf] == null) {
                    t[tf] = "";
                } else if (t[tf] !== "" && isNaN(new Date(t[tf]))) {
                    console.warn(`[runbook] Task '${t.task}': invalid date string in '${tf}': '${t[tf]}' — clearing`);
                    t[tf] = "";
                }
            }
            // v2 fields — ensure stable shape even on older runbook files
            if (t.taskId    == null) t.taskId    = "";
            if (t.system    == null) t.system    = "";
            if (t.party     == null) t.party     = "";
            if (t.comment   == null) t.comment   = "";
        }
    }
    return data;
}

// ── User-facing error formatting ──

/**
 * Turn a raw errors array into a short toast-friendly message.
 * Shows up to 3 errors; if more, appends a count.
 */
export function formatErrors(errors) {
    if (!errors || errors.length === 0) return "";
    const MAX = 3;
    const shown = errors.slice(0, MAX).join("; ");
    if (errors.length > MAX) {
        return shown + ` (+${errors.length - MAX} more)`;
    }
    return shown;
}

/**
 * Validate, then normalize. Returns { errors, data }.
 * If errors is non-empty, data is unchanged (not normalized).
 */
export function validateAndNormalize(data) {
    const errors = validate(data);
    if (errors.length > 0) {
        return { errors, data };
    }
    return { errors: [], data: normalize(data) };
}
