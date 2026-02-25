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

function normalizeText(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsLoose(haystack, needle) {
  const h = normalizeText(haystack);
  const n = normalizeText(needle);
  if (!h || !n) return false;
  if (h.includes(n)) return true;

  // loose token overlap (helps when user paraphrases)
  const hTokens = new Set(h.split(" ").filter(Boolean));
  const nTokens = n.split(" ").filter(Boolean);
  if (!nTokens.length) return false;

  let hits = 0;
  for (const t of nTokens) if (hTokens.has(t)) hits++;

  // if checklist item is long, require decent overlap
  const ratio = hits / nTokens.length;
  return ratio >= 0.55;
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

// Help Me Troubleshoot
const helpIssueInput = document.getElementById("helpIssueInput");
const helpFindBtn = document.getElementById("helpFindBtn");
const helpClearBtn = document.getElementById("helpClearBtn");
const helpResults = document.getElementById("helpResults");

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
   Common Issues list
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

function renderIssueList() {
  if (!issueList || !issuesCountPill) return;

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
   Help Me Troubleshoot (NEW FLOW - no API calls)
========= */

// Put your AD troubleshooting doc link here (or leave blank for now).
const AD_TROUBLESHOOT_DOC_URL = ""; // e.g. "https://your-internal-doc-link"

const HELP_PREDEFINED = {
  missedPrefix: "Hey, you missed checking:",
  allChecked: "Okay, you have checked everything.",
  referDocs: "Kindly refer to the Active Directory troubleshooting documentation.\nHere is the link:",
  askDocConfirm: "Confirm after reviewing the documentation:",
  docStillNoLuck: "I have checked the documentation — still no luck.",
  makePrompt: "Hey, no worries. I will create a ChatGPT-ready prompt that you can paste directly into ChatGPT."
};

const helpState = {
  userIssue: "",
  matchedIssue: null,
  userChecklistText: "",
  missingItems: [],
  docReviewed: false
};

function findBestIssueMatch(queryText) {
  const q = (queryText || "").trim().toLowerCase();
  if (!q) return null;

  let best = null;
  let bestScore = 0;

  for (const it of issues) {
    const desc = (it.issueDescription || "").toLowerCase();
    const app = (it.application || "").toLowerCase();
    const root = (it.rootCause || "").toLowerCase();
    const checklist = (it.checklistItems || []).join(" ").toLowerCase();

    let score = 0;
    if (desc.includes(q)) score += 5;
    if (app.includes(q)) score += 2;
    if (root.includes(q)) score += 2;
    if (checklist.includes(q)) score += 1;

    if (q.length <= 6 && (desc.includes(q) || checklist.includes(q))) score += 1;

    if (score > bestScore) {
      bestScore = score;
      best = it;
    }
  }

  return bestScore > 0 ? best : null;
}

function computeMissingChecklistItems(userChecklistLines, commonChecklistItems) {
  const userCombined = userChecklistLines.join("\n");

  const missing = [];
  for (const item of commonChecklistItems) {
    const ok = containsLoose(userCombined, item);
    if (!ok) missing.push(item);
  }
  return missing;
}

function buildChatGPTPrompt() {
  const match = helpState.matchedIssue;

  const issueTitle = helpState.userIssue || "(not provided)";
  const matchedTitle = match?.issueDescription || "(no matched Common Issue)";
  const matchedApp = match?.application || "";
  const suspectedRoot = match?.rootCause || "(not provided)";
  const commonChecklist = (match?.checklistItems || []).map(x => `- ${x}`).join("\n") || "- (none)";
  const completedChecklist = linesToBullets(helpState.userChecklistText || "").map(x => `- ${x}`).join("\n") || "- (none)";

  const docLine = AD_TROUBLESHOOT_DOC_URL
    ? `- Documentation reviewed: Yes (${AD_TROUBLESHOOT_DOC_URL})`
    : `- Documentation reviewed: Yes (link not set in app yet)`;

  const prompt = `You are helping troubleshoot an identity/integration issue. Use the details below and propose next diagnostic steps and likely root causes. Be explicit and actionable.

Issue description (what I entered):
${issueTitle}

Matched Common Issue (from our internal checklist library):
- Title: ${matchedTitle}${matchedApp ? `\n- Application: ${matchedApp}` : ""}

Suspected root cause (from Common Issue entry):
${suspectedRoot}

Standard troubleshooting checklist for this issue (Common Issue checklist):
${commonChecklist}

Troubleshooting steps I have already completed (confirmed):
${completedChecklist}

Additional steps taken:
${docLine}
- Current status: Still failing / no resolution yet.

Please propose:
1) The most likely remaining causes (ranked)
2) The next 5–10 checks to run (exactly how to check each)
3) What logs or evidence I should collect and what to look for in them
4) Any safe remediation steps

Important: I will attach supporting files. Please tell me what to look for in each.`;

  return prompt;
}

function renderHelpUIInitial() {
  if (!helpResults) return;
  helpResults.innerHTML = `<div class="muted">Enter an issue above and click “Find checklist”.</div>`;
}

function renderHelpUIMatched(match) {
  if (!helpResults) return;

  const hasMatch = !!match;
  const checklistHtml = hasMatch ? bulletsToHtml(match.checklistItems || []) : "";
  const appPill = hasMatch && match.application ? `<span class="pill">${escapeHtml(match.application)}</span>` : "";

  helpResults.innerHTML = `
    <div class="card details-card" style="margin-top:10px;">
      <div class="card-head">
        <div class="card-title">Matched Common Issue</div>
        <div class="card-actions">
          ${appPill}
        </div>
      </div>

      <div class="kv">
        ${
          hasMatch
            ? `
              <div class="kv-row">
                <div class="kv-key">Issue</div>
                <div class="kv-val">${escapeHtml(match.issueDescription || "Untitled issue")}</div>
              </div>

              <div class="kv-row">
                <div class="kv-key">Checklist (standard)</div>
                <div class="kv-val">${checklistHtml}</div>
              </div>

              <div class="kv-row">
                <div class="kv-key">Root cause</div>
                <div class="kv-val">${escapeHtml(match.rootCause || "") || "<span class='muted'>—</span>"}</div>
              </div>

              <div class="kv-row">
                <div class="kv-key">Solution</div>
                <div class="kv-val prewrap">${escapeHtml(match.solution || "") || "<span class='muted'>—</span>"}</div>
              </div>
            `
            : `
              <div class="kv-row">
                <div class="kv-key">No matching Common Issue found</div>
                <div class="kv-val muted">
                  Try adding a system name (e.g., "409 Active Directory"), or create this issue in the "New Issues" tab so it becomes searchable.
                </div>
              </div>
            `
        }

        <div class="kv-row">
          <div class="kv-key">Step 1 — Paste what you already checked</div>
          <div class="kv-val">
            <div class="muted" style="margin-bottom:10px;">
              Start your message with: <b>“I have checked the following:”</b><br/>
              Then paste your checklist lines below.
            </div>

            <textarea id="helpCheckedBox" class="details-template-editor" rows="10" placeholder="I have checked the following:\n- ..."></textarea>

            <div class="row-between" style="margin-top:10px;">
              <button type="button" class="btn btn-primary" id="helpAnalyzeBtn">Compare with standard checklist</button>
              <span class="pill muted-pill">No assumptions: only what you typed counts</span>
            </div>
          </div>
        </div>

        <div class="kv-row" id="helpStep2Area">
          <div class="kv-key">Next steps</div>
          <div class="kv-val muted">
            Click “Compare with standard checklist” to see what’s missing.
          </div>
        </div>
      </div>
    </div>
  `;

  // Wire Step 1 button
  document.getElementById("helpAnalyzeBtn")?.addEventListener("click", () => {
    const box = document.getElementById("helpCheckedBox");
    const text = (box?.value || "").trim();
    helpState.userChecklistText = text;

    if (!text || !normalizeText(text).includes(normalizeText("I have checked the following"))) {
      renderHelpStep2Message(`<span class="muted">Please start with “I have checked the following:” and list what you checked.</span>`);
      return;
    }

    const userLines = linesToBullets(text.replace(/^\s*i have checked the following:\s*/i, ""));
    const commonLines = (helpState.matchedIssue?.checklistItems || []);

    if (!commonLines.length) {
      // no standard checklist to compare against
      renderHelpStep2AllCheckedNoStandard();
      return;
    }

    const missing = computeMissingChecklistItems(userLines, commonLines);
    helpState.missingItems = missing;

    if (missing.length) {
      renderHelpStep2Missing(missing);
    } else {
      renderHelpStep2AllChecked();
    }
  });
}

function renderHelpStep2Message(html) {
  const area = document.getElementById("helpStep2Area");
  if (!area) return;
  area.querySelector(".kv-val")?.remove();
  area.insertAdjacentHTML("beforeend", `<div class="kv-val">${html}</div>`);
}

function renderHelpStep2Missing(missingItems) {
  const missingHtml = `<div style="margin-bottom:10px;"><b>${escapeHtml(HELP_PREDEFINED.missedPrefix)}</b></div>
    <ul class="bullet-list">${missingItems.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
    <div class="muted" style="margin-top:10px;">
      Add the missing checks to your “I have checked the following:” list, then click “Compare with standard checklist” again.
    </div>`;

  renderHelpStep2Message(missingHtml);
}

function renderHelpStep2AllCheckedNoStandard() {
  const html = `
    <div style="margin-bottom:10px;"><b>${escapeHtml(HELP_PREDEFINED.allChecked)}</b></div>
    <div class="muted">No standard checklist exists for this (no matched Common Issue), so I can't compare automatically.</div>
    <div style="margin-top:12px;">
      <button type="button" class="btn btn-secondary" id="helpDocNoLuckBtn">${escapeHtml(HELP_PREDEFINED.docStillNoLuck)}</button>
    </div>
  `;
  renderHelpStep2Message(html);

  document.getElementById("helpDocNoLuckBtn")?.addEventListener("click", () => {
    renderHelpStep3Prompt();
  });
}

function renderHelpStep2AllChecked() {
  const docLinkHtml = AD_TROUBLESHOOT_DOC_URL
    ? `<a class="link" href="${escapeHtml(AD_TROUBLESHOOT_DOC_URL)}" target="_blank" rel="noreferrer">${escapeHtml(AD_TROUBLESHOOT_DOC_URL)}</a>`
    : `<span class="muted">[Add your AD troubleshooting doc link in script.js → AD_TROUBLESHOOT_DOC_URL]</span>`;

  const html = `
    <div style="margin-bottom:10px;"><b>${escapeHtml(HELP_PREDEFINED.allChecked)}</b></div>
    <div class="muted" style="margin-bottom:10px;">${escapeHtml(HELP_PREDEFINED.referDocs)}</div>
    <div style="margin-bottom:12px;">${docLinkHtml}</div>

    <div class="muted" style="margin-bottom:10px;">${escapeHtml(HELP_PREDEFINED.askDocConfirm)}</div>

    <div class="row-between">
      <button type="button" class="btn btn-primary" id="helpDocReviewedBtn">I reviewed the documentation</button>
      <button type="button" class="btn btn-secondary" id="helpDocNoLuckBtn">${escapeHtml(HELP_PREDEFINED.docStillNoLuck)}</button>
    </div>
  `;
  renderHelpStep2Message(html);

  document.getElementById("helpDocReviewedBtn")?.addEventListener("click", () => {
    helpState.docReviewed = true;
    renderHelpStep2Message(`<div class="muted">Noted. If it still doesn’t help, click: <b>${escapeHtml(HELP_PREDEFINED.docStillNoLuck)}</b></div>
      <div style="margin-top:12px;">
        <button type="button" class="btn btn-secondary" id="helpDocNoLuckBtn">${escapeHtml(HELP_PREDEFINED.docStillNoLuck)}</button>
      </div>`);
    document.getElementById("helpDocNoLuckBtn")?.addEventListener("click", () => renderHelpStep3Prompt());
  });

  document.getElementById("helpDocNoLuckBtn")?.addEventListener("click", () => {
    renderHelpStep3Prompt();
  });
}

function renderHelpStep3Prompt() {
  const prompt = buildChatGPTPrompt();

  const attachments = [
    "Relevant integration log.txt files",
    "Relevant application log.txt files",
    "The integration / customer script JSON file",
    "Ticket details (error code, timestamps, affected user, environment)"
  ];

  const html = `
    <div style="margin-bottom:10px;"><b>${escapeHtml(HELP_PREDEFINED.makePrompt)}</b></div>

    <div class="kv-row" style="border-top:none; padding-top:0;">
      <div class="kv-key">ChatGPT-ready prompt</div>
      <div class="kv-val">
        <textarea id="helpPromptBox" class="details-template-editor" rows="14">${escapeHtml(prompt)}</textarea>
        <div class="row-between" style="margin-top:10px;">
          <button type="button" class="btn btn-primary" id="helpCopyPromptBtn">Copy prompt</button>
          <span class="pill muted-pill">Paste into ChatGPT</span>
        </div>
      </div>
    </div>

    <div class="kv-row">
      <div class="kv-key">Attach these for better answers</div>
      <div class="kv-val">
        <ul class="bullet-list">${attachments.map(a => `<li>${escapeHtml(a)}</li>`).join("")}</ul>
        <div class="muted" style="margin-top:8px;">
          Attaching these helps ChatGPT analyze the issue more effectively and provide accurate guidance.
        </div>
      </div>
    </div>
  `;

  renderHelpStep2Message(html);

  document.getElementById("helpCopyPromptBtn")?.addEventListener("click", async () => {
    const box = document.getElementById("helpPromptBox");
    const text = box?.value || "";
    try {
      await navigator.clipboard.writeText(text);
      document.getElementById("helpCopyPromptBtn").textContent = "Copied";
      setTimeout(() => {
        const b = document.getElementById("helpCopyPromptBtn");
        if (b) b.textContent = "Copy prompt";
      }, 1200);
    } catch {
      alert("Could not copy automatically. Please select the text and copy manually.");
    }
  });
}

async function handleHelpFindClick() {
  if (!helpIssueInput || !helpResults) return;

  const q = (helpIssueInput.value || "").trim();
  if (!q) {
    helpResults.innerHTML = `<div class="muted">Please enter an issue (e.g., "409 Active Directory").</div>`;
    return;
  }

  helpState.userIssue = q;
  helpState.userChecklistText = "";
  helpState.missingItems = [];
  helpState.docReviewed = false;

  if (!issues.length) {
    helpResults.innerHTML = `<div class="muted">Loading Common Issues…</div>`;
    await loadIssuesFromFirestore();
  }

  const match = findBestIssueMatch(q);
  helpState.matchedIssue = match || null;

  renderHelpUIMatched(match);
}

helpFindBtn?.addEventListener("click", handleHelpFindClick);

helpClearBtn?.addEventListener("click", () => {
  if (helpIssueInput) helpIssueInput.value = "";
  helpState.userIssue = "";
  helpState.matchedIssue = null;
  helpState.userChecklistText = "";
  helpState.missingItems = [];
  helpState.docReviewed = false;
  renderHelpUIInitial();
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

async function init() {
  applySavedTheme();
  loadApplicationOptions();
  renderTemplateTabs();
  templateEditor.value = templateState[0].body;

  setActiveTab("common");
  showListScreen();

  renderHelpUIInitial();
  await loadIssuesFromFirestore();
}

init();