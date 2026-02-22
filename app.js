const CFG = window.APP_CONFIG || {};
const $ = (id) => document.getElementById(id);

const state = {
  token: "",
  email: "",
  role: "user",
  selectedInnovationId: "",
  selectedInnovationTitle: ""
};

function saveLocal(){
  localStorage.setItem("ri_state", JSON.stringify({
    token: state.token,
    email: state.email,
    role: state.role,
    selectedInnovationId: state.selectedInnovationId,
    selectedInnovationTitle: state.selectedInnovationTitle
  }));
}

function loadLocal(){
  try{
    const raw = localStorage.getItem("ri_state");
    if(!raw) return;
    const s = JSON.parse(raw);
    state.token = s.token || "";
    state.email = s.email || "";
    state.role = s.role || "user";
    state.selectedInnovationId = s.selectedInnovationId || "";
    state.selectedInnovationTitle = s.selectedInnovationTitle || "";
  }catch(e){}
}

function clearLocal(){
  localStorage.removeItem("ri_state");
  state.token = "";
  state.email = "";
  state.role = "user";
  state.selectedInnovationId = "";
  state.selectedInnovationTitle = "";
}

function showMsg(msg){
  const box = $("globalMsg");
  if(!msg){
    box.classList.add("hidden");
    box.textContent = "";
    return;
  }
  box.classList.remove("hidden");
  box.textContent = msg;
}

function setSelectedInnovation(id, title){
  state.selectedInnovationId = id || "";
  state.selectedInnovationTitle = title || "";
  $("selectedInnovationTitle").textContent = state.selectedInnovationTitle || "-";
  saveLocal();
}

function requireInnovation(){
  if(!state.selectedInnovationId){
    showMsg("Pilih inovasi dulu kat tab Inovasi.");
    return false;
  }
  showMsg("");
  return true;
}

async function api(action, body = null){
  const base = CFG.API_BASE;
  if(!base) throw new Error("API_BASE belum set dalam config.js");

  const url = new URL(base);
  url.searchParams.set("action", action);
  if(state.token) url.searchParams.set("token", state.token);
  if(body && typeof body === "object"){
    url.searchParams.set("payload", JSON.stringify(body));
  }

  const res = await fetch(url.toString(), { method: "GET" });
  const txt = await res.text();
  let data = {};
  try { data = JSON.parse(txt); }
  catch(e) { data = { ok:false, error:"Invalid JSON: "+txt.slice(0,120) }; }
  return data;
}

