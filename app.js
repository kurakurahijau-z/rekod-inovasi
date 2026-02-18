// app.js (FULL REPLACE)
const cfg = window.APP_CONFIG;

function qs(sel){ return document.querySelector(sel); }
function qsa(sel){ return Array.from(document.querySelectorAll(sel)); }

function setToken(token){ localStorage.setItem("token", token); }
function getToken(){ return localStorage.getItem("token") || ""; }
function clearToken(){
  localStorage.removeItem("token");
  localStorage.removeItem("email");
  localStorage.removeItem("role");
}

function setText(sel, val){
  const el = (sel.startsWith("#") || sel.startsWith(".")) ? qs(sel) : qs("#"+sel);
  if (el) el.textContent = String(val ?? "");
}

function safeJson(r){
  return r.json().catch(() => ({ ok:false, error:"Invalid JSON response" }));
}

async function apiGet(action, params={}) {
  const url = new URL(cfg.API_BASE);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString(), { method:"GET" });
  return safeJson(r);
}

async function apiPost(action, params={}, body={}) {
  const url = new URL(cfg.API_BASE);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString(), {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });
  return safeJson(r);
}

function requireAuthOrRedirect() {
  const token = getToken();
  if (!token) location.href = "./index.html";
}

async function loadMe() {
  const token = getToken();
  const r = await apiGet("me", { token });
  if (!r.ok) { clearToken(); location.href="./index.html"; return null; }
  localStorage.setItem("email", r.email || "");
  localStorage.setItem("role", r.role || "user");
  return r;
}

// ===== Google Sign-In callback =====
async function onGoogleCredentialResponse(resp) {
  try {
    setText("#loginStatus", "Signing in…");
    const r = await apiPost("loginGoogle", {}, { credential: resp.credential });
    if (!r.ok) throw new Error(r.error || "Login failed");

    setToken(r.token);
    localStorage.setItem("email", r.email || "");
    localStorage.setItem("role", r.role || "user");

    location.href = "./dashboard.html";
  } catch (e) {
    setText("#loginStatus", "Login failed: " + e.message);
  }
}

/**
 * Kira summary secara konsisten dari array items.
 * Ini fix isu: row ada, tapi summary 0-0-0.
 */
function computeSummaryFromItems(items){
  const norm = (s) => String(s || "").trim().toLowerCase();
  const isAktif = (it) => norm(it.status) === "aktif";
  const myipoYes = (it) => {
    const ms = norm(it.myipoStatus);
    // support pelbagai format: "yes", "ya", "y", "true"
    if (["yes","ya","y","true"].includes(ms)) return true;
    // kalau backend bagi field "myipo" string macam "yes / LYC..."
    const myipo = norm(it.myipo);
    if (myipo.startsWith("yes") || myipo.startsWith("ya")) return true;
    return false;
  };

  const years = new Set(items.map(it => String(it.tahun || "").trim()).filter(Boolean));

  const total = items.length;
  const aktif = items.filter(isAktif).length;
  const yes = items.filter(myipoYes).length;
  const no = total - yes;

  return {
    total,
    yearsCount: years.size,
    aktif,
    myipoYes: yes,
    myipoNo: no
  };
}

// ===== Dashboard =====
async function dashboardInit() {
  requireAuthOrRedirect();
  const me = await loadMe();
  if (!me) return;

  setText("#meEmail", me.email || "");
  setText("#meRole", me.role || "user");

  // load list dulu, sebab kita nak kira "Bil. Tahun Terlibat" dari list
  const items = await refreshMyInnovations(true);

  // kira top cards dari list (bukan dari report)
  const sumTop = computeSummaryFromItems(items);

  // ID card yang kau mungkin ada (aku letak fallback banyak nama supaya tak pecah)
  // - jumlah inovasi
  setText("#countTotal", sumTop.total);
  setText("#totalInnovations", sumTop.total);

  // - bil. tahun terlibat (SEPATUTNYA count, bukan 2026)
  setText("#countYears", sumTop.yearsCount);
  setText("#yearsInvolved", sumTop.yearsCount);

  // - status aktif
  setText("#countAktif", sumTop.aktif);
  setText("#countActive", sumTop.aktif);

  // - myipo yes
  setText("#countMyipoYes", sumTop.myipoYes);
  setText("#countIPOYes", sumTop.myipoYes);

  // report 2026 (tetap jalan)
  await refreshReport("2026");
}

