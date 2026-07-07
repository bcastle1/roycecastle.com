(function () {
  const ADMIN_CODE_KEY = "royceCastleRecruitingStudio.adminCode.v1";
  const ADMIN_SESSION_KEY = "royceCastleRecruitingStudio.adminUnlocked.v1";

  if (sessionStorage.getItem(ADMIN_SESSION_KEY) === "true") return;

  document.addEventListener("DOMContentLoaded", () => {
    const overlay = document.createElement("section");
    overlay.className = "admin-auth-overlay";
    overlay.innerHTML = `
      <form class="login-card" id="page-admin-auth">
        <span class="brand-mark">RC</span>
        <h1>Admin Access</h1>
        <p>Enter the admin code to view the private workbook.</p>
        <label>Admin code<input id="page-admin-code" type="password" autocomplete="current-password" autofocus></label>
        <button class="primary-button" type="submit"><i data-lucide="lock-keyhole"></i>Unlock</button>
        <a class="ghost-button" href="/admin/"><i data-lucide="settings"></i>Go to Admin</a>
        <p class="login-error" id="page-admin-error" hidden>That code did not match.</p>
      </form>
    `;
    document.body.append(overlay);
    window.lucide?.createIcons();

    overlay.querySelector("#page-admin-auth").addEventListener("submit", async (event) => {
      event.preventDefault();
      const code = overlay.querySelector("#page-admin-code").value;
      const expected = localStorage.getItem(ADMIN_CODE_KEY) || "Patriot";
      const serverOk = await loginWithServer(code);
      if (serverOk || code === expected) {
        sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
        overlay.remove();
        return;
      }
      overlay.querySelector("#page-admin-error").hidden = false;
    });
  });

  async function loginWithServer(code) {
    try {
      const response = await fetch("api/admin.php?action=login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      return response.ok;
    } catch {
      return false;
    }
  }
})();
