import { OtakudesuScraper } from "../_lib.js";

export default {
  name: "Otakudesu — Complete",
  category: "anime",
  method: ["GET"],
  description: "Anime berstatus complete (selesai tayang).",
  params: {"page":{"type":"number","required":false,"description":"Nomor halaman, mulai 1"}},
  cache: 120,
  execute: async ({ query }) => {
    const scraper = new OtakudesuScraper();
    return scraper.complete(Number(query.page) || 1);
  }
};
