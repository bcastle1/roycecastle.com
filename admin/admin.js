const ADMIN_CODE_KEY = "royceCastleRecruitingStudio.adminCode.v1";
const ADMIN_SESSION_KEY = "royceCastleRecruitingStudio.adminUnlocked.v1";
const ADMIN_SETTINGS_KEY = "royceCastleRecruitingStudio.adminSettings.v1";
const PUBLIC_MESSAGES_KEY = "royceCastleRecruitingStudio.publicMessages.v1";
const RUN_LOG_KEY = "royceCastleRecruitingStudio.runLog.v1";
const EMAIL_HISTORY_KEY = "royceCastleRecruitingStudio.emailHistory.v1";
const OPT_OUT_KEY = "royceCastleRecruitingStudio.optOutEmails.v1";
const PUBLIC_SITE_ORIGIN = "https://roycecastle.com";
const API_BASE = "../api";
const DEFAULT_MAILBOX = "info@roycecastle.com";
const DEFAULT_WEBMAIL_URL = "https://privateemail.com/";
const LEGACY_DEFAULT_EMAIL = "erik@puricloud.com";

const contacts = Array.isArray(window.RECRUITING_CONTACTS) ? window.RECRUITING_CONTACTS : [];
const contactsWithEmail = contacts.filter((contact) => contact.headEmail || contact.assistantEmail);
const defaultSettings = {
  forwardEmail: DEFAULT_MAILBOX,
  fromEmail: DEFAULT_MAILBOX,
  webmailEmail: DEFAULT_MAILBOX,
  webmailUrl: DEFAULT_WEBMAIL_URL,
  ccEmail: "",
  sendMode: "server",
  frequency: "manual",
  day: "Monday",
  time: "09:00",
  delaySeconds: 4,
  openDrafts: false,
  emailTemplate: defaultEmailTemplate()
};

let settings = loadSettings();
let optOutEmails = loadOptOutEmails();
let selectedContactIds = new Set();
const requestedContactId = new URLSearchParams(location.search).get("select");
let currentContactId = contactsWithEmail.some((contact) => contact.id === requestedContactId)
  ? requestedContactId
  : contactsWithEmail.find((contact) => contact.id === "d1-byu-cougars")?.id || contactsWithEmail[0]?.id || "";
let visibleContacts = [];
let runTimer = null;
let runState = { active: false, total: 0, sent: 0 };
let serverAvailable = false;
let serverCanSend = false;
let settingsSyncTimer = null;

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
    "metric-storage-label",
    "metric-sent",
    "metric-opened",
    "metric-opt-outs",
    "metric-progress",
    "metric-run-label",
    "backend-status-title",
    "backend-status",
    "webmail-email-display",
    "open-webmail-header",
    "open-webmail-panel",
    "message-list",
    "clear-messages",
    "setting-forward",
    "setting-from",
    "setting-webmail-email",
    "setting-webmail-url",
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
    "open-webmail-run",
    "run-suppression-summary",
    "start-run",
    "save-schedule",
    "progress-panel",
    "progress-text",
    "progress-count",
    "progress-bar",
    "toggle-progress",
    "toggle-log",
    "run-log",
    "opt-out-list",
    "save-opt-outs",
    "opt-out-current",
    "opt-in-current",
    "download-workbook",
    "admin-contact-search",
    "admin-contact-group",
    "select-visible",
    "select-all-filtered",
    "clear-selected",
    "admin-contact-list",
    "admin-toast"
  ].forEach((id) => {
    refs[toCamel(id)] = document.querySelector(`#${id}`);
  });
}

function bindLogin() {
  refs.adminLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    refs.adminLoginError.hidden = true;
    toast("Checking admin access...");
    const code = refs.adminLoginCode.value;
    const serverLogin = await loginWithServer(code);
    if (serverLogin || code === getAdminCode()) {
      sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
      refs.adminLoginError.hidden = true;
      await unlockAdmin();
      return;
    }
    refs.adminLoginError.hidden = false;
    toast("Admin code did not match.");
  });
}

async function unlockAdmin() {
  refs.adminLogin.hidden = true;
  refs.adminApp.hidden = false;
  await loadServerState();
  hydrateSettings();
  bindAdminEvents();
  renderAll();
  toast(serverAvailable ? "Admin unlocked. Server persistence is active." : "Admin unlocked. Static fallback is active.");
}

