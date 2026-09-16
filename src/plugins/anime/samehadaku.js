import * as cheerio from 'cheerio';

const BASE = 'https://v2.samehadaku.how';
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

async function req(url, opts = {}, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      await rnd();
      const res = await fetch(url, {
        method: opts.method || 'GET',
        headers: opts.headers || {},
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

async function html(url) { const r = await req(url, { headers: hdr(url) }); return r.text(); }
async function json(url) { const r = await req(url, { headers: { ...hdr(url), Accept: 'application/json' } }); return r.json(); }

class SamehadakuScraper {
  constructor() { this.base = BASE; this.creator = 'rynaqrtz'; }

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

  _card($, el) {
    const $e = $(el);
    const link = $e.find('a').first().attr('href');
    const title = $e.find('.title h2').text().trim() || $e.find('.dtla h2 a').text().trim() || $e.find('.tt').text().trim();
    if (!link || !title) return null;
    return {
      title,
      url: link.startsWith('http') ? link : this.base + link,
      poster: $e.find('img').attr('data-src') || $e.find('img').attr('src') || null,
      type: $e.find('.type').first().text().trim() || null,
      status: $e.find('.type').eq(1).text().trim() || $e.find('.status').text().trim() || null,
      episode: $e.find('.epx').text().trim() || $e.find('.dtla span author').first().text().trim() || null
    };
  }

  _anim($, el) {
    const $e = $(el);
    const link = $e.find('a').first().attr('href');
    const title = $e.find('.title h2').first().text().trim();
    if (!link || !title) return null;
    return {
      title,
      url: link.startsWith('http') ? link : this.base + link,
      poster: $e.find('.content-thumb img').attr('src') || null,
      type: $e.find('.type').first().text().trim() || null,
      status: $e.find('.type').eq(1).text().trim() || $e.find('.status').text().trim() || null,
      rating: $e.find('.score').text().trim() || null,
      sinopsis: $e.find('.stooltip .ttls').text().trim() || null,
      genres: $e.find('.stooltip .genres .mta a').map((_, a) => $(a).text()).get()
    };
  }

  _pag($) {
    const r = { current: 1, next: null, hasNext: false, total: null };
    const links = [];
    $('.pagination a, .pagination span, .page-numbers, .hpage a').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href) links.push({ text, href });
    });
    const nums = links.filter((l) => /^\d+$/.test(l.text)).map((l) => parseInt(l.text));
    if (nums.length) r.total = Math.max(...nums);
    const cur = $('.pagination .page-numbers.current, .hpage .current').first();
    if (cur.length) { const t = cur.text().trim(); if (/^\d+$/.test(t)) r.current = parseInt(t); }
    if (r.total && r.current < r.total) {
      r.hasNext = true;
      const nx = links.find((l) => /next|»/i.test(l.text));
      if (nx?.href) r.next = nx.href.startsWith('http') ? nx.href : this.base + nx.href;
    }
    return r;
  }

  _epList($) {
    const out = [];
    $('.lstepsiode.listeps ul li').each((i, el) => {
      const $e = $(el);
      const $a = $e.find('.lchx a');
      const link = $a.attr('href');
      const title = $a.text().trim();
      if (link && title) {
        let ep = null;
        const mu = link.match(/-episode-(\d+)/);
        if (mu) ep = mu[1];
        else {
          const mt = title.match(/Episode\s+(\d+)/i);
          if (mt) ep = mt[1];
        }
        out.push({ episode: ep || '0', title, url: link.startsWith('http') ? link : this.base + link, releaseDate: $e.find('.date').text().trim() || null });
      }
    });
    return out.sort((a, b) => parseInt(a.episode) - parseInt(b.episode));
  }

  _dl($) {
    const out = [];
    $('.download-eps ul li').each((i, el) => {
      const res = $(el).find('strong').text().trim();
      const mirrors = [];
      $(el).find('span a').each((j, a) => { const h = $(a).attr('href'); if (h) mirrors.push({ name: $(a).text().trim(), url: h }); });
      if (res && mirrors.length) out.push({ resolution: res, mirrors });
    });
    return out;
  }

  _streams(downloads) {
    const out = [];
    for (const dl of downloads) {
      for (const m of dl.mirrors) {
        let url = m.url;
        let name = m.name;
        const r = dl.resolution;
        if (url.includes('pixeldrain.com/u/')) out.push({ name: `${name} ${r}`, resolution: r, url, type: 'direct' });
        else if (url.includes('vidhidepre.com/file/')) {
          const id = url.split('/').pop();
          out.push({ name: `${name} ${r}`, resolution: r, url: `https://vidhidepre.com/embed/${id}`, type: 'embed' });
        } else if (url.includes('acefile.co') && r.includes('720p')) {
          const fn = url.split('/').pop().replace(/_/g, '-').replace('.mp4', '');
          out.push({ name: 'Premium 720p', resolution: '720p', url: `https://api.wibufile.com/embed/${fn}`, type: 'embed' });
        } else if (url.includes('blogger.com')) out.push({ name: 'Blogspot', resolution: '', url, type: 'embed' });
      }
    }
    const seen = new Set();
    return out.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
  }

  _nav($) {
    return {
      prev: $('.naveps .nvs:first-child a').attr('href') || null,
      all: $('.naveps .nvsc a').attr('href') || null,
      next: $('.naveps .nvs:last-child a').attr('href') || null
    };
  }

  async home(page = 1) {
    const url = page === 1 ? this.base + '/' : this.base + `/page/${page}/`;
    const $ = cheerio.load(await html(url));
    const items = [];
    $('.post-show ul li').each((i, el) => { const c = this._card($, el); if (c) items.push(c); });
    return this._wrap('home', url, { pagination: this._pag($), items });
  }

  async terbaru(page = 1) {
    const url = page === 1 ? this.base + '/anime-terbaru/' : this.base + `/anime-terbaru/page/${page}/`;
    const $ = cheerio.load(await html(url));
    const items = [];
    $('.post-show ul li').each((i, el) => { const c = this._card($, el); if (c) items.push(c); });
    return this._wrap('terbaru', url, { pagination: this._pag($), items });
  }

  async catalog(page = 1, filters = {}) {
    const basePath = page > 1 ? `/daftar-anime-2/page/${page}/` : '/daftar-anime-2/';
    const p = new URLSearchParams();
    p.set('title', '');
    if (filters.status) p.set('status', filters.status);
    if (filters.type) p.set('type', filters.type);
    if (filters.order) p.set('order', filters.order);
    if (filters.genre?.length) filters.genre.forEach((g) => p.append('genre[]', g));
    const url = this.base + basePath + '?' + p.toString();
    const $ = cheerio.load(await html(url));
    const items = [];
    $('.relat .animpost').each((i, el) => { const c = this._anim($, el); if (c) items.push(c); });
    return this._wrap('catalog', url, { filters, pagination: this._pag($), items });
  }

  ongoing(page = 1) { return this.catalog(page, { status: 'Currently Airing', order: 'title' }); }
  completed(page = 1) { return this.catalog(page, { status: 'Finished Airing', order: 'title' }); }

  async batch(page = 1) {
    const url = page === 1 ? this.base + '/daftar-batch/' : this.base + `/daftar-batch/page/${page}/`;
    const $ = cheerio.load(await html(url));
    const items = [];
    $('.relat .animpost').each((i, el) => {
      const $e = $(el);
      const link = $e.find('a').first().attr('href');
      const title = $e.find('.title h2').first().text().trim();
      if (!link || !title) return;
      items.push({
        title,
        url: link.startsWith('http') ? link : this.base + link,
        poster: $e.find('.content-thumb img').attr('src') || null,
        type: $e.find('.type').first().text().trim() || null,
        rating: $e.find('.score').text().trim() || null,
        genres: $e.find('.stooltip .genres .mta a').map((_, a) => $(a).text()).get()
      });
    });
    return this._wrap('batch', url, { pagination: this._pag($), items });
  }

  async schedule(day = 'monday') {
    const apiUrl = `${this.base}/wp-json/custom/v1/all-schedule?perpage=20&day=${day}`;
    try {
      const data = await json(apiUrl);
      if (Array.isArray(data) && data.length) {
        return this._wrap('schedule', apiUrl, {
          schedule: data.map((item) => ({
            title: item.title || '',
            url: item.url ? item.url.replace('https://v2.samehadaku.howhttps://', 'https://') : '',
            poster: item.featured_img_src || '',
            type: item.east_type || '',
            score: item.east_score || '',
            genre: item.genre || '',
            time: item.east_time || ''
          }))
        });
      }
      throw new Error('Empty API');
    } catch {
      try {
        const $ = cheerio.load(await html(this.base + '/jadwal-rilis/'));
        const items = [];
        $('.result-schedule .animepost').each((i, el) => {
          const $e = $(el);
          const link = $e.find('a').attr('href');
          const title = $e.find('.data .title').text().trim();
          if (!link || !title) return;
          items.push({
            title,
            url: link.startsWith('http') ? link : this.base + link,
            poster: $e.find('.content-thumb img').attr('src') || null,
            type: $e.find('.content-thumb .type').text().trim() || null,
            score: $e.find('.score').text().trim() || null,
            genre: $e.find('.data .type').text().trim() || null,
            time: $e.find('.data_tw .ltseps').text().trim() || null
          });
        });
        return this._wrap('schedule', apiUrl, { schedule: items, fallback: true });
      } catch {
        return this._wrap('schedule', apiUrl, { schedule: [], error: 'Failed to fetch schedule' });
      }
    }
  }

  async search(q, page = 1) {
    const url = page === 1 ? this.base + `/search/${encodeURIComponent(q)}/` : this.base + `/search/${encodeURIComponent(q)}/page/${page}/`;
    const $ = cheerio.load(await html(url));
    const items = [];
    $('.relat .animpost').each((i, el) => { const c = this._anim($, el); if (c) items.push(c); });
    return this._wrap('search', url, { query: q, pagination: this._pag($), items });
  }

  async detail(slug) {
    const url = this.base + `/anime/${slug}/`;
    const $ = cheerio.load(await html(url));
    const info = {};
    $('.infox .spe span').each((i, el) => {
      const parts = $(el).text().trim().split(/\s+/);
      if (parts.length > 1) info[parts[0].replace(':', '').toLowerCase()] = parts.slice(1).join(' ');
    });
    const recs = [];
    $('.rand-animesu ul li').each((i, el) => {
      const $e = $(el);
      const link = $e.find('.series').attr('href');
      const t = $e.find('.judul').text().trim();
      if (link && t) recs.push({ title: t, url: link.startsWith('http') ? link : this.base + link, poster: $e.find('.series img').attr('src') || null, rating: $e.find('.rating').text().trim() || null, episode: $e.find('.episode').text().trim() || null });
    });
    return this._wrap('detail', url, {
      title: $('h1.entry-title').first().text().trim(),
      poster: $('.thumb img').attr('src') || null,
      rating: $('.rtg .archiveanime-rating span[itemprop="ratingValue"]').text().trim() || null,
      voters: $('.rtg .archiveanime-rating span[itemprop="ratingCount"]').text().trim() || null,
      synopsis: $('.entry-content-single p').map((_, el) => $(el).text().trim()).get().join('\n'),
      genres: $('.genre-info a').map((_, el) => $(el).text()).get(),
      info,
      episodes: this._epList($),
      recommended: recs.slice(0, 10)
    });
  }

  _resolve(slugOrUrl) {
    let url, slug, ep;
    if (slugOrUrl.includes('http')) {
      url = slugOrUrl;
      const m = url.match(/\/anime\/([^/]+)\/|\/([^/]+)-episode-(\d+)/);
      if (m) { slug = m[1] || m[2]; ep = parseInt(m[3]) || null; }
    } else {
      const m = slugOrUrl.match(/^(.+?)-episode-(\d+)$/);
      if (!m) throw new Error('Format salah. Gunakan slug-episode-number atau URL lengkap');
      slug = m[1];
      ep = parseInt(m[2]);
      url = this.base + `/${slug}-episode-${ep}/`;
    }
    return { url, slug, ep };
  }

  async episode(slugOrUrl) {
    const { url } = this._resolve(slugOrUrl);
    const $ = cheerio.load(await html(url));
    const downloads = this._dl($);
    const data = {
      title: $('h1.entry-title').text().trim(),
      poster: $('.infoanime .thumb img').attr('src') || $('.thumb-batch img').attr('src') || null,
      synopsis: $('.entry-content-single').text().trim(),
      genres: $('.genre-info a').map((_, el) => $(el).text()).get(),
      streams: this._streams(downloads),
      downloads,
      nav: this._nav($)
    };
    const other = this._epList($);
    if (other.length) data.otherEpisodes = other;
    return this._wrap('episode', url, data);
  }

  async watch(slugOrUrl) {
    const { url } = this._resolve(slugOrUrl);
    const $ = cheerio.load(await html(url));
    const downloads = this._dl($);
    const data = {
      title: $('h1.entry-title').text().trim(),
      streams: this._streams(downloads),
      downloads,
      nav: this._nav($)
    };
    const other = this._epList($);
    if (other.length) data.otherEpisodes = other;
    return this._wrap('watch', url, data);
  }

  async genre(slug, page = 1) {
    const url = page === 1 ? this.base + `/genre/${slug}/` : this.base + `/genre/${slug}/page/${page}/`;
    const $ = cheerio.load(await html(url));
    const items = [];
    $('.relat .animpost').each((i, el) => { const c = this._anim($, el); if (c) items.push(c); });
    return this._wrap('genre', url, { slug, pagination: this._pag($), items });
  }
}

