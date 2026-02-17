function qs(k){ return new URLSearchParams(location.search).get(k); }

async function apiGet(params){
  const url = new URL(window.APP_CONFIG.BASE_URL);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { method:"GET" });
  return await res.json();
}

function setSession(email, token){
  localStorage.setItem(window.APP_CONFIG.STORAGE_EMAIL, email);
  localStorage.setItem(window.APP_CONFIG.STORAGE_TOKEN, token);
}

function clearSession(){
  localStorage.removeItem(window.APP_CONFIG.STORAGE_EMAIL);
  localStorage.removeItem(window.APP_CONFIG.STORAGE_TOKEN);
}

function getEmail(){ return localStorage.getItem(window.APP_CONFIG.STORAGE_EMAIL) || ""; }
function getToken(){ return localStorage.getItem(window.APP_CONFIG.STORAGE_TOKEN) || ""; }

function requireSessionOrRedirect(){
  const t = getToken();
  const e = getEmail();
  if (!t || !e) location.href = "./index.html";
}

function setStatus(msg, type){
  const el = document.getElementById("statusText");
  if (!el) return;
  el.textContent = msg || "";
  el.className = "text-sm mt-3 " + (
    type==="ok" ? "text-emerald-700" :
    type==="err" ? "text-rose-700" :
    "text-slate-500"
  );
}

function badgeStatus(s){
  const v = String(s||"").toLowerCase();
  if (v==="aktif") return `<span class="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800">aktif</span>`;
  if (!v) return `<span class="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700">-</span>`;
  return `<span class="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700">${escapeHtml_(s)}</span>`;
}

function escapeHtml_(s){
  return String(s||"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
