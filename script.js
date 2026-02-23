// -----------------------------
// Simple storage (localStorage)
// -----------------------------
const STORAGE_KEY = "troubleshooting_issues_v1";

// -----------------------------
// App list (defaults)
// -----------------------------
const DEFAULT_APPS = [
  "Active Directory",
  "Azure AD",
  "Okta",
  "ADP",
  "Paycor",
  "Dayforce",
  "Paylocity"
];

// -----------------------------
// Template defaults
// -----------------------------
const DEFAULT_TEMPLATES = [
`Subject: Update on your issue

Hi there,

Thanks for your patience. We investigated the issue and have identified the cause.
We are applying the fix now and will confirm once everything is stable.

Regards,`,
`Subject: We found the cause and next steps

Hi there,

We’ve identified the root cause and are taking the next steps listed below.
If you need anything urgently, reply to this email and we’ll prioritize.

Regards,`,
`Subject: Issue resolved

Hi there,

The issue has been resolved and we’re monitoring to ensure it stays stable.
If you notice the same problem again, please reply with the time it happened.

Regards,`
];

// -----------------------------
// State for "New Issues" form
// -----------------------------
let formTemplates = [];        // array of strings
let activeTemplateIndex = 0;

// -----------------------------
// Helpers
// -----------------------------
function loadIssues() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveIssues(issues) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(issues));
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function linesToBullets(text) {
  return String(text || "")
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);
}

// -----------------------------
// Tabs
// -----------------------------
function setActiveTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  document.getElementById("tab-common").classList.toggle("active", tabName === "common");
  document.getElementById("tab-new").classList.toggle("active", tabName === "new");

  // Render common issues when switching there
  if (tabName === "common") {
    renderIssues();
  }
}

function wireTopTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
  });
}

// -----------------------------
// Application dropdown + add new
// -----------------------------
function fillApplicationSelect() {
  const sel = document.getElementById("applicationSelect");
  sel.innerHTML = "";

  // Add a placeholder option
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select application";
  placeholder.disabled = true;
  placeholder.selected = true;
  sel.appendChild(placeholder);

  DEFAULT_APPS.forEach(app => {
    const opt = document.createElement("option");
    opt.value = app;
    opt.textContent = app;
    sel.appendChild(opt);
  });
}

function wireAddApplication() {
  const addBtn = document.getElementById("addAppBtn");
  const row = document.getElementById("addAppRow");
  const input = document.getElementById("newAppName");
  const saveBtn = document.getElementById("saveAppBtn");
  const cancelBtn = document.getElementById("cancelAppBtn");
  const sel = document.getElementById("applicationSelect");

  addBtn.addEventListener("click", () => {
    row.classList.remove("hidden");
    input.value = "";
    input.focus();
  });

  cancelBtn.addEventListener("click", () => {
    row.classList.add("hidden");
    input.value = "";
  });

  saveBtn.addEventListener("click", () => {
    const name = input.value.trim();
    if (!name) return;

    // Add to dropdown immediately (not to DEFAULT_APPS array)
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);

    sel.value = name;
    row.classList.add("hidden");
    input.value = "";
  });
}

// -----------------------------
// Templates (tabs + add more)
// -----------------------------
function ensureDefaultTemplates() {
  if (formTemplates.length === 0) {
    formTemplates = [...DEFAULT_TEMPLATES];
    activeTemplateIndex = 0;
  }
}

function renderTemplateTabs() {
  const bar = document.getElementById("templateTabBar");
  bar.innerHTML = "";

  formTemplates.forEach((_, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "template-tab" + (idx === activeTemplateIndex ? " active" : "");
    btn.textContent = `Template ${idx + 1}`;
    btn.addEventListener("click", () => {
      // Save current editor text into current template before switching
      formTemplates[activeTemplateIndex] = document.getElementById("templateEditor").value;
      activeTemplateIndex = idx;
      syncTemplateEditor();
      renderTemplateTabs();
    });
    bar.appendChild(btn);
  });
}

function syncTemplateEditor() {
  const editor = document.getElementById("templateEditor");
  editor.value = formTemplates[activeTemplateIndex] || "";
}

function wireTemplateControls() {
  const addBtn = document.getElementById("addTemplateBtn");
  const editor = document.getElementById("templateEditor");

  // Keep state updated as user types
  editor.addEventListener("input", () => {
    formTemplates[activeTemplateIndex] = editor.value;
  });

  addBtn.addEventListener("click", () => {
    // Save current editor into current template first
    formTemplates[activeTemplateIndex] = editor.value;

    // Add a new empty template
    formTemplates.push(`Subject: \n\nHi there,\n\n\nRegards,`);
    activeTemplateIndex = formTemplates.length - 1;

    renderTemplateTabs();
    syncTemplateEditor();
    editor.focus();
  });
}

