/* app.js - Rekod Inovasi Jabatan (Frontend)
 * - GitHub Pages
 * - Google Identity Services (One Tap / Button)
 * - API: Google Apps Script Web App
 */

const CFG = window.APP_CONFIG || {};
const state = {
  token: "",
  email: "",
  role: "user",
  innovations: [],
  selectedInnovationId: "",
  staffSuggest: [],
  lastStaffQuery: "",
  comps: [],
  team: [],
};

function $(id){ return document.getElementById(id); }
function show(el){ el.classList.remove("hidden"); }
function hide(el){ el.classList.add("hidden"); }

function setBanner(msg){
  const el = $("globalMsg");
  if (!msg) { hide(el); el.textContent = ""; return; }
  el.textContent = msg;
  show(el);
}

function safeText(x){ return String(x ?? ""); }

function loadLocal(){
  state.token = localStorage.getItem("ri_token") || "";
  state.selectedInnovationId = localStorage.getItem("ri_selectedInnovationId") || "";
}

function saveLocal(){
  localStorage.setItem("ri_token", state.token || "");
  localStorage.setItem("ri_selectedInnovationId", state.selectedInnovationId || "");
}

function logout(){
  state.token = "";
  state.email = "";
  state.role = "user";
  state.innovations = [];
  state.selectedInnovationId = "";
  saveLocal();

  $("userEmail").textContent = "";
  $("userRole").textContent = "";
  hide($("btnLogout"));

  show($("loginView"));
  hide($("appView"));
  setBanner("");
}

function qs(params){
  const u = new URLSearchParams();
  Object.entries(params || {}).forEach(([k,v])=>{
    if (v === undefined || v === null) return;
    u.set(k, String(v));
  });
  return u.toString();
}

// IMPORTANT: guna request "simple" (GET atau POST form-urlencoded) supaya lebih stable.
async function api(action, params={}, method="GET"){
  const base = CFG.API_BASE;
  if (!base) throw new Error("API_BASE tak set dalam config.js");

  const p = { action, ...params };
  if (state.token && !("token" in p)) p.token = state.token;

  if (method === "GET"){
    const url = base + "?" + qs(p);
    const res = await fetch(url, { method:"GET" });
    const txt = await res.text();
    let data;
    try { data = JSON.parse(txt); } catch(e){ throw new Error("Response bukan JSON: " + txt.slice(0,120)); }
    return data;
  }

  // POST as application/x-www-form-urlencoded (no custom headers)
  const body = new URLSearchParams();
  Object.entries(p).forEach(([k,v])=> body.set(k, String(v)));

  const res = await fetch(base, { method:"POST", body });
  const txt = await res.text();
  let data;
  try { data = JSON.parse(txt); } catch(e){ throw new Error("Response bukan JSON: " + txt.slice(0,120)); }
  return data;
}

function parseSelectedStaff(val){
  const s = String(val || "").trim();
  // format: "NAME <email>" atau "<email>" atau "email"
  const m = s.match(/<([^>]+)>/);
  if (m && m[1]) {
    const email = m[1].trim();
    const name = s.replace(m[0], "").trim();
    return { email, name };
  }
  // if looks like email
  if (s.includes("@")) return { email: s.replace(/[<>]/g,"").trim(), name: "" };
  return { email:"", name:s };
}

function renderTabs(active){
  document.querySelectorAll(".tab").forEach(btn=>{
    const on = btn.getAttribute("data-tab") === active;
    btn.classList.toggle("active", on);
  });
  ["innovations","team","competitions","profile"].forEach(t=>{
    const sec = $("tab_"+t);
    if (!sec) return;
    if (t === active) show(sec); else hide(sec);
  });
}

function selectedInnovation(){
  const id = state.selectedInnovationId;
  if (!id) return null;
  return state.innovations.find(x => String(x.innovationId || x.id || "").trim() === id) || null;
}

function renderSelectedInnovationBar(){
  const inv = selectedInnovation();
  $("selectedInnovationTitle").textContent = inv ? (inv.tajuk || "-") : "-";
}

