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
const app = fs.readFileSync("app.js", "utf8");
const adminJs = fs.readFileSync("admin/admin.js", "utf8");
const respond = fs.readFileSync("respond.js", "utf8");

check("Public app uses current cache key", index.includes("20260706-email-ready-2"));
check("Admin app uses current cache key", admin.includes("20260706-email-ready"));
check("Public fallback email is info@roycecastle.com", app.includes('forwardEmail: "info@roycecastle.com"'));
check("Quick reply fallback email is info@roycecastle.com", respond.includes('DEFAULT_REPLY_EMAIL = "info@roycecastle.com"'));
check("Admin template enforces website link", adminJs.includes("ensureWebsiteLinkTemplate"));
check("Admin template enforces video link", adminJs.includes("ensureVideoLinkTemplate"));
check("Admin template enforces quick response link", adminJs.includes("ensureQuickResponseTemplate"));
check("Admin has opened metric", admin.includes("metric-opened"));
check("Admin has select all filtered control", admin.includes("select-all-filtered"));
check("Public contact API requires JSON result", app.includes("await response.json()") && app.includes("!!result?.ok"));

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync("contacts-data.js", "utf8"), sandbox);
const contacts = sandbox.window.RECRUITING_CONTACTS || [];
const withEmail = contacts.filter((contact) => contact.headEmail || contact.assistantEmail);

check("Contact database has at least 1,300 rows", contacts.length >= 1300);
check("Contact database has at least 500 email-ready rows", withEmail.length >= 500);

const genericColorRows = contacts.filter((contact) => contact.primaryColor === "#164b88" && contact.accentColor === "#f2b84b").length;
const sourcedColorRows = contacts.filter((contact) => contact.colorSource).length;
const unsourcedCustomColors = contacts.filter((contact) => contact.primaryColor !== "#164b88" && contact.accentColor !== "#f2b84b" && !contact.colorSource).length;
check("Contact database has at least 300 sourced school colors", sourcedColorRows >= 300);
check("Custom school colors include source labels", unsourcedCustomColors === 0);
console.log(JSON.stringify({ contacts: contacts.length, withEmail: withEmail.length, sourcedColorRows, genericColorRows }, null, 2));

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
