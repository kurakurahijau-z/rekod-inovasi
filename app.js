/* app.js - Rekod Inovasi Jabatan (Frontend)
 * - Google login (GIS)
 * - Innovations CRUD (basic)
 * - Team member (StaffDirectory dropdown search)
 * - Competitions (pingat dropdown + anugerah khas)
 */

const CFG = window.APP_CONFIG || {};
const API_BASE = CFG.API_BASE;
const GOOGLE_CLIENT_ID = CFG.GOOGLE_CLIENT_ID;
const ALLOWED_DOMAIN = (CFG.ALLOWED_DOMAIN || "").toLowerCase().trim();

const store = {
  token: localStorage.getItem("ri_token") || "",
  email: localStorage.getItem("ri_email") || "",
  role: localStorage.getItem("ri_role") || "",
  selectedInnovation: localStorage.getItem("ri_selectedInnovation") || "",
  selectedInnovationTitle: localStorage.getItem("ri_selectedInnovationTitle") || "",
};

function $(sel){ return document.querySelector(sel); }
function $all(sel){ return Array.from(document.querySelectorAll(sel)); }

function esc(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}

function setAlert(type, msg){
  const el = $("#alert");
  if (!el) return;
  if (!msg){
    el.className = "hidden mb-5 p-3 rounded-xl border text-sm";
    el.textContent = "";
    return;
  }
  const base = "mb-5 p-3 rounded-xl border text-sm";
  const cls = type === "ok"
    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
    : "bg-rose-50 border-rose-200 text-rose-900";
  el.className = `${base} ${cls}`;
  el.textContent = msg;
}

function saveSession(){
  localStorage.setItem("ri_token", store.token || "");
  localStorage.setItem("ri_email", store.email || "");
  localStorage.setItem("ri_role", store.role || "");
  localStorage.setItem("ri_selectedInnovation", store.selectedInnovation || "");
  localStorage.setItem("ri_selectedInnovationTitle", store.selectedInnovationTitle || "");
}

function clearSession(){
  store.token = ""; store.email = ""; store.role = "";
  saveSession();
}

async function api(action, params = {}, method = "GET"){
  const url = new URL(API_BASE);
  url.searchParams.set("action", action);

  if (method === "GET"){
    Object.entries(params).forEach(([k,v])=>{
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
    const res = await fetch(url.toString(), { method: "GET", mode: "cors" });
    const txt = await res.text();
    let json;
    try { json = JSON.parse(txt); } catch { throw new Error("Invalid JSON: " + txt); }
    if (!json.ok) throw new Error(json.error || "Request failed");
    return json;
  }

  // POST (JSON)
  Object.entries(params).forEach(([k,v])=>{
    if (v !== undefined && v !== null && k !== "body") url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString(), {
    method: "POST",
    mode: "cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params.body || {})
  });
  const txt = await res.text();
  let json;
  try { json = JSON.parse(txt); } catch { throw new Error("Invalid JSON: " + txt); }
  if (!json.ok) throw new Error(json.error || "Request failed");
  return json;
}

function showLogin(){
  $("#viewLogin").classList.remove("hidden");
  $("#viewApp").classList.add("hidden");
  $("#topRight").classList.add("hidden");
}

function showApp(){
  $("#viewLogin").classList.add("hidden");
  $("#viewApp").classList.remove("hidden");
  $("#topRight").classList.remove("hidden");
}

function setMeUI(){
  $("#meEmail").textContent = store.email || "";
  $("#meRole").textContent = store.role ? `role: ${store.role}` : "";
  $("#pEmail").textContent = store.email || "—";
  $("#pRole").textContent = store.role || "—";
  $("#pToken").textContent = store.token || "—";

  $("#teamInvTitle").textContent = store.selectedInnovationTitle || "—";
  $("#compInvTitle").textContent = store.selectedInnovationTitle || "—";
}

function setTab(tabId){
  $all(".tabPane").forEach(p=>p.classList.add("hidden"));
  $(`#${tabId}`).classList.remove("hidden");

  // button styling
  $all(".tabBtn").forEach(b=>{
    b.classList.remove("bg-slate-900","text-white");
    b.classList.add("hover:bg-slate-100");
  });
  const btn = $(`.tabBtn[data-tab="${tabId}"]`);
  if (btn){
    btn.classList.add("bg-slate-900","text-white");
    btn.classList.remove("hover:bg-slate-100");
  }
}

function bindTabs(){
  $all(".tabBtn").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const tab = btn.dataset.tab;
      setTab(tab);

      if (tab === "tabInnovations") await loadInnovations();
      if (tab === "tabTeam") await loadTeam();
      if (tab === "tabCompetitions") await loadCompetitions();
      setAlert("", "");
    });
  });
}