async function loginWithServer(code) {
  const response = await apiRequest("login", { code }, { allowUnauthenticated: true, quiet: true });
  if (!response?.ok) return false;
  applyServerState(response);
  return true;
}

async function loadServerState() {
  const response = await apiRequest("state", null, { method: "GET", quiet: true });
  if (!response?.ok) return false;
  applyServerState(response);
  return true;
}

function applyServerState(state = {}) {
  serverAvailable = true;
  serverCanSend = !!state.canSend;
  if (state.settings) {
    settings = { ...defaultSettings, ...state.settings };
    localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(settings));
  }
  if (Array.isArray(state.messages)) localStorage.setItem(PUBLIC_MESSAGES_KEY, JSON.stringify(state.messages));
  if (Array.isArray(state.emailHistory)) localStorage.setItem(EMAIL_HISTORY_KEY, JSON.stringify(state.emailHistory));
  if (Array.isArray(state.runLog)) localStorage.setItem(RUN_LOG_KEY, JSON.stringify(state.runLog));
  if (Array.isArray(state.optOutEmails)) {
    optOutEmails = new Set(state.optOutEmails.map(normalizeEmail).filter(Boolean));
    localStorage.setItem(OPT_OUT_KEY, JSON.stringify([...optOutEmails].sort()));
  }
}

async function apiRequest(action, payload, options = {}) {
  const method = options.method || (payload ? "POST" : "GET");
  const url = `${API_BASE}/admin.php?action=${encodeURIComponent(action)}`;
  try {
    const response = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    if (!options.quiet) toast("Server save is unavailable; saved in this browser for now.");
    return null;
  }
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
  refs.optOutList.addEventListener("input", () => {
    refs.runSuppressionSummary.textContent = "Unsaved opt-out changes.";
  });
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
    case "save-opt-outs":
      saveOptOutsFromForm();
      break;
    case "opt-out-current":
      optOutCurrentContact();
      break;
    case "opt-in-current":
      optInCurrentContact();
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
    case "select-all-filtered":
      filteredContacts().forEach((contact) => selectedContactIds.add(contact.id));
      renderAll();
      toast(`${selectedContactIds.size.toLocaleString()} contact${selectedContactIds.size === 1 ? "" : "s"} selected for the run.`);
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
  refs.settingWebmailEmail.value = settings.webmailEmail;
  refs.settingWebmailUrl.value = settings.webmailUrl;
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
  renderOptOuts();
  renderWebmailLinks();
  renderRunLog();
  window.lucide?.createIcons();
}

