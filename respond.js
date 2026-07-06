const DEFAULT_REPLY_EMAIL = "info@roycecastle.com";

const responseOptions = {
  high: {
    label: "Highly interested",
    body: "I am highly interested in Royce Castle. Please follow up with full film, eligibility information, and the best next step. I expect to respond within 1-2 days."
  },
  moderate: {
    label: "Moderately interested",
    body: "I am moderately interested in Royce Castle. Please keep me in the loop and send the best evaluation materials. I expect to respond within 1-2 weeks."
  },
  exploring: {
    label: "Interested / exploring fit",
    body: "I am interested in exploring whether Royce Castle could fit our program. We will review fit and roster needs, and may reach out with next steps."
  }
};

const params = new URLSearchParams(window.location.search);
const responseState = {
  school: params.get("school") || "your program",
  coach: params.get("coach") || "",
  replyTo: validEmail(params.get("reply_to")) ? params.get("reply_to") : DEFAULT_REPLY_EMAIL
};

const responseSchool = document.querySelector("#response-school");
const responseContext = document.querySelector("#response-context");
const responseStatus = document.querySelector("#response-status");
const responseNote = document.querySelector("#response-note");
const toastNode = document.querySelector("#toast");

initResponsePage();

function initResponsePage() {
  responseSchool.textContent = `${responseState.school} quick response`;
  responseContext.textContent = `Choose the closest fit for ${responseState.school}. Your email app will open with a prefilled response you can review and send.`;
  document.querySelectorAll("[data-interest]").forEach((button) => {
    button.addEventListener("click", () => openReply(button.dataset.interest));
  });
  if (window.lucide) window.lucide.createIcons();
  window.addEventListener("load", () => window.lucide?.createIcons());
}

function openReply(level) {
  const option = responseOptions[level];
  if (!option) return;
  const subject = `Quick response: ${option.label} - Royce Castle`;
  const note = responseNote.value.trim();
  const body = [
    `Interest level: ${option.label}`,
    `Program: ${responseState.school}`,
    responseState.coach ? `Coach/contact: ${responseState.coach}` : "",
    "",
    option.body,
    note ? `\nAdditional note:\n${note}` : "",
    "",
    "Royce profile: https://roycecastle.com/",
    "Highlight video: https://roycecastle.com/#video",
    "",
    "Sent from the Royce Castle recruiting quick-reply page."
  ]
    .filter(Boolean)
    .join("\n");

  responseStatus.textContent = "Opening your email app with the quick response.";
  toast("Quick response ready to send.");
  window.location.href = `mailto:${encodeURIComponent(responseState.replyTo)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function toast(message) {
  if (!toastNode) return;
  toastNode.textContent = message;
  toastNode.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => toastNode.classList.remove("show"), 2600);
}