/* -------------------------
   Google Login (GIS)
------------------------- */
function initGSI(){
  if (!window.google || !google.accounts || !google.accounts.id) return;

  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: async (resp)=>{
      try{
        setAlert("", "");
        const credential = resp.credential;
        if (!credential) throw new Error("Missing credential");

        // Login via backend (GET)
        const r = await api("loginGoogle", { credential }, "GET");

        // Domain check (frontend safety; backend patut check juga)
        const email = String(r.email || "").toLowerCase().trim();
        if (ALLOWED_DOMAIN && !email.endsWith("@"+ALLOWED_DOMAIN)){
          throw new Error("Email bukan domain dibenarkan: " + ALLOWED_DOMAIN);
        }

        store.token = r.token;
        store.email = r.email;
        store.role = r.role || "user";
        saveSession();

        setMeUI();
        showApp();
        setTab("tabInnovations");
        await loadInnovations();
        setAlert("ok", "Login berjaya.");
      }catch(e){
        console.error(e);
        setAlert("err", "Login gagal: " + (e.message || e));
      }
    }
  });

  google.accounts.id.renderButton(
    document.getElementById("gsiBtn"),
    { theme: "outline", size: "large", width: 320, shape: "pill" }
  );
}

async function bootMe(){
  if (!store.token) return false;
  try{
    const r = await api("me", { token: store.token }, "GET");
    store.email = r.email || store.email;
    store.role = r.role || store.role;
    saveSession();
    return true;
  }catch(e){
    console.warn("me() failed:", e);
    clearSession();
    return false;
  }
}

/* -------------------------
   Innovations
------------------------- */
function invCard(item){
  const id = item.id;
  const chosen = store.selectedInnovation === id;

  return `
  <div class="border rounded-2xl p-4 bg-white ${chosen ? "ring-2 ring-emerald-200" : ""}">
    <div class="flex items-start justify-between gap-3">
      <div>
        <div class="font-semibold">${esc(item.tajuk || "-")}</div>
        <div class="text-sm text-slate-600">
          <span class="font-medium">${esc(item.tahun || "-")}</span>
          • ${esc(item.kategori || "-")}
          • <span class="px-2 py-0.5 rounded-lg border text-xs">${esc(item.status || "-")}</span>
        </div>
        <div class="text-xs text-slate-500 mt-1">
          MYIPO: ${esc(item.myipoStatus || "")} ${item.myipoNumber ? "• "+esc(item.myipoNumber) : ""}
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <button class="btnPickInv px-3 py-2 rounded-xl border bg-white hover:bg-slate-50 text-sm" data-id="${esc(id)}" data-title="${esc(item.tajuk || "")}">
          ${chosen ? "Dipilih" : "Pilih"}
        </button>
        <button class="btnDelInv px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-sm" data-id="${esc(id)}">
          Delete
        </button>
      </div>
    </div>
  </div>
  `;
}

