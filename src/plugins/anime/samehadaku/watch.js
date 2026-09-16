import { SamehadakuScraper } from "../_lib.js";

export default {
  name: "Samehadaku — Watch",
  category: "anime",
  method: ["GET"],
  description: "Ringan: title + stream untuk menonton.",
  params: {"slug":{"type":"string","required":true,"description":"Format slug-episode-angka atau URL episode"}},
  cache: 120,
  execute: async ({ query }) => {
    const scraper = new SamehadakuScraper();
    return scraper.watch(query.slug);
  }
};
