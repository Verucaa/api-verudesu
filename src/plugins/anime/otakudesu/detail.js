import { OtakudesuScraper } from "../_lib.js";

export default {
  name: "Otakudesu — Detail Anime",
  category: "anime",
  method: ["GET"],
  description: "Detail anime + daftar episode (slug dari url /anime/{slug}/).",
  params: {"slug":{"type":"string","required":true,"description":"Slug anime"}},
  cache: 180,
  execute: async ({ query }) => {
    const scraper = new OtakudesuScraper();
    return scraper.detail(query.slug);
  }
};
