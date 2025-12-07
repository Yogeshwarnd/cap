// ---------- Shared helpers (data storage) ----------

function loadPoints() {
  try {
    const raw = localStorage.getItem("busPoints");
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function savePoints(points) {
  localStorage.setItem("busPoints", JSON.stringify(points));
}

// Point structure: { id: string, x: number, y: number }

// Euclidean distance
function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ---------- Module 1: Data collection & scatter preview ----------

function initModule1() {
  const form = document.getElementById("point-form");
  const tbody = document.getElementById("pointsTableBody");
  const summary = document.getElementById("pointsSummary");
  const clearBtn = document.getElementById("clearPoints");
  const canvas = document.getElementById("pointsCanvas");
  const ctx = canvas ? canvas.getContext("2d") : null;

  let points = loadPoints();

  function renderTable() {
    if (!tbody) return;
    tbody.innerHTML = "";
    points.forEach((p, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${p.id}</td>
        <td>${p.x}</td>
        <td>${p.y}</td>
        <td><button data-idx="${i}" class="btn danger small btn-delete">Delete</button></td>
      `;
      tbody.appendChild(tr);
    });
    if (summary) {
      summary.textContent =
        points.length === 0
          ? "No points added yet. Add at least 3–4 points for good clustering."
          : `${points.length} points in dataset. Data is shared across all modules via localStorage.`;
    }
  }

  function renderScatter() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (points.length === 0) {
      ctx.fillStyle = "#64748b";
      ctx.font = "14px system-ui";
      ctx.fillText("No points to display. Add some points above.", 20, canvas.height / 2);
      return;
    }

    // Determine bounds
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const padding = 30;
    const w = canvas.width - 2 * padding;
    const h = canvas.height - 2 * padding;

    function project(p) {
      const nx = (p.x - minX) / (maxX - minX || 1);
      const ny = (p.y - minY) / (maxY - minY || 1);
      // invert y for canvas
      return {
        px: padding + nx * w,
        py: padding + (1 - ny) * h
      };
    }

    // Axes
    ctx.strokeStyle = "rgba(148,163,184,0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();

    // Points
    ctx.fillStyle = "#38bdf8";
    ctx.font = "11px system-ui";
    points.forEach(p => {
      const { px, py } = project(p);
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(p.id, px + 6, py - 6);
    });
  }

  function addPointFromForm(e) {
    e.preventDefault();
    const idInput = document.getElementById("idInput");
    const xInput = document.getElementById("xInput");
    const yInput = document.getElementById("yInput");
    if (!idInput || !xInput || !yInput) return;

    const id = idInput.value.trim() || `P${points.length + 1}`;
    const x = parseFloat(xInput.value);
    const y = parseFloat(yInput.value);
    if (Number.isNaN(x) || Number.isNaN(y)) return;

    points.push({ id, x, y });
    savePoints(points);
    renderTable();
    renderScatter();

    idInput.value = "";
    xInput.value = "";
    yInput.value = "";
  }

  function handleTableClick(e) {
    const target = e.target;
    if (target.classList.contains("btn-delete")) {
      const idx = parseInt(target.getAttribute("data-idx"), 10);
      if (!Number.isNaN(idx)) {
        points.splice(idx, 1);
        savePoints(points);
        renderTable();
        renderScatter();
      }
    }
  }

  function clearAll() {
    if (!confirm("Clear all points from the dataset?")) return;
    points = [];
    savePoints(points);
    renderTable();
    renderScatter();
  }

  if (form) form.addEventListener("submit", addPointFromForm);
  if (tbody) tbody.addEventListener("click", handleTableClick);
  if (clearBtn) clearBtn.addEventListener("click", clearAll);

  renderTable();
  renderScatter();
}

// ---------- Module 2: Closest pair & clustering tree ----------

// Simple O(n^2) closest pair (good enough for typical input sizes)
function closestPair(points) {
  if (points.length < 2) return null;
  let best = Infinity;
  let pair = null;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = dist(points[i], points[j]);
      if (d < best) {
        best = d;
        pair = [points[i], points[j]];
      }
    }
  }
  return { pair, distance: best };
}

// Agglomerative clustering (average-linkage)
function agglomerativeClustering(points) {
  if (points.length === 0) return { steps: [], root: null };

  // initial clusters: each point alone
  let clusters = points.map((p, idx) => ({
    id: `C${idx + 1}`,
    members: [idx],
    left: null,
    right: null,
    height: 0
  }));

  const steps = [];

  function clusterDistance(c1, c2) {
    let sum = 0;
    let count = 0;
    for (const i of c1.members) {
      for (const j of c2.members) {
        sum += dist(points[i], points[j]);
        count++;
      }
    }
    return sum / (count || 1);
  }

  let counter = clusters.length + 1;

  while (clusters.length > 1) {
    let best = Infinity;
    let bestI = 0;
    let bestJ = 1;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = clusterDistance(clusters[i], clusters[j]);
        if (d < best) {
          best = d;
          bestI = i;
          bestJ = j;
        }
      }
    }

    const a = clusters[bestI];
    const b = clusters[bestJ];
    const merged = {
      id: `C${counter++}`,
      members: [...a.members, ...b.members],
      left: a,
      right: b,
      height: best
    };

    steps.push({
      mergedId: merged.id,
      left: a.id,
      right: b.id,
      distance: best,
      size: merged.members.length
    });

    const remaining = [];
    for (let i = 0; i < clusters.length; i++) {
      if (i !== bestI && i !== bestJ) remaining.push(clusters[i]);
    }
    remaining.push(merged);
    clusters = remaining;
  }

  return { steps, root: clusters[0] };
}

function formatClusterTree(node, level, points) {
  const indent = "  ".repeat(level);
  if (!node.left && !node.right) {
    const pLabel = node.members
      .map(idx => points[idx].id || `P${idx + 1}`)
      .join(", ");
    return `${indent}- ${node.id} [leaf] → {${pLabel}}\n`;
  }
  let s = `${indent}- ${node.id} (size=${node.members.length}, height=${node.height.toFixed(
    2
  )})\n`;
  if (node.left) s += formatClusterTree(node.left, level + 1, points);
  if (node.right) s += formatClusterTree(node.right, level + 1, points);
  return s;
}

function initModule2() {
  const info = document.getElementById("m2DataInfo");
  const closestBtn = document.getElementById("runClosestPair");
  const closestDiv = document.getElementById("closestPairResult");
  const clusterBtn = document.getElementById("runClustering");
  const clusterSummary = document.getElementById("clusterSummary");
  const clusterTree = document.getElementById("clusterTree");

  const points = loadPoints();

  if (info) {
    info.textContent =
      points.length === 0
        ? "No data found. Please go to Module 1 and add points."
        : `Loaded ${points.length} points from Module 1.`;
  }

  if (closestBtn) {
    closestBtn.addEventListener("click", () => {
      if (points.length < 2) {
        closestDiv.textContent = "Need at least 2 points to find closest pair.";
        return;
      }
      const res = closestPair(points);
      if (!res || !res.pair) {
        closestDiv.textContent = "Could not compute closest pair.";
        return;
      }
      const [p1, p2] = res.pair;
      closestDiv.innerHTML = `
        <p><strong>Closest Pair:</strong> ${p1.id} (${p1.x}, ${p1.y}) and ${p2.id} (${p2.x}, ${p2.y})</p>
        <p><strong>Distance:</strong> ${res.distance.toFixed(3)} units</p>
        <p class="muted">Algorithm: distance computation for every pair (O(n²)), conceptually part of divide-and-conquer spatial analysis.</p>
      `;
    });
  }

  if (clusterBtn) {
    clusterBtn.addEventListener("click", () => {
      if (points.length === 0) {
        clusterSummary.textContent = "No points to cluster. Add data in Module 1.";
        return;
      }
      const { steps, root } = agglomerativeClustering(points);
      if (!root) {
        clusterSummary.textContent = "Clustering failed.";
        return;
      }

      clusterSummary.innerHTML = `
        <p><strong>Merge Steps:</strong> ${steps.length}</p>
        <p><strong>Final Root Cluster:</strong> ${root.id}, covering ${root.members.length} points.</p>
      `;

      let treeText = "Clustering Tree (top = final merged cluster)\n\n";
      treeText += formatClusterTree(root, 0, points);
      clusterTree.textContent = treeText;

      // Persist root cluster structure for Module 3 (optional: just store raw points; here we store only points & let M3 run k-means).
      // For simplicity, Module 3 will run its own K-means-style clustering.
    });
  }
}

// ---------- Module 3: Bus stop placement & evaluation ----------

// Simple K-means-style clustering for bus stop locations
function kMeans(points, k, maxIter = 50) {
  if (points.length === 0 || k <= 0) return [];

  // Clamp k to number of points
  k = Math.min(k, points.length);

  // Initialize centroids: first k points
  let centroids = [];
  for (let i = 0; i < k; i++) {
    centroids.push({ x: points[i].x, y: points[i].y });
  }

  let assignments = new Array(points.length).fill(0);

  function recomputeCentroids() {
    const sums = Array.from({ length: k }, () => ({ x: 0, y: 0, count: 0 }));
    points.forEach((p, idx) => {
      const c = assignments[idx];
      sums[c].x += p.x;
      sums[c].y += p.y;
      sums[c].count += 1;
    });
    centroids = sums.map((s, i) =>
      s.count === 0
        ? centroids[i] // keep old centroid if empty
        : { x: s.x / s.count, y: s.y / s.count }
    );
  }

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    // Assign step
    for (let i = 0; i < points.length; i++) {
      let bestC = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = Math.hypot(points[i].x - centroids[c].x, points[i].y - centroids[c].y);
        if (d < bestD) {
          bestD = d;
          bestC = c;
        }
      }
      if (assignments[i] !== bestC) {
        assignments[i] = bestC;
        changed = true;
      }
    }
    recomputeCentroids();
    if (!changed) break;
  }

  // Build clusters
  const clusters = Array.from({ length: k }, () => ({
    members: [],
    centroid: { x: 0, y: 0 }
  }));
  points.forEach((p, idx) => {
    const c = assignments[idx];
    clusters[c].members.push(idx);
  });
  clusters.forEach((cl, i) => {
    cl.centroid = centroids[i];
  });
  return clusters;
}

function initModule3() {
  const points = loadPoints();
  const kInput = document.getElementById("kClusters");
  const maxWalkInput = document.getElementById("maxWalk");
  const btn = document.getElementById("runPlacement");
  const stopsBody = document.getElementById("stopsTableBody");
  const evalDiv = document.getElementById("evalMetrics");
  const canvas = document.getElementById("clusterCanvas");
  const ctx = canvas ? canvas.getContext("2d") : null;

  function drawClusters(clusters) {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!clusters || clusters.length === 0 || points.length === 0) {
      ctx.fillStyle = "#64748b";
      ctx.font = "14px system-ui";
      ctx.fillText("No clusters yet. Run placement to visualize.", 20, canvas.height / 2);
      return;
    }

    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const padding = 30;
    const w = canvas.width - 2 * padding;
    const h = canvas.height - 2 * padding;

    function project(p) {
      const nx = (p.x - minX) / (maxX - minX || 1);
      const ny = (p.y - minY) / (maxY - minY || 1);
      return {
        px: padding + nx * w,
        py: padding + (1 - ny) * h
      };
    }

    // Some cluster colors
    const colors = [
      "#38bdf8",
      "#a855f7",
      "#f97316",
      "#22c55e",
      "#eab308",
      "#ec4899",
      "#0ea5e9"
    ];

    // Draw cluster points
    clusters.forEach((cl, idx) => {
      const color = colors[idx % colors.length];
      ctx.fillStyle = color;
      ctx.font = "11px system-ui";
      cl.members.forEach(pIdx => {
        const p = points[pIdx];
        const { px, py } = project(p);
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText(p.id, px + 6, py - 6);
      });
    });

    // Draw centroids
    clusters.forEach((cl, idx) => {
      const color = colors[idx % colors.length];
      const { px, py } = project(cl.centroid);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.font = "11px system-ui";
      ctx.fillText(`Stop ${idx + 1}`, px + 8, py + 4);
    });
  }

  function runPlacement() {
    if (points.length === 0) {
      evalDiv.textContent = "No points available. Please add data in Module 1.";
      if (stopsBody) stopsBody.innerHTML = "";
      drawClusters([]);
      return;
    }

    const k = Math.max(1, parseInt(kInput.value || "1", 10));
    const maxWalk = Math.max(0, parseFloat(maxWalkInput.value || "0"));

    const clusters = kMeans(points, k);
    if (!clusters || clusters.length === 0) {
      evalDiv.textContent = "Clustering failed.";
      return;
    }

    // Fill stops table
    if (stopsBody) {
      stopsBody.innerHTML = "";
      clusters.forEach((cl, i) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${i + 1}</td>
          <td>${cl.members.length}</td>
          <td>${cl.centroid.x.toFixed(2)}</td>
          <td>${cl.centroid.y.toFixed(2)}</td>
        `;
        stopsBody.appendChild(tr);
      });
    }

    // Evaluation metrics
    let totalDist = 0;
    let covered = 0;
    let maxD = 0;

    clusters.forEach(cl => {
      cl.members.forEach(idx => {
        const p = points[idx];
        const d = dist(p, cl.centroid);
        totalDist += d;
        if (d > maxD) maxD = d;
        if (d <= maxWalk) covered++;
      });
    });

    const n = points.length;
    const avgDist = n > 0 ? totalDist / n : 0;
    const coveragePct = n > 0 ? (covered / n) * 100 : 0;

    evalDiv.innerHTML = `
      <p><strong>Total Points (Students/Houses):</strong> ${n}</p>
      <p><strong>Number of Bus Stops (K):</strong> ${clusters.length}</p>
      <p><strong>Average Walking Distance:</strong> ${avgDist.toFixed(2)} units</p>
      <p><strong>Max Walking Distance:</strong> ${maxD.toFixed(2)} units</p>
      <p><strong>Coverage Within ${maxWalk.toFixed(2)} units:</strong> ${covered} / ${n} (${coveragePct.toFixed(1)}%)</p>
      <p class="muted">
        Interpretation: Higher K usually reduces average distance and increases coverage,
        but implies more bus stops and operational cost. Your aim is to find a K that
        balances user comfort and cost.
      </p>
    `;

    drawClusters(clusters);
  }

  if (btn) btn.addEventListener("click", runPlacement);

  // Initial canvas message
  drawClusters([]);
}

// ---------- Entry point ----------

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.getAttribute("data-page");
  if (page === "module1") {
    initModule1();
  } else if (page === "module2") {
    initModule2();
  } else if (page === "module3") {
    initModule3();
  }
});
