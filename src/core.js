// src/core.js — runtime inti API Verudesu.
// Aman dijalankan di Node (Express) DAN Cloudflare Workers:
// TANPA import node builtin (fs/path/url) => aman di-bundle ke worker.
// Bagian yang butuh filesystem ada di src/loader.js (hanya untuk dev/Express).

export const CREATOR = "Veruu | Community VeruProject";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
];

export const getRandomUserAgent = () =>
  USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

export const plugins = new Map();

export const sendSuccess = (res, result = null, statusCode = 200) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(statusCode).send(
    JSON.stringify({ status: true, creator: CREATOR, result }, null, 2)
  );
};

export const sendError = (res, message = "Internal Server Error", statusCode = 500) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(statusCode).send(
    JSON.stringify({ status: false, creator: CREATOR, message }, null, 2)
  );
};

export const safeFetch = async (url, options = {}, timeoutMs = 20000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let signal = controller.signal;
  if (options.signal) {
    if (typeof AbortSignal.any === "function") {
      signal = AbortSignal.any([controller.signal, options.signal]);
    } else {
      options.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  try {
    return await fetch(url, {
      ...options,
      signal,
      headers: {
        "User-Agent": getRandomUserAgent(),
        "Connection": "keep-alive",
        ...(options.headers || {})
      }
    });
  } finally {
    clearTimeout(timer);
  }
};

const cacheStorage = new Map();

export const getCache = (key) => {
  const cached = cacheStorage.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expireAt) {
    cacheStorage.delete(key);
    return null;
  }
  return cached.data;
};

export const setCache = (key, data, ttlSeconds = 60) => {
  cacheStorage.set(key, {
    data,
    expireAt: Date.now() + ttlSeconds * 1000
  });
};

export const extractAndValidateInput = (schema = {}, req) => {
  const input = { ...(req.query || {}), ...(req.body || {}) };

  for (const [key, config] of Object.entries(schema)) {
    const opts = typeof config === "object" && config ? config : { type: "string" };
    const isRequired = !!opts.required;
    let val = input[key];

    if (val === undefined || val === null || val === "") {
      if (isRequired) {
        const desc = opts.description ? ` (${opts.description})` : "";
        return { input: null, error: `Parameter '${key}' wajib diisi${desc}` };
      }
      continue;
    }

    if (opts.type === "number") {
      const num = Number(val);
      if (isNaN(num)) {
        return { input: null, error: `Parameter '${key}' harus berupa angka` };
      }
      input[key] = num;
    } else if (opts.type === "boolean") {
      input[key] = val === "true" || val === true || val === 1 || val === "1";
    }
  }

  return { input, error: null };
};

export const registerPlugin = (handler, routePath) => {
  if (!handler || typeof handler.execute !== "function") return null;
  const parts = routePath.replace(/^\/+/, "").split("/");
  const category = parts[0]?.toLowerCase() || "general";
  const name = parts.slice(1).join("/").toLowerCase();
  const finalPath = `/${category}/${name}`;

  const pluginObj = {
    name: handler.name || name,
    category: (handler.category || category).toLowerCase(),
    path: finalPath,
    method: (handler.method || ["GET"]).map((m) => m.toUpperCase()),
    description: handler.description || "",
    params: handler.params || {},
    cache: typeof handler.cache === "number" ? handler.cache : null,
    timeout: typeof handler.timeout === "number" ? handler.timeout : 60000,
    execute: handler.execute
  };

  plugins.set(finalPath, pluginObj);
  return pluginObj;
};

export const createRateLimiter = (max, windowMs, maxEntries = 5000) => {
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
    },
    size: () => hits.size
  };
};