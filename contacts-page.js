const CONTACTS_APP_KEY = "royceCastleRecruitingStudio.v3";

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
  toast: document.querySelector("#toast")
};

let worksheetGroup = "d1";
let worksheetContacts = loadWorksheetContacts();

initContactsPage();

function initContactsPage() {
  renderMetrics();
  populateDivisionFilter();
  renderWorksheet();
  bindContactsPageEvents();
  refreshWorksheetIcons();
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
    .sort((a, b) => String(a[sortKey] || "").localeCompare(String(b[sortKey] || "")));
}

function renderWorksheet() {
  const rows = visibleRows();
  pageRefs.summary.textContent = `Showing ${rows.length.toLocaleString()} ${worksheetLabel()} row${rows.length === 1 ? "" : "s"}.`;
  pageRefs.body.innerHTML = rows.length
    ? rows.map(renderRow).join("")
    : `<tr><td colspan="14"><div class="empty-state">No contacts match the current filters.</div></td></tr>`;
  refreshWorksheetIcons();
}

function renderRow(row) {
  const emails = [row.headEmail, row.assistantEmail].filter(Boolean);
  const links = [
    row.athleticsUrl ? `<a href="${escapeAttr(row.athleticsUrl)}" target="_blank" rel="noreferrer">Athletics</a>` : "",
    row.staffDirectoryUrl ? `<a href="${escapeAttr(row.staffDirectoryUrl)}" target="_blank" rel="noreferrer">Staff directory</a>` : ""
  ].filter(Boolean);
  return `
    <tr>
      <td>
        <strong>${escapeHtml(row.displayName || row.school)}</strong>
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
      <td>
        <span>${row.sentAt ? `Sent ${escapeHtml(formatDate(row.sentAt))}` : "Not sent"}</span>
        <span>${row.respondedAt ? `Reply ${escapeHtml(formatDate(row.respondedAt))}` : "No reply logged"}</span>
      </td>
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

function worksheetLabel() {
  if (worksheetGroup === "d1") return "D1";
  if (worksheetGroup === "juco") return "JUCO / two-year";
  return "D2 / NAIA / other";
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
    "respondedAt"
  ];
  const csv = [headers.join(",")]
    .concat(rows.map((row) => headers.map((header) => csvCell(row[header] || "")).join(",")))
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
