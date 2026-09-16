import { SamehadakuScraper } from "../_lib.js";

export default {
  name: "Samehadaku — Batch",
  category: "anime",
  method: ["GET"],
  description: "Katalog batch download.",
  params: {"page":{"type":"number","required":false,"description":"Nomor halaman, mulai 1"}},
  cache: 120,
  execute: async ({ query }) => {
    const scraper = new SamehadakuScraper();
    return scraper.batch(Number(query.page) || 1);
  }
};
