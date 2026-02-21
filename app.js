const DATA_PATH = `../Data/${APP_ID}`;

// ==================================================
// GLOBAL STATE
// ==================================================
let policies = [];
let filteredPolicies = [];
let selectedCategoryPath = null;
let policyCategorySet = new Set();

// ==================================================
// DEEP LINK HELPERS
// ==================================================
function getPolicyIdFromHash() {
  const queryPolicyId = new URLSearchParams(window.location.search).get("policy");
  if (queryPolicyId) return queryPolicyId;
  return window.location.hash ? window.location.hash.substring(1) : null;
}

function setPolicyInUrl(policyId) {
  const url = new URL(window.location.href);
  url.searchParams.set("policy", policyId);
  url.hash = "";
  window.history.replaceState({}, "", url);
}

// ==================================================
// LOAD POLICIES
// ==================================================
fetch(`${DATA_PATH}/policies.json`)
  .then(r => r.json())
  .then(d => {
    policies = d.policies;

    policyCategorySet.clear();
    policies.forEach(p => {
      policyCategorySet.add(p.categoryPath.join("||"));
    });

    buildProductFilter();
    buildCategoryTree();
    renderPolicyList();
    handleDeepLink();
  });

// ==================================================
// PRODUCT FILTER (Office only)
// ==================================================
function buildProductFilter() {
  const sel = document.getElementById("productFilter");
  if (!sel) return;

  const products = new Set(policies.map(p => p.product).filter(Boolean));
  sel.innerHTML = `<option value="">All Products</option>`;

  [...products].sort().forEach(p => {
    const o = document.createElement("option");
    o.value = p;
    o.textContent = p;
    sel.appendChild(o);
  });

  sel.onchange = applyFilters;
}

// ==================================================
// CATEGORY TREE (GPMC STYLE)
// ==================================================
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
  container.innerHTML = "";
  renderTreeNode(tree, container, []);
}

function renderTreeNode(node, parent, path) {
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
      const expanded = row.classList.toggle("expanded");
      toggle.textContent = expanded ? "-" : "+";
    };

    const label = document.createElement("span");
    label.textContent = " " + key;
    label.onclick = e => {
      e.stopPropagation();
      document.querySelectorAll(".tree-node.selected")
        .forEach(n => n.classList.remove("selected"));
      row.classList.add("selected");
      selectedCategoryPath = fullPath;
      applyFilters();
    };

    row.append(toggle, label);
    parent.appendChild(row);

    const children = document.createElement("div");
    children.className = "tree-children";
    parent.appendChild(children);

    renderTreeNode(node[key], children, fullPath);
  });
}

// ==================================================
// SEARCH
// ==================================================
document.getElementById("search").oninput = applyFilters;

// ==================================================
// FILTER PIPELINE
// ==================================================
function applyFilters() {
  const q = document.getElementById("search").value.toLowerCase();
  const selectedProduct = document.getElementById("productFilter")?.value;

  filteredPolicies = policies.filter(p => {
    if (selectedCategoryPath) {
      const key = selectedCategoryPath.join("||");
      if (!policyCategorySet.has(key)) return false;
      if (p.categoryPath.join("||") !== key) return false;
    }

    if (selectedProduct && p.product !== selectedProduct) return false;
    if (q && !p.displayName.toLowerCase().includes(q)) return false;

    return true;
  });

  renderPolicyList();
}

// ==================================================
// POLICY LIST (MIDDLE PANE)
// ==================================================
function renderPolicyList() {
  const el = document.getElementById("policyList");
  el.innerHTML = "";

  const hasSearch = document.getElementById("search").value;

  if (!selectedCategoryPath && !hasSearch) {
    el.innerHTML = "<p>Select a category to view policies.</p>";
    return;
  }

  if (filteredPolicies.length === 0) {
    el.innerHTML = "<p>No matching policies.</p>";
    return;
  }

  filteredPolicies.forEach(p => {
    const d = document.createElement("div");
    d.className = "policy";
    d.innerHTML = `<strong>${p.displayName}</strong><br/><small>${p.product || ""}</small>`;
    d.onclick = () => {
      setPolicyInUrl(p.policyId);
      showPolicyDetails(p);
    };
    el.appendChild(d);
  });
}

