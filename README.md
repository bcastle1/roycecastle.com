# Royce Castle Recruiting App

Standalone static site for Royce Castle's basketball recruiting profile and admin outreach app.

Production domain: https://roycecastle.com/

This GitHub repository is the source of truth for the Royce recruiting app. Future Royce app updates should be made here and pushed to `github.com/bcastle1/roycecastle.com`; cPanel server folders are deployment targets only.

GitHub Pages can host the public recruiting profile, but private admin access is intentionally server-authenticated and requires the Namecheap/cPanel PHP deployment. The included PHP `api/` layer saves settings/messages/history permanently in `data/`. Live sending is server-paused by default; plain text is the default format, and HTML/open tracking are optional.

Public site:
- `/` coach-facing recruiting profile, prospectus, video, and contact section.

Private admin:
- `/admin/` server-authenticated admin studio. Configure a private admin code/hash before deployment; there is no static or public fallback credential.
- Email Runs includes a selectable, server-persisted history of the newest 50 runs, with accepted out of total, processed, failed, transport, timing, completion state, and the last error for interrupted runs.
- Live sends require authenticated SMTP plus explicit enablement, are limited to one separately confirmed recipient, default to one UTC attempt per day (maximum configurable daily limit 25), and wait at least 300 seconds between attempts. Every claimed live send automatically pauses the gate again. CC is available only for manual drafts and is never added to a live server send. "Accepted" means accepted by SMTP, not confirmed inbox delivery.
- Opt-out additions and removals are atomic server operations; a failed suppression save pauses live sending in the active admin session instead of reporting a permanent success.
- `contacts.html` is linked from the admin studio and guarded by the same admin code.

Deployment:
- GitHub Pages can serve the public static site from this repo with the included `CNAME`, but the private admin, PHP email sender, permanent saves, and open tracking require cPanel.
- Namecheap/cPanel can run the full app, including gated SMTP sending and optional HTML open tracking, by deploying the package built from this repo to the `roycecastle.com` document root.
- See `CPANEL_DEPLOYMENT.md` before updating the live host.
- Rotate any legacy admin code before deploying the current fail-closed authentication update.
- Deployments atomically force live sending off. Confirm `https://roycecastle.com/api/health.php` reports `ok: true`, `dataWritable: true`, and `sendingEnabled: false` after cPanel upload.
