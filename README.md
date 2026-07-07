# Royce Castle Recruiting App

Standalone static site for Royce Castle's basketball recruiting profile and admin outreach app.

Production domain: https://roycecastle.com/

This GitHub repository is the source of truth for the Royce recruiting app. Future Royce app updates should be made here and pushed to `github.com/bcastle1/roycecastle.com`; cPanel server folders are deployment targets only.

For static GitHub Pages hosting, the app prepares drafts and stores admin data in the browser. For Namecheap/cPanel hosting, the included PHP `api/` layer sends from the configured admin email, saves settings/messages/history permanently in `data/`, and tracks email opens with a standard tracking pixel.

Public site:
- `/` coach-facing recruiting profile, prospectus, video, and contact section.

Private admin:
- `/admin/` browser-based admin studio. Default admin code: `Patriot`.
- `contacts.html` is linked from the admin studio and guarded by the same admin code.

Deployment:
- GitHub Pages can serve the public static site from this repo with the included `CNAME`, but GitHub Pages cannot run the PHP email sender, permanent saves, or open tracking.
- Namecheap/cPanel can run the full app, including SMTP sending and tracking, by deploying the package built from this repo to the `roycecastle.com` document root.
- See `CPANEL_DEPLOYMENT.md` before updating the live host.
- Change the default admin code after first login.
- Confirm `https://roycecastle.com/api/health.php` reports `ok: true` after cPanel upload.
