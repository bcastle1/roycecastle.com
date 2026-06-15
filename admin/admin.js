const ADMIN_CODE_KEY = "royceCastleRecruitingStudio.adminCode.v1";
const ADMIN_SESSION_KEY = "royceCastleRecruitingStudio.adminUnlocked.v1";
const ADMIN_SETTINGS_KEY = "royceCastleRecruitingStudio.adminSettings.v1";
const PUBLIC_MESSAGES_KEY = "royceCastleRecruitingStudio.publicMessages.v1";
const RUN_LOG_KEY = "royceCastleRecruitingStudio.runLog.v1";
const EMAIL_HISTORY_KEY = "royceCastleRecruitingStudio.emailHistory.v1";
const PUBLIC_SITE_ORIGIN = "https://roycecastle.com";

const contacts = Array.isArray(window.RECRUITING_CONTACTS) ? window.RECRUITING_CONTACTS : [];
const contactsWithEmail = contacts.filter((contact) => contact.headEmail || contact.assistantEmail);
const defaultSettings = {
  forwardEmail: "erik@puricloud.com",
  fromEmail: "erik@puricloud.com",
  ccEmail: "",
  frequency: "manual",
  day: "Monday",
  time: "09:00",
  delaySeconds: 4,
  openDrafts: false,
  emailTemplate: defaultEmailTemplate()
};

let settings = loadSettings();
let selectedContactIds = new Set();
const requestedContactId = new URLSearchParams(location.search).get("select");
let currentContactId = contactsWithEmail.some((contact) => contact.id === requestedContactId)
  ? requestedContactId
  : contactsWithEmail.find((contact) => contact.id === "d1-byu-cougars")?.id || contactsWithEmail[0]?.id || "";
let visibleContacts = [];
let runTimer = null;
let runState = { active: false, total: 0, sent: 0 };

const refs = {};

initAdmin();

function initAdmin() {
  collectRefs();
  bindLogin();
  if (sessionStorage.getItem(ADMIN_SESSION_KEY) === "true") unlockAdmin();
  window.addEventListener("load", () => window.lucide?.createIcons());
  if (window.lucide) window.lucide.createIcons();
}

function collectRefs() {
  [
    "admin-login",
    "admin-app",
    "admin-login-form",
    "admin-login-code",
    "admin-login-error",
    "admin-lock",
    "metric-contacts",
    "metric-selected",
    "metric-messages",
    "metric-progress",
    "metric-run-label",
    "message-list",
    "clear-messages",
    "setting-forward",
    "setting-from",
    "setting-code",
    "setting-code-confirm",
    "save-settings",
    "admin-selected-school",
    "admin-selected-meta",
    "admin-to-email",
    "admin-cc-email",
    "admin-subject",
    "admin-email-template",
    "admin-email-body",
    "save-template",
    "reset-template",
    "admin-copy-email",
    "admin-open-email",
    "admin-mark-sent",
    "schedule-frequency",
    "schedule-day",
    "schedule-time",
    "schedule-delay",
    "manual-email",
    "open-drafts-during-run",
    "start-run",
    "save-schedule",
    "progress-panel",
    "progress-text",
    "progress-count",
    "progress-bar",
    "toggle-progress",
    "toggle-log",
    "run-log",
    "download-workbook",
    "admin-contact-search",
    "admin-contact-group",
    "select-visible",
    "clear-selected",
    "admin-contact-list",
    "admin-toast"
  ].forEach((id) => {
    refs[toCamel(id)] = document.querySelector(`#${id}`);
  });
}

function bindLogin() {
  refs.adminLoginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (refs.adminLoginCode.value === getAdminCode()) {
      sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
      refs.adminLoginError.hidden = true;
      unlockAdmin();
      return;
    }
    refs.adminLoginError.hidden = false;
  });
}

function unlockAdmin() {
  refs.adminLogin.hidden = true;
  refs.adminApp.hidden = false;
  hydrateSettings();
  bindAdminEvents();
  renderAll();
  toast("Admin unlocked.");
}

function bindAdminEvents() {
  if (bindAdminEvents.done) return;
  bindAdminEvents.done = true;

  refs.adminApp.addEventListener("click", handleAdminClick);
  refs.adminContactSearch.addEventListener("input", renderContacts);
  refs.adminContactGroup.addEventListener("change", renderContacts);
  refs.adminToEmail.addEventListener("input", () => {
    currentContactId = "";
  });
  refs.adminCcEmail.addEventListener("input", () => {
    settings.ccEmail = refs.adminCcEmail.value;
    persistSettings();
  });
  refs.adminEmailTemplate.addEventListener("input", updateEmailPreview);
}

