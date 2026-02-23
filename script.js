/* =========================
   Troubleshooting Portal
   - Stores issues in localStorage
   - Common Issues: list titles only
   - Click title -> details panel
   - Edit mode lets you edit all fields + templates
========================= */

const STORAGE_KEY = "troubleshooting_issues_v2";
const APP_STORAGE_KEY = "troubleshooting_apps_v2";

// Default applications (your list)
const DEFAULT_APPS = [
  "Active Directory",
  "Azure AD",
  "Okta",
  "ADP",
  "Paycor",
  "Dayforce",
  "Paylocity",
];

// Default templates (you can edit these)
const DEFAULT_TEMPLATES = [
  `Subject: Update on your issue

Hi there,

Thanks for your patience. We investigated the issue and have identified the cause.
We are applying the fix now and will confirm once everything is stable.

Regards,`,
  `Subject: Next steps for your issue

Hi there,

We found what caused the issue. Please follow the steps below:
- Step 1:
- Step 2:

If you'd like, share any error screenshots/logs and we can validate quickly.

Regards,`,
  `Subject: Issue resolved

Hi there,

Good news — the issue is resolved.
If you see the problem again, please reply to this message with the time it occurred.

Regards,`,
];

let issues = [];
let applications = [];
let activeTab = "common"; // "common" | "new"
let selectedIssueId = null;

// Common view state
let commonSearch = "";

// New issue template state
let newIssueTemplateIndex = 0;
let newIssueTemplates = [...DEFAULT_TEMPLATES];

// Edit issue template state
let editIssueTemplateIndex = 0;

function $(id) {
  return document.getElementById(id);
}

function safeText(v) {
  return (v ?? "").toString();
}

function loadIssues() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveIssues() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(issues));
}

function loadApps() {
  try {
    const raw = localStorage.getItem(APP_STORAGE_KEY);
    if (!raw) return [...DEFAULT_APPS];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULT_APPS];
    return parsed;
  } catch {
    return [...DEFAULT_APPS];
  }
}

function saveApps() {
  localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(applications));
}

function makeId() {
  return "iss_" + Math.random().toString(16).slice(2) + "_" + Date.now();
}

function parseChecklist(text) {
  return safeText(text)
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);
}

function formatTitle(issue) {
  // Title shown in list (just the main label)
  // Example: "409 - User principal name already exists"
  return safeText(issue.issueDescription).trim() || "(Untitled issue)";
}

