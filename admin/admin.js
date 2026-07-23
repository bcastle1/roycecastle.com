const ADMIN_SESSION_KEY = "royceCastleRecruitingStudio.adminUnlocked.v1";
const ADMIN_SETTINGS_KEY = "royceCastleRecruitingStudio.adminSettings.v1";
const PUBLIC_MESSAGES_KEY = "royceCastleRecruitingStudio.publicMessages.v1";
const RUN_LOG_KEY = "royceCastleRecruitingStudio.runLog.v1";
const EMAIL_HISTORY_KEY = "royceCastleRecruitingStudio.emailHistory.v1";
const OPT_OUT_KEY = "royceCastleRecruitingStudio.optOutEmails.v1";
const CONSENT_DATES_KEY = "royceCastleRecruitingStudio.consentDates.v1";
const PUBLIC_SITE_ORIGIN = "https://roycecastle.com";
const API_BASE = "../api";
const DEFAULT_MAILBOX = "info@roycecastle.com";
const DEFAULT_WEBMAIL_URL = "https://privateemail.com/";
const DEFAULT_SMTP_HOST = "mail.privateemail.com";
const DEFAULT_SMTP_PORT = 465;
const DEFAULT_SMTP_SECURITY = "ssl";
const PRIVATE_EMAIL_MIN_DELAY_SECONDS = 300;
const LIVE_RUN_RECIPIENT_LIMIT = 1;
const DAILY_SEND_LIMIT_MAX = 25;
const LEGACY_DEFAULT_EMAIL = "erik@puricloud.com";
const EMAIL_TEMPLATE_VERSION = 3;

const contacts = Array.isArray(window.RECRUITING_CONTACTS) ? window.RECRUITING_CONTACTS : [];
const contactsWithEmail = contacts.filter((contact) => contact.headEmail || contact.assistantEmail);
const defaultSettings = {
  forwardEmail: DEFAULT_MAILBOX,
  fromEmail: DEFAULT_MAILBOX,
  webmailEmail: DEFAULT_MAILBOX,
  webmailUrl: DEFAULT_WEBMAIL_URL,
  smtpHost: DEFAULT_SMTP_HOST,
  smtpPort: DEFAULT_SMTP_PORT,
  smtpSecurity: DEFAULT_SMTP_SECURITY,
  smtpUser: DEFAULT_MAILBOX,
  smtpPasswordSet: false,
  ccEmail: "",
  sendMode: "server",
  sendingEnabled: false,
  emailFormat: "plain",
  trackOpens: false,
  dailySendLimit: 1,
  frequency: "manual",
  day: "Monday",
  time: "09:00",
  delaySeconds: PRIVATE_EMAIL_MIN_DELAY_SECONDS,
  openDrafts: false,
  emailTemplateVersion: EMAIL_TEMPLATE_VERSION,
  emailTemplate: defaultEmailTemplate()
};

let settings = loadSettings();
let deliveryStats = null;
let dailySendStatus = null;
let selectedRunId = "";
let optOutEmails = loadOptOutEmails();
let consentDates = loadConsentDates();
let selectedContactIds = new Set();
const requestedContactId = new URLSearchParams(location.search).get("select");
let currentContactId = contactsWithEmail.some((contact) => contact.id === requestedContactId)
  ? requestedContactId
  : contactsWithEmail.find((contact) => contact.id === "d1-byu-cougars")?.id || contactsWithEmail[0]?.id || "";
let visibleContacts = [];
let runTimer = null;
let runState = { active: false, mode: "send", total: 0, processed: 0, accepted: 0, failed: 0, prepared: 0, smtpAccepted: 0, mailAccepted: 0, unknownAccepted: 0, runId: "", startedAt: "", updatedAt: "", completedAt: "", lastError: "" };
let serverAvailable = false;
let serverCanSend = false;
let serverSmtpReady = false;
let serverMailAvailable = false;

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
    "metric-contacts-label",
    "metric-selected",
    "metric-selected-label",
    "metric-messages",
    "metric-storage-label",
    "metric-sent",
    "metric-sent-label",
    "metric-opened",
    "metric-consents",
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
    "setting-smtp-host",
    "setting-smtp-port",
    "setting-smtp-security",
    "setting-smtp-user",
    "setting-smtp-password",
    "setting-smtp-status",
    "setting-sending-enabled",
    "setting-email-format",
    "setting-track-opens",
    "setting-daily-send-limit",
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
    "toggle-run-history",
    "run-log",
    "run-history-panel",
    "run-history-select",
    "run-history-empty",
    "run-history-detail",
    "run-history-accepted",
    "run-history-subtitle",
    "run-history-status",
    "run-history-processed",
    "run-history-failed",
    "run-history-transport",
    "run-history-started",
    "run-history-finished",
    "run-history-duration",
    "run-history-error",
    "opt-out-list",
    "consent-date",
    "save-opt-outs",
    "opt-out-current",
    "opt-in-current",
    "download-workbook",
    "contact-sendable-note",
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
    if (serverLogin) {
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
  serverSmtpReady = !!state.smtpReady;
  serverMailAvailable = !!state.mailAvailable;
  if (state.deliveryStats && typeof state.deliveryStats === "object") deliveryStats = normalizeDeliveryStats(state.deliveryStats);
  if (state.dailySendStatus && typeof state.dailySendStatus === "object") dailySendStatus = normalizeDailySendStatus(state.dailySendStatus);
  if (state.settings) {
    settings = normalizeSettings(state.settings);
    storeLocalJson(ADMIN_SETTINGS_KEY, settingsForBrowserStorage(settings));
  }
  serverCanSend = !!state.canSend && serverSmtpReady && !!settings.sendingEnabled;
  if (Array.isArray(state.messages)) storeLocalJson(PUBLIC_MESSAGES_KEY, state.messages);
  if (Array.isArray(state.emailHistory)) storeLocalJson(EMAIL_HISTORY_KEY, state.emailHistory.slice(0, 500));
  if (Array.isArray(state.runLog)) storeLocalJson(RUN_LOG_KEY, state.runLog.slice(0, 80));
  if (Array.isArray(state.optOutEmails)) {
    optOutEmails = new Set(state.optOutEmails.map(normalizeEmail).filter(Boolean));
    storeLocalJson(OPT_OUT_KEY, [...optOutEmails].sort());
  }
  if (state.consentDates && typeof state.consentDates === "object") {
    consentDates = normalizeConsentDates(state.consentDates);
    storeLocalJson(CONSENT_DATES_KEY, Object.fromEntries(consentDates));
  }
}

function storeLocalJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
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
  refs.runHistorySelect.addEventListener("change", () => {
    selectedRunId = refs.runHistorySelect.value;
    renderRunHistory();
  });
  refs.adminToEmail.addEventListener("input", () => {
    currentContactId = "";
  });
  refs.adminCcEmail.addEventListener("input", () => {
    settings.ccEmail = refs.adminCcEmail.value;
    persistSettings();
  });
  refs.settingEmailFormat.addEventListener("change", syncEmailFormatControls);
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
    case "toggle-run-history":
      refs.runHistoryPanel.hidden = !refs.runHistoryPanel.hidden;
      refs.toggleRunHistory.setAttribute("aria-expanded", String(!refs.runHistoryPanel.hidden));
      if (!refs.runHistoryPanel.hidden) renderRunHistory();
      break;
    case "download-workbook":
      downloadWorkbookCsv();
      break;
    case "select-visible":
      const visibleEligible = visibleContacts.filter((contact) => activeContactRecipientTargets(contact).length > 0);
      visibleEligible.forEach((contact) => selectedContactIds.add(contact.id));
      renderAll();
      toast(`${visibleEligible.length.toLocaleString()} visible consented contact${visibleEligible.length === 1 ? "" : "s"} selected.`);
      break;
    case "select-all-filtered":
      const filtered = filteredContacts().filter((contact) => activeContactRecipientTargets(contact).length > 0);
      filtered.forEach((contact) => selectedContactIds.add(contact.id));
      renderAll();
      toast(`${filtered.length.toLocaleString()} consented contact${filtered.length === 1 ? "" : "s"} selected from the current filters.`);
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
  refs.settingSmtpHost.value = settings.smtpHost || DEFAULT_SMTP_HOST;
  refs.settingSmtpPort.value = settings.smtpPort || DEFAULT_SMTP_PORT;
  refs.settingSmtpSecurity.value = normalizeSmtpSecurity(settings.smtpSecurity);
  refs.settingSmtpUser.value = settings.smtpUser || settings.fromEmail || DEFAULT_MAILBOX;
  refs.settingSmtpPassword.value = "";
  refs.settingSmtpStatus.value =
    (serverAvailable && serverSmtpReady) || settings.smtpPasswordSet
      ? "SMTP password saved. Private Email ready."
      : "SMTP password not saved.";
  refs.settingSendingEnabled.checked = !!settings.sendingEnabled;
  refs.settingEmailFormat.value = settings.emailFormat === "html" ? "html" : "plain";
  refs.settingTrackOpens.checked = !!settings.trackOpens;
  refs.settingDailySendLimit.value = settings.dailySendLimit;
  syncEmailFormatControls();
  refs.scheduleFrequency.value = settings.frequency;
  refs.scheduleDay.value = settings.day;
  refs.scheduleTime.value = settings.time;
  refs.scheduleDelay.min = String(PRIVATE_EMAIL_MIN_DELAY_SECONDS);
  refs.scheduleDelay.step = "1";
  settings.delaySeconds = normalizeSendDelay(settings.delaySeconds);
  refs.scheduleDelay.value = settings.delaySeconds;
  refs.scheduleDelay.title = `Minimum ${PRIVATE_EMAIL_MIN_DELAY_SECONDS} seconds between live send attempts.`;
  refs.openDraftsDuringRun.checked = !!settings.openDrafts;
  refs.adminCcEmail.value = settings.ccEmail || "";
  refs.consentDate.value = refs.consentDate.value || todayDateValue();
}

function syncEmailFormatControls() {
  const plainText = refs.settingEmailFormat.value !== "html";
  refs.settingTrackOpens.disabled = plainText;
  if (plainText) refs.settingTrackOpens.checked = false;
}

function renderAll() {
  renderMetrics();
  renderMessages();
  renderComposer();
  renderContacts();
  renderOptOuts();
  renderWebmailLinks();
  renderRunLog();
  renderRunHistory();
  window.lucide?.createIcons();
}