async function loadInnovations(){
  try{
    const r = await api("listMyInnovations", { token: store.token }, "GET");
    const items = r.items || [];
    const wrap = $("#invList");
    wrap.innerHTML = items.map(invCard).join("");

    $("#invEmpty").classList.toggle("hidden", items.length > 0);

    // bind pick
    $all(".btnPickInv").forEach(b=>{
      b.addEventListener("click", async ()=>{
        store.selectedInnovation = b.dataset.id;
        store.selectedInnovationTitle = b.dataset.title || "";
        saveSession();
        setMeUI();
        await loadInnovations();
        setAlert("ok", "Inovasi dipilih: " + (store.selectedInnovationTitle || store.selectedInnovation));
      });
    });

    // bind delete
    $all(".btnDelInv").forEach(b=>{
      b.addEventListener("click", async ()=>{
        const id = b.dataset.id;
        if (!confirm("Delete inovasi ini?")) return;
        try{
          await api("deleteInnovation", { token: store.token, body: { id } }, "POST");
          if (store.selectedInnovation === id){
            store.selectedInnovation = "";
            store.selectedInnovationTitle = "";
            saveSession();
            setMeUI();
          }
          await loadInnovations();
          setAlert("ok", "Inovasi dibuang.");
        }catch(e){
          setAlert("err", e.message || String(e));
        }
      });
    });

  }catch(e){
    console.error(e);
    setAlert("err", e.message || String(e));
  }
}

function bindAddInnovation(){
  const cb = $("#fMyipo");
  const myipoNo = $("#fMyipoNo");

  cb.onchange = () => {
    if (cb.checked) myipoNo.classList.remove("hidden");
    else { myipoNo.classList.add("hidden"); myipoNo.value = ""; }
  };

  $("#btnAddInv").onclick = async ()=>{
    try{
      setAlert("", "");
      const tajuk = $("#fTajuk").value.trim();
      const tahun = $("#fTahun").value.trim();
      const kategori = $("#fKategori").value.trim();
      const status = $("#fStatus").value.trim();
      const myipoStatus = cb.checked ? "yes" : "no";
      const myipoNumber = myipoNo.value.trim();

      if (!tajuk) throw new Error("Tajuk diperlukan");
      if (!tahun) throw new Error("Tahun diperlukan");

      await api("addInnovation", {
        token: store.token,
        body: { tajuk, tahun, kategori, status, myipoStatus, myipoNumber }
      }, "POST");

      $("#fTajuk").value = "";
      $("#fTahun").value = "";
      $("#fKategori").value = "";
      $("#fStatus").value = "";
      cb.checked = false;
      myipoNo.value = "";
      myipoNo.classList.add("hidden");

      await loadInnovations();
      setAlert("ok", "Inovasi berjaya ditambah.");
    }catch(e){
      setAlert("err", e.message || String(e));
    }
  };
}

/* -------------------------
   Team
------------------------- */
function needSelected(){
  if (!store.selectedInnovation){
    setAlert("err", "Pilih inovasi dulu kat tab Inovasi.");
    return false;
  }
  return true;
}

function teamRow(item){
  return `
    <div class="border rounded-2xl p-4 bg-white flex items-start justify-between gap-3">
      <div>
        <div class="font-semibold">${esc(item.nama || item.memberName || "-")}</div>
        <div class="text-sm text-slate-600">${esc(item.email || item.memberEmail || "-")}</div>
        <div class="text-xs text-slate-500 mt-1">Peranan: ${esc(item.peranan || item.roleInTeam || "-")}</div>
      </div>
      <button class="btnDelTeam px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-sm"
        data-id="${esc(item.id)}">
        Remove
      </button>
    </div>
  `;
}