/**
 * @param {boolean} returnItems - kalau true, function akan return array items
 */
async function refreshMyInnovations(returnItems=false) {
  const token = getToken();
  const r = await apiGet("listMyInnovations", { token });

  const body = qs("#myListBody");
  if (body) body.innerHTML = "";

  const items = (r.ok && Array.isArray(r.items)) ? r.items : [];

  // kalau tiada table pun, still return items untuk kira-kira
  if (!body) return returnItems ? items : undefined;

  // jumlah inovasi
  setText("#countTotal", items.length);

  if (!items.length) {
    body.innerHTML = `<tr><td colspan="6" class="muted">Belum ada rekod inovasi.</td></tr>`;
    return returnItems ? items : undefined;
  }

  for (const it of items) {
    const myipo = `${it.myipoStatus || ""} / ${it.myipoNumber || ""}`.trim();
    body.innerHTML += `
      <tr>
        <td>${escapeHtml(it.tajuk || "")}</td>
        <td>${escapeHtml(it.tahun || "")}</td>
        <td>${escapeHtml(it.kategori || "")}</td>
        <td><span class="pill ${((String(it.status||"").toLowerCase()==="aktif")?"ok":"warn")}">${escapeHtml(it.status||"")}</span></td>
        <td>${escapeHtml(myipo)}</td>
        <td><code>${escapeHtml(it.innovationId||"")}</code></td>
      </tr>
    `;
  }

  return returnItems ? items : undefined;
}

async function refreshReport(year) {
  const token = getToken();
  const r = await apiGet("generateReport", { token, year });
  if (!r.ok) return;

  const items = Array.isArray(r.items) ? r.items : [];

  // ✅ FIX: guna kiraan dari items (bukan percaya r.summary semata-mata)
  const sum = computeSummaryFromItems(items);

  setText("#rYear", year);
  setText("#rTotal", sum.total);
  setText("#rAktif", sum.aktif);
  setText("#rMyipoYes", sum.myipoYes);
  setText("#rMyipoNo", sum.myipoNo);

  const tb = qs("#reportBody");
  if (!tb) return;

  tb.innerHTML = "";
  if (!items.length) {
    tb.innerHTML = `<tr><td colspan="4" class="muted">Tiada rekod untuk tahun ${escapeHtml(String(year))}.</td></tr>`;
    return;
  }

  for (const it of items) {
    // support kalau backend bagi myipo siap siap
    const myipo = it.myipo ?? `${it.myipoStatus || ""} / ${it.myipoNumber || ""}`.trim();

    tb.innerHTML += `
      <tr>
        <td>${escapeHtml(it.tajuk||"")}</td>
        <td>${escapeHtml(it.kategori||"")}</td>
        <td>${escapeHtml(it.status||"")}</td>
        <td>${escapeHtml(myipo||"")}</td>
      </tr>
    `;
  }
}

function doPrint() { window.print(); }

function doLogout() {
  clearToken();
  location.href = "./index.html";
}

// ===== Add Innovation =====
async function addInnovationInit() {
  requireAuthOrRedirect();
  const me = await loadMe();
  if (!me) return;
  setText("#meEmail", me.email || "");
}

async function submitInnovation(e) {
  e.preventDefault();
  const token = getToken();

  const payload = {
    tajuk: qs("#tajuk")?.value?.trim() || "",
    tahun: qs("#tahun")?.value?.trim() || "",
    kategori: qs("#kategori")?.value?.trim() || "",
    status: qs("#status")?.value?.trim() || "",
    myipoStatus: qs("#myipoStatus")?.value?.trim() || "",
    myipoNumber: qs("#myipoNumber")?.value?.trim() || ""
  };

  setText("#saveMsg", "Saving…");
  const r = await apiPost("addInnovation", { token }, payload);
  if (!r.ok) {
    setText("#saveMsg", "Gagal: " + (r.error || ""));
    return;
  }
  setText("#saveMsg", "Berjaya simpan ✅");
  setTimeout(()=> location.href="./dashboard.html", 600);
}

// ===== util =====
function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}
