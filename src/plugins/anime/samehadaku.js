import * as cheerio from 'cheerio';

const BASE_URL = 'https://v2.samehadaku.how';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.104 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.70'
];

let uaIndex = 0;

function getHeaders(ref) {
  const ua = USER_AGENTS[uaIndex % USER_AGENTS.length];
  uaIndex++;
  const isMobile = ua.includes('Mobile') || ua.includes('iPhone') || ua.includes('Android');
  const platform = ua.includes('Windows') ? 'Windows' : ua.includes('Mac') ? 'macOS' : 'Linux';
  return {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': ref || 'https://v2.samehadaku.how/',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'DNT': '1',
    'Sec-Ch-Ua': `"${ua.includes('Chrome') ? 'Google Chrome' : 'Chromium'}"`,
    'Sec-Ch-Ua-Mobile': isMobile ? '?1' : '?0',
    'Sec-Ch-Ua-Platform': `"${platform}"`,
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Connection': 'keep-alive'
  };
}

function randomDelay(min = 300, max = 800) {
  return new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));
}

async function request(url, retries = 5, ref = null) {
  for (let i = 0; i < retries; i++) {
    try {
      await randomDelay(300, 800);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: getHeaders(ref || url),
          redirect: 'follow',
          signal: controller.signal
        });
        const setCookie = (() => {
          if (typeof res.headers.getSetCookie === 'function') return res.headers.getSetCookie();
          const single = res.headers.get('set-cookie');
          return single ? [single] : [];
        })();
        const text = await res.text();
        return { text, status: res.status, setCookie };
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      if (i < retries - 1) await randomDelay(1500, 4000);
      else throw e;
    }
  }
}

async function fetchHTML(url, retries = 5, ref = null) {
  const { text, status } = await request(url, retries, ref);
  if (status >= 400) throw new Error(`HTTP ${status}`);
  return text;
}

async function fetchJSON(url, retries = 5) {
  const { text, status } = await request(url, retries);
  if (status === 200) {
    try { return JSON.parse(text); } catch { return null; }
  }
  if (retries > 1) return fetchJSON(url, retries - 1);
  throw new Error(`HTTP ${status}`);
}

class SamehadakuScraper {
  constructor() {
    this.base = BASE_URL;
    this.creator = 'rynaqrtz';
  }

  _clean(obj) {
    if (obj === null || obj === undefined) return undefined;
    if (Array.isArray(obj)) return obj.map(i => this._clean(i));
    if (typeof obj === 'object') {
      const result = {};
      for (const key of Object.keys(obj)) {
        const val = this._clean(obj[key]);
        if (val !== undefined) result[key] = val;
      }
      return Object.keys(result).length ? result : undefined;
    }
    return obj;
  }

  _parseCardGeneric($, element) {
    const $el = $(element);
    const link = $el.find('a').first().attr('href');
    const title = $el.find('.title h2').text().trim() || $el.find('.dtla h2 a').text().trim() || $el.find('.tt').text().trim();
    const poster = $el.find('img').attr('data-src') || $el.find('img').attr('src') || null;
    const type = $el.find('.type').first().text().trim() || null;
    const status = $el.find('.type').eq(1).text().trim() || $el.find('.status').text().trim() || null;
    const episode = $el.find('.epx').text().trim() || $el.find('.dtla span author').first().text().trim() || null;
    if (!link || !title) return null;
    return {
      title,
      url: link.startsWith('http') ? link : this.base + link,
      poster,
      type,
      status,
      episode
    };
  }

