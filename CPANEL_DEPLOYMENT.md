# Royce Castle Site Deployment

This repo is ready for two hosting modes.

1. GitHub Pages static mode
   - Public profile, admin workbook, editable drafts, quick replies, and local browser history work.
   - Real server-side sending from `info@roycecastle.com`, permanent admin saves, and open tracking do not work on GitHub Pages because GitHub Pages cannot run PHP.

2. Namecheap/cPanel PHP mode
   - Build the cPanel package with:
     `node tools/build-cpanel-package.mjs`
   - Upload the contents of `dist/cpanel-public-html` to `public_html`.
   - Keep the generated `api/`, `data/`, `.htaccess`, `robots.txt`, and `sitemap.xml` files.
   - Visit `https://roycecastle.com/api/health.php` after upload. It should report `ok: true`, `mailAvailable: true`, and `dataWritable: true`.

## Namecheap Email Setup

For `info@roycecastle.com` webmail, the domain must use the mail service that owns the mailbox.

- If using Namecheap Private Email, MX should be `mx1.privateemail.com` and `mx2.privateemail.com`, with the DKIM/SPF records Namecheap gives for Private Email.
- If using cPanel Email, create `info@roycecastle.com` in cPanel, use cPanel Email Deliverability to enable SPF/DKIM, and point MX to the cPanel mail host shown by the account.
- The current public DNS was observed with registrar forwarding MX records (`eforward*.registrar-servers.com`). That can receive forwarded mail, but it is not the same as a full webmail mailbox that can send as `info@roycecastle.com`.

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
3. Select two test contacts or enter a manual email.
4. Leave "Open mail drafts instead of server sending" unchecked on cPanel mode.
5. Start the run.
6. Confirm the progress bar reaches the selected count, the run log records each send, and Sent/Opened metrics update.
