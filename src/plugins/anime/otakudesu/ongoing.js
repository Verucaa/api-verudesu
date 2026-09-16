import { OtakudesuScraper } from "../_lib.js";

export default {
  name: "Otakudesu — Ongoing",
  category: "anime",
  method: ["GET"],
  description: "Anime berstatus ongoing (sedang tayang).",
  params: {"page":{"type":"number","required":false,"description":"Nomor halaman, mulai 1"}},
  cache: 120,
  execute: async ({ query }) => {
    const scraper = new OtakudesuScraper();
    return scraper.ongoing(Number(query.page) || 1);
  }
};
