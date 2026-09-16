import {
  plugins,
  registerPlugin,
  sendSuccess,
  sendError,
  extractAndValidateInput,
  getCache,
  setCache
} from "./src/function.js";

import otakudesu from "./src/plugins/anime/otakudesu.js";
import samehadaku from "./src/plugins/anime/samehadaku.js";

for (const plugin of [...otakudesu, ...samehadaku]) {
  registerPlugin(plugin, plugin.path);
}

const createRateLimiter = (max, windowMs, maxEntries = 5000) => {
  const hits = new Map();
  return {
    allow(key) {
      const now = Date.now();
      if (hits.size >= maxEntries) {
        for (const [k, e] of hits) if (now >= e.resetAt) hits.delete(k);
        if (hits.size >= maxEntries) hits.clear();
      }
      const entry = hits.get(key);
      if (!entry || now >= entry.resetAt) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return { ok: true, remaining: max - 1, resetMs: windowMs };
      }
      if (entry.count >= max) {
        return { ok: false, remaining: 0, resetMs: entry.resetAt - now };
      }
      entry.count++;
      return { ok: true, remaining: max - entry.count, resetMs: entry.resetAt - now };
    }
  };
};

const createRes = () => {
  const res = {
    headers: {},
    statusCode: 200,
    body: "",
    headersSent: false,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    send(b) { this.body = b; this.headersSent = true; return this; }
  };
  return res;
};

const toResponse = (res) => new Response(res.body, { status: res.statusCode, headers: res.headers });

const getQuery = (url) => Object.fromEntries(url.searchParams.entries());

const readBody = async (request) => {
  if (request.method === "GET" || request.method === "HEAD") return {};
  const ct = request.headers.get("content-type") || "";
  const text = await request.text();
  if (ct.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(text));
  }
  try { return JSON.parse(text); } catch { return {}; }
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "X-XSS-Protection": "1; mode=block",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type"
};

const rateLimiter = createRateLimiter(30, 60000);
const clientKey = (request) =>
  request.headers.get("cf-connecting-ip") ||
  (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
  "unknown";

const applySecurity = (resp) => {
  const headers = new Headers(resp.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
};

const rateLimited = (request) => {
  const res = createRes();
  const { remaining, resetMs } = rateLimiter.allow(clientKey(request));
  res.setHeader("X-RateLimit-Limit", 30);
  res.setHeader("X-RateLimit-Remaining", remaining);
  res.setHeader("Retry-After", Math.ceil(resetMs / 1000));
  sendError(res, "Terlalu banyak permintaan. Coba lagi sebentar lagi.", 429);
  return toResponse(res);
};

const finish = (res, remaining) => {
  res.setHeader("X-RateLimit-Limit", 30);
  res.setHeader("X-RateLimit-Remaining", remaining);
  return applySecurity(toResponse(res));
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));
    const routePath = "/" + parts.join("/");

    if (routePath === "/api/endpoints") {
      const { ok, remaining, resetMs } = rateLimiter.allow(clientKey(request));
      if (!ok) return rateLimited(request);
      const groups = {};
      for (const [path, data] of plugins.entries()) {
        const category = data.category || "general";
        (groups[category] ||= []).push({
          name: data.name,
          category,
          endpoint: path,
          method: data.method,
          description: data.description,
          params: data.params,
          cache: data.cache
        });
      }
      const res = createRes();
      res.setHeader("X-RateLimit-Limit", 30);
      res.setHeader("X-RateLimit-Remaining", remaining);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: SECURITY_HEADERS });
      sendSuccess(res, { total: plugins.size, categories: Object.keys(groups), endpoints: groups });
      return applySecurity(toResponse(res));
    }

    if (parts.length >= 2) {
      const { ok, remaining } = rateLimiter.allow(clientKey(request));
      if (!ok) return rateLimited(request);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: SECURITY_HEADERS });
      const target = plugins.get(routePath);
      if (target) {
        const req = { method: request.method, url: request.url, query: getQuery(url), body: await readBody(request) };
        const res = createRes();

        if (!target.method.includes(request.method)) {
          sendError(res, `Method ${request.method} tidak diizinkan`, 405);
          return finish(res, remaining);
        }

        const { input, error } = extractAndValidateInput(target.params, req);
        if (error) {
          sendError(res, error, 400);
          return finish(res, remaining);
        }

        const cacheKey = `${request.method}:${url.pathname}`;
        if (target.cache && request.method === "GET") {
          const cached = getCache(cacheKey);
          if (cached !== null) {
            sendSuccess(res, cached);
            return finish(res, remaining);
          }
        }

        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Waktu proses melebihi batas (timeout)")), target.timeout || 60000)
        );

        try {
          const result = await Promise.race([
            target.execute(req, res, { input, query: req.query, body: req.body }),
            timeout
          ]);
          if (!res.headersSent && result !== undefined) {
            if (target.cache && request.method === "GET") setCache(cacheKey, result, target.cache);
            sendSuccess(res, result);
          }
        } catch (err) {
          if (!res.headersSent) sendError(res, err.message || "Internal Server Error", 500);
        }
        return finish(res, remaining);
      }
      const notFound = createRes();
      sendError(notFound, `Endpoint '${routePath}' tidak ditemukan`, 404);
      return finish(notFound, remaining);
    }

    return applySecurity(await env.ASSETS.fetch(request));
  }
};