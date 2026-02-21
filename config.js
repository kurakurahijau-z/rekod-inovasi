// config.js
window.APP_CONFIG = {
  // Letak URL googleusercontent yang kau test tadi (yang keluar JSON OK)
  // Contoh: https://script.googleusercontent.com/a/macros/pms.edu.my/echo?user_content_key=...&lib=...
  API_BASE: "https://script.google.com/macros/s/AKfycbw5B9rmptyZuBJ7nIf1rHZBA7in4emEJF2Ubaep0pFDerua6APFXsoU_XdJpyhuy7KO/exec",

  // Ini mesti client id sebenar dari Google Cloud Console (OAuth 2.0 Client ID)
  // Format dia macam: 1234567890-xxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
  GOOGLE_CLIENT_ID: "637964120539-4knkg8lrjdaludsn8gncjidse7bpl23m.apps.googleusercontent.com",

  // Domain restriction
  ALLOWED_DOMAIN: "pms.edu.my"
};
