import { OtakudesuScraper } from "../_lib.js";

export default {
  name: "Otakudesu — Watch",
  category: "anime",
  method: ["GET"],
  description: "Ringan: hanya title + stream untuk menonton.",
  params: {"slug":{"type":"string","required":true,"description":"Slug episode"}},
  cache: 120,
  execute: async ({ query }) => {
    const scraper = new OtakudesuScraper();
    return scraper.watch(query.slug);
  }
};