function renderMetrics() {
  const history = loadEmailHistory();
  const sentCount = history.filter((item) => /sent|opened|draft opened/i.test(item.status || "")).length;
  const openedCount = history.filter((item) => item.viewedAt || item.openedAt || Number(item.openCount || 0) > 0).length;
  refs.metricContacts.textContent = contacts.length.toLocaleString();
  refs.metricSelected.textContent = selectedContactIds.size.toLocaleString();
  refs.metricMessages.textContent = loadMessages().length.toLocaleString();
  refs.metricStorageLabel.textContent = serverAvailable ? "Saved permanently on server" : "Saved in this browser";
  refs.metricSent.textContent = sentCount.toLocaleString();
  refs.metricOpened.textContent = openedCount.toLocaleString();
  refs.metricOptOuts.textContent = optOutEmails.size.toLocaleString();
  refs.metricProgress.textContent = runState.total ? `${Math.round((runState.sent / runState.total) * 100)}%` : "0%";
  refs.metricRunLabel.textContent = runState.active ? "Run in progress" : "Ready";
  if (refs.backendStatusTitle) refs.backendStatusTitle.textContent = serverAvailable && serverCanSend ? "Server sending ready" : "Draft fallback ready";
  if (refs.backendStatus) {
    refs.backendStatus.textContent =
      serverAvailable && serverCanSend
        ? `Runs send from ${settings.fromEmail || DEFAULT_MAILBOX}; replies go to ${settings.forwardEmail || settings.fromEmail || DEFAULT_MAILBOX}; opens are tracked when images load.`
        : "Static mode prepares drafts. Upload to cPanel with the API folder to send from the mailbox and track opens.";
  }
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
    refs.adminSelectedMeta.textContent = [contact.assistantCoach, contact.headCoach, contact.division, contact.conference, contactOptOutStatus(contact)]
      .filter(Boolean)
      .join(" | ");
    refs.adminToEmail.value = contactTargetEmail(contact);
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
  visibleContacts = filteredContacts();
  refs.adminContactList.innerHTML = visibleContacts.length
    ? visibleContacts
        .map(
          (contact) => {
            const optStatus = contactOptOutStatus(contact);
            const isSuppressed = isContactSuppressed(contact);
            return `
        <article class="admin-contact-row ${contact.id === currentContactId ? "active" : ""}">
          <label class="check-row">
            <input type="checkbox" data-select-contact="${escapeAttr(contact.id)}" ${selectedContactIds.has(contact.id) ? "checked" : ""}>
            <span class="school-logo-mini" style="--school-color:${escapeAttr(contact.primaryColor || "#164b88")};--school-accent:${escapeAttr(contact.accentColor || "#ffffff")}">${escapeHtml(schoolInitials(contact))}</span>
            <span>
              <strong>${escapeHtml(contact.displayName || contact.school)}</strong>
              <small>${escapeHtml(contactEmail(contact) || "No email")} | ${escapeHtml(contact.division || "")}</small>
              <em class="contact-status ${isSuppressed ? "suppressed" : optStatus.includes("opted out") ? "partial" : "clear"}">${escapeHtml(optStatus)}</em>
            </span>
          </label>
          <div class="contact-row-actions">
            <button class="ghost-button compact" type="button" data-load-contact="${escapeAttr(contact.id)}">Load Draft</button>
            ${
              isSuppressed
                ? `<button class="ghost-button compact" type="button" data-opt-in-contact="${escapeAttr(contact.id)}">Opt In</button>`
                : `<button class="ghost-button compact" type="button" data-opt-out-contact="${escapeAttr(contact.id)}">Opt Out</button>`
            }
          </div>
        </article>
      `;
          }
        )
        .join("")
    : `<div class="empty-state">No contacts match the current filters.</div>`;

  bindContactRows();
}

function filteredContacts() {
  const query = refs.adminContactSearch.value.trim().toLowerCase();
  const group = refs.adminContactGroup.value;
  return contactsWithEmail
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
    });
}

function bindContactRows() {
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

  refs.adminContactList.querySelectorAll("[data-opt-out-contact]").forEach((button) => {
    button.addEventListener("click", () => optOutContactById(button.dataset.optOutContact));
  });

  refs.adminContactList.querySelectorAll("[data-opt-in-contact]").forEach((button) => {
    button.addEventListener("click", () => optInContactById(button.dataset.optInContact));
  });
}

function schoolInitials(contact = {}) {
  const source = contact.displayName || contact.school || "RC";
  return source
    .replace(/\b(university|college|state|the|of|at|and|community)\b/gi, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 3);
}

async function saveSettingsFromForm() {
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
  settings.webmailEmail = refs.settingWebmailEmail.value.trim() || defaultSettings.webmailEmail;
  settings.webmailUrl = normalizeWebmailUrl(refs.settingWebmailUrl.value.trim()) || defaultSettings.webmailUrl;
  persistSettings();
  if (serverAvailable) await syncSettings({ newCode });
  renderWebmailLinks();
  toast(serverAvailable ? "Settings saved permanently." : "Settings saved in this browser.");
}

