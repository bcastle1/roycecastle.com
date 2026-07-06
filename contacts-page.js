const CONTACTS_APP_KEY = "royceCastleRecruitingStudio.v3";
const EMAIL_HISTORY_KEY = "royceCastleRecruitingStudio.emailHistory.v1";

const pageRefs = {
  body: document.querySelector("#page-contacts-body"),
  search: document.querySelector("#page-contact-search"),
  sort: document.querySelector("#page-contact-sort"),
  division: document.querySelector("#page-division-filter"),
  summary: document.querySelector("#table-summary"),
  total: document.querySelector("#count-total"),
  d1: document.querySelector("#count-d1"),
  juco: document.querySelector("#count-juco"),
  other: document.querySelector("#count-other"),
  historyModal: document.querySelector("#history-modal"),
  historyTitle: document.querySelector("#history-title"),
  historyBody: document.querySelector("#history-body"),
  closeHistory: document.querySelector("#close-history"),
  toast: document.querySelector("#toast")
};

let worksheetGroup = "d1";
let worksheetContacts = loadWorksheetContacts();
let activeHistoryContactId = "";

initContactsPage();

async function initContactsPage() {
  await syncServerState();
  renderMetrics();
  populateDivisionFilter();
  renderWorksheet();
  bindContactsPageEvents();
  refreshWorksheetIcons();
}

async function syncServerState() {
  try {
    const response = await fetch("api/admin.php?action=state", { credentials: "same-origin" });
    if (!response.ok) return;
    const state = await response.json();
    if (Array.isArray(state.emailHistory)) localStorage.setItem(EMAIL_HISTORY_KEY, JSON.stringify(state.emailHistory));
  } catch {
    // Static hosting keeps using browser-local history.
  }
}

function bindContactsPageEvents() {
  document.querySelectorAll(".worksheet-tabs button").forEach((button) => {
    button.addEventListener("click", () => {
      worksheetGroup = button.dataset.group;
      document.querySelectorAll(".worksheet-tabs button").forEach((tab) => tab.classList.toggle("active", tab === button));
      pageRefs.division.value = "";
      populateDivisionFilter();
      renderWorksheet();
    });
  });

  pageRefs.search.addEventListener("input", renderWorksheet);
  pageRefs.sort.addEventListener("change", renderWorksheet);
  pageRefs.division.addEventListener("change", renderWorksheet);
  pageRefs.body.addEventListener("click", (event) => {
    const historyButton = event.target.closest("[data-history-contact]");
    if (historyButton) openHistory(historyButton.dataset.historyContact);
  });
  pageRefs.closeHistory.addEventListener("click", closeHistory);
  pageRefs.historyModal.addEventListener("click", (event) => {
    if (event.target === pageRefs.historyModal) closeHistory();
    const action = event.target.closest("[data-history-action]");
    if (!action) return;
    updateHistoryItem(action.dataset.historyId, action.dataset.historyAction);
  });
  document.querySelector("#export-page-contacts").addEventListener("click", exportVisibleContacts);
  document.querySelector("#reset-page-contacts").addEventListener("click", () => {
    if (!confirm("Reload the expanded starter contact database for this browser? Sent/reply status saved in this browser will be cleared.")) return;
    worksheetContacts = defaultContacts();
    const saved = loadAppState();
    saved.contacts = worksheetContacts;
    localStorage.setItem(CONTACTS_APP_KEY, JSON.stringify(saved));
    renderMetrics();
    populateDivisionFilter();
    renderWorksheet();
    toast("Starter worksheet data reloaded.");
  });
}

function loadWorksheetContacts() {
  const saved = loadAppState();
  const defaults = defaultContacts();
  if (Array.isArray(saved.contacts) && saved.contacts.length >= Math.min(defaults.length, 300)) {
    return saved.contacts;
  }
  saved.contacts = defaults;
  localStorage.setItem(CONTACTS_APP_KEY, JSON.stringify(saved));
  return defaults;
}

