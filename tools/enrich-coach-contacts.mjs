import fs from "node:fs";
import vm from "node:vm";

const CONTACT_FILE = "contacts-data.js";
const TODAY = new Date().toISOString().slice(0, 10);
const USER_AGENT = "Mozilla/5.0 (compatible; RoyceCastleRecruiting/1.0; +https://roycecastle.com/)";
const REQUEST_TIMEOUT_MS = Number(process.env.ENRICH_TIMEOUT_MS || 18000);
const CONCURRENCY = Number(process.env.ENRICH_CONCURRENCY || 5);
const LIMIT = Number(process.env.ENRICH_LIMIT || 0);
const GROUP = process.env.ENRICH_GROUP || "";
const ONLY_MISSING_EMAIL = process.env.ENRICH_ONLY_MISSING_EMAIL !== "0";
const ALLOW_STAFF_DIRECTORIES = process.env.ENRICH_ALLOW_DIRECTORIES === "1";
const DISCOVER_URLS = process.env.ENRICH_DISCOVER === "1";
const WRITE = process.env.ENRICH_WRITE !== "0";

const contacts = loadContacts();
const candidates = contacts
  .filter((row) => !GROUP || row.group === GROUP)
  .filter((row) => !ONLY_MISSING_EMAIL || !contactEmails(row).length)
  .slice(0, LIMIT || undefined);

const stats = {
  candidates: candidates.length,
  fetched: 0,
  failed: 0,
  discoveredUrls: 0,
  pagesWithStaff: 0,
  enriched: 0,
  headNamesAdded: 0,
  headEmailsAdded: 0,
  assistantNamesAdded: 0,
  assistantEmailsAdded: 0
};

await mapLimit(candidates, CONCURRENCY, enrichContact);

if (WRITE) writeContacts(contacts);

const withAnyEmail = contacts.filter((row) => contactEmails(row).length).length;
const withHeadEmail = contacts.filter((row) => row.headEmail).length;
const withAssistantEmail = contacts.filter((row) => row.assistantEmail).length;
const withTwoAssistants = contacts.filter((row) => splitList(row.assistantEmail).length >= 2).length;

console.log(
  JSON.stringify(
    {
      ...stats,
      total: contacts.length,
      withAnyEmail,
      withHeadEmail,
      withAssistantEmail,
      withTwoAssistants,
      wrote: WRITE
    },
    null,
    2
  )
);

async function enrichContact(contact) {
  const urls = candidateUrls(contact);
  if (DISCOVER_URLS && shouldDiscover(contact)) {
    urls.push(...(await discoverUrls(contact)));
  }
  let best = null;

  for (const url of urls) {
    const html = await fetchPage(url);
    if (!html) continue;
    const staff = extractStaff(html, url, contact);
    if (staff.length) {
      best = { url, staff };
      break;
    }
  }

  if (!best) return;
  stats.pagesWithStaff += 1;

  const before = snapshot(contact);
  applyStaff(contact, best.staff, best.url);
  const after = snapshot(contact);

  if (JSON.stringify(before) !== JSON.stringify(after)) {
    stats.enriched += 1;
    if (before.headCoach !== after.headCoach) stats.headNamesAdded += 1;
    if (before.headEmail !== after.headEmail) stats.headEmailsAdded += 1;
    if (before.assistantCoach !== after.assistantCoach) stats.assistantNamesAdded += 1;
    if (before.assistantEmail !== after.assistantEmail) stats.assistantEmailsAdded += 1;
  }
}