async function saveSchedule() {
  settings.frequency = refs.scheduleFrequency.value;
  settings.day = refs.scheduleDay.value;
  settings.time = refs.scheduleTime.value;
  settings.delaySeconds = Math.max(1, Number(refs.scheduleDelay.value) || 4);
  settings.openDrafts = refs.openDraftsDuringRun.checked;
  persistSettings();
  if (serverAvailable) await syncSettings();
  logRun(`Auto-send schedule saved: ${settings.frequency}, ${settings.day} at ${settings.time}, ${settings.delaySeconds}s between contacts.`);
  renderRunLog();
  toast(serverAvailable ? "Schedule saved permanently." : "Schedule saved in this browser.");
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
  if (runTargets.skippedOptOuts?.length) {
    logRun(`${runTargets.skippedOptOuts.length} selected contact${runTargets.skippedOptOuts.length === 1 ? "" : "s"} skipped because all saved emails are opted out.`);
  }
  if (!targets.length) {
    toast("Select contacts or enter a manual email first.");
    return;
  }

  refs.progressPanel.hidden = false;
  runState = { active: true, total: targets.length, sent: 0 };
  logRun(`Send run started for ${targets.length} recipient${targets.length === 1 ? "" : "s"}.`);
  updateProgress();
  toast("Send run started successfully.");

  const step = async () => {
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
    let status = "Prepared";
    let serverLoggedHistory = false;
    if (serverAvailable && serverCanSend && !settings.openDrafts) {
      const result = await sendEmailTarget(target);
      serverLoggedHistory = result.savedHistory;
      status = result.sent ? "Sent" : "Send failed";
      logRun(`${result.sent ? "Sent" : "Could not send"} individualized email for ${target.label} <${target.email}>.`);
      if (!result.sent) openMailDraft(target, true);
    } else {
      logRun(`Prepared individualized draft for ${target.label} <${target.email}>.`);
      if (settings.openDrafts) openMailDraft(target, true);
      status = settings.openDrafts ? "Draft opened" : "Prepared";
    }
    if (status !== "Sent" && !serverLoggedHistory) recordEmailHistory(target, status);
    runState.sent += 1;
    updateProgress();
    runTimer = setTimeout(step, settings.delaySeconds * 1000);
  };

  step();
}

async function sendEmailTarget(target) {
  try {
    const response = await fetch(`${API_BASE}/send-email.php`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(target)
    });
    const result = await response.json();
    if (result?.historyItem) {
      saveOrUpdateHistoryItem(result.historyItem);
      return { sent: !!result.sent, savedHistory: true };
    }
    return { sent: false, savedHistory: false };
  } catch {
    toast("Server send failed; opening a draft fallback.");
    return { sent: false, savedHistory: false };
  }
}

