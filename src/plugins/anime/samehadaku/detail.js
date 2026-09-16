import { SamehadakuScraper } from "../_lib.js";

export default {
  name: "Samehadaku — Detail Anime",
  category: "anime",
  method: ["GET"],
  description: "Detail anime + daftar episode.",
  params: {"slug":{"type":"string","required":true,"description":"Slug anime dari /anime/{slug}/"}},
  cache: 180,
  execute: async ({ query }) => {
    const scraper = new SamehadakuScraper();
    return scraper.detail(query.slug);
  }
};
