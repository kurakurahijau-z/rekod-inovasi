function getToken() {
  return localStorage.getItem(window.APP_CONFIG.STORAGE_TOKEN);
}

function getEmail() {
  return localStorage.getItem(window.APP_CONFIG.STORAGE_EMAIL);
}

function setSession(email, token) {
  localStorage.setItem(window.APP_CONFIG.STORAGE_EMAIL, email);
  localStorage.setItem(window.APP_CONFIG.STORAGE_TOKEN, token);
}

function clearSession() {
  localStorage.clear();
}

function requireLogin() {
  if (!getToken()) {
    location.href = "./index.html";
  }
}

async function apiGet(params) {
  const url = new URL(window.APP_CONFIG.BASE_URL);
  Object.entries(params).forEach(([k, v]) =>
    url.searchParams.set(k, v)
  );

  const res = await fetch(url.toString());
  return await res.json();
}
