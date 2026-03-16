/* =====================================================
   ADMX GUIDE – PRODUCTION FRONTEND
   Stable, scalable, and optimized
   ===================================================== */

if (typeof APP_ID === "undefined") {
  throw new Error("APP_ID variable missing in application page.");
}

const DATA_PATH = `../Data/${APP_ID}`;

let policies = [];
let searchIndex = [];
let selectedCategoryPath = null;
let currentPolicy = null;
let debounceTimer = null;


/* ================= DOM READY ================= */

document.addEventListener("DOMContentLoaded", () => {

  initializeSearch();
  loadPolicies();

});


/* ================= LOAD POLICIES ================= */

function loadPolicies() {

  fetch(`${DATA_PATH}/policies.json`)
    .then(res => {
      if (!res.ok) throw new Error("Failed to load policies.json");
      return res.json();
    })
    .then(data => {

      policies = data.policies || [];

      if (!policies.length) {
        showError("No policies found in dataset.");
        return;
      }

      buildSearchIndex();

      buildCategoryTree();
      renderPolicyList();
      handleInitialRoute();
      initializeTreeControls();

    })
    .catch(err => {

      console.error("Policy load error:", err);
      showError("Failed to load policy database.");

    });

}


/* ================= SEARCH INDEX ================= */

function buildSearchIndex() {

  searchIndex = policies.map(p => ({

    policy: p,

    text: [
      p.displayName,
      p.description,
      p.registry?.key,
      ...(p.registry?.values?.map(v => v.valueName) || []),
      ...(p.registry?.values?.flatMap(v => v.possibleValues || []) || []),
      ...(p.categoryPath || [])
    ]
      .join(" ")
      .toLowerCase()

  }));

}


/* ================= SEARCH ================= */

function initializeSearch() {

  const input = document.getElementById("searchInput");

  if (!input) {
    console.warn("Search input not found.");
    return;
  }

  input.addEventListener("input", () => {

    clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {

      selectedCategoryPath = null;
      renderPolicyList();

    }, 120);

  });

}


/* ================= ERROR DISPLAY ================= */

function showError(msg) {

  const el = document.getElementById("policyList");
  if (!el) return;

  el.innerHTML = `<p style="color:red;padding:12px">${msg}</p>`;

}


/* ================= CATEGORY TREE ================= */

function buildCategoryTree() {

  const tree = {};

  policies.forEach(p => {

    let node = tree;

    (p.categoryPath || []).forEach(cat => {

      if (!node[cat]) node[cat] = {};
      node = node[cat];

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


/* ================= POLICY LIST ================= */

function renderPolicyList() {

  const list = document.getElementById("policyList");
  if (!list) return;

  list.innerHTML = "";

  const query =
    document.getElementById("searchInput")?.value?.trim().toLowerCase();

  let filtered = [];

  if (query) {

    filtered = searchIndex
      .map(item => {

        if (!item.text.includes(query)) return null;

        let score = 0;

        const name = item.policy.displayName.toLowerCase();

        if (name.includes(query)) score += 10;

        if (item.policy.description?.toLowerCase().includes(query))
          score += 5;

        if (item.policy.registry?.key?.toLowerCase().includes(query))
          score += 4;

        if (item.policy.categoryPath
            ?.join(" ")
            .toLowerCase()
            .includes(query))
          score += 3;

        return { policy: item.policy, score };

      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .map(item => item.policy);

  } else {

    if (!selectedCategoryPath) {

      list.innerHTML = "<p>Select a category or search.</p>";
      return;

    }

    filtered = policies.filter(p =>

      p.categoryPath
        .slice(0, selectedCategoryPath.length)
        .join("||") === selectedCategoryPath.join("||")

    );

  }

  if (!filtered.length) {

    list.innerHTML = "<p>No matching policies found.</p>";
    return;

  }

  filtered.forEach(p => {

    const div = document.createElement("div");
    div.className = "policy";

    let title = p.displayName;

    if (query) {

      const regex = new RegExp(`(${query})`, "ig");

      title = title.replace(
        regex,
        `<span class="search-highlight">$1</span>`
      );

    }

    div.innerHTML = `<strong>${title}</strong>`;

    div.onclick = () => {

      history.pushState({}, "", `#${p.policyId}`);

      showPolicyDetails(p);

    };

    list.appendChild(div);

  });

}


/* ================= POLICY DETAILS ================= */

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

    (p.registry.values || []).forEach(v => {

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


/* ================= COPY MENU ================= */

function initializeCopyMenu() {

  const btn = document.getElementById("copyToggle");
  const menu = document.getElementById("copyMenu");

  if (!btn || !menu) return;

  menu.style.display = "none";

  btn.onclick = e => {

    e.stopPropagation();

    menu.style.display =
      menu.style.display === "block" ? "none" : "block";

  };

  menu.querySelectorAll("div").forEach(item => {

    item.onclick = e => {

      e.stopPropagation();

      copyOption(item.dataset.copy);

      menu.style.display = "none";

    };

  });

}

document.addEventListener("click", () => {

  const menu = document.getElementById("copyMenu");

  if (menu) menu.style.display = "none";

});


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

  navigator.clipboard.writeText(text);

}


/* ================= ROUTING ================= */

function handleInitialRoute() {

  const id = window.location.hash.replace("#", "");

  if (!id) return;

  const policy = policies.find(p => p.policyId === id);

  if (!policy) return;

  selectedCategoryPath = policy.categoryPath;

  expandCategoryPath(policy.categoryPath);

  renderPolicyList();

  showPolicyDetails(policy);

}

window.addEventListener("popstate", handleInitialRoute);


/* ================= TREE CONTROLS ================= */

function initializeTreeControls() {

  const expandBtn = document.getElementById("expandAll");
  const collapseBtn = document.getElementById("collapseAll");

  if (expandBtn) {

    expandBtn.onclick = () => {

      document.querySelectorAll(".tree-node").forEach(node => {

        node.classList.add("expanded");

        const toggle = node.querySelector(".tree-toggle");

        if (toggle && toggle.textContent !== "")
          toggle.textContent = "−";

      });

    };

  }

  if (collapseBtn) {

    collapseBtn.onclick = () => {

      document.querySelectorAll(".tree-node").forEach(node => {

        node.classList.remove("expanded");

        const toggle = node.querySelector(".tree-toggle");

        if (toggle && toggle.textContent !== "")
          toggle.textContent = "+";

      });

    };

  }

}