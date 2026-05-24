#!/usr/bin/env python3
"""Build social.json for the GKN/Garden Grove social intelligence page.
Pulls multiple real LunarCrush topics, unions event-specific feeds, classifies
sources, and assembles the dataset the page renders. AI summaries are written
here for the committed snapshot; the live Worker regenerates them via Workers AI.
Usage: LUNARCRUSH_KEY=... python3 build_social.py
"""
import urllib.request, urllib.parse, json, os, datetime, re

KEY = os.environ.get("LUNARCRUSH_KEY")
if not KEY:
    raise SystemExit("Set LUNARCRUSH_KEY env var (do not hardcode keys).")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"

def get(path):
    req = urllib.request.Request("https://lunarcrush.com/api4/public/" + path,
                                 headers={"Authorization": f"Bearer {KEY}", "User-Agent": UA})
    try:
        return json.load(urllib.request.urlopen(req, timeout=25))
    except Exception as e:
        print("  ! err", path, e); return {}

def topic(t, sub=""):
    return get(f"topic/{urllib.parse.quote(t)}/{sub}".rstrip("/") + ("/v1" if not sub else ""))

# ── source classification ──
GOV = {'cagovernor','cal_oes','govpressoffice','senadamschiff','senalexpadilla','calfire',
       'ocfa','ocfa_pio','ocsheriff','countyoforange','usepa','nwslosangeles','caloes'}
NEWS = {'abc7la','abc7','cbsla','nbcla','ktla','ktlanews','telemundo52','univision34','9news','ajenglish',
        'agendafreetv','latimes','nbcnews','usatoday','foxnews','cbsnews','nypost','huffpost','npr','epochtimes',
        'abcaustralia','kcalnews','foxla','spectrumnews1','laist','ocregister','knx','reuters','apnews','cnn',
        'thehill','newsweek','dailymail','bbcnews','foxweather','accuweather'}
def klass(handle, ptype):
    h = (handle or '').lower().strip()
    if h in GOV: return 'gov'
    if h in NEWS or ptype == 'news': return 'news'
    return 'community'

NET_LABEL = {'tweet':'X / Twitter','tiktok-video':'TikTok','youtube-video':'YouTube',
             'instagram-post':'Instagram','reddit-post':'Reddit','news':'News'}

# event-specific topics (feed sources) + regional context topics (spread)
EVENT_TOPICS = ["garden grove", "gkn aerospace"]
REGIONAL_TOPICS = ["orange county", "anaheim"]

print("Pulling event topics:", EVENT_TOPICS)
tv = {t: topic(t).get("data", {}) for t in EVENT_TOPICS + REGIONAL_TOPICS}

# union posts + creators across event topics (feed) + build a wider corpus for keyword counting
seen, posts = set(), []
corpus = {}            # id -> post, across ALL topics (event + regional) for keyword mentions
creators_map = {}
for t in EVENT_TOPICS + REGIONAL_TOPICS:
    tp = get(f"topic/{urllib.parse.quote(t)}/posts/v1").get("data", [])
    for p in tp:
        corpus[p.get("id")] = p
    if t in EVENT_TOPICS:
        for p in tp:
            if p.get("id") in seen: continue
            seen.add(p["id"]); posts.append(p)
        for c in get(f"topic/{urllib.parse.quote(t)}/creators/v1").get("data", []):
            h = c.get("creator_name")
            if h and (h not in creators_map or (c.get("interactions_24h") or 0) > (creators_map[h].get("interactions_24h") or 0)):
                creators_map[h] = c

# ── wide keyword net: real mention counts across the corpus ──
corpus_texts = [(p.get("post_title") or "").lower() for p in corpus.values()]
KW = [
  ("garden grove", r"garden grove"), ("orange county", r"orange county"), ("anaheim", r"anaheim"),
  ("chemical tank", r"chemical tank"), ("chemical leak", r"chemical leak"), ("chemical spill", r"chemical spill"),
  ("toxic", r"toxic"), ("evacuation", r"evacuat"), ("shelter", r"shelter"), ("hazmat", r"hazmat"),
  ("explosion", r"explo"), ("blast", r"blast"), ("plume", r"plume"), ("leak", r"\bleak"),
  ("tank", r"\btank"), ("methyl methacrylate", r"methacrylate|methyl"), ("MMA", r"\bmma\b"),
  ("state of emergency", r"state of emergency|emergency"), ("overheating", r"overheat|runaway"),
  ("rupture / failure", r"rupture|tank fail"), ("GKN", r"\bgkn\b"), ("aerospace", r"aerospace"),
  ("fire authority", r"ocfa|fire authority|fire chief"), ("Newsom", r"newsom"),
  ("lawsuit", r"lawsuit|class action"), ("Western Ave", r"western ave"),
]
keyword_counts = []
for label, rx in KW:
    c = sum(1 for t in corpus_texts if re.search(rx, t))
    if c > 0:
        keyword_counts.append({"term": label, "count": c, "pct": round(100*c/max(1, len(corpus_texts)))})
keyword_counts.sort(key=lambda x: -x["count"])

# richest single-topic series/news come from garden grove
ts = get("topic/garden%20grove/time-series/v2?bucket=hour").get("data", [])
news = get("topic/garden%20grove/news/v1").get("data", [])

# ── pull official authority accounts' event posts directly (so they're always present) ──
OFFICIAL_HANDLES = [("twitter","CAgovernor"),("twitter","Cal_OES"),("twitter","SenAdamSchiff"),
                    ("twitter","GovPressOffice")]