function initGoogleButton(){
  const clientId = CFG.GOOGLE_CLIENT_ID;
  if (!clientId) {
    $("loginMsg").textContent = "GOOGLE_CLIENT_ID belum set dalam config.js";
    return;
  }

  const mount = () => {
    if (!window.google || !google.accounts || !google.accounts.id) {
      $("loginMsg").textContent = "Loading login Google...";
      setTimeout(mount, 250);
      return;
    }

    $("loginMsg").textContent = "";
    $("googleBtn").innerHTML = "";

    google.accounts.id.initialize({
      client_id: clientId,
      callback: async (resp) => {
        try{
          $("loginMsg").textContent = "Sedang login...";
          const credential = resp && resp.credential ? resp.credential : "";
          if (!credential) throw new Error("No credential from Google");

          const out = await api("loginGoogle", { credential });
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

    google.accounts.id.renderButton(
      $("googleBtn"),
      { theme:"outline", size:"large", shape:"pill", width: 340 }
    );
  };

  mount();
}

function activateTab(tabId){
  document.querySelectorAll(".tabPane").forEach(el => el.classList.add("hidden"));
  $(tabId).classList.remove("hidden");

  document.querySelectorAll(".tabBtn").forEach(btn=>{
    const active = btn.dataset.tab === tabId;
    btn.classList.toggle("bg-slate-900", active);
    btn.classList.toggle("text-white", active);
    btn.classList.toggle("border-slate-900", active);
  });

  if(tabId === "tabTeam") renderTeam();
  if(tabId === "tabPertandingan") renderCompetitions();
  if(tabId === "tabInovasi") renderInnovations();
  if(tabId === "tabProfil") renderProfil();
}

function renderProfil(){
  $("profilEmail").textContent = state.email || "-";
  $("profilRole").textContent = state.role || "-";
}

/** ===== EDIT MODAL ===== */
function openEditModal(inv){
  $("editId").value = inv.id || "";
  $("editTajuk").value = inv.tajuk || "";
  $("editTahun").value = inv.tahun || "";
  $("editKategori").value = inv.kategori || "";
  $("editStatus").value = inv.status || "";
  $("editMyipoStatus").value = (inv.myipoStatus || "").toLowerCase();
  $("editMyipoNumber").value = inv.myipoNumber || "";
  $("editModal").classList.remove("hidden");
  $("editModal").classList.add("flex");
}

function closeEditModal(){
  $("editModal").classList.add("hidden");
  $("editModal").classList.remove("flex");
}

$("btnCloseEdit")?.addEventListener("click", closeEditModal);
$("editModal")?.addEventListener("click", (e)=>{
  if(e.target && e.target.id === "editModal") closeEditModal();
});

$("btnSaveEdit")?.addEventListener("click", async ()=>{
  try{
    const id = $("editId").value.trim();
    if(!id) throw new Error("Missing innovation id");

    const payload = {
      id,
      tajuk: $("editTajuk").value.trim(),
      tahun: $("editTahun").value.trim(),
      kategori: $("editKategori").value.trim(),
      status: $("editStatus").value.trim(),
      myipoStatus: $("editMyipoStatus").value.trim(),
      myipoNumber: $("editMyipoNumber").value.trim()
    };

    if(!payload.tajuk) throw new Error("Tajuk diperlukan");
    if(!payload.tahun) throw new Error("Tahun diperlukan");

    const out = await api("updateInnovation", payload);
    if(!out.ok) throw new Error(out.error || "Gagal update inovasi");

    // kalau inovasi yang sedang dipilih, update title kat header
    if(state.selectedInnovationId === id){
      setSelectedInnovation(id, payload.tajuk);
    }

    closeEditModal();
    await renderInnovations();
  }catch(e){
    showMsg(e.message || String(e));
  }
});

$("btnDeleteInv")?.addEventListener("click", async ()=>{
  try{
    const id = $("editId").value.trim();
    if(!id) throw new Error("Missing innovation id");

    const ok = confirm("Confirm delete inovasi ini? (Team & Pertandingan bawahnya akan ikut padam)");
    if(!ok) return;

    const out = await api("deleteInnovation", { id });
    if(!out.ok) throw new Error(out.error || "Gagal delete inovasi");

    // kalau delete inovasi yang sedang dipilih, reset selection
    if(state.selectedInnovationId === id){
      setSelectedInnovation("", "");
    }

    closeEditModal();
    await renderInnovations();
  }catch(e){
    showMsg(e.message || String(e));
  }
});

/** ===== INOVASI LIST ===== */
async function renderInnovations(){
  const out = await api("listMyInnovations");
  if(!out.ok) { showMsg(out.error || "Gagal load inovasi"); return; }

  const list = $("inovasiList");
  list.innerHTML = "";

  const items = out.items || [];
  if(items.length === 0){
    list.innerHTML = `<div class="text-sm text-slate-500">Belum ada inovasi. Tambah kat sebelah kanan.</div>`;
    return;
  }

  items.forEach(it=>{
    const active = it.id === state.selectedInnovationId;

    const wrap = document.createElement("div");
    wrap.className = `rounded-2xl border px-4 py-3 ${active ? "border-emerald-300 bg-emerald-50" : "border-slate-100 bg-white"}`;

    wrap.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <button class="text-left flex-1 hover:opacity-90">
          <div class="font-semibold">${escapeHtml(it.tajuk || "(tiada tajuk)")}</div>
          <div class="text-xs text-slate-500 mt-1">
            Tahun: ${escapeHtml(it.tahun||"-")} • Kategori: ${escapeHtml(it.kategori||"-")} • Status: ${escapeHtml(it.status||"-")}
          </div>
          <div class="text-xs text-slate-500 mt-1">
            MYIPO: ${escapeHtml((it.myipoStatus||"-").toString())} ${it.myipoNumber ? "• "+escapeHtml(it.myipoNumber) : ""}
          </div>
        </button>

        <button class="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50">
          Edit
        </button>
      </div>
    `;

    // click select
    wrap.querySelector("button.text-left").onclick = () => {
      setSelectedInnovation(it.id, it.tajuk || "-");
      showMsg("");
      renderInnovations();
    };

    // click edit
    wrap.querySelectorAll("button")[1].onclick = () => openEditModal(it);

    list.appendChild(wrap);
  });
}

async function renderTeam(){
  if(!requireInnovation()) return;

  const out = await api("listTeam", { innovationId: state.selectedInnovationId });
  if(!out.ok) { showMsg(out.error || "Gagal load team"); return; }

  const list = $("teamList");
  list.innerHTML = "";

  const items = out.items || [];
  if(items.length === 0){
    list.innerHTML = `<div class="text-sm text-slate-500">Belum ada ahli team.</div>`;
    return;
  }

  items.forEach(m=>{
    const div = document.createElement("div");
    div.className = "rounded-2xl border border-slate-100 bg-white px-4 py-3 flex items-start justify-between gap-3";
    div.innerHTML = `
      <div>
        <div class="font-semibold">${escapeHtml(m.nama || "-")}</div>
        <div class="text-sm text-slate-600">${escapeHtml(m.email || "-")}</div>
        <div class="text-xs text-slate-500 mt-1">Peranan: ${escapeHtml(m.peranan || "member")}</div>
      </div>
      <button class="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-50">Buang</button>
    `;
    div.querySelector("button").onclick = async () => {
      const ok = confirm("Buang ahli ini?");
      if(!ok) return;
      const del = await api("deleteTeam", { id: m.id, innovationId: state.selectedInnovationId });
      if(!del.ok) { showMsg(del.error || "Gagal buang"); return; }
      renderTeam();
    };
    list.appendChild(div);
  });
}

async function renderCompetitions(){
  if(!requireInnovation()) return;

  const out = await api("listCompetitions", { innovationId: state.selectedInnovationId });
  if(!out.ok) { showMsg(out.error || "Gagal load pertandingan"); return; }

  const list = $("compList");
  list.innerHTML = "";

  const items = out.items || [];
  if(items.length === 0){
    list.innerHTML = `<div class="text-sm text-slate-500">Belum ada rekod pertandingan.</div>`;
    return;
  }

  items.forEach(c=>{
    const badge = c.pingat ? `<span class="text-xs rounded-full px-2 py-1 border border-slate-200">${escapeHtml(c.pingat)}</span>` : "";
    const special = (c.anugerahKhas === "yes" || c.anugerahKhas === true) ? ` • <span class="text-xs text-emerald-700">Anugerah khas: ${escapeHtml(c.namaAnugerahKhas||"-")}</span>` : "";

    const div = document.createElement("div");
    div.className = "rounded-2xl border border-slate-100 bg-white px-4 py-3 flex items-start justify-between gap-3";
    div.innerHTML = `
      <div>
        <div class="font-semibold">${escapeHtml(c.namaEvent || "-")}</div>
        <div class="text-xs text-slate-500 mt-1">
          ${escapeHtml(c.tahun || "-")} • ${escapeHtml(c.peringkat || "-")} ${badge} ${special}
        </div>
      </div>
      <button class="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-50">Buang</button>
    `;
    div.querySelector("button").onclick = async () => {
      const ok = confirm("Buang rekod pertandingan ini?");
      if(!ok) return;
      const del = await api("deleteCompetition", { id: c.id || c.compId || "" });
      if(!del.ok) { showMsg(del.error || "Gagal buang"); return; }
      renderCompetitions();
    };
    list.appendChild(div);
  });
}

/** Staff search suggestions + autofill */
let staffTimer = null;
$("staffSearch")?.addEventListener("input", () => {
  clearTimeout(staffTimer);
  staffTimer = setTimeout(loadStaffSuggest, 250);
});

async function loadStaffSuggest(){
  const q = ($("staffSearch").value || "").trim();
  if(q.length < 2) return;

  const out = await api("searchStaff", { q });
  if(!out.ok) return;

  const dl = $("staffSuggest");
  dl.innerHTML = "";

  (out.items || []).forEach(it=>{
    const opt = document.createElement("option");
    opt.value = it.email || "";
    opt.label = it.name ? `${it.name}` : "";
    dl.appendChild(opt);
  });
}

$("staffSearch")?.addEventListener("change", async () => {
  const val = ($("staffSearch").value || "").trim().toLowerCase();
  if(!val) return;

  const out = await api("lookupStaff", { email: val });
  if(out.ok && out.found){
    $("memberEmail").value = out.email || val;
    $("memberName").value = out.name || "";
  }else{
    $("memberEmail").value = val;
    if(!$("memberName").value) $("memberName").value = "";
  }
});

/** Form handlers */
$("btnAddInovasi")?.addEventListener("click", async () => {
  try{
    const tajuk = $("invTajuk").value.trim();
    const tahun = $("invTahun").value.trim();
    const kategori = $("invKategori").value.trim();
    const status = $("invStatus").value.trim();
    const myipoStatus = $("invMyipoStatus").value.trim(); // select
    const myipoNumber = $("invMyipoNumber").value.trim();

    const out = await api("addInnovation", { tajuk, tahun, kategori, status, myipoStatus, myipoNumber });
    if(!out.ok) throw new Error(out.error || "Gagal simpan inovasi");

    $("invTajuk").value = "";
    $("invTahun").value = "";
    $("invKategori").value = "";
    $("invStatus").value = "";
    $("invMyipoStatus").value = "";
    $("invMyipoNumber").value = "";

    await renderInnovations();
  }catch(e){
    showMsg(e.message || String(e));
  }
});

$("btnAddMember")?.addEventListener("click", async () => {
  try{
    if(!requireInnovation()) return;

    const email = $("memberEmail").value.trim().toLowerCase();
    const nama  = $("memberName").value.trim();
    const peranan = $("memberRole").value.trim() || "member";

    if(!email) throw new Error("Email diperlukan");
    if(!nama) throw new Error("Nama diperlukan");

    const out = await api("addTeam", {
      innovationId: state.selectedInnovationId,
      email,
      nama,
      peranan
    });

    if(!out.ok) throw new Error(out.error || "Gagal tambah ahli");

    $("staffSearch").value = "";
    $("memberEmail").value = "";
    $("memberName").value = "";
    $("memberRole").value = "";

    renderTeam();
  }catch(e){
    showMsg(e.message || String(e));
  }
});

$("compHasSpecial")?.addEventListener("change", () => {
  const on = $("compHasSpecial").checked;
  $("compSpecialName").classList.toggle("hidden", !on);
  if(!on) $("compSpecialName").value = "";
});

$("btnAddComp")?.addEventListener("click", async () => {
  try{
    if(!requireInnovation()) return;

    const namaEvent = $("compNamaEvent").value.trim();
    const tahun = $("compTahun").value.trim();
    const peringkat = $("compPeringkat").value.trim();
    const pingat = $("compPingat").value.trim();
    const anugerahKhas = $("compHasSpecial").checked ? "yes" : "no";
    const namaAnugerahKhas = $("compHasSpecial").checked ? $("compSpecialName").value.trim() : "";

    if(!namaEvent) throw new Error("Nama event diperlukan");
    if(!tahun) throw new Error("Tahun diperlukan");
    if(!peringkat) throw new Error("Peringkat diperlukan");
    if(!pingat) throw new Error("Pingat diperlukan");
    if(anugerahKhas === "yes" && !namaAnugerahKhas){
      throw new Error("Nama anugerah khas diperlukan");
    }

    const out = await api("addCompetition", {
      innovationId: state.selectedInnovationId,
      namaEvent,
      tahun,
      peringkat,
      pingat,
      anugerahKhas,
      namaAnugerahKhas
    });

    if(!out.ok) throw new Error(out.error || "Gagal simpan pertandingan");

    $("compNamaEvent").value = "";
    $("compTahun").value = "";
    $("compPeringkat").value = "";
    $("compPingat").value = "";
    $("compHasSpecial").checked = false;
    $("compSpecialName").value = "";
    $("compSpecialName").classList.add("hidden");

    renderCompetitions();
  }catch(e){
    showMsg(e.message || String(e));
  }
});

async function bootAfterLogin(){
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");

  $("userBox").classList.remove("hidden");
  $("userEmail").textContent = state.email || "";
  $("userRole").textContent = state.role || "user";

  $("profilEmail").textContent = state.email || "-";
  $("profilRole").textContent = state.role || "-";

  $("selectedInnovationTitle").textContent = state.selectedInnovationTitle || "-";

  activateTab("tabInovasi");
}

$("btnLogout")?.addEventListener("click", () => {
  clearLocal();
  location.reload();
});

$("btnRefresh")?.addEventListener("click", async () => {
  showMsg("");
  await renderInnovations();
  if(state.selectedInnovationId){
    await renderTeam();
    await renderCompetitions();
  }
});

document.querySelectorAll(".tabBtn").forEach(btn=>{
  btn.addEventListener("click", ()=> activateTab(btn.dataset.tab));
});

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

(async function init(){
  loadLocal();

  if(state.token){
    try{
      const me = await api("me");
      if(me.ok){
        state.email = me.email || state.email;
        state.role = me.role || state.role;
        saveLocal();
        await bootAfterLogin();
        return;
      }
    }catch(e){
      clearLocal();
    }
  }

  $("loginView").classList.remove("hidden");
  $("appView").classList.add("hidden");
  $("userBox").classList.add("hidden");

  initGoogleButton();
})();
