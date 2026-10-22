// Cloudflare Worker: «посередник» між твоїм сайтом і сайтом ДТЕК.
// Бере місто + вулицю + будинок і повертає чергу, наприклад {"queue":"GPV4.1"}.
// Додай ?debug=1 до адреси, щоб побачити «сиру» відповідь ДТЕК (для діагностики).

const OPS = {
  kem:  "https://www.dtek-kem.com.ua",   // Київ
  krem: "https://www.dtek-krem.com.ua",  // Київська область
};
const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "*",
};
const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json; charset=utf-8", ...CORS } });
const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "").replace(/[іi]/g, "и").replace(/,/g, "");

async function session(base) {
  const page = await fetch(base + "/ua/shutdowns", { headers: { "user-agent": UA, accept: "text/html" } });
  const html = await page.text();
  const csrf = (html.match(/name="csrf-token"\s+content="([^"]+)"/i) || [])[1] || "";
  let cookies = [];
  if (page.headers.getSetCookie) cookies = page.headers.getSetCookie().map((c) => c.split(";")[0]);
  return { csrf, cookie: cookies.join("; "), status: page.status };
}

async function ajax(base, ses, fields) {
  const body = new URLSearchParams();
  body.set("method", fields.method);
  Object.entries(fields.data || {}).forEach(([k, v], i) => {
    body.set(`data[${i}][name]`, k);
    body.set(`data[${i}][value]`, v);
  });
  const r = await fetch(base + "/ua/ajax", {
    method: "POST",
    headers: {
      "user-agent": UA,
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-requested-with": "XMLHttpRequest",
      "x-csrf-token": ses.csrf,
      cookie: ses.cookie,
      referer: base + "/ua/shutdowns",
      origin: base,
    },
    body,
  });
  const text = await r.text();
  try { return { status: r.status, json: JSON.parse(text), text }; }
  catch (e) { return { status: r.status, json: null, text }; }
}

export default {
  async fetch(req) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const u = new URL(req.url), q = u.searchParams;
    const base = OPS[q.get("op") || "krem"];
    if (!base) return json({ error: "Невідомий оператор" }, 400);
    const city = (q.get("city") || "").trim(), street = (q.get("street") || "").trim(), house = (q.get("house") || "").trim();
    const debug = q.get("debug") === "1";
    if (!city || !street) return json({ error: "Вкажіть місто і вулицю" }, 400);
    try {
      const ses = await session(base);
      const now = new Date();
      const upd = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} ${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
      const res = await ajax(base, ses, { method: "getHomeNum", data: { city, street, updateFact: upd } });
      if (debug) return json({ session: { csrf: !!ses.csrf, cookie: !!ses.cookie, status: ses.status }, status: res.status, raw: res.text.slice(0, 1500) });
      const houses = res.json && res.json.data;
      if (!houses || typeof houses !== "object") return json({ error: "ДТЕК не повернув список будинків. Спробуйте ?debug=1", status: res.status }, 502);
      if (!house) return json({ houses: Object.keys(houses) });
      const key = Object.keys(houses).find((k) => norm(k) === norm(house));
      if (!key) return json({ error: "Будинок не знайдено на цій вулиці", houses: Object.keys(houses).slice(0, 60) }, 404);
      const g = houses[key].sub_type_reason;
      const queue = Array.isArray(g) ? g[0] : g;
      if (!queue) return json({ error: "Для цього будинку немає черги" }, 404);
      return json({ queue: /^GPV/.test(queue) ? queue : "GPV" + queue, house: key });
    } catch (e) {
      return json({ error: "Помилка запиту: " + String(e && e.message || e).slice(0, 80) }, 500);
    }
  },
};
