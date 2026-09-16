import { SamehadakuScraper } from "../_lib.js";

export default {
  name: "Samehadaku — Ongoing",
  category: "anime",
  method: ["GET"],
  description: "Anime yang sedang tayang (Currently Airing).",
  params: {"page":{"type":"number","required":false,"description":"Nomor halaman, mulai 1"}},
  cache: 120,
  execute: async ({ query }) => {
    const scraper = new SamehadakuScraper();
    return scraper.ongoing(Number(query.page) || 1);
  }
};
