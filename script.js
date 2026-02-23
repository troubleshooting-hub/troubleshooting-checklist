// Storage key (this is where the issues are saved in your browser)
const STORAGE_KEY = "troubleshooting_issues_v1";

// Templates (user can choose 1/2/3, and also edit before saving)
const EMAIL_TEMPLATES = {
  template1: `Subject: Update on your issue

Hi there,

Thanks for your patience. We investigated the issue and have identified the cause.
We are applying the fix now and will confirm once everything is stable.

Regards,
Support Team`,
  template2: `Subject: Detailed update on your issue

Hi there,

Here is the update:

• Issue: {{ISSUE}}
• Root cause: {{ROOT_CAUSE}}
• Solution: {{SOLUTION}}

If you have any questions, reply to this email and we’ll help.

Regards,
Support Team`,
  template3: `Subject: Resolution update

Hi there,

We found what caused the problem and fixed it.  
If you still notice the issue, please share a new example and we will re-check.

Regards,
Support Team`
};

// ---------- Helpers ----------
function loadIssues() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveIssues(issues) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(issues));
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.innerText = text ?? "";
  return div.innerHTML;
}

function checklistLinesToArray(text) {
  return (text || "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
}

// ---------- UI: Tabs ----------
function showTab(tabName) {
  const common = document.getElementById("tab-common");
  const newer = document.getElementById("tab-new");

  common.classList.toggle("hidden", tabName !== "common");
  newer.classList.toggle("hidden", tabName !== "new");

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
}

// ---------- UI: Render Issues ----------
function renderIssues() {
  const issues = loadIssues();
  const list = document.getElementById("issuesList");
  const empty = document.getElementById("issuesEmptyState");

  list.innerHTML = "";

  if (!issues.length) {
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");

  // Latest first
  const sorted = [...issues].sort((a, b) => b.createdAt - a.createdAt);

  sorted.forEach(issue => {
    const card = document.createElement("div");
    card.className = "card issue-card";

    const checklistItems = (issue.checklists || [])
      .map(item => `<li>${escapeHtml(item)}</li>`)
      .join("");

    const zendeskHtml = issue.zendeskLink
      ? `<a href="${escapeHtml(issue.zendeskLink)}" target="_blank" rel="noopener noreferrer">Open Ticket</a>`
      : `<span class="muted">Not provided</span>`;

    card.innerHTML = `
      <h3 class="issue-title">${escapeHtml(issue.issueDescription)}</h3>
      <div class="issue-meta">Saved: ${escapeHtml(formatDate(issue.createdAt))}</div>

      <div class="issue-block">
        <h4>Root Cause</h4>
        <p>${escapeHtml(issue.rootCause)}</p>
      </div>

      <div class="issue-block">
        <h4>Checklists</h4>
        <ul>${checklistItems}</ul>
      </div>

      <div class="issue-block">
        <h4>Zendesk Ticket</h4>
        <p>${zendeskHtml}</p>
      </div>

      <div class="issue-block">
        <h4>Solution</h4>
        <p>${escapeHtml(issue.solution)}</p>
      </div>

      <div class="issue-block">
        <h4>Email Template</h4>
        <p style="white-space: pre-wrap;">${escapeHtml(issue.emailTemplateText)}</p>
      </div>

      <div class="issue-actions">
        <button class="btn btn-ghost" data-delete-id="${escapeHtml(issue.id)}">Delete</button>
      </div>
    `;

    list.appendChild(card);
  });

  // Hook up delete buttons
  list.querySelectorAll("[data-delete-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-delete-id");
      const issuesNow = loadIssues();
      const filtered = issuesNow.filter(x => x.id !== id);
      saveIssues(filtered);
      renderIssues();
    });
  });
}

// ---------- Form ----------
function setTemplateTextFromSelect() {
  const select = document.getElementById("templateSelect");
  const area = document.getElementById("templateText");

  const chosen = select.value;
  const base = EMAIL_TEMPLATES[chosen] || "";
  area.value = base;
}

function resetForm() {
  document.getElementById("issueForm").reset();
  setTemplateTextFromSelect();
}

function handleSave(e) {
  e.preventDefault();

  const issueDescription = document.getElementById("issueDescription").value.trim();
  const rootCause = document.getElementById("rootCause").value.trim();
  const checklistsRaw = document.getElementById("checklists").value;
  const zendeskLink = document.getElementById("zendeskLink").value.trim();
  const solution = document.getElementById("solution").value.trim();
  const emailTemplateText = document.getElementById("templateText").value.trim();

  const checklists = checklistLinesToArray(checklistsRaw);

  // Simple checks (no complicated messages)
  if (!issueDescription || !rootCause || !checklists.length || !solution || !emailTemplateText) {
    alert("Please fill all required fields (including at least 1 checklist item).");
    return;
  }

  const newIssue = {
    id: String(Date.now()) + "_" + Math.random().toString(16).slice(2),
    createdAt: Date.now(),
    issueDescription,
    rootCause,
    checklists,
    zendeskLink,
    solution,
    emailTemplateText
  };

  const issues = loadIssues();
  issues.push(newIssue);
  saveIssues(issues);

  // Update the common issues view immediately
  renderIssues();

  // Move user to Common Issues so they can see it
  showTab("common");

  // Reset form for next entry
  resetForm();
}

// ---------- Clear all ----------
function clearAllIssues() {
  const ok = confirm("This will remove all saved issues. Continue?");
  if (!ok) return;

  saveIssues([]);
  renderIssues();
}

// ---------- Setup ----------
document.addEventListener("DOMContentLoaded", () => {
  // Tabs
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });

  // Template chooser
  document.getElementById("templateSelect").addEventListener("change", setTemplateTextFromSelect);

  // Form submit
  document.getElementById("issueForm").addEventListener("submit", handleSave);

  // Reset
  document.getElementById("resetBtn").addEventListener("click", resetForm);

  // Clear all
  document.getElementById("clearAllBtn").addEventListener("click", clearAllIssues);

  // Initial template + render issues
  setTemplateTextFromSelect();
  renderIssues();

  // Default tab
  showTab("common");
});