// app.js
const cfg = window.APP_CONFIG;

function qs(sel){ return document.querySelector(sel); }

function setToken(token){ localStorage.setItem("token", token); }
function getToken(){ return localStorage.getItem("token") || ""; }
function clearToken(){
  localStorage.removeItem("token");
  localStorage.removeItem("email");
  localStorage.removeItem("role");
}

async function apiGet(action, params={}) {
  const url = new URL(cfg.API_BASE);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString(), { method:"GET" });
  const t = await r.text();
  try { return JSON.parse(t); }
  catch { return { ok:false, error:"Invalid JSON from server", raw:t }; }
}

/**
 * CORS-safe POST (avoid preflight)
 */
async function apiPost(action, params={}, body={}) {
  const url = new URL(cfg.API_BASE);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));

  const r = await fetch(url.toString(), {
    method:"POST",
    headers:{ "Content-Type":"text/plain;charset=utf-8" },
    body: JSON.stringify(body)
  });

  const t = await r.text();
  try { return JSON.parse(t); }
  catch { return { ok:false, error:"Invalid JSON from server", raw:t }; }
}

function requireAuthOrRedirect() {
  const token = getToken();
  if (!token) location.href = "./index.html";
}

async function loadMe() {
  const token = getToken();
  const r = await apiGet("me", { token });
  if (!r.ok) { clearToken(); location.href="./index.html"; return null; }
  localStorage.setItem("email", r.email);
  localStorage.setItem("role", r.role);
  return r;
}

// ===== Google Sign-In callback =====
// backend loginGoogle is GET (CORS safe)
async function onGoogleCredentialResponse(resp) {
  try {
    qs("#loginStatus").textContent = "Signing in…";
    const r = await apiGet("loginGoogle", { credential: resp.credential });
    if (!r.ok) throw new Error(r.error || "Login failed");

    setToken(r.token);
    localStorage.setItem("email", r.email);
    localStorage.setItem("role", r.role);

    location.href = "./dashboard.html";
  } catch (e) {
    qs("#loginStatus").textContent = "Login failed: " + e.message;
  }
}

function normalizeYesNo(v){
  const s = String(v || "").trim().toLowerCase();
  if (["yes","ya","y","true","1"].includes(s)) return "yes";
  if (["no","n","tidak","false","0"].includes(s)) return "no";
  return s;
}
function normalizeStatus(v){ return String(v || "").trim().toLowerCase(); }

// ===== Dashboard =====
async function dashboardInit() {
  requireAuthOrRedirect();
  const me = await loadMe();
  if (!me) return;

  const elEmail = qs("#meEmail");
  const elRole  = qs("#meRole");
  if (elEmail) elEmail.textContent = me.email;
  if (elRole)  elRole.textContent  = me.role;

  await refreshMyInnovations();
  await refreshReport("2026");
  await refreshCompetitionReport("2026");
}

async function refreshMyInnovations() {
  const token = getToken();
  const r = await apiGet("listMyInnovations", { token });

  const body = qs("#myListBody");
  if (body) body.innerHTML = "";

  const items = (r.ok ? (r.items || []) : []);

  const years = new Set();
  let aktifCount = 0;
  let myipoYesCount = 0;

  for (const it of items) {
    const y = String(it.tahun || "").trim();
    if (y) years.add(y);

    if (normalizeStatus(it.status) === "aktif") aktifCount++;
    if (normalizeYesNo(it.myipoStatus) === "yes") myipoYesCount++;
  }

  const elTotal = qs("#countTotal");
  const elYears = qs("#countYears");
  const elAktif = qs("#countAktif");
  const elMyipo = qs("#countMyipoYes");

  if (elTotal) elTotal.textContent = items.length;
  if (elYears) elYears.textContent = years.size;
  if (elAktif) elAktif.textContent = aktifCount;
  if (elMyipo) elMyipo.textContent = myipoYesCount;

  if (!body) return;

  if (!items.length) {
    body.innerHTML = `<tr><td colspan="6" class="muted">Belum ada rekod inovasi.</td></tr>`;
    return;
  }

  for (const it of items) {
    const myipo = `${it.myipoStatus || ""} / ${it.myipoNumber || ""}`.trim();
    const pillCls = (normalizeStatus(it.status)==="aktif") ? "ok" : "warn";

    body.innerHTML += `
      <tr>
        <td>${escapeHtml(it.tajuk || "")}</td>
        <td>${escapeHtml(it.tahun || "")}</td>
        <td>${escapeHtml(it.kategori || "")}</td>
        <td><span class="pill ${pillCls}">${escapeHtml(it.status||"")}</span></td>
        <td>${escapeHtml(myipo)}</td>
        <td><code>${escapeHtml(it.innovationId||"")}</code></td>
      </tr>
    `;
  }
}

