/* =========================================================
   Troubleshooting Checklist Portal (NO API / NO Cloudflare)
   Help Me Troubleshoot Flow:
   Step 1: Match issue -> compare user checklist vs saved checklist -> show missing
   Step 2: If complete OR no match -> show doc link + wait for user confirmation
   Step 3: If user says doc checked/no luck -> generate ChatGPT-ready prompt

   Additions in this version:
   - Duplicate detection (New Issues): shows a suggestion box + confirms on Save if near-duplicate/exact duplicate
   - Delete from Common Issues list: 3-dot menu per issue -> Delete (Firestore)

   UPDATE requested:
   - Keep the same code, but move the 3-dot button to the END (right side) of each issue row
   - Ensure clicking dots does not open details
   - Ensure menu appears anchored to the button (right side)
========================================================= */

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
    .filter(Boolean)
    .map(s => s.replace(/^[-•\u2022]\s*/, "").trim())
    .filter(Boolean);
}

function bulletsToHtml(items = []) {
  if (!items.length) return "<div class='muted'>No checklist items.</div>";
  return `<ul class="bullet-list">${items
    .map(li => `<li>${escapeHtml(li)}</li>`)
    .join("")}</ul>`;
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

function normalizeForCompare(s = "") {
  return String(s || "")
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .replace(/[\u2022•]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isStepLikeLine(line = "") {
  const t = normalizeForCompare(line);
  if (!t) return false;
  const skip = [
    "additionally",
    "checklist",
    "i have checked the following",
    "i have checked the following:",
    "i have checked",
    "verified",
    "notes",
    "root cause",
    "solution"
  ];
  return !skip.includes(t);
}

function uniqueNormalized(items = []) {
  const seen = new Set();
  const out = [];
  for (const raw of items) {
    const n = normalizeForCompare(raw);
    if (!n) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push({ raw, norm: n });
  }
  return out;
}

function tokenize(s = "") {
  return normalizeForCompare(s)
    .split(" ")
    .map(w => w.trim())
    .filter(Boolean)
    .filter(w => w.length >= 3);
}

function jaccardScore(aTokens = [], bTokens = []) {
  const A = new Set(aTokens);
  const B = new Set(bTokens);
  if (!A.size && !B.size) return 0;

  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;

  const union = new Set([...A, ...B]).size;
  return union ? inter / union : 0;
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
    body: `Subject: Update on your issue

Hi there,

Thanks for your patience. We investigated the issue and identified the cause.
We are applying the fix now and will confirm once everything is stable.

Regards,`
  },
  {
    name: "Template 2",
    body: `Subject: Request for additional details

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
    body: `Subject: Issue resolved

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

// Used for list 3-dot menus
let openMenuIssueId = null;

/* =========
   DOM
========= */

const tabCommon = document.getElementById("tabCommon");
const tabNew = document.getElementById("tabNew");
const tabHelp = document.getElementById("tabHelp");

const commonSection = document.getElementById("commonSection");
const newSection = document.getElementById("newSection");
const helpSection = document.getElementById("helpSection");

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

// Help (new flow elements expected in updated index.html)
const helpIssueInput = document.getElementById("helpIssueInput");
const helpCheckedInput = document.getElementById("helpCheckedInput");
const helpAnalyzeBtn = document.getElementById("helpAnalyzeBtn");
const helpClearBtn = document.getElementById("helpClearBtn");
const helpResults = document.getElementById("helpResults");

/* =========
   Duplicate suggestion UI (created dynamically)
========= */

let dupSuggestionEl = null;

function ensureDupSuggestionBox() {
  if (dupSuggestionEl) return dupSuggestionEl;
  if (!issueDescription) return null;

  const wrap = issueDescription.parentElement; // .form-row
  if (!wrap) return null;

  const box = document.createElement("div");
  box.id = "dupSuggestionBox";
  box.className = "dup-box hidden";
  wrap.appendChild(box);

  dupSuggestionEl = box;
  return box;
}

function findSimilarIssuesForNewIssue(descText) {
  const q = normalizeForCompare(descText);
  if (!q) return { exact: null, suggestions: [] };

  const qTokens = tokenize(q);
  const suggestions = [];

  for (const it of issues) {
    const cand = normalizeForCompare(it.issueDescription || "");
    if (!cand) continue;

    if (cand === q) {
      return { exact: it, suggestions: [] };
    }

    const score = jaccardScore(qTokens, tokenize(cand));
    if (score >= 0.45) {
      suggestions.push({ issue: it, score });
    }
  }

  suggestions.sort((a, b) => b.score - a.score);
  return { exact: null, suggestions: suggestions.slice(0, 3) };
}

function renderDuplicateSuggestions() {
  const box = ensureDupSuggestionBox();
  if (!box) return;

  const text = (issueDescription?.value || "").trim();
  if (!text) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }

  const { exact, suggestions } = findSimilarIssuesForNewIssue(text);

  if (!exact && !suggestions.length) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }

  if (exact) {
    box.classList.remove("hidden");
    box.innerHTML = `
      <div class="dup-title-text">A similar issue already exists.</div>
      <div class="hint" style="margin-top:6px;">This looks like an exact duplicate (by description).</div>
      <div class="dup-list">
        <div class="dup-item">
          <div><strong>${escapeHtml(exact.issueDescription || "")}</strong></div>
          <div class="dup-score">${escapeHtml(exact.application || "")}</div>
        </div>
      </div>
      <div class="hint" style="margin-top:10px;">Tip: Open it in Common Issues and edit instead of adding again.</div>
    `;
    return;
  }

  box.classList.remove("hidden");
  box.innerHTML = `
    <div class="dup-title-text">We see similar issues already added. Can you check if it is related?</div>
    <div class="dup-list">
      ${suggestions
        .map(
          ({ issue, score }) => `
          <div class="dup-item">
            <div><strong>${escapeHtml(issue.issueDescription || "")}</strong></div>
            <div class="dup-score">${escapeHtml(issue.application || "")} • Similarity ${(score * 100).toFixed(0)}%</div>
          </div>
        `
        )
        .join("")}
    </div>
  `;
}

issueDescription?.addEventListener("input", () => {
  renderDuplicateSuggestions();
});

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
    const q = query(colRef, orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    issues = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn("OrderBy(createdAt) failed, falling back to unsorted getDocs()", e);
    const snap = await getDocs(colRef);
    issues = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  renderIssueList();
  renderDuplicateSuggestions();

  if (isInDetailScreen() && selectedIssueId) {
    renderSelectedIssueDetails();
  }
}

/* =========
   Tabs
========= */

function setActiveTab(tab) {
  const isCommon = tab === "common";
  const isNew = tab === "new";
  const isHelp = tab === "help";

  tabCommon?.classList.toggle("active", isCommon);
  tabNew?.classList.toggle("active", isNew);
  tabHelp?.classList.toggle("active", isHelp);

  commonSection?.classList.toggle("hidden", !isCommon);
  newSection?.classList.toggle("hidden", !isNew);
  helpSection?.classList.toggle("hidden", !isHelp);

  if (searchInput) searchInput.style.display = isCommon ? "" : "none";

  if (!isCommon) showListScreen();
}

tabCommon?.addEventListener("click", () => setActiveTab("common"));
tabNew?.addEventListener("click", () => setActiveTab("new"));
tabHelp?.addEventListener("click", () => setActiveTab("help"));

/* =========
   Common Issues screens
========= */

function showListScreen() {
  commonListView?.classList.remove("hidden");
  commonDetailView?.classList.add("hidden");
  if (issueDetailsPanel) issueDetailsPanel.innerHTML = "";
  selectedIssueId = null;
}

function showDetailScreen(issueId) {
  selectedIssueId = issueId;
  commonListView?.classList.add("hidden");
  commonDetailView?.classList.remove("hidden");
  renderSelectedIssueDetails();
}

function isInDetailScreen() {
  return commonDetailView ? !commonDetailView.classList.contains("hidden") : false;
}

backToListBtn?.addEventListener("click", showListScreen);

/* =========
   Application list
========= */

function loadApplicationOptions() {
  if (!applicationSelect) return;

  applicationSelect.innerHTML = `<option value="">Select application</option>`;
  DEFAULT_APPS.forEach(app => {
    const opt = document.createElement("option");
    opt.value = app;
    opt.textContent = app;
    applicationSelect.appendChild(opt);
  });
}

addNewAppBtn?.addEventListener("click", () => {
  const name = prompt("Enter new application name:");
  const cleaned = (name || "").trim();
  if (!cleaned || !applicationSelect) return;

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
  if (!templateTabs || !templateEditor) return;

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

addTemplateBtn?.addEventListener("click", () => {
  if (!templateEditor) return;

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
   Common Issues list (with 3-dot delete menu)
========= */

function getFilteredIssues() {
  const q = (searchInput?.value || "").trim().toLowerCase();
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

function closeAllIssueMenus() {
  openMenuIssueId = null;
  document.querySelectorAll(".issue-menu").forEach(m => m.remove());
}

function toggleIssueMenu({ issueId, anchorEl }) {
  if (openMenuIssueId === issueId) {
    closeAllIssueMenus();
    return;
  }

  closeAllIssueMenus();
  openMenuIssueId = issueId;

  const menu = document.createElement("div");
  menu.className = "issue-menu";
  menu.innerHTML = `<button type="button" class="delete-btn" data-action="delete">Delete</button>`;

  // Append inside the li (issue-item) so it can position relative to it via CSS
  anchorEl.parentElement?.appendChild(menu);

  menu.querySelector('[data-action="delete"]')?.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await deleteIssueFlow(issueId);
    closeAllIssueMenus();
  });
}

async function deleteIssueFlow(issueId) {
  const it = issues.find(x => x.id === issueId);
  const label = it?.issueDescription ? `"${it.issueDescription}"` : "this issue";
  const ok = confirm(`Delete ${label}? This cannot be undone.`);
  if (!ok) return;

  await deleteIssueFromFirestore(issueId);

  if (selectedIssueId === issueId) {
    showListScreen();
  }

  await loadIssuesFromFirestore();
}

async function deleteIssueFromFirestore(docId) {
  if (!ensureFirestoreReady()) return;
  const { doc, deleteDoc } = window.firebaseFns;
  const ref = doc(window.db, "issues", docId);
  await deleteDoc(ref);
}

function renderIssueList() {
  if (!issueList || !issuesCountPill) return;

  closeAllIssueMenus();

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

    // IMPORTANT: Put text content first, and 3-dot button LAST (right side).
    li.innerHTML = `
      <div class="issue-item-main">
        <div class="issue-item-title">${escapeHtml(it.issueDescription || "Untitled issue")}</div>
        <div class="issue-item-sub">${escapeHtml(it.application || "")}</div>
      </div>
      <button type="button" class="issue-menu-btn" aria-label="More actions">⋯</button>
    `;

    // Clicking the row opens details, unless menu button is clicked.
    li.addEventListener("click", () => showDetailScreen(it.id));

    const btn = li.querySelector(".issue-menu-btn");
    btn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleIssueMenu({ issueId: it.id, anchorEl: btn });
    });

    issueList.appendChild(li);
  });
}

// Close menu when clicking elsewhere
document.addEventListener("click", (e) => {
  const inMenu = e.target.closest?.(".issue-menu");
  const inBtn = e.target.closest?.(".issue-menu-btn");
  if (!inMenu && !inBtn) closeAllIssueMenus();
});

searchInput?.addEventListener("input", () => {
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
  if (!issueDetailsPanel) return;

  const it = findSelectedIssue();
  if (!it) {
    issueDetailsPanel.innerHTML = `<div class="card"><div class="details-placeholder">Issue not found.</div></div>`;
    return;
  }

  const checklistHtml = bulletsToHtml(it.checklistItems || []);
  const zendesk = safeUrl(it.zendeskLink);

  const templates = Array.isArray(it.templates) ? it.templates : [];
  const templateButtons = templates
    .map((t, idx) => {
      const active = idx === 0 ? "active" : "";
      return `<button type="button" class="template-tab ${active}" data-tidx="${idx}">
        ${escapeHtml(t.name || `Template ${idx + 1}`)}
      </button>`;
    })
    .join("");

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
              ${
                zendesk
                  ? `<a class="link" href="${escapeHtml(zendesk)}" target="_blank" rel="noreferrer">${escapeHtml(zendesk)}</a>`
                  : "<span class='muted'>—</span>"
              }
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
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn-primary" id="saveEditBtn">Save changes</button>
          <button type="button" class="btn btn-secondary" id="cancelEditBtn">Cancel</button>
        </div>
      </div>
    </div>
  `;

  const detailsTabs = document.getElementById("detailsTemplateTabs");
  if (detailsTabs) {
    detailsTabs.addEventListener("click", e => {
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

  const editBtn = document.getElementById("editIssueBtn");
  const viewBody = document.getElementById("detailsBodyView");
  const editBody = document.getElementById("detailsBodyEdit");

  editBtn?.addEventListener("click", () => {
    viewBody?.classList.add("hidden");
    editBody?.classList.remove("hidden");
  });

  document.getElementById("cancelEditBtn")?.addEventListener("click", () => {
    renderSelectedIssueDetails();
  });

  document.getElementById("saveEditBtn")?.addEventListener("click", async () => {
    const updated = {
      issueDescription: (document.getElementById("editIssueDescription")?.value || "").trim(),
      application: (document.getElementById("editApplication")?.value || "").trim(),
      rootCause: (document.getElementById("editRootCause")?.value || "").trim(),
      checklistItems: linesToBullets(document.getElementById("editChecklists")?.value || ""),
      zendeskLink: (document.getElementById("editZendesk")?.value || "").trim(),
      solution: (document.getElementById("editSolution")?.value || "").trim()
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
   Save new issue (with duplicate check)
========= */

function resetForm() {
  if (issueDescription) issueDescription.value = "";
  if (applicationSelect) applicationSelect.value = "";
  if (rootCause) rootCause.value = "";
  if (checklists) checklists.value = "";
  if (zendeskLink) zendeskLink.value = "";
  if (solution) solution.value = "";

  templateState = structuredClone(DEFAULT_TEMPLATES);
  selectedTemplateIndex = 0;
  renderTemplateTabs();
  if (templateEditor) templateEditor.value = templateState[0].body;

  const box = ensureDupSuggestionBox();
  if (box) {
    box.classList.add("hidden");
    box.innerHTML = "";
  }
}

resetIssueBtn?.addEventListener("click", resetForm);

saveIssueBtn?.addEventListener("click", async () => {
  if (!ensureFirestoreReady()) return;

  if (!issues.length) {
    await loadIssuesFromFirestore();
  }

  const desc = (issueDescription?.value || "").trim();
  const app = (applicationSelect?.value || "").trim();

  if (!desc) {
    alert("Please enter an Issue Description.");
    return;
  }
  if (!app) {
    alert("Please select an Application (or add a new one).");
    return;
  }

  const { exact, suggestions } = findSimilarIssuesForNewIssue(desc);

  if (exact) {
    const ok = confirm(
      `This looks like an existing issue:\n\n- ${exact.issueDescription}\n\nDo you want to save anyway (creates a duplicate)?`
    );
    if (!ok) {
      setActiveTab("common");
      showListScreen();
      if (searchInput) searchInput.value = exact.issueDescription || "";
      renderIssueList();
      return;
    }
  } else if (suggestions.length) {
    const summary = suggestions
      .map(s => `- ${s.issue.issueDescription} (${(s.score * 100).toFixed(0)}%)`)
      .join("\n");
    const ok = confirm(
      `We found similar issues already added:\n\n${summary}\n\nDo you still want to save this as a new issue?`
    );
    if (!ok) return;
  }

  renderDuplicateSuggestions();

  if (templateEditor) templateState[selectedTemplateIndex].body = templateEditor.value;

  const payload = {
    issueDescription: desc,
    application: app,
    rootCause: (rootCause?.value || "").trim(),
    checklistItems: linesToBullets(checklists?.value || ""),
    zendeskLink: (zendeskLink?.value || "").trim(),
    solution: (solution?.value || "").trim(),
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

/* =========================================================
   HELP ME TROUBLESHOOT (NO AI)
========================================================= */

const DOC_URL =
  "https://support.aquera.com/hc/en-us/articles/360052131934-Active-Directory-AD-Configuration-Guide#h_01F8CDRHWA2JG6V2DE0RCJK6VP";

let helpFlowState = {
  lastUserIssue: "",
  lastMatchedIssue: null,
  lastUserChecks: [],
  lastMissing: [],
  docConfirmed: false
};

function suggest409Variants() {
  const variants = issues
    .filter(it => normalizeForCompare(it.issueDescription || "").includes("409"))
    .slice(0, 6);

  if (!variants.length) return "";

  return `
    <div class="kv-row">
      <div class="kv-key">Possible 409 issues in Common Issues</div>
      <div class="kv-val">
        <ul class="bullet-list">
          ${variants
            .map(v => `<li><button type="button" class="btn btn-secondary small" data-suggest-issue="${escapeHtml(v.issueDescription || "")}">${escapeHtml(v.issueDescription || "")}</button></li>`)
            .join("")}
        </ul>
        <div class="hint">Click one to auto-fill the issue description.</div>
      </div>
    </div>
  `;
}

function matchIssueByText(userIssueText = "") {
  const q = normalizeForCompare(userIssueText);
  if (!q) return null;

  let best = null;
  let bestScore = 0;

  const qWords = q.split(" ").filter(Boolean);

  for (const it of issues) {
    const desc = normalizeForCompare(it.issueDescription || "");
    const app = normalizeForCompare(it.application || "");
    const root = normalizeForCompare(it.rootCause || "");
    const checklist = normalizeForCompare((it.checklistItems || []).join(" "));

    let score = 0;

    if (desc.includes(q) || q.includes(desc)) score += 10;

    for (const w of qWords) {
      if (w.length < 3) continue;
      if (desc.includes(w)) score += 2;
      if (app.includes(w)) score += 1;
      if (root.includes(w)) score += 1;
      if (checklist.includes(w)) score += 0.5;
    }

    if (score > bestScore) {
      bestScore = score;
      best = it;
    }
  }

  return bestScore >= 2 ? best : null;
}

function compareChecklists({ standard = [], user = [] }) {
  const std = uniqueNormalized(standard);
  const usr = uniqueNormalized(user);

  const usrSet = new Set(usr.map(x => x.norm));

  const missing = [];
  for (const s of std) {
    if (!usrSet.has(s.norm)) {
      missing.push(s.raw);
    }
  }
  return missing;
}

function renderHelpOutput({ matchedIssue, missingItems, userIssueText }) {
  if (!helpResults) return;

  const hasMatch = !!matchedIssue;
  const missingCount = missingItems.length;

  const matchCard = hasMatch
    ? `
      <div class="card details-card">
        <div class="card-head">
          <div class="card-title">Matched Common Issue</div>
          <div class="card-actions">
            ${matchedIssue.application ? `<span class="pill">${escapeHtml(matchedIssue.application)}</span>` : ""}
          </div>
        </div>
        <div class="kv">
          <div class="kv-row">
            <div class="kv-key">Issue</div>
            <div class="kv-val">${escapeHtml(matchedIssue.issueDescription || "Untitled issue")}</div>
          </div>
          <div class="kv-row">
            <div class="kv-key">Standard checklist (from Common Issues)</div>
            <div class="kv-val">${bulletsToHtml(matchedIssue.checklistItems || [])}</div>
          </div>
        </div>
      </div>
    `
    : `
      <div class="card details-card">
        <div class="card-head">
          <div class="card-title">No matching Common Issue found</div>
        </div>
        <div class="kv">
          <div class="kv-row">
            <div class="kv-key">What to do next</div>
            <div class="kv-val">We will move to documentation as the next step.</div>
          </div>
        </div>
      </div>
    `;

  const step1Card = hasMatch
    ? `
      <div class="card details-card">
        <div class="card-head">
          <div class="card-title">Step 1 — Compare your checks vs standard checklist</div>
        </div>
        <div class="kv">
          ${
            missingCount
              ? `
                <div class="kv-row">
                  <div class="kv-key">You missed checking</div>
                  <div class="kv-val">${bulletsToHtml(missingItems)}</div>
                </div>
              `
              : `
                <div class="kv-row">
                  <div class="kv-key">Result</div>
                  <div class="kv-val">Okay, you have checked everything.</div>
                </div>
              `
          }
        </div>
      </div>
    `
    : "";

  const step2Card = `
    <div class="card details-card">
      <div class="card-head">
        <div class="card-title">Step 2 — Documentation</div>
      </div>
      <div class="kv">
        <div class="kv-row">
          <div class="kv-key">Documentation link</div>
          <div class="kv-val">
            <a class="link" href="${escapeHtml(DOC_URL)}" target="_blank" rel="noreferrer">
              Active Directory troubleshooting documentation
            </a>
            <div class="hint">Open the link, follow the guide, then come back and click the button below.</div>
          </div>
        </div>
        <div class="kv-row">
          <div class="kv-key">After reviewing the documentation</div>
          <div class="kv-val">
            <button type="button" class="btn btn-secondary" id="btnDocNoLuck">
              I have checked the documentation — still no luck.
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  const variantsHint =
    normalizeForCompare(userIssueText).trim() === "409" || normalizeForCompare(userIssueText).startsWith("409 ")
      ? `<div class="card details-card"><div class="kv">${suggest409Variants()}</div></div>`
      : "";

  helpResults.innerHTML = `
    ${variantsHint}
    ${matchCard}
    ${step1Card}
    ${step2Card}
    <div class="hint" style="margin-top:10px;">
      Note: We only consider steps you explicitly typed. We do not assume anything.
    </div>
  `;

  helpResults.querySelectorAll("button[data-suggest-issue]").forEach(btn => {
    btn.addEventListener("click", () => {
      const text = btn.getAttribute("data-suggest-issue") || "";
      if (helpIssueInput) helpIssueInput.value = text;
    });
  });

  document.getElementById("btnDocNoLuck")?.addEventListener("click", () => {
    helpFlowState.docConfirmed = true;
    renderStep3Prompt();
  });
}

function buildChatGPTPrompt() {
  const issueText = helpFlowState.lastUserIssue || "";
  const matched = helpFlowState.lastMatchedIssue;
  const missing = helpFlowState.lastMissing || [];
  const checks = helpFlowState.lastUserChecks || [];

  const suspectedRootCause = matched?.rootCause ? matched.rootCause : "Unknown / needs investigation";
  const stdChecklist = matched?.checklistItems || [];

  const missingBlock = missing.length
    ? `Missing checks (from the standard checklist that were NOT confirmed):\n- ${missing.join("\n- ")}\n`
    : `Missing checks: None (all standard checks appear completed).\n`;

  return `
You are helping troubleshoot an Aquera integration issue.

Issue description:
${issueText}

Suspected root cause:
${suspectedRootCause}

Standard checklist for this issue type:
${stdChecklist.length ? "- " + stdChecklist.join("\n- ") : "- No standard checklist was found in our Common Issues database."}

Checks already completed by me:
${checks.length ? "- " + checks.join("\n- ") : "- (none provided)"}

${missingBlock}
Documentation reviewed:
Yes — I reviewed the Active Directory configuration/troubleshooting documentation but still no luck.

Current status:
Issue persists. Need next best investigation steps and what logs/fields to inspect.

Please propose:
1) The next 5–10 investigative steps in priority order
2) What specific logs/fields to look for
3) What likely causes remain and how to validate each

I will attach:
- Relevant integration log.txt files
- Relevant application log.txt files
- The integration / customer script JSON file
- Ticket details (error code, timestamps, affected user, environment)
  `.trim();
}

function renderStep3Prompt() {
  if (!helpResults) return;

  const prompt = buildChatGPTPrompt();

  helpResults.insertAdjacentHTML(
    "beforeend",
    `
    <div class="card details-card">
      <div class="card-head">
        <div class="card-title">Step 3 — ChatGPT-ready prompt</div>
      </div>
      <div class="kv">
        <div class="kv-row">
          <div class="kv-key">System message</div>
          <div class="kv-val">Hey, no worries. I will create a ChatGPT-ready prompt that you can paste directly into ChatGPT.</div>
        </div>

        <div class="kv-row">
          <div class="kv-key">Copy/paste this prompt into ChatGPT</div>
          <div class="kv-val">
            <textarea class="details-template-editor" id="chatgptPromptBox">${escapeHtml(prompt)}</textarea>
            <div class="row-between" style="margin-top:10px;">
              <button type="button" class="btn btn-primary" id="copyPromptBtn">Copy prompt</button>
              <div class="hint">Reminder: attach integration logs, application logs, customer script JSON, and ticket details.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    `
  );

  document.getElementById("copyPromptBtn")?.addEventListener("click", async () => {
    const box = document.getElementById("chatgptPromptBox");
    const text = box?.value || "";
    try {
      await navigator.clipboard.writeText(text);
      alert("Prompt copied to clipboard.");
    } catch {
      if (box) {
        box.focus();
        box.select();
        document.execCommand("copy");
        alert("Prompt copied (fallback).");
      }
    }
  });
}

async function handleHelpAnalyzeClick() {
  if (!helpIssueInput || !helpResults) return;

  const issueText = (helpIssueInput.value || "").trim();
  const checkedText = (helpCheckedInput?.value || "").trim();

  if (!issueText) {
    helpResults.innerHTML = `<div class="muted">Please enter an issue description.</div>`;
    return;
  }

  if (!issues.length) {
    helpResults.innerHTML = `<div class="muted">Loading Common Issues…</div>`;
    await loadIssuesFromFirestore();
  }

  const matched = matchIssueByText(issueText);
  const userChecksRaw = linesToBullets(checkedText).filter(isStepLikeLine);

  let missing = [];
  if (matched) {
    const standard = (matched.checklistItems || []).filter(Boolean);
    missing = compareChecklists({ standard, user: userChecksRaw });
  }

  helpFlowState.lastUserIssue = issueText;
  helpFlowState.lastMatchedIssue = matched;
  helpFlowState.lastUserChecks = userChecksRaw;
  helpFlowState.lastMissing = missing;
  helpFlowState.docConfirmed = false;

  renderHelpOutput({ matchedIssue: matched, missingItems: missing, userIssueText: issueText });
}

helpAnalyzeBtn?.addEventListener("click", handleHelpAnalyzeClick);

helpClearBtn?.addEventListener("click", () => {
  if (helpIssueInput) helpIssueInput.value = "";
  if (helpCheckedInput) helpCheckedInput.value = "";
  if (helpResults) {
    helpResults.innerHTML = `<div class="muted">Enter an issue + what you checked, then click “Analyze my checklist”.</div>`;
  }

  helpFlowState = {
    lastUserIssue: "",
    lastMatchedIssue: null,
    lastUserChecks: [],
    lastMissing: [],
    docConfirmed: false
  };
});

/* =========
   Init
========= */

const themeToggle = document.getElementById("themeToggle");

function applySavedTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "light") {
    document.documentElement.classList.add("light-theme");
    if (themeToggle) themeToggle.textContent = "🌙";
  } else {
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

// App init
async function init() {
  applySavedTheme();
  loadApplicationOptions();
  renderTemplateTabs();
  if (templateEditor) templateEditor.value = templateState[0].body;

  setActiveTab("common");
  showListScreen();

  await loadIssuesFromFirestore();
}

init();