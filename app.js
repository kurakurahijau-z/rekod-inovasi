// app.js
(() => {
  const cfg = window.APP_CONFIG;

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));

  const store = {
    get token(){ return localStorage.getItem("ri_token") || ""; },
    set token(v){ localStorage.setItem("ri_token", v || ""); },
    get email(){ return localStorage.getItem("ri_email") || ""; },
    set email(v){ localStorage.setItem("ri_email", v || ""); },
    get role(){ return localStorage.getItem("ri_role") || ""; },
    set role(v){ localStorage.setItem("ri_role", v || ""); },
    clear(){ localStorage.removeItem("ri_token"); localStorage.removeItem("ri_email"); localStorage.removeItem("ri_role"); }
  };

  // ===== JSONP core =====
  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const cbName = "cb_" + Math.random().toString(36).slice(2);
      const s = document.createElement("script");
      const sep = url.includes("?") ? "&" : "?";
      s.src = `${url}${sep}callback=${cbName}`;
      s.async = true;

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Proxy timeout"));
      }, 15000);

      function cleanup() {
        clearTimeout(timeout);
        try { delete window[cbName]; } catch(_) { window[cbName] = undefined; }
        if (s && s.parentNode) s.parentNode.removeChild(s);
      }

      window[cbName] = (data) => {
        cleanup();
        resolve(data);
      };

      s.onerror = () => {
        cleanup();
        reject(new Error("Network error"));
      };

      document.body.appendChild(s);
    });
  }

  function b64url(obj){
    const json = JSON.stringify(obj || {});
    const bytes = new TextEncoder().encode(json);
    let bin = "";
    bytes.forEach(b => bin += String.fromCharCode(b));
    const b64 = btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
    return b64;
  }

  async function api(action, params = {}, payloadObj = null) {
    const u = new URL(cfg.API_BASE);
    u.searchParams.set("action", action);

    Object.entries(params || {}).forEach(([k,v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== "") u.searchParams.set(k, v);
    });

    if (payloadObj) u.searchParams.set("payload", b64url(payloadObj));

    const data = await jsonp(u.toString());
    if (!data || data.ok !== true) throw new Error((data && data.error) ? data.error : "Request failed");
    return data;
  }

  // ===== UI =====
  function setStatus(msg, type="info"){
    const el = $("#status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "text-sm mt-2 " + (type==="err" ? "text-red-600" : type==="ok" ? "text-green-700" : "text-slate-600");
  }

  function show(view){
    document.querySelectorAll("[data-view]").forEach(v => v.classList.add("hidden"));
    $(`[data-view="${view}"]`)?.classList.remove("hidden");
  }

  async function boot(){
    // render Google button
    if (!window.google || !google.accounts || !google.accounts.id) {
      setStatus("Google Identity script belum load. Refresh page.", "err");
      return;
    }

    google.accounts.id.initialize({
      client_id: cfg.GOOGLE_CLIENT_ID,
      callback: onGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: true
    });

    google.accounts.id.renderButton(
      $("#googleBtn"),
      { theme: "outline", size: "large", width: 320 }
    );

    // if already logged in
    if (store.token) {
      try {
        const me = await api("me", { token: store.token });
        store.email = me.email;
        store.role = me.role;
        await loadDashboard();
        return;
      } catch(e) {
        store.clear();
      }
    }

    show("login");
  }

  async function onGoogleCredential(resp){
    try{
      setStatus("Login sedang diproses…");
      const out = await api("loginGoogle", { credential: resp.credential });
      store.token = out.token;
      store.email = out.email;
      store.role = out.role;
      setStatus("Login berjaya ✅", "ok");
      await loadDashboard();
    }catch(e){
      setStatus("Login gagal: " + e.message, "err");
    }
  }

  async function loadDashboard(){
    show("app");
    $("#meEmail").textContent = store.email || "-";
    $("#meRole").textContent = store.role || "user";
    await refreshInnovations();
  }

  async function refreshInnovations(){
    $("#innovList").innerHTML = `<div class="text-slate-500 text-sm">Loading…</div>`;
    try{
      const res = await api("listMyInnovations", { token: store.token });
      renderInnovations(res.items || []);
    }catch(e){
      $("#innovList").innerHTML = `<div class="text-red-600 text-sm">Gagal load: ${esc(e.message)}</div>`;
    }
  }

  function renderInnovations(items){
    if (!items.length) {
      $("#innovList").innerHTML = `<div class="text-slate-500 text-sm">Belum ada rekod inovasi.</div>`;
      return;
    }

    $("#innovList").innerHTML = items.map(x => `
      <div class="border rounded-xl p-3 bg-white">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="font-semibold">${esc(x.tajuk)}</div>
            <div class="text-xs text-slate-600 mt-1">
              <span class="inline-block mr-2">Tahun: <b>${esc(x.tahun)}</b></span>
              <span class="inline-block mr-2">Kategori: <b>${esc(x.kategori)}</b></span>
              <span class="inline-block mr-2">Status: <b>${esc(x.status)}</b></span>
            </div>
            <div class="text-xs text-slate-500 mt-1">ID: ${esc(x.innovationId)}</div>
          </div>
          <div class="flex flex-col gap-2">
            <button class="px-3 py-1 rounded-lg border text-sm hover:bg-slate-50" data-act="team" data-id="${esc(x.innovationId)}">Team</button>
            <button class="px-3 py-1 rounded-lg border text-sm hover:bg-slate-50" data-act="comps" data-id="${esc(x.innovationId)}">Pertandingan</button>
            <button class="px-3 py-1 rounded-lg border text-sm text-red-600 hover:bg-red-50" data-act="del" data-id="${esc(x.innovationId)}">Delete</button>
          </div>
        </div>
      </div>
    `).join("");

    $("#innovList").querySelectorAll("button[data-act]").forEach(btn=>{
      btn.addEventListener("click", async () => {
        const act = btn.getAttribute("data-act");
        const id = btn.getAttribute("data-id");
        if (act === "del") return delInnovation(id);
        if (act === "team") return openTeam(id);
        if (act === "comps") return openComps(id);
      });
    });
  }

  async function delInnovation(innovationId){
    if (!confirm("Confirm delete inovasi ini?")) return;
    try{
      await api("deleteInnovation", { token: store.token }, { innovationId });
      await refreshInnovations();
    }catch(e){
      alert("Delete gagal: " + e.message);
    }
  }

  // ===== Add innovation =====
  async function addInnovationFromForm(){
    const tajuk = $("#fTajuk").value.trim();
    const tahun = $("#fTahun").value.trim();
    const kategori = $("#fKategori").value.trim();
    const status = $("#fStatus").value.trim();
    const myipoStatus = $("#fMyipoStatus").value.trim();
    const myipoNumber = $("#fMyipoNumber").value.trim();

    try{
      await api("addInnovation", { token: store.token }, { tajuk, tahun, kategori, status, myipoStatus, myipoNumber });
      $("#fTajuk").value = "";
      $("#fTahun").value = "";
      $("#fKategori").value = "";
      $("#fStatus").value = "";
      $("#fMyipoStatus").value = "";
      $("#fMyipoNumber").value = "";
      await refreshInnovations();
    }catch(e){
      alert("Add gagal: " + e.message);
    }
  }

  // ===== Team UI =====
  async function openTeam(innovationId){
    show("team");
    $("#teamInnovId").textContent = innovationId;
    $("#teamList").innerHTML = `<div class="text-slate-500 text-sm">Loading…</div>`;
    try{
      const res = await api("listTeam", { token: store.token, innovationId });
      renderTeam(res.items || [], innovationId);
    }catch(e){
      $("#teamList").innerHTML = `<div class="text-red-600 text-sm">Gagal load team: ${esc(e.message)}</div>`;
    }
  }

  function renderTeam(items, innovationId){
    if (!items.length) {
      $("#teamList").innerHTML = `<div class="text-slate-500 text-sm">Belum ada team member.</div>`;
    } else {
      $("#teamList").innerHTML = items.map(m => `
        <div class="border rounded-lg p-2 bg-white flex items-center justify-between gap-2">
          <div>
            <div class="text-sm font-medium">${esc(m.memberName || "-")}</div>
            <div class="text-xs text-slate-600">${esc(m.memberEmail)}</div>
            <div class="text-xs text-slate-500">Role: ${esc(m.roleInTeam)}</div>
          </div>
          <button class="px-3 py-1 rounded-lg border text-sm text-red-600 hover:bg-red-50" data-teamdel="${esc(m.teamId)}">Remove</button>
        </div>
      `).join("");

      $("#teamList").querySelectorAll("button[data-teamdel]").forEach(b=>{
        b.addEventListener("click", async ()=>{
          const teamId = b.getAttribute("data-teamdel");
          if (!confirm("Remove member ni?")) return;
          try{
            await api("deleteTeam", { token: store.token }, { teamId, innovationId });
            await openTeam(innovationId);
          }catch(e){
            alert("Remove gagal: " + e.message);
          }
        });
      });
    }

    $("#teamAddBtn").onclick = async () => {
      const memberEmail = $("#teamEmail").value.trim().toLowerCase();
      const memberName = $("#teamName").value.trim();
      const roleInTeam = $("#teamRole").value.trim() || "member";
      try{
        await api("addTeam", { token: store.token }, { innovationId, memberEmail, memberName, roleInTeam });
        $("#teamEmail").value = "";
        $("#teamName").value = "";
        $("#teamRole").value = "member";
        await openTeam(innovationId);
      }catch(e){
        alert("Add team gagal: " + e.message);
      }
    };

    $("#teamBack").onclick = () => show("app");
  }

  // ===== Competitions UI =====
  async function openComps(innovationId){
    show("comps");
    $("#compInnovId").textContent = innovationId;
    $("#compList").innerHTML = `<div class="text-slate-500 text-sm">Loading…</div>`;
    try{
      const res = await api("listCompetitions", { token: store.token, innovationId });
      renderComps(res.items || [], innovationId);
    }catch(e){
      $("#compList").innerHTML = `<div class="text-red-600 text-sm">Gagal load: ${esc(e.message)}</div>`;
    }
  }

  function renderComps(items, innovationId){
    if (!items.length) {
      $("#compList").innerHTML = `<div class="text-slate-500 text-sm">Belum ada rekod pertandingan.</div>`;
    } else {
      $("#compList").innerHTML = items.map(c => `
        <div class="border rounded-lg p-2 bg-white flex items-start justify-between gap-2">
          <div>
            <div class="text-sm font-semibold">${esc(c.namaEvent || "-")}</div>
            <div class="text-xs text-slate-600 mt-1">
              Tahun: <b>${esc(c.tahun)}</b> • Peringkat: <b>${esc(c.peringkat)}</b> • Pingat: <b>${esc(c.pingat)}</b>
            </div>
            <div class="text-xs text-slate-500 mt-1">
              Anugerah khas: ${esc(c.anugerahKhas)} ${c.namaAnugerahKhas ? "— "+esc(c.namaAnugerahKhas) : ""}
            </div>
            <div class="text-xs text-slate-500 mt-1">ID: ${esc(c.compId)}</div>
          </div>
          <button class="px-3 py-1 rounded-lg border text-sm text-red-600 hover:bg-red-50" data-compdel="${esc(c.compId)}">Delete</button>
        </div>
      `).join("");

      $("#compList").querySelectorAll("button[data-compdel]").forEach(b=>{
        b.addEventListener("click", async ()=>{
          const compId = b.getAttribute("data-compdel");
          if (!confirm("Delete rekod pertandingan ni?")) return;
          try{
            await api("deleteCompetition", { token: store.token }, { compId, innovationId });
            await openComps(innovationId);
          }catch(e){
            alert("Delete gagal: " + e.message);
          }
        });
      });
    }

    $("#compAddBtn").onclick = async () => {
      const namaEvent = $("#cNamaEvent").value.trim();
      const tahun = $("#cTahun").value.trim();
      const peringkat = $("#cPeringkat").value.trim();
      const pingat = $("#cPingat").value.trim();
      const anugerahKhas = $("#cAnugerahKhas").value.trim();
      const namaAnugerahKhas = $("#cNamaAnugerahKhas").value.trim();

      try{
        await api("addCompetition", { token: store.token }, {
          innovationId, namaEvent, tahun, peringkat, pingat, anugerahKhas, namaAnugerahKhas
        });

        $("#cNamaEvent").value = "";
        $("#cTahun").value = "";
        $("#cPeringkat").value = "";
        $("#cPingat").value = "";
        $("#cAnugerahKhas").value = "";
        $("#cNamaAnugerahKhas").value = "";

        await openComps(innovationId);
      }catch(e){
        alert("Add gagal: " + e.message);
      }
    };

    $("#compBack").onclick = () => show("app");
  }

  // ===== buttons =====
  function bind(){
    $("#logoutBtn").addEventListener("click", ()=>{
      store.clear();
      location.reload();
    });
    $("#addInnovBtn").addEventListener("click", addInnovationFromForm);
    $("#refreshBtn").addEventListener("click", refreshInnovations);
  }

  window.addEventListener("load", () => {
    bind();
    boot();
  });

})();
