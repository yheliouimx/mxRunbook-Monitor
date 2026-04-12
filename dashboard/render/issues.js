import { state } from "../state.js";
import { ISSUE_STATUS, ISSUE_SEVERITY } from "../constants.js";
import { getCategoryNames, escapeHtml } from "../selectors.js";
import {
    getDefaultIssueTime,
    toggleIssueForm as doToggleIssueForm,
    saveIssue as doSaveIssue,
    closeIssue as doCloseIssue,
    reopenIssue as doReopenIssue,
    editIssue as doEditIssue,
    deleteIssue as doDeleteIssue,
} from "../actions/issues.js";

/**
 * Render the issues panel into #issuesPanel.
 */
export function renderIssues() {
    const panel = document.getElementById("issuesPanel");
    const openIssues = state.issues.filter(i => i.issueStatus === ISSUE_STATUS.ONGOING);
    const closedIssues = state.issues.filter(i => i.issueStatus === ISSUE_STATUS.CLOSED);
    const blockingOpen = openIssues.filter(i => i.severity === ISSUE_SEVERITY.BLOCKING).length;

    const catOptions = getCategoryNames().map(c =>
        `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`
    ).join("");

    panel.innerHTML = `
    <div class="issues-panel">
        <div class="issues-header" onclick="toggleIssuesPanel(this)">
            <h2>
                <span class="iss-chevron ${state.issuesPanelOpen !== false ? 'open' : ''}">&#9654;</span>
                \u26A0\uFE0F Issues Log
                <span class="issues-count">${openIssues.length} open${blockingOpen > 0 ? ' / ' + blockingOpen + ' blocking' : ''}</span>
            </h2>
            <button class="issue-btn save" onclick="event.stopPropagation(); toggleIssueForm()">
                ${state.issueFormOpen ? 'Cancel' : '+ Log Issue'}
            </button>
        </div>

        <div class="issue-add-form-wrapper ${state.issueFormOpen ? 'open' : ''}" id="issueFormWrapper">
        <div class="issue-add-form" id="issueForm">
            <div class="issue-form-row">
                <div class="issue-field" style="flex:2">
                    <label>Description</label>
                    <textarea id="if_desc" placeholder="Describe the issue...">${state.editingIssueId !== null ? escapeHtml(state.issues.find(i=>i.id===state.editingIssueId)?.description||'') : ''}</textarea>
                </div>
            </div>
            <div class="issue-form-row">
                <div class="issue-field">
                    <label>Phase / Category</label>
                    <select id="if_cat">
                        <option value="General">General</option>
                        ${catOptions}
                    </select>
                </div>
                <div class="issue-field">
                    <label>Severity</label>
                    <select id="if_sev">
                        <option value="${ISSUE_SEVERITY.BLOCKING}">\u{1F534} ${ISSUE_SEVERITY.BLOCKING}</option>
                        <option value="${ISSUE_SEVERITY.NON_BLOCKING}">\u{1F7E0} ${ISSUE_SEVERITY.NON_BLOCKING}</option>
                    </select>
                </div>
                <div class="issue-field">
                    <label>Status</label>
                    <select id="if_status">
                        <option value="${ISSUE_STATUS.ONGOING}">${ISSUE_STATUS.ONGOING}</option>
                        <option value="${ISSUE_STATUS.CLOSED}">${ISSUE_STATUS.CLOSED}</option>
                    </select>
                </div>
                <div class="issue-field">
                    <label>Time</label>
                    <input type="text" id="if_time" placeholder="HH:MM DD Mon" value="${state.editingIssueId !== null ? escapeHtml(state.issues.find(i=>i.id===state.editingIssueId)?.time||'') : getDefaultIssueTime()}" />
                </div>
            </div>
            <div class="issue-form-actions">
                <button class="issue-btn" onclick="toggleIssueForm()">Cancel</button>
                <button class="issue-btn save" onclick="saveIssue()">${state.editingIssueId !== null ? 'Update' : 'Add Issue'}</button>
            </div>
        </div>
        </div>

        <div id="issuesList" style="display:${state.issuesPanelOpen ? 'block' : 'none'}">
            ${state.issues.length === 0 ? '<div style="text-align:center;color:#555;padding:12px;font-size:0.85em">No issues logged yet</div>' : ''}
            ${state.issues.map(iss => `
                <div class="issue-card">
                    <div class="issue-severity ${iss.severity === ISSUE_SEVERITY.BLOCKING ? 'blocking' : 'non-blocking'}"></div>
                    <div class="issue-body">
                        <div class="issue-title-row">
                            <span class="issue-desc">${escapeHtml(iss.description)}</span>
                            <div class="issue-tags">
                                <span class="issue-tag ${iss.severity === ISSUE_SEVERITY.BLOCKING ? 'blocking' : 'non-blocking'}">${iss.severity}</span>
                                <span class="issue-tag ${iss.issueStatus === ISSUE_STATUS.ONGOING ? 'ongoing' : 'closed'}">${iss.issueStatus}</span>
                            </div>
                        </div>
                        <div class="issue-meta">
                            <span>\u{1F4C1} ${escapeHtml(iss.category)}</span>
                            <span>\u{1F552} ${iss.time}</span>
                        </div>
                        <div class="issue-actions">
                            ${iss.issueStatus === ISSUE_STATUS.ONGOING
                                ? '<button class="close-btn" onclick="closeIssue('+iss.id+')">\u2713 Close</button>'
                                : '<button class="reopen-btn" onclick="reopenIssue('+iss.id+')">\u21BA Reopen</button>'
                            }
                            <button onclick="editIssue(${iss.id})">\u270E Edit</button>
                            <button class="del-btn" onclick="deleteIssue(${iss.id})">\u2715 Delete</button>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    </div>
    `;

    // Restore select values if editing
    if (state.issueFormOpen && state.editingIssueId !== null) {
        const iss = state.issues.find(i => i.id === state.editingIssueId);
        if (iss) {
            const catSel = document.getElementById('if_cat');
            const sevSel = document.getElementById('if_sev');
            const stSel = document.getElementById('if_status');
            if (catSel) catSel.value = iss.category;
            if (sevSel) sevSel.value = iss.severity;
            if (stSel) stSel.value = iss.issueStatus;
            const timeFld = document.getElementById('if_time');
            if (timeFld) timeFld.value = iss.time || '';
        }
    }
}

export function toggleIssueForm() {
    doToggleIssueForm();
    renderIssues();
}

export function saveIssue(showToast) {
    const desc = document.getElementById('if_desc').value.trim();
    const cat = document.getElementById('if_cat').value;
    const sev = document.getElementById('if_sev').value;
    const st = document.getElementById('if_status').value;
    const timeInput = document.getElementById('if_time');
    const timeStr = timeInput && timeInput.value.trim() ? timeInput.value.trim() : '';

    const result = doSaveIssue({ desc, cat, sev, status: st, time: timeStr });
    if (!result.ok) { showToast(result.reason); return; }
    renderIssues();
    showToast('Issue saved');
}

export function closeIssue(id) {
    doCloseIssue(id);
    renderIssues();
}

export function reopenIssue(id) {
    doReopenIssue(id);
    renderIssues();
}

export function editIssue(id) {
    doEditIssue(id);
    renderIssues();
}

export function deleteIssue(id, showToast) {
    doDeleteIssue(id);
    renderIssues();
    showToast('Issue deleted');
}