// -----------------------------
// Save / Reset form
// -----------------------------
function wireForm() {
  const form = document.getElementById("issueForm");
  const resetBtn = document.getElementById("resetBtn");

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    // Always capture latest editor text
    formTemplates[activeTemplateIndex] = document.getElementById("templateEditor").value;

    const issueDescription = document.getElementById("issueDescription").value.trim();
    const application = document.getElementById("applicationSelect").value;
    const rootCause = document.getElementById("rootCause").value.trim();
    const checklistsText = document.getElementById("checklists").value;
    const zendeskLink = document.getElementById("zendeskLink").value.trim();
    const solution = document.getElementById("solution").value.trim();

    if (!issueDescription) return;
    if (!application) return;

    const issue = {
      id: uid(),
      issueDescription,
      application,
      rootCause,
      checklists: linesToBullets(checklistsText),
      zendeskLink,
      solution,
      templates: formTemplates.filter(t => String(t).trim().length > 0)
    };

    const issues = loadIssues();
    issues.unshift(issue); // newest first
    saveIssues(issues);

    // Reset form + go to Common Issues
    resetForm();
    setActiveTab("common");
  });

  resetBtn.addEventListener("click", () => resetForm());
}

function resetForm() {
  document.getElementById("issueDescription").value = "";
  document.getElementById("rootCause").value = "";
  document.getElementById("checklists").value = "";
  document.getElementById("zendeskLink").value = "";
  document.getElementById("solution").value = "";

  // Reset application select
  const sel = document.getElementById("applicationSelect");
  sel.value = "";

  // Reset template state
  formTemplates = [...DEFAULT_TEMPLATES];
  activeTemplateIndex = 0;
  renderTemplateTabs();
  syncTemplateEditor();
}

// -----------------------------
// Common Issues rendering
// -----------------------------
function renderIssues() {
  const issues = loadIssues();
  const list = document.getElementById("issuesList");
  const empty = document.getElementById("issuesEmptyState");

  list.innerHTML = "";

  const query = (document.getElementById("searchInput").value || "").trim().toLowerCase();

  const filtered = issues.filter(issue => {
    if (!query) return true;

    const haystack = [
      issue.issueDescription,
      issue.application,
      issue.rootCause,
      (issue.checklists || []).join(" "),
      issue.solution,
      issue.zendeskLink,
      (issue.templates || []).join(" ")
    ].join(" ").toLowerCase();

    return haystack.includes(query);
  });

  empty.style.display = filtered.length ? "none" : "block";

  filtered.forEach(issue => {
    const card = document.createElement("div");
    card.className = "issue-card";

    card.innerHTML = `
      <div class="issue-title">
        <h3>${escapeHtml(issue.issueDescription)}</h3>
        <span class="badge">${escapeHtml(issue.application || "Unknown app")}</span>
      </div>

      ${issue.rootCause ? `<div class="issue-meta"><strong>Root cause:</strong> ${escapeHtml(issue.rootCause)}</div>` : ""}

      <div class="issue-section">
        <h4>Checklist</h4>
        ${
          (issue.checklists && issue.checklists.length)
            ? `<ul>${issue.checklists.map(i => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`
            : `<p>No checklist added.</p>`
        }
      </div>

      <div class="issue-section">
        <h4>Zendesk</h4>
        ${
          issue.zendeskLink
            ? `<p class="issue-link"><a href="${escapeHtml(issue.zendeskLink)}" target="_blank" rel="noreferrer">Open ticket</a></p>`
            : `<p>No ticket link.</p>`
        }
      </div>

      <div class="issue-section">
        <h4>Solution</h4>
        <p>${issue.solution ? escapeHtml(issue.solution) : "No solution added."}</p>
      </div>

      <div class="issue-section">
        <h4>Email Templates</h4>
        <div class="template-viewer" data-issue-id="${escapeHtml(issue.id)}">
          <div class="template-tabbar" data-role="tabs"></div>
          <div class="template-box" data-role="box"></div>
        </div>
      </div>
    `;

    list.appendChild(card);

    // Build template tabs for this card
    buildIssueTemplateViewer(issue);
  });
}

function buildIssueTemplateViewer(issue) {
  const viewer = document.querySelector(`.template-viewer[data-issue-id="${CSS.escape(issue.id)}"]`);
  if (!viewer) return;

  const tabsBar = viewer.querySelector('[data-role="tabs"]');
  const box = viewer.querySelector('[data-role="box"]');

  const templates = (issue.templates && issue.templates.length) ? issue.templates : ["No templates saved."];

  let activeIdx = 0;

  function renderTabs() {
    tabsBar.innerHTML = "";
    templates.forEach((_, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "template-tab" + (idx === activeIdx ? " active" : "");
      btn.textContent = `Template ${idx + 1}`;
      btn.addEventListener("click", () => {
        activeIdx = idx;
        renderTabs();
        renderBox();
      });
      tabsBar.appendChild(btn);
    });
  }

  function renderBox() {
    box.textContent = templates[activeIdx] || "";
  }

  renderTabs();
  renderBox();
}

// -----------------------------
// Search
// -----------------------------
function searchContent() {
  // Only affects Common Issues list
  if (document.getElementById("tab-common").classList.contains("active")) {
    renderIssues();
  }
}

// -----------------------------
// Init
// -----------------------------
function init() {
  wireTopTabs();

  fillApplicationSelect();
  wireAddApplication();

  ensureDefaultTemplates();
  renderTemplateTabs();
  syncTemplateEditor();
  wireTemplateControls();

  wireForm();
  renderIssues();
}

document.addEventListener("DOMContentLoaded", init);