import fs from "node:fs";
import vm from "node:vm";

const contactFile = "contacts-data.js";
const colorFile = "tools/data/ncaa-team-colors.json";
const genericPrimary = "#164b88";
const genericAccent = "#f2b84b";

const contacts = loadContacts();
const colorRows = JSON.parse(fs.readFileSync(colorFile, "utf8"));
const colorIndex = new Map();

for (const row of colorRows) {
  colorIndex.set(normalize(row.name), row.colors || []);
}

const manualColors = new Map([
  ["byu cougars", { primary: "#002E5D", accent: "#FFFFFF", source: "manual:byu-athletics-blue-white" }]
]);

const aliases = new Map([
  ["brigham young cougars", "byu cougars"],
  ["brigham young university cougars", "byu cougars"],
  ["cal state bakersfield roadrunners", "cal state bakersfield roadrunners"],
  ["california baptist lancers", "cal baptist lancers"],
  ["central connecticut state blue devils", "central connecticut blue devils"],
  ["college of charleston cougars", "charleston cougars"],
  ["csu bakersfield roadrunners", "cal state bakersfield roadrunners"],
  ["detroit mercy titans", "detroit titans"],
  ["florida international panthers", "fiu panthers"],
  ["gardner webb runnin bulldogs", "gardner-webb runnin' bulldogs"],
  ["houston christian huskies", "houston baptist huskies"],
  ["incarnate word cardinals", "uiw cardinals"],
  ["iu indianapolis jaguars", "iupui jaguars"],
  ["louisiana ragin cajuns", "louisiana-lafayette ragin' cajuns"],
  ["louisiana monroe warhawks", "ulm warhawks"],
  ["loyola chicago ramblers", "loyola (il) ramblers"],
  ["loyola maryland greyhounds", "loyola (md) greyhounds"],
  ["mcneese cowboys", "mcneese state cowboys"],
  ["miami hurricanes", "miami (fl) hurricanes"],
  ["miami ohio redhawks", "miami (oh) redhawks"],
  ["middle tennessee blue raiders", "middle tennessee state blue raiders"],
  ["omaha mavericks", "nebraska-omaha mavericks"],
  ["purdue fort wayne mastodons", "ipfw mastodons"],
  ["saint francis red flash", "st. francis (pa) red flash"],
  ["saint josephs hawks", "st. joseph's hawks"],
  ["saint louis billikens", "st. louis billikens"],
  ["saint marys gaels", "saint mary's gaels"],
  ["siue cougars", "southern illinois-edwardsville cougars"],
  ["st thomas tommies", "st. thomas tommies"],
  ["uc davis aggies", "california-davis aggies"],
  ["uc irvine anteaters", "california-irvine anteaters"],
  ["uc riverside highlanders", "california-riverside highlanders"],
  ["uc san diego tritons", "california-san diego tritons"],
  ["uc santa barbara gauchos", "california-santa barbara gauchos"],
  ["unc asheville bulldogs", "north carolina-asheville bulldogs"],
  ["unc greensboro spartans", "north carolina-greensboro spartans"],
  ["unc wilmington seahawks", "north carolina-wilmington seahawks"],
  ["ut arlington mavericks", "texas-arlington mavericks"],
  ["ut martin skyhawks", "tennessee-martin skyhawks"],
  ["ut rio grande valley vaqueros", "utrgv vaqueros"],
  ["utep miners", "texas-el paso miners"],
  ["utsa roadrunners", "texas-san antonio roadrunners"],
  ["western illinois leathernecks", "western illinois fighting leathernecks"]
]);

let exact = 0;
let alias = 0;
let skipped = 0;

for (const contact of contacts) {
  const currentPrimary = contact.primaryColor;
  const currentAccent = contact.accentColor;

  const candidates = [
    contact.displayName,
    contact.school,
    `${contact.school || ""} ${contact.mascot || ""}`
  ]
    .filter(Boolean)
    .map(normalize);

  const manual = candidates.map((candidate) => manualColors.get(candidate)).find(Boolean);
  if (manual) {
    contact.primaryColor = manual.primary;
    contact.accentColor = manual.accent;
    contact.colorSource = manual.source;
    continue;
  }

  if (currentPrimary && currentAccent && (currentPrimary !== genericPrimary || currentAccent !== genericAccent) && !contact.colorSource) {
    skipped += 1;
    continue;
  }

  let matchColors = null;
  let sourceName = "";
  for (const candidate of candidates) {
    if (colorIndex.has(candidate)) {
      matchColors = colorIndex.get(candidate);
      sourceName = candidate;
      exact += 1;
      break;
    }
    const aliased = aliases.get(candidate);
    if (aliased && colorIndex.has(aliased)) {
      matchColors = colorIndex.get(aliased);
      sourceName = aliased;
      alias += 1;
      break;
    }
  }

  if (!matchColors) continue;
  const palette = normalizePalette(matchColors);
  if (!palette) continue;
  contact.primaryColor = palette.primary;
  contact.accentColor = palette.accent;
  contact.colorSource = `ncaa-team-colors:${sourceName}`;
}

fs.writeFileSync(contactFile, `// Generated contact starter database for Royce Castle Recruiting Studio.\n// Sources are summarized in sourceStatus; verify official staff pages before sending.\nwindow.RECRUITING_CONTACTS = ${JSON.stringify(contacts, null, 2)};\n`);

const enriched = contacts.filter((contact) => contact.colorSource).length;
const generic = contacts.filter((contact) => contact.primaryColor === genericPrimary && contact.accentColor === genericAccent).length;
console.log(JSON.stringify({ exact, alias, skipped, enriched, generic, total: contacts.length }, null, 2));

function loadContacts() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(contactFile, "utf8"), sandbox, { filename: contactFile });
  return sandbox.window.RECRUITING_CONTACTS || [];
}

function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bst\.?\b/g, "saint")
    .replace(/\buniv\.?\b/g, "university")
    .replace(/\bthe\b/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePalette(colors) {
  const clean = [...new Set(colors.map((color) => String(color || "").trim().toUpperCase()).filter(/^#[0-9A-F]{6}$/i.test.bind(/^#[0-9A-F]{6}$/i)))];
  if (!clean.length) return null;
  const nonWhite = clean.filter((color) => !["#FFFFFF", "#FFFFFE", "#FDFDFD"].includes(color));
  const colorful = nonWhite.filter((color) => colorStats(color).saturation > 0.12);
  const primaryPool = colorful.length ? colorful : nonWhite;
  const primary = primaryPool.sort((a, b) => primaryScore(b) - primaryScore(a))[0] || clean[0];
  const accent = clean.find((color) => color !== primary) || (primary === "#FFFFFF" ? "#07111F" : "#FFFFFF");
  return { primary, accent };
}

function primaryScore(color) {
  const stats = colorStats(color);
  return stats.saturation * 0.75 + (1 - stats.luminance) * 1.25;
}

function colorStats(color) {
  const r = parseInt(color.slice(1, 3), 16) / 255;
  const g = parseInt(color.slice(3, 5), 16) / 255;
  const b = parseInt(color.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const saturation = max === 0 ? 0 : (max - min) / max;
  return { luminance, saturation };
}