// ==================================================
// POLICY DETAILS (RIGHT PANE)
// ==================================================
function showPolicyDetails(p) {
  let html = `
    <div class="policy-pane">
      <h2>${p.displayName}</h2>

      <p><strong>Description:</strong><br>
        ${p.description || "N/A"}</p>

      <p><strong>Scope:</strong>
        ${p.policyClass === "User" ? "User Configuration" : "Computer Configuration"}</p>

      <p><strong>Category Path:</strong><br>
        ${p.categoryPath.join(" > ")}</p>
  `;

  if (p.registry) {
    html += `
      <h3>Registry</h3>
      <p><strong>Hive:</strong> ${p.registry.hive}</p>
      <p><strong>Key:</strong><br>${p.registry.key}</p>
    `;

    if (p.registry.valueName !== undefined) {
      html += `
        <p><strong>Value Name:</strong> ${p.registry.valueName || "(Default)"}</p>
        <ul>
          <li><strong>Enabled:</strong> ${p.registry.enabledValue}</li>
          <li><strong>Disabled:</strong> ${p.registry.disabledValue}</li>
        </ul>
      `;
    }

    if (p.registry.perApp) {
      html += `<h4>Per-Application Values</h4><ul>`;
      Object.entries(p.registry.perApp).forEach(([app, v]) => {
        html += `<li><strong>${app}</strong> → Enabled: ${v.enabled}, Disabled: ${v.disabled}</li>`;
      });
      html += `</ul>`;
    }
  } else {
    html += `<p><strong>Registry:</strong> N/A</p>`;
  }

  html += `
      <div class="copy-container">
        <button class="copy-btn" onclick="toggleCopyMenu(event)">Copy ▾</button>
        <div id="copyMenu" class="copy-menu">
          <div onclick="copyText('url','${p.policyId}')">Copy URL</div>
          <div onclick="copyText('name','${p.displayName}')">Copy Policy Name</div>
          <div onclick="copyText('category','${p.categoryPath.join(" > ")}')">Copy Category Path</div>
          ${p.registry ? `<div onclick="copyText('registry','${p.registry.hive}\\${p.registry.key}')">Copy Registry Key</div>` : ""}
          <div onclick="copySummary()">Copy Summary</div>
        </div>
      </div>

      <div id="copyStatus"></div>
    </div>
  `;

  document.getElementById("policyDetails").innerHTML = html;
}

// ==================================================
// COPY MENU
// ==================================================
function toggleCopyMenu(e) {
  e.stopPropagation();
  document.getElementById("copyMenu")?.classList.toggle("show");
}

function copyText(type, value) {
  let text = value;
  if (type === "url") {
    text = `${location.origin}${location.pathname}?policy=${encodeURIComponent(value)}`;
  }
  navigator.clipboard.writeText(text).then(() => showCopyStatus("Copied!"));
  closeCopyMenu();
}

function copySummary() {
  const text = document.getElementById("policyDetails").innerText;
  navigator.clipboard.writeText(text).then(() => showCopyStatus("Summary copied!"));
  closeCopyMenu();
}

function showCopyStatus(msg) {
  const el = document.getElementById("copyStatus");
  if (!el) return;
  el.textContent = msg;
  setTimeout(() => el.textContent = "", 2000);
}

function closeCopyMenu() {
  document.getElementById("copyMenu")?.classList.remove("show");
}

document.addEventListener("click", closeCopyMenu);

// ==================================================
// DEEP LINK HANDLING
// ==================================================
function handleDeepLink() {
  const id = getPolicyIdFromHash();
  if (!id) return;

  const p = policies.find(x => x.policyId === id);
  if (!p) return;

  selectedCategoryPath = p.categoryPath;
  expandCategoryPath(p.categoryPath);
  applyFilters();
  showPolicyDetails(p);
}

function expandCategoryPath(path) {
  let current = [];
  path.forEach(seg => {
    current.push(seg);
    const key = current.join("||");
    const node = document.querySelector(`.tree-node[data-path="${key}"]`);
    if (node) {
      node.classList.add("expanded");
      const t = node.querySelector(".tree-toggle");
      if (t) t.textContent = "-";
    }
  });
}

window.addEventListener("hashchange", handleDeepLink);
window.addEventListener("popstate", handleDeepLink);