async function loadTeam(){
  if (!needSelected()) return;

  try{
    const r = await api("listTeam", {
      token: store.token,
      innovationId: store.selectedInnovation
    }, "GET");

    const items = r.items || [];
    $("#teamList").innerHTML = items.map(teamRow).join("");
    $("#teamEmpty").classList.toggle("hidden", items.length > 0);

    $all(".btnDelTeam").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const id = btn.dataset.id;
        if (!confirm("Remove member ini?")) return;
        try{
          await api("deleteTeam", { token: store.token, body: { id, innovationId: store.selectedInnovation } }, "POST");
          await loadTeam();
          setAlert("ok", "Member dibuang.");
        }catch(e){
          setAlert("err", e.message || String(e));
        }
      });
    });

    bindTeamDropdown(); // ensure dropdown bind

  }catch(e){
    console.error(e);
    setAlert("err", e.message || String(e));
  }
}

function bindTeamDropdown(){
  const teamSearch = $("#teamSearch");
  const teamSuggest = $("#teamSuggest");
  const teamEmail = $("#teamEmail");
  const teamName = $("#teamName");

  if (!teamSearch || !teamSuggest) return;

  let timer = null;

  function hide(){
    teamSuggest.classList.add("hidden");
    teamSuggest.innerHTML = "";
  }

  function render(items){
    if (!items || !items.length){ hide(); return; }

    teamSuggest.innerHTML = items.map(x => `
      <button type="button"
        class="w-full text-left px-3 py-2 hover:bg-slate-50 border-b last:border-b-0"
        data-email="${esc(x.email)}"
        data-nama="${esc(x.name || x.nama || "")}">
        <div class="text-sm font-medium">${esc(x.name || x.nama || "-")}</div>
        <div class="text-xs text-slate-600">${esc(x.email)} ${x.jawatan ? "• "+esc(x.jawatan) : ""}</div>
      </button>
    `).join("");

    teamSuggest.classList.remove("hidden");

    teamSuggest.querySelectorAll("button[data-email]").forEach(b=>{
      b.addEventListener("click", ()=>{
        const email = b.getAttribute("data-email");
        const nama = b.getAttribute("data-nama");
        teamEmail.value = email;
        teamName.value = nama;
        teamSearch.value = `${nama} (${email})`;
        hide();
      });
    });
  }

  teamSearch.oninput = ()=>{
    clearTimeout(timer);
    const q = teamSearch.value.trim();
    if (q.length < 2){ hide(); return; }

    timer = setTimeout(async ()=>{
      try{
        const r = await api("searchStaff", { token: store.token, q }, "GET");
        render(r.items || []);
      }catch(e){
        hide();
      }
    }, 250);
  };

  teamSearch.onblur = ()=> setTimeout(hide, 180);

  $("#btnAddTeam").onclick = async ()=>{
    try{
      if (!needSelected()) return;
      setAlert("", "");

      const email = teamEmail.value.trim().toLowerCase();
      const nama = teamName.value.trim();
      const peranan = $("#teamRole").value.trim();

      if (!email) throw new Error("Sila pilih staf dari dropdown (email kosong).");

      await api("addTeam", {
        token: store.token,
        body: { innovationId: store.selectedInnovation, email, nama, peranan }
      }, "POST");

      teamSearch.value = "";
      teamEmail.value = "";
      teamName.value = "";
      $("#teamRole").value = "";

      await loadTeam();
      setAlert("ok", "Team member ditambah.");
    }catch(e){
      setAlert("err", e.message || String(e));
    }
  };
}

/* -------------------------
   Competitions
   NOTE: tukar action name kalau backend kau lain
------------------------- */
function compRow(item){
  const pingat = item.pingat || item.medal || "";
  const ak = (item.anugerahKhas || item.specialAward || "").toLowerCase() === "yes";
  const namaAK = item.namaAnugerahKhas || item.specialAwardName || "";

  return `
    <div class="border rounded-2xl p-4 bg-white flex items-start justify-between gap-3">
      <div>
        <div class="font-semibold">${esc(item.namaEvent || item.eventName || "-")}</div>
        <div class="text-sm text-slate-600">${esc(item.tahun || "-")} • ${esc(item.peringkat || "-")} • <span class="font-medium">${esc(pingat || "-")}</span></div>
        <div class="text-xs text-slate-500 mt-1">
          Anugerah khas: ${ak ? "yes" : "no"} ${ak && namaAK ? "• "+esc(namaAK) : ""}
        </div>
      </div>
      <button class="btnDelComp px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-sm"
        data-id="${esc(item.compId || item.id || item.competitionId || "")}">
        Delete
      </button>
    </div>
  `;
}

