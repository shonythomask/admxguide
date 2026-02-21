/* =====================================================
   ADMX GUIDE – ENTERPRISE FRONTEND (FINAL STABLE)
   - Expandable Tree
   - Global Search
   - Registry Rendering
   - Deep Linking
   - Enterprise Copy Dropdown
   ===================================================== */

if (typeof APP_ID === "undefined") {
  throw new Error("APP_ID missing.");
}

const DATA_PATH = `${window.location.origin}/Data/${APP_ID}`;

let policies = [];
let selectedCategoryPath = null;
let currentPolicy = null;
let debounceTimer = null;

// ================= LOAD POLICIES =================
fetch(`${DATA_PATH}/policies.json`)
  .then(res => {
    if (!res.ok) throw new Error("Failed to load policies.json");
    return res.json();
  })
  .then(data => {
    policies = data.policies || [];
    buildCategoryTree();
    renderPolicyList();
    handleInitialRoute();
  })
  .catch(err => console.error("Policy load error:", err));


// ================= SEARCH =================
document.addEventListener("DOMContentLoaded", () => {

  const input = document.getElementById("search");
  const clearBtn = document.getElementById("clearSearch");

  if (!input) return;

  input.addEventListener("input", () => {
    if (clearBtn)
      clearBtn.style.display = input.value ? "block" : "none";

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(renderPolicyList, 200);
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      input.value = "";
      clearBtn.style.display = "none";
      renderPolicyList();
    });
  }
});


// ================= TREE =================
function buildCategoryTree() {
  const tree = {};

  policies.forEach(p => {
    let node = tree;
    p.categoryPath.forEach(c => {
      node[c] = node[c] || {};
      node = node[c];
    });
  });

  const container = document.getElementById("categoryTree");
  if (!container) return;

  container.innerHTML = "";
  renderTree(tree, container, []);
}

function renderTree(node, parent, path) {

  Object.keys(node).sort().forEach(key => {

    const fullPath = [...path, key];

    const row = document.createElement("div");
    row.className = "tree-node";
    row.dataset.path = fullPath.join("||");

    const hasChildren = Object.keys(node[key]).length > 0;

    const toggle = document.createElement("span");
    toggle.className = "tree-toggle";
    toggle.textContent = hasChildren ? "+" : "";

    toggle.onclick = e => {
      e.stopPropagation();
      if (!hasChildren) return;

      row.classList.toggle("expanded");
      toggle.textContent =
        row.classList.contains("expanded") ? "−" : "+";
    };

    const label = document.createElement("span");
    label.textContent = " " + key;

    label.onclick = e => {
      e.stopPropagation();

      document.querySelectorAll(".tree-node.selected")
        .forEach(n => n.classList.remove("selected"));

      row.classList.add("selected");

      selectedCategoryPath = fullPath;
      expandCategoryPath(fullPath);
      renderPolicyList();
    };

    row.append(toggle, label);
    parent.appendChild(row);

    const children = document.createElement("div");
    children.className = "tree-children";
    parent.appendChild(children);

    renderTree(node[key], children, fullPath);
  });
}

function expandCategoryPath(path) {
  let current = [];

  path.forEach(seg => {
    current.push(seg);

    const node = document.querySelector(
      `.tree-node[data-path="${current.join("||")}"]`
    );

    if (node) {
      node.classList.add("expanded");
      const toggle = node.querySelector(".tree-toggle");
      if (toggle) toggle.textContent = "−";
    }
  });
}


// ================= POLICY LIST =================
function renderPolicyList() {

  const el = document.getElementById("policyList");
  const resultCount = document.getElementById("resultCount");

  if (!el) return;

  el.innerHTML = "";

  const query =
    document.getElementById("search")?.value?.trim().toLowerCase();

  let filtered = [];

  // -------- GLOBAL SEARCH --------
  if (query) {

    filtered = policies.filter(p =>
      p.displayName?.toLowerCase().includes(query) ||
      p.description?.toLowerCase().includes(query) ||
      p.registry?.key?.toLowerCase().includes(query) ||
      p.registry?.values?.some(v =>
        v.valueName?.toLowerCase().includes(query)
      ) ||
      p.registry?.values?.some(v =>
        v.possibleValues?.some(val =>
          val.toLowerCase().includes(query)
        )
      )
    );

  } else {

    if (!selectedCategoryPath) {
      el.innerHTML = "<p>Select a category or use search.</p>";
      if (resultCount) resultCount.textContent = "";
      return;
    }

    filtered = policies.filter(p =>
      p.categoryPath
        .slice(0, selectedCategoryPath.length)
        .join("||") === selectedCategoryPath.join("||")
    );
  }

  if (!filtered.length) {
    el.innerHTML = "<p>No matching policies found.</p>";
    if (resultCount) resultCount.textContent = "0 results";
    return;
  }

  if (resultCount)
    resultCount.textContent =
      `${filtered.length} result${filtered.length > 1 ? "s" : ""}`;

  filtered.forEach(p => {

    const d = document.createElement("div");
    d.className = "policy";
    d.innerHTML = `<strong>${p.displayName}</strong>`;

    d.onclick = () => {
      history.pushState({}, "", `./${p.policyId}.html`);
      showPolicyDetails(p);
    };

    el.appendChild(d);
  });
}


