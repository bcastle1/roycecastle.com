# Royce Castle Site Deployment

This repo is ready for two hosting modes.

1. GitHub Pages static mode
   - The public recruiting profile remains available as a static site.
   - Private admin/workbook access, sending from `info@roycecastle.com`, permanent saves, and optional open tracking require server authentication and therefore do not run on GitHub Pages.

2. Namecheap/cPanel PHP mode
   - Build the cPanel package with:
     `node tools/build-cpanel-package.mjs`
   - Upload the contents of `dist/cpanel-public-html` to the `roycecastle.com` document root.
   - In the current Namecheap account, that document root appears in File Manager as `/home/xromiats/roycecastle.com`. `xromiats` is the cPanel account username/path, not the source of truth and not a public URL.
   - If cPanel Terminal is available, choose the exact 40-character Git commit SHA to deploy and run that commit's copy of the deploy script:
     ```bash
     DEPLOY_SHA="<40-character commit SHA>"
     curl -fsSL "https://raw.githubusercontent.com/bcastle1/roycecastle.com/$DEPLOY_SHA/tools/deploy-royce-cpanel-from-github.sh" \
       | env ROYCE_ARCHIVE_SHA="$DEPLOY_SHA" ROYCE_EXPECTED_USER="xromiats" ROYCE_TARGET="/home/xromiats/roycecastle.com" bash -s
     ```
     The script rejects a branch name or abbreviated SHA. It preserves the live `data/` folder, forces sending paused under `settings.json.lock`, stages all managed files on the target filesystem, and rolls back the managed files if an ordinary replacement step fails.
   - Keep the generated `api/`, `data/`, `.htaccess`, `robots.txt`, and `sitemap.xml` files.
   - Visit `https://roycecastle.com/api/health.php` after upload. It should report `ok: true`, `smtpReady: true`, `dataWritable: true`, and `sendingEnabled: false`.

## GitHub Source Of Truth

- Canonical repo: `https://github.com/bcastle1/roycecastle.com`
- Make source changes in this repo first.
- Build deployable cPanel files from this repo with `node tools/build-cpanel-package.mjs`.
- Do not treat `/home/xromiats/roycecastle.com` as the editable source; it is only the live hosting destination for files generated from GitHub.
- If the domain is pointed directly at GitHub Pages, the coach-facing static site will work, but the PHP-backed admin send runs, permanent server saves, and open tracking will not.

## Automatic GitHub-to-cPanel Deploy

The workflow `.github/workflows/deploy-cpanel.yml` runs on every push to `main` and can also be run manually from GitHub Actions. It checks out and deploys the exact immutable `github.sha`, runs `node tools/qa-static.mjs`, SSHes into Namecheap/cPanel with strict pinned-host verification, runs that commit's `tools/deploy-royce-cpanel-from-github.sh`, and verifies `https://roycecastle.com/api/health.php`. Deployments are serialized both by GitHub Actions and by a persistent remote `flock`; an in-flight deployment is never canceled to start a newer one.

Add these GitHub repository secrets once:

- `CPANEL_HOST`: `premium126.web-hosting.com`
- `CPANEL_USER`: `xromiats`
- `CPANEL_PORT`: Namecheap SSH port, usually `21098`
- `CPANEL_TARGET`: `/home/xromiats/roycecastle.com`
- `CPANEL_SSH_PRIVATE_KEY`: preferred, the private key for a cPanel SSH key authorized for `xromiats`
- `CPANEL_KNOWN_HOSTS`: required, the independently verified SSH host-key line for `[premium126.web-hosting.com]:21098` (or the configured host and port)

Alternative to the key secret:

- `CPANEL_SSH_PASSWORD`: cPanel SSH password, if key-based SSH is not configured

Obtain the host key from a trusted administrator or Namecheap and verify its fingerprint through an independent channel before saving it. The workflow deliberately does not learn or accept a new key during deployment. Password fallback uses `sshpass -e` so the password is not placed in the process argument list.

The remote script only accepts the existing, non-symlink target `/home/<CPANEL_USER>/roycecastle.com`. It preflights the entire archive and PHP syntax before touching the target, then prepares a complete same-filesystem stage and rollback copy before atomically renaming individual managed entries into place. The preserved `data/` directory is never replaced, and its HTTP deny rule stays continuously installed during deployment and rollback. After those secrets exist, future pushes to `main` deploy live automatically without opening Namecheap or cPanel in the browser.

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

The password is saved server-side only. It is not returned to the browser and is stripped from browser storage. If the host supports environment variables, `RC_SMTP_PASSWORD` can be used instead of storing the password in `data/settings.json`. Live sends never fall back to PHP `mail()`; the authenticated SMTP mailbox is also forced as the From/envelope sender.

## Security Checklist

- Enable AutoSSL/SSL for `roycecastle.com` and `www.roycecastle.com`.
- Keep HTTPS redirect enabled. The included `.htaccess` enforces HTTPS and adds HSTS/security headers on Apache/cPanel.
- Before deploying this version, save a new unique admin code from the current authenticated dashboard or configure `RC_ADMIN_CODE` / `RC_ADMIN_CODE_HASH` on the server. The API no longer accepts a public hard-coded fallback code. The automatic deploy script checks for this migration and stops before replacing the live files if no private code/hash is present; `ROYCE_ALLOW_UNCONFIGURED_ADMIN=1` is reserved for a controlled recovery deploy with server access.
- Confirm `data/` is not web-readable. The generated `data/.htaccess` denies direct access.
- Confirm health reports `sendingEnabled: false`; every deployment forces the preserved server setting back to paused.
- Keep live sending paused until the email provider confirms the account is permitted to send again.
- After clearance, send one plain-text test to an address you control, then reply to verify replies go to the admin contact email.
- Only if HTML tracking is deliberately enabled, allow images in a test message and verify the open counter increments.

## Admin Send Run Test

1. Open `/admin/`.
2. Save the contact/reply email and send-from email as `info@roycecastle.com`.
3. Leave live sending disabled while preparing and reviewing drafts. Plain text and open tracking off are the safe defaults.
4. After provider clearance, enter one explicit manual-run address you control. Leave the UTC daily attempt limit at its default of 1.
5. Clear any CC field for the test. CC is retained only for manual mail drafts and is never included in a live server send.
6. In Settings, explicitly enable live sending and save. Leave "Open mail drafts instead of server sending" unchecked only for the confirmed live test.
7. Keep the delay at 300 seconds or longer, start the run, verify the exact recipient and subject in the confirmation, and approve it.
8. Confirm live sending automatically returns to paused after the attempt.
9. Confirm the progress bar reports processed, accepted, and failed separately. The Accepted card is backed by compact server counters rather than the capped detailed-history list.
10. Select **View Run History**, switch between saved runs, and confirm each summary reports accepted out of total, processed, failed, transport, timing, and whether the run completed. The newest 50 summaries are retained; interrupted runs remain visible as incomplete.

The first deployment of the persistent counter bootstraps from retained records that include a sending-server transport, so its initial Accepted value is shown as a minimum (`+`). Manual "sent" marks without a recorded transport are excluded. New results are counted exactly after that point. Run history does not invent summaries for older runs that lack run metadata. SMTP failures remain failures and are no longer silently relabeled as successful PHP mail fallbacks. “Accepted” means the sending server accepted the message; it does not prove inbox delivery.
