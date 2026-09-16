import { OtakudesuScraper } from "../_lib.js";

export default {
  name: "Otakudesu — Daftar Genre",
  category: "anime",
  method: ["GET"],
  description: "Daftar semua genre yang tersedia di Otakudesu.",
  params: {},
  cache: 3600,
  execute: async ({ query }) => {
    const scraper = new OtakudesuScraper();
    return scraper.genreList();
  }
};