  _parsePagination($) {
    const result = { current: 1, next: null, hasNext: false, total: null };
    const pageLinks = [];
    $('.pagination a, .pagination span, .page-numbers, .hpage a').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href) pageLinks.push({ text, href });
    });
    const numbers = pageLinks.filter(l => /^\d+$/.test(l.text)).map(l => parseInt(l.text));
    if (numbers.length) result.total = Math.max(...numbers);
    const current = $('.pagination .page-numbers.current, .hpage .current').first();
    if (current.length) {
      const t = current.text().trim();
      if (/^\d+$/.test(t)) result.current = parseInt(t);
    }
    if (result.total && result.current < result.total) {
      result.hasNext = true;
      const nextLink = pageLinks.find(l => l.text === 'Next' || l.text === '»' || l.text.toLowerCase().includes('next'));
      if (nextLink && nextLink.href) {
        result.next = nextLink.href.startsWith('http') ? nextLink.href : this.base + nextLink.href;
      }
    }
    return result;
  }

  _parseEpisodeList($) {
    const episodes = [];
    $('.lstepsiode.listeps ul li').each((i, el) => {
      const $el = $(el);
      const titleLink = $el.find('.lchx a');
      const link = titleLink.attr('href');
      const title = titleLink.text().trim();
      const date = $el.find('.date').text().trim();
      if (link && title) {
        let episodeNumber = null;
        const matchUrl = link.match(/-episode-(\d+)/);
        if (matchUrl) {
          episodeNumber = matchUrl[1];
        } else {
          const matchTitle = title.match(/Episode\s+(\d+)/i);
          if (matchTitle) episodeNumber = matchTitle[1];
        }
        episodes.push({
          episode: episodeNumber || '0',
          title: title,
          url: link.startsWith('http') ? link : this.base + link,
          releaseDate: date || null
        });
      }
    });
    return episodes.sort((a, b) => parseInt(a.episode) - parseInt(b.episode));
  }

  _buildStreams(downloads) {
    const streams = [];
    downloads.forEach(dl => {
      const resolution = dl.resolution;
      dl.mirrors.forEach(m => {
        let url = m.url;
        let name = m.name;
        let type = 'embed';
        let r = resolution;
        if (url.includes('pixeldrain.com/u/')) {
          type = 'direct';
          const id = url.split('/').pop();
          url = `https://pixeldrain.com/u/${id}`;
          streams.push({ name: `${name} ${r}`, resolution: r, url, type });
        } else if (url.includes('vidhidepre.com/file/')) {
          const id = url.split('/').pop();
          url = `https://vidhidepre.com/embed/${id}`;
          streams.push({ name: `${name} ${r}`, resolution: r, url, type: 'embed' });
        } else if (url.includes('acefile.co') && r.includes('720p')) {
          const filename = url.split('/').pop().replace(/_/g, '-').replace('.mp4', '');
          url = `https://api.wibufile.com/embed/${filename}`;
          streams.push({ name: 'Premium 720p', resolution: '720p', url, type: 'embed' });
        } else if (url.includes('blogger.com')) {
          streams.push({ name: 'Blogspot', resolution: '', url, type: 'embed' });
        }
      });
    });
    const seen = new Set();
    return streams.filter(s => {
      if (seen.has(s.url)) return false;
      seen.add(s.url);
      return true;
    });
  }

  _buildResponse(page, url, data) {
    return this._clean({
      creator: this.creator,
      page: page,
      url: url,
      data: data
    });
  }

  async home(page = 1) {
    const url = page === 1 ? this.base + '/' : this.base + `/page/${page}/`;
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);
    const items = [];
    $('.post-show ul li').each((i, el) => {
      const card = this._parseCardGeneric($, el);
      if (card) items.push(card);
    });
    const pagination = this._parsePagination($);
    return this._buildResponse('home', url, { pagination, items });
  }

  async terbaru(page = 1) {
    const url = page === 1 ? this.base + '/anime-terbaru/' : this.base + `/anime-terbaru/page/${page}/`;
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);
    const items = [];
    $('.post-show ul li').each((i, el) => {
      const card = this._parseCardGeneric($, el);
      if (card) items.push(card);
    });
    const pagination = this._parsePagination($);
    return this._buildResponse('terbaru', url, { pagination, items });
  }

  async catalog(page = 1, filters = {}) {
    let basePath = '/daftar-anime-2/';
    if (page > 1) basePath = `/daftar-anime-2/page/${page}/`;
    let url = this.base + basePath;
    const params = new URLSearchParams();
    params.set('title', '');
    if (filters.status) params.set('status', filters.status);
    if (filters.type) params.set('type', filters.type || '');
    if (filters.order) params.set('order', filters.order);
    if (filters.genre && filters.genre.length) {
      filters.genre.forEach(g => params.append('genre[]', g));
    }
    const query = params.toString();
    if (query) url += '?' + query;

    const html = await fetchHTML(url);
    const $ = cheerio.load(html);

    const items = [];
    $('.relat .animpost').each((i, el) => {
      const $el = $(el);
      const link = $el.find('a').first().attr('href');
      const title = $el.find('.title h2').first().text().trim();
      const poster = $el.find('.content-thumb img').attr('src');
      const type = $el.find('.type').first().text().trim();
      const status = $el.find('.type').eq(1).text().trim() || $el.find('.status').text().trim() || null;
      const rating = $el.find('.score').text().trim();
      const sinopsis = $el.find('.stooltip .ttls').text().trim();
      const genres = $el.find('.stooltip .genres .mta a').map((_, a) => $(a).text()).get();
      if (link && title) {
        items.push({
          title,
          url: link.startsWith('http') ? link : this.base + link,
          poster,
          type,
          status,
          rating,
          sinopsis,
          genres
        });
      }
    });

    const pagination = this._parsePagination($);
    return this._buildResponse('catalog', url, { filters, pagination, items });
  }

  async ongoing(page = 1) {
    return this.catalog(page, { status: 'Currently Airing', order: 'title' });
  }

  async completed(page = 1) {
    return this.catalog(page, { status: 'Finished Airing', order: 'title' });
  }

  async batch(page = 1) {
    const url = page === 1 ? this.base + '/daftar-batch/' : this.base + `/daftar-batch/page/${page}/`;
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);
    const items = [];
    $('.relat .animpost').each((i, el) => {
      const $el = $(el);
      const link = $el.find('a').first().attr('href');
      const title = $el.find('.title h2').first().text().trim();
      const poster = $el.find('.content-thumb img').attr('src');
      const type = $el.find('.type').first().text().trim();
      const rating = $el.find('.score').text().trim();
      const genres = $el.find('.stooltip .genres .mta a').map((_, a) => $(a).text()).get();
      if (link && title) {
        items.push({
          title,
          url: link.startsWith('http') ? link : this.base + link,
          poster,
          type,
          rating,
          genres
        });
      }
    });
    const pagination = this._parsePagination($);
    return this._buildResponse('batch', url, { pagination, items });
  }

  async schedule(day = 'monday') {
    const apiUrl = `${this.base}/wp-json/custom/v1/all-schedule?perpage=20&day=${day}`;
    try {
      const data = await fetchJSON(apiUrl);
      if (Array.isArray(data) && data.length > 0) {
        const schedule = data.map(item => ({
          title: item.title || '',
          url: item.url ? item.url.replace('https://v2.samehadaku.howhttps://', 'https://') : '',
          poster: item.featured_img_src || '',
          type: item.east_type || '',
          score: item.east_score || '',
          genre: item.genre || '',
          time: item.east_time || '',
        }));
        return this._buildResponse('schedule', apiUrl, { schedule });
      }
      throw new Error('Empty data from API');
    } catch (e) {
      try {
        const html = await fetchHTML(this.base + '/jadwal-rilis/');
        const $ = cheerio.load(html);
        const items = [];
        $('.result-schedule .animepost').each((i, el) => {
          const $el = $(el);
          const link = $el.find('a').attr('href');
          const title = $el.find('.data .title').text().trim();
          const poster = $el.find('.content-thumb img').attr('src') || null;
          const type = $el.find('.content-thumb .type').text().trim() || null;
          const score = $el.find('.score').text().trim() || null;
          const genre = $el.find('.data .type').text().trim() || null;
          const time = $el.find('.data_tw .ltseps').text().trim() || null;
          if (link && title) {
            items.push({
              title,
              url: link.startsWith('http') ? link : this.base + link,
              poster,
              type,
              score,
              genre,
              time
            });
          }
        });
        return this._buildResponse('schedule', apiUrl, { schedule: items, fallback: true });
      } catch (e2) {
        return this._buildResponse('schedule', apiUrl, { schedule: [], error: 'Failed to fetch schedule' });
      }
    }
  }

  async search(query, page = 1) {
    const url = page === 1 ? this.base + `/search/${encodeURIComponent(query)}/` : this.base + `/search/${encodeURIComponent(query)}/page/${page}/`;
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);
    const items = [];
    $('.relat .animpost').each((i, el) => {
      const $el = $(el);
      const link = $el.find('a').first().attr('href');
      const title = $el.find('.title h2').first().text().trim();
      const poster = $el.find('.content-thumb img').attr('src');
      const type = $el.find('.type').first().text().trim();
      const status = $el.find('.type').eq(1).text().trim() || $el.find('.status').text().trim() || null;
      const rating = $el.find('.score').text().trim();
      const sinopsis = $el.find('.stooltip .ttls').text().trim();
      const genres = $el.find('.stooltip .genres .mta a').map((_, a) => $(a).text()).get();
      if (link && title) {
        items.push({
          title,
          url: link.startsWith('http') ? link : this.base + link,
          poster,
          type,
          status,
          rating,
          sinopsis,
          genres
        });
      }
    });
    const pagination = this._parsePagination($);
    return this._buildResponse('search', url, { query, pagination, items });
  }

  async detail(slug) {
    const url = this.base + `/anime/${slug}/`;
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);
    const title = $('h1.entry-title').first().text().trim();
    const poster = $('.thumb img').attr('src') || null;
    const rating = $('.rtg .archiveanime-rating span[itemprop="ratingValue"]').text().trim() || null;
    const voters = $('.rtg .archiveanime-rating span[itemprop="ratingCount"]').text().trim() || null;
    const synopsis = $('.entry-content-single p').map((_, el) => $(el).text().trim()).get().join('\n');
    const genres = $('.genre-info a').map((_, el) => $(el).text()).get();
    const info = {};
    $('.infox .spe span').each((i, el) => {
      const text = $(el).text().trim();
      const parts = text.split(/\s+/);
      if (parts.length > 1) {
        const key = parts[0].replace(':', '').toLowerCase();
        const value = parts.slice(1).join(' ');
        info[key] = value;
      }
    });
    const episodes = this._parseEpisodeList($);
    const recommended = [];
    $('.rand-animesu ul li').each((i, el) => {
      const $el = $(el);
      const link = $el.find('.series').attr('href');
      const titleRec = $el.find('.judul').text().trim();
      const posterRec = $el.find('.series img').attr('src');
      const ratingRec = $el.find('.rating').text().trim();
      const episodeRec = $el.find('.episode').text().trim();
      if (link && titleRec) {
        recommended.push({
          title: titleRec,
          url: link.startsWith('http') ? link : this.base + link,
          poster: posterRec,
          rating: ratingRec,
          episode: episodeRec
        });
      }
    });
    return this._buildResponse('detail', url, {
      title,
      poster,
      rating,
      voters,
      synopsis,
      genres,
      info,
      episodes,
      recommended: recommended.slice(0, 10)
    });
  }

  async episode(slugOrUrl) {
    let url;
    if (slugOrUrl.includes('http')) {
      url = slugOrUrl;
    } else {
      const match = slugOrUrl.match(/^(.+?)-episode-(\d+)$/);
      if (match) {
        url = this.base + `/${slugOrUrl}/`;
      } else {
        throw new Error('Invalid format. Use slug-episode-number or full URL');
      }
    }

    const html = await fetchHTML(url);
    const $ = cheerio.load(html);

    const title = $('h1.entry-title').text().trim();
    const poster = $('.infoanime .thumb img').attr('src') || $('.thumb-batch img').attr('src') || null;
    const synopsis = $('.entry-content-single').text().trim();
    const genres = $('.genre-info a').map((_, el) => $(el).text()).get();

    const downloads = [];
    $('.download-eps ul li').each((i, el) => {
      const resolution = $(el).find('strong').text().trim();
      const mirrors = [];
      $(el).find('span a').each((j, a) => {
        mirrors.push({
          name: $(a).text().trim(),
          url: $(a).attr('href')
        });
      });
      if (resolution && mirrors.length) downloads.push({ resolution, mirrors });
    });

    const streams = this._buildStreams(downloads);
    const otherEpisodes = this._parseEpisodeList($);

    const nav = {
      prev: $('.naveps .nvs:first-child a').attr('href') || null,
      all: $('.naveps .nvsc a').attr('href') || null,
      next: $('.naveps .nvs:last-child a').attr('href') || null
    };

    const data = {
      title,
      poster,
      synopsis,
      genres,
      streams,
      downloads,
      nav
    };
    if (otherEpisodes && otherEpisodes.length > 0) {
      data.otherEpisodes = otherEpisodes;
    }

    return this._buildResponse('episode', url, data);
  }

  async genre(slug, page = 1) {
    let basePath = `/genre/${slug}/`;
    if (page > 1) basePath = `/genre/${slug}/page/${page}/`;
    const url = this.base + basePath;
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);
    const items = [];
    $('.relat .animpost').each((i, el) => {
      const $el = $(el);
      const link = $el.find('a').first().attr('href');
      const title = $el.find('.title h2').first().text().trim();
      const poster = $el.find('.content-thumb img').attr('src');
      const type = $el.find('.type').first().text().trim();
      const status = $el.find('.type').eq(1).text().trim() || $el.find('.status').text().trim() || null;
      const rating = $el.find('.score').text().trim();
      const sinopsis = $el.find('.stooltip .ttls').text().trim();
      const genres = $el.find('.stooltip .genres .mta a').map((_, a) => $(a).text()).get();
      if (link && title) {
        items.push({
          title,
          url: link.startsWith('http') ? link : this.base + link,
          poster,
          type,
          status,
          rating,
          sinopsis,
          genres
        });
      }
    });
    const pagination = this._parsePagination($);
    return this._buildResponse('genre', url, { slug, pagination, items });
  }

  async watch(slugOrUrl) {
    let url;
    if (slugOrUrl.includes('http')) {
      url = slugOrUrl;
    } else {
      const match = slugOrUrl.match(/^(.+?)-episode-(\d+)$/);
      if (match) {
        url = this.base + `/${slugOrUrl}/`;
      } else {
        throw new Error('Invalid format. Use slug-episode-number or full URL');
      }
    }

    const html = await fetchHTML(url);
    const $ = cheerio.load(html);

    const title = $('h1.entry-title').text().trim();

    const downloads = [];
    $('.download-eps ul li').each((i, el) => {
      const resolution = $(el).find('strong').text().trim();
      const mirrors = [];
      $(el).find('span a').each((j, a) => {
        mirrors.push({
          name: $(a).text().trim(),
          url: $(a).attr('href')
        });
      });
      if (resolution && mirrors.length) downloads.push({ resolution, mirrors });
    });

    const streams = this._buildStreams(downloads);
    const otherEpisodes = this._parseEpisodeList($);

    const nav = {
      prev: $('.naveps .nvs:first-child a').attr('href') || null,
      all: $('.naveps .nvsc a').attr('href') || null,
      next: $('.naveps .nvs:last-child a').attr('href') || null
    };

    const result = {
      creator: this.creator,
      page: 'watch',
      url: url,
      data: {
        title,
        streams,
        downloads,
        nav
      }
    };
    if (otherEpisodes && otherEpisodes.length > 0) {
      result.data.otherEpisodes = otherEpisodes;
    }

    return this._clean(result);
  }
}