# strong, unambiguous event terms only (avoid generic 'tank'/'toxic'/'chemical' false positives)
EVKW = ["garden grove","gkn","methyl methacrylate","chemical leak","chemical tank","hazmat incident","evacuation order"]
CUTOFF = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=6)).timestamp()
for net, h in OFFICIAL_HANDLES:
    for p in get(f"creator/{net}/{h}/posts/v1").get("data", []):
        title = (p.get("post_title") or "").lower()
        if (p.get("post_created") or 0) >= CUTOFF and any(k in title for k in EVKW):
            if p.get("id") not in seen:
                seen.add(p["id"]); p["creator_name"] = h; posts.append(p)

for p in posts: p["klass"] = klass(p.get("creator_name"), p.get("post_type"))

def slim(p):
    return {'id':p.get('id'),'net':p.get('post_type'),'handle':p.get('creator_name'),
            'name':p.get('creator_display_name') or p.get('creator_name'),
            'followers':p.get('creator_followers'),'avatar':p.get('creator_avatar'),
            'title':(p.get('post_title') or '').strip(),'link':p.get('post_link'),
            'created':p.get('post_created'),'int':p.get('interactions_total') or 0,
            'sentiment':p.get('post_sentiment'),'klass':p['klass']}

gov  = sorted([slim(p) for p in posts if p['klass']=='gov'],  key=lambda x:-x['int'])
nwsp = sorted([slim(p) for p in posts if p['klass']=='news'], key=lambda x:-x['int'])
comm = sorted([slim(p) for p in posts if p['klass']=='community'], key=lambda x:-x['int'])

creators = sorted(
    [{'handle':c.get('creator_name'),'net':(c.get('creator_id') or '').split('::')[0] or '?',
      'followers':c.get('creator_followers'),'avatar':c.get('creator_avatar'),
      'int24h':c.get('interactions_24h') or 0,'klass':klass(c.get('creator_name'),None)}
     for c in creators_map.values()], key=lambda x:-x['int24h'])

newsfeed = sorted([{'handle':n.get('creator_name'),'name':n.get('creator_display_name'),
    'title':(n.get('post_title') or '').strip(),'desc':(n.get('post_description') or '')[:240],
    'link':n.get('post_link'),'created':n.get('post_created'),
    'int':n.get('interactions_total') or 0,'sentiment':n.get('post_sentiment')}
    for n in news], key=lambda x:-x['int'])

# by-network from the primary topic (garden grove) for a clean, event-specific split
gg = tv["garden grove"]
ti, tc = gg.get('types_interactions', {}), gg.get('types_count', {})
by_network = sorted([{'net':k,'label':NET_LABEL.get(k,k),'posts':tc.get(k,0),'int':ti.get(k,0)}
                     for k in set(list(ti)+list(tc))], key=lambda x:-x['int'])

ts_clean = [{'t':r['time'],'int':r.get('interactions'),'posts':r.get('posts_active'),
             'contrib':r.get('contributors_active'),'sent':r.get('sentiment')}
            for r in sorted(ts, key=lambda r:r.get('time') or 0)]

def tstat(t, status, note):
    d = tv.get(t, {})
    return {'term':t,'status':status,'posts':d.get('num_posts') or 0,
            'creators':d.get('num_contributors') or 0,'int':d.get('interactions_24h') or 0,'note':note}

methodology = {
  "topics_tracked": [
    tstat("garden grove","event","The incident's core topic — almost entirely on-event."),
    tstat("gkn aerospace","company","The company at the center — small but 100% on-event."),
    tstat("orange county","regional","County-wide topic — roughly half the top conversation is this crisis."),
    tstat("anaheim","regional","Neighboring city — the story is spilling into local feeds here too."),
  ],
  "networks": [{"label":b['label'],"posts":b['posts'],"int":b['int']} for b in by_network],
  "keywords": keyword_counts,
  "corpus_size": len(corpus),
  "note":"“Creators” = unique original authors LunarCrush indexes for a topic; “Interactions” = total public engagement (views, likes, comments, shares) on their posts. The feed below unions the two event-specific topics (garden grove + gkn aerospace); orange county and anaheim are shown as regional spread, not summed into the headline. Keyword counts are real mentions across a corpus of " + str(len(corpus)) + " posts spanning all four topics."
}

out = {
  'generated': datetime.datetime.now(datetime.timezone.utc).isoformat(),
  'topic':'garden grove','title': gg.get('title') or 'Garden Grove',
  'stats':{'interactions_24h':gg.get('interactions_24h'),'num_contributors':gg.get('num_contributors'),
           'num_posts':gg.get('num_posts'),'topic_rank':gg.get('topic_rank'),'trend':gg.get('trend')},
  'by_network':by_network,'timeseries':ts_clean,
  'official_gov':gov,'official_news':nwsp[:24],'community':comm[:40],
  'creators':creators[:30],'newsfeed':newsfeed,
  'counts':{'gov':len(gov),'news':len(nwsp),'community':len(comm)},
  'methodology':methodology,
}

# AI summaries are injected separately (snapshot: hand-written; worker: Workers AI)
ai_path = os.path.join(os.path.dirname(__file__), "ai_summary.json")
if os.path.exists(ai_path):
    out['ai'] = json.load(open(ai_path))

json.dump(out, open(os.path.join(os.path.dirname(__file__), "social.json"), "w"), indent=1)
print(f"\nWROTE social.json")
print(f"  event creators (gg+gkn): {len(creators_map)} | feed posts: {len(posts)} (gov {len(gov)} / news {len(nwsp)} / community {len(comm)})")
print(f"  topics: " + " | ".join(f"{m['term']}={m['posts']}p/{m['creators']}c" for m in methodology['topics_tracked']))
