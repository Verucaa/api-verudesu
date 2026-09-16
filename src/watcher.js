import fs from "node:fs";
import chokidar from "chokidar";
import { getPluginsDir, loadPlugin, unloadPlugin } from "./function.js";

export const watchPlugins = () => {
  const dir = getPluginsDir();
  try {
    if (!fs.existsSync(dir)) return;
    const watcher = chokidar.watch(dir, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    });

    watcher
      .on("add", loadPlugin)
      .on("change", loadPlugin)
      .on("unlink", unloadPlugin);
  } catch {}
};