import { SamehadakuScraper } from "../_lib.js";

export default {
  name: "Samehadaku — Search",
  category: "anime",
  method: ["GET"],
  description: "Cari anime berdasarkan kata kunci.",
  params: {"query":{"type":"string","required":true,"description":"Kata kunci pencarian"},"page":{"type":"number","required":false,"description":"Nomor halaman, mulai 1"}},
  cache: 120,
  execute: async ({ query }) => {
    const scraper = new SamehadakuScraper();
    return scraper.search(query.query, Number(query.page) || 1);
  }
};