function renderMetrics() {
  const history = loadEmailHistory();
  const retainedSentCount = history.filter((item) => /accepted|sent|opened|draft opened/i.test(item.status || "")).length;
  const openedCount = history.filter((item) => item.viewedAt || item.openedAt || Number(item.openCount || 0) > 0).length;
  const totalRecipientCount = contactsWithEmail.reduce((total, contact) => total + contactRecipientTargets(contact).length, 0);
  const selectedContacts = [...selectedContactIds].map((id) => contacts.find((contact) => contact.id === id)).filter(Boolean);
  const selectedRecipientCount = new Set(
    selectedContacts.flatMap((contact) => activeContactRecipientTargets(contact).map((recipient) => normalizeEmail(recipient.email)))
  ).size;
  refs.metricContacts.textContent = contacts.length.toLocaleString();
  refs.metricSelected.textContent = selectedRecipientCount.toLocaleString();
  refs.metricContactsLabel.textContent = `${totalRecipientCount.toLocaleString()} individual coach emails`;
  refs.metricSelectedLabel.textContent =
    selectedContactIds.size > 0
      ? `${selectedContactIds.size.toLocaleString()} schools selected for ${selectedRecipientCount.toLocaleString()} unique emails`
      : "Email-ready for next run";
  refs.metricMessages.textContent = loadMessages().length.toLocaleString();
  refs.metricStorageLabel.textContent = serverAvailable ? "Saved permanently on server" : "Saved in this browser";
  const acceptedCount = deliveryStats ? deliveryStats.accepted : retainedSentCount;
  refs.metricSent.textContent = `${acceptedCount.toLocaleString()}${deliveryStats?.baselineLimited ? "+" : ""}`;
  const acceptedBreakdown = deliveryStats
    ? `${deliveryStats.smtpAccepted.toLocaleString()} SMTP${deliveryStats.mailAccepted ? `, ${deliveryStats.mailAccepted.toLocaleString()} PHP mail` : ""}`
    : "";
  refs.metricSentLabel.textContent = deliveryStats
    ? deliveryStats.baselineLimited
      ? `Minimum accepted; exact counting is now active (${acceptedBreakdown})`
      : `Sending-server accepted; delivery not confirmed (${acceptedBreakdown})`
    : "Accepted entries retained in this browser; delivery not confirmed";
  refs.metricOpened.textContent = openedCount.toLocaleString();
  refs.metricConsents.textContent = consentDates.size.toLocaleString();
  refs.metricOptOuts.textContent = optOutEmails.size.toLocaleString();
  const lastRun = runState.total ? runState : deliveryStats?.lastRun;
  const lastRunTotal = Math.max(0, Number(lastRun?.total || 0));
  const lastRunProcessed = Math.max(0, Number(lastRun?.processed || 0));
  const lastRunAccepted = Math.max(0, Number(lastRun?.accepted || 0));
  const lastRunFailed = Math.max(0, Number(lastRun?.failed || 0));
  const lastRunPrepared = Math.max(0, Number(lastRun?.prepared || 0));
  refs.metricProgress.textContent = lastRunTotal ? `${Math.round((lastRunProcessed / lastRunTotal) * 100)}%` : "0%";
  refs.metricRunLabel.textContent = lastRunTotal
    ? `${runState.active ? "In progress · " : ""}${lastRunAccepted.toLocaleString()} accepted, ${lastRunFailed.toLocaleString()} failed${lastRunPrepared ? `, ${lastRunPrepared.toLocaleString()} prepared` : ""}`
    : "Ready";
  const dailyQuotaLabel = dailySendStatus
    ? `${dailySendStatus.attempts} of ${dailySendStatus.limit} UTC daily attempts used`
    : `UTC daily attempt limit ${settings.dailySendLimit}`;
  if (refs.backendStatusTitle) {
    refs.backendStatusTitle.textContent =
      serverAvailable && serverSmtpReady
        ? settings.sendingEnabled ? "Live sending enabled" : "Live sending paused"
        : serverAvailable && serverMailAvailable
          ? "Authenticated SMTP required"
          : "Draft fallback ready";
  }
  if (refs.backendStatus) {
    refs.backendStatus.textContent =
      serverAvailable && serverSmtpReady
        ? settings.sendingEnabled
          ? `Live sends use ${settings.emailFormat === "html" ? "HTML with a plain-text alternative" : "plain text"} at no more than one recipient every ${settings.delaySeconds}s; ${dailyQuotaLabel}. Open tracking is ${settings.trackOpens ? "enabled" : "off"}. SMTP acceptance does not prove inbox delivery.`
          : `SMTP is configured for ${settings.smtpUser || settings.fromEmail || DEFAULT_MAILBOX}, but the send API is paused. Runs prepare drafts until live sending is explicitly enabled in Settings.`
        : serverAvailable && serverMailAvailable
          ? "SMTP password is not saved yet. PHP mail exists on the host, but coach runs stay in draft fallback until Private Email SMTP is ready."
          : "Static mode prepares drafts. Live sending requires the cPanel API, configured SMTP, and explicit enablement.";
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
                <span class="item-title">${escapeHtml(message.name || "Unknown sender")}</span>
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
    refs.consentDate.value = consentDateForContact(contact) || todayDateValue();
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
  if (refs.contactSendableNote) {
    const selectedGroup = refs.adminContactGroup.value;
    const groupLabel = selectedGroup ? refs.adminContactGroup.options[refs.adminContactGroup.selectedIndex]?.textContent || "current group" : "all groups";
    const eligibleCount = visibleContacts.filter((contact) => activeContactRecipientTargets(contact).length > 0).length;
    refs.contactSendableNote.textContent = `Showing ${eligibleCount.toLocaleString()} consented contacts for ${groupLabel} from ${contacts.length.toLocaleString()} total workbook rows.`;
  }
  refs.adminContactList.innerHTML = visibleContacts.length
    ? visibleContacts
        .map(
          (contact) => {
            const optStatus = contactOptOutStatus(contact);
            const isSuppressed = isContactSuppressed(contact);
            const contactConsentDate = consentDateForContact(contact);
            if (isSuppressed) selectedContactIds.delete(contact.id);
            return `
        <article class="admin-contact-row ${contact.id === currentContactId ? "active" : ""}">
          <label class="check-row">
            <input type="checkbox" data-select-contact="${escapeAttr(contact.id)}" ${selectedContactIds.has(contact.id) ? "checked" : ""} ${isSuppressed ? "disabled" : ""}>
            <span class="school-logo-mini" style="--school-color:${escapeAttr(contact.primaryColor || "#164b88")};--school-accent:${escapeAttr(logoTextColor(contact))}">${escapeHtml(schoolInitials(contact))}</span>
            <span>
              <span class="item-title">${escapeHtml(contact.displayName || contact.school)}</span>
              <small>${contactRecipientTargets(contact).length.toLocaleString()} recipient${contactRecipientTargets(contact).length === 1 ? "" : "s"} | ${escapeHtml(contactEmail(contact) || "No email")} | ${escapeHtml(contact.division || "")}</small>
              <em class="contact-status ${isSuppressed ? "suppressed" : optStatus.includes("opted out") ? "partial" : "clear"}">${escapeHtml(optStatus)}</em>
            </span>
          </label>
          <div class="contact-row-actions">
            <button class="ghost-button compact" type="button" data-load-contact="${escapeAttr(contact.id)}">Load Draft</button>
            <label class="contact-consent-date">Consent date<input type="date" max="${todayDateValue()}" value="${escapeAttr(contactConsentDate || todayDateValue())}" data-consent-date="${escapeAttr(contact.id)}"></label>
            <button class="ghost-button compact" type="button" data-opt-in-contact="${escapeAttr(contact.id)}">${contactConsentDate ? "Update Consent" : "Record Consent"}</button>
            ${!isSuppressed ? `<button class="ghost-button compact" type="button" data-opt-out-contact="${escapeAttr(contact.id)}">Opt Out</button>` : ""}
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

function logoTextColor(contact = {}) {
  const background = contact.primaryColor || "#164b88";
  const accent = contact.accentColor || "#ffffff";
  if (contrastRatio(background, accent) >= 4.5) return accent;
  return contrastRatio(background, "#07111F") > contrastRatio(background, "#FFFFFF") ? "#07111F" : "#FFFFFF";
}

function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function relativeLuminance(hex) {
  const clean = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return 0;
  const values = [0, 2, 4].map((offset) => parseInt(clean.slice(offset, offset + 2), 16) / 255);
  const linear = values.map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

async function saveSettingsFromForm() {
  toast("Saving settings...");
  const previousSendingEnabled = !!settings.sendingEnabled;
  const requestedSendingEnabled = refs.settingSendingEnabled.checked;
  if (
    requestedSendingEnabled &&
    !previousSendingEnabled &&
    !window.confirm("Enable live sending only after the email provider confirms the restriction is cleared. Continue?")
  ) {
    refs.settingSendingEnabled.checked = false;
    toast("Live sending remains paused.");
    return;
  }
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
    refs.settingCode.value = "";
    refs.settingCodeConfirm.value = "";
  }

  settings.forwardEmail = refs.settingForward.value.trim() || defaultSettings.forwardEmail;
  settings.fromEmail = refs.settingFrom.value.trim() || defaultSettings.fromEmail;
  settings.webmailEmail = refs.settingWebmailEmail.value.trim() || defaultSettings.webmailEmail;
  settings.webmailUrl = normalizeWebmailUrl(refs.settingWebmailUrl.value.trim()) || defaultSettings.webmailUrl;
  settings.smtpHost = refs.settingSmtpHost.value.trim() || defaultSettings.smtpHost;
  settings.smtpPort = Math.max(1, Number(refs.settingSmtpPort.value) || defaultSettings.smtpPort);
  settings.smtpSecurity = normalizeSmtpSecurity(refs.settingSmtpSecurity.value);
  settings.smtpUser = refs.settingSmtpUser.value.trim() || settings.fromEmail || defaultSettings.smtpUser;
  settings.sendingEnabled = previousSendingEnabled;
  settings.emailFormat = refs.settingEmailFormat.value === "html" ? "html" : "plain";
  settings.trackOpens = settings.emailFormat === "html" && refs.settingTrackOpens.checked;
  settings.dailySendLimit = normalizeDailySendLimit(refs.settingDailySendLimit.value);
  refs.settingDailySendLimit.value = settings.dailySendLimit;
  const smtpPassword = refs.settingSmtpPassword.value.trim();
  persistSettings();
  const saved = serverAvailable ? await syncSettings({ newCode, ...(smtpPassword ? { smtpPassword } : {}) }) : false;
  let gateSaved = true;
  if (serverAvailable && requestedSendingEnabled !== previousSendingEnabled) {
    gateSaved = !requestedSendingEnabled || saved
      ? await setServerSendingEnabled(requestedSendingEnabled)
      : false;
  } else if (!serverAvailable) {
    settings.sendingEnabled = false;
    persistSettings();
  }
  refs.settingSmtpPassword.value = "";
  hydrateSettings();
  renderWebmailLinks();
  renderMetrics();
  if (serverAvailable && saved && gateSaved && smtpPassword) {
    toast("Settings and SMTP password saved permanently.");
  } else if (serverAvailable && saved && gateSaved) {
    toast("Settings saved permanently.");
  } else if (serverAvailable) {
    toast("The server save did not fully complete. Live sending was not newly enabled.");
  } else if (smtpPassword) {
    toast("Settings saved in this browser. The SMTP password needs the server API to save permanently.");
  } else {
    toast("Settings saved in this browser.");
  }
}

async function saveSchedule() {
  settings.frequency = refs.scheduleFrequency.value;
  settings.day = refs.scheduleDay.value;
  settings.time = refs.scheduleTime.value;
  settings.delaySeconds = normalizeSendDelay(refs.scheduleDelay.value);
  refs.scheduleDelay.value = settings.delaySeconds;
  settings.openDrafts = refs.openDraftsDuringRun.checked;
  persistSettings();
  const saved = serverAvailable ? await syncSettings() : false;
  logRun(`Auto-send schedule saved: ${settings.frequency}, ${settings.day} at ${settings.time}, ${settings.delaySeconds}s between contacts.`);
  renderRunLog();
  toast(serverAvailable && saved ? "Schedule saved permanently." : "Schedule saved in this browser only.");
}

async function startSendRun() {
  if (runState.active) {
    toast("A send run is already active.");
    return;
  }
  settings.delaySeconds = normalizeSendDelay(refs.scheduleDelay.value);
  refs.scheduleDelay.value = settings.delaySeconds;
  settings.openDrafts = refs.openDraftsDuringRun.checked;
  persistSettings();

  const targets = runTargets();
  if (runTargets.skippedOptOuts?.length) {
    logRun(`${runTargets.skippedOptOuts.length} selected contact${runTargets.skippedOptOuts.length === 1 ? "" : "s"} skipped because recipients were opted out or missing a consent date.`);
  }
  if (runTargets.skippedDuplicates?.length) {
    logRun(`${runTargets.skippedDuplicates.length} duplicate recipient${runTargets.skippedDuplicates.length === 1 ? " was" : "s were"} removed from this run.`);
  }
  if (!targets.length) {
    toast("Select contacts with a saved consent date or record consent for the manual email first.");
    return;
  }

  const liveSending = serverAvailable && serverCanSend && settings.sendingEnabled && refs.settingSendingEnabled.checked && !settings.openDrafts;
  const configuredRunLimit = LIVE_RUN_RECIPIENT_LIMIT;
  if (liveSending && targets.length > configuredRunLimit) {
    toast("Every live send requires a separate confirmation for exactly one recipient. Reduce the selection or prepare drafts instead.");
    return;
  }
  const confirmationMessage = targets.length === 1
    ? `Submit one live email to ${targets[0].email}?\n\nSubject: ${targets[0].subject}\n\nSMTP acceptance does not confirm inbox delivery.`
    : `Submit ${targets.length} unique emails to the sending server at ${settings.delaySeconds}-second intervals? SMTP acceptance does not confirm inbox delivery.`;
  if (
    liveSending &&
    !window.confirm(confirmationMessage)
  ) {
    logRun("Live send run canceled before any message was submitted.");
    renderRunLog();
    toast("Live send run canceled.");
    return;
  }

  refs.progressPanel.hidden = false;
  const startedAt = new Date().toISOString();
  runState = {
    active: true,
    mode: liveSending ? "send" : "draft",
    total: targets.length,
    processed: 0,
    accepted: 0,
    failed: 0,
    prepared: 0,
    smtpAccepted: 0,
    mailAccepted: 0,
    unknownAccepted: 0,
    runId: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt,
    updatedAt: startedAt,
    completedAt: "",
    lastError: ""
  };
  selectedRunId = runState.runId;
  logRun(`${liveSending ? "Confirmed live send" : "Draft preparation"} run started for ${targets.length} unique recipient${targets.length === 1 ? "" : "s"} at ${settings.delaySeconds}s intervals.`);
  updateProgress();
  await syncRunState("start");
  toast(liveSending ? "Confirmed live send run started." : "Draft preparation run started.");

  const finishRun = async () => {
    runState.active = false;
    runTimer = null;
    if (liveSending) {
      settings.sendingEnabled = false;
      serverCanSend = false;
      refs.settingSendingEnabled.checked = false;
      persistSettings();
      await setServerSendingEnabled(false);
    }
    runState.updatedAt = new Date().toISOString();
    runState.completedAt = runState.updatedAt;
    const summary = `${runState.accepted} accepted, ${runState.failed} failed${runState.prepared ? `, ${runState.prepared} prepared` : ""}`;
    logRun(`Send run complete: ${summary}.`);
    updateProgress();
    await syncRunState("finish");
    updateProgress();
    toast(`Send run complete: ${summary}.`);
  };

  const step = async () => {
    const target = targets[runState.processed];
    if (!target) {
      await finishRun();
      return;
    }

    refs.adminToEmail.value = target.email;
    refs.adminSubject.value = target.subject;
    refs.adminEmailBody.value = target.body;
    let status = "Prepared";
    let serverLoggedHistory = false;
    if (liveSending) {
      const result = await sendEmailTarget(target, {
        runId: runState.runId,
        runTotal: runState.total,
        runPosition: runState.processed + 1,
        runStartedAt: runState.startedAt,
        runMode: runState.mode,
        runConfirmed: true
      });
      serverLoggedHistory = result.savedHistory;
      status = result.sent ? "Accepted by SMTP" : "Send failed";
      if (result.sent) {
        runState.accepted += 1;
        if (result.transport === "smtp") runState.smtpAccepted += 1;
        else if (result.transport === "php-mail") runState.mailAccepted += 1;
        else runState.unknownAccepted += 1;
        logRun(`Accepted individualized email for ${target.label} <${target.email}> via ${result.transport === "smtp" ? "SMTP" : "server mail"}.`);
      } else {
        runState.failed += 1;
        runState.lastError = result.error || "The sending server did not accept this message.";
        logRun(`Could not send individualized email for ${target.label} <${target.email}>. ${runState.lastError}`);
      }
      if (result.accountingWarning) logRun(`Accounting warning for ${target.email}: ${result.accountingWarning}`);
    } else {
      logRun(`Prepared individualized draft for ${target.label} <${target.email}>.`);
      if (settings.openDrafts) openMailDraft(target, true);
      status = settings.openDrafts ? "Draft opened" : "Prepared";
      runState.prepared += 1;
    }
    if (status !== "Accepted by SMTP" && !serverLoggedHistory) recordEmailHistory(target, status);
    runState.processed += 1;
    runState.updatedAt = new Date().toISOString();
    updateProgress();
    if (settings.openDrafts && serverAvailable && runState.processed % 25 === 0) await syncRunState("progress");
    if (runState.processed >= runState.total) {
      await finishRun();
      return;
    }
    runTimer = setTimeout(step, settings.delaySeconds * 1000);
  };

  step();
}

async function sendEmailTarget(target, runMetadata = {}) {
  for (let throttleRetry = 0; throttleRetry < 60; throttleRetry += 1) {
    try {
      const response = await fetch(`${API_BASE}/send-email.php`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...target, ...runMetadata })
      });
      const result = await response.json();
      if (result?.dailySendStatus) dailySendStatus = normalizeDailySendStatus(result.dailySendStatus);
      if (response.status === 429 && result?.rateLimited) {
        const retryAfter = Math.min(300, Math.max(1, Number(result.retryAfter || 1)));
        toast(`Mailbox pacing is active. Retrying in ${retryAfter}s.`);
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        continue;
      }
      if (result?.deliveryStats) deliveryStats = normalizeDeliveryStats(result.deliveryStats);
      if (result?.historyItem) {
        saveOrUpdateHistoryItem(result.historyItem);
        return {
          sent: !!result.sent,
          savedHistory: result.historySaved !== false,
          transport: String(result.transport || ""),
          error: String(result.error || "").slice(0, 500),
          accountingWarning: String(result.accountingWarning || "").slice(0, 500)
        };
      }
      return { sent: false, savedHistory: false, transport: "", error: String(result?.error || `Send server returned ${response.status}.`).slice(0, 500), accountingWarning: "" };
    } catch (error) {
      return { sent: false, savedHistory: false, transport: "", error: "The send request could not reach the server.", accountingWarning: "" };
    }
  }
  return { sent: false, savedHistory: false, transport: "", error: "Mailbox pacing did not clear in time.", accountingWarning: "" };
}

function runTargets() {
  runTargets.skippedOptOuts = [];
  runTargets.skippedDuplicates = [];
  const selectedContacts = [...selectedContactIds].map((id) => contacts.find((contact) => contact.id === id)).filter(Boolean);
  const targets = selectedContacts.flatMap((contact) => {
    const recipients = activeContactRecipientTargets(contact);
    if (!recipients.length) {
      runTargets.skippedOptOuts.push(contact.displayName || contact.school || contact.id);
      return [];
    }
    return recipients.map((recipient) => targetFromRecipient(contact, recipient));
  });

  const manualEmail = refs.manualEmail.value.trim();
  if (manualEmail) {
    const activeManualEmails = activeEmailListFromString(manualEmail);
    if (activeManualEmails.length) {
      activeManualEmails.forEach((email) => targets.push({
        email,
        label: "manual recipient",
        subject: refs.adminSubject.value,
        body: refs.adminEmailBody.value,
        websiteLink: `${PUBLIC_SITE_ORIGIN}/`,
        videoLink: `${PUBLIC_SITE_ORIGIN}/#video`
      }));
    } else {
      runTargets.skippedOptOuts.push("manual recipient");
    }
  }
  const seenEmails = new Set();
  return targets.filter((target) => {
    const email = normalizeEmail(target.email);
    if (!email || seenEmails.has(email)) {
      if (email) runTargets.skippedDuplicates.push(email);
      return false;
    }
    seenEmails.add(email);
    target.email = email;
    return true;
  });
}

