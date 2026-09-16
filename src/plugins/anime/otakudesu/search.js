import { OtakudesuScraper } from "../_lib.js";

export default {
  name: "Otakudesu — Search",
  category: "anime",
  method: ["GET"],
  description: "Cari anime berdasarkan kata kunci.",
  params: {"query":{"type":"string","required":true,"description":"Kata kunci pencarian"}},
  cache: 120,
  execute: async ({ query }) => {
    const scraper = new OtakudesuScraper();
    return scraper.search(query.query);
  }
};
