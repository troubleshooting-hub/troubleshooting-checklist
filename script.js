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
  if (!items.length) return "<p class='muted'>No checklist items.</p>";
  return `<ul class="bullets">${items.map(li => `<li>${escapeHtml(li)}</li>`).join("")}</ul>`;
}

function safeUrl(url) {
  const u = (url || "").trim();
  if (!u) return "";
  try {
    // basic validation
    new URL(u);
    return u;
  } catch {
    return "";
  }
}

/* =========
   App State
========= */

const DEFAULT_APPS = [
  "Active Directory",
  "Azure AD",
  "Okta",
  "ADP",
  "Paycor",
  "Dayforce",
  "Paylocity"
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

let issues = [];            // loaded from Firestore
let selectedIssueId = null; // Firestore doc id
let selectedTemplateIndex = 0;

/* =========
   DOM
========= */

const tabCommon = document.getElementById("tabCommon");
const tabNew = document.getElementById("tabNew");
const commonSection = document.getElementById("commonSection");
const newSection = document.getElementById("newSection");

const searchInput = document.getElementById("searchInput");
const issueList = document.getElementById("issueList");
const issueDetailsPanel = document.getElementById("issueDetailsPanel");

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
  const q = query(colRef, orderBy("createdAt", "desc"));

  const snap = await getDocs(q);
  issues = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // If nothing selected, select first (optional)
  if (issues.length && !selectedIssueId) selectedIssueId = issues[0].id;

  renderIssueList();
  renderSelectedIssueDetails();
}

/* =========
   UI: Tabs
========= */

function setActiveTab(tab) {
  const isCommon = tab === "common";

  tabCommon.classList.toggle("active", isCommon);
  tabNew.classList.toggle("active", !isCommon);

  commonSection.classList.toggle("active", isCommon);
  newSection.classList.toggle("active", !isCommon);

  // Search applies to common issues list
  searchInput.placeholder = isCommon
    ? "Search issues (ex: 409, Azure AD, Okta)..."
    : "Search issues (ex: 409, Azure AD, Okta)...";
}

tabCommon.addEventListener("click", () => setActiveTab("common"));
tabNew.addEventListener("click", () => setActiveTab("new"));

/* =========
   UI: Application list
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

  // add to dropdown immediately
  const opt = document.createElement("option");
  opt.value = cleaned;
  opt.textContent = cleaned;
  applicationSelect.appendChild(opt);
  applicationSelect.value = cleaned;
});

/* =========
   UI: Templates (tabs)
========= */

let templateState = structuredClone(DEFAULT_TEMPLATES);

function renderTemplateTabs() {
  templateTabs.innerHTML = "";

  templateState.forEach((t, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "template-tab" + (idx === selectedTemplateIndex ? " active" : "");
    btn.textContent = t.name;
    btn.addEventListener("click", () => {
      // Save current editor text into current template before switching
      templateState[selectedTemplateIndex].body = templateEditor.value;

      selectedTemplateIndex = idx;
      templateEditor.value = templateState[selectedTemplateIndex].body;
      renderTemplateTabs();
    });
    templateTabs.appendChild(btn);
  });
}

addTemplateBtn.addEventListener("click", () => {
  // Save current before adding
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
   Common Issues list (title-only)
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

  if (!list.length) {
    issueList.innerHTML = `<div class="empty-state">No issues found.</div>`;
    issueDetailsPanel.innerHTML = `<div class="placeholder">Select an issue to view details.</div>`;
    selectedIssueId = null;
    return;
  }

  issueList.innerHTML = "";

  list.forEach(it => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "issue-row" + (it.id === selectedIssueId ? " selected" : "");

    // Title-only (as requested)
    row.innerHTML = `
      <div class="issue-row-title">${escapeHtml(it.issueDescription || "Untitled issue")}</div>
      <div class="issue-row-meta">
        ${it.application ? `<span class="pill">${escapeHtml(it.application)}</span>` : ""}
      </div>
    `;

    row.addEventListener("click", () => {
      selectedIssueId = it.id;
      renderIssueList();
      renderSelectedIssueDetails();
    });

    issueList.appendChild(row);
  });
}

searchInput.addEventListener("input", () => {
  renderIssueList();
  renderSelectedIssueDetails();
});

/* =========
   Details panel (view + edit)
========= */

function findSelectedIssue() {
  if (!selectedIssueId) return null;
  return issues.find(x => x.id === selectedIssueId) || null;
}

