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
  return String(text)
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
  try {
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

let issues = [];
let selectedIssueId = null;

let templateState = structuredClone(DEFAULT_TEMPLATES);
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
const issueCountPill = document.getElementById("issueCountPill");

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
   Firestore readiness
========= */
function ensureFirestoreReady() {
  return !!(window.db && window.firebaseFns);
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
}

tabCommon.addEventListener("click", () => setActiveTab("common"));
tabNew.addEventListener("click", () => setActiveTab("new"));

/* =========
   Applications
========= */
function loadApplicationOptions() {
  const custom = JSON.parse(localStorage.getItem("custom_apps") || "[]");
  const merged = [...new Set([...DEFAULT_APPS, ...custom])];

  applicationSelect.innerHTML = `<option value="">Select application</option>`;
  merged.forEach(app => {
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

  const custom = JSON.parse(localStorage.getItem("custom_apps") || "[]");
  if (!custom.includes(cleaned)) {
    custom.push(cleaned);
    localStorage.setItem("custom_apps", JSON.stringify(custom));
  }

  loadApplicationOptions();
  applicationSelect.value = cleaned;
});

/* =========
   Templates
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
  templateEditor.value = "";
});

/* =========
   Load issues
========= */
async function loadIssuesFromFirestore() {
  if (!ensureFirestoreReady()) return;

  const { collection, getDocs, query, orderBy } = window.firebaseFns;
  const colRef = collection(window.db, "issues");

  try {
    const q = query(colRef, orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    issues = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    // Fallback: if createdAt missing in older docs, orderBy can fail
    console.warn("orderBy(createdAt) failed, falling back to unordered read:", e);
    const snap = await getDocs(colRef);
    issues = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Sort client-side best-effort
    issues.sort((a, b) => {
      const at = a.createdAt?.seconds || 0;
      const bt = b.createdAt?.seconds || 0;
      return bt - at;
    });
  }

  issueCountPill.textContent = String(issues.length);

  // keep selection if possible
  if (!selectedIssueId && issues.length) selectedIssueId = issues[0].id;
  if (selectedIssueId && !issues.some(x => x.id === selectedIssueId)) {
    selectedIssueId = issues.length ? issues[0].id : null;
  }

  renderIssueList();
  renderSelectedIssueDetails();
}

/* =========
   Search + list
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
    issueList.innerHTML = `<li class="empty-state">No issues found.</li>`;
    return;
  }

  issueList.innerHTML = "";

  list.forEach(it => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "issue-item" + (it.id === selectedIssueId ? " active" : "");

    btn.innerHTML = `
      <div class="issue-item-title">${escapeHtml(it.issueDescription || "Untitled issue")}</div>
      <div class="issue-item-sub">${escapeHtml(it.application || "—")}</div>
    `;

    btn.addEventListener("click", () => {
      selectedIssueId = it.id;
      renderIssueList();
      renderSelectedIssueDetails();
    });

    li.appendChild(btn);
    issueList.appendChild(li);
  });
}

searchInput.addEventListener("input", () => {
  renderIssueList();
  renderSelectedIssueDetails();
});

/* =========
   Details + Edit
========= */
function findSelectedIssue() {
  if (!selectedIssueId) return null;
  return issues.find(x => x.id === selectedIssueId) || null;
}

function renderSelectedIssueDetails() {
  const it = findSelectedIssue();
  if (!it) {
    issueDetailsPanel.innerHTML = `
      <div class="details-placeholder">
        <div class="muted">Select an issue to view details.</div>
      </div>
    `;
    return;
  }

  const checklistHtml = bulletsToHtml(it.checklistItems || []);
  const zendesk = safeUrl(it.zendeskLink);
  const templates = Array.isArray(it.templates) ? it.templates : [];

  const templateTabsHtml = templates.length
    ? `<div class="template-tabs" id="detailsTemplateTabs">
        ${templates.map((t, idx) =>
          `<button type="button" class="template-tab ${idx === 0 ? "active" : ""}" data-tidx="${idx}">
            ${escapeHtml(t.name || `Template ${idx + 1}`)}
          </button>`
        ).join("")}
      </div>`
    : "";

  issueDetailsPanel.innerHTML = `
    <div class="issue-title-row">
      <div>
        <h3 class="big-title">${escapeHtml(it.issueDescription || "Untitled issue")}</h3>
      </div>
      <div class="pill">${escapeHtml(it.application || "—")}</div>
    </div>

    <div class="kv" id="detailsView">
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
        <div class="kv-val prewrap">${escapeHtml(it.solution || "") || "<span class='muted'>—</span>"}</div>
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
          ${templates.length ? `
            ${templateTabsHtml}
            <textarea id="detailsTemplateBox" class="template-box" rows="8" readonly>${escapeHtml(templates[0]?.body || "")}</textarea>
          ` : "<span class='muted'>No templates saved.</span>"}
        </div>
      </div>

      <div class="kv-row">
        <button type="button" class="btn btn-secondary" id="editIssueBtn">Edit</button>
      </div>
    </div>

    <div class="kv hidden" id="detailsEdit">
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
          <label>Reference Zendesk Ticket Link</label>
          <input id="editZendesk" type="url" value="${escapeHtml(it.zendeskLink || "")}" />
        </div>

        <div class="form-row">
          <label>Solution</label>
          <textarea id="editSolution" rows="5">${escapeHtml(it.solution || "")}</textarea>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-primary" id="saveEditBtn">Save changes</button>
        <button type="button" class="btn btn-secondary" id="cancelEditBtn">Cancel</button>
      </div>
    </div>
  `;

  // Template switching (details)
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
  const view = document.getElementById("detailsView");
  const edit = document.getElementById("detailsEdit");

  editBtn?.addEventListener("click", () => {
    view.classList.add("hidden");
    edit.classList.remove("hidden");
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
  if (!ensureFirestoreReady()) {
    alert("Firebase is still loading. Please refresh and try again.");
    return;
  }

  const desc = (issueDescription.value || "").trim();
  const app = (applicationSelect.value || "").trim();

  if (!desc) return alert("Please enter an Issue Description.");
  if (!app) return alert("Please select an Application (or add a new one).");

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
  setActiveTab("common");
  loadApplicationOptions();

  renderTemplateTabs();
  templateEditor.value = templateState[0].body;

  loadIssuesFromFirestore();
}

init();