function matchesSearch(issue, q) {
  if (!q) return true;
  const hay = [
    issue.issueDescription,
    issue.application,
    issue.rootCause,
    ...(issue.checklist || []),
    issue.solution,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

function setTab(tabName) {
  activeTab = tabName;

  $("tabCommonBtn").classList.toggle("active", tabName === "common");
  $("tabNewBtn").classList.toggle("active", tabName === "new");

  $("commonView").classList.toggle("hidden", tabName !== "common");
  $("newView").classList.toggle("hidden", tabName !== "new");

  // Search only applies to common view; keep it visible, but behavior is for list
  if (tabName === "new") {
    // Optional: keep search text but doesn't matter
  }
}

function renderApplications(selectEl, selectedValue) {
  selectEl.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select application";
  placeholder.disabled = true;
  placeholder.selected = !selectedValue;
  selectEl.appendChild(placeholder);

  applications.forEach(app => {
    const opt = document.createElement("option");
    opt.value = app;
    opt.textContent = app;
    if (selectedValue && selectedValue === app) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

function ensureSelectedIssueStillExists() {
  if (!selectedIssueId) return;
  const exists = issues.some(i => i.id === selectedIssueId);
  if (!exists) selectedIssueId = null;
}

function renderIssueList() {
  const list = $("issueList");
  const empty = $("emptyState");
  list.innerHTML = "";

  const filtered = issues.filter(i => matchesSearch(i, commonSearch));
  $("issuesCountPill").textContent = filtered.length;

  if (filtered.length === 0) {
    empty.classList.remove("hidden");
  } else {
    empty.classList.add("hidden");
  }

  filtered
    // newest first
    .slice()
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
    .forEach(issue => {
      const li = document.createElement("li");
      li.className = "issue-item" + (issue.id === selectedIssueId ? " active" : "");
      li.dataset.issueId = issue.id;

      const title = document.createElement("p");
      title.className = "issue-item-title";
      title.textContent = formatTitle(issue);

      const sub = document.createElement("p");
      sub.className = "issue-item-sub";
      sub.textContent = issue.application ? `Application: ${issue.application}` : "Application: (not set)";

      li.appendChild(title);
      li.appendChild(sub);

      li.addEventListener("click", () => {
        selectedIssueId = issue.id;
        renderIssueList();
        renderIssueDetailsView();
      });

      list.appendChild(li);
    });
}

function setDetailsButtonsEnabled(enabled) {
  $("editIssueBtn").disabled = !enabled;
  $("deleteIssueBtn").disabled = !enabled;
}

function showDetailsPlaceholder(show) {
  $("detailsPlaceholder").classList.toggle("hidden", !show);
}

function showDetailsView(show) {
  $("issueDetailsView").classList.toggle("hidden", !show);
}

function showEditForm(show) {
  $("issueEditForm").classList.toggle("hidden", !show);
}

function renderTemplateTabs(container, templates, activeIndex, onClickIndex) {
  container.innerHTML = "";
  templates.forEach((_, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "template-tab" + (idx === activeIndex ? " active" : "");
    btn.textContent = `Template ${idx + 1}`;
    btn.addEventListener("click", () => onClickIndex(idx));
    container.appendChild(btn);
  });
}

function renderIssueDetailsView() {
  const issue = issues.find(i => i.id === selectedIssueId);

  if (!issue) {
    setDetailsButtonsEnabled(false);
    showDetailsPlaceholder(true);
    showDetailsView(false);
    showEditForm(false);
    return;
  }

  setDetailsButtonsEnabled(true);
  showDetailsPlaceholder(false);
  showDetailsView(true);
  showEditForm(false);

  $("viewTitle").textContent = formatTitle(issue);
  $("viewAppPill").textContent = issue.application || "No application";
  $("viewRootCause").textContent = issue.rootCause || "";

  // checklist bullets
  const ul = $("viewChecklist");
  ul.innerHTML = "";
  (issue.checklist || []).forEach(item => {
    const li = document.createElement("li");
    li.textContent = item;
    ul.appendChild(li);
  });

  // zendesk link
  const z = $("viewZendesk");
  const link = safeText(issue.zendeskTicket).trim();
  if (link) {
    z.href = link;
    z.textContent = link;
    z.classList.remove("muted");
  } else {
    z.href = "#";
    z.textContent = "(no link)";
    z.classList.add("muted");
  }

  $("viewSolution").textContent = issue.solution || "";

  // templates
  const templates = Array.isArray(issue.templates) && issue.templates.length > 0
    ? issue.templates
    : ["(No templates saved)"];

  // keep active index safe
  if (editIssueTemplateIndex >= templates.length) editIssueTemplateIndex = 0;

  renderTemplateTabs($("viewTemplateTabs"), templates, editIssueTemplateIndex, (idx) => {
    editIssueTemplateIndex = idx;
    $("viewTemplateText").textContent = templates[editIssueTemplateIndex] || "";
    // also keep edit in sync if they go into edit later
  });

  $("viewTemplateText").textContent = templates[editIssueTemplateIndex] || "";
}

function enterEditMode() {
  const issue = issues.find(i => i.id === selectedIssueId);
  if (!issue) return;

  showDetailsPlaceholder(false);
  showDetailsView(false);
  showEditForm(true);

  $("editIssueDescription").value = issue.issueDescription || "";
  renderApplications($("editApplicationSelect"), issue.application || "");
  $("editRootCause").value = issue.rootCause || "";
  $("editChecklist").value = (issue.checklist || []).join("\n");
  $("editZendesk").value = issue.zendeskTicket || "";
  $("editSolution").value = issue.solution || "";

  // templates in edit
  const templates = Array.isArray(issue.templates) && issue.templates.length > 0
    ? issue.templates
    : [...DEFAULT_TEMPLATES];

  issue.templates = templates;

  if (editIssueTemplateIndex >= templates.length) editIssueTemplateIndex = 0;

  renderTemplateTabs($("editTemplateTabs"), templates, editIssueTemplateIndex, (idx) => {
    editIssueTemplateIndex = idx;
    $("editTemplateText").value = templates[editIssueTemplateIndex] || "";
    renderTemplateTabs($("editTemplateTabs"), templates, editIssueTemplateIndex, () => {});
    // re-render with click handlers again properly:
    renderTemplateTabs($("editTemplateTabs"), templates, editIssueTemplateIndex, (newIdx) => {
      editIssueTemplateIndex = newIdx;
      $("editTemplateText").value = templates[editIssueTemplateIndex] || "";
      // refresh tabs
      renderTemplateTabs($("editTemplateTabs"), templates, editIssueTemplateIndex, arguments.callee);
    });
  });

  // cleaner way: set once
  renderTemplateTabs($("editTemplateTabs"), templates, editIssueTemplateIndex, (idx) => {
    editIssueTemplateIndex = idx;
    $("editTemplateText").value = templates[editIssueTemplateIndex] || "";
    renderTemplateTabs($("editTemplateTabs"), templates, editIssueTemplateIndex, (i2) => {
      editIssueTemplateIndex = i2;
      $("editTemplateText").value = templates[editIssueTemplateIndex] || "";
      renderTemplateTabs($("editTemplateTabs"), templates, editIssueTemplateIndex, (i3) => {
        editIssueTemplateIndex = i3;
        $("editTemplateText").value = templates[editIssueTemplateIndex] || "";
        // recursion is ugly; keep it simple by just calling setEditTemplateIndex
      });
    });
  });

  // Actually implement tab switching simply:
  renderTemplateTabs($("editTemplateTabs"), templates, editIssueTemplateIndex, setEditTemplateIndex);

  $("editTemplateText").value = templates[editIssueTemplateIndex] || "";
}

function setEditTemplateIndex(idx) {
  const issue = issues.find(i => i.id === selectedIssueId);
  if (!issue) return;
  const templates = issue.templates || [];
  editIssueTemplateIndex = Math.max(0, Math.min(idx, templates.length - 1));
  renderTemplateTabs($("editTemplateTabs"), templates, editIssueTemplateIndex, setEditTemplateIndex);
  $("editTemplateText").value = templates[editIssueTemplateIndex] || "";
}

function addNewTemplateToSelectedIssue() {
  const issue = issues.find(i => i.id === selectedIssueId);
  if (!issue) return;
  if (!Array.isArray(issue.templates)) issue.templates = [];
  issue.templates.push(`Subject: \n\nHi there,\n\n\nRegards,`);
  editIssueTemplateIndex = issue.templates.length - 1;
  renderTemplateTabs($("editTemplateTabs"), issue.templates, editIssueTemplateIndex, setEditTemplateIndex);
  $("editTemplateText").value = issue.templates[editIssueTemplateIndex] || "";
}

function saveEditedIssue(e) {
  e.preventDefault();
  const issue = issues.find(i => i.id === selectedIssueId);
  if (!issue) return;

  // Update current template text before saving
  if (Array.isArray(issue.templates) && issue.templates.length > 0) {
    issue.templates[editIssueTemplateIndex] = $("editTemplateText").value;
  }

  issue.issueDescription = $("editIssueDescription").value.trim();
  issue.application = $("editApplicationSelect").value;
  issue.rootCause = $("editRootCause").value.trim();
  issue.checklist = parseChecklist($("editChecklist").value);
  issue.zendeskTicket = $("editZendesk").value.trim();
  issue.solution = $("editSolution").value.trim();
  issue.updatedAt = Date.now();

  saveIssues();

  // back to view
  showEditForm(false);
  showDetailsView(true);

  renderIssueList();
  renderIssueDetailsView();
}

function cancelEdit() {
  // discard UI changes; reload view
  renderIssueDetailsView();
}

function deleteSelectedIssue() {
  const issue = issues.find(i => i.id === selectedIssueId);
  if (!issue) return;

  const ok = confirm(`Delete this issue?\n\n"${formatTitle(issue)}"`);
  if (!ok) return;

  issues = issues.filter(i => i.id !== selectedIssueId);
  selectedIssueId = null;
  saveIssues();

  renderIssueList();
  renderIssueDetailsView();
}

function promptAddApplication(selectEl) {
  const name = prompt("Enter the new application name (example: BambooHR):");
  if (!name) return;
  const cleaned = name.trim();
  if (!cleaned) return;

  const exists = applications.some(a => a.toLowerCase() === cleaned.toLowerCase());
  if (!exists) {
    applications.push(cleaned);
    applications.sort((a,b) => a.localeCompare(b));
    saveApps();
  }

  renderApplications(selectEl, cleaned);
}

function renderNewTemplates() {
  // safe index
  if (newIssueTemplateIndex >= newIssueTemplates.length) newIssueTemplateIndex = 0;

  renderTemplateTabs($("newTemplateTabs"), newIssueTemplates, newIssueTemplateIndex, (idx) => {
    // save current text to current template before switching
    newIssueTemplates[newIssueTemplateIndex] = $("newTemplateText").value;
    newIssueTemplateIndex = idx;
    $("newTemplateText").value = newIssueTemplates[newIssueTemplateIndex] || "";
    renderNewTemplates();
  });

  $("newTemplateText").value = newIssueTemplates[newIssueTemplateIndex] || "";
}

function addNewIssueTemplate() {
  // save current template text first
  newIssueTemplates[newIssueTemplateIndex] = $("newTemplateText").value;
  newIssueTemplates.push(`Subject: \n\nHi there,\n\n\nRegards,`);
  newIssueTemplateIndex = newIssueTemplates.length - 1;
  renderNewTemplates();
}

function resetNewForm() {
  $("newIssueForm").reset();
  newIssueTemplates = [...DEFAULT_TEMPLATES];
  newIssueTemplateIndex = 0;
  renderNewTemplates();

  // Keep applications placeholder selection
  renderApplications($("applicationSelect"), "");
}

function saveNewIssue(e) {
  e.preventDefault();

  // save current template text into array
  newIssueTemplates[newIssueTemplateIndex] = $("newTemplateText").value;

  const issueDescription = $("issueDescription").value.trim();
  const application = $("applicationSelect").value;
  const rootCause = $("rootCause").value.trim();
  const checklist = parseChecklist($("checklists").value);
  const zendeskTicket = $("zendeskTicket").value.trim();
  const solution = $("solution").value.trim();

  const newIssue = {
    id: makeId(),
    issueDescription,
    application,
    rootCause,
    checklist,
    zendeskTicket,
    solution,
    templates: newIssueTemplates.map(t => t ?? ""),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  issues.push(newIssue);
  saveIssues();

  // Switch to common issues + select the new one
  selectedIssueId = newIssue.id;
  commonSearch = "";
  $("searchInput").value = "";

  setTab("common");
  renderIssueList();
  renderIssueDetailsView();

  // Reset form for next entry
  resetNewForm();

  // scroll to top of details on mobile
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function init() {
  issues = loadIssues();
  applications = loadApps();

  // Tabs
  $("tabCommonBtn").addEventListener("click", () => setTab("common"));
  $("tabNewBtn").addEventListener("click", () => setTab("new"));

  // Search filter
  $("searchInput").addEventListener("input", (e) => {
    commonSearch = e.target.value.trim();
    renderIssueList();
    // keep details as-is
  });

  // New Issues form
  renderApplications($("applicationSelect"), "");
  $("addAppBtn").addEventListener("click", () => promptAddApplication($("applicationSelect")));
  $("addTemplateBtn").addEventListener("click", addNewIssueTemplate);
  $("resetBtn").addEventListener("click", resetNewForm);
  $("newIssueForm").addEventListener("submit", saveNewIssue);

  // Common details actions
  $("editIssueBtn").addEventListener("click", enterEditMode);
  $("deleteIssueBtn").addEventListener("click", deleteSelectedIssue);

  // Edit form actions
  $("issueEditForm").addEventListener("submit", saveEditedIssue);
  $("cancelEditBtn").addEventListener("click", () => {
    showEditForm(false);
    showDetailsView(true);
    cancelEdit();
  });
  $("editAddAppBtn").addEventListener("click", () => promptAddApplication($("editApplicationSelect")));
  $("editAddTemplateBtn").addEventListener("click", () => {
    const issue = issues.find(i => i.id === selectedIssueId);
    if (!issue) return;

    // save current template text
    if (Array.isArray(issue.templates) && issue.templates.length > 0) {
      issue.templates[editIssueTemplateIndex] = $("editTemplateText").value;
    }
    addNewTemplateToSelectedIssue();
  });

  // when typing in edit template textarea, update current template live
  $("editTemplateText").addEventListener("input", () => {
    const issue = issues.find(i => i.id === selectedIssueId);
    if (!issue || !Array.isArray(issue.templates)) return;
    issue.templates[editIssueTemplateIndex] = $("editTemplateText").value;
  });

  // Initial render
  setTab("common");
  ensureSelectedIssueStillExists();
  renderNewTemplates();
  renderIssueList();
  renderIssueDetailsView();
}

init();