function requireSelectedInnovation(){
  const inv = selectedInnovation();
  if (!inv){
    setBanner("Pilih inovasi dulu kat tab Inovasi.");
    return null;
  }
  setBanner("");
  return inv;
}

/* -------------------- LOGIN -------------------- */

function initGoogleButton(){
  const clientId = CFG.GOOGLE_CLIENT_ID;
  if (!clientId) {
    $("loginMsg").textContent = "GOOGLE_CLIENT_ID belum set dalam config.js";
    return;
  }

  // GIS button
  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: async (resp) => {
      try{
        $("loginMsg").textContent = "Sedang login...";
        const credential = resp && resp.credential ? resp.credential : "";
        if (!credential) throw new Error("No credential from Google");

        // loginGoogle guna GET (simple)
        const out = await api("loginGoogle", { credential }, "GET");
        if (!out.ok) throw new Error(out.error || "Login gagal");

        state.token = out.token;
        state.email = out.email;
        state.role = out.role || "user";
        saveLocal();

        await bootAfterLogin();
      }catch(err){
        $("loginMsg").textContent = "Login gagal: " + (err.message || err);
      }
    }
  });

  window.google.accounts.id.renderButton(
    $("googleBtn"),
    { theme:"outline", size:"large", shape:"pill", width: 340 }
  );
}

async function checkSession(){
  if (!state.token) return false;
  try{
    const out = await api("me", {}, "GET");
    if (!out.ok) return false;
    state.email = out.email || "";
    state.role = out.role || "user";
    return true;
  }catch(e){
    return false;
  }
}

async function bootAfterLogin(){
  $("userEmail").textContent = state.email || "";
  $("userRole").textContent = "role: " + (state.role || "user");
  $("pf_email").textContent = state.email || "";
  $("pf_role").textContent = state.role || "user";

  show($("btnLogout"));
  hide($("loginView"));
  show($("appView"));

  // load innovations and restore selection
  await loadInnovations();
  renderSelectedInnovationBar();

  // default tab
  renderTabs("innovations");
}

/* -------------------- INNOVATIONS -------------------- */

function innovCard(inv){
  const id = String(inv.innovationId || inv.id || "").trim();
  const isSelected = id && id === state.selectedInnovationId;

  const tajuk = safeText(inv.tajuk);
  const tahun = safeText(inv.tahun);
  const kategori = safeText(inv.kategori);
  const status = safeText(inv.status);
  const myipoStatus = safeText(inv.myipoStatus);
  const myipoNumber = safeText(inv.myipoNumber);

  return `
    <div class="card p-4 ${isSelected ? "border-gray-900" : ""}">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="font-semibold">${tajuk || "-"}</div>
          <div class="muted text-sm">Tahun: ${tahun || "-"} • Kategori: ${kategori || "-"}</div>
          <div class="muted text-sm">Status: ${status || "-"}</div>
          ${myipoStatus ? `<div class="muted text-sm">MYIPO: ${myipoStatus}${myipoNumber ? " • " + myipoNumber : ""}</div>` : ``}
        </div>
        <div class="flex flex-col gap-2">
          <button class="btn ${isSelected ? "btn-primary" : ""}" data-pick="${id}">
            ${isSelected ? "Dipilih" : "Pilih"}
          </button>
          <button class="btn" data-delinv="${id}">Buang</button>
        </div>
      </div>
    </div>
  `;
}

