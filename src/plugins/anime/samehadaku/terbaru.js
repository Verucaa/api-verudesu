import { SamehadakuScraper } from "../_lib.js";

export default {
  name: "Samehadaku — Anime Terbaru",
  category: "anime",
  method: ["GET"],
  description: "Daftar anime terbaru.",
  params: {"page":{"type":"number","required":false,"description":"Nomor halaman, mulai 1"}},
  cache: 120,
  execute: async ({ query }) => {
    const scraper = new SamehadakuScraper();
    return scraper.terbaru(Number(query.page) || 1);
  }
};
