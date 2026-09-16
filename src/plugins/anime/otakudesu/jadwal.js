import { OtakudesuScraper } from "../_lib.js";

export default {
  name: "Otakudesu — Jadwal Rilis",
  category: "anime",
  method: ["GET"],
  description: "Jadwal rilis mingguan anime.",
  params: {},
  cache: 600,
  execute: async ({ query }) => {
    const scraper = new OtakudesuScraper();
    return scraper.jadwalRilis();
  }
};
