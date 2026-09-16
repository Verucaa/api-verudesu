import { SamehadakuScraper } from "../_lib.js";

export default {
  name: "Samehadaku — Home",
  category: "anime",
  method: ["GET"],
  description: "Episode terbaru dari homepage Samehadaku.",
  params: {"page":{"type":"number","required":false,"description":"Nomor halaman, mulai 1"}},
  cache: 120,
  execute: async ({ query }) => {
    const scraper = new SamehadakuScraper();
    return scraper.home(Number(query.page) || 1);
  }
};