async function refreshReport(year) {
  const token = getToken();
  const r = await apiGet("generateReport", { token, year });
  if (!r.ok) return;

  const items = (r.items || []);

  let aktif = 0;
  let myipoYes = 0;
  let myipoNo = 0;

  for (const it of items) {
    if (normalizeStatus(it.status) === "aktif") aktif++;
    const ms = normalizeYesNo(it.myipoStatus);
    if (ms === "yes") myipoYes++;
    else myipoNo++;
  }

  const elYear = qs("#rYear");
  const elTotal = qs("#rTotal");
  const elAktif = qs("#rAktif");
  const elYes = qs("#rMyipoYes");
  const elNo = qs("#rMyipoNo");

  if (elYear)  elYear.textContent  = String(r.year || year);
  if (elTotal) elTotal.textContent = items.length;
  if (elAktif) elAktif.textContent = aktif;
  if (elYes)   elYes.textContent   = myipoYes;
  if (elNo)    elNo.textContent    = myipoNo;

  const tb = qs("#reportBody");
  if (!tb) return;

  tb.innerHTML = "";
  if (!items.length) {
    tb.innerHTML = `<tr><td colspan="4" class="muted">Tiada rekod untuk tahun ${escapeHtml(String(r.year || year))}.</td></tr>`;
    return;
  }

  for (const it of items) {
    const myipo = `${it.myipoStatus || ""} / ${it.myipoNumber || ""}`.trim();
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

/* =========================
   COMPETITIONS (Dashboard)
========================= */

async function refreshCompetitionReport(year){
  const token = getToken();
  const r = await apiGet("generateCompetitionReport", { token, year });
  if (!r.ok) {
    const m = qs("#cMsg");
    if (m) m.textContent = "Report pertandingan gagal: " + (r.error || "");
    return;
  }

  const s = r.summary || {};
  const items = r.items || [];

  // top KPIs
  const elTotal = qs("#cTotal");
  const elAK = qs("#cAK");
  const elGold = qs("#cGold");
  const elIntl = qs("#cIntl");

  if (elTotal) elTotal.textContent = s.totalPenyertaan ?? items.length;
  if (elAK) elAK.textContent = s.anugerahKhas ?? 0;
  if (elGold) elGold.textContent = (s.medals && s.medals.Gold) ? s.medals.Gold : 0;
  if (elIntl) elIntl.textContent = (s.peringkat && s.peringkat.Antarabangsa) ? s.peringkat.Antarabangsa : 0;

  // table
  const tb = qs("#compBody");
  if (!tb) return;

  tb.innerHTML = "";
  if (!items.length){
    tb.innerHTML = `<tr><td colspan="5" class="muted">Belum ada rekod penyertaan untuk tahun ${escapeHtml(String(r.year||year))}.</td></tr>`;
    return;
  }

  for (const it of items){
    const ak = normalizeYesNo(it.anugerahKhas) === "yes" ? "Ya" : "Tidak";
    tb.innerHTML += `
      <tr>
        <td>${escapeHtml(it.tajuk||"")}</td>
        <td>${escapeHtml(it.peringkat||"")}</td>
        <td>${escapeHtml(it.pingat||"")}</td>
        <td>${escapeHtml(ak)}</td>
        <td><code>${escapeHtml(it.innovationId||"")}</code></td>
      </tr>
    `;
  }

  const m = qs("#cMsg");
  if (m) m.textContent = "";
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
  const elEmail = qs("#meEmail");
  if (elEmail) elEmail.textContent = me.email;
}

async function submitInnovation(e) {
  e.preventDefault();
  const token = getToken();

  const payload = {
    tajuk: qs("#tajuk").value.trim(),
    tahun: qs("#tahun").value.trim(),
    kategori: qs("#kategori").value.trim(),
    status: qs("#status").value.trim(),
    myipoStatus: qs("#myipoStatus").value.trim(),
    myipoNumber: qs("#myipoNumber").value.trim()
  };

  qs("#saveMsg").textContent = "Saving…";
  const r = await apiPost("addInnovation", { token }, payload);
  if (!r.ok) {
    qs("#saveMsg").textContent = "Gagal: " + (r.error || "");
    return;
  }
  qs("#saveMsg").textContent = "Berjaya simpan ✅";
  setTimeout(()=> location.href="./dashboard.html", 600);
}

/* =========================
   ADD COMPETITION PAGE
========================= */

async function addCompetitionInit(){
  requireAuthOrRedirect();
  const me = await loadMe();
  if (!me) return;

  const elEmail = qs("#meEmail");
  if (elEmail) elEmail.textContent = me.email;

  // load innovations for dropdown
  const token = getToken();
  const r = await apiGet("listMyInnovations", { token });
  const sel = qs("#innovationId");
  if (!sel) return;

  sel.innerHTML = `<option value="">-- pilih inovasi --</option>`;
  const items = (r.ok ? (r.items || []) : []);
  for (const it of items){
    const id = String(it.innovationId||"").trim();
    const tajuk = String(it.tajuk||"").trim();
    const tahun = String(it.tahun||"").trim();
    sel.innerHTML += `<option value="${escapeHtml(id)}" data-tahun="${escapeHtml(tahun)}">${escapeHtml(tajuk)} (${escapeHtml(tahun)})</option>`;
  }

  sel.addEventListener("change", () => {
    const opt = sel.options[sel.selectedIndex];
    const y = opt ? (opt.getAttribute("data-tahun") || "") : "";
    const tahunEl = qs("#tahun");
    if (tahunEl && y) tahunEl.value = y;
  });
}

async function submitCompetition(e){
  e.preventDefault();
  const token = getToken();

  const payload = {
    innovationId: qs("#innovationId").value.trim(),
    tahun: qs("#tahun").value.trim(),
    peringkat: qs("#peringkat").value.trim(),
    pingat: qs("#pingat").value.trim(),
    anugerahKhas: qs("#anugerahKhas").value.trim()
  };

  const msg = qs("#saveMsg");
  if (msg) msg.textContent = "Saving…";

  const r = await apiPost("addCompetition", { token }, payload);
  if (!r.ok){
    if (msg) msg.textContent = "Gagal: " + (r.error || "");
    return;
  }

  if (msg) msg.textContent = "Berjaya simpan ✅";
  setTimeout(()=> location.href="./dashboard.html", 600);
}

// ===== util =====
function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}
// ===== Add Competition =====

async function addCompetitionInit() {
  requireAuthOrRedirect();
}

async function submitCompetition(e) {
  e.preventDefault();

  const token = getToken();

  const payload = {
    namaEvent: qs("#namaEvent").value.trim(),
    tahun: qs("#tahun").value.trim(),
    peringkat: qs("#peringkat").value.trim(),
    pingat: qs("#pingat").value.trim()
  };

  qs("#msg").textContent = "Saving…";

  const r = await apiPost("addCompetition", { token }, payload);

  if (!r.ok) {
    qs("#msg").textContent = "Gagal: " + (r.error || "");
    return;
  }

  qs("#msg").textContent = "Berjaya simpan ✅";
  setTimeout(()=> location.href="./dashboard.html", 800);
}
