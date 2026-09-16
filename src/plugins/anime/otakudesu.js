import * as cheerio from 'cheerio';

const BASE = 'https://otakudesu.blog';
const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.104 Mobile Safari/537.36'
];

let uaI = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a = 300, b = 800) => sleep(Math.floor(Math.random() * (b - a + 1)) + a);

function hdr(ref) {
  const ua = UAS[uaI++ % UAS.length];
  const mobile = /Mobile|iPhone|Android/.test(ua);
  const plat = ua.includes('Windows') ? 'Windows' : ua.includes('Mac') ? 'macOS' : 'Linux';
  return {
    'User-Agent': ua,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    Referer: ref || BASE + '/',
    'Sec-Ch-Ua': ua.includes('Chrome') ? '"Google Chrome"' : '"Chromium"',
    'Sec-Ch-Ua-Mobile': mobile ? '?1' : '?0',
    'Sec-Ch-Ua-Platform': `"${plat}"`,
    'Upgrade-Insecure-Requests': '1'
  };
}

class Cookies {
  constructor() { this.c = {}; }
  load(h) {
    if (!h) return;
    const arr = typeof h.getSetCookie === 'function' ? h.getSetCookie() : [h.get('set-cookie')];
    for (const line of arr) {
      if (!line) continue;
      for (const piece of line.split(/,(?=[^ ])/)) {
        const [kv] = piece.split(';');
        const [k, ...v] = kv.split('=');
        if (k && v.length) this.c[k.trim()] = v.join('=').trim();
      }
    }
  }
  str() { return Object.entries(this.c).map(([k, v]) => `${k}=${v}`).join('; '); }
}

async function req(url, opts = {}, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      await rnd();
      const res = await fetch(url, {
        method: opts.method || 'GET',
        headers: opts.headers || {},
        body: opts.body,
        redirect: 'follow',
        signal: AbortSignal.timeout(30000)
      });
      if (res.status >= 200 && res.status < 400) return res;
      if (i === retries - 1) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (i === retries - 1) throw e;
    }
    await sleep(1500 + Math.random() * 2500);
  }
}

class OtakudesuScraper {
  constructor() { this.base = BASE; this.creator = 'rynaqrtz'; this.cj = new Cookies(); }

  async _html(url) {
    const r = await req(url, { headers: { ...hdr(url), ...(this.cj.str() ? { Cookie: this.cj.str() } : {}) } });
    this.cj.load(r.headers);
    return r.text();
  }

  async _ajax(payload) {
    const body = new URLSearchParams(payload).toString();
    const headers = {
      ...hdr(BASE),
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(this.cj.str() ? { Cookie: this.cj.str() } : {})
    };
    const r = await req(`${this.base}/wp-admin/admin-ajax.php`, { method: 'POST', headers, body });
    this.cj.load(r.headers);
    return r.json().catch(() => null);
  }

  _clean(o) {
    if (o === null || o === undefined) return undefined;
    if (Array.isArray(o)) return o.map((i) => this._clean(i));
    if (typeof o === 'object') {
      const out = {};
      for (const k of Object.keys(o)) {
        const v = this._clean(o[k]);
        if (v !== undefined) out[k] = v;
      }
      return Object.keys(out).length ? out : undefined;
    }
    return o;
  }

  _wrap(page, url, data) { return this._clean({ creator: this.creator, page, url, data }); }

  _b64(s) { try { return atob(s); } catch { return ''; } }

