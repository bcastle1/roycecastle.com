# Royce Castle Site Deployment

This repo is ready for two hosting modes.

1. GitHub Pages static mode
   - Public profile, admin workbook, editable drafts, quick replies, and local browser history work.
   - Real server-side sending from `info@roycecastle.com`, permanent admin saves, and open tracking do not work on GitHub Pages because GitHub Pages cannot run PHP.

2. Namecheap/cPanel PHP mode
   - Build the cPanel package with:
     `node tools/build-cpanel-package.mjs`
   - Upload the contents of `dist/cpanel-public-html` to the `roycecastle.com` document root.
   - In the current Namecheap account, that document root appears in File Manager as `/home/xromiats/roycecastle.com`. `xromiats` is the cPanel account username/path, not the source of truth and not a public URL.
   - If cPanel Terminal is available, deploy the current GitHub `main` branch with:
     `bash <(curl -fsSL https://raw.githubusercontent.com/bcastle1/roycecastle.com/main/tools/deploy-royce-cpanel-from-github.sh)`
     This preserves the live `data/` folder while replacing the app files and API package.
   - Keep the generated `api/`, `data/`, `.htaccess`, `robots.txt`, and `sitemap.xml` files.
   - Visit `https://roycecastle.com/api/health.php` after upload. It should report `ok: true`, `mailAvailable: true`, `smtpReady`, and `dataWritable: true`.

## GitHub Source Of Truth

- Canonical repo: `https://github.com/bcastle1/roycecastle.com`
- Make source changes in this repo first.
- Build deployable cPanel files from this repo with `node tools/build-cpanel-package.mjs`.
- Do not treat `/home/xromiats/roycecastle.com` as the editable source; it is only the live hosting destination for files generated from GitHub.
- If the domain is pointed directly at GitHub Pages, the coach-facing static site will work, but the PHP-backed admin send runs, permanent server saves, and open tracking will not.

## Namecheap Email Setup

For `info@roycecastle.com` webmail, the domain must use the mail service that owns the mailbox.

- If using Namecheap Private Email, MX should be `mx1.privateemail.com` and `mx2.privateemail.com`, with the DKIM/SPF records Namecheap gives for Private Email.
- If using cPanel Email, create `info@roycecastle.com` in cPanel, use cPanel Email Deliverability to enable SPF/DKIM, and point MX to the cPanel mail host shown by the account.
- Current public DNS was observed with Namecheap Private Email MX records, SPF, DKIM, and DMARC present for `roycecastle.com`.

## SMTP Activation

After the cPanel package is uploaded, open `/admin/`, go to Settings, and save:

- SMTP host: `mail.privateemail.com`
- SMTP port: `465`
- SMTP encryption: `SSL / port 465`
- SMTP username: `info@roycecastle.com`
- SMTP password: the actual Namecheap Private Email mailbox password

The password is saved server-side only. It is not returned to the browser and is stripped from browser storage. If the host supports environment variables, `RC_SMTP_PASSWORD` can be used instead of storing the password in `data/settings.json`.

## Security Checklist

- Enable AutoSSL/SSL for `roycecastle.com` and `www.roycecastle.com`.
- Keep HTTPS redirect enabled. The included `.htaccess` enforces HTTPS and adds HSTS/security headers on Apache/cPanel.
- Change the default admin code after first login.
- Confirm `data/` is not web-readable. The generated `data/.htaccess` denies direct access.
- Send a small test run to your own address first, then reply to verify replies go to the admin contact email.
- Open the test email and allow images to verify the open counter increments.

## Admin Send Run Test

1. Open `/admin/`.
2. Save the contact/reply email and send-from email as `info@roycecastle.com`.
3. Confirm the run workflow says `Private Email SMTP ready`.
4. Select two test contacts or enter a manual email.
5. Leave "Open mail drafts instead of server sending" unchecked on cPanel mode.
6. Start the run.
7. Confirm the progress bar reaches the selected count, the run log records each send, and Sent/Opened metrics update.
