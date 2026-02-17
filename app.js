async function apiGet(params){
  const url = new URL(window.APP_CONFIG.BASE_URL);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { method:"GET" });
  return await res.json();
}

function setSession(email, token, role){
  localStorage.setItem(window.APP_CONFIG.STORAGE_EMAIL, email);
  localStorage.setItem(window.APP_CONFIG.STORAGE_TOKEN, token);
  localStorage.setItem(window.APP_CONFIG.STORAGE_ROLE, role || "user");
}

function clearSession(){
  localStorage.removeItem(window.APP_CONFIG.STORAGE_EMAIL);
  localStorage.removeItem(window.APP_CONFIG.STORAGE_TOKEN);
  localStorage.removeItem(window.APP_CONFIG.STORAGE_ROLE);
}

function getEmail(){ return localStorage.getItem(window.APP_CONFIG.STORAGE_EMAIL) || ""; }
function getToken(){ return localStorage.getItem(window.APP_CONFIG.STORAGE_TOKEN) || ""; }
function getRole(){ return localStorage.getItem(window.APP_CONFIG.STORAGE_ROLE) || "user"; }

function requireSessionOrRedirect(){
  if (!getToken() || !getEmail()) location.href = "./index.html";
}

function setStatus(msg, type="info"){
  const el = document.getElementById("statusText");
  if (!el) return;
  el.textContent = msg || "";
  el.className =
    "text-sm mt-3 " +
    (type==="ok" ? "text-emerald-700" :
     type==="err" ? "text-rose-700" : "text-slate-500");
}
