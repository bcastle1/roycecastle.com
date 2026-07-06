# Royce Castle Recruiting App

Standalone static site for Royce Castle's basketball recruiting profile and admin outreach app.

Production domain: https://roycecastle.com/

This repository is the new source of truth for the Royce recruiting app. Future Royce app updates should be made here and pushed to this repo, not to the PatriotJJ site.

For static GitHub Pages hosting, the app prepares drafts and stores admin data in the browser. For Namecheap/cPanel hosting, the included PHP `api/` layer sends from the configured admin email, saves settings/messages/history permanently in `data/`, and tracks email opens with a standard tracking pixel.

Public site:
- `/` coach-facing recruiting profile, prospectus, video, and contact section.

Private admin:
- `/admin/` browser-based admin studio. Default admin code: `Patriot`.
- `contacts.html` is linked from the admin studio and guarded by the same admin code.

Deployment:
- See `CPANEL_DEPLOYMENT.md` before moving the domain from GitHub Pages to Namecheap/cPanel.
- Change the default admin code after first login.
- Confirm `https://roycecastle.com/api/health.php` reports `ok: true` after cPanel upload.
