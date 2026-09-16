import { OtakudesuScraper } from "../_lib.js";

export default {
  name: "Otakudesu — Batch",
  category: "anime",
  method: ["GET"],
  description: "Batch download lengkap anime.",
  params: {"slug":{"type":"string","required":true,"description":"Slug batch"}},
  cache: 120,
  execute: async ({ query }) => {
    const scraper = new OtakudesuScraper();
    return scraper.batch(query.slug);
  }
};