  _pag($) {
    const r = { current: 1, next: null, hasNext: false, total: null };
    const links = [];
    $('.pagination a, .pagination span, .page-numbers, .pagenavix a, .pagenavix span').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href) links.push({ text, href });
    });
    const nums = links.filter((l) => /^\d+$/.test(l.text)).map((l) => parseInt(l.text));
    if (nums.length) r.total = Math.max(...nums);
    const cur = $('.pagination .page-numbers.current, .pagenavix .page-numbers.current').first();
    if (cur.length) {
      const t = cur.text().trim();
      if (/^\d+$/.test(t)) r.current = parseInt(t);
    }
    if (r.total && r.current < r.total) {
      r.hasNext = true;
      const nx = links.find((l) => /next|»/i.test(l.text));
      if (nx?.href) r.next = nx.href.startsWith('http') ? nx.href : this.base + nx.href;
    }
    return r;
  }

  _cardDet($, el) {
    const $e = $(el);
    const link = $e.find('.thumb a').attr('href');
    const title = $e.find('.jdlflm').text().trim();
    if (!link || !title) return null;
    return {
      title,
      url: link.startsWith('http') ? link : this.base + link,
      poster: $e.find('.thumbz img').attr('src') || null,
      episode: $e.find('.epz').text().trim() || null,
      day: $e.find('.epztipe').text().trim() || null,
      date: $e.find('.newnime').text().trim() || null
    };
  }

  _cardCol($, el) {
    const $e = $(el);
    const link = $e.find('.col-anime-title a').attr('href');
    const title = $e.find('.col-anime-title a').text().trim();
    if (!link || !title) return null;
    return {
      title,
      url: link.startsWith('http') ? link : this.base + link,
      studio: $e.find('.col-anime-studio').text().trim() || null,
      episodes: $e.find('.col-anime-eps').text().trim() || null,
      rating: $e.find('.col-anime-rating').text().trim() || null,
      genres: $e.find('.col-anime-genre a').map((_, a) => $(a).text()).get(),
      poster: $e.find('.col-anime-cover img').attr('src') || null,
      synopsis: $e.find('.col-synopsis p').text().trim() || null,
      season: $e.find('.col-anime-date').text().trim() || null
    };
  }

  _genres($) {
    const out = [];
    $('.genres li a').each((i, el) => {
      const $e = $(el);
      const name = $e.text().trim();
      const href = $e.attr('href');
      if (name && href) out.push({ name, slug: href.replace(/\/genres\/([^/]+)\/?/, '$1'), url: href.startsWith('http') ? href : this.base + href });
    });
    return out;
  }

  _sched($) {
    const out = {};
    $('.kglist321').each((i, el) => {
      const $e = $(el);
      const day = $e.find('h2').text().trim();
      const items = [];
      $e.find('ul li a').each((j, a) => {
        const $a = $(a);
        const href = $a.attr('href');
        if (href) items.push({ title: $a.text().trim(), url: href.startsWith('http') ? href : this.base + href });
      });
      if (day && items.length) out[day] = items;
    });
    return out;
  }

  _epList($) {
    const out = [];
    $('.episodelist ul li').each((i, el) => {
      const $e = $(el);
      const $a = $e.find('a');
      const title = $a.text().trim();
      const href = $a.attr('href');
      if (href && title) {
        const m = href.match(/\/episode\/([^/]+)\/?$/);
        out.push({ title, episodeId: m ? m[1] : null, url: href.startsWith('http') ? href : this.base + href, releaseDate: $e.find('.zeebr').text().trim() || null });
      }
    });
    return out;
  }

  _postId($) {
    const ids = new Set();
    $('[data-content]').each((i, el) => {
      const c = $(el).attr('data-content');
      if (c) {
        try {
          const p = JSON.parse(this._b64(c));
          if (p.id) ids.add(p.id);
        } catch {}
      }
    });
    $('[id^="post-"]').each((i, el) => {
      const m = ($(el).attr('id') || '').match(/post-(\d+)/);
      if (m) ids.add(parseInt(m[1]));
    });
    const html = $.html();
    const sm = html.match(/post[_\s]*id[_\s]*[:=]\s*["']?(\d+)["']?/gi);
    if (sm) sm.forEach((x) => { const n = x.match(/\d+/); if (n) ids.add(parseInt(n[0])); });
    return ids.size ? [...ids][0] : null;
  }

  async _nonce() {
    try { const r = await this._ajax({ action: 'aa1208d27f29ca340c92c66d1926f13f' }); return r?.data || null; } catch { return null; }
  }

  async _streamUrl(id, i, q, nonce) {
    try {
      const r = await this._ajax({ action: '2a3505c93b0035d3f455df82bf976b84', id, i, q, nonce });
      if (!r?.data) return null;
      const $ = cheerio.load(this._b64(r.data));
      return $('iframe').attr('src') || null;
    } catch { return null; }
  }

  async _streams(html) {
    const $ = cheerio.load(html);
    const pid = this._postId($);
    if (!pid) return {};
    const nonce = await this._nonce();
    if (!nonce) return {};
    const jobs = {};
    $('.mirrorstream ul').each((i, ul) => {
      $(ul).find('a').each((j, a) => {
        const $a = $(a);
        const dc = $a.attr('data-content');
        if (dc) {
          try {
            const p = JSON.parse(this._b64(dc));
            if (p.id === pid) jobs[`${p.q}_${$a.text().trim()}`] = { id: p.id, i: p.i, q: p.q, nonce };
          } catch {}
        }
      });
    });
    const out = {};
    for (const [k, p] of Object.entries(jobs)) {
      const u = await this._streamUrl(p.id, p.i, p.q, p.nonce);
      if (u) out[k] = u;
    }
    return out;
  }

  async home() {
    const url = this.base + '/';
    const $ = cheerio.load(await this._html(url));
    const items = [];
    $('.detpost:has(.epz:contains("Episode"))').each((i, el) => { const c = this._cardDet($, el); if (c) items.push(c); });
    return this._wrap('home', url, { items });
  }

  async ongoing(page = 1) {
    const url = page === 1 ? this.base + '/ongoing-anime/' : this.base + `/ongoing-anime/page/${page}/`;
    const $ = cheerio.load(await this._html(url));
    const items = [];
    $('.detpost').each((i, el) => { const c = this._cardDet($, el); if (c) items.push(c); });
    return this._wrap('ongoing', url, { pagination: this._pag($), items });
  }

  async complete(page = 1) {
    const url = page === 1 ? this.base + '/complete-anime/' : this.base + `/complete-anime/page/${page}/`;
    const $ = cheerio.load(await this._html(url));
    const items = [];
    $('.detpost').each((i, el) => { const c = this._cardDet($, el); if (c) items.push(c); });
    return this._wrap('complete', url, { pagination: this._pag($), items });
  }

  async genreList() {
    const url = this.base + '/genre-list/';
    const $ = cheerio.load(await this._html(url));
    return this._wrap('genreList', url, { genres: this._genres($) });
  }

  async genre(slug, page = 1) {
    const url = page === 1 ? this.base + `/genres/${slug}/` : this.base + `/genres/${slug}/page/${page}/`;
    const $ = cheerio.load(await this._html(url));
    const items = [];
    $('.col-anime-con').each((i, el) => { const c = this._cardCol($, el); if (c) items.push(c); });
    return this._wrap('genre', url, { slug, pagination: this._pag($), items });
  }

  async jadwalRilis() {
    const url = this.base + '/jadwal-rilis/';
    const $ = cheerio.load(await this._html(url));
    return this._wrap('jadwalRilis', url, { schedule: this._sched($) });
  }

  async search(q) {
    const url = `${this.base}/?s=${encodeURIComponent(q)}&post_type=anime`;
    const $ = cheerio.load(await this._html(url));
    const items = [];
    $('.chivsrc li').each((i, el) => {
      const $e = $(el);
      const link = $e.find('h2 a').attr('href');
      const title = $e.find('h2 a').text().trim();
      if (!link || !title) return;
      const rEl = $e.find('.set:contains("Rating")');
      items.push({
        title,
        url: link.startsWith('http') ? link : this.base + link,
        poster: $e.find('img').attr('src') || null,
        genres: $e.find('.set:first-child a').map((_, a) => $(a).text()).get(),
        status: $e.find('.set:nth-child(2)').text().replace('Status :', '').trim() || null,
        rating: rEl.length ? rEl.text().replace('Rating :', '').trim() : null
      });
    });
    return this._wrap('search', url, { query: q, items });
  }

  async detail(slug) {
    const url = this.base + `/anime/${slug}/`;
    const $ = cheerio.load(await this._html(url));
    const info = {};
    $('.infozin .infozingle p').each((i, el) => {
      const $e = $(el);
      const t = $e.text().trim();
      if (t.includes('Genre')) {
        const g = $e.find('a').map((_, a) => $(a).text()).get();
        info.genre = g.length ? g.join(', ') : null;
        return;
      }
      const p = t.split(':');
      if (p.length >= 2) {
        const k = p[0].replace(/\s/g, '_').toLowerCase();
        if (k) info[k] = p.slice(1).join(':').trim();
      }
    });
    const recs = [];
    $('.isi-recommend-anime-series .isi-konten').each((i, el) => {
      const $e = $(el);
      const link = $e.find('.judul-anime a').attr('href');
      const t = $e.find('.judul-anime a').text().trim();
      if (link && t) recs.push({ title: t, url: link.startsWith('http') ? link : this.base + link, poster: $e.find('.gambar-konten img').attr('src') || null });
    });
    return this._wrap('detail', url, {
      title: $('.jdlrx h1').text().trim() || $('title').text().trim(),
      poster: $('.fotoanime img').attr('src') || null,
      sinopsis: $('.sinopc p').text().trim() || null,
      info,
      episodes: this._epList($),
      recommendations: recs
    });
  }

  _dl($) {
    const out = [];
    $('.download ul').each((i, ul) => {
      const $u = $(ul);
      const group = $u.prev('h4').text().trim() || $u.prev('strong').text().trim() || 'Download';
      const items = [];
      $u.find('li').each((j, li) => {
        const $l = $(li);
        const links = [];
        $l.find('a').each((k, a) => { const $a = $(a); const h = $a.attr('href'); if (h) links.push({ host: $a.text().trim(), url: h }); });
        if (links.length) items.push({ resolution: $l.find('strong').text().trim() || null, size: $l.find('i').text().trim() || null, links });
      });
      if (items.length) out.push({ group, items });
    });
    return out;
  }

  _nav($) {
    return {
      prev: $('.prevnext .flir a:first-child').attr('href') || null,
      all: $('.prevnext .flir a:contains("See All")').attr('href') || null,
      next: $('.prevnext .flir a:last-child').attr('href') || null
    };
  }

  async episode(slug) {
    const url = this.base + `/episode/${slug}/`;
    const html = await this._html(url);
    const $ = cheerio.load(html);
    const streams = await this._streams(html);
    const data = {
      title: $('h1.posttl').text().trim() || $('title').text().trim(),
      streams,
      downloads: this._dl($),
      nav: this._nav($)
    };
    const other = this._epList($);
    if (other.length) data.otherEpisodes = other;
    return this._wrap('episode', url, data);
  }

  async batch(slug) {
    const url = this.base + `/lengkap/${slug}/`;
    const $ = cheerio.load(await this._html(url));
    return this._wrap('batch', url, { title: $('.jdlrx h1').text().trim() || $('title').text().trim(), downloads: this._dl($) });
  }

  async watch(slug) {
    const url = this.base + `/episode/${slug}/`;
    const html = await this._html(url);
    const $ = cheerio.load(html);
    return this._wrap('watch', url, {
      title: $('h1.posttl').text().trim() || $('title').text().trim(),
      streams: await this._streams(html),
      downloads: this._dl($),
      nav: this._nav($)
    });
  }
}

export default {
  name: 'Otakudesu',
  category: 'anime',
  method: ['GET'],
  description: 'Multi-endpoint Otakudesu via query.action.',
  params: {
    action: { type: 'string', required: true, description: 'home|ongoing|complete|genrelist|genre|jadwal|search|detail|episode|batch|watch' },
    page: { type: 'number', required: false, description: 'Nomor halaman (untuk ongoing, complete, genre).' },
    slug: { type: 'string', required: false, description: 'Slug anime / genre / episode (wajib untuk genre, detail, episode, batch, watch).' },
    query: { type: 'string', required: false, description: 'Kata kunci (wajib untuk search).' }
  },
  cache: 60,
  timeout: 60000,
  execute: async ({ query }) => {
    const s = new OtakudesuScraper();
    const action = String(query?.action || '').toLowerCase();
    const page = parseInt(query?.page) || 1;
    switch (action) {
      case 'home': return s.home();
      case 'ongoing': return s.ongoing(page);
      case 'complete': return s.complete(page);
      case 'genrelist': return s.genreList();
      case 'genre': if (!query.slug) throw new Error('param `slug` wajib'); return s.genre(query.slug, page);
      case 'jadwal': return s.jadwalRilis();
      case 'search': if (!query.query) throw new Error('param `query` wajib'); return s.search(query.query);
      case 'detail': if (!query.slug) throw new Error('param `slug` wajib'); return s.detail(query.slug);
      case 'episode': if (!query.slug) throw new Error('param `slug` wajib'); return s.episode(query.slug);
      case 'batch': if (!query.slug) throw new Error('param `slug` wajib'); return s.batch(query.slug);
      case 'watch': if (!query.slug) throw new Error('param `slug` wajib'); return s.watch(query.slug);
      default: throw new Error(`action tidak dikenal: "${action}"`);
    }
  }
};
