/* =========
   Helpers
========= */

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function linesToBullets(text = "") {
  return text
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);
}

function bulletsToHtml(items = []) {
  if (!items.length) return "<div class='muted'>No checklist items.</div>";
  return `<ul class="bullet-list">${items.map(li => `<li>${escapeHtml(li)}</li>`).join("")}</ul>`;
}

function safeUrl(url) {
  const u = (url || "").trim();
  if (!u) return "";
  try { new URL(u); return u; } catch { return ""; }
}

/* =========
   App State
========= */

const DEFAULT_APPS = [
  "Active Directory", "Azure AD", "Okta", "ADP", "Paycor", "Dayforce", "Paylocity"
];

const DEFAULT_TEMPLATES = [
  {
    name: "Template 1",
    body:
`Subject: Update on your issue

Hi there,

Thanks for your patience. We investigated the issue and identified the cause.
We are applying the fix now and will confirm once everything is stable.

Regards,`
  },
  {
    name: "Template 2",
    body:
`Subject: Request for additional details

Hi there,

To proceed, could you please confirm the following:
- Environment / tenant details
- Recent changes
- Any error message or screenshot

Once we have this, we will continue the investigation.

Regards,`
  },
  {
    name: "Template 3",
    body:
`Subject: Issue resolved

Hi there,

We implemented the fix and the issue should now be resolved.
If you still see the issue, please reply with the latest timestamp and any new error details.

Regards,`
  }
];

let issues = [];
let selectedIssueId = null;

let selectedTemplateIndex = 0;
let templateState = structuredClone(DEFAULT_TEMPLATES);

/* =========
   DOM
========= */

const tabCommon = document.getElementById("tabCommon");
const tabNew = document.getElementById("tabNew");
const commonSection = document.getElementById("commonSection");
const newSection = document.getElementById("newSection");

const searchInput = document.getElementById("searchInput");

const commonListView = document.getElementById("commonListView");
const commonDetailView = document.getElementById("commonDetailView");
const backToListBtn = document.getElementById("backToListBtn");

const issueList = document.getElementById("issueList");
const issueDetailsPanel = document.getElementById("issueDetailsPanel");
const issuesCountPill = document.getElementById("issuesCountPill");

// Form
const issueDescription = document.getElementById("issueDescription");
const applicationSelect = document.getElementById("applicationSelect");
const addNewAppBtn = document.getElementById("addNewAppBtn");
const rootCause = document.getElementById("rootCause");
const checklists = document.getElementById("checklists");
const zendeskLink = document.getElementById("zendeskLink");
const solution = document.getElementById("solution");

const templateTabs = document.getElementById("templateTabs");
const templateEditor = document.getElementById("templateEditor");
const addTemplateBtn = document.getElementById("addTemplateBtn");

const saveIssueBtn = document.getElementById("saveIssueBtn");
const resetIssueBtn = document.getElementById("resetIssueBtn");

/* =========
   Firestore
========= */

function ensureFirestoreReady() {
  if (!window.db || !window.firebaseFns) {
    alert("Firebase is not ready yet. Please refresh the page.");
    return false;
  }
  return true;
}