function handleAdminClick(event) {
  const action = event.target.closest("button, a");
  if (!action) return;

  if (action.matches("[data-reply-message], [data-load-contact]")) return;

  switch (action.id) {
    case "admin-lock":
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      location.reload();
      break;
    case "save-settings":
      saveSettingsFromForm();
      break;
    case "clear-messages":
      clearMessages();
      break;
    case "admin-copy-email":
      copyDraft();
      break;
    case "admin-open-email":
      openMailDraft(currentEmailTarget());
      break;
    case "admin-mark-sent":
      markCurrentSent();
      break;
    case "save-template":
      saveTemplateFromEditor();
      break;
    case "reset-template":
      resetTemplate();
      break;
    case "start-run":
      startSendRun();
      break;
    case "save-schedule":
      saveSchedule();
      break;
    case "toggle-progress":
      refs.progressPanel.hidden = !refs.progressPanel.hidden;
      break;
    case "toggle-log":
      refs.runLog.hidden = !refs.runLog.hidden;
      renderRunLog();
      break;
    case "download-workbook":
      downloadWorkbookCsv();
      break;
    case "select-visible":
      visibleContacts.forEach((contact) => selectedContactIds.add(contact.id));
      renderAll();
      toast(`${visibleContacts.length} visible contacts selected.`);
      break;
    case "clear-selected":
      selectedContactIds.clear();
      renderAll();
      toast("Selected contacts cleared.");
      break;
    default:
      break;
  }
}

function hydrateSettings() {
  refs.settingForward.value = settings.forwardEmail;
  refs.settingFrom.value = settings.fromEmail;
  refs.scheduleFrequency.value = settings.frequency;
  refs.scheduleDay.value = settings.day;
  refs.scheduleTime.value = settings.time;
  refs.scheduleDelay.value = settings.delaySeconds;
  refs.openDraftsDuringRun.checked = !!settings.openDrafts;
  refs.adminCcEmail.value = settings.ccEmail || "";
}

function renderAll() {
  renderMetrics();
  renderMessages();
  renderComposer();
  renderContacts();
  renderRunLog();
  window.lucide?.createIcons();
}

function renderMetrics() {
  refs.metricContacts.textContent = contacts.length.toLocaleString();
  refs.metricSelected.textContent = selectedContactIds.size.toLocaleString();
  refs.metricMessages.textContent = loadMessages().length.toLocaleString();
  refs.metricProgress.textContent = runState.total ? `${Math.round((runState.sent / runState.total) * 100)}%` : "0%";
  refs.metricRunLabel.textContent = runState.active ? "Run in progress" : "Ready";
}

