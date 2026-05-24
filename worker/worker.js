// Hazard-zone air-quality Worker.
// Holds the PurpleAir READ key as an encrypted secret (env.PURPLEAIR_READ_KEY).
// A cron trigger refreshes sensors near the GKN plant into KV; the fetch handler
// serves the cached JSON to all visitors (edge-cached ~60s), so visitor count never
// drives PurpleAir API calls and the key never reaches the browser.

const BOX = 'nwlng=-118.15&nwlat=33.93&selng=-117.85&selat=33.63';

async function refresh(env) {
  const url = 'https://api.purpleair.com/v1/sensors'
    + '?fields=latitude,longitude,pm2.5_10minute,name&' + BOX
    + '&location_type=0&max_age=3600';
  const r = await fetch(url, { headers: { 'X-API-Key': env.PURPLEAIR_READ_KEY } });
  const d = await r.json();
  const fi = {}; (d.fields || []).forEach((f, i) => { fi[f] = i; });
  const sensors = [];
  for (const row of (d.data || [])) {
    const lat = row[fi['latitude']], lng = row[fi['longitude']], pm = row[fi['pm2.5_10minute']];
    if (lat == null || lng == null || pm == null) continue;
    sensors.push([Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5, Math.round(pm * 10) / 10]);
  }
  const out = JSON.stringify({ updated: Math.floor(Date.now() / 1000), source: 'PurpleAir', count: sensors.length, sensors });
  await env.AQ.put('sensors', out, { expirationTtl: 3600 });
  return out;
}

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(refresh(env)); },

  async fetch(req, env, ctx) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    const cache = caches.default;
    const hit = await cache.match(req);
    if (hit) return hit;

    let data = await env.AQ.get('sensors');
    if (!data) data = await refresh(env);   // cold start / empty KV
    const resp = new Response(data, { headers: cors });
    ctx.waitUntil(cache.put(req, resp.clone()));
    return resp;
  },
};