async function loadCompetitions(){
  if (!needSelected()) return;

  try{
    // ✅ pastikan backend ada action ni; kalau lain, tukar kat sini
    const r = await api("listCompetitions", {
      token: store.token,
      innovationId: store.selectedInnovation
    }, "GET");

    const items = r.items || [];
    $("#compList").innerHTML = items.map(compRow).join("");
    $("#compEmpty").classList.toggle("hidden", items.length > 0);

    $all(".btnDelComp").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const id = btn.dataset.id;
        if (!id) return setAlert("err", "Missing competition id (compId).");
        if (!confirm("Delete rekod pertandingan ini?")) return;

        try{
          // ✅ tukar kalau backend lain
          await api("deleteCompetition", { token: store.token, body: { compId: id, innovationId: store.selectedInnovation } }, "POST");
          await loadCompetitions();
          setAlert("ok", "Rekod pertandingan dibuang.");
        }catch(e){
          setAlert("err", e.message || String(e));
        }
      });
    });

  }catch(e){
    console.error(e);
    setAlert("err", e.message || String(e));
  }
}

function bindCompetitionsForm(){
  const cb = $("#cAnugerahKhas");
  const box = $("#cNamaAnugerahKhas");

  cb.onchange = ()=>{
    if (cb.checked) box.classList.remove("hidden");
    else { box.classList.add("hidden"); box.value = ""; }
  };

  $("#btnAddComp").onclick = async ()=>{
    try{
      if (!needSelected()) return;
      setAlert("", "");

      const namaEvent = $("#cNamaEvent").value.trim();
      const tahun = $("#cTahun").value.trim();
      const peringkat = $("#cPeringkat").value.trim();
      const pingat = $("#cPingat").value.trim();

      const anugerahKhas = cb.checked ? "yes" : "no";
      const namaAnugerahKhas = box.value.trim();

      if (!namaEvent) throw new Error("Nama event diperlukan.");
      if (!tahun) throw new Error("Tahun diperlukan.");

      // ✅ tukar action kalau backend lain
      await api("addCompetition", {
        token: store.token,
        body: {
          innovationId: store.selectedInnovation,
          namaEvent, tahun, peringkat, pingat,
          anugerahKhas, namaAnugerahKhas
        }
      }, "POST");

      $("#cNamaEvent").value = "";
      $("#cTahun").value = "";
      $("#cPeringkat").value = "";
      $("#cPingat").value = "";
      cb.checked = false;
      box.value = "";
      box.classList.add("hidden");

      await loadCompetitions();
      setAlert("ok", "Pertandingan berjaya ditambah.");
    }catch(e){
      setAlert("err", e.message || String(e));
    }
  };
}

/* -------------------------
   Boot
------------------------- */
document.addEventListener("DOMContentLoaded", async ()=>{
  setAlert("", "");
  bindTabs();

  $("#btnLogout").onclick = ()=>{
    clearSession();
    setAlert("ok", "Dah logout.");
    showLogin();
  };

  $("#btnRefreshInv").onclick = loadInnovations;
  $("#btnRefreshTeam").onclick = loadTeam;
  $("#btnRefreshComp").onclick = loadCompetitions;

  bindAddInnovation();
  bindCompetitionsForm();

  const ok = await bootMe();
  if (ok){
    setMeUI();
    showApp();
    setTab("tabInnovations");
    await loadInnovations();
  }else{
    showLogin();
    initGSI();
  }
});
