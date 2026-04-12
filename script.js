/* =========
   BASIC HELPERS
========= */
function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function linesToBullets(text = "") {
  return text.split("\n").map(s => s.trim()).filter(Boolean);
}

/* =========
   STATE
========= */
let allIssues = [];
let issues = [];
let deletedIssues = [];
let selectedIssueId = null;

/* =========
   DOM
========= */
const issueList = document.getElementById("issueList");
const issuesCountPill = document.getElementById("issuesCountPill");

const binList = document.getElementById("binIssueList"); // ✅ FIXED
const binCountPill = document.getElementById("binCountPill");
const binCountPillTab = document.getElementById("binCountPillTab");

const searchInput = document.getElementById("searchInput");

/* =========
   FIRESTORE
========= */
function ensureFirestoreReady() {
  if (!window.db || !window.firebaseFns) {
    alert("Firebase not ready");
    return false;
  }
  return true;
}

function splitData() {
  issues = allIssues.filter(x => !x.deleted);
  deletedIssues = allIssues.filter(x => x.deleted);
}

async function loadIssues() {
  if (!ensureFirestoreReady()) return;

  const { collection, getDocs } = window.firebaseFns;

  const snap = await getDocs(collection(window.db, "issues"));

  allIssues = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log("Loaded issues:", allIssues); // DEBUG

  splitData();
  renderIssues();
  renderBin();
}

/* =========
   LIST RENDER
========= */
function getFilteredIssues() {
  const q = (searchInput?.value || "").toLowerCase();
  if (!q) return issues;

  return issues.filter(i =>
    (i.issueDescription || "").toLowerCase().includes(q)
  );
}

function renderIssues() {
  if (!issueList) return;

  const list = getFilteredIssues();

  issuesCountPill.textContent = list.length;

  if (!list.length) {
    issueList.innerHTML = `<li class="empty-state">No issues found</li>`;
    return;
  }

  issueList.innerHTML = "";

  list.forEach(it => {
    const li = document.createElement("li");
    li.className = "issue-item";

    li.innerHTML = `
      <div class="issue-item-main">
        <div>${escapeHtml(it.issueDescription)}</div>
      </div>
      <button class="menu-btn">⋯</button>
    `;

    li.querySelector(".menu-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteIssue(it.id);
    });

    issueList.appendChild(li);
  });
}

/* =========
   BIN RENDER
========= */
function renderBin() {
  if (!binList) return;

  binCountPill.textContent = deletedIssues.length;

  if (binCountPillTab) {
    binCountPillTab.textContent = deletedIssues.length;
  }

  if (!deletedIssues.length) {
    binList.innerHTML = `<li class="empty-state">Bin is empty</li>`;
    return;
  }

  binList.innerHTML = "";

  deletedIssues.forEach(it => {
    const li = document.createElement("li");

    li.innerHTML = `
      ${escapeHtml(it.issueDescription)}
      <button class="restore-btn">Restore</button>
    `;

    li.querySelector(".restore-btn").addEventListener("click", () => {
      restoreIssue(it.id);
    });

    binList.appendChild(li);
  });
}

/* =========
   ACTIONS
========= */
async function deleteIssue(id) {
  if (!confirm("Move to bin?")) return;

  const { doc, updateDoc } = window.firebaseFns;

  await updateDoc(doc(window.db, "issues", id), {
    deleted: true
  });

  await loadIssues();
}

async function restoreIssue(id) {
  const { doc, updateDoc } = window.firebaseFns;

  await updateDoc(doc(window.db, "issues", id), {
    deleted: false
  });

  await loadIssues();
}

/* =========
   SEARCH
========= */
searchInput?.addEventListener("input", renderIssues);

/* =========
   INIT
========= */
async function init() {
  await loadIssues();
}

init();