function applyStaff(contact, staff, sourceUrl) {
  const head = staff.find((person) => person.roleType === "head" && validCoachName(person.name, contact));
  const assistants = staff
    .filter((person) => person.roleType === "assistant" && validCoachName(person.name, contact))
    .filter((person) => ![head?.name, contact.headCoach].filter(Boolean).some((name) => normalizeKey(person.name) === normalizeKey(name)))
    .slice(0, 2);
  const before = snapshot(contact);

  const headMatchesContact = head?.name && (isGenericCoach(contact.headCoach) || normalizeKey(head.name) === normalizeKey(contact.headCoach));

  if (head?.name && isGenericCoach(contact.headCoach)) {
    contact.headCoach = head.name;
  }
  if (head?.email && headMatchesContact && !splitList(contact.headEmail).includes(head.email)) {
    contact.headEmail = head.email;
  }

  const assistantNames = assistants.map((person) => person.name).filter(Boolean);
  const assistantEmails = assistants.map((person) => person.email).filter(Boolean);
  if (assistantNames.length && isGenericCoach(contact.assistantCoach)) {
    contact.assistantCoach = appendUnique("", assistantNames, 2);
  } else if (assistantNames.length) {
    contact.assistantCoach = appendUnique(contact.assistantCoach, assistantNames, 2);
  }
  if (assistantEmails.length) {
    contact.assistantEmail = appendUnique(contact.assistantEmail, assistantEmails, 2);
  }

  const afterContact = snapshot(contact);
  const contactChanged =
    before.headCoach !== afterContact.headCoach ||
    before.assistantCoach !== afterContact.assistantCoach ||
    before.headEmail !== afterContact.headEmail ||
    before.assistantEmail !== afterContact.assistantEmail;

  if (!contactChanged) return;

  if (sourceUrl && (!contact.staffDirectoryUrl || /google\.com\/search/i.test(contact.staffDirectoryUrl))) {
    contact.staffDirectoryUrl = sourceUrl;
  }
  if (sourceUrl && isBasketballPage(sourceUrl)) {
    contact.staffDirectoryUrl = sourceUrl;
  }
  contact.sourceStatus = appendSource(contact.sourceStatus, `Coach contacts enriched ${TODAY} from ${sourceUrl}. Verify before sending.`);
}