function updateProgress() {
  const percent = runState.total ? Math.round((runState.processed / runState.total) * 100) : 0;
  refs.progressText.textContent = `${percent}%`;
  refs.progressCount.textContent = `${runState.processed} of ${runState.total} processed · ${runState.accepted} accepted · ${runState.failed} failed${runState.prepared ? ` · ${runState.prepared} prepared` : ""}`;
  refs.progressBar.style.width = `${percent}%`;
  renderMetrics();
  renderRunLog();
  renderRunHistory();
}

function normalizeRunSummary(rawRun = {}) {
  return {
    id: String(rawRun.id || ""),
    mode: rawRun.mode === "draft" ? "draft" : "send",
    total: Math.max(0, Number(rawRun.total || 0)),
    processed: Math.max(0, Number(rawRun.processed || 0)),
    accepted: Math.max(0, Number(rawRun.accepted || 0)),
    failed: Math.max(0, Number(rawRun.failed || 0)),
    prepared: Math.max(0, Number(rawRun.prepared || 0)),
    smtpAccepted: Math.max(0, Number(rawRun.smtpAccepted || 0)),
    mailAccepted: Math.max(0, Number(rawRun.mailAccepted || 0)),
    unknownAccepted: Math.max(0, Number(rawRun.unknownAccepted || 0)),
    startedAt: String(rawRun.startedAt || ""),
    updatedAt: String(rawRun.updatedAt || ""),
    completedAt: String(rawRun.completedAt || ""),
    lastError: String(rawRun.lastError || "").slice(0, 500)
  };
}

