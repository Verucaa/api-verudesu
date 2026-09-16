// src/security.js — lapisan pertahanan bersama: anti-spam, DDoS level aplikasi, serangan dasar.
// Dipakai oleh Express (lokal + Vercel) dan Cloudflare Worker.
//
// Ceiling: in-memory per-proses. Restart = counter reset; multi-instance = hitungan sendiri-sendiri.
// Catalog DDoS L3/L7 sejati ada di jaringan (Cloudflare), bukan di sini.

export function createRateLimiter({ limit = 10, windowMs = 60000, maxEntries = 10000 } = {}) {
  const hits = new Map(); // key -> { count, resetAt }

  const sweep = () => {
    if (hits.size < maxEntries) return;
    const t = Date.now();
    for (const [k, e] of hits) if (t >= e.resetAt) hits.delete(k);
    if (hits.size >= maxEntries) hits.clear(); // ponytail: bila memori penuh, reset kering
  };

  return {
    check(key) {
      sweep();
      const t = Date.now();
      const e = hits.get(key);
      if (!e || t >= e.resetAt) {
        hits.set(key, { count: 1, resetAt: t + windowMs });
        return { ok: true, remaining: limit - 1, resetMs: windowMs };
      }
      if (e.count >= limit) return { ok: false, remaining: 0, resetMs: e.resetAt - t };
      e.count++;
      return { ok: true, remaining: limit - e.count, resetMs: e.resetAt - t };
    }
  };
}

export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-XSS-Protection": "1; mode=block"
};

const isStaticPath = (path) => path === "/" || /\.[a-z0-9]{2,5}$/i.test(path);

export function makeSecurity({
  limit = 10,
  windowMs = 60000,
  maxInFlight = 64,
  maxBodyBytes = 100 * 1024,
  headers = SECURITY_HEADERS
} = {}) {
  const limiter = createRateLimiter({ limit, windowMs });
  let inFlight = 0;

  const sendJson = (res, code, message, extra = {}) => {
    res.status(code);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
    return res.send(JSON.stringify({ status: false, message }, null, 2));
  };

  return function security(req, res, next) {
    for (const [k, v] of Object.entries(headers)) {
      if (!res.getHeader(k)) res.setHeader(k, v);
    }

    // Aset statis cukup diberi header; rate limit khusus jalur API.
    if (isStaticPath(req.path)) return next();

    const ip =
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      "unknown";

    // Body terlalu besar ditolak sebelum diparser (antisipasi overload).
    if (Number(req.headers["content-length"] || 0) > maxBodyBytes) {
      return sendJson(res, 413, "Request body terlalu besar");
    }

    // Tanpa User-Agent = kandidat scanner / bot sederhana.
    if (!req.headers["user-agent"]) {
      return sendJson(res, 403, "User-Agent diperlukan");
    }

    // Cap concurrency: derasnya request bersamaan (slow-loris / burst) ditolak.
    if (inFlight >= maxInFlight) {
      return sendJson(res, 503, "Server sibuk, coba lagi sebentar", { "Retry-After": "3" });
    }

    // Limit anti-spam: L = 10 request / menit / IP.
    const rl = limiter.check(ip);
    res.setHeader("X-RateLimit-Limit", limit);
    res.setHeader("X-RateLimit-Remaining", rl.remaining);
    if (!rl.ok) {
      return sendJson(res, 429, `Terlalu banyak permintaan. Maksimal ${limit} / menit.`, {
        "Retry-After": String(Math.max(1, Math.ceil(rl.resetMs / 1000)))
      });
    }

    inFlight++;
    res.on("finish", () => inFlight--);
    next();
  };
}