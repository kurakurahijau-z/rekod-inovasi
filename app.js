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
    const st = qs("#loginStatus");
    if (st) st.textContent = "Signing in…";

    const r = await apiGet("loginGoogle", { credential: resp.credential });
    if (!r.ok) throw new Error(r.error || "Login failed");

    setToken(r.token);
    localStorage.setItem("email", r.email);
    localStorage.setItem("role", r.role);

    location.href = "./dashboard.html";
  } catch (e) {
    const st = qs("#loginStatus");
    if (st) st.textContent = "Login failed: " + e.message;
  }
}

function normalizeYesNo(v){
  const s = String(v || "").trim().toLowerCase();
  if (["yes","ya","y","true","1"].includes(s)) return "yes";
  if (["no","n","tidak","false","0"].includes(s)) return "no";
  return s;
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

  // load my innovations
  const token = getToken();
  const r = await apiGet("listMyInnovations", { token });
  const items = (r.ok ? (r.items||[]) : []);

  const sel = qs("#innovationId");
  if (sel){
    sel.innerHTML = "";
    if (!items.length){
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Tiada inovasi (sila tambah inovasi dulu)";
      sel.appendChild(opt);
    } else {
      for (const it of items){
        const opt = document.createElement("option");
        opt.value = String(it.innovationId||"").trim();
        opt.textContent = `${it.tajuk || "(no title)"} (${it.tahun || ""})`;
        sel.appendChild(opt);
      }
    }
  }

  const akSel = qs("#anugerahKhas");
  if (akSel){
    akSel.addEventListener("change", () => toggleAnugerahKhasBox_());
    toggleAnugerahKhasBox_();
  }
}

function toggleAnugerahKhasBox_(){
  const v = normalizeYesNo(qs("#anugerahKhas")?.value || "");
  const box = qs("#anugerahKhasBox");
  if (box) box.style.display = (v === "yes") ? "block" : "none";
  if (v !== "yes"){
    const f = qs("#namaAnugerahKhas");
    if (f) f.value = "";
  }
}

async function submitCompetition(e){
  e.preventDefault();

  const token = getToken();
  const msg = qs("#saveMsg");
  if (msg) msg.textContent = "Saving…";

  const payload = {
    innovationId: String(qs("#innovationId")?.value || "").trim(),
    namaEvent: String(qs("#namaEvent")?.value || "").trim(),
    tahun: String(qs("#tahun")?.value || "").trim(),
    peringkat: String(qs("#peringkat")?.value || "").trim(),
    pingat: String(qs("#pingat")?.value || "").trim(),
    anugerahKhas: String(qs("#anugerahKhas")?.value || "").trim(),
    namaAnugerahKhas: String(qs("#namaAnugerahKhas")?.value || "").trim(),
  };

  const r = await apiPost("addCompetition", { token }, payload);
  if (!r.ok){
    if (msg) msg.textContent = "Gagal: " + (r.error || "");
    return;
  }

  if (msg) msg.textContent = "Berjaya simpan ✅";
  setTimeout(()=> location.href="./dashboard.html", 600);
}

/* =========================
   common
========================= */

function doLogout() {
  clearToken();
  location.href = "./index.html";
}