function currentRunSummary() {
  if (!runState.runId) return null;
  return normalizeRunSummary({ ...runState, id: runState.runId });
}

function runHistoryEntries() {
  const runs = Array.isArray(deliveryStats?.runs) ? deliveryStats.runs.map(normalizeRunSummary) : [];
  const currentRun = currentRunSummary();
  if (currentRun) {
    const existingIndex = runs.findIndex((run) => run.id === currentRun.id);
    if (existingIndex >= 0) runs.splice(existingIndex, 1);
    runs.unshift(currentRun);
  }
  const seen = new Set();
  return runs.filter((run) => run.id && !seen.has(run.id) && seen.add(run.id)).slice(0, 50);
}

async function syncRunState(phase) {
  if (!serverAvailable || !runState.runId) {
    renderRunHistory();
    return false;
  }
  const response = await apiRequest(
    "record-run",
    { phase, run: currentRunSummary() },
    { quiet: true }
  );
  if (!response?.ok || !response.deliveryStats) {
    renderRunHistory();
    return false;
  }
  deliveryStats = normalizeDeliveryStats(response.deliveryStats);
  renderRunHistory();
  return true;
}

function renderRunHistory() {
  if (!refs.runHistorySelect) return;
  const runs = runHistoryEntries();
  refs.runHistorySelect.replaceChildren();
  refs.runHistorySelect.disabled = runs.length === 0;
  refs.runHistoryEmpty.hidden = runs.length > 0;
  refs.runHistoryDetail.hidden = runs.length === 0;
  if (!runs.length) {
    selectedRunId = "";
    return;
  }

  if (!runs.some((run) => run.id === selectedRunId)) selectedRunId = runs[0].id;
  runs.forEach((run) => {
    const option = document.createElement("option");
    option.value = run.id;
    option.textContent = formatRunOption(run);
    refs.runHistorySelect.append(option);
  });
  refs.runHistorySelect.value = selectedRunId;

  const run = runs.find((item) => item.id === selectedRunId) || runs[0];
  const isActive = run.id === runState.runId && runState.active;
  const isComplete = !isActive && (!!run.completedAt || (run.total > 0 && run.processed >= run.total));
  const status = isActive ? "In progress" : isComplete ? "Complete" : "Incomplete";
  const statusClass = isActive ? "active" : isComplete ? "complete" : "incomplete";
  const transportParts = [];
  if (run.smtpAccepted) transportParts.push(`${run.smtpAccepted.toLocaleString()} SMTP`);
  if (run.mailAccepted) transportParts.push(`${run.mailAccepted.toLocaleString()} PHP mail`);
  if (run.unknownAccepted) transportParts.push(`${run.unknownAccepted.toLocaleString()} unclassified`);

  refs.runHistoryAccepted.textContent = `${run.accepted.toLocaleString()} of ${run.total.toLocaleString()} accepted`;
  refs.runHistorySubtitle.textContent = run.mode === "draft"
    ? `${run.prepared.toLocaleString()} prepared / ${run.processed.toLocaleString()} processed`
    : `${run.processed.toLocaleString()} processed / ${run.failed.toLocaleString()} failed`;
  refs.runHistoryStatus.textContent = status;
  refs.runHistoryStatus.classList.remove("run-history-status-active", "run-history-status-complete", "run-history-status-incomplete");
  refs.runHistoryStatus.classList.add(`run-history-status-${statusClass}`);
  refs.runHistoryProcessed.textContent = `${run.processed.toLocaleString()} of ${run.total.toLocaleString()}`;
  refs.runHistoryFailed.textContent = run.failed.toLocaleString();
  refs.runHistoryTransport.textContent = transportParts.join(" / ") || "No accepted sends";
  refs.runHistoryStarted.textContent = formatRunHistoryDate(run.startedAt);
  refs.runHistoryFinished.textContent = formatRunHistoryDate(run.completedAt || run.updatedAt);
  refs.runHistoryDuration.textContent = formatRunDuration(run.startedAt, isActive ? new Date().toISOString() : run.completedAt || run.updatedAt);
  refs.runHistoryError.textContent = run.lastError ? `Last error: ${run.lastError}` : "";
  refs.runHistoryError.hidden = !run.lastError;
}

function formatRunOption(run) {
  const date = formatRunHistoryDate(run.startedAt, "Unknown time");
  const count = run.mode === "draft"
    ? `${run.prepared.toLocaleString()}/${run.total.toLocaleString()} prepared`
    : `${run.accepted.toLocaleString()}/${run.total.toLocaleString()} accepted`;
  return `${date} - ${count}`;
}

function formatRunHistoryDate(value, fallback = "Not recorded") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return formatDateTime(date.toISOString());
}

function formatRunDuration(startedAt, endedAt) {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "Not recorded";
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
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
    toast(enteredEmails.length ? "Recipients are opted out or missing a saved consent date." : "Add a recipient email first.");
    return;
  }
  const params = new URLSearchParams({
    cc: activeEmailsFromString(refs.adminCcEmail.value),
    subject: target.subject || refs.adminSubject.value,
    body: target.body || refs.adminEmailBody.value
  });
  window.open(`mailto:${activeEmail}?${params.toString()}`, "_blank");
  if (!quiet) toast("Draft opened in your mail app.");
}

