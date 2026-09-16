import { SamehadakuScraper } from "../_lib.js";

export default {
  name: "Samehadaku — Genre",
  category: "anime",
  method: ["GET"],
  description: "Anime berdasarkan genre.",
  params: {"slug":{"type":"string","required":true,"description":"Slug genre, contoh: comedy"},"page":{"type":"number","required":false,"description":"Nomor halaman, mulai 1"}},
  cache: 120,
  execute: async ({ query }) => {
    const scraper = new SamehadakuScraper();
    return scraper.genre(query.slug, Number(query.page) || 1);
  }
};
