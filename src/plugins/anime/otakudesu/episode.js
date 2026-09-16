import { OtakudesuScraper } from "../_lib.js";

export default {
  name: "Otakudesu — Episode",
  category: "anime",
  method: ["GET"],
  description: "Episode lengkap: stream, download, navigasi episode.",
  params: {"slug":{"type":"string","required":true,"description":"Slug episode"}},
  cache: 120,
  execute: async ({ query }) => {
    const scraper = new OtakudesuScraper();
    return scraper.episode(query.slug);
  }
};
