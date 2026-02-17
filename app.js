// ✅ BASE_URL backend Apps Script /exec (bukan googleusercontent echo)
window.APP_CONFIG = {
  BASE_URL: "https://script.google.com/macros/s/AKfycbw5B9rmptyZuBJ7nIf1rHZBA7in4emEJF2Ubaep0pFDerua6APFXsoU_XdJpyhuy7KO/exec",
  ALLOWED_DOMAIN: "pms.edu.my",
  STORAGE_TOKEN: "appToken",
  STORAGE_EMAIL: "email"
};

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
