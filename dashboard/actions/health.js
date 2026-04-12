import { state } from "../state.js";

/**
 * Set the go-live health status.
 * Persists to runbookData._health for round-tripping.
 * @param {"Green"|"Amber"|"Red"} status
 */
export function setHealth(status) {
    state.healthStatus = status;
    state.runbookData._health = status;
}
