// Hazard-zone data Worker. Holds API keys as encrypted secrets and serves cached JSON
// to all visitors (edge-cached), so keys never reach the browser and visitor traffic
// never drives upstream API calls.
//   GET /         -> PurpleAir sensors near the plant (env.PURPLEAIR_READ_KEY)
//   GET /social   -> LunarCrush social intelligence for the event (env.LUNARCRUSH_KEY)
//                    + fresh AI summaries via Workers AI (env.AI), re-run when posts change
// Crons: sensors every 2 min, social every 5 min.

const BOX = 'nwlng=-118.15&nwlat=33.93&selng=-117.85&selat=33.63';

// ── PurpleAir sensors ──────────────────────────────────────────────
async function refreshSensors(env) {
  const url = 'https://api.purpleair.com/v1/sensors?fields=latitude,longitude,pm2.5_10minute,name&'
    + BOX + '&location_type=0&max_age=3600';
  const d = await (await fetch(url, { headers: { 'X-API-Key': env.PURPLEAIR_READ_KEY } })).json();
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

// ── LunarCrush social intelligence ─────────────────────────────────
const EVENT_TOPICS = ['garden grove', 'gkn aerospace'];
const REGIONAL_TOPICS = ['orange county', 'anaheim'];
const OFFICIAL = [['twitter', 'CAgovernor'], ['twitter', 'Cal_OES'], ['twitter', 'SenAdamSchiff'], ['twitter', 'GovPressOffice']];
const GOV = new Set(['cagovernor', 'cal_oes', 'govpressoffice', 'senadamschiff', 'senalexpadilla', 'calfire', 'ocfa', 'ocfa_pio', 'ocsheriff', 'countyoforange', 'usepa', 'nwslosangeles', 'caloes']);
const NEWS = new Set(['abc7la', 'abc7', 'cbsla', 'nbcla', 'ktla', 'ktlanews', 'telemundo52', 'univision34', '9news', 'ajenglish', 'agendafreetv', 'latimes', 'nbcnews', 'usatoday', 'foxnews', 'cbsnews', 'nypost', 'huffpost', 'npr', 'epochtimes', 'abcaustralia', 'kcalnews', 'foxla', 'spectrumnews1', 'laist', 'ocregister', 'knx', 'reuters', 'apnews', 'cnn', 'thehill', 'newsweek', 'dailymail', 'bbcnews', 'foxweather', 'accuweather']);
const NET_LABEL = { 'tweet': 'X / Twitter', 'tiktok-video': 'TikTok', 'youtube-video': 'YouTube', 'instagram-post': 'Instagram', 'reddit-post': 'Reddit', 'news': 'News' };
const KW = [
  ['garden grove', /garden grove/], ['orange county', /orange county/], ['anaheim', /anaheim/],
  ['chemical tank', /chemical tank/], ['chemical leak', /chemical leak/], ['chemical spill', /chemical spill/],
  ['toxic', /toxic/], ['evacuation', /evacuat/], ['shelter', /shelter/], ['hazmat', /hazmat/],
  ['explosion', /explo/], ['blast', /blast/], ['plume', /plume/], ['leak', /\bleak/],
  ['tank', /\btank/], ['methyl methacrylate', /methacrylate|methyl/], ['MMA', /\bmma\b/],
  ['state of emergency', /state of emergency|emergency/], ['overheating', /overheat|runaway/],
  ['rupture / failure', /rupture|tank fail/], ['GKN', /\bgkn\b/], ['aerospace', /aerospace/],
  ['fire authority', /ocfa|fire authority|fire chief/], ['Newsom', /newsom/],
  ['lawsuit', /lawsuit|class action/], ['Western Ave', /western ave/],
];
const STRONG_KW = ['garden grove', 'gkn', 'methyl methacrylate', 'chemical leak', 'chemical tank', 'hazmat incident', 'evacuation order'];

function lc(env, path) {
  // LunarCrush's edge blocks requests without a browser-like User-Agent (CF error 1010).
  return fetch('https://lunarcrush.com/api4/public' + path, {
    headers: {
      Authorization: 'Bearer ' + env.LUNARCRUSH_KEY,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
  }).then(r => r.json()).catch(() => ({}));
}
function klass(handle, ptype) {
  const h = (handle || '').toLowerCase().trim();
  if (GOV.has(h)) return 'gov';
  if (NEWS.has(h) || ptype === 'news') return 'news';
  return 'community';
}
const enc = encodeURIComponent;
const slim = p => ({
  id: p.id, net: p.post_type, handle: p.creator_name,
  name: p.creator_display_name || p.creator_name, followers: p.creator_followers, avatar: p.creator_avatar,
  title: (p.post_title || '').trim(), link: p.post_link, created: p.post_created,
  int: p.interactions_total || 0, sentiment: p.post_sentiment, klass: p.klass,
});

async function buildSocial(env) {
  const tv = {};
  for (const t of EVENT_TOPICS.concat(REGIONAL_TOPICS)) tv[t] = (await lc(env, `/topic/${enc(t)}/v1`)).data || {};

  const seen = new Set(), posts = [], corpus = {}, creatorsMap = {};
  for (const t of EVENT_TOPICS.concat(REGIONAL_TOPICS)) {
    const tp = (await lc(env, `/topic/${enc(t)}/posts/v1`)).data || [];
    for (const p of tp) corpus[p.id] = p;
    if (EVENT_TOPICS.includes(t)) {
      for (const p of tp) { if (!seen.has(p.id)) { seen.add(p.id); posts.push(p); } }
      for (const c of ((await lc(env, `/topic/${enc(t)}/creators/v1`)).data || [])) {
        const h = c.creator_name;
        if (h && (!(h in creatorsMap) || (c.interactions_24h || 0) > (creatorsMap[h].interactions_24h || 0))) creatorsMap[h] = c;
      }
    }
  }

  // official authority posts (always present), strong event terms + recent
  const cutoff = Math.floor(Date.now() / 1000) - 6 * 86400;
  for (const [net, h] of OFFICIAL) {
    for (const p of ((await lc(env, `/creator/${net}/${h}/posts/v1`)).data || [])) {
      const title = (p.post_title || '').toLowerCase();
      if ((p.post_created || 0) >= cutoff && STRONG_KW.some(k => title.includes(k)) && !seen.has(p.id)) {
        seen.add(p.id); p.creator_name = h; posts.push(p);
      }
    }
  }

  const ts = (await lc(env, `/topic/garden%20grove/time-series/v2?bucket=hour`)).data || [];
  const news = (await lc(env, `/topic/garden%20grove/news/v1`)).data || [];

  posts.forEach(p => { p.klass = klass(p.creator_name, p.post_type); });
  const byInt = (a, b) => b.int - a.int;
  const gov = posts.filter(p => p.klass === 'gov').map(slim).sort(byInt);
  const newsp = posts.filter(p => p.klass === 'news').map(slim).sort(byInt);
  const comm = posts.filter(p => p.klass === 'community').map(slim).sort(byInt);

  const creators = Object.values(creatorsMap).map(c => ({
    handle: c.creator_name, net: (c.creator_id || '').split('::')[0] || '?',
    followers: c.creator_followers, avatar: c.creator_avatar, int24h: c.interactions_24h || 0,
    klass: klass(c.creator_name, null),
  })).sort((a, b) => b.int24h - a.int24h);

  const newsfeed = news.map(n => ({
    handle: n.creator_name, name: n.creator_display_name, title: (n.post_title || '').trim(),
    desc: (n.post_description || '').slice(0, 240), link: n.post_link, created: n.post_created,
    int: n.interactions_total || 0, sentiment: n.post_sentiment,
  })).sort(byInt);

  const gg = tv['garden grove'] || {};
  const ti = gg.types_interactions || {}, tc = gg.types_count || {};
  const by_network = [...new Set(Object.keys(ti).concat(Object.keys(tc)))]
    .map(k => ({ net: k, label: NET_LABEL[k] || k, posts: tc[k] || 0, int: ti[k] || 0 }))
    .sort((a, b) => b.int - a.int);

  const timeseries = ts.slice().sort((a, b) => (a.time || 0) - (b.time || 0))
    .map(r => ({ t: r.time, int: r.interactions, posts: r.posts_active, contrib: r.contributors_active, sent: r.sentiment }));

  // wide keyword net over corpus
  const ctexts = Object.values(corpus).map(p => (p.post_title || '').toLowerCase());
  const keywords = KW.map(([term, rx]) => {
    const count = ctexts.filter(t => rx.test(t)).length;
    return { term, count, pct: Math.round(100 * count / Math.max(1, ctexts.length)) };
  }).filter(k => k.count > 0).sort((a, b) => b.count - a.count);

  const tstat = (t, status) => ({ term: t, status, posts: (tv[t] || {}).num_posts || 0, creators: (tv[t] || {}).num_contributors || 0, int: (tv[t] || {}).interactions_24h || 0 });
  const methodology = {
    topics_tracked: [tstat('garden grove', 'event'), tstat('gkn aerospace', 'company'), tstat('orange county', 'regional'), tstat('anaheim', 'regional')],
    networks: by_network.map(b => ({ label: b.label, posts: b.posts, int: b.int })),
    keywords, corpus_size: Object.keys(corpus).length,
    note: `"Creators" = unique original authors LunarCrush indexes for a topic; "Interactions" = total public engagement on their posts. The feed unions the two event-specific topics (garden grove + gkn aerospace); orange county and anaheim are shown as regional spread. Keyword counts are real mentions across a corpus of ${Object.keys(corpus).length} posts spanning all four topics.`,
  };

  return {
    generated: new Date().toISOString(), topic: 'garden grove', title: gg.title || 'Garden Grove',
    stats: { interactions_24h: gg.interactions_24h, num_contributors: gg.num_contributors, num_posts: gg.num_posts, topic_rank: gg.topic_rank, trend: gg.trend },
    by_network, timeseries,
    official_gov: gov, official_news: newsp.slice(0, 24), community: comm.slice(0, 40),
    creators: creators.slice(0, 30), newsfeed,
    counts: { gov: gov.length, news: newsp.length, community: comm.length },
    methodology,
  };
}

// Bump when the AI prompt changes, so cached summaries get regenerated.
const PROMPT_VERSION = 'v3-aftermath';
// content hash: re-run AI inference only when the post set / scale / trend / prompt changes
async function contentHash(d) {
  const sig = [
    PROMPT_VERSION,
    (d.stats.trend || ''),                                   // re-infer when momentum flips
    ...d.official_gov.slice(0, 6).map(p => p.id),
    ...d.official_news.slice(0, 8).map(p => p.id),
    ...d.community.slice(0, 8).map(p => p.id),
    Math.round((d.stats.interactions_24h || 0) / 1e6),
  ].join('|');
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(sig));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function fallbackAI(d) {
  const top = a => a.slice(0, 3).map(p => `@${p.handle}: ${p.title}`).join(' | ');
  return {
    headline: `${d.title}: live social read`,
    situation: [
      `Tracking ${(d.stats.num_posts || 0).toLocaleString()} posts and ${(d.stats.interactions_24h || 0).toLocaleString()} interactions across ${d.by_network.length} networks; trend ${d.stats.trend || 'up'}.`,
      `Top official: ${top(d.official_gov) || '—'}`,
      `Top news: ${top(d.official_news) || '—'}`,
      `Top community: ${top(d.community) || '—'}`,
    ],
    official_read: 'Authorities and verified news are leading coverage — evacuation, shelter, and state-response updates.',
    community_read: 'Community posts are reacting on the ground — concern, questions, and viral clips.',
    network_reads: Object.fromEntries(d.by_network.map(b => [b.net, `${b.label}: ${(b.posts || 0).toLocaleString()} posts, ${(b.int || 0).toLocaleString()} interactions.`])),
    as_of_note: 'Auto-summary (model unavailable) generated from live LunarCrush data.',
  };
}

async function inferAI(env, d) {
  const fmtList = a => a.slice(0, 8).map(p => `- [${p.net}] @${p.handle} (${(p.int || 0).toLocaleString()} int): ${p.title}`).join('\n');
  const nets = d.by_network.map(b => `${b.label}: ${(b.posts || 0).toLocaleString()} posts / ${(b.int || 0).toLocaleString()} interactions`).join('; ');
  const tr = (d.stats.trend || '').toLowerCase();
  const phase = tr === 'down'
    ? 'The conversation is PAST ITS PEAK and COOLING OFF (interactions falling). Frame this as a story winding down / in its aftermath — describe what happened and where it stands now in past/perfect tense. Do NOT imply an active, escalating emergency.'
    : tr === 'up'
    ? 'The conversation is still ACCELERATING — frame it as an active, developing story.'
    : 'The conversation is holding steady.';
  const prompt = `You are a social-media intelligence analyst. From the live data below about the GKN Aerospace MMA chemical-tank incident in Garden Grove, CA, write a tight situational summary that matches the CURRENT momentum.

MOMENTUM: ${phase}

STATS: ${(d.stats.interactions_24h || 0).toLocaleString()} interactions/24h, ${(d.stats.num_contributors || 0).toLocaleString()} creators posting, ${(d.stats.num_posts || 0).toLocaleString()} posts, trend ${d.stats.trend || 'up'}.
NETWORKS: ${nets}

OFFICIAL / GOV POSTS:
${fmtList(d.official_gov)}

TOP NEWS POSTS:
${fmtList(d.official_news)}

TOP COMMUNITY POSTS:
${fmtList(d.community)}

IMPORTANT FRAMING: ${tr === 'down'
  ? 'This story is in its AFTERMATH and winding down. Write the headline and bullets in PAST/PERFECT tense about how it played out and where it landed (e.g. "drew tens of millions of views", "evacuations were lifted", "the threat has eased"). Do NOT write a headline that implies an active, escalating, present-tense emergency. The posts below are mostly from the peak — summarize the arc, not a live crisis.'
  : 'Write in present tense about the active, developing story.'}

Return ONLY valid JSON (no markdown) with exactly these keys:
{
 "headline": "one punchy sentence matching the framing above",
 "situation": ["5 short factual bullets on the current state of the story, grounded in the posts above and matching the framing above"],
 "official_read": "2-3 sentences on how authorities/verified news communicated",
 "community_read": "2-3 sentences on how the public reacted",
 "network_reads": {"tweet":"one line","tiktok-video":"one line","youtube-video":"one line","instagram-post":"one line","reddit-post":"one line","news":"one line"}
}
Be specific, factual, grounded in the posts, and consistent with the framing. No speculation beyond the data.`;

  const res = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    messages: [{ role: 'system', content: 'You output only valid minified JSON. No prose, no markdown fences.' }, { role: 'user', content: prompt }],
    max_tokens: 1500, temperature: 0.3,
  });
  // res.response is usually a string; coerce defensively, strip any code fences, slice the JSON object
  let raw = (res && typeof res === 'object') ? res.response : res;
  let txt = (typeof raw === 'string' ? raw : JSON.stringify(raw || '')).replace(/```json/gi, '').replace(/```/g, '').trim();
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
  const obj = JSON.parse(txt.slice(a, b + 1));
  // remap network_reads keys to short names the page uses
  const nr = obj.network_reads || {};
  obj.network_reads = {
    tweet: nr.tweet || nr['tweet'], tiktok: nr['tiktok-video'] || nr.tiktok, youtube: nr['youtube-video'] || nr.youtube,
    instagram: nr['instagram-post'] || nr.instagram, reddit: nr['reddit-post'] || nr.reddit, news: nr.news,
  };
  obj.as_of_note = 'AI summary generated by Workers AI (llama-3.3-70b) from live LunarCrush post content.';
  return obj;
}