function renderSelectedIssueDetails() {
  const it = findSelectedIssue();
  if (!it) {
    issueDetailsPanel.innerHTML = `<div class="placeholder">Select an issue to view details.</div>`;
    return;
  }

  const checklistHtml = bulletsToHtml(it.checklistItems || []);
  const zendesk = safeUrl(it.zendeskLink);

  // Template switcher inside details
  const templates = Array.isArray(it.templates) ? it.templates : [];
  const templateButtons = templates.map((t, idx) => {
    return `<button type="button" class="template-tab ${idx === 0 ? "active" : ""}" data-tidx="${idx}">
      ${escapeHtml(t.name || `Template ${idx + 1}`)}
    </button>`;
  }).join("");

  issueDetailsPanel.innerHTML = `
    <div class="card details-card">
      <div class="details-header">
        <div>
          <h3 class="details-title">${escapeHtml(it.issueDescription || "Untitled issue")}</h3>
          <div class="details-sub">
            ${it.application ? `<span class="pill">${escapeHtml(it.application)}</span>` : ""}
          </div>
        </div>

        <div class="details-actions">
          <button type="button" class="secondary-btn" id="editIssueBtn">Edit</button>
        </div>
      </div>

      <div class="details-body" id="detailsBodyView">
        <div class="detail-block">
          <div class="detail-label">Root cause</div>
          <div class="detail-value">${escapeHtml(it.rootCause || "") || "<span class='muted'>—</span>"}</div>
        </div>

        <div class="detail-block">
          <div class="detail-label">Checklist</div>
          <div class="detail-value">${checklistHtml}</div>
        </div>

        <div class="detail-block">
          <div class="detail-label">Solution</div>
          <div class="detail-value">${escapeHtml(it.solution || "") || "<span class='muted'>—</span>"}</div>
        </div>

        <div class="detail-block">
          <div class="detail-label">Zendesk ticket</div>
          <div class="detail-value">
            ${zendesk ? `<a href="${escapeHtml(zendesk)}" target="_blank" rel="noreferrer">${escapeHtml(zendesk)}</a>` : "<span class='muted'>—</span>"}
          </div>
        </div>

        <div class="detail-block">
          <div class="detail-label">Email templates</div>
          <div class="detail-value">
            ${templates.length ? `
              <div class="template-tabs" id="detailsTemplateTabs">${templateButtons}</div>
              <textarea id="detailsTemplateBox" class="template-box" rows="8" readonly>${escapeHtml(templates[0]?.body || "")}</textarea>
            ` : "<span class='muted'>No templates saved.</span>"}
          </div>
        </div>
      </div>

      <div class="details-body hidden" id="detailsBodyEdit">
        <div class="form-grid">
          <div class="form-row">
            <label>Issue Description</label>
            <input id="editIssueDescription" type="text" value="${escapeHtml(it.issueDescription || "")}" />
          </div>

          <div class="form-row">
            <label>Application</label>
            <input id="editApplication" type="text" value="${escapeHtml(it.application || "")}" />
            <small class="hint">You can edit the application name here.</small>
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
            <small class="hint">Editing templates is done from New Issues in this version.</small>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="primary-btn" id="saveEditBtn">Save changes</button>
          <button type="button" class="secondary-btn" id="cancelEditBtn">Cancel</button>
        </div>
      </div>
    </div>
  `;

  // Template switching in details
  const detailsTabs = document.getElementById("detailsTemplateTabs");
  if (detailsTabs) {
    detailsTabs.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-tidx]");
      if (!btn) return;

      const idx = Number(btn.dataset.tidx);
      const box = document.getElementById("detailsTemplateBox");
      if (!box) return;

      // set active class
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
    // rerender to discard local edits
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

  const { doc, updateDoc } = window.firebaseFns;

  const ref = doc(window.db, "issues", docId);
  await updateDoc(ref, {
    ...updatedFields,
    updatedAt: window.firebaseFns.serverTimestamp()
  });

  // Reload to reflect changes
  await loadIssuesFromFirestore();
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
  const rc = (rootCause.value || "").trim();

  if (!desc) {
    alert("Please enter an Issue Description.");
    return;
  }
  if (!app) {
    alert("Please select an Application (or add a new one).");
    return;
  }

  // save current template editor into selected template
  templateState[selectedTemplateIndex].body = templateEditor.value;

  const payload = {
    issueDescription: desc,
    application: app,
    rootCause: rc,
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
    await loadIssuesFromFirestore();
  } catch (e) {
    console.error(e);
    alert("Could not save. Please check Firestore setup and try again.");
  }
});

/* =========
   Init
========= */

function init() {
  loadApplicationOptions();

  // templates UI init
  renderTemplateTabs();
  templateEditor.value = templateState[0].body;

  // initial tab
  setActiveTab("common");

  // load from firestore
  loadIssuesFromFirestore();
}

init();