export default {
  name: 'Samehadaku',
  category: 'anime',
  method: ['GET'],
  description: 'Multi-endpoint Samehadaku via query.action.',
  params: {
    action: { type: 'string', required: true, description: 'home|terbaru|ongoing|completed|batch|schedule|search|detail|episode|genre|watch' },
    page: { type: 'number', required: false },
    slug: { type: 'string', required: false, description: 'Slug anime / genre / slug-episode-number (wajib untuk genre, detail, episode, watch).' },
    query: { type: 'string', required: false, description: 'Kata kunci (wajib untuk search).' },
    day: { type: 'string', required: false, description: 'Hari (default monday) — untuk action=schedule.' }
  },
  cache: 60,
  timeout: 60000,
  execute: async ({ query }) => {
    const s = new SamehadakuScraper();
    const action = String(query?.action || '').toLowerCase();
    const page = parseInt(query?.page) || 1;
    switch (action) {
      case 'home': return s.home(page);
      case 'terbaru': return s.terbaru(page);
      case 'ongoing': return s.ongoing(page);
      case 'completed': return s.completed(page);
      case 'batch': return s.batch(page);
      case 'schedule': return s.schedule(query?.day || 'monday');
      case 'search': if (!query.query) throw new Error('param `query` wajib'); return s.search(query.query, page);
      case 'detail': if (!query.slug) throw new Error('param `slug` wajib'); return s.detail(query.slug);
      case 'episode': if (!query.slug) throw new Error('param `slug` wajib'); return s.episode(query.slug);
      case 'genre': if (!query.slug) throw new Error('param `slug` wajib'); return s.genre(query.slug, page);
      case 'watch': if (!query.slug) throw new Error('param `slug` wajib'); return s.watch(query.slug);
      default: throw new Error(`action tidak dikenal: "${action}"`);
    }
  }
};
