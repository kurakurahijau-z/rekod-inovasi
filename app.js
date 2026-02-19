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

  if (qs("#compBody")) {
    await refreshCompetitionReport("2026");
  }
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
   COMPETITIONS (Dashboard optional)
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

  const elTotal = qs("#cTotal");
  const elAK = qs("#cAK");
  const elGold = qs("#cGold");
  const elIntl = qs("#cIntl");

  if (elTotal) elTotal.textContent = s.totalPenyertaan ?? items.length;
  if (elAK) elAK.textContent = s.anugerahKhas ?? 0;
  if (elGold) elGold.textContent = (s.medals && s.medals.Gold) ? s.medals.Gold : 0;
  if (elIntl) elIntl.textContent = (s.peringkat && s.peringkat.Antarabangsa) ? s.peringkat.Antarabangsa : 0;

  const tb = qs("#compBody");
  if (!tb) return;

  tb.innerHTML = "";
  if (!items.length){
    tb.innerHTML = `<tr><td colspan="6" class="muted">Belum ada rekod penyertaan untuk tahun ${escapeHtml(String(r.year||year))}.</td></tr>`;
    return;
  }

  for (const it of items){
    const ak = normalizeYesNo(it.anugerahKhas) === "yes" ? "Ya" : "Tidak";
    const nak = it.namaAnugerahKhas ? String(it.namaAnugerahKhas) : "";
    tb.innerHTML += `
      <tr>
        <td>${escapeHtml(it.tajuk||"")}</td>
        <td>${escapeHtml(it.namaEvent||"")}</td>
        <td>${escapeHtml(it.peringkat||"")}</td>
        <td>${escapeHtml(it.pingat||"")}</td>
        <td>${escapeHtml(ak)} ${nak ? `<div class="muted" style="font-size:12px;">${escapeHtml(nak)}</div>` : ""}</td>
        <td><code>${escapeHtml(it.innovationId||"")}</code></td>
      </tr>
    `;
  }

  const m = qs("#cMsg");
  if (m) m.textContent = "";
}

/* =========================
   TEAM PAGE
========================= */

async function teamInit(){
  requireAuthOrRedirect();
  const me = await loadMe();
  if (!me) return;

  const elEmail = qs("#meEmail");
  if (elEmail) elEmail.textContent = me.email;

  const yy = qs("#yy");
  if (yy) yy.textContent = new Date().getFullYear();

  // Load innovations owned by user only (owner only boleh manage)
  const token = getToken();
  const r = await apiGet("listMyInnovations", { token });
  const sel = qs("#teamInnovationId");
  if (!sel) return;

  const items = (r.ok ? (r.items || []) : []);

  // filter owner only: backend returns ownerEmail; kalau tak ada, kita still allow by trying listTeamMembers (backend checks)
  const owned = items.filter(x => String(x.ownerEmail||"").toLowerCase().trim() === String(me.email||"").toLowerCase().trim());

  sel.innerHTML = `<option value="">-- pilih inovasi --</option>`;
  for (const it of owned){
    const id = String(it.innovationId||"").trim();
    const tajuk = String(it.tajuk||"").trim();
    const tahun = String(it.tahun||"").trim();
    sel.innerHTML += `<option value="${escapeHtml(id)}">${escapeHtml(tajuk)} (${escapeHtml(tahun)})</option>`;
  }

  sel.addEventListener("change", () => refreshTeamList());
}

async function refreshTeamList(){
  const token = getToken();
  const innovationId = qs("#teamInnovationId").value.trim();
  const tb = qs("#teamBody");
  const msg = qs("#teamMsg");

  if (!innovationId){
    if (tb) tb.innerHTML = `<tr><td colspan="4" class="muted">Pilih inovasi untuk lihat ahli.</td></tr>`;
    if (msg) msg.textContent = "";
    return;
  }

  if (msg) msg.textContent = "Loading ahli…";
  const r = await apiGet("listTeamMembers", { token, innovationId });

  if (!r.ok){
    if (msg) msg.textContent = "Gagal: " + (r.error || "");
    if (tb) tb.innerHTML = `<tr><td colspan="4" class="muted">Tak dapat load ahli.</td></tr>`;
    return;
  }

  const items = r.items || [];
  if (tb) tb.innerHTML = "";

  if (!items.length){
    if (tb) tb.innerHTML = `<tr><td colspan="4" class="muted">Belum ada ahli lagi.</td></tr>`;
    if (msg) msg.textContent = "";
    return;
  }

  for (const it of items){
    const role = it.roleInTeam || "member";
    const pill = role === "owner" ? `<span class="pill ok">owner</span>` : escapeHtml(role);

    tb.innerHTML += `
      <tr>
        <td>${escapeHtml(it.memberEmail||"")}</td>
        <td>${escapeHtml(it.memberName||"")}</td>
        <td>${pill}</td>
        <td>
          ${role === "owner" ? `<span class="muted">-</span>` : `<span class="danger" onclick="removeMember('${escapeHtml(it.memberEmail||"")}')">Buang</span>`}
        </td>
      </tr>
    `;
  }

  if (msg) msg.textContent = "";
}

