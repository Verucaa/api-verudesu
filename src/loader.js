// src/loader.js — pemuat plugin dari filesystem (KHUSUS dev/Express).
// Tidak boleh di-import oleh worker.js: modul ini pakai node:fs/path/url
// yang tidak tersedia penuh di Cloudflare Workers.
// Worker memakai registerPlugin() langsung (lihat worker.js).

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { plugins, registerPlugin } from "./core.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const getPluginsDir = () => {
  const candidates = [
    path.join(process.cwd(), "src", "plugins"),
    path.resolve(__dirname, "plugins")
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir)) return dir;
    } catch {}
  }
  return candidates[0];
};

const parsePluginPath = (filePath, baseDir) => {
  const rel = path.relative(baseDir, path.resolve(filePath)).split(path.sep).join("/");
  const parts = rel.split("/");

  if (parts.length === 1) {
    const name = parts[0].replace(/\.(js|mjs)$/, "").toLowerCase();
    return { category: "general", name, routePath: `/general/${name}` };
  }

  const category = parts[0].toLowerCase();
  const name = parts.slice(1).join("/").replace(/\.(js|mjs)$/, "").toLowerCase();
  return { category, name, routePath: `/${category}/${name}` };
};

export const loadPlugin = async (filePath) => {
  if (!/\.(js|mjs)$/.test(filePath)) return null;
  const baseDir = getPluginsDir();
  const parsed = parsePluginPath(filePath, baseDir);

  try {
    const fileUrl = `${pathToFileURL(path.resolve(filePath)).href}?v=${Date.now()}`;
    const module = await import(fileUrl);
    const handler = module.default || module;

    if (!handler || typeof handler.execute !== "function") return null;

    return registerPlugin(handler, parsed.routePath);
  } catch (err) {
    console.error(`[Plugin gagal dimuat] ${filePath}:`, err.message);
    return null;
  }
};

const listFiles = (dir) => {
  let results = [];
  try {
    if (!fs.existsSync(dir)) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        results = results.concat(listFiles(path.join(dir, entry.name)));
      } else if (/\.(js|mjs)$/.test(entry.name)) {
        results.push(path.join(dir, entry.name));
      }
    }
  } catch {}
  return results;
};

export const loadAllPlugins = async () => {
  for (const file of listFiles(getPluginsDir())) {
    try {
      await loadPlugin(file);
    } catch {}
  }
};

export const unloadPlugin = (filePath) => {
  if (!/\.(js|mjs)$/.test(filePath)) return;
  const parsed = parsePluginPath(filePath, getPluginsDir());
  const routePath = `/${parsed.category}/${parsed.name}`;
  plugins.delete(routePath);
};

export const resolveSingleRouteOnDemand = async (category, pluginName) => {
  const baseDir = getPluginsDir();
  const candidates = [
    path.join(baseDir, category, `${pluginName}.js`),
    path.join(baseDir, category, `${pluginName}.mjs`),
    path.join(baseDir, `${pluginName}.js`)
  ];

  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) return await loadPlugin(file);
    } catch {}
  }

  return null;
};