function markCurrentSent() {
  const contact = currentContact();
  if (!contact) {
    const enteredEmails = parseEmails(refs.adminToEmail.value);
    const consentedEmails = activeEmailListFromString(refs.adminToEmail.value);
    toast(consentedEmails.length
      ? "Manual draft is consented and ready."
      : enteredEmails.length
        ? "Manual draft is opted out or missing a saved consent date."
        : "Add a recipient email first.");
    return;
  }
  const recipients = activeContactRecipientTargets(contact);
  if (!recipients.length) {
    toast("This contact is opted out or missing a saved consent date.");
    return;
  }
  recipients.forEach((recipient) => recordEmailHistory(targetFromRecipient(contact, recipient), "Manually recorded as sent"));
  logRun(`Marked sent for ${recipients.length} individual email${recipients.length === 1 ? "" : "s"} for ${contact.displayName || contact.school}.`);
  selectedContactIds.delete(contact.id);
  renderAll();
  toast(`${recipients.length} individual email${recipients.length === 1 ? "" : "s"} marked sent.`);
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

function contactRecipientTargets(contact = {}) {
  const recipients = [];
  const headNames = splitNames(contact.headCoach);
  const assistantNames = splitNames(contact.assistantCoach);

  parseEmails(contact.headEmail).forEach((email, index) => {
    recipients.push({
      email,
      name: isUsableCoachName(headNames[index]) ? headNames[index] : isUsableCoachName(contact.headCoach) ? contact.headCoach : "",
      role: "Head Coach"
    });
  });

  parseEmails(contact.assistantEmail).forEach((email, index) => {
    recipients.push({
      email,
      name: isUsableCoachName(assistantNames[index]) ? assistantNames[index] : "",
      role: "Assistant Coach"
    });
  });

  const byEmail = new Map();
  recipients.forEach((recipient) => {
    const key = normalizeEmail(recipient.email);
    const existing = byEmail.get(key);
    if (!existing) {
      byEmail.set(key, { ...recipient, email: key });
      return;
    }
    if (!existing.name && recipient.name) existing.name = recipient.name;
    if (existing.role !== "Head Coach" && recipient.role === "Head Coach") existing.role = "Head Coach";
  });
  return [...byEmail.values()];
}

function activeContactRecipientTargets(contact = {}) {
  return contactRecipientTargets(contact).filter((recipient) => isEmailConsented(recipient.email) && !optOutEmails.has(normalizeEmail(recipient.email)));
}

function targetFromRecipient(contact = {}, recipient = {}) {
  const context = recipientContext(contact, recipient);
  const schoolLabel = contact.displayName || contact.school || "Selected contact";
  const recipientLabel = recipient.name ? `${schoolLabel} - ${recipient.name}` : `${schoolLabel} - ${recipient.role || "Coach"}`;
  return {
    contactId: contact.id,
    email: normalizeEmail(recipient.email),
    label: recipientLabel,
    school: schoolLabel,
    recipientName: recipient.name || "",
    recipientRole: recipient.role || "",
    subject: `Royce Castle | 6'5" Shooting Guard | Rigby High School 2024`,
    body: buildEmail(context),
    quickResponseLink: buildQuickResponseLink(context),
    websiteLink: `${PUBLIC_SITE_ORIGIN}/`,
    videoLink: `${PUBLIC_SITE_ORIGIN}/#video`
  };
}

function recipientContext(contact = {}, recipient = {}) {
  return {
    ...contact,
    recipientEmail: normalizeEmail(recipient.email),
    recipientName: recipient.name || "",
    recipientRole: recipient.role || ""
  };
}

function contactTargetEmail(contact = {}) {
  return contactEmails(contact)
    .filter((email) => isEmailConsented(email) && !optOutEmails.has(normalizeEmail(email)))
    .join(", ");
}

function activeEmailListFromString(value = "") {
  return parseEmails(value).filter((email) => isEmailConsented(email) && !optOutEmails.has(normalizeEmail(email)));
}

function activeEmailsFromString(value = "") {
  return activeEmailListFromString(value).join(", ");
}

function isContactSuppressed(contact = {}) {
  return contactEmails(contact).length > 0 && activeContactRecipientTargets(contact).length === 0;
}

function contactOptOutStatus(contact = {}) {
  const emails = contactEmails(contact);
  if (!emails.length) return "No saved email";
  const blocked = emails.filter((email) => optOutEmails.has(normalizeEmail(email))).length;
  const consented = emails.filter((email) => isEmailConsented(email) && !optOutEmails.has(normalizeEmail(email))).length;
  if (blocked === emails.length) return "Opted out";
  if (consented === emails.length) return consentDateForContact(contact) ? `Consent ${formatConsentDate(consentDateForContact(contact))}` : "Consented";
  if (consented > 0) return `${consented} of ${emails.length} consented`;
  if (blocked > 0) return `${blocked} of ${emails.length} opted out; consent required`;
  return "Consent date required";
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
    refs.runSuppressionSummary.textContent = `${consentDates.size.toLocaleString()} dated consent${consentDates.size === 1 ? "" : "s"}; ${optOutEmails.size.toLocaleString()} opted-out email${optOutEmails.size === 1 ? "" : "s"} excluded.`;
  }
}

async function saveOptOutsFromForm() {
  const requestedEmails = parseEmails(refs.optOutList.value);
  if (!requestedEmails.length) {
    toast("Add at least one email to the opt-out list.");
    return;
  }
  const saveResult = await addSuppressionsThenRemoveConsent(requestedEmails);
  renderAll();
  toast(saveResult === "permanent"
    ? "Opt-outs added permanently."
    : saveResult === "local"
      ? "Opt-outs saved in this browser only; live sending remains paused."
      : "The opt-out update did not fully save on the server; live sending remains paused.");
}

async function optOutCurrentContact() {
  const contact = currentContact();
  const emails = contact ? contactEmails(contact) : parseEmails(refs.adminToEmail.value);
  if (!emails.length) {
    toast("Load a contact or enter an email to opt out.");
    return;
  }
  const saveResult = await addSuppressionsThenRemoveConsent(emails);
  renderAll();
  toast(saveResult === "permanent"
    ? `${emails.length} email${emails.length === 1 ? "" : "s"} opted out permanently.`
    : saveResult === "local"
      ? `${emails.length} email${emails.length === 1 ? "" : "s"} opted out in this browser only; live sending remains paused.`
      : `The opt-out update did not fully save on the server; live sending remains paused.`);
}

async function optInCurrentContact() {
  const contact = currentContact();
  const manualEmails = parseEmails(refs.manualEmail.value);
  const emails = manualEmails.length ? manualEmails : contact ? contactEmails(contact) : parseEmails(refs.adminToEmail.value);
  const consentDate = refs.consentDate.value;
  if (!emails.length) {
    toast("Load a contact or enter an email to opt in.");
    return;
  }
  if (!isValidConsentDate(consentDate)) {
    toast("Choose a valid consent date that is not in the future.");
    return;
  }
  if (!confirmConsentForEmails(emails, consentDate)) return;
  const saveResult = await saveConsentThenRemoveSuppression(emails, consentDate);
  renderAll();
  toast(saveResult === "permanent"
    ? `${emails.length} consent date${emails.length === 1 ? "" : "s"} saved permanently for ${formatConsentDate(consentDate)}.`
    : saveResult === "local"
      ? `${emails.length} consent date${emails.length === 1 ? "" : "s"} saved in this browser for ${formatConsentDate(consentDate)}; live sending remains paused.`
      : "The consent update did not fully save on the server; suppression was not removed and live sending remains paused.");
}

async function optOutContactById(contactId) {
  const contact = contacts.find((row) => row.id === contactId);
  if (!contact) return;
  const emails = contactEmails(contact);
  const saveResult = await addSuppressionsThenRemoveConsent(emails);
  renderAll();
  toast(saveResult === "permanent"
    ? `${contact.displayName || contact.school} opted out permanently.`
    : saveResult === "local"
      ? `${contact.displayName || contact.school} opted out in this browser only; live sending remains paused.`
      : `The opt-out update did not fully save on the server; live sending remains paused.`);
}