async function loadInnovations(){
  const out = await api("listMyInnovations", {}, "GET");
  if (!out.ok) throw new Error(out.error || "Gagal load innovations");
  state.innovations = out.items || [];

  // kalau selected id tak wujud lagi, clear
  if (state.selectedInnovationId) {
    const still = state.innovations.some(x => String(x.innovationId||x.id||"").trim() === state.selectedInnovationId);
    if (!still) state.selectedInnovationId = "";
  }
  saveLocal();

  const el = $("innovList");
  if (!state.innovations.length){
    el.innerHTML = `<div class="muted">Belum ada inovasi. Tambah dulu kat kanan.</div>`;
  } else {
    el.innerHTML = state.innovations.map(innovCard).join("");
  }

  // bind buttons
  el.querySelectorAll("[data-pick]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      state.selectedInnovationId = btn.getAttribute("data-pick") || "";
      saveLocal();
      renderSelectedInnovationBar();
      setBanner("");

      // refresh tab data bila select
      await loadTeam();
      await loadCompetitions();
    });
  });

  el.querySelectorAll("[data-delinv]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.getAttribute("data-delinv");
      if (!id) return;
      if (!confirm("Buang inovasi ini? Team & pertandingan berkaitan akan kekal (kalau ada).")) return;
      const out2 = await api("deleteInnovation", { id }, "POST");
      if (!out2.ok) return alert(out2.error || "Gagal buang");
      await loadInnovations();
      renderSelectedInnovationBar();
    });
  });
}

/* -------------------- STAFF SEARCH (for Team) -------------------- */

let staffTimer = null;

function renderStaffDatalist(items){
  const dl = $("staffDatalist");
  dl.innerHTML = (items || []).map(x=>{
    const email = safeText(x.email).toLowerCase();
    const name = safeText(x.name || x.nama || "");
    const label = `${name} <${email}>`.trim();
    return `<option value="${label}"></option>`;
  }).join("");
}

async function searchStaff(q){
  const query = String(q || "").trim();
  if (query.length < 2) { state.staffSuggest = []; renderStaffDatalist([]); return; }

  // throttle
  if (query === state.lastStaffQuery) return;
  state.lastStaffQuery = query;

  const out = await api("searchStaff", { q: query }, "GET");
  if (!out.ok) return;

  state.staffSuggest = out.items || [];
  renderStaffDatalist(state.staffSuggest);
}

function applyStaffSelection_(){
  const val = $("tm_search").value.trim();
  const parsed = parseSelectedStaff(val);
  let email = (parsed.email || "").toLowerCase().trim();
  let name = (parsed.name || "").trim();

  if (state.staffSuggest && state.staffSuggest.length) {
    if (email) {
      const hit = state.staffSuggest.find(x => String(x.email || "").toLowerCase().trim() === email);
      if (hit) {
        $("tm_email").value = (hit.email || email);
        $("tm_name").value = (hit.name || hit.nama || name);
        return;
      }
    }
    const hit2 = state.staffSuggest.find(x => {
      const label = `${x.name || x.nama || ""} <${x.email || ""}>`.trim();
      return label.toLowerCase() === val.toLowerCase();
    });
    if (hit2) {
      $("tm_email").value = hit2.email || "";
      $("tm_name").value = hit2.name || hit2.nama || "";
      return;
    }
  }

  if (email) $("tm_email").value = email;
  if (name && !$("tm_name").value.trim()) $("tm_name").value = name;
}

/* -------------------- TEAM -------------------- */

function teamCard(m){
  const name = safeText(m.nama || m.memberName || m.name || "");
  const email = safeText(m.email || m.memberEmail || "");
  const role = safeText(m.peranan || m.roleInTeam || m.role || "member");
  const id = safeText(m.teamId || m.id || "");

  return `
    <div class="card p-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="font-semibold">${name || "-"}</div>
          <div class="muted text-sm">${email || "-"}</div>
          <div class="muted text-sm">Peranan: ${role || "-"}</div>
        </div>
        <button class="btn" data-delteam="${id}">Buang</button>
      </div>
    </div>
  `;
}

async function loadTeam(){
  const inv = requireSelectedInnovation();
  if (!inv){
    $("teamList").innerHTML = `<div class="muted">Pilih inovasi dulu.</div>`;
    return;
  }

  const innovationId = String(inv.innovationId || inv.id || "").trim();
  const out = await api("listTeam", { innovationId }, "GET");
  if (!out.ok) throw new Error(out.error || "Gagal load team");
  state.team = out.items || [];

  const el = $("teamList");
  if (!state.team.length){
    el.innerHTML = `<div class="muted">Belum ada ahli team untuk inovasi ini.</div>`;
  } else {
    el.innerHTML = state.team.map(teamCard).join("");
  }

  el.querySelectorAll("[data-delteam]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const teamId = btn.getAttribute("data-delteam");
      if (!teamId) return;
      if (!confirm("Buang ahli ini?")) return;
      const out2 = await api("deleteTeam", { id: teamId, innovationId }, "POST");
      if (!out2.ok) return alert(out2.error || "Gagal buang");
      await loadTeam();
    });
  });
}

