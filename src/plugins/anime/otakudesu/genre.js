import { OtakudesuScraper } from "../_lib.js";

export default {
  name: "Otakudesu — Genre",
  category: "anime",
  method: ["GET"],
  description: "Anime berdasarkan genre (slug genre).",
  params: {"slug":{"type":"string","required":true,"description":"Slug genre, contoh: comedy, action"},"page":{"type":"number","required":false,"description":"Nomor halaman, mulai 1"}},
  cache: 120,
  execute: async ({ query }) => {
    const scraper = new OtakudesuScraper();
    return scraper.genre(query.slug, Number(query.page) || 1);
  }
};
