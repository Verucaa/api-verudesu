import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CREATOR = "Veruu | Community VeruProject";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
];

export const getRandomUserAgent = () => {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
};

export const getPluginsDir = () => {
  const possibleDirs = [
    path.join(process.cwd(), "src", "plugins"),
    path.join(process.cwd(), "plugins"),
    path.resolve(__dirname, "plugins"),
    path.resolve(__dirname, "../src/plugins")
  ];

  for (const dir of possibleDirs) {
    try {
      if (fs.existsSync(dir)) {
        return dir;
      }
    } catch {}
  }

  return possibleDirs[0];
};

export const plugins = new Map();

export const sendSuccess = (res, result = null, statusCode = 200) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(statusCode).send(
    JSON.stringify(
      {
        status: true,
        creator: CREATOR,
        result
      },
      null,
      2
    )
  );
};

export const sendError = (res, message = "Internal Server Error", statusCode = 500) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(statusCode).send(
    JSON.stringify(
      {
        status: false,
        creator: CREATOR,
        message
      },
      null,
      2
    )
  );
};

export const safeFetch = async (url, options = {}, timeoutMs = 20000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let combinedSignal = controller.signal;
  if (options.signal) {
    if (typeof AbortSignal.any === "function") {
      combinedSignal = AbortSignal.any([controller.signal, options.signal]);
    } else {
      options.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  try {
    const res = await fetch(url, {
      ...options,
      signal: combinedSignal,
      headers: {
        "User-Agent": getRandomUserAgent(),
        "Connection": "keep-alive",
        ...(options.headers || {})
      }
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
};

export const pipeStream = async (url, res, options = {}, timeoutMs = 30000) => {
  const response = await safeFetch(url, options, timeoutMs);
  if (!response.ok) {
    throw new Error(`Gagal membuka stream media (${response.status})`);
  }

  const contentType = response.headers.get("content-type");
  const contentLength = response.headers.get("content-length");

  if (contentType) res.setHeader("Content-Type", contentType);
  if (contentLength) res.setHeader("Content-Length", contentLength);
  res.setHeader("Accept-Ranges", "bytes");

  const readable = Readable.fromWeb(response.body);
  readable.pipe(res);

  return new Promise((resolve, reject) => {
    readable.on("end", resolve);
    readable.on("error", reject);
    res.on("close", () => {
      readable.destroy();
      resolve();
    });
  });
};

export const downloadBuffer = async (url, options = {}, timeoutMs = 30000) => {
  const res = await safeFetch(url, options, timeoutMs);
  if (!res.ok) {
    throw new Error(`Failed to download buffer (${res.status})`);
  }
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
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
  const memUsage = process.memoryUsage().rss / 1024 / 1024;
  if (memUsage > 180 || cacheStorage.size > 1500) {
    const purgeCount = Math.floor(cacheStorage.size * 0.3);
    const iterator = cacheStorage.keys();
    for (let i = 0; i < purgeCount; i++) {
      const nextKey = iterator.next().value;
      if (nextKey) cacheStorage.delete(nextKey);
    }
  }

  cacheStorage.set(key, {
    data,
    expireAt: Date.now() + ttlSeconds * 1000
  });
};

export const purgeAllCache = () => {
  const size = cacheStorage.size;
  cacheStorage.clear();
  return size;
};

const cleanTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cacheStorage.entries()) {
    if (now > v.expireAt) {
      cacheStorage.delete(k);
    }
  }

  if (process.memoryUsage().rss / 1024 / 1024 > 220) {
    cacheStorage.clear();
    if (global.gc) {
      global.gc();
    }
  }
}, 180000);

if (cleanTimer.unref) {
  cleanTimer.unref();
}

export const extractAndValidateInput = (schema, req) => {
  const input = { ...(req.query || {}), ...(req.body || {}) };

  if (!schema || typeof schema !== "object") {
    return { input, error: null };
  }

  for (const [key, config] of Object.entries(schema)) {
    const isRequired = typeof config === "object" ? config.required : false;
    let val = input[key];

    if (val === undefined || val === null || val === "") {
      if (isRequired) {
        const desc = typeof config === "object" && config.description ? ` (${config.description})` : "";
        return { input: null, error: `Parameter '${key}' wajib diisi${desc}` };
      }
      continue;
    }

    if (typeof config === "object" && config.type) {
      if (config.type === "number") {
        const num = Number(val);
        if (isNaN(num)) {
          return { input: null, error: `Parameter '${key}' harus berupa angka numerik` };
        }
        input[key] = num;
      } else if (config.type === "boolean") {
        input[key] = val === "true" || val === true || val === 1 || val === "1";
      }
    }
  }

  return { input, error: null };
};

const parsePluginPath = (filePath, baseDir) => {
  const fullPath = path.resolve(filePath);
  const rel = path.relative(baseDir, fullPath).split(path.sep).join("/");
  const parts = rel.split("/");

  if (parts.length === 1) {
    const name = parts[0].replace(/\.(js|mjs)$/, "").toLowerCase();
    return { category: "general", name, routePath: `/general/${name}` };
  }

  const category = parts[0].toLowerCase();
  const name = parts.slice(1).join("/").replace(/\.(js|mjs)$/, "").toLowerCase();
  const routePath = `/${category}/${name}`;

  return { category, name, routePath };
};

export const loadPlugin = async (filePath) => {
  if (!filePath.endsWith(".js") && !filePath.endsWith(".mjs")) return null;
  const baseDir = getPluginsDir();
  const parsed = parsePluginPath(filePath, baseDir);
  if (!parsed) return null;

  try {
    const fullPath = path.resolve(filePath);
    const fileUrl = `${pathToFileURL(fullPath).href}?v=${Date.now()}`;
    const module = await import(fileUrl);
    const handler = module.default || module;

    const register = (h) => {
      if (!h || typeof h.execute !== "function") return null;
      const pluginObj = {
        name: h.name || parsed.name,
        category: h.category || parsed.category,
        path: h.path || parsed.routePath,
        method: (h.method || ["GET"]).map((m) => m.toUpperCase()),
        description: h.description || "",
        params: h.params || {},
        cache: typeof h.cache === "number" ? h.cache : null,
        timeout: typeof h.timeout === "number" ? h.timeout : 60000,
        execute: h.execute
      };
      plugins.set(pluginObj.path, pluginObj);
      return pluginObj;
    };

    if (Array.isArray(handler)) {
      for (const h of handler) register(h);
      return handler.length ? handler : null;
    }

    return register(handler) || null;
  } catch (err) {
    console.error(`[Plugin Load Failed] ${filePath}:`, err.message);
    return null;
  }
};

export const unloadPlugin = (filePath) => {
  const baseDir = getPluginsDir();
  const parsed = parsePluginPath(filePath, baseDir);
  if (parsed && plugins.has(parsed.routePath)) {
    plugins.delete(parsed.routePath);
  }
};

const getFiles = (dir) => {
  let results = [];
  try {
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of list) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        results = results.concat(getFiles(fullPath));
      } else if (item.isFile() && (item.name.endsWith(".js") || item.name.endsWith(".mjs"))) {
        results.push(fullPath);
      }
    }
  } catch (err) {
    console.error(`[ReadDir Error]:`, err.message);
  }
  return results;
};

export const loadAllPlugins = async () => {
  const dir = getPluginsDir();
  try {
    if (!fs.existsSync(dir)) return;
    const files = getFiles(dir);
    for (const file of files) {
      try {
        await loadPlugin(file);
      } catch {}
    }
  } catch (err) {
    console.error(`[LoadAllPlugins Error]:`, err.message);
  }
};

export const resolveSingleRouteOnDemand = async (category, pluginName) => {
  const baseDir = getPluginsDir();
  const possiblePaths = [
    path.join(baseDir, category, `${pluginName}.js`),
    path.join(baseDir, category, `${pluginName}.mjs`),
    path.join(baseDir, `${pluginName}.js`)
  ];

  for (const filePath of possiblePaths) {
    try {
      if (fs.existsSync(filePath)) {
        return await loadPlugin(filePath);
      }
    } catch {}
  }

  return null;
};

export const registerPlugin = (handler, routePath) => {
  if (!handler || typeof handler.execute !== "function") return null;
  const parts = String(routePath).replace(/^\/+/, "").split("/");
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