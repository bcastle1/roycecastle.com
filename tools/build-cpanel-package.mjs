import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist", "cpanel-public-html");
const backend = path.join(root, "_cpanel", "public_html");

const include = [
  ".htaccess",
  "CNAME",
  "app.js",
  "assets",
  "contacts-data.js",
  "contacts-page.js",
  "contacts.html",
  "flyer.html",
  "index.html",
  "respond.html",
  "respond.js",
  "robots.txt",
  "sitemap.xml",
  "styles.css"
];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const item of include) {
  copy(path.join(root, item), path.join(out, item));
}
copy(backend, out);

console.log(`Created cPanel public_html package at ${out}`);

function copy(from, to) {
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const child of fs.readdirSync(from)) {
      copy(path.join(from, child), path.join(to, child));
    }
    return;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}