async function optInContactById(contactId) {
  const contact = contacts.find((row) => row.id === contactId);
  if (!contact) return;
  const input = refs.adminContactList.querySelector(`[data-consent-date="${CSS.escape(contactId || "")}"]`);
  const consentDate = input?.value || "";
  if (!isValidConsentDate(consentDate)) {
    toast("Choose a valid consent date that is not in the future.");
    return;
  }
  const emails = contactEmails(contact);
  if (!confirmConsentForEmails(emails, consentDate)) return;
  const saveResult = await saveConsentThenRemoveSuppression(emails, consentDate);
  renderAll();
  toast(saveResult === "permanent"
    ? `${contact.displayName || contact.school} consent saved permanently for ${formatConsentDate(consentDate)}.`
    : saveResult === "local"
      ? `${contact.displayName || contact.school} consent saved in this browser for ${formatConsentDate(consentDate)}; live sending remains paused.`
      : "The consent update did not fully save on the server; suppression was not removed and live sending remains paused.");
}

function loadOptOutEmails() {
  try {
    const emails = JSON.parse(localStorage.getItem(OPT_OUT_KEY) || "[]");
    return new Set(Array.isArray(emails) ? emails.map(normalizeEmail).filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function loadConsentDates() {
  try {
    return normalizeConsentDates(JSON.parse(localStorage.getItem(CONSENT_DATES_KEY) || "{}"));
  } catch {
    return new Map();
  }
}

function normalizeConsentDates(value = {}) {
  const entries = value instanceof Map ? [...value] : Object.entries(value || {});
  return new Map(entries
    .map(([email, date]) => [normalizeEmail(email), String(date || "").slice(0, 10)])
    .filter(([email, date]) => email.includes("@") && isValidConsentDate(date)));
}

function isEmailConsented(email) {
  return consentDates.has(normalizeEmail(email));
}

function consentDateForContact(contact = {}) {
  const dates = [...new Set(contactEmails(contact).map((email) => consentDates.get(normalizeEmail(email))).filter(Boolean))];
  return dates.length === 1 ? dates[0] : "";
}

function todayDateValue() {
  return new Date().toISOString().slice(0, 10);
}

function isValidConsentDate(value) {
  const date = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayDateValue()) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function formatConsentDate(value) {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function confirmConsentForEmails(emails, consentDate) {
  const normalizedEmails = parseEmails(emails.join(" "));
  if (normalizedEmails.length <= 1) return normalizedEmails.length === 1;
  return window.confirm(
    `Record ${formatConsentDate(consentDate)} as the consent date for all ${normalizedEmails.length} addresses below?\n\n`
      + `${normalizedEmails.join("\n")}\n\nEach address must have separately provided consent.`
  );
}

function persistOptOutEmails() {
  localStorage.setItem(OPT_OUT_KEY, JSON.stringify([...optOutEmails].sort()));
}

function persistConsentDates() {
  localStorage.setItem(CONSENT_DATES_KEY, JSON.stringify(Object.fromEntries(consentDates)));
}

async function pauseSendingForPolicyFailure() {
  settings.sendingEnabled = false;
  serverCanSend = false;
  if (refs.settingSendingEnabled) refs.settingSendingEnabled.checked = false;
  persistSettings();
  if (serverAvailable) await setServerSendingEnabled(false);
}

async function addSuppressionsThenRemoveConsent(emails) {
  const normalizedEmails = parseEmails(emails.join(" "));
  normalizedEmails.forEach((email) => optOutEmails.add(email));
  persistOptOutEmails();

  if (serverAvailable) {
    const suppressionSaved = await updateOptOutsOnServer("save-opt-outs", normalizedEmails, true);
    return suppressionSaved ? "permanent" : "failed";
  }

  normalizedEmails.forEach((email) => consentDates.delete(email));
  persistConsentDates();
  await pauseSendingForPolicyFailure();
  return "local";
}

async function saveConsentThenRemoveSuppression(emails, consentDate) {
  const normalizedEmails = parseEmails(emails.join(" "));
  normalizedEmails.forEach((email) => consentDates.set(email, consentDate));
  persistConsentDates();

  if (!serverAvailable) {
    normalizedEmails.forEach((email) => optOutEmails.delete(email));
    persistOptOutEmails();
    await pauseSendingForPolicyFailure();
    return "local";
  }

  const requestedConsents = Object.fromEntries(normalizedEmails.map((email) => [email, consentDate]));
  const consentSaved = await saveConsentsOnServer(requestedConsents, { pauseOnFailure: true });
  if (!consentSaved) return "failed";
  normalizedEmails.forEach((email) => optOutEmails.delete(email));
  persistOptOutEmails();
  return "permanent";
}

async function updateOptOutsOnServer(action, emails, pauseOnFailure = false) {
  if (!serverAvailable) return false;
  const response = await apiRequest(action, { optOutEmails: parseEmails(emails.join(" ")) }, { quiet: true });
  if (!response?.ok) {
    if (pauseOnFailure) {
      const localOptOutSnapshot = [...optOutEmails];
      await pauseSendingForPolicyFailure();
      optOutEmails = new Set(localOptOutSnapshot);
      persistOptOutEmails();
    }
    return false;
  }
  applyServerState(response);
  return true;
}

async function saveConsentsOnServer(requestedConsents, { pauseOnFailure = false } = {}) {
  if (!serverAvailable) return false;
  const response = await apiRequest("save-consents", { consentDates: requestedConsents }, { quiet: true });
  if (!response?.ok) {
    if (pauseOnFailure) {
      const localConsentSnapshot = new Map(consentDates);
      await pauseSendingForPolicyFailure();
      consentDates = localConsentSnapshot;
      persistConsentDates();
    }
    return false;
  }
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
  settings.emailTemplate = normalizeEmailTemplate(template);
  settings.emailTemplateVersion = EMAIL_TEMPLATE_VERSION;
  persistSettings();
  const saved = serverAvailable ? await syncSettings() : false;
  renderTemplateEditor();
  updateEmailPreview();
  toast(serverAvailable && saved ? "Email template saved permanently." : "Email template saved in this browser only.");
}

async function resetTemplate() {
  settings.emailTemplate = defaultEmailTemplate();
  settings.emailTemplateVersion = EMAIL_TEMPLATE_VERSION;
  persistSettings();
  const saved = serverAvailable ? await syncSettings() : false;
  renderTemplateEditor();
  updateEmailPreview();
  toast(serverAvailable && saved ? "Email template reset and saved." : "Email template reset in this browser only.");
}

function resolveTemplate(template, contact) {
  const values = templateValues(contact);
  return polishEmailCopy(String(template || defaultEmailTemplate()).replace(/\{\{([a-z0-9_]+)\}\}/gi, (_, key) => values[key] ?? ""));
}

function templateValues(contact = {}) {
  return {
    coach_last_name: coachLastName(contact),
    coach_name: contact.recipientName || contact.headCoach || contact.assistantCoach || "",
    coach_role: contact.recipientRole || "",
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

function polishEmailCopy(copy = "") {
  return String(copy)
    .replace(/^Coach\s*,/gim, "Coach,")
    .replace(/[ \t]+,/g, ",")
    .replace(/[ \t]+$/gm, "");
}

function buildQuickResponseLink(contact = {}) {
  const params = new URLSearchParams({
    school: contact.displayName || contact.school || "",
    coach: contact.recipientName || coachLastName(contact),
    contact_id: contact.id || "",
    recipient: contact.recipientEmail || "",
    reply_to: settings.forwardEmail || settings.fromEmail || defaultSettings.forwardEmail
  });
  return `${PUBLIC_SITE_ORIGIN}/respond.html?${params.toString()}`;
}

function normalizeEmailTemplate(template) {
  return stripGradePointTemplate(template || defaultEmailTemplate()).trim();
}

function stripGradePointTemplate(template) {
  const gradeTokenPattern = new RegExp("\\{\\{g" + "pa\\}\\}", "gi");
  return String(template || "")
    .replace(/Academically,\s*I carried a (?:\{\{g[a-z]a\}\}|[\d.]+) high school G\s*P\s*A\.\s*I also try/gi, "I try")
    .replace(/I am happy to provide references, academic information,/gi, "I am happy to provide references, eligibility information,")
    .replace(gradeTokenPattern, "");
}

function coachLastName(contact) {
  if (isUsableCoachName(contact?.recipientName)) return contact.recipientName.split(" ").slice(-1)[0];
  const name = contact?.headCoach && !contact.headCoach.toLowerCase().includes("verify") ? contact.headCoach : contact?.assistantCoach || "";
  return isUsableCoachName(name) ? name.split(" ").slice(-1)[0] : "";
}

function splitNames(value = "") {
  return String(value)
    .split(/[,;]+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function isUsableCoachName(value = "") {
  const name = String(value || "").trim();
  return !!name && !/\b(verify|staff|basketball|athletics?|department|coach|contact)\b/i.test(name);
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
    const loadedSettings = normalizeSettings(JSON.parse(localStorage.getItem(ADMIN_SETTINGS_KEY) || "{}") || {});
    localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(settingsForBrowserStorage(loadedSettings)));
    return loadedSettings;
  } catch {
    return normalizeSettings({});
  }
}

function normalizeSettings(rawSettings = {}) {
  const loadedSettings = { ...defaultSettings, ...(rawSettings || {}) };
  const savedTemplateVersion = rawSettings?.emailTemplateVersion;
  delete loadedSettings.smtpPassword;
  loadedSettings.forwardEmail = normalizeMailboxSetting(loadedSettings.forwardEmail);
  loadedSettings.fromEmail = normalizeMailboxSetting(loadedSettings.fromEmail);
  loadedSettings.webmailEmail = loadedSettings.webmailEmail || DEFAULT_MAILBOX;
  loadedSettings.webmailUrl = normalizeWebmailUrl(loadedSettings.webmailUrl) || DEFAULT_WEBMAIL_URL;
  loadedSettings.smtpHost = String(loadedSettings.smtpHost || DEFAULT_SMTP_HOST).trim() || DEFAULT_SMTP_HOST;
  loadedSettings.smtpPort = Math.max(1, Number(loadedSettings.smtpPort) || DEFAULT_SMTP_PORT);
  loadedSettings.smtpSecurity = normalizeSmtpSecurity(loadedSettings.smtpSecurity);
  loadedSettings.smtpUser = normalizeMailboxSetting(loadedSettings.smtpUser || loadedSettings.fromEmail || DEFAULT_MAILBOX);
  loadedSettings.smtpPasswordSet = !!rawSettings?.smtpPasswordSet;
  loadedSettings.sendingEnabled = rawSettings?.sendingEnabled === true;
  loadedSettings.emailFormat = rawSettings?.emailFormat === "html" ? "html" : "plain";
  loadedSettings.trackOpens = loadedSettings.emailFormat === "html" && rawSettings?.trackOpens === true;
  loadedSettings.dailySendLimit = normalizeDailySendLimit(loadedSettings.dailySendLimit);
  loadedSettings.openDrafts = rawSettings?.openDrafts === true;
  loadedSettings.emailTemplate = shouldUpgradeLegacyTemplate(loadedSettings.emailTemplate, savedTemplateVersion)
    ? defaultEmailTemplate()
    : normalizeEmailTemplate(loadedSettings.emailTemplate);
  loadedSettings.emailTemplateVersion = EMAIL_TEMPLATE_VERSION;
  loadedSettings.delaySeconds = normalizeSendDelay(loadedSettings.delaySeconds);
  return loadedSettings;
}

function normalizeSendDelay(value) {
  return Math.max(PRIVATE_EMAIL_MIN_DELAY_SECONDS, Number(value) || PRIVATE_EMAIL_MIN_DELAY_SECONDS);
}

function normalizeDailySendLimit(value) {
  return Math.min(DAILY_SEND_LIMIT_MAX, Math.max(1, Math.floor(Number(value) || 1)));
}

function normalizeDailySendStatus(rawStatus = {}) {
  const limit = normalizeDailySendLimit(rawStatus.limit);
  const attempts = Math.max(0, Math.floor(Number(rawStatus.attempts) || 0));
  return {
    date: String(rawStatus.date || ""),
    attempts,
    limit,
    remaining: Math.max(0, Math.min(limit, Math.floor(Number(rawStatus.remaining) || 0)))
  };
}

function normalizeDeliveryStats(rawStats = {}) {
  const rawRuns = Array.isArray(rawStats.runs) ? rawStats.runs : [];
  const runs = [];
  const seenRunIds = new Set();
  rawRuns.forEach((rawRun) => {
    if (!rawRun || typeof rawRun !== "object") return;
    const run = normalizeRunSummary(rawRun);
    if (!run.id || seenRunIds.has(run.id)) return;
    seenRunIds.add(run.id);
    runs.push(run);
  });
  if (rawStats.lastRun && typeof rawStats.lastRun === "object") {
    const legacyLastRun = normalizeRunSummary(rawStats.lastRun);
    if (legacyLastRun.id && !seenRunIds.has(legacyLastRun.id)) runs.unshift(legacyLastRun);
  }
  runs.splice(50);
  const lastRun = runs[0] || null;
  return {
    attempted: Math.max(0, Number(rawStats.attempted || 0)),
    accepted: Math.max(0, Number(rawStats.accepted || 0)),
    failed: Math.max(0, Number(rawStats.failed || 0)),
    smtpAccepted: Math.max(0, Number(rawStats.smtpAccepted || 0)),
    mailAccepted: Math.max(0, Number(rawStats.mailAccepted || 0)),
    unknownAccepted: Math.max(0, Number(rawStats.unknownAccepted || 0)),
    baselineLimited: !!rawStats.baselineLimited,
    initializedAt: String(rawStats.initializedAt || ""),
    lastResultAt: String(rawStats.lastResultAt || ""),
    runs,
    lastRun
  };
}

function shouldUpgradeLegacyTemplate(template, version) {
  if (Number(version || 0) >= EMAIL_TEMPLATE_VERSION) return false;
  return /Royce Castle would be grateful for an evaluation conversation\s+with\s+\{\{school_name\}\}/i.test(String(template || ""));
}

function normalizeMailboxSetting(value) {
  const email = String(value || "").trim();
  return !email || email.toLowerCase() === LEGACY_DEFAULT_EMAIL ? DEFAULT_MAILBOX : email;
}

function normalizeSmtpSecurity(value) {
  return value === "tls" ? "tls" : DEFAULT_SMTP_SECURITY;
}

function settingsForBrowserStorage(value = settings) {
  const copy = { ...(value || {}) };
  delete copy.smtpPassword;
  return copy;
}

function settingsForServer(value = settings) {
  const copy = settingsForBrowserStorage(value);
  delete copy.sendingEnabled;
  return copy;
}

function persistSettings() {
  localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(settingsForBrowserStorage(settings)));
}

async function syncSettings(extra = {}) {
  if (!serverAvailable) return false;
  const response = await apiRequest("save-settings", { settings: settingsForServer(settings), ...extra }, { quiet: true });
  if (!response?.ok) {
    toast("Server save did not complete; browser copy is still updated.");
    return false;
  }
  applyServerState(response);
  return true;
}

async function setServerSendingEnabled(enabled) {
  if (!serverAvailable) return false;
  const response = await apiRequest("set-sending-enabled", { enabled: enabled === true }, { quiet: true });
  if (!response?.ok) return false;
  applyServerState(response);
  return true;
}

function loadMessages() {
  try {
    const messages = JSON.parse(localStorage.getItem(PUBLIC_MESSAGES_KEY) || "[]");
    return Array.isArray(messages) ? messages : [];
  } catch {
    return [];
  }
}

function recordEmailHistory(target, status = "Manually recorded as sent") {
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