function runTargets() {
  runTargets.skippedOptOuts = [];
  const selectedContacts = [...selectedContactIds].map((id) => contacts.find((contact) => contact.id === id)).filter(Boolean);
  const targets = selectedContacts.flatMap((contact) => {
    const email = contactTargetEmail(contact);
    if (!email) {
      runTargets.skippedOptOuts.push(contact.displayName || contact.school || contact.id);
      return [];
    }
    return [
      {
        contactId: contact.id,
        email,
        label: contact.displayName || contact.school,
        subject: `Royce Castle | 6'5" Shooting Guard | Rigby High School 2024`,
        body: buildEmail(contact),
        quickResponseLink: buildQuickResponseLink(contact),
        websiteLink: `${PUBLIC_SITE_ORIGIN}/`,
        videoLink: `${PUBLIC_SITE_ORIGIN}/#video`
      }
    ];
  });

  const manualEmail = refs.manualEmail.value.trim();
  if (manualEmail) {
    const activeManualEmail = activeEmailsFromString(manualEmail);
    if (activeManualEmail) {
      targets.push({
        email: activeManualEmail,
        label: "manual recipient",
        subject: refs.adminSubject.value,
        body: refs.adminEmailBody.value,
        websiteLink: `${PUBLIC_SITE_ORIGIN}/`,
        videoLink: `${PUBLIC_SITE_ORIGIN}/#video`
      });
    } else {
      runTargets.skippedOptOuts.push("manual recipient");
    }
  }
  if (!targets.length && refs.adminToEmail.value.trim()) {
    const activeDraftEmail = activeEmailsFromString(refs.adminToEmail.value);
    if (activeDraftEmail) {
      targets.push({
        email: activeDraftEmail,
        label: "current draft recipient",
        subject: refs.adminSubject.value,
        body: refs.adminEmailBody.value,
        websiteLink: `${PUBLIC_SITE_ORIGIN}/`,
        videoLink: `${PUBLIC_SITE_ORIGIN}/#video`
      });
    } else {
      runTargets.skippedOptOuts.push("current draft recipient");
    }
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
  try {
    await navigator.clipboard.writeText(`${refs.adminSubject.value}\n\n${refs.adminEmailBody.value}`);
    toast("Draft copied.");
  } catch {
    toast("Clipboard permission was blocked. Select the preview text and copy it manually.");
  }
}

function openMailDraft(target = currentEmailTarget(), quiet = false) {
  const enteredEmails = parseEmails(target.email);
  const activeEmail = activeEmailsFromString(target.email);
  if (!activeEmail) {
    toast(enteredEmails.length ? "All recipients are opted out. Opt in before sending." : "Add a recipient email first.");
    return;
  }
  const params = new URLSearchParams({
    cc: refs.adminCcEmail.value || "",
    subject: target.subject || refs.adminSubject.value,
    body: target.body || refs.adminEmailBody.value
  });
  window.open(`mailto:${activeEmail}?${params.toString()}`, "_blank");
  if (!quiet) toast("Draft opened in your mail app.");
}

function markCurrentSent() {
  const contact = currentContact();
  if (!contact) {
    toast("Manual draft marked ready.");
    return;
  }
  const activeEmail = contactTargetEmail(contact);
  if (!activeEmail) {
    toast("This contact is opted out. Opt them in before marking sent.");
    return;
  }
  recordEmailHistory(
    {
      contactId: contact.id,
      email: activeEmail,
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
    body: refs.adminEmailBody.value,
    websiteLink: `${PUBLIC_SITE_ORIGIN}/`,
    videoLink: `${PUBLIC_SITE_ORIGIN}/#video`,
    quickResponseLink: buildQuickResponseLink(currentContact() || {})
  };
}

function currentContact() {
  return contacts.find((contact) => contact.id === currentContactId);
}

function contactEmail(contact) {
  return contactEmails(contact).join(", ");
}

function contactEmails(contact = {}) {
  return [contact.headEmail, contact.assistantEmail].flatMap(parseEmails);
}

function contactTargetEmail(contact = {}) {
  return contactEmails(contact)
    .filter((email) => !optOutEmails.has(normalizeEmail(email)))
    .join(", ");
}

function activeEmailsFromString(value = "") {
  return parseEmails(value)
    .filter((email) => !optOutEmails.has(normalizeEmail(email)))
    .join(", ");
}

function isContactSuppressed(contact = {}) {
  const emails = contactEmails(contact);
  return emails.length > 0 && emails.every((email) => optOutEmails.has(normalizeEmail(email)));
}

function contactOptOutStatus(contact = {}) {
  const emails = contactEmails(contact);
  if (!emails.length) return "No saved email";
  const blocked = emails.filter((email) => optOutEmails.has(normalizeEmail(email))).length;
  if (!blocked) return "Opted in";
  if (blocked === emails.length) return "Opted out";
  return `${blocked} of ${emails.length} opted out`;
}

function renderWebmailLinks() {
  const url = normalizeWebmailUrl(settings.webmailUrl) || defaultSettings.webmailUrl;
  [refs.openWebmailHeader, refs.openWebmailPanel, refs.openWebmailRun].filter(Boolean).forEach((link) => {
    link.href = url;
    link.title = `Open webmail for ${settings.webmailEmail || defaultSettings.webmailEmail}`;
  });
  if (refs.webmailEmailDisplay) refs.webmailEmailDisplay.textContent = settings.webmailEmail || defaultSettings.webmailEmail;
}

function renderOptOuts() {
  if (refs.optOutList && document.activeElement !== refs.optOutList) {
    refs.optOutList.value = [...optOutEmails].sort().join("\n");
  }
  if (refs.runSuppressionSummary) {
    refs.runSuppressionSummary.textContent = optOutEmails.size
      ? `${optOutEmails.size.toLocaleString()} opted-out email${optOutEmails.size === 1 ? "" : "s"} excluded from runs.`
      : "No opt-outs saved.";
  }
}

async function saveOptOutsFromForm() {
  optOutEmails = new Set(parseEmails(refs.optOutList.value));
  persistOptOutEmails();
  if (serverAvailable) await syncOptOutEmails();
  renderAll();
  toast(serverAvailable ? "Opt-out list saved permanently." : "Opt-out list saved in this browser.");
}

function optOutCurrentContact() {
  const contact = currentContact();
  const emails = contact ? contactEmails(contact) : parseEmails(refs.adminToEmail.value);
  if (!emails.length) {
    toast("Load a contact or enter an email to opt out.");
    return;
  }
  emails.forEach((email) => optOutEmails.add(normalizeEmail(email)));
  persistOptOutEmails();
  renderAll();
  toast(`${emails.length} email${emails.length === 1 ? "" : "s"} opted out.`);
}

function optInCurrentContact() {
  const contact = currentContact();
  const emails = contact ? contactEmails(contact) : parseEmails(refs.adminToEmail.value);
  if (!emails.length) {
    toast("Load a contact or enter an email to opt in.");
    return;
  }
  emails.forEach((email) => optOutEmails.delete(normalizeEmail(email)));
  persistOptOutEmails();
  renderAll();
  toast(`${emails.length} email${emails.length === 1 ? "" : "s"} opted in.`);
}

function optOutContactById(contactId) {
  const contact = contacts.find((row) => row.id === contactId);
  if (!contact) return;
  contactEmails(contact).forEach((email) => optOutEmails.add(normalizeEmail(email)));
  persistOptOutEmails();
  renderAll();
  toast(`${contact.displayName || contact.school} opted out.`);
}

function optInContactById(contactId) {
  const contact = contacts.find((row) => row.id === contactId);
  if (!contact) return;
  contactEmails(contact).forEach((email) => optOutEmails.delete(normalizeEmail(email)));
  persistOptOutEmails();
  renderAll();
  toast(`${contact.displayName || contact.school} opted in.`);
}

function loadOptOutEmails() {
  try {
    const emails = JSON.parse(localStorage.getItem(OPT_OUT_KEY) || "[]");
    return new Set(Array.isArray(emails) ? emails.map(normalizeEmail).filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function persistOptOutEmails() {
  localStorage.setItem(OPT_OUT_KEY, JSON.stringify([...optOutEmails].sort()));
  if (serverAvailable) syncOptOutEmails();
}

async function syncOptOutEmails() {
  if (!serverAvailable) return false;
  const response = await apiRequest("save-opt-outs", { optOutEmails: [...optOutEmails].sort() }, { quiet: true });
  if (!response?.ok) return false;
  applyServerState(response);
  return true;
}

function parseEmails(value = "") {
  return [...new Set(String(value).split(/[\s,;]+/).map(normalizeEmail).filter((email) => email.includes("@")))];
}

function normalizeEmail(value = "") {
  return String(value).trim().toLowerCase();
}

function normalizeWebmailUrl(value = "") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function defaultEmailTemplate() {
  return `Coach {{coach_last_name}},

My name is Royce Castle. I am a {{height}} {{primary_role}} / {{secondary_role}} from {{high_school}} in Idaho, class of {{grad_year}}. I am reaching out because I am interested in the {{school_name}} men's basketball program and would be grateful for a chance to learn the best process for being evaluated by your staff.

On the court, I am a coachable, team-first guard who can stretch the floor with a jump shot and three-point shot, create for teammates as a playmaker, post smaller guards, rebound hard from the perimeter, and defend high-level assignments. In high school, opponents often game-planned their defense around limiting my scoring opportunities, and I was often asked to guard the other team's best player.

I try to bring lockdown defensive effort and high-motor workhorse energy every day. I do not use alcohol or drugs, take my health seriously, and would work to be a positive leader in the locker room and a strong representative of your program.

Would your staff prefer that I complete a questionnaire, send full game film, schedule a phone call, attend a tryout or camp, or continue the conversation by email? I am happy to provide references, eligibility information, stats, and additional video.

You can view my recruiting profile, highlight video, and action photo library here:
{{website_link}}

Direct highlight video section:
{{video_link}}

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

async function saveTemplateFromEditor() {
  const template = templateEditorText();
  if (!template) {
    toast("Add template text before saving.");
    return;
  }
  settings.emailTemplate = ensureRequiredEmailTemplate(template);
  persistSettings();
  if (serverAvailable) await syncSettings();
  renderTemplateEditor();
  updateEmailPreview();
  toast(serverAvailable ? "Email template saved permanently." : "Email template saved in this browser.");
}

async function resetTemplate() {
  settings.emailTemplate = defaultEmailTemplate();
  persistSettings();
  if (serverAvailable) await syncSettings();
  renderTemplateEditor();
  updateEmailPreview();
  toast(serverAvailable ? "Email template reset and saved." : "Email template reset in this browser.");
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
    video_link: `${PUBLIC_SITE_ORIGIN}/#video`,
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
  cleanTemplate = ensureVideoLinkTemplate(cleanTemplate);
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

function ensureVideoLinkTemplate(template) {
  const cleanTemplate = String(template || "").trim();
  if (/\{\{video_link\}\}|(?:https?:\/\/)?(?:www\.)?roycecastle\.com\/?#video/i.test(cleanTemplate)) return cleanTemplate;
  const videoBlock = `Direct highlight video section:
{{video_link}}`;
  if (/Quick reply option, no typing required:/i.test(cleanTemplate)) {
    return cleanTemplate.replace(/\n*Quick reply option, no typing required:/i, `\n\n${videoBlock}\n\nQuick reply option, no typing required:`);
  }
  return `${cleanTemplate}\n\n${videoBlock}`;
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
  if (serverAvailable) apiRequest("clear-messages", {}, { quiet: true });
  renderAll();
  toast(serverAvailable ? "Messages cleared permanently." : "Messages cleared in this browser.");
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
    loadedSettings.forwardEmail = normalizeMailboxSetting(loadedSettings.forwardEmail);
    loadedSettings.fromEmail = normalizeMailboxSetting(loadedSettings.fromEmail);
    loadedSettings.webmailEmail = loadedSettings.webmailEmail || DEFAULT_MAILBOX;
    loadedSettings.webmailUrl = normalizeWebmailUrl(loadedSettings.webmailUrl) || DEFAULT_WEBMAIL_URL;
    loadedSettings.emailTemplate = ensureRequiredEmailTemplate(loadedSettings.emailTemplate);
    localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(loadedSettings));
    return loadedSettings;
  } catch {
    return { ...defaultSettings, emailTemplate: ensureRequiredEmailTemplate(defaultSettings.emailTemplate) };
  }
}

function normalizeMailboxSetting(value) {
  const email = String(value || "").trim();
  return !email || email.toLowerCase() === LEGACY_DEFAULT_EMAIL ? DEFAULT_MAILBOX : email;
}

function persistSettings() {
  localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(settings));
  if (serverAvailable) {
    clearTimeout(settingsSyncTimer);
    settingsSyncTimer = setTimeout(() => syncSettings(), 500);
  }
}

async function syncSettings(extra = {}) {
  if (!serverAvailable) return false;
  const response = await apiRequest("save-settings", { settings, ...extra }, { quiet: true });
  if (!response?.ok) {
    toast("Server save did not complete; browser copy is still updated.");
    return false;
  }
  applyServerState(response);
  return true;
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
  const item = {
    id: `email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    contactId: target.contactId,
    school: target.label || "",
    email: target.email || "",
    subject: target.subject || refs.adminSubject?.value || "",
    body: target.body || refs.adminEmailBody?.value || "",
    status,
    sentAt: new Date().toISOString(),
    respondedAt: "",
    viewedAt: "",
    openCount: 0
  };
  const history = loadEmailHistory();
  history.unshift(item);
  localStorage.setItem(EMAIL_HISTORY_KEY, JSON.stringify(history.slice(0, 500)));
  if (serverAvailable) apiRequest("record-history", { historyItem: item }, { quiet: true });
}

function saveOrUpdateHistoryItem(item) {
  if (!item?.id) return;
  const history = loadEmailHistory();
  const index = history.findIndex((entry) => entry.id === item.id || (item.trackingId && entry.trackingId === item.trackingId));
  if (index >= 0) history[index] = { ...history[index], ...item };
  else history.unshift(item);
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
  const item = { message, createdAt: new Date().toISOString() };
  log.unshift(item);
  localStorage.setItem(RUN_LOG_KEY, JSON.stringify(log.slice(0, 80)));
  if (serverAvailable) apiRequest("log-run", { logItem: item }, { quiet: true });
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