async function addMember(){
  const token = getToken();
  const innovationId = qs("#teamInnovationId").value.trim();
  const memberEmail = qs("#memberEmail").value.trim().toLowerCase();
  const memberName = qs("#memberName").value.trim();
  const roleInTeam = qs("#roleInTeam").value.trim();

  const msg = qs("#teamMsg");

  if (!innovationId){
    if (msg) msg.textContent = "Pilih inovasi dulu.";
    return;
  }
  if (!memberEmail){
    if (msg) msg.textContent = "Email ahli wajib isi.";
    return;
  }

  if (msg) msg.textContent = "Adding…";
  const r = await apiPost("addTeamMember", { token }, { innovationId, memberEmail, memberName, roleInTeam });

  if (!r.ok){
    if (msg) msg.textContent = "Gagal: " + (r.error || "");
    return;
  }

  qs("#memberEmail").value = "";
  qs("#memberName").value = "";
  if (msg) msg.textContent = "Berjaya tambah ✅";

  await refreshTeamList();
  setTimeout(()=> { if (msg) msg.textContent = ""; }, 900);
}

async function removeMember(memberEmail){
  const token = getToken();
  const innovationId = qs("#teamInnovationId").value.trim();
  const msg = qs("#teamMsg");

  if (!innovationId) return;
  if (!confirm(`Buang ahli ini?\n${memberEmail}`)) return;

  if (msg) msg.textContent = "Removing…";
  const r = await apiPost("removeTeamMember", { token }, { innovationId, memberEmail });

  if (!r.ok){
    if (msg) msg.textContent = "Gagal: " + (r.error || "");
    return;
  }

  if (msg) msg.textContent = "Dibuang ✅";
  await refreshTeamList();
  setTimeout(()=> { if (msg) msg.textContent = ""; }, 900);
}

/* =========================
   Add Competition Page (if used)
========================= */

async function addCompetitionInit(){
  requireAuthOrRedirect();
  const me = await loadMe();
  if (!me) return;

  const elEmail = qs("#meEmail");
  if (elEmail) elEmail.textContent = me.email;

  const yy = qs("#yy");
  if (yy) yy.textContent = new Date().getFullYear();

  const akSel = qs("#anugerahKhas");
  const box = qs("#anugerahBox");
  const nama = qs("#namaAnugerahKhas");
  if (akSel && box) {
    const sync = () => {
      const v = String(akSel.value || "no").toLowerCase();
      if (v === "yes") { box.classList.remove("hide"); if (nama) nama.required = true; }
      else { box.classList.add("hide"); if (nama) { nama.required = false; nama.value = ""; } }
    };
    akSel.addEventListener("change", sync);
    sync();
  }

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
    namaEvent: qs("#namaEvent").value.trim(),
    tahun: qs("#tahun").value.trim(),
    peringkat: qs("#peringkat").value.trim(),
    pingat: qs("#pingat").value.trim(),
    anugerahKhas: qs("#anugerahKhas").value.trim(),
    namaAnugerahKhas: (qs("#namaAnugerahKhas") ? qs("#namaAnugerahKhas").value.trim() : "")
  };

  const msg = qs("#saveMsg");
  if (msg) msg.textContent = "Saving…";

  const r = await apiPost("addCompetition", { token }, payload);
  if (!r.ok){
    if (msg) msg.textContent = "Gagal: " + (r.error || "");
    return;
  }

  if (msg) msg.textContent = "Berjaya simpan ✅";
  setTimeout(()=> location.href="./dashboard.html", 700);
}

function doPrint() { window.print(); }

function doLogout() {
  clearToken();
  location.href = "./index.html";
}

// ===== util =====
function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}
