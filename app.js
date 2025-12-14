// ==================================================
// GLOBAL STATE
// ==================================================
let appsIndex = [];
let policies = [];
let filteredPolicies = [];

let selectedCategoryPath = null;
let policyCategorySet = new Set(); // real policy folders only

// ==================================================
// LOAD APPLICATION INDEX
// ==================================================
fetch("data/index.json")
  .then(r => r.json())
  .then(index => {
    appsIndex = index.applications;
    buildAppSelector();
  })
  .catch(err => {
    console.error(err);
    document.getElementById("policyList").innerText =
      "Failed to load data/index.json";
  });

// ==================================================
// APPLICATION SELECTOR
// ==================================================
function buildAppSelector() {
  const sel = document.getElementById("appSelector");
  sel.innerHTML = "";

  appsIndex.forEach(app => {
    const o = document.createElement("option");
    o.value = app.path;
    o.textContent = app.displayName;
    sel.appendChild(o);
  });

  sel.onchange = () => loadPolicies(sel.value);

  if (appsIndex.length > 0) {
    sel.value = appsIndex[0].path;
    loadPolicies(appsIndex[0].path);
  }
}

// ==================================================
// LOAD POLICIES
// ==================================================
function loadPolicies(path) {
  fetch(`data/${path}`)
    .then(r => r.json())
    .then(d => {
      policies = d.policies;
      filteredPolicies = [];
      selectedCategoryPath = null;

      // Build set of REAL policy categories (leaf folders)
      policyCategorySet.clear();
      policies.forEach(p => {
        policyCategorySet.add(p.categoryPath.join("||"));
      });

      buildProductFilter();
      buildCategoryTree();
      renderPolicyList();
      clearPolicyDetails();
    });
}

// ==================================================
// PRODUCT FILTER
// ==================================================
function buildProductFilter() {
  const sel = document.getElementById("productFilter");
  sel.innerHTML = `<option value="">All Products</option>`;

  const products = new Set(policies.map(p => p.product).filter(Boolean));

  [...products].sort().forEach(p => {
    const o = document.createElement("option");
    o.value = p;
    o.textContent = p;
    sel.appendChild(o);
  });

  sel.onchange = applyFilters;
}

// ==================================================
// CATEGORY TREE (GPMC CORRECT BEHAVIOR)
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

function renderTreeNode(node, parent, currentPath) {
  Object.keys(node).sort().forEach(key => {
    const row = document.createElement("div");
    row.className = "tree-node";

    const hasChildren = Object.keys(node[key]).length > 0;
    const fullPath = [...currentPath, key];

    // Expand / collapse toggle
    const toggle = document.createElement("span");
    toggle.className = "tree-toggle";
    toggle.textContent = hasChildren ? "+" : "";

    toggle.onclick = e => {
      e.stopPropagation();
      if (!hasChildren) return;

      const expanded = row.classList.toggle("expanded");
      toggle.textContent = expanded ? "-" : "+";
    };

    // Category label (selection)
    const label = document.createElement("span");
    label.textContent = " " + key;

    label.onclick = e => {
      e.stopPropagation();

      document
        .querySelectorAll(".tree-node.selected")
        .forEach(n => n.classList.remove("selected"));

      row.classList.add("selected");

      selectedCategoryPath = fullPath;
      applyFilters();
    };

    row.appendChild(toggle);
    row.appendChild(label);
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
// CENTRAL FILTER PIPELINE (GPMC LOGIC)
// ==================================================
function applyFilters() {
  const q = document.getElementById("search").value.toLowerCase();
  const selectedProduct = document.getElementById("productFilter").value;

  filteredPolicies = policies.filter(p => {
    if (selectedCategoryPath) {
      const selectedKey = selectedCategoryPath.join("||");

      // If not a real policy folder ? show nothing
      if (!policyCategorySet.has(selectedKey)) {
        return false;
      }

      // Exact category match only
      if (p.categoryPath.join("||") !== selectedKey) {
        return false;
      }
    }

    if (selectedProduct && p.product !== selectedProduct) {
      return false;
    }

    if (q && !p.displayName.toLowerCase().includes(q)) {
      return false;
    }

    return true;
  });

  renderPolicyList();
}

// ==================================================
// POLICY LIST (MIDDLE PANE)
// ==================================================
function renderPolicyList() {
  const main = document.getElementById("policyList");
  main.innerHTML = "";

  if (!selectedCategoryPath) {
    main.innerHTML = "<p>Select a category to view policies.</p>";
    return;
  }

  if (filteredPolicies.length === 0) {
    main.innerHTML = "<p>No policies in this category.</p>";
    return;
  }

  filteredPolicies.forEach(p => {
    const div = document.createElement("div");
    div.className = "policy";
    div.style.cursor = "pointer";

    div.innerHTML = `
      <strong>${p.displayName}</strong><br/>
      <small>${p.product}</small>
    `;

    div.onclick = () => showPolicyDetails(p);
    main.appendChild(div);
  });
}

// ==================================================
// POLICY DETAILS (RIGHT PANE)
// ==================================================
function showPolicyDetails(p) {
  let html = `
    <h2>${p.displayName}</h2>

    <p><strong>Description:</strong><br/>
      ${p.description || "N/A"}</p>

    <p><strong>Scope:</strong>
      ${p.policyClass === "User"
        ? "User Configuration"
        : "Computer Configuration"}</p>

    <p><strong>Category Path:</strong><br/>
      ${p.categoryPath.join(" > ")}</p>
  `;

  if (p.registry) {
    html += `
      <h3>Registry</h3>
      <p><strong>Hive:</strong> ${p.registry.hive}</p>
      <p><strong>Key:</strong><br/>${p.registry.key}</p>
      <p><strong>Value Name:</strong>
        ${p.registry.valueName || "(Default)"}</p>
      <ul>
        <li>Enabled = ${p.registry.enabledValue}</li>
        <li>Disabled = ${p.registry.disabledValue}</li>
      </ul>
    `;
  } else {
    html += `<p><strong>Registry:</strong> N/A</p>`;
  }

  html += `<p><strong>Source ADMX:</strong> ${p.sourceAdmx}</p>`;

  document.getElementById("policyDetails").innerHTML = html;
}

function clearPolicyDetails() {
  document.getElementById("policyDetails").innerHTML =
    "<p>Select a policy to see details.</p>";
}
