import { SamehadakuScraper } from "../_lib.js";

export default {
  name: "Samehadaku — Completed",
  category: "anime",
  method: ["GET"],
  description: "Anime yang sudah selesai tayang (Finished Airing).",
  params: {"page":{"type":"number","required":false,"description":"Nomor halaman, mulai 1"}},
  cache: 120,
  execute: async ({ query }) => {
    const scraper = new SamehadakuScraper();
    return scraper.completed(Number(query.page) || 1);
  }
};
