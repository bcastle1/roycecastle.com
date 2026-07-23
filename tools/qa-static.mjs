import fs from "node:fs";
import vm from "node:vm";

const checks = [];

check("Root API folder is absent from GitHub Pages source", !fs.existsSync("api"));
check("cPanel API package exists", fs.existsSync("_cpanel/public_html/api/send-email.php"));
check("cPanel data folder is protected", fs.existsSync("_cpanel/public_html/data/.htaccess"));
check("GitHub Pages excludes cPanel backend", /_cpanel/.test(fs.readFileSync("_config.yml", "utf8")));
check("cPanel package builder exists", fs.existsSync("tools/build-cpanel-package.mjs"));

const index = fs.readFileSync("index.html", "utf8");
const admin = fs.readFileSync("admin/index.html", "utf8");
const cpanelAdmin = fs.readFileSync("_cpanel/public_html/admin/index.html", "utf8");
const contactsPage = fs.readFileSync("contacts.html", "utf8");
const contactsPageJs = fs.readFileSync("contacts-page.js", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const adminJs = fs.readFileSync("admin/admin.js", "utf8");
const adminAuth = fs.readFileSync("admin/admin-auth.js", "utf8");
const cpanelAdminJs = fs.readFileSync("_cpanel/public_html/admin/admin.js", "utf8");
const cpanelAdminAuth = fs.readFileSync("_cpanel/public_html/admin/admin-auth.js", "utf8");
const respond = fs.readFileSync("respond.js", "utf8");
const apiCommon = fs.readFileSync("_cpanel/public_html/api/common.php", "utf8");
const apiAdmin = fs.readFileSync("_cpanel/public_html/api/admin.php", "utf8");
const apiHealth = fs.readFileSync("_cpanel/public_html/api/health.php", "utf8");
const apiOpen = fs.readFileSync("_cpanel/public_html/api/open.php", "utf8");
const apiSendEmail = fs.readFileSync("_cpanel/public_html/api/send-email.php", "utf8");
const deployScript = fs.readFileSync("tools/deploy-royce-cpanel-from-github.sh", "utf8");
const deployWorkflow = fs.readFileSync(".github/workflows/deploy-cpanel.yml", "utf8");
const styles = fs.readFileSync("styles.css", "utf8");
const normalizeNewlines = (value) => value.replace(/\r\n/g, "\n");
const saveOptOutsCase = apiAdmin.slice(apiAdmin.indexOf("case 'save-opt-outs':"), apiAdmin.indexOf("case 'remove-opt-outs':"));
const saveConsentsCase = apiAdmin.slice(apiAdmin.indexOf("case 'save-consents':"), apiAdmin.indexOf("case 'clear-messages':"));
const consentRejectIndex = apiSendEmail.indexOf("does not have an active saved consent date");
const blankMessageRejectIndex = apiSendEmail.indexOf("A nonblank subject and message body are required");
const smtpClaimIndex = apiSendEmail.indexOf("claim_smtp_send_slot(");
const runClaimIndex = apiSendEmail.indexOf("claim_live_run_target(");
const dailyClaimIndex = apiSendEmail.indexOf("claim_daily_send_attempt(");

check("Public app uses current cache key", index.includes("20260710-premium-type-1"));
check("Admin app uses current consent-controlled-send cache keys", admin.includes("styles.css?v=20260723-consent-controlled-send-1") && admin.includes("admin.js?v=20260723-consent-controlled-send-1"));
check("Admin loads enriched contact data cache key", admin.includes("20260707-workbook-enriched-3"));
check("Workbook loads enriched contact data cache key", contactsPage.includes("20260707-workbook-enriched-3"));
check("Workbook loads current history-sync script", contactsPage.includes("contacts-page.js?v=20260710-outreach-accounting-1") && contactsPageJs.includes("state.emailHistory.slice(0, 500)"));
check("Workbook storage key was bumped for enriched contacts", contactsPageJs.includes("royceCastleRecruitingStudio.v6"));
check("Public fallback email is info@roycecastle.com", app.includes('forwardEmail: "info@roycecastle.com"'));
check("Quick reply fallback email is info@roycecastle.com", respond.includes('DEFAULT_REPLY_EMAIL = "info@roycecastle.com"'));
check("Admin preserves intentionally link-free templates", adminJs.includes("function normalizeEmailTemplate") && !adminJs.includes("ensureWebsiteLinkTemplate") && !adminJs.includes("ensureVideoLinkTemplate") && !adminJs.includes("ensureQuickResponseTemplate") && !apiSendEmail.includes("Watch Highlight Video") && !apiSendEmail.includes("View Recruiting Site") && !apiSendEmail.includes(">Quick Reply<"));
check("Admin cleans empty coach salutation", adminJs.includes("function polishEmailCopy") && adminJs.includes('replace(/^Coach\\s*,/gim, "Coach,")'));
check("Admin builds individual coach recipient targets", adminJs.includes("function contactRecipientTargets") && adminJs.includes("function targetFromRecipient") && adminJs.includes("recipients.map((recipient) => targetFromRecipient(contact, recipient))"));
check("Admin personalizes email targets by recipient", adminJs.includes("function recipientContext") && adminJs.includes("recipientName") && adminJs.includes("recipientRole"));
check("cPanel admin copy matches source admin", normalizeNewlines(cpanelAdminJs) === normalizeNewlines(adminJs));
check("cPanel admin auth copy matches source admin", normalizeNewlines(cpanelAdminAuth) === normalizeNewlines(adminAuth));
check("cPanel admin HTML matches source admin", normalizeNewlines(cpanelAdmin) === normalizeNewlines(admin));
check("Admin exposes selectable email run history controls", [
  "toggle-run-history",
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
  "run-history-error"
].every((id) => admin.includes(`id="${id}"`)));
check("Admin renders and syncs persistent run summaries", adminJs.includes("function renderRunHistory") && /(?:async )?function syncRunState/.test(adminJs) && /apiRequest\(\s*["']record-run["']/.test(adminJs) && /rawStats\??\.runs/.test(adminJs) && /deliveryStats\??\.runs/.test(adminJs));
check("Admin records run lifecycle phases", ["start", "progress", "finish"].every((phase) => adminJs.includes(`syncRunState("${phase}")`)));
check("Server retains a bounded run history", apiCommon.includes("const RC_RUN_HISTORY_LIMIT = 50;") && apiCommon.includes("array_slice($stats['runs'], 0, RC_RUN_HISTORY_LIMIT)") && apiCommon.includes("function store_delivery_run"));
check("Server records explicit run lifecycle state", apiCommon.includes("function record_delivery_run_state") && apiCommon.includes("['start', 'progress', 'finish']") && apiCommon.includes("write_json_file('delivery-stats.json', $stats)"));
check("Public delivery stats strip private run positions", /function public_delivery_run\(array \$run\): array\s*\{\s*return normalize_delivery_run\(\$run, false\);\s*\}/s.test(apiCommon) && /function public_delivery_stats\(array \$stats\): array[\s\S]*?public_delivery_run\(\$run\)/.test(apiCommon));
check("Admin API exposes authenticated run recording", apiAdmin.includes("case 'record-run':") && apiAdmin.includes("record_delivery_run_state") && apiAdmin.includes("'deliveryStats' => $deliveryStats"));
check("Run history has responsive presentation styles", [".run-history-card", ".run-history-toolbar", ".run-history-summary", ".run-history-grid", ".run-history-status-active"].every((selector) => styles.includes(selector)) && /@media[^\{]*\(max-width:\s*720px\)[\s\S]*?\.run-history-grid/.test(styles));
check("Admin has opened metric", admin.includes("metric-opened"));
check("Admin has select all filtered control", admin.includes("select-all-filtered"));
check("Admin exposes dated consent controls and metrics", ["metric-consents", "consent-date"].every((id) => admin.includes(`id="${id}"`)) && admin.includes("Select Visible Consented") && admin.includes("Select All Consented") && admin.includes("Record Consent"));
check("Admin filters every send target through valid dated consent", adminJs.includes("CONSENT_DATES_KEY") && adminJs.includes("function isEmailConsented") && adminJs.includes("function activeContactRecipientTargets") && adminJs.includes("function activeEmailListFromString") && adminJs.includes("function isValidConsentDate") && adminJs.includes("return new Date().toISOString().slice(0, 10)") && !adminJs.includes("const MIN_EMAIL_DELAY_SECONDS"));
check("Consent writes are explicit, targeted, awaited, and fail safely", adminJs.includes("confirmConsentForEmails") && adminJs.includes("Each address must have separately provided consent") && adminJs.includes("await addSuppressionsThenRemoveConsent") && adminJs.includes("await saveConsentThenRemoveSuppression") && adminJs.includes("Object.fromEntries(normalizedEmails.map") && adminJs.includes('apiRequest("save-consents", { consentDates: requestedConsents }') && adminJs.includes("pauseSendingForPolicyFailure") && !adminJs.includes('apiRequest("save-consents", { consentDates: Object.fromEntries(consentDates)'));
check("Server validates and atomically reconciles consent with suppressions", apiAdmin.includes("case 'save-consents':") && apiAdmin.includes("'consentDates' => normalize_requested_consents") && apiAdmin.includes("checkdate(") && apiAdmin.includes("gmdate('Y-m-d')") && apiAdmin.includes("count($consentDates) !== count($requestedConsents)") && saveOptOutsCase.indexOf("update_json_file('opt-outs.json'") < saveOptOutsCase.indexOf("update_json_file('consent-dates.json'") && saveConsentsCase.indexOf("update_json_file('consent-dates.json'") < saveConsentsCase.indexOf("update_json_file('opt-outs.json'"));
check("cPanel sender rejects missing or invalid consent before consuming claims", apiSendEmail.includes("consent-dates.json") && apiSendEmail.includes("checkdate(") && apiSendEmail.includes("gmdate('Y-m-d')") && consentRejectIndex > 0 && consentRejectIndex < smtpClaimIndex && consentRejectIndex < runClaimIndex && consentRejectIndex < dailyClaimIndex);
check("cPanel sender rejects blank content before consuming claims", blankMessageRejectIndex > 0 && blankMessageRejectIndex < smtpClaimIndex && blankMessageRejectIndex < runClaimIndex && blankMessageRejectIndex < dailyClaimIndex);
check("Admin exposes SMTP settings fields", ["setting-smtp-host", "setting-smtp-port", "setting-smtp-security", "setting-smtp-user", "setting-smtp-password", "setting-smtp-status"].every((id) => admin.includes(id)));
check("Admin defaults to Namecheap Private Email SMTP", adminJs.includes('DEFAULT_SMTP_HOST = "mail.privateemail.com"') && adminJs.includes("DEFAULT_SMTP_PORT = 465"));
check("Admin strips SMTP password from browser storage", adminJs.includes("settingsForBrowserStorage") && adminJs.includes("delete copy.smtpPassword"));
check("Server never returns SMTP password in public settings", apiCommon.includes("unset($settings['smtpPassword'])"));
check("Server SMTP sender authenticates with mailbox credentials", apiSendEmail.includes("send_recruiting_email_smtp") && apiSendEmail.includes("AUTH LOGIN"));
check("Admin separates processed, accepted, and failed run counts", adminJs.includes("processed: 0") && adminJs.includes("accepted: 0") && adminJs.includes("failed: 0") && !adminJs.includes("runState.sent +="));
check("Admin uses persistent server delivery totals", adminJs.includes("state.deliveryStats") && adminJs.includes("deliveryStats.accepted") && apiAdmin.includes("'deliveryStats' =>"));
check("Browser detail hydration stays bounded", adminJs.includes("state.emailHistory.slice(0, 500)") && adminJs.includes("state.runLog.slice(0, 80)") && adminJs.includes("function storeLocalJson") && apiAdmin.includes("array_slice(read_json_file('email-history.json', []), 0, 500)"));
check("Live sending is server-paused by default", apiCommon.includes("'sendingEnabled' => false") && apiCommon.includes("($raw['sendingEnabled'] ?? false) === true") && apiAdmin.includes("case 'set-sending-enabled':") && adminJs.includes("delete copy.sendingEnabled") && !adminJs.includes("settingsSyncTimer") && apiSendEmail.includes("Live sending is paused") && admin.includes("setting-sending-enabled"));
check("Plain text is the non-tracking default", apiCommon.includes("'emailFormat' => 'plain'") && apiCommon.includes("'trackOpens' => false") && adminJs.includes('emailFormat: "plain"') && adminJs.includes("trackOpens: false") && apiSendEmail.includes("Content-Type: text/plain") && apiSendEmail.includes("if (($settings['emailFormat'] ?? 'plain') !== 'html')") && !apiSendEmail.includes("ensure_required_links"));
check("Tracking pixels are opt-in HTML only", apiCommon.includes("$settings['trackOpens'] = $settings['emailFormat'] === 'html'") && apiSendEmail.includes("if ($trackOpens && $trackingId !== '')") && admin.includes("setting-track-opens"));
check("Private Email runs are paced to no more than 12 per hour", adminJs.includes("PRIVATE_EMAIL_MIN_DELAY_SECONDS = 300") && admin.includes('id="schedule-delay" type="number" min="300" value="300"') && apiCommon.includes("RC_PRIVATE_EMAIL_MIN_DELAY_SECONDS = 300") && apiCommon.includes("function claim_smtp_send_slot") && apiSendEmail.includes("'rateLimited' => true") && adminJs.includes("response.status === 429"));
check("Every live send is separately confirmed for exactly one explicit recipient", adminJs.includes("LIVE_RUN_RECIPIENT_LIMIT = 1") && adminJs.includes("Submit one live email to ${targets[0].email}") && adminJs.includes("seenEmails.has(email)") && !adminJs.includes('label: "current draft recipient"') && apiCommon.includes("RC_LIVE_RUN_RECIPIENT_LIMIT = 1") && apiCommon.includes("function claim_live_run_target") && apiSendEmail.includes("$runTotal !== RC_LIVE_RUN_RECIPIENT_LIMIT") && apiSendEmail.includes("runConfirmed") && apiSendEmail.includes("count($emails) !== 1") && apiSendEmail.includes("claim_live_run_target"));
check("Live sending requires authenticated SMTP with aligned From", apiAdmin.includes("Authenticated SMTP must be configured") && apiSendEmail.includes("Authenticated SMTP is required") && apiSendEmail.includes("$settings['smtpUser']") && !apiSendEmail.includes("send_recruiting_email_mail") && !apiSendEmail.includes("function_exists('mail')"));
check("UTC daily attempt quota defaults to one and is locked", adminJs.includes("DAILY_SEND_LIMIT_MAX = 25") && adminJs.includes("Math.min(DAILY_SEND_LIMIT_MAX") && apiCommon.includes("RC_MAX_DAILY_SEND_ATTEMPTS = 25") && apiCommon.includes("'dailySendLimit' => 1") && apiCommon.includes("function claim_daily_send_attempt") && apiCommon.includes("update_json_file('daily-send-quota.json'") && apiSendEmail.includes("claim_daily_send_attempt") && apiSendEmail.includes("$remainingRunAttempts = $runTotal - $runPosition + 1") && admin.includes("setting-daily-send-limit"));
check("Quota and pacing state fail closed with atomic replacement", apiCommon.includes("bool $strictExisting = false") && apiCommon.includes("tempnam(dirname($path), '.json-update-')") && apiCommon.includes("rename($tempPath, $path)") && apiCommon.includes("read_json_file('daily-send-quota.json', [], true)") && /update_json_file\('smtp-throttle\.json'[\s\S]*?\}, true\);/.test(apiCommon) && /update_json_file\('daily-send-quota\.json'[\s\S]*?\}, true\);/.test(apiCommon) && apiCommon.includes("pause_sending_after_safety_state_failure"));
check("Final recipient claim automatically pauses live sending", apiSendEmail.includes("if ($runPosition === $runTotal)") && apiSendEmail.includes("set_sending_enabled(false)") && adminJs.includes("await setServerSendingEnabled(false)"));
check("Deploy workflow uses an immutable commit and never cancels an in-flight deployment", deployWorkflow.includes("cancel-in-progress: false") && deployWorkflow.includes('ref: ${{ github.sha }}') && deployWorkflow.includes('DEPLOY_SHA: ${{ github.sha }}') && deployWorkflow.includes("ROYCE_ARCHIVE_SHA=%q") && deployScript.includes('ARCHIVE_SHA="${ROYCE_ARCHIVE_SHA:-}"') && deployScript.includes('archive/$ARCHIVE_SHA.zip') && !deployScript.includes("refs/heads/main"));
check("Deploy workflow requires a pinned SSH host key", deployWorkflow.includes("CPANEL_KNOWN_HOSTS is required") && deployWorkflow.includes("StrictHostKeyChecking=yes") && deployWorkflow.includes("UserKnownHostsFile=") && deployWorkflow.includes("sshpass -e ssh") && !deployWorkflow.includes("StrictHostKeyChecking=accept-new") && !deployWorkflow.includes("ssh-keyscan") && !deployWorkflow.includes("sshpass -p"));
check("Deploy target is narrowly validated before mutation", deployWorkflow.includes('[ "$TARGET_NAME" != "roycecastle.com" ]') && deployScript.includes('[ "$TARGET_NAME" = "roycecastle.com" ]') && deployScript.includes("The deployment target resolves outside its validated path") && deployScript.includes('TARGET_REAL="$(cd "$TARGET" && pwd -P)"') && deployScript.indexOf("The deployment target resolves outside its validated path") < deployScript.indexOf("Source preflight passed"));
check("Deploy source preflight completes before target mutation", deployScript.includes('php -l "$PHP_FILE"') && deployScript.includes("Source preflight passed, including PHP lint") && deployScript.indexOf("Source preflight passed, including PHP lint") < deployScript.indexOf('exec 9>"$DEPLOY_LOCK_PATH"') && deployScript.indexOf("Source preflight passed, including PHP lint") < deployScript.indexOf('mkdir "$TARGET/data"'));
check("GitHub runner lints the cPanel PHP entry points", deployWorkflow.includes("Lint cPanel PHP endpoints") && ["common.php", "admin.php", "send-email.php"].every((file) => deployWorkflow.includes(`php -l _cpanel/public_html/api/${file}`)));
check("Deploy uses a persistent remote lock and same-filesystem rollback staging", deployScript.includes('exec 9>"$DEPLOY_LOCK_PATH"') && deployScript.includes("flock -n 9") && deployScript.includes("stat -c %d") && deployScript.includes("rollback_deploy") && deployScript.indexOf('BACKED_UP_ITEMS+=("$item")') < deployScript.indexOf('mv -- "$TARGET_ITEM" "$BACKUP_ITEM"') && deployScript.indexOf('INSTALLED_ITEMS+=("$item")') < deployScript.indexOf('mv -- "$STAGED_ITEM" "$TARGET_ITEM"') && deployScript.includes("Same-filesystem staging preflight passed"));
check("Deploy pauses settings under the application sidecar lock with atomic replacement", deployScript.includes('$lockPath = $path . ".lock";') && deployScript.includes("flock($lockHandle, LOCK_EX)") && deployScript.includes('tempnam(dirname($path), ".settings-deploy-")') && deployScript.includes("rename($tempPath, $path)") && deployScript.includes("Live sending forced paused under settings.json.lock") && deployScript.includes("-exec chmod 600"));
check("Deploy preserves private data permissions and verifies the paused gate", !deployScript.includes('find "$TARGET" -type f -exec chmod 644') && deployScript.includes('find "$TARGET/data" -maxdepth 1') && apiHealth.includes("'sendingEnabled' =>") && deployWorkflow.includes("health.sendingEnabled !== false"));
check("Live sends cannot bypass caps through CC", admin.includes("CC (manual drafts only)") && adminJs.includes("cc: activeEmailsFromString(refs.adminCcEmail.value)") && !apiSendEmail.includes("$ccEmails") && !apiSendEmail.includes("'Cc: '"));
check("Suppressions use atomic add and maintenance removal operations", apiAdmin.includes("case 'remove-opt-outs':") && /case 'save-opt-outs':[\s\S]*?update_json_file\('opt-outs\.json'/.test(apiAdmin) && /case 'remove-opt-outs':[\s\S]*?update_json_file\('opt-outs\.json'/.test(apiAdmin) && adminJs.includes('updateOptOutsOnServer("save-opt-outs"') && !adminJs.includes('updateOptOutsOnServer("remove-opt-outs"') && !adminJs.includes("syncOptOutEmails"));
check("Accepted-count bootstrap excludes unverified manual sends", apiCommon.includes("$status === 'sent' && in_array($transport") && apiSendEmail.indexOf("record_delivery_result($target") < apiSendEmail.indexOf("'email-history.json'"));
check("SMTP failures are not disguised as PHP mail success", !apiSendEmail.includes("smtp-fallback-mail") && apiSendEmail.includes("record_delivery_result"));
check("Bookkeeping failures do not overwrite a known send result", apiSendEmail.includes("catch (Throwable $exception)") && apiSendEmail.includes("'accountingWarning' =>") && adminJs.includes("result.accountingWarning"));
check("Data writes fail loudly instead of losing counters silently", apiCommon.includes("$written !== strlen($json)") && apiCommon.includes("function write_stream_fully"));
check("Email history updates lock the full read-modify-write cycle", apiCommon.includes("function update_json_file") && apiSendEmail.includes("update_json_file(") && apiOpen.includes("update_json_file('email-history.json'"));
check("Unknown tracking pixels do not take the exclusive history lock", apiCommon.includes("if ($updated === null) return $current") && apiOpen.includes("$historySnapshot = read_json_file") && apiOpen.includes("if ($hasMatch)") && apiOpen.includes("return $matched ? $history : null"));
check("Admin login is server-authenticated with no static fallback", apiCommon.includes("$configured !== ''") && adminJs.includes("if (serverLogin)") && adminAuth.includes("if (serverOk)") && !adminAuth.includes("localStorage.getItem") && !adminJs.includes("ADMIN_CODE_KEY"));
check("Automatic deploy prevents an admin lockout", deployScript.includes("ADMIN_AUTH_READY") && deployScript.includes("ROYCE_ALLOW_UNCONFIGURED_ADMIN"));
check("Public contact API requires JSON result", app.includes("await response.json()") && app.includes("!!result?.ok"));

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync("contacts-data.js", "utf8"), sandbox);
const contacts = sandbox.window.RECRUITING_CONTACTS || [];
const withEmail = contacts.filter((contact) => contact.headEmail || contact.assistantEmail);
const splitList = (value = "") => String(value).split(/[,;]+/).map((item) => item.trim()).filter(Boolean);
const parseEmailList = (value = "") => [...new Set(String(value).split(/[\s,;]+/).map((email) => email.trim().toLowerCase()).filter((email) => email.includes("@")))];
const individualRecipientCount = contacts.reduce((total, contact) => {
  const uniqueEmails = new Set([...parseEmailList(contact.headEmail), ...parseEmailList(contact.assistantEmail)]);
  return total + uniqueEmails.size;
}, 0);
const invalidEmails = contacts.flatMap((contact) =>
  ["headEmail", "assistantEmail"].flatMap((field) =>
    splitList(contact[field])
      .filter((email) => !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email))
      .map((email) => ({ id: contact.id, field, email }))
  )
);
const duplicateHeadAssistant = contacts.filter((contact) => {
  const head = String(contact.headCoach || "").trim().toLowerCase();
  if (!head || head.startsWith("verify")) return false;
  return splitList(contact.assistantCoach).some((assistant) => assistant.toLowerCase() === head);
});
const suspiciousAssistantNames = contacts.filter((contact) =>
  splitList(contact.assistantCoach).some(
    (assistant) =>
      !/^verify/i.test(assistant) &&
      /\b(manager|coordinator|development|recruiting|offensive|defensive|line|swimming|soccer|baseball|softball|volleyball|football|track|field|cross country|jumps|throws|distance|university|college|athletic|department|staff|basketball|coach|state)\b/i.test(assistant)
  )
);

check("Contact database has at least 1,300 rows", contacts.length >= 1300);
check("Contact database has at least 680 email-ready rows", withEmail.length >= 680);
check("Contact database has at least 1,000 individual coach recipient emails", individualRecipientCount >= 1000);
check("Contact database has valid email formats", invalidEmails.length === 0);
check("Contact database has no duplicate head/assistant coach names", duplicateHeadAssistant.length === 0);
check("Contact database assistant names pass sanity filter", suspiciousAssistantNames.length === 0);

const genericColorRows = contacts.filter((contact) => contact.primaryColor === "#164b88" && contact.accentColor === "#f2b84b").length;
const sourcedColorRows = contacts.filter((contact) => contact.colorSource).length;
const unsourcedCustomColors = contacts.filter((contact) => contact.primaryColor !== "#164b88" && contact.accentColor !== "#f2b84b" && !contact.colorSource).length;
const d3Rows = contacts.filter((contact) => contact.division === "NCAA D3");
const d3HeadEmails = d3Rows.filter((contact) => /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(contact.headEmail || ""));
check("Contact database has at least 340 sourced school colors", sourcedColorRows >= 340);
check("Custom school colors include source labels", unsourcedCustomColors === 0);
check("Contact database includes imported NCAA D3 head-coach rows", d3Rows.length >= 400);
check("Imported NCAA D3 rows include head-coach emails", d3HeadEmails.length === d3Rows.length);
console.log(JSON.stringify({ contacts: contacts.length, withEmail: withEmail.length, individualRecipientCount, d3Rows: d3Rows.length, sourcedColorRows, genericColorRows, invalidEmails: invalidEmails.length }, null, 2));

if (checks.some((item) => !item.pass)) {
  for (const item of checks) {
    console.error(`${item.pass ? "PASS" : "FAIL"} ${item.name}`);
  }
  process.exit(1);
}

for (const item of checks) {
  console.log(`PASS ${item.name}`);
}

function check(name, pass) {
  checks.push({ name, pass: !!pass });
}