async function refreshSocial(env) {
  const data = await buildSocial(env);
  let ai;
  try {
    const hash = await contentHash(data);
    const prevHash = await env.AQ.get('social_hash');
    if (hash === prevHash) {
      ai = JSON.parse((await env.AQ.get('social_ai')) || 'null');
    }
    if (!ai) {
      ai = await inferAI(env, data);
      await env.AQ.put('social_ai', JSON.stringify(ai));
      await env.AQ.put('social_hash', hash);
    }
  } catch (e) {
    ai = JSON.parse((await env.AQ.get('social_ai')) || 'null') || fallbackAI(data);
  }
  data.ai = ai;
  const out = JSON.stringify(data);
  await env.AQ.put('social', out, { expirationTtl: 3600 });
  return out;
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=120' };

export default {
  async scheduled(event, env, ctx) {
    if (event.cron === '*/5 * * * *') ctx.waitUntil(Promise.allSettled([refreshSocial(env), refreshSensors(env)]));
    else ctx.waitUntil(refreshSensors(env));
  },
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    const path = url.pathname;
    if (path === '/social' && url.searchParams.get('refresh') === '1') {
      // manual refresh hook (for testing / first warm-up)
      const out = await refreshSocial(env);
      return new Response(out, { headers: CORS });
    }
    const cache = caches.default;
    const hit = await cache.match(req);
    if (hit) return hit;
    const key = path.startsWith('/social') ? 'social' : 'sensors';
    let data = await env.AQ.get(key);
    if (!data) data = key === 'social' ? await refreshSocial(env) : await refreshSensors(env);
    const resp = new Response(data, { headers: CORS });
    ctx.waitUntil(cache.put(req, resp.clone()));
    return resp;
  },
};