async function loadIssuesFromFirestore() {
  if (!ensureFirestoreReady()) return;

  const { collection, getDocs, query, orderBy } = window.firebaseFns;

  const colRef = collection(window.db, "issues");

  try {
    // Preferred: sorted newest first
    const q = query(colRef, orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    issues = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    // Fallback: if some docs don't have createdAt or ordering fails
    console.warn("OrderBy(createdAt) failed, falling back to unsorted getDocs()", e);
    const snap = await getDocs(colRef);
    issues = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  renderIssueList();

  // If still in detail screen, refresh panel
  if (isInDetailScreen() && selectedIssueId) {
    renderSelectedIssueDetails();
  }
}

/* =========
   Tabs
========= */

function setActiveTab(tab) {
  const isCommon = tab === "common";

  tabCommon.classList.toggle("active", isCommon);
  tabNew.classList.toggle("active", !isCommon);

  commonSection.classList.toggle("hidden", !isCommon);
  newSection.classList.toggle("hidden", isCommon);

  searchInput.style.display = isCommon ? "" : "none";

  if (!isCommon) {
    showListScreen();
  }
}

tabCommon.addEventListener("click", () => setActiveTab("common"));
tabNew.addEventListener("click", () => setActiveTab("new"));

/* =========
   Common Issues screens
========= */

function showListScreen() {
  commonListView.classList.remove("hidden");
  commonDetailView.classList.add("hidden");
  issueDetailsPanel.innerHTML = "";
  selectedIssueId = null;
}

function showDetailScreen(issueId) {
  selectedIssueId = issueId;
  commonListView.classList.add("hidden");
  commonDetailView.classList.remove("hidden");
  renderSelectedIssueDetails();
}

function isInDetailScreen() {
  return !commonDetailView.classList.contains("hidden");
}

backToListBtn.addEventListener("click", showListScreen);

/* =========
   Application list
========= */

function loadApplicationOptions() {
  applicationSelect.innerHTML = `<option value="">Select application</option>`;
  DEFAULT_APPS.forEach(app => {
    const opt = document.createElement("option");
    opt.value = app;
    opt.textContent = app;
    applicationSelect.appendChild(opt);
  });
}

addNewAppBtn.addEventListener("click", () => {
  const name = prompt("Enter new application name:");
  const cleaned = (name || "").trim();
  if (!cleaned) return;

  const opt = document.createElement("option");
  opt.value = cleaned;
  opt.textContent = cleaned;
  applicationSelect.appendChild(opt);
  applicationSelect.value = cleaned;
});

/* =========
   Templates (New Issues)
========= */

function renderTemplateTabs() {
  templateTabs.innerHTML = "";

  templateState.forEach((t, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "template-tab" + (idx === selectedTemplateIndex ? " active" : "");
    btn.textContent = t.name;

    btn.addEventListener("click", () => {
      templateState[selectedTemplateIndex].body = templateEditor.value;
      selectedTemplateIndex = idx;
      templateEditor.value = templateState[selectedTemplateIndex].body;
      renderTemplateTabs();
    });

    templateTabs.appendChild(btn);
  });
}

addTemplateBtn.addEventListener("click", () => {
  templateState[selectedTemplateIndex].body = templateEditor.value;

  const nextNum = templateState.length + 1;
  const name = prompt("Name for the new template:", `Template ${nextNum}`);
  const cleaned = (name || "").trim();
  if (!cleaned) return;

  templateState.push({ name: cleaned, body: "" });
  selectedTemplateIndex = templateState.length - 1;

  renderTemplateTabs();
  templateEditor.value = templateState[selectedTemplateIndex].body;
});

/* =========
   Common Issues list
========= */

function getFilteredIssues() {
  const q = (searchInput.value || "").trim().toLowerCase();
  if (!q) return issues;

  return issues.filter(it => {
    const hay = [
      it.issueDescription,
      it.application,
      it.rootCause,
      ...(it.checklistItems || [])
    ].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

function renderIssueList() {
  const list = getFilteredIssues();
  issuesCountPill.textContent = String(list.length);

  if (!list.length) {
    issueList.innerHTML = `<li class="empty-state">No issues found.</li>`;
    return;
  }

  issueList.innerHTML = "";

  list.forEach(it => {
    const li = document.createElement("li");
    li.className = "issue-item";
    li.innerHTML = `
      <div class="issue-item-title">${escapeHtml(it.issueDescription || "Untitled issue")}</div>
      <div class="issue-item-sub">${escapeHtml(it.application || "")}</div>
    `;
    li.addEventListener("click", () => showDetailScreen(it.id));
    issueList.appendChild(li);
  });
}

searchInput.addEventListener("input", () => {
  if (isInDetailScreen()) showListScreen();
  renderIssueList();
});

/* =========
   Detail screen
========= */

function findSelectedIssue() {
  if (!selectedIssueId) return null;
  return issues.find(x => x.id === selectedIssueId) || null;
}

function renderSelectedIssueDetails() {
  const it = findSelectedIssue();
  if (!it) {
    issueDetailsPanel.innerHTML = `<div class="card"><div class="details-placeholder">Issue not found.</div></div>`;
    return;
  }

  const checklistHtml = bulletsToHtml(it.checklistItems || []);
  const zendesk = safeUrl(it.zendeskLink);

  const templates = Array.isArray(it.templates) ? it.templates : [];
  const templateButtons = templates.map((t, idx) => {
    const active = idx === 0 ? "active" : "";
    return `<button type="button" class="template-tab ${active}" data-tidx="${idx}">
      ${escapeHtml(t.name || `Template ${idx + 1}`)}
    </button>`;
  }).join("");

  issueDetailsPanel.innerHTML = `
    <div class="card details-card">
      <div class="card-head">
        <div class="big-title">${escapeHtml(it.issueDescription || "Untitled issue")}</div>
        <div class="card-actions">
          ${it.application ? `<span class="pill">${escapeHtml(it.application)}</span>` : ""}
          <button type="button" class="btn btn-secondary small" id="editIssueBtn">Edit</button>
        </div>
      </div>

      <div id="detailsBodyView">
        <div class="kv">
          <div class="kv-row">
            <div class="kv-key">Root cause</div>
            <div class="kv-val">${escapeHtml(it.rootCause || "") || "<span class='muted'>—</span>"}</div>
          </div>

          <div class="kv-row">
            <div class="kv-key">Checklist</div>
            <div class="kv-val">${checklistHtml}</div>
          </div>

          <div class="kv-row">
            <div class="kv-key">Solution</div>
            <div class="kv-val prewrap">${escapeHtml(it.solution || "") || "—"}</div>
          </div>

          <div class="kv-row">
            <div class="kv-key">Zendesk ticket</div>
            <div class="kv-val">
              ${zendesk ? `<a class="link" href="${escapeHtml(zendesk)}" target="_blank" rel="noreferrer">${escapeHtml(zendesk)}</a>` : "<span class='muted'>—</span>"}
            </div>
          </div>

          <div class="kv-row">
            <div class="kv-key">Email templates</div>
            <div class="kv-val">
              ${
                templates.length
                  ? `
                    <div class="template-tabs" id="detailsTemplateTabs">${templateButtons}</div>
                    <textarea id="detailsTemplateBox" class="details-template-editor" readonly rows="10">${escapeHtml(templates[0]?.body || "")}</textarea>
                  `
                  : "<span class='muted'>No templates saved.</span>"
              }
            </div>
          </div>
        </div>
      </div>

      <div id="detailsBodyEdit" class="hidden">
        <div class="form-grid">
          <div class="form-row">
            <label>Issue Description</label>
            <input id="editIssueDescription" type="text" value="${escapeHtml(it.issueDescription || "")}" />
          </div>

          <div class="form-row">
            <label>Application</label>
            <input id="editApplication" type="text" value="${escapeHtml(it.application || "")}" />
          </div>

          <div class="form-row">
            <label>Root Cause</label>
            <input id="editRootCause" type="text" value="${escapeHtml(it.rootCause || "")}" />
          </div>

          <div class="form-row">
            <label>Checklists (one per line)</label>
            <textarea id="editChecklists" rows="6">${escapeHtml((it.checklistItems || []).join("\n"))}</textarea>
          </div>

          <div class="form-row">
            <label>Zendesk Ticket Link</label>
            <input id="editZendesk" type="url" value="${escapeHtml(it.zendeskLink || "")}" />
          </div>

          <div class="form-row">
            <label>Solution</label>
            <textarea id="editSolution" rows="5">${escapeHtml(it.solution || "")}</textarea>
          </div>

          <div class="form-row">
            <label>Email templates</label>
            <small class="hint">Template editing can be added here later (currently shown read-only).</small>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn-primary" id="saveEditBtn">Save changes</button>
          <button type="button" class="btn btn-secondary" id="cancelEditBtn">Cancel</button>
        </div>
      </div>
    </div>
  `;

  // Template switching
  const detailsTabs = document.getElementById("detailsTemplateTabs");
  if (detailsTabs) {
    detailsTabs.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-tidx]");
      if (!btn) return;

      const idx = Number(btn.dataset.tidx);
      const box = document.getElementById("detailsTemplateBox");
      if (!box) return;

      [...detailsTabs.querySelectorAll("button")].forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      box.value = templates[idx]?.body || "";
    });
  }

  // Edit toggles
  const editBtn = document.getElementById("editIssueBtn");
  const viewBody = document.getElementById("detailsBodyView");
  const editBody = document.getElementById("detailsBodyEdit");

  editBtn?.addEventListener("click", () => {
    viewBody.classList.add("hidden");
    editBody.classList.remove("hidden");
  });

  document.getElementById("cancelEditBtn")?.addEventListener("click", () => {
    renderSelectedIssueDetails();
  });

  document.getElementById("saveEditBtn")?.addEventListener("click", async () => {
    const updated = {
      issueDescription: (document.getElementById("editIssueDescription").value || "").trim(),
      application: (document.getElementById("editApplication").value || "").trim(),
      rootCause: (document.getElementById("editRootCause").value || "").trim(),
      checklistItems: linesToBullets(document.getElementById("editChecklists").value || ""),
      zendeskLink: (document.getElementById("editZendesk").value || "").trim(),
      solution: (document.getElementById("editSolution").value || "").trim()
    };
    await updateIssueInFirestore(it.id, updated);
  });
}

async function updateIssueInFirestore(docId, updatedFields) {
  if (!ensureFirestoreReady()) return;

  const { doc, updateDoc, serverTimestamp } = window.firebaseFns;
  const ref = doc(window.db, "issues", docId);

  await updateDoc(ref, {
    ...updatedFields,
    updatedAt: serverTimestamp()
  });

  await loadIssuesFromFirestore();
  showDetailScreen(docId);
}

/* =========
   Save new issue
========= */

function resetForm() {
  issueDescription.value = "";
  applicationSelect.value = "";
  rootCause.value = "";
  checklists.value = "";
  zendeskLink.value = "";
  solution.value = "";

  templateState = structuredClone(DEFAULT_TEMPLATES);
  selectedTemplateIndex = 0;
  renderTemplateTabs();
  templateEditor.value = templateState[0].body;
}

resetIssueBtn.addEventListener("click", resetForm);

saveIssueBtn.addEventListener("click", async () => {
  if (!ensureFirestoreReady()) return;

  const desc = (issueDescription.value || "").trim();
  const app = (applicationSelect.value || "").trim();

  if (!desc) { alert("Please enter an Issue Description."); return; }
  if (!app) { alert("Please select an Application (or add a new one)."); return; }

  templateState[selectedTemplateIndex].body = templateEditor.value;

  const payload = {
    issueDescription: desc,
    application: app,
    rootCause: (rootCause.value || "").trim(),
    checklistItems: linesToBullets(checklists.value || ""),
    zendeskLink: (zendeskLink.value || "").trim(),
    solution: (solution.value || "").trim(),
    templates: templateState.map(t => ({
      name: (t.name || "").trim(),
      body: (t.body || "").trim()
    })),
    createdAt: window.firebaseFns.serverTimestamp(),
    updatedAt: window.firebaseFns.serverTimestamp()
  };

  try {
    const { collection, addDoc } = window.firebaseFns;
    const colRef = collection(window.db, "issues");
    await addDoc(colRef, payload);

    resetForm();
    setActiveTab("common");
    showListScreen();
    await loadIssuesFromFirestore();
  } catch (e) {
    console.error(e);
    alert("Could not save. Please check Firestore setup and try again.");
  }
});

/* =========
   Init
========= */

// Theme toggle
const themeToggle = document.getElementById("themeToggle");

function applySavedTheme() {
  const saved = localStorage.getItem("theme");

  if (saved === "light") {
    document.documentElement.classList.add("light-theme");
    if (themeToggle) themeToggle.textContent = "🌙";
  } else {
    // default = dark
    document.documentElement.classList.remove("light-theme");
    if (themeToggle) themeToggle.textContent = "☀️";
  }
}

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const isLight = document.documentElement.classList.toggle("light-theme");

    if (isLight) {
      localStorage.setItem("theme", "light");
      themeToggle.textContent = "🌙";
    } else {
      localStorage.setItem("theme", "dark");
      themeToggle.textContent = "☀️";
    }
  });
}

// App init (ONLY ONCE)
function init() {
  applySavedTheme();
  loadApplicationOptions();
  renderTemplateTabs();
  templateEditor.value = templateState[0].body;

  setActiveTab("common");
  showListScreen();

  loadIssuesFromFirestore();
}

init();