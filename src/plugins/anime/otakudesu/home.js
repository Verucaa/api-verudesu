import { OtakudesuScraper } from "../_lib.js";

export default {
  name: "Otakudesu — Home (Episode Terbaru)",
  category: "anime",
  method: ["GET"],
  description: "Home Otakudesu: episode terbaru dari homepage.",
  params: {},
  cache: 120,
  execute: async ({ query }) => {
    const scraper = new OtakudesuScraper();
    return scraper.home();
  }
};