export default [
  {
    name: 'Samehadaku — Home',
    category: 'anime',
    path: '/anime/samehadaku/home',
    method: ['GET'],
    description: 'Episode terbaru dari homepage Samehadaku.',
    params: {
      page: { type: 'number', required: false, description: 'Nomor halaman, mulai 1' }
    },
    cache: 120,
    execute: async ({ query }) => {
      const scraper = new SamehadakuScraper();
      return scraper.home(Number(query.page) || 1);
    }
  },
  {
    name: 'Samehadaku — Anime Terbaru',
    category: 'anime',
    path: '/anime/samehadaku/terbaru',
    method: ['GET'],
    description: 'Daftar anime terbaru.',
    params: {
      page: { type: 'number', required: false, description: 'Nomor halaman, mulai 1' }
    },
    cache: 120,
    execute: async ({ query }) => {
      const scraper = new SamehadakuScraper();
      return scraper.terbaru(Number(query.page) || 1);
    }
  },
  {
    name: 'Samehadaku — Ongoing',
    category: 'anime',
    path: '/anime/samehadaku/ongoing',
    method: ['GET'],
    description: 'Anime yang sedang tayang (Currently Airing).',
    params: {
      page: { type: 'number', required: false, description: 'Nomor halaman, mulai 1' }
    },
    cache: 120,
    execute: async ({ query }) => {
      const scraper = new SamehadakuScraper();
      return scraper.ongoing(Number(query.page) || 1);
    }
  },
  {
    name: 'Samehadaku — Completed',
    category: 'anime',
    path: '/anime/samehadaku/completed',
    method: ['GET'],
    description: 'Anime yang sudah selesai tayang (Finished Airing).',
    params: {
      page: { type: 'number', required: false, description: 'Nomor halaman, mulai 1' }
    },
    cache: 120,
    execute: async ({ query }) => {
      const scraper = new SamehadakuScraper();
      return scraper.completed(Number(query.page) || 1);
    }
  },
  {
    name: 'Samehadaku — Batch',
    category: 'anime',
    path: '/anime/samehadaku/batch',
    method: ['GET'],
    description: 'Katalog batch download.',
    params: {
      page: { type: 'number', required: false, description: 'Nomor halaman, mulai 1' }
    },
    cache: 120,
    execute: async ({ query }) => {
      const scraper = new SamehadakuScraper();
      return scraper.batch(Number(query.page) || 1);
    }
  },
  {
    name: 'Samehadaku — Jadwal',
    category: 'anime',
    path: '/anime/samehadaku/schedule',
    method: ['GET'],
    description: 'Jadwal rilis mingguan per hari.',
    params: {
      day: { type: 'string', required: false, description: 'Hari: monday, tuesday, ... (default monday)' }
    },
    cache: 600,
    execute: async ({ query }) => {
      const scraper = new SamehadakuScraper();
      return scraper.schedule(query.day || 'monday');
    }
  },
  {
    name: 'Samehadaku — Search',
    category: 'anime',
    path: '/anime/samehadaku/search',
    method: ['GET'],
    description: 'Cari anime berdasarkan kata kunci.',
    params: {
      query: { type: 'string', required: true, description: 'Kata kunci pencarian' },
      page: { type: 'number', required: false, description: 'Nomor halaman, mulai 1' }
    },
    cache: 120,
    execute: async ({ query }) => {
      const scraper = new SamehadakuScraper();
      return scraper.search(query.query, Number(query.page) || 1);
    }
  },
  {
    name: 'Samehadaku — Detail Anime',
    category: 'anime',
    path: '/anime/samehadaku/detail',
    method: ['GET'],
    description: 'Detail anime + daftar episode.',
    params: {
      slug: { type: 'string', required: true, description: 'Slug anime dari /anime/{slug}/' }
    },
    cache: 180,
    execute: async ({ query }) => {
      const scraper = new SamehadakuScraper();
      return scraper.detail(query.slug);
    }
  },
  {
    name: 'Samehadaku — Episode',
    category: 'anime',
    path: '/anime/samehadaku/episode',
    method: ['GET'],
    description: 'Episode lengkap: stream, download, navigasi.',
    params: {
      slug: { type: 'string', required: true, description: 'Format slug-episode-angka, contoh one-piece-episode-1' }
    },
    cache: 120,
    execute: async ({ query }) => {
      const scraper = new SamehadakuScraper();
      return scraper.episode(query.slug);
    }
  },
  {
    name: 'Samehadaku — Genre',
    category: 'anime',
    path: '/anime/samehadaku/genre',
    method: ['GET'],
    description: 'Anime berdasarkan genre.',
    params: {
      slug: { type: 'string', required: true, description: 'Slug genre, contoh: comedy' },
      page: { type: 'number', required: false, description: 'Nomor halaman, mulai 1' }
    },
    cache: 120,
    execute: async ({ query }) => {
      const scraper = new SamehadakuScraper();
      return scraper.genre(query.slug, Number(query.page) || 1);
    }
  },
  {
    name: 'Samehadaku — Watch',
    category: 'anime',
    path: '/anime/samehadaku/watch',
    method: ['GET'],
    description: 'Ringan: title + stream untuk menonton.',
    params: {
      slug: { type: 'string', required: true, description: 'Format slug-episode-angka atau URL episode' }
    },
    cache: 120,
    execute: async ({ query }) => {
      const scraper = new SamehadakuScraper();
      return scraper.watch(query.slug);
    }
  }
];