// ================= POLICY DETAILS =================
function showPolicyDetails(p) {

  currentPolicy = p;
  document.title = `${p.displayName} | ADMX Guide`;

  let html = `
    <div class="policy-pane">

      <div class="breadcrumb">
        ${p.categoryPath.join(" › ")}
      </div>

      <h2>${p.displayName}</h2>

      <div><strong>Scope:</strong> ${p.policyClass}</div>

      <div class="policy-description">
        ${p.description || ""}
      </div>
  `;

  if (p.registry) {

    html += `
      <div class="registry-block">
        <h3>Registry Details</h3>
        <div><strong>Hive:</strong> ${p.registry.hive || "-"}</div>
        <div><strong>Key:</strong> ${p.registry.key || "-"}</div>
    `;

    if (p.registry.values?.length) {
      p.registry.values.forEach(v => {

        html += `
          <div class="registry-value">
            <div><strong>Value Name:</strong> ${v.valueName || "-"}</div>
            <div><strong>Type:</strong> ${v.valueType || "-"}</div>
        `;

        if (v.possibleValues?.length) {
          html += "<ul>";
          v.possibleValues.forEach(pv => {
            html += `<li>${pv}</li>`;
          });
          html += "</ul>";
        }

        html += "</div>";
      });
    }

    html += "</div>";
  }

  html += `
      <div id="copyStatus" class="copy-status"></div>

      <div class="copy-container">
        <button id="copyToggle" class="copy-btn">Copy ▾</button>

        <div id="copyMenu" class="copy-menu">
          <div data-copy="url">Copy URL</div>
          <div data-copy="name">Copy Policy Name</div>
          <div data-copy="category">Copy Category Path</div>
          <div data-copy="registry">Copy Registry Key</div>
          <div data-copy="summary">Copy Summary</div>
        </div>
      </div>

    </div>
  `;

  const container = document.getElementById("policyDetails");
  container.innerHTML = html;

  initializeCopyMenu();
}


// ================= COPY MENU =================
function initializeCopyMenu() {

  const toggleBtn = document.getElementById("copyToggle");
  const menu = document.getElementById("copyMenu");

  if (!toggleBtn || !menu) return;

  menu.style.display = "none";

  toggleBtn.onclick = (e) => {
    e.stopPropagation();
    menu.style.display =
      menu.style.display === "block" ? "none" : "block";
  };

  menu.querySelectorAll("div").forEach(item => {
    item.onclick = (e) => {
      e.stopPropagation();
      copyOption(item.dataset.copy);
      menu.style.display = "none";
    };
  });

  document.addEventListener("click", () => {
    menu.style.display = "none";
  });
}

function copyOption(type) {

  if (!currentPolicy) return;

  let text = "";

  switch (type) {

    case "url":
      text = window.location.href;
      break;

    case "name":
      text = currentPolicy.displayName;
      break;

    case "category":
      text = currentPolicy.categoryPath.join(" › ");
      break;

    case "registry":
      text =
        `${currentPolicy.registry?.hive}\\${currentPolicy.registry?.key}`;
      break;

    case "summary":
      text =
`Policy: ${currentPolicy.displayName}
Scope: ${currentPolicy.policyClass}
Category: ${currentPolicy.categoryPath.join(" › ")}
Registry: ${currentPolicy.registry?.hive}\\${currentPolicy.registry?.key}

Description:
${currentPolicy.description}`;
      break;
  }

  navigator.clipboard.writeText(text).then(() => {
    const status = document.getElementById("copyStatus");
    if (status) {
      status.textContent = "Copied!";
      setTimeout(() => status.textContent = "", 2000);
    }
  });
}


// ================= ROUTING =================
function handleInitialRoute() {

  const match =
    window.location.pathname.match(/\/([^\/]+)\.html$/);

  if (!match) return;

  const policy =
    policies.find(p => p.policyId === match[1]);

  if (policy) {
    selectedCategoryPath = policy.categoryPath;
    expandCategoryPath(policy.categoryPath);
    renderPolicyList();
    showPolicyDetails(policy);
  }
}

window.addEventListener("popstate", handleInitialRoute);
