const url = "https://goodtrading.up.railway.app/assets/index-BXT1oMOW.js";
const js = await fetch(url).then((r) => r.text());
const idx = js.indexOf("/api/auth/login");
console.log(js.slice(idx - 50, idx + 1200));
