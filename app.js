const PUBLIC_MESSAGES_KEY = "royceCastleRecruitingStudio.publicMessages.v1";
const ADMIN_SETTINGS_KEY = "royceCastleRecruitingStudio.adminSettings.v1";

const defaultPublicSettings = {
  forwardEmail: "info@roycecastle.com",
  fromEmail: "info@roycecastle.com"
};

const contactForm = document.querySelector("#public-contact-form");
const contactStatus = document.querySelector("#contact-status");
const toastNode = document.querySelector("#toast");

initPublicPage();

function initPublicPage() {
  contactForm?.addEventListener("submit", handleContactSubmit);
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const target = document.querySelector(link.getAttribute("href"));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  if (window.lucide) window.lucide.createIcons();
  window.addEventListener("load", () => window.lucide?.createIcons());
}

async function handleContactSubmit(event) {
  event.preventDefault();
  const settings = loadPublicSettings();
  const message = {
    id: crypto.randomUUID ? crypto.randomUUID() : `message-${Date.now()}`,
    name: valueOf("#contact-name"),
    email: valueOf("#contact-email"),
    program: valueOf("#contact-program"),
    role: valueOf("#contact-role"),
    body: valueOf("#contact-message"),
    createdAt: new Date().toISOString(),
    status: "New"
  };

  const subject = `Royce Castle recruiting inquiry from ${message.program}`;
  const body = [
    `Name: ${message.name}`,
    `Email: ${message.email}`,
    `Program: ${message.program}`,
    `Role: ${message.role || "Not provided"}`,
    "",
    "Royce profile: https://roycecastle.com/",
    "Highlight video: https://roycecastle.com/#video",
    "",
    message.body
  ].join("\n");

  contactStatus.textContent = "Saving your message...";
  toast("Saving message...");

  const serverSaved = await saveMessageToServer(message);
  const messages = loadMessages();
  messages.unshift(message);
  localStorage.setItem(PUBLIC_MESSAGES_KEY, JSON.stringify(messages.slice(0, 100)));

  contactForm.reset();
  if (serverSaved) {
    contactStatus.textContent = "Message sent. Thank you for reaching out.";
    toast("Message sent.");
    return;
  }

  contactStatus.textContent = "Message saved. Opening your email app so the message can be sent.";
  toast("Message ready to send.");
  window.location.href = `mailto:${encodeURIComponent(settings.forwardEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function saveMessageToServer(message) {
  try {
    const response = await fetch("api/message.php", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message)
    });
    return response.ok;
  } catch {
    return false;
  }
}

function loadPublicSettings() {
  try {
    return { ...defaultPublicSettings, ...(JSON.parse(localStorage.getItem(ADMIN_SETTINGS_KEY) || "{}") || {}) };
  } catch {
    return { ...defaultPublicSettings };
  }
}

function loadMessages() {
  try {
    const messages = JSON.parse(localStorage.getItem(PUBLIC_MESSAGES_KEY) || "[]");
    return Array.isArray(messages) ? messages : [];
  } catch {
    return [];
  }
}

function valueOf(selector) {
  return document.querySelector(selector)?.value.trim() || "";
}

function toast(message) {
  if (!toastNode) return;
  toastNode.textContent = message;
  toastNode.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => toastNode.classList.remove("show"), 2600);
}