function extractStaff(html, url, contact) {
  const cleanHtml = String(html).replace(/\\u003C/gi, "<").replace(/\\u003E/gi, ">");
  const chunks = extractChunks(cleanHtml);
  const staff = extractDirectoryStaff(cleanHtml, url, contact);

  for (const chunk of chunks) {
    if (!/coach|basketball|mailto:|@[a-z0-9.-]+\.[a-z]{2,}/i.test(chunk)) continue;
    const text = htmlToText(chunk);
    if (!isMenBasketballContext(text, url)) continue;
    if (!isBasketballPage(url) && !/\b(men'?s basketball|m basketball|mbkb|m-basketball|m-baskbl)\b/i.test(text)) continue;
    const roleType = roleTypeFromText(text);
    if (!roleType) continue;
    const email = extractEmails(chunk)[0] || "";
    const role = extractRole(text);
    const name = extractName(text, role);
    if (name && !validCoachName(name, contact)) continue;
    if (!name && !email) continue;
    staff.push({ name, role, roleType, email, sourceUrl: url });
  }

  return dedupeStaff(staff)
    .sort((a, b) => roleRank(a.roleType, a.role) - roleRank(b.roleType, b.role))
    .slice(0, 8);
}

function extractDirectoryStaff(html, url, contact) {
  const text = htmlToText(html);
  const section = menBasketballSection(text);
  if (!section) return [];
  const lines = section
    .split("\n")
    .map((line) => normalizeSpaces(line))
    .filter(Boolean);
  const staff = [];

  for (let index = 0; index < lines.length; index += 1) {
    const windowText = lines.slice(index, index + 4).join(" ");
    if (!/coach/i.test(windowText)) continue;
    const roleType = roleTypeFromText(windowText);
    if (!roleType) continue;
    const email = extractEmails(windowText)[0] || "";
    const role = extractRole(windowText);
    const name = extractName(windowText, role);
    if (name && !validCoachName(name, contact)) continue;
    if (!name && !email) continue;
    staff.push({ name, role, roleType, email, sourceUrl: url });
  }

  return dedupeStaff(staff);
}

function menBasketballSection(text = "") {
  const normalized = normalizeSpaces(text);
  const startMatch = normalized.match(/\b(Men's Basketball|Mens Basketball|Men Basketball|M Basketball|MBB)\b/i);
  if (!startMatch || startMatch.index == null) return "";
  const after = normalized.slice(startMatch.index);
  const stopMatch = after.slice(startMatch[0].length).match(
    /\n(?:Women's Basketball|Womens Basketball|Women Basketball|Baseball|Football|Softball|Volleyball|Soccer|Cross Country|Men's Golf|Women's Golf|Gymnastics|Men's Track|Women's Track|Track & Field|Swimming|Tennis|Lacrosse|Wrestling|Bowling|Esports|Cheer|Dance)\b/i
  );
  const section = stopMatch ? after.slice(0, startMatch[0].length + stopMatch.index) : after.slice(0, 5000);
  return section;
}

function extractChunks(html) {
  const chunks = [];
  for (const pattern of [
    /<tr\b[\s\S]*?<\/tr>/gi,
    /<article\b[\s\S]*?<\/article>/gi,
    /<li\b[\s\S]*?<\/li>/gi,
    /<div\b[^>]*(?:coach|staff|card|person|roster)[^>]*>[\s\S]*?<\/div>/gi
  ]) {
    for (const match of html.matchAll(pattern)) chunks.push(match[0]);
  }
  if (!chunks.length) {
    const aroundRoles = html.split(/(?=<[^>]+>[^<]*(?:Head Coach|Assistant Coach|Associate Head Coach))/i);
    chunks.push(...aroundRoles.filter((piece) => /Coach/i.test(piece)).slice(0, 80));
  }
  return chunks;
}

function roleTypeFromText(text) {
  const normalized = normalizeSpaces(text);
  if (/\b(women|women's)\b/i.test(normalized) && !/\b(men|men's)\b/i.test(normalized)) return "";
  if (/\bhead coach\b/i.test(normalized) && !/\b(associate|assistant|assistant to the)\b/i.test(normalized)) return "head";
  if (/\b(associate head coach|assistant coach|assistant men's basketball coach|assistant basketball coach)\b/i.test(normalized)) {
    return "assistant";
  }
  return "";
}

function extractRole(text) {
  const match = normalizeSpaces(text).match(
    /\b(Head Coach|Associate Head Coach|Assistant Coach|Assistant Men's Basketball Coach|Assistant Basketball Coach)\b/i
  );
  return match ? titleCase(match[1]) : "";
}

function extractName(text, role) {
  const normalized = normalizeSpaces(text)
    .replace(/\bEmail\b/gi, " ")
    .replace(/\bPhone\b/gi, " ")
    .replace(/\bTwitter\b/gi, " ");
  const roleText = role || extractRole(normalized);
  const roleIndex = roleText ? normalized.toLowerCase().indexOf(roleText.toLowerCase()) : -1;
  const beforeRole = roleIndex > 0 ? normalized.slice(0, roleIndex) : normalized;
  const segments = beforeRole
    .split(/\t|\n|\|| {2,}/)
    .map(cleanNameCandidate)
    .filter(Boolean);

  for (let i = segments.length - 1; i >= 0; i -= 1) {
    if (looksLikeName(segments[i])) return segments[i];
  }

  const words = cleanNameCandidate(beforeRole)
    .split(" ")
    .filter(Boolean);
  for (let size = Math.min(4, words.length); size >= 2; size -= 1) {
    const candidate = words.slice(-size).join(" ");
    if (looksLikeName(candidate)) return candidate;
  }
  return "";
}

function cleanNameCandidate(value = "") {
  return collapseRepeatedName(decodeEntities(value)
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, " ")
    .replace(/\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g, " ")
    .replace(/\b(Head Coach|Associate Head Coach|Assistant Coach|Men's Basketball|Mens Basketball|Basketball|Roster|Coaches|Staff|Email|Phone|Title|Name|Twitter|Ext|Extension|X)\b/gi, " ")
    .replace(/[^A-Za-z.'\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function looksLikeName(value = "") {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  const joined = words.join(" ");
  if (
    /\b(coach|basketball|staff|department|athletics?|affairs|student|campus|part-time|graduate|residential|life|instructor|division|chair|ext|extension|athletic|university|college|state|men|women|email|phone|manager|coordinator|development|recruiting|offensive|defensive|line|swimming|soccer|baseball|softball|volleyball|football|track|field|cross country|jumps|throws|distance)\b/i.test(
      joined
    )
  ) {
    return false;
  }
  if (words.length === 4 && words.every((word) => /^[A-Z][A-Za-z.'-]{1,}$/.test(word))) return false;
  return words.every((word) => /^[A-Z][A-Za-z.'-]{1,}$/.test(word));
}

function collapseRepeatedName(value = "") {
  const words = String(value).split(/\s+/).filter(Boolean);
  if (words.length % 2 !== 0 || words.length < 4) return String(value).trim();
  const half = words.length / 2;
  const first = words.slice(0, half).join(" ").toLowerCase();
  const second = words.slice(half).join(" ").toLowerCase();
  return first === second ? words.slice(0, half).join(" ") : String(value).trim();
}

function validCoachName(name = "", contact = {}) {
  if (!looksLikeName(name)) return false;
  const normalized = normalizeKey(name);
  const schoolTerms = [contact.school, contact.displayName, contact.mascot, contact.conference]
    .filter(Boolean)
    .map(normalizeKey)
    .filter((term) => term.length > 3);
  if (schoolTerms.some((term) => normalized === term || term.includes(normalized) || normalized.includes(term))) return false;
  return true;
}

function isMenBasketballContext(text, url) {
  if (/women|women's/i.test(text) && !/men|men's|m-basketball|mens-basketball|mbkb/i.test(url)) return false;
  return true;
}

function extractEmails(value = "") {
  const mailtos = [...String(value).matchAll(/mailto:([^"'?>\s]+)/gi)].map((match) => decodeURIComponent(match[1].split("?")[0]));
  const visible = [...String(value).matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((match) => match[0]);
  return [...new Set([...mailtos, ...visible].map((email) => email.toLowerCase()).filter(isLikelyEmail))];
}

function isLikelyEmail(email = "") {
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email) && !/example|domain|sentry|wixpress|schema/i.test(email);
}

function htmlToText(html = "") {
  return decodeEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<\/(td|th|div|p|li|span|a|h\d)>/gi, "\n")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .split("\n")
    .map((line) => normalizeSpaces(line))
    .filter(Boolean)
    .join("\n");
}

function decodeEntities(value = "") {
  const named = {
    amp: "&",
    apos: "'",
    quot: '"',
    nbsp: " ",
    ndash: "-",
    mdash: "-",
    rsquo: "'",
    lsquo: "'",
    rdquo: '"',
    ldquo: '"'
  };
  return String(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
}

function dedupeStaff(staff) {
  const seen = new Set();
  const result = [];
  for (const person of staff) {
    const key = person.email || `${normalizeKey(person.name)}:${person.roleType}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(person);
  }
  return result;
}

function roleRank(roleType, role = "") {
  if (roleType === "head") return 0;
  if (/associate head/i.test(role)) return 1;
  return 2;
}

function candidateUrls(contact) {
  const urls = [];
  const officialStaff = isOfficialUrl(contact.staffDirectoryUrl) ? cleanUrl(contact.staffDirectoryUrl) : "";
  const sourceUrl = sourceUrlFromStatus(contact.sourceStatus);
  if (isBasketballPage(sourceUrl)) pushUrl(urls, sourceUrl);
  if (isBasketballPage(officialStaff)) pushUrl(urls, officialStaff);

  for (const base of [sourceUrl, officialStaff].filter(Boolean)) {
    let origin = "";
    try {
      origin = new URL(base).origin;
    } catch {
      continue;
    }
    for (const path of [
      "/sports/mens-basketball/coaches",
      "/sports/mens-basketball/roster/coaches",
      "/sports/mens-basketball/roster",
      "/sports/mbkb/coaches",
      "/sports/mbkb/coaches/index",
      "/sports/mbkb/roster",
      "/sports/mbball/coaches",
      "/sports/mbball/roster",
      "/sports/m-baskbl/coaches",
      "/sports/m-basketball/coaches"
    ]) {
      pushUrl(urls, `${origin}${path}`);
    }
    if (ALLOW_STAFF_DIRECTORIES) {
      for (const path of ["/information/directory/index", "/staff-directory"]) {
        pushUrl(urls, `${origin}${path}`);
      }
    }
  }
  if (ALLOW_STAFF_DIRECTORIES && !isBasketballPage(sourceUrl)) pushUrl(urls, sourceUrl);
  if (ALLOW_STAFF_DIRECTORIES && !isBasketballPage(officialStaff)) pushUrl(urls, officialStaff);
  return urls.slice(0, 14);
}

function shouldDiscover(contact = {}) {
  return !candidateUrls(contact).some((url) => isBasketballPage(url)) || /google\.com\/search/i.test(contact.staffDirectoryUrl || "");
}

async function discoverUrls(contact = {}) {
  const query = `${contact.displayName || contact.school} men's basketball coaches official athletics email`;
  const html = await fetchPage(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
  const urls = [];
  for (const url of extractResultUrls(html)) {
    if (!isUsefulDiscoveredUrl(url)) continue;
    pushUrl(urls, url);
    try {
      const origin = new URL(url).origin;
      for (const path of [
        "/sports/mens-basketball/coaches",
        "/sports/mens-basketball/roster/coaches",
        "/sports/mbkb/coaches",
        "/sports/mbball/coaches",
        "/sports/m-basketball/coaches"
      ]) {
        pushUrl(urls, `${origin}${path}`);
      }
    } catch {
      // Ignore malformed search result URLs.
    }
  }
  stats.discoveredUrls += urls.length;
  return urls.slice(0, 8);
}

function extractResultUrls(html = "") {
  const urls = [];
  for (const match of String(html).matchAll(/href="([^"]+)"/gi)) {
    let href = decodeEntities(match[1]);
    const uddg = href.match(/[?&]uddg=([^&]+)/);
    if (uddg) href = decodeURIComponent(uddg[1]);
    if (/^\/l\/\?kh=/.test(href)) continue;
    if (/^\/\//.test(href)) href = `https:${href}`;
    pushUrl(urls, href);
  }
  return urls;
}

function isUsefulDiscoveredUrl(url = "") {
  if (!/^https?:\/\//i.test(url)) return false;
  if (/(google|bing|duckduckgo|wikipedia|facebook|x\.com|twitter|instagram|youtube|linkedin|sidearmstats|sidearmsports)\./i.test(url)) return false;
  return /athletic|sports|gobluedevils|go[a-z0-9-]+|[a-z0-9-]+sports|\/sports\/|staff-directory|coaches/i.test(url);
}

function isBasketballPage(url = "") {
  return /\/sports\/(?:mens-basketball|m-basketball|mbkb|mbball|m-baskbl|m-bkb)(?:\/|$)/i.test(url);
}

async function fetchPage(url) {
  if (!url || !/^https?:\/\//i.test(url)) return "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!/html|text|json/i.test(contentType)) return "";
    stats.fetched += 1;
    return await response.text();
  } catch {
    stats.failed += 1;
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function sourceUrlFromStatus(value = "") {
  const match = String(value).match(/Auto-enriched [^.]+ from (https?:\/\/\S+)/);
  return match ? cleanUrl(match[1]) : "";
}

function cleanUrl(value = "") {
  return String(value).trim().replace(/[.)\],;]+$/g, "");
}

function pushUrl(urls, url) {
  const clean = cleanUrl(url);
  if (!clean || !/^https?:\/\//i.test(clean) || /google\.com\/search/i.test(clean)) return;
  if (!urls.includes(clean)) urls.push(clean);
}

function isOfficialUrl(url = "") {
  return /^https?:\/\//i.test(url) && !/google\.com\/search/i.test(url);
}

function contactEmails(contact) {
  return [...splitList(contact.headEmail), ...splitList(contact.assistantEmail)];
}

function splitList(value = "") {
  return String(value)
    .split(/[,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function appendUnique(current, additions, max = 2) {
  const existing = splitList(current).filter((item) => !isGenericCoach(item));
  for (const addition of additions) {
    const clean = String(addition || "").trim();
    if (!clean) continue;
    if (existing.some((item) => item.toLowerCase() === clean.toLowerCase())) continue;
    existing.push(clean);
  }
  return existing.slice(0, max).join(", ");
}

function appendSource(current = "", addition = "") {
  if (!addition) return current || "";
  if (String(current).includes(addition)) return current;
  return `${current ? `${current} ` : ""}${addition}`.trim();
}

function isGenericCoach(value = "") {
  return !value || /^verify\b/i.test(String(value).trim());
}

function snapshot(contact) {
  return {
    headCoach: contact.headCoach || "",
    assistantCoach: contact.assistantCoach || "",
    headEmail: contact.headEmail || "",
    assistantEmail: contact.assistantEmail || "",
    staffDirectoryUrl: contact.staffDirectoryUrl || ""
  };
}

function loadContacts() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(CONTACT_FILE, "utf8"), sandbox, { filename: CONTACT_FILE });
  return sandbox.window.RECRUITING_CONTACTS || [];
}

function writeContacts(rows) {
  fs.writeFileSync(
    CONTACT_FILE,
    `// Generated contact starter database for Royce Castle Recruiting Studio.\n// Sources are summarized in sourceStatus; verify official staff pages before sending.\nwindow.RECRUITING_CONTACTS = ${JSON.stringify(rows, null, 2)};\n`
  );
}

async function mapLimit(items, limit, fn) {
  let index = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

function normalizeSpaces(value = "") {
  return String(value).replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n+/g, "\n").trim();
}

function normalizeKey(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function titleCase(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase())
    .replace(/\bMens\b/g, "Men's");
}
