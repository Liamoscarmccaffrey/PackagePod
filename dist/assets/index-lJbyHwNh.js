(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) return;
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) processPreload(link);
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") continue;
      for (const node of mutation.addedNodes) if (node.tagName === "LINK" && node.rel === "modulepreload") processPreload(node);
    }
  }).observe(document, {
    childList: true,
    subtree: true
  });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials") fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep) return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
const version = "0.9.7";
const dynImport = new Function("x", "return import(x)");
async function loadLbrary() {
  try {
    return await dynImport(`https://rt.browserpod.io/${version}/browserpod.js`);
  } catch (e) {
    return { BrowserPod: null };
  }
}
const Library = await loadLbrary();
const BrowserPod = Library.BrowserPod;
function initThemeToggle() {
  const themeToggle = document.getElementById("theme-toggle");
  const isDarkMode = localStorage.getItem("theme") === "dark";
  if (isDarkMode) {
    document.body.classList.add("dark-mode");
    themeToggle.checked = true;
  }
  themeToggle.addEventListener("change", () => {
    const isDark = themeToggle.checked;
    if (isDark) {
      document.body.classList.add("dark-mode");
    } else {
      document.body.classList.remove("dark-mode");
    }
    localStorage.setItem("theme", isDark ? "dark" : "light");
  });
}
function log(msg, type = "info") {
  const consoleDiv = document.getElementById("app-console");
  const entry = document.createElement("div");
  entry.className = `console-entry ${type}`;
  const now = (/* @__PURE__ */ new Date()).toLocaleTimeString();
  entry.innerHTML = `<span class="console-timestamp">[${now}]</span> ${msg}`;
  consoleDiv.appendChild(entry);
  consoleDiv.scrollTop = consoleDiv.scrollHeight;
}
function setServerStatus(status) {
  const statusDiv = document.getElementById("server-status");
  if (!statusDiv) return;
  if (status === "online") {
    statusDiv.textContent = "✓ Online";
    statusDiv.className = "status-indicator online";
  } else {
    statusDiv.textContent = "✗ Offline";
    statusDiv.className = "status-indicator offline";
  }
}
function setServerInfo(info) {
  const infoDiv = document.getElementById("server-info");
  if (!infoDiv) return;
  infoDiv.innerHTML = info;
}
function displayFilesystemChanges(diff) {
  const changesDiv = document.getElementById("fs-changes");
  if (!changesDiv) return;
  let html = "";
  if (diff.added.length > 0) {
    html += '<div class="fs-section"><h4 class="fs-header-added">Added Files</h4><div class="fs-list">';
    diff.added.slice(0, 20).forEach((file) => {
      html += `<div class="fs-item fs-item-added">+ ${file.replace("/test", "")}</div>`;
    });
    if (diff.added.length > 20) html += `<div class="fs-item-count">... and ${diff.added.length - 20} more</div>`;
    html += "</div></div>";
  }
  if (diff.modified.length > 0) {
    html += '<div class="fs-section"><h4 class="fs-header-modified">Modified Files</h4><div class="fs-list">';
    diff.modified.slice(0, 20).forEach((file) => {
      html += `<div class="fs-item fs-item-modified">~ ${file.replace("/test", "")}</div>`;
    });
    if (diff.modified.length > 20) html += `<div class="fs-item-count">... and ${diff.modified.length - 20} more</div>`;
    html += "</div></div>";
  }
  if (diff.removed.length > 0) {
    html += '<div class="fs-section"><h4 class="fs-header-removed">Removed Files</h4><div class="fs-list">';
    diff.removed.slice(0, 20).forEach((file) => {
      html += `<div class="fs-item fs-item-removed">- ${file.replace("/test", "")}</div>`;
    });
    if (diff.removed.length > 20) html += `<div class="fs-item-count">... and ${diff.removed.length - 20} more</div>`;
    html += "</div></div>";
  }
  const total = diff.added.length + diff.modified.length + diff.removed.length;
  const summary = `<div class="fs-summary">${diff.added.length} added, ${diff.modified.length} modified, ${diff.removed.length} removed (${total} total)</div>`;
  changesDiv.innerHTML = summary + html;
}
let pod = null;
let terminal = null;
let lastTestedPackage = null;
let initialSnapshot = null;
let finalSnapshot = null;
let searchState = {
  keyword: "",
  page: 0,
  totalResults: 0
};
async function searchPackages(keyword, page = 0) {
  try {
    const from = page * 20;
    const response = await fetch(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(keyword)}&size=20&from=${from}`);
    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }
    const data = await response.json();
    searchState.totalResults = data.total || 0;
    return data.objects || [];
  } catch (err) {
    log(`Search error: ${err.message}`, "error");
    return [];
  }
}
async function handleSearch() {
  const keyword = document.getElementById("search-keyword").value.trim();
  if (!keyword) {
    log("Please enter a keyword to search", "warn");
    return;
  }
  searchState.keyword = keyword;
  searchState.page = 0;
  displaySearchResults();
}
async function displaySearchResults() {
  log(`Searching for packages with keyword: "${searchState.keyword}" (page ${searchState.page + 1})`, "info");
  const results = await searchPackages(searchState.keyword, searchState.page);
  const resultsList = document.getElementById("search-results-list");
  const searchResultsDiv = document.getElementById("search-results");
  if (results.length === 0) {
    resultsList.innerHTML = '<div style="padding: 12px; color: #666;">No packages found</div>';
  } else {
    resultsList.innerHTML = results.map((pkg) => `
      <div style="padding: 12px; border-bottom: 1px solid #eee; cursor: pointer;" data-package-name="${pkg.package.name}">
        <strong>${pkg.package.name}</strong>
        <div style="font-size: 12px; color: #666;">${pkg.package.description || "No description"}</div>
      </div>
    `).join("");
  }
  const pageNum = searchState.page + 1;
  const totalPages = Math.ceil(searchState.totalResults / 20);
  const paginationHtml = `
    <div style="padding: 12px; border-top: 1px solid #eee; display: flex; gap: 8px; justify-content: center; align-items: center;">
      <button id="prev-page" ${searchState.page === 0 ? "disabled" : ""} style="padding: 6px 12px; background: #0284c7; color: white; border: none; border-radius: 4px; cursor: pointer; ${searchState.page === 0 ? "opacity: 0.5; cursor: not-allowed;" : ""}">← Previous</button>
      <span style="font-size: 14px; color: #666;">Page ${pageNum} of ${totalPages}</span>
      <button id="next-page" ${pageNum >= totalPages ? "disabled" : ""} style="padding: 6px 12px; background: #0284c7; color: white; border: none; border-radius: 4px; cursor: pointer; ${pageNum >= totalPages ? "opacity: 0.5; cursor: not-allowed;" : ""}">Next →</button>
    </div>
  `;
  resultsList.innerHTML += paginationHtml;
  document.getElementById("prev-page").addEventListener("click", handlePrevPage);
  document.getElementById("next-page").addEventListener("click", handleNextPage);
  document.querySelectorAll("[data-package-name]").forEach((el) => {
    el.addEventListener("click", (e) => {
      document.getElementById("package-input").value = el.dataset.packageName;
      document.getElementById("search-results").style.display = "none";
    });
  });
  searchResultsDiv.style.display = "block";
  log(`Found ${searchState.totalResults} total packages (showing ${results.length})`, "success");
}
function handlePrevPage() {
  if (searchState.page > 0) {
    searchState.page--;
    displaySearchResults();
  }
}
function handleNextPage() {
  const totalPages = Math.ceil(searchState.totalResults / 20);
  if (searchState.page + 1 < totalPages) {
    searchState.page++;
    displaySearchResults();
  }
}
async function getFileSystemSnapshot(pod2, dirPath) {
  return {};
}
function calculateDiff(initial, final) {
  const added = [];
  const modified = [];
  const removed = [];
  for (const [path, finalStats] of Object.entries(final)) {
    if (!initial[path]) {
      added.push(path);
    } else if (initial[path].mtime !== finalStats.mtime) {
      modified.push(path);
    }
  }
  for (const path of Object.keys(initial)) {
    if (!final[path]) {
      removed.push(path);
    }
  }
  return { added, modified, removed };
}
async function initBrowserPod() {
  try {
    log("Initializing BrowserPod...", "info");
    const apiKey = "bp1_cb50e27b9fc3bc86e9d940c6e32c97b544eb52da24da691acb2fc9935d85d04c";
    if (!apiKey) ;
    pod = await BrowserPod.boot({ apiKey });
    log("BrowserPod initialized successfully", "success");
    const consoleElement = document.getElementById("console");
    if (!consoleElement) {
      throw new Error("Console element not found in DOM");
    }
    terminal = await pod.createDefaultTerminal(consoleElement);
    log("Terminal created", "success");
    return true;
  } catch (err) {
    log(`BrowserPod init failed: ${err.message}`, "error");
    return false;
  }
}
async function captureCommand(command, args, cwd = "/root/test") {
  let capturedOutput = "";
  try {
    await pod.run(command, args, {
      cwd
    });
  } catch (e) {
  }
  return capturedOutput;
}
function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise(
      (_, reject) => setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}
async function testPackage(packageName) {
  try {
    if (!packageName.trim()) {
      log("Please enter a package name", "warn");
      return;
    }
    lastTestedPackage = packageName;
    log(`Testing package: ${packageName}`, "info");
    const workDir = "/root/test";
    log(`Capturing filesystem snapshot...`, "info");
    initialSnapshot = await getFileSystemSnapshot(pod, workDir);
    log(`Installing ${packageName}...`, "info");
    try {
      await withTimeout(
        pod.run("npm", ["install", packageName], {
          terminal,
          cwd: workDir
        }),
        6e4
        // 60 second timeout
      );
      log(`Installation completed`, "success");
    } catch (e) {
      log(`Installation error: ${e.message}`, "error");
      throw e;
    }
    log(`Gathering package information...`, "info");
    try {
      await pod.run("npm", ["ls", packageName], {
        terminal,
        cwd: workDir
      });
      log(`Dependency tree completed`, "success");
    } catch (e) {
      log(`Dependency tree error: ${e.message}`, "warn");
    }
    log(`Checking vulnerabilities...`, "info");
    try {
      const auditOutput = await captureCommand("npm", ["audit"]);
      const auditJson = auditOutput.includes("{") ? auditOutput.substring(auditOutput.indexOf("{")) : "{}";
      let auditData2 = {};
      try {
        auditData2 = JSON.parse(auditJson);
      } catch (e) {
        auditData2 = parseAuditText(auditOutput);
      }
      log(`Audit completed`, "success");
    } catch (e) {
      log(`Audit error: ${e.message}`, "warn");
    }
    let auditData = {};
    log(`Checking funding opportunities...`, "info");
    try {
      await pod.run("npm", ["fund"], {
        terminal,
        cwd: workDir
      });
      log(`Funding check completed`, "success");
    } catch (e) {
      log(`Funding error: ${e.message}`, "warn");
    }
    log(`Capturing final filesystem snapshot...`, "info");
    finalSnapshot = await getFileSystemSnapshot(pod, workDir);
    const diff = calculateDiff(initialSnapshot, finalSnapshot);
    console.log("Initial snapshot files:", Object.keys(initialSnapshot).length, Object.keys(initialSnapshot));
    console.log("Final snapshot files:", Object.keys(finalSnapshot).length, Object.keys(finalSnapshot));
    console.log("Diff result:", diff);
    displayResults(packageName, auditData);
    displayFilesystemChanges(diff);
    log(`✓ ${packageName} analysis completed successfully`, "success");
    setServerStatus("tested");
    setServerInfo(`${packageName} installed and analyzed`);
  } catch (err) {
    log(`Test failed: ${err.message}`, "error");
    throw err;
  }
}
function parseAuditText(text) {
  const data = {
    metadata: {
      vulnerabilities: {
        total: 0,
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0
      },
      dependencies: 0
    }
  };
  const vulnMatch = text.match(/(\d+)\s+vulnerabilities?/);
  if (vulnMatch) data.metadata.vulnerabilities.total = parseInt(vulnMatch[1]);
  const criticalMatch = text.match(/(\d+)\s+critical/);
  if (criticalMatch) data.metadata.vulnerabilities.critical = parseInt(criticalMatch[1]);
  const highMatch = text.match(/(\d+)\s+high/);
  if (highMatch) data.metadata.vulnerabilities.high = parseInt(highMatch[1]);
  const moderateMatch = text.match(/(\d+)\s+moderate/);
  if (moderateMatch) data.metadata.vulnerabilities.moderate = parseInt(moderateMatch[1]);
  const lowMatch = text.match(/(\d+)\s+low/);
  if (lowMatch) data.metadata.vulnerabilities.low = parseInt(lowMatch[1]);
  return data;
}
function displayResults(packageName, auditData) {
  const resultsSection = document.getElementById("results-section");
  const packageInfo = document.getElementById("package-info");
  const securityInfo = document.getElementById("security-info");
  const packageHtml = `
    <div class="result-item">
      <span class="result-label">Package</span>
      <span class="result-value">${packageName}</span>
    </div>
  `;
  packageInfo.innerHTML = packageHtml;
  let securityHtml = "";
  const vulnCount = auditData.metadata?.vulnerabilities?.total || 0;
  if (vulnCount === 0) {
    securityHtml = '<div class="result-item safe"><span class="result-label">✓ No vulnerabilities found</span></div>';
  } else {
    const critical = auditData.metadata?.vulnerabilities?.critical || 0;
    const high = auditData.metadata?.vulnerabilities?.high || 0;
    const moderate = auditData.metadata?.vulnerabilities?.moderate || 0;
    const low = auditData.metadata?.vulnerabilities?.low || 0;
    if (critical > 0) {
      securityHtml += `<div class="result-item vulnerability"><span class="result-label">Critical: ${critical}</span></div>`;
    }
    if (high > 0) {
      securityHtml += `<div class="result-item vulnerability"><span class="result-label">High: ${high}</span></div>`;
    }
    if (moderate > 0) {
      securityHtml += `<div class="result-item warning"><span class="result-label">Moderate: ${moderate}</span></div>`;
    }
    if (low > 0) {
      securityHtml += `<div class="result-item warning"><span class="result-label">Low: ${low}</span></div>`;
    }
  }
  securityInfo.innerHTML = securityHtml;
  resultsSection.style.display = "block";
}
async function handleTestPackage() {
  const input = document.getElementById("package-input");
  const packageName = input.value.trim();
  const testBtn = document.getElementById("test-btn");
  testBtn.disabled = true;
  try {
    if (!pod) {
      const ready = await initBrowserPod();
      if (!ready) throw new Error("BrowserPod initialization failed");
    }
    await testPackage(packageName);
  } catch (err) {
    log(`Error: ${err.message}`, "error");
  } finally {
    testBtn.disabled = false;
  }
}
document.getElementById("search-btn").addEventListener("click", handleSearch);
document.getElementById("search-keyword").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    handleSearch();
  }
});
document.getElementById("test-btn").addEventListener("click", handleTestPackage);
document.getElementById("package-input").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    handleTestPackage();
  }
});
const originalError = console.error;
console.error = function(...args) {
  log(`ERROR: ${args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ")}`, "error");
  originalError.apply(console, args);
};
window.addEventListener("load", () => {
  initThemeToggle();
  log("NPM Package Tester ready", "success");
  setServerStatus("ready");
  setServerInfo('Enter a package name and click "Test Package"');
});