function renderMessages() {
  const messages = loadMessages();
  refs.messageList.innerHTML = messages.length
    ? messages
        .map(
          (message) => `
            <article class="message-item">
              <div>
                <strong>${escapeHtml(message.name || "Unknown sender")}</strong>
                <span>${escapeHtml(message.program || "Program not provided")} ${message.role ? `| ${escapeHtml(message.role)}` : ""}</span>
              </div>
              <p>${escapeHtml(message.body || "")}</p>
              <div class="message-actions">
                <small>${formatDateTime(message.createdAt)}</small>
                <button class="ghost-button compact" type="button" data-reply-message="${escapeAttr(message.id)}">
                  <i data-lucide="reply"></i>Reply
                </button>
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">No saved site messages in this browser yet.</div>`;

  refs.messageList.querySelectorAll("[data-reply-message]").forEach((button) => {
    button.addEventListener("click", () => {
      const message = messages.find((item) => item.id === button.dataset.replyMessage);
      if (!message) return;
      refs.adminToEmail.value = message.email || "";
      refs.adminSubject.value = `Re: Royce Castle recruiting`;
      refs.adminEmailBody.value = `Coach,\n\nThank you for reaching out about Royce Castle. I would be happy to send film, eligibility information, references, or schedule a call.\n\nBest,\nRoyce Castle Recruiting\n${settings.fromEmail}`;
      document.querySelector("#campaign").scrollIntoView({ behavior: "smooth" });
    });
  });
}

function renderComposer() {
  const contact = currentContact();
  renderTemplateEditor();
  if (contact) {
    refs.adminSelectedSchool.textContent = contact.displayName || contact.school || "Selected contact";
    refs.adminSelectedMeta.textContent = [contact.assistantCoach, contact.headCoach, contact.division, contact.conference].filter(Boolean).join(" | ");
    refs.adminToEmail.value = contactEmail(contact);
    refs.adminSubject.value = `Royce Castle | 6'5" Shooting Guard | Rigby High School 2024`;
    updateEmailPreview();
    return;
  }

  refs.adminSelectedSchool.textContent = "Manual email";
  refs.adminSelectedMeta.textContent = "Enter an address and edit the draft before sending.";
  if (!refs.adminSubject.value) refs.adminSubject.value = `Royce Castle | 6'5" Shooting Guard | Rigby High School 2024`;
  updateEmailPreview();
}

function renderContacts() {
  const query = refs.adminContactSearch.value.trim().toLowerCase();
  const group = refs.adminContactGroup.value;
  visibleContacts = contactsWithEmail
    .filter((contact) => !group || contact.group === group)
    .filter((contact) => {
      if (!query) return true;
      return [
        contact.displayName,
        contact.school,
        contact.state,
        contact.division,
        contact.conference,
        contact.headCoach,
        contact.assistantCoach,
        contact.headEmail,
        contact.assistantEmail
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .slice(0, 36);

  refs.adminContactList.innerHTML = visibleContacts
    .map(
      (contact) => `
        <article class="admin-contact-row ${contact.id === currentContactId ? "active" : ""}">
          <label class="check-row">
            <input type="checkbox" data-select-contact="${escapeAttr(contact.id)}" ${selectedContactIds.has(contact.id) ? "checked" : ""}>
            <span>
              <strong>${escapeHtml(contact.displayName || contact.school)}</strong>
              <small>${escapeHtml(contactEmail(contact) || "No email")} | ${escapeHtml(contact.division || "")}</small>
            </span>
          </label>
          <button class="ghost-button compact" type="button" data-load-contact="${escapeAttr(contact.id)}">Load Draft</button>
        </article>
      `
    )
    .join("");

  refs.adminContactList.querySelectorAll("[data-select-contact]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedContactIds.add(checkbox.dataset.selectContact);
      else selectedContactIds.delete(checkbox.dataset.selectContact);
      renderMetrics();
    });
  });

  refs.adminContactList.querySelectorAll("[data-load-contact]").forEach((button) => {
    button.addEventListener("click", () => {
      currentContactId = button.dataset.loadContact;
      renderAll();
      document.querySelector("#campaign").scrollIntoView({ behavior: "smooth" });
    });
  });
}

function saveSettingsFromForm() {
  const newCode = refs.settingCode.value.trim();
  const confirmCode = refs.settingCodeConfirm.value.trim();
  if (newCode || confirmCode) {
    if (newCode.length < 3) {
      toast("Admin code must be at least 3 characters.");
      return;
    }
    if (newCode !== confirmCode) {
      toast("Admin code confirmation did not match.");
      return;
    }
    localStorage.setItem(ADMIN_CODE_KEY, newCode);
    refs.settingCode.value = "";
    refs.settingCodeConfirm.value = "";
  }

  settings.forwardEmail = refs.settingForward.value.trim() || defaultSettings.forwardEmail;
  settings.fromEmail = refs.settingFrom.value.trim() || defaultSettings.fromEmail;
  persistSettings();
  toast("Settings saved.");
}

function saveSchedule() {
  settings.frequency = refs.scheduleFrequency.value;
  settings.day = refs.scheduleDay.value;
  settings.time = refs.scheduleTime.value;
  settings.delaySeconds = Math.max(1, Number(refs.scheduleDelay.value) || 4);
  settings.openDrafts = refs.openDraftsDuringRun.checked;
  persistSettings();
  logRun(`Auto-send schedule saved: ${settings.frequency}, ${settings.day} at ${settings.time}, ${settings.delaySeconds}s between contacts.`);
  renderRunLog();
  toast("Schedule saved successfully.");
}

function startSendRun() {
  if (runState.active) {
    toast("A send run is already active.");
    return;
  }
  settings.delaySeconds = Math.max(1, Number(refs.scheduleDelay.value) || 4);
  settings.openDrafts = refs.openDraftsDuringRun.checked;
  persistSettings();

  const targets = runTargets();
  if (!targets.length) {
    toast("Select contacts or enter a manual email first.");
    return;
  }

  refs.progressPanel.hidden = false;
  runState = { active: true, total: targets.length, sent: 0 };
  logRun(`Send run started for ${targets.length} recipient${targets.length === 1 ? "" : "s"}.`);
  updateProgress();
  toast("Send run started successfully.");

  const step = () => {
    const target = targets[runState.sent];
    if (!target) {
      runState.active = false;
      logRun("Send run complete.");
      updateProgress();
      toast("Send run complete.");
      return;
    }

    refs.adminToEmail.value = target.email;
    refs.adminSubject.value = target.subject;
    refs.adminEmailBody.value = target.body;
    logRun(`Prepared individualized draft for ${target.label} <${target.email}>.`);
    if (settings.openDrafts) openMailDraft(target, true);
    recordEmailHistory(target, settings.openDrafts ? "Draft opened" : "Prepared");
    runState.sent += 1;
    updateProgress();
    runTimer = setTimeout(step, settings.delaySeconds * 1000);
  };

  step();
}

function runTargets() {
  const selectedContacts = [...selectedContactIds].map((id) => contacts.find((contact) => contact.id === id)).filter(Boolean);
  const targets = selectedContacts.flatMap((contact) => {
    const email = contactEmail(contact);
    if (!email) return [];
    return [
      {
        contactId: contact.id,
        email,
        label: contact.displayName || contact.school,
        subject: `Royce Castle | 6'5" Shooting Guard | Rigby High School 2024`,
        body: buildEmail(contact)
      }
    ];
  });

  const manualEmail = refs.manualEmail.value.trim();
  if (manualEmail) {
    targets.push({
      email: manualEmail,
      label: "manual recipient",
      subject: refs.adminSubject.value,
      body: refs.adminEmailBody.value
    });
  }
  if (!targets.length && refs.adminToEmail.value.trim()) {
    targets.push({
      email: refs.adminToEmail.value.trim(),
      label: "current draft recipient",
      subject: refs.adminSubject.value,
      body: refs.adminEmailBody.value
    });
  }
  return targets;
}

function updateProgress() {
  const percent = runState.total ? Math.round((runState.sent / runState.total) * 100) : 0;
  refs.progressText.textContent = `${percent}%`;
  refs.progressCount.textContent = `${runState.sent} of ${runState.total}`;
  refs.progressBar.style.width = `${percent}%`;
  renderMetrics();
  renderRunLog();
}

async function copyDraft() {
  await navigator.clipboard.writeText(`${refs.adminSubject.value}\n\n${refs.adminEmailBody.value}`);
  toast("Draft copied.");
}

function openMailDraft(target = currentEmailTarget(), quiet = false) {
  if (!target.email) {
    toast("Add a recipient email first.");
    return;
  }
  const params = new URLSearchParams({
    cc: refs.adminCcEmail.value || "",
    subject: target.subject || refs.adminSubject.value,
    body: target.body || refs.adminEmailBody.value
  });
  window.open(`mailto:${target.email}?${params.toString()}`, "_blank");
  if (!quiet) toast("Draft opened in your mail app.");
}

function markCurrentSent() {
  const contact = currentContact();
  if (!contact) {
    toast("Manual draft marked ready.");
    return;
  }
  recordEmailHistory(
    {
      contactId: contact.id,
      email: refs.adminToEmail.value.trim() || contactEmail(contact),
      label: contact.displayName || contact.school,
      subject: refs.adminSubject.value,
      body: refs.adminEmailBody.value
    },
    "Sent"
  );
  logRun(`Marked sent for ${contact.displayName || contact.school}.`);
  selectedContactIds.delete(contact.id);
  renderAll();
  toast("Marked sent.");
}

function currentEmailTarget() {
  return {
    email: refs.adminToEmail.value.trim(),
    subject: refs.adminSubject.value,
    body: refs.adminEmailBody.value
  };
}

function currentContact() {
  return contacts.find((contact) => contact.id === currentContactId);
}

function contactEmail(contact) {
  return [contact.headEmail, contact.assistantEmail].filter(Boolean).join(", ");
}

function defaultEmailTemplate() {
  return `Coach {{coach_last_name}},

My name is Royce Castle. I am a {{height}} {{primary_role}} / {{secondary_role}} from {{high_school}} in Idaho, class of {{grad_year}}. I am reaching out because I am interested in the {{school_name}} men's basketball program and would be grateful for a chance to learn the best process for being evaluated by your staff.

On the court, I am a coachable, team-first guard who can stretch the floor with a jump shot and three-point shot, create for teammates as a playmaker, post smaller guards, rebound hard from the perimeter, and defend high-level assignments. In high school, opponents often game-planned their defense around limiting my scoring opportunities, and I was often asked to guard the other team's best player.

I try to bring lockdown defensive effort and high-motor workhorse energy every day. I do not use alcohol or drugs, take my health seriously, and would work to be a positive leader in the locker room and a strong representative of your program.

Would your staff prefer that I complete a questionnaire, send full game film, schedule a phone call, attend a tryout or camp, or continue the conversation by email? I am happy to provide references, eligibility information, stats, and additional video.

You can view my recruiting profile, highlight video, and action photo library here:
{{website_link}}

Quick reply option, no typing required:
{{quick_response_link}}

That link lets your staff choose highly interested, moderately interested, or still exploring fit, and it opens a prefilled response email.

Thank you for your time and consideration.

Sincerely,
Royce Castle
{{from_email}}`;
}

function renderTemplateEditor() {
  if (!refs.adminEmailTemplate || document.activeElement === refs.adminEmailTemplate) return;
  refs.adminEmailTemplate.innerHTML = highlightTemplate(settings.emailTemplate || defaultEmailTemplate());
}

function highlightTemplate(template) {
  return escapeHtml(template).replace(/(\{\{[a-z0-9_]+\}\})/gi, '<span class="template-token">$1</span>');
}

function templateEditorText() {
  return (refs.adminEmailTemplate?.innerText || "").replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function updateEmailPreview() {
  if (!refs.adminEmailBody) return;
  const template = document.activeElement === refs.adminEmailTemplate ? templateEditorText() : settings.emailTemplate || defaultEmailTemplate();
  refs.adminEmailBody.value = resolveTemplate(template, currentContact() || {});
}

function saveTemplateFromEditor() {
  const template = templateEditorText();
  if (!template) {
    toast("Add template text before saving.");
    return;
  }
  settings.emailTemplate = ensureRequiredEmailTemplate(template);
  persistSettings();
  renderTemplateEditor();
  updateEmailPreview();
  toast("Email template saved. Future drafts will use it.");
}

function resetTemplate() {
  settings.emailTemplate = defaultEmailTemplate();
  persistSettings();
  renderTemplateEditor();
  updateEmailPreview();
  toast("Email template reset.");
}

function resolveTemplate(template, contact) {
  const values = templateValues(contact);
  return String(template || defaultEmailTemplate()).replace(/\{\{([a-z0-9_]+)\}\}/gi, (_, key) => values[key] ?? "");
}

function templateValues(contact = {}) {
  return {
    coach_last_name: coachLastName(contact),
    school_name: contact.displayName || contact.school || "your program",
    website_link: `${PUBLIC_SITE_ORIGIN}/`,
    quick_response_link: buildQuickResponseLink(contact),
    height: `6'5"`,
    primary_role: "Shooting Guard",
    secondary_role: "Playmaker",
    high_school: "Rigby High School",
    grad_year: "2024",
    from_email: settings.fromEmail || defaultSettings.fromEmail
  };
}

function buildEmail(contact) {
  return resolveTemplate(settings.emailTemplate || defaultEmailTemplate(), contact || {});
}

function buildQuickResponseLink(contact = {}) {
  const params = new URLSearchParams({
    school: contact.displayName || contact.school || "",
    coach: coachLastName(contact),
    contact_id: contact.id || "",
    reply_to: settings.forwardEmail || settings.fromEmail || defaultSettings.forwardEmail
  });
  return `${PUBLIC_SITE_ORIGIN}/respond.html?${params.toString()}`;
}

function ensureRequiredEmailTemplate(template) {
  let cleanTemplate = stripGradePointTemplate(template || defaultEmailTemplate()).trim();
  cleanTemplate = ensureWebsiteLinkTemplate(cleanTemplate);
  return ensureQuickResponseTemplate(cleanTemplate);
}

function ensureWebsiteLinkTemplate(template) {
  const cleanTemplate = String(template || "").trim();
  if (/\{\{website_link\}\}|(?:https?:\/\/)?(?:www\.)?roycecastle\.com\/?(?:\s|$)/i.test(cleanTemplate)) return cleanTemplate;
  const websiteBlock = `You can view my recruiting profile, highlight video, and action photo library here:
{{website_link}}`;
  if (/Quick reply option, no typing required:/i.test(cleanTemplate)) {
    return cleanTemplate.replace(/\n*Quick reply option, no typing required:/i, `\n\n${websiteBlock}\n\nQuick reply option, no typing required:`);
  }
  return `${cleanTemplate}\n\n${websiteBlock}`;
}

function ensureQuickResponseTemplate(template) {
  const cleanTemplate = String(template || defaultEmailTemplate()).trim();
  if (/\{\{quick_response_link\}\}/i.test(cleanTemplate)) return cleanTemplate;
  return `${cleanTemplate}

Quick reply option, no typing required:
{{quick_response_link}}

That link lets your staff choose highly interested, moderately interested, or still exploring fit, and it opens a prefilled response email.`;
}

function stripGradePointTemplate(template) {
  const gradeTokenPattern = new RegExp("\\{\\{g" + "pa\\}\\}", "gi");
  return String(template || "")
    .replace(/Academically,\s*I carried a (?:\{\{g[a-z]a\}\}|[\d.]+) high school G\s*P\s*A\.\s*I also try/gi, "I try")
    .replace(/I am happy to provide references, academic information,/gi, "I am happy to provide references, eligibility information,")
    .replace(gradeTokenPattern, "");
}

function coachLastName(contact) {
  const name = contact?.headCoach && !contact.headCoach.toLowerCase().includes("verify") ? contact.headCoach : contact?.assistantCoach || "";
  return name && !name.toLowerCase().includes("verify") ? name.split(" ").slice(-1)[0] : "";
}

function clearMessages() {
  localStorage.setItem(PUBLIC_MESSAGES_KEY, "[]");
  renderAll();
  toast("Messages cleared.");
}

function downloadWorkbookCsv() {
  const headers = [
    "group",
    "school",
    "displayName",
    "state",
    "division",
    "conference",
    "headCoach",
    "assistantCoach",
    "headEmail",
    "assistantEmail",
    "phone",
    "scholarshipNote",
    "athleticsUrl",
    "staffDirectoryUrl",
    "sourceStatus"
  ];
  const csv = [headers.join(",")]
    .concat(contacts.map((row) => headers.map((header) => csvCell(row[header] || "")).join(",")))
    .join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv" }), "royce-castle-contact-workbook.csv");
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

function csvCell(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function loadSettings() {
  try {
    const loadedSettings = { ...defaultSettings, ...(JSON.parse(localStorage.getItem(ADMIN_SETTINGS_KEY) || "{}") || {}) };
    loadedSettings.emailTemplate = ensureRequiredEmailTemplate(loadedSettings.emailTemplate);
    localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(loadedSettings));
    return loadedSettings;
  } catch {
    return { ...defaultSettings, emailTemplate: ensureRequiredEmailTemplate(defaultSettings.emailTemplate) };
  }
}

function persistSettings() {
  localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(settings));
}

function getAdminCode() {
  return localStorage.getItem(ADMIN_CODE_KEY) || "Patriot";
}

function loadMessages() {
  try {
    const messages = JSON.parse(localStorage.getItem(PUBLIC_MESSAGES_KEY) || "[]");
    return Array.isArray(messages) ? messages : [];
  } catch {
    return [];
  }
}

function recordEmailHistory(target, status = "Sent") {
  if (!target.contactId) return;
  const history = loadEmailHistory();
  history.unshift({
    id: `email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    contactId: target.contactId,
    school: target.label || "",
    email: target.email || "",
    subject: target.subject || refs.adminSubject?.value || "",
    body: target.body || refs.adminEmailBody?.value || "",
    status,
    sentAt: new Date().toISOString(),
    respondedAt: "",
    viewedAt: ""
  });
  localStorage.setItem(EMAIL_HISTORY_KEY, JSON.stringify(history.slice(0, 500)));
}

function loadEmailHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(EMAIL_HISTORY_KEY) || "[]");
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

function logRun(message) {
  const log = loadRunLog();
  log.unshift({ message, createdAt: new Date().toISOString() });
  localStorage.setItem(RUN_LOG_KEY, JSON.stringify(log.slice(0, 80)));
}

function loadRunLog() {
  try {
    const log = JSON.parse(localStorage.getItem(RUN_LOG_KEY) || "[]");
    return Array.isArray(log) ? log : [];
  } catch {
    return [];
  }
}

function renderRunLog() {
  const log = loadRunLog();
  refs.runLog.innerHTML = log.length
    ? log.map((item) => `<p><time>${escapeHtml(formatTime(item.createdAt))}</time>${escapeHtml(item.message)}</p>`).join("")
    : `<p><time>--:--</time>No run log entries yet.</p>`;
}

function formatDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
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
  refs.adminToast.textContent = message;
  refs.adminToast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => refs.adminToast.classList.remove("show"), 2600);
}