/* -------------------- COMPETITIONS -------------------- */

function compCard(c){
  const namaEvent = safeText(c.namaEvent || c.event || "");
  const tahun = safeText(c.tahun || "");
  const peringkat = safeText(c.peringkat || "");
  const pingat = safeText(c.pingat || "");
  const anugerahKhas = String(c.anugerahKhas || "").toLowerCase() === "yes";
  const namaAnugerahKhas = safeText(c.namaAnugerahKhas || "");

  const id = safeText(c.compId || c.id || "");
  return `
    <div class="card p-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="font-semibold">${namaEvent || "-"}</div>
          <div class="muted text-sm">Tahun: ${tahun || "-"} • Peringkat: ${peringkat || "-"}</div>
          <div class="muted text-sm">Pingat: <b>${pingat || "-"}</b></div>
          ${anugerahKhas ? `<div class="muted text-sm">Anugerah khas: ${namaAnugerahKhas || "-"}</div>` : ``}
        </div>
        <button class="btn" data-delcomp="${id}">Buang</button>
      </div>
    </div>
  `;
}

async function loadCompetitions(){
  const inv = requireSelectedInnovation();
  if (!inv){
    $("compList").innerHTML = `<div class="muted">Pilih inovasi dulu.</div>`;
    return;
  }
  const innovationId = String(inv.innovationId || inv.id || "").trim();
  const out = await api("listCompetitions", { innovationId }, "GET");
  if (!out.ok) throw new Error(out.error || "Gagal load competitions");
  state.comps = out.items || [];

  const el = $("compList");
  if (!state.comps.length){
    el.innerHTML = `<div class="muted">Belum ada rekod pertandingan.</div>`;
  } else {
    el.innerHTML = state.comps.map(compCard).join("");
  }

  el.querySelectorAll("[data-delcomp]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const compId = btn.getAttribute("data-delcomp");
      if (!compId) return;
      if (!confirm("Buang rekod pertandingan ini?")) return;
      const out2 = await api("deleteCompetition", { id: compId, innovationId }, "POST");
      if (!out2.ok) return alert(out2.error || "Gagal buang");
      await loadCompetitions();
    });
  });
}

/* -------------------- EVENTS / UI WIRING -------------------- */

