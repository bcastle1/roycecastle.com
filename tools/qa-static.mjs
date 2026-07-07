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
const contactsPage = fs.readFileSync("contacts.html", "utf8");
const contactsPageJs = fs.readFileSync("contacts-page.js", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const adminJs = fs.readFileSync("admin/admin.js", "utf8");
const cpanelAdminJs = fs.readFileSync("_cpanel/public_html/admin/admin.js", "utf8");
const respond = fs.readFileSync("respond.js", "utf8");
const apiCommon = fs.readFileSync("_cpanel/public_html/api/common.php", "utf8");
const apiSendEmail = fs.readFileSync("_cpanel/public_html/api/send-email.php", "utf8");

check("Public app uses current cache key", index.includes("20260707-light-type-1"));
check("Admin app uses current cache key", admin.includes("20260707-light-type-1"));
check("Admin loads enriched contact data cache key", admin.includes("20260707-workbook-enriched-1"));
check("Workbook loads enriched contact data cache key", contactsPage.includes("20260707-workbook-enriched-1"));
check("Workbook storage key was bumped for enriched contacts", contactsPageJs.includes("royceCastleRecruitingStudio.v4"));
check("Public fallback email is info@roycecastle.com", app.includes('forwardEmail: "info@roycecastle.com"'));
check("Quick reply fallback email is info@roycecastle.com", respond.includes('DEFAULT_REPLY_EMAIL = "info@roycecastle.com"'));
check("Admin template enforces website link", adminJs.includes("ensureWebsiteLinkTemplate"));
check("Admin template enforces video link", adminJs.includes("ensureVideoLinkTemplate"));
check("Admin template enforces quick response link", adminJs.includes("ensureQuickResponseTemplate"));
check("Admin cleans empty coach salutation", adminJs.includes("function polishEmailCopy") && adminJs.includes('replace(/^Coach\\s*,/gim, "Coach,")'));
check("Admin builds individual coach recipient targets", adminJs.includes("function contactRecipientTargets") && adminJs.includes("function targetFromRecipient") && adminJs.includes("recipients.map((recipient) => targetFromRecipient(contact, recipient))"));
check("Admin personalizes email targets by recipient", adminJs.includes("function recipientContext") && adminJs.includes("recipientName") && adminJs.includes("recipientRole"));
check("cPanel admin copy matches source admin", cpanelAdminJs === adminJs);
check("Admin has opened metric", admin.includes("metric-opened"));
check("Admin has select all filtered control", admin.includes("select-all-filtered"));
check("Admin exposes SMTP settings fields", ["setting-smtp-host", "setting-smtp-port", "setting-smtp-security", "setting-smtp-user", "setting-smtp-password", "setting-smtp-status"].every((id) => admin.includes(id)));
check("Admin defaults to Namecheap Private Email SMTP", adminJs.includes('DEFAULT_SMTP_HOST = "mail.privateemail.com"') && adminJs.includes("DEFAULT_SMTP_PORT = 465"));
check("Admin strips SMTP password from browser storage", adminJs.includes("settingsForBrowserStorage") && adminJs.includes("delete copy.smtpPassword"));
check("Server never returns SMTP password in public settings", apiCommon.includes("unset($settings['smtpPassword'])"));
check("Server SMTP sender authenticates with mailbox credentials", apiSendEmail.includes("send_recruiting_email_smtp") && apiSendEmail.includes("AUTH LOGIN"));
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
check("Contact database has at least 340 sourced school colors", sourcedColorRows >= 340);
check("Custom school colors include source labels", unsourcedCustomColors === 0);
console.log(JSON.stringify({ contacts: contacts.length, withEmail: withEmail.length, individualRecipientCount, sourcedColorRows, genericColorRows, invalidEmails: invalidEmails.length }, null, 2));

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
