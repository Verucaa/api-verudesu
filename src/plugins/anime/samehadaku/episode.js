import { SamehadakuScraper } from "../_lib.js";

export default {
  name: "Samehadaku — Episode",
  category: "anime",
  method: ["GET"],
  description: "Episode lengkap: stream, download, navigasi.",
  params: {"slug":{"type":"string","required":true,"description":"Format slug-episode-angka, contoh one-piece-episode-1"}},
  cache: 120,
  execute: async ({ query }) => {
    const scraper = new SamehadakuScraper();
    return scraper.episode(query.slug);
  }
};
