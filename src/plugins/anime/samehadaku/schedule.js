import { SamehadakuScraper } from "../_lib.js";

export default {
  name: "Samehadaku — Jadwal",
  category: "anime",
  method: ["GET"],
  description: "Jadwal rilis mingguan per hari.",
  params: {"day":{"type":"string","required":false,"description":"Hari: monday, tuesday, ... (default monday)"}},
  cache: 600,
  execute: async ({ query }) => {
    const scraper = new SamehadakuScraper();
    return scraper.schedule(query.day || 'monday');
  }
};