function loadAppState() {
  try {
    return JSON.parse(localStorage.getItem(CONTACTS_APP_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function defaultContacts() {
  return Array.isArray(window.RECRUITING_CONTACTS) ? window.RECRUITING_CONTACTS.map((row) => ({ ...row })) : [];
}

function renderMetrics() {
  pageRefs.total.textContent = worksheetContacts.length.toLocaleString();
  pageRefs.d1.textContent = worksheetContacts.filter((row) => row.group === "d1").length.toLocaleString();
  pageRefs.juco.textContent = worksheetContacts.filter((row) => row.group === "juco").length.toLocaleString();
  pageRefs.other.textContent = worksheetContacts.filter((row) => row.group === "other").length.toLocaleString();
}

function populateDivisionFilter() {
  const divisions = [...new Set(worksheetContacts.filter((row) => row.group === worksheetGroup).map((row) => row.division).filter(Boolean))].sort();
  pageRefs.division.innerHTML = `<option value="">All divisions in worksheet</option>${divisions
    .map((division) => `<option value="${escapeAttr(division)}">${escapeHtml(division)}</option>`)
    .join("")}`;
}

function visibleRows() {
  const query = pageRefs.search.value.trim().toLowerCase();
  const division = pageRefs.division.value;
  const sortKey = pageRefs.sort.value;
  return worksheetContacts
    .filter((row) => row.group === worksheetGroup)
    .filter((row) => !division || row.division === division)
    .filter((row) => {
      if (!query) return true;
      return [
        row.school,
        row.displayName,
        row.state,
        row.division,
        row.conference,
        row.ranking,
        row.headCoach,
        row.assistantCoach,
        row.headEmail,
        row.assistantEmail,
        row.phone,
        row.scholarshipNote,
        row.sourceStatus
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => String(sortValue(a, sortKey) || "").localeCompare(String(sortValue(b, sortKey) || "")));
}

function renderWorksheet() {
  const rows = visibleRows();
  pageRefs.summary.textContent = `Showing ${rows.length.toLocaleString()} ${worksheetLabel()} row${rows.length === 1 ? "" : "s"}.`;
  pageRefs.body.innerHTML = rows.length
    ? rows.map(renderRow).join("")
    : `<tr><td colspan="17"><div class="empty-state">No contacts match the current filters.</div></td></tr>`;
  refreshWorksheetIcons();
}

function renderRow(row) {
  const emails = [row.headEmail, row.assistantEmail].filter(Boolean);
  const history = emailHistoryFor(row.id);
  const links = [
    row.athleticsUrl ? `<a href="${escapeAttr(row.athleticsUrl)}" target="_blank" rel="noreferrer">Athletics</a>` : "",
    row.staffDirectoryUrl ? `<a href="${escapeAttr(row.staffDirectoryUrl)}" target="_blank" rel="noreferrer">Staff directory</a>` : ""
  ].filter(Boolean);
  return `
    <tr>
      <td>
        <span class="item-title">${escapeHtml(row.displayName || row.school)}</span>
        <span>${escapeHtml(row.school || "")}</span>
      </td>
      <td>${escapeHtml(row.state || "")}</td>
      <td>${escapeHtml(row.division || "")}</td>
      <td>${escapeHtml(row.conference || "")}</td>
      <td>${escapeHtml(row.ranking || "2025-26: verify")}</td>
      <td>${escapeHtml(row.headCoach || "Verify current head coach")}</td>
      <td>${escapeHtml(row.assistantCoach || "Verify recruiting contact")}</td>
      <td>${emails.length ? emails.map((email) => `<span>${escapeHtml(email)}</span>`).join("") : "<em>Verify on staff page</em>"}</td>
      <td>${escapeHtml(row.phone || "")}</td>
      <td>${escapeHtml(row.scholarshipNote || "")}</td>
      <td>${links.join("") || "<em>Research link</em>"}</td>
      <td>${renderHistorySummary(history[0])}</td>
      <td>${renderHistorySummary(history[1])}</td>
      <td>${renderHistorySummary(history[2])}</td>
      <td>${renderHistoryButton(row, history.length)}</td>
      <td>${escapeHtml(row.sourceStatus || "")}</td>
      <td>
        <a class="secondary-button compact" href="admin/?select=${escapeAttr(row.id)}#campaign">
          <i data-lucide="send"></i>
          Draft
        </a>
      </td>
    </tr>
  `;
}

function renderHistorySummary(item) {
  if (!item) return "<em>No email logged</em>";
  return `
    <span>${escapeHtml(formatDate(item.sentAt))}</span>
    <em>${escapeHtml(item.status || "Sent")}</em>
    ${item.respondedAt ? `<em>Reply ${escapeHtml(formatDate(item.respondedAt))}</em>` : ""}
    ${item.viewedAt || item.openedAt ? `<em>Opened ${escapeHtml(formatDate(item.viewedAt || item.openedAt))}${item.openCount ? ` (${escapeHtml(item.openCount)}x)` : ""}</em>` : ""}
  `;
}

function renderHistoryButton(row, count) {
  return `
    <button class="ghost-button compact history-button" type="button" data-history-contact="${escapeAttr(row.id)}">
      <i data-lucide="history"></i>
      History (${count})
    </button>
  `;
}

function sortValue(row, sortKey) {
  if (sortKey === "sentAt") return emailHistoryFor(row.id)[0]?.sentAt || row.sentAt || "";
  return row[sortKey];
}

function worksheetLabel() {
  if (worksheetGroup === "d1") return "D1";
  if (worksheetGroup === "juco") return "JUCO / two-year";
  return "D2 / NAIA / other";
}

function openHistory(contactId) {
  activeHistoryContactId = contactId;
  const row = worksheetContacts.find((contact) => contact.id === contactId);
  const history = emailHistoryFor(contactId);
  pageRefs.historyTitle.textContent = `${row?.displayName || row?.school || "School"} Email History`;
  pageRefs.historyBody.innerHTML = history.length
    ? `<div class="history-list">${history.map(renderHistoryEntry).join("")}</div>`
    : `<div class="empty-state">No saved emails for this school yet. Mark a draft sent or run a campaign from the admin page to start the history.</div>`;
  pageRefs.historyModal.hidden = false;
  refreshWorksheetIcons();
}

function closeHistory() {
  pageRefs.historyModal.hidden = true;
}

function renderHistoryEntry(item) {
  return `
    <article class="history-entry">
      <div class="history-meta">
        <span class="item-title">${escapeHtml(item.subject || "Recruiting email")}</span>
        <span>To: ${escapeHtml(item.email || "No recipient saved")}</span>
        <span>Sent: ${escapeHtml(formatDateTime(item.sentAt))} | Status: ${escapeHtml(item.status || "Sent")}</span>
        <span>Responded: ${item.respondedAt ? escapeHtml(formatDateTime(item.respondedAt)) : "No response marked"}</span>
        <span>Opened: ${item.viewedAt || item.openedAt ? escapeHtml(formatDateTime(item.viewedAt || item.openedAt)) : "Not opened yet"}${item.openCount ? ` (${escapeHtml(item.openCount)} total)` : ""}</span>
      </div>
      <pre>${escapeHtml(item.body || "")}</pre>
      <div class="history-actions">
        <button class="ghost-button compact" type="button" data-history-action="responded" data-history-id="${escapeAttr(item.id)}">
          <i data-lucide="message-square-reply"></i>
          Mark Responded
        </button>
        <button class="ghost-button compact" type="button" data-history-action="viewed" data-history-id="${escapeAttr(item.id)}">
          <i data-lucide="eye"></i>
          Mark Viewed
        </button>
      </div>
    </article>
  `;
}

function updateHistoryItem(historyId, action) {
  const history = loadEmailHistory();
  const item = history.find((entry) => entry.id === historyId);
  if (!item) return;
  if (action === "responded") item.respondedAt = new Date().toISOString();
  if (action === "viewed") item.viewedAt = new Date().toISOString();
  saveEmailHistory(history);
  openHistory(activeHistoryContactId);
  renderWorksheet();
  toast(action === "responded" ? "Response marked." : "View marked.");
}

function emailHistoryFor(contactId) {
  return loadEmailHistory()
    .filter((item) => item.contactId === contactId)
    .sort((a, b) => new Date(b.sentAt || 0) - new Date(a.sentAt || 0));
}

function loadEmailHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(EMAIL_HISTORY_KEY) || "[]");
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

function saveEmailHistory(history) {
  localStorage.setItem(EMAIL_HISTORY_KEY, JSON.stringify(history.slice(0, 500)));
}

function exportVisibleContacts() {
  const rows = visibleRows();
  const headers = [
    "group",
    "school",
    "displayName",
    "state",
    "division",
    "conference",
    "ranking",
    "headCoach",
    "assistantCoach",
    "headEmail",
    "assistantEmail",
    "phone",
    "scholarshipNote",
    "athleticsUrl",
    "staffDirectoryUrl",
    "sourceStatus",
    "sentAt",
    "respondedAt",
    "lastEmail1",
    "lastEmail2",
    "lastEmail3",
    "emailHistoryCount"
  ];
  const csv = [headers.join(",")]
    .concat(
      rows.map((row) => {
        const history = emailHistoryFor(row.id);
        const enriched = {
          ...row,
          lastEmail1: history[0]?.sentAt || "",
          lastEmail2: history[1]?.sentAt || "",
          lastEmail3: history[2]?.sentAt || "",
          emailHistoryCount: history.length
        };
        return headers.map((header) => csvCell(enriched[header] || "")).join(",");
      })
    )
    .join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv" }), `royce-castle-${worksheetGroup}-contacts.csv`);
}

function csvCell(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function toast(message) {
  pageRefs.toast.textContent = message;
  pageRefs.toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => pageRefs.toast.classList.remove("show"), 2600);
}

function refreshWorksheetIcons() {
  if (window.lucide) window.lucide.createIcons();
}
