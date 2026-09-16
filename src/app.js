import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import {
  plugins,
  loadAllPlugins,
  resolveSingleRouteOnDemand,
  sendSuccess,
  sendError,
  extractAndValidateInput,
  getCache,
  setCache
} from "./function.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.set("json spaces", 2);

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");

  const originalSend = res.send;
  res.send = function (body) {
    if (
      typeof body === "string" &&
      body.length > 1024 &&
      req.headers["accept-encoding"] &&
      req.headers["accept-encoding"].includes("gzip") &&
      !res.getHeader("Content-Encoding")
    ) {
      res.setHeader("Content-Encoding", "gzip");
      res.removeHeader("Content-Length");
      zlib.gzip(Buffer.from(body), (err, zipped) => {
        if (!err) {
          originalSend.call(this, zipped);
        } else {
          originalSend.call(this, body);
        }
      });
      return res;
    }
    return originalSend.call(this, body);
  };

  next();
});

try {
  app.use(express.static(path.resolve(__dirname, "../public")));
  app.use("/media", express.static(path.resolve(__dirname, "media")));
} catch {}

let initialized = false;
app.use(async (req, res, next) => {
  if (!initialized) {
    try {
      await loadAllPlugins();
    } catch (err) {
      console.error("[Init Error]:", err.message);
    }
    initialized = true;
  }
  next();
});

app.get("/api/endpoints", async (req, res) => {
  try {
    await loadAllPlugins();
  } catch {}

  const endpoints = {};

  for (const [routePath, data] of plugins.entries()) {
    const category = data.category || "general";

    if (!endpoints[category]) {
      endpoints[category] = [];
    }

    endpoints[category].push({
      name: data.name,
      category: data.category,
      endpoint: routePath,
      method: data.method,
      description: data.description,
      params: data.params
    });
  }

  return sendSuccess(res, {
    total: plugins.size,
    endpoints
  });
});

app.all("/:category/:plugin(*)", async (req, res) => {
  const routePath = `/${req.params.category}/${req.params.plugin}`.toLowerCase();
  let target = plugins.get(routePath);

  if (!target) {
    try {
      target = await resolveSingleRouteOnDemand(req.params.category, req.params.plugin);
    } catch {}
  }

  if (!target) {
    return sendError(res, `Endpoint '${routePath}' not found`, 404);
  }

  if (!target.method.includes(req.method)) {
    return sendError(res, `Method ${req.method} not allowed`, 405);
  }

  const { input, error } = extractAndValidateInput(target.params, req);
  if (error) {
    return sendError(res, error, 400);
  }

  const cacheKey = `${req.method}:${req.originalUrl}`;
  if (target.cache && req.method === "GET") {
    const cachedResult = getCache(cacheKey);
    if (cachedResult !== null) {
      return sendSuccess(res, cachedResult);
    }
  }

  try {
    const clientAbortController = new AbortController();
    req.on("close", () => {
      clientAbortController.abort();
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Request execution timed out")), target.timeout || 60000);
    });

    const executionPromise = target.execute(req, res, {
      input,
      query: req.query || {},
      body: req.body || {},
      params: req.params || {},
      signal: clientAbortController.signal
    });

    const result = await Promise.race([executionPromise, timeoutPromise]);

    if (!res.headersSent && result !== undefined) {
      if (target.cache && req.method === "GET") {
        setCache(cacheKey, result, target.cache);
      }
      return sendSuccess(res, result);
    }
  } catch (err) {
    if (!res.headersSent) {
      return sendError(res, err.message || "Internal Server Error", 500);
    }
  }
});

app.use((req, res) => {
  return sendError(res, "Endpoint not found", 404);
});

export default app;