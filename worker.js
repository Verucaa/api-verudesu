import {
  plugins,
  registerPlugin,
  sendSuccess,
  sendError,
  extractAndValidateInput,
  getCache,
  setCache,
  createRateLimiter
} from "./src/core.js";

import otakudesu from "./src/plugins/anime/otakudesu.js";
import samehadaku from "./src/plugins/anime/samehadaku.js";

// Satu file plugin = satu bundle array of routes.
// Path di-derive dari nama provider + slug dari `name` route.
const BUNDLES = [
  { provider: "otakudesu", routes: otakudesu },
  { provider: "samehadaku", routes: samehadaku }
];

const slugify = (s) =>
  String(s)
    .replace(/^[^—]*—\s*/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const ROUTES = [];
for (const { provider, routes } of BUNDLES) {
  for (const r of routes) {
    ROUTES.push([r, `/anime/${provider}/${slugify(r.name)}`]);
  }
}

for (const [handler, routePath] of ROUTES) {
  registerPlugin(handler, routePath);
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "X-XSS-Protection": "1; mode=block"
};

const SECURITY_HEADERS_FULL = {
  ...SECURITY_HEADERS,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type"
};

// Anti-spam: 10 request / menit / IP.
// DDoS L3/L7 sejati ditangani edge Cloudflare (managed protection / zone rate limit);
// limiter ini hanya guard level aplikasi.
const RATE_LIMIT = 10;
const MAX_BODY_BYTES = 100 * 1024;
const rateLimiter = createRateLimiter(RATE_LIMIT, 60000);
const clientKey = (request) =>
  request.headers.get("cf-connecting-ip") ||
  (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
  "unknown";

// Stub Response Express-compatible agar sendSuccess/sendError dari core.js bisa dipakai.
const createRes = () => ({
  headers: {},
  statusCode: 200,
  body: "",
  headersSent: false,
  setHeader(k, v) { this.headers[k] = v; },
  status(c) { this.statusCode = c; return this; },
  send(b) { this.body = b; this.headersSent = true; return this; }
});

const toResponse = (res) => new Response(res.body, { status: res.statusCode, headers: res.headers });

const applySecurity = (resp) => {
  const headers = new Headers(resp.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS_FULL)) headers.set(k, v);
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
};

const guardRequest = (request) => {
  if (!request.headers.get("user-agent")) {
    return new Response(JSON.stringify({ status: false, message: "User-Agent diperlukan" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BODY_BYTES) {
    return new Response(JSON.stringify({ status: false, message: "Request body terlalu besar" }), {
      status: 413,
      headers: { "Content-Type": "application/json" }
    });
  }
  return null;
};

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

const withRateHeaders = (res, check) => {
  res.setHeader("X-RateLimit-Limit", RATE_LIMIT);
  res.setHeader("X-RateLimit-Remaining", check.remaining);
  return res;
};

const dataToResponse = (res, check) =>
  applySecurity(toResponse(withRateHeaders(res, check)));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));
    const routePath = "/" + parts.join("/");

    if (routePath === "/api/endpoints" || parts.length >= 2) {
      const bad = guardRequest(request);
      if (bad) return applySecurity(bad);
    }

    const check = rateLimiter.allow(clientKey(request));
    const rateLimited = () => {
      const res = createRes();
      res.setHeader("Retry-After", Math.max(1, Math.ceil(check.resetMs / 1000)));
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: SECURITY_HEADERS_FULL });
      }
      sendError(res, "Terlalu banyak permintaan. Coba lagi sebentar lagi.", 429);
      return dataToResponse(res, check);
    };

    if (routePath === "/api/endpoints") {
      if (!check.ok) return rateLimited();
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: SECURITY_HEADERS_FULL });
      }
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
      sendSuccess(res, { total: plugins.size, categories: Object.keys(groups), endpoints: groups });
      return dataToResponse(res, check);
    }

    if (parts.length >= 2) {
      if (!check.ok) return rateLimited();
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: SECURITY_HEADERS_FULL });
      }

      const target = plugins.get(routePath);
      if (target) {
        const req = { method: request.method, url: request.url, query: getQuery(url), body: await readBody(request) };
        const res = createRes();

        if (!target.method.includes(request.method)) {
          sendError(res, `Method ${request.method} tidak diizinkan`, 405);
          return dataToResponse(res, check);
        }

        const { input, error } = extractAndValidateInput(target.params, req);
        if (error) {
          sendError(res, error, 400);
          return dataToResponse(res, check);
        }

        const cacheKey = `${request.method}:${url.pathname}${url.search}`;
        if (target.cache && request.method === "GET") {
          const cached = getCache(cacheKey);
          if (cached !== null) {
            sendSuccess(res, cached);
            return dataToResponse(res, check);
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
        return dataToResponse(res, check);
      }

      const notFound = createRes();
      sendError(notFound, `Endpoint '${routePath}' tidak ditemukan`, 404);
      return dataToResponse(notFound, check);
    }

    return applySecurity(await env.ASSETS.fetch(request));
  }
};