function wireUI(){
  $("btnLogout").addEventListener("click", logout);

  document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const t = btn.getAttribute("data-tab");
      renderTabs(t);

      if (t === "team") await loadTeam();
      if (t === "competitions") await loadCompetitions();
      if (t === "innovations") await loadInnovations();
    });
  });

  $("btnRefreshAll").addEventListener("click", async ()=>{
    await loadInnovations();
    renderSelectedInnovationBar();
    await loadTeam();
    await loadCompetitions();
  });

  $("btnRefreshInnovations").addEventListener("click", async ()=> {
    await loadInnovations();
    renderSelectedInnovationBar();
  });

  $("btnAddInnovation").addEventListener("click", async ()=>{
    try{
      const tajuk = $("inv_tajuk").value.trim();
      const tahun = $("inv_tahun").value.trim();
      const kategori = $("inv_kategori").value.trim();
      const status = $("inv_status").value.trim();
      const myipoStatus = $("inv_myipo").value.trim();
      const myipoNumber = $("inv_myipoNo").value.trim();

      if (!tajuk) throw new Error("Tajuk diperlukan.");
      if (!tahun) throw new Error("Tahun diperlukan.");

      const out = await api("addInnovation", {
        tajuk, tahun, kategori, status, myipoStatus, myipoNumber
      }, "POST");

      if (!out.ok) throw new Error(out.error || "Gagal tambah inovasi");

      $("inv_tajuk").value = "";
      $("inv_tahun").value = "";
      $("inv_kategori").value = "";
      $("inv_myipo").value = "";
      $("inv_myipoNo").value = "";

      await loadInnovations();
      setBanner("Inovasi berjaya disimpan. Klik kad inovasi untuk pilih.");
    }catch(err){
      alert(err.message || err);
    }
  });

  // Team member search
  $("tm_search").addEventListener("input", ()=>{
    clearTimeout(staffTimer);
    const q = $("tm_search").value.trim();
    staffTimer = setTimeout(()=> searchStaff(q), 180);
  });

  ["change","blur","keyup"].forEach(ev=>{
    $("tm_search").addEventListener(ev, applyStaffSelection_);
  });

  $("btnAddTeam").addEventListener("click", async ()=>{
    try{
      const inv = requireSelectedInnovation();
      if (!inv) return;

      const innovationId = String(inv.innovationId || inv.id || "").trim();
      const memberEmail = $("tm_email").value.trim().toLowerCase();
      const memberName = $("tm_name").value.trim();
      const roleInTeam = $("tm_role").value.trim() || "member";

      if (!memberEmail) throw new Error("Email ahli diperlukan.");
      if (!memberName) throw new Error("Nama ahli diperlukan (auto isi kalau pilih dari StaffDirectory).");

      const out = await api("addTeam", {
        innovationId,
        email: memberEmail,
        nama: memberName,
        peranan: roleInTeam
      }, "POST");

      if (!out.ok) throw new Error(out.error || "Gagal tambah ahli");

      $("tm_search").value = "";
      $("tm_email").value = "";
      $("tm_name").value = "";
      $("tm_role").value = "";

      await loadTeam();
      setBanner("Ahli team berjaya ditambah.");
    }catch(err){
      alert(err.message || err);
    }
  });

  // Competitions UI
  $("cp_anugerah").addEventListener("change", ()=>{
    const on = $("cp_anugerah").checked;
    if (on) show($("cp_anugerahNama")); else hide($("cp_anugerahNama"));
    if (!on) $("cp_anugerahNama").value = "";
  });

  $("btnRefreshTeam").addEventListener("click", loadTeam);
  $("btnRefreshComps").addEventListener("click", loadCompetitions);

  $("btnAddComp").addEventListener("click", async ()=>{
    try{
      const inv = requireSelectedInnovation();
      if (!inv) return;

      const innovationId = String(inv.innovationId || inv.id || "").trim();

      const namaEvent = $("cp_event").value.trim();
      const tahun = $("cp_tahun").value.trim();
      const peringkat = $("cp_peringkat").value.trim();
      const pingat = $("cp_pingat").value.trim();
      const anugerahKhas = $("cp_anugerah").checked ? "yes" : "no";
      const namaAnugerahKhas = $("cp_anugerahNama").value.trim();

      if (!namaEvent) throw new Error("Nama event diperlukan.");
      if (!tahun) throw new Error("Tahun diperlukan.");
      if (!peringkat) throw new Error("Peringkat diperlukan.");
      if (!pingat) throw new Error("Pingat/penyertaan diperlukan.");
      if (anugerahKhas === "yes" && !namaAnugerahKhas) throw new Error("Nama anugerah khas diperlukan.");

      const out = await api("addCompetition", {
        innovationId,
        namaEvent, tahun, peringkat, pingat,
        anugerahKhas, namaAnugerahKhas
      }, "POST");

      if (!out.ok) throw new Error(out.error || "Gagal simpan pertandingan");

      $("cp_event").value = "";
      $("cp_tahun").value = "";
      $("cp_peringkat").value = "";
      $("cp_pingat").value = "PENYERTAAN";
      $("cp_anugerah").checked = false;
      hide($("cp_anugerahNama"));
      $("cp_anugerahNama").value = "";

      await loadCompetitions();
      setBanner("Rekod pertandingan berjaya disimpan.");
    }catch(err){
      alert(err.message || err);
    }
  });
}

async function boot(){
  loadLocal();
  wireUI();
  initGoogleButton();

  // If session exists, auto boot
  const ok = await checkSession();
  if (ok) await bootAfterLogin();
}

boot();
