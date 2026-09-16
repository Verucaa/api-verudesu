# VERUdesu API 🎌

> **Dibuat & dikelola oleh VeruProject** — 💙 Anime API dengan tema minimalis Jepang.

Serverless-friendly REST API khusus **anime** dengan engine plugin ringan. Data dishred dari
**Otakudesu** dan **Samehadaku**. Siap deploy ke **Vercel** maupun **Cloudflare Workers**.

---

## 📚 Daftar Isi

- [Fitur](#-fitur)
- [Cara Menjalankan](#-cara-menjalankan)
- [Daftar Endpoint](#-daftar-endpoint)
- [Cara Pakai API](#-cara-pakai-api)
- [Menambah Endpoint Baru](#-menambah-endpoint-baru)
- [Deploy](#-deploy)
- [Struktur Folder](#-struktur-folder)
- [Lisensi & Pemilik](#-lisensi--pemilik)

---

## ✅ Fitur

| Fitur | Keterangan |
|---|---|
| Engine plugin | Satu file = banyak endpoint (export array) |
| Router otomatis | Path dibentuk dari `kategori/nama-file` |
| Validasi param | `string`, `number`, `boolean`, required opsional |
| Cache & timeout | Per-endpoint via `cache` & `timeout` di file plugin |
| UI mega | Landing Jepang, daftar endpoint, tester langsung, terminal |
| Group otomatis | Endpoint dikelompokkan per **provider** (Otakudesu, Samehadaku, dst) |
| Multi-platform | Jalankan di Node lokal, Vercel, atau Cloudflare Workers |
| CORS terbuka | Bebas dipanggil dari aplikasi mana pun |

---

## 🚀 Cara Menjalankan

Persyaratan: **Node.js 18+** (fetch global) dan npm.

```bash
npm install
npm start
```

Server naik di `http://localhost:3000`:

| URL | Fungsi |
|---|---|
| `/` | Landing page + daftar endpoint + tester |
| `/api/endpoints` | Katalog JSON semua endpoint |
| `/anime/...` | Endpoint API anime |

Mode development (hidupkan watcher plugin agar reload otomatis saat file berubah):

```bash
npm run dev
```

---

## 📡 Daftar Endpoint

Semua endpoint di bawah `GET`. Parameter dikirim via query string.
`total` saat ini: **22 endpoint** (dapat bertambah seiring plugin baru).

### Otakudesu — `/anime/otakudesu/*`

| Endpoint | Deskripsi | Param |
|---|---|---|
| `/anime/otakudesu/home` | Episode terbaru dari homepage | — |
| `/anime/otakudesu/ongoing` | Anime tayang (ongoing) | `page` (opsional) |
| `/anime/otakudesu/complete` | Anime selesai (complete) | `page` (opsional) |
| `/anime/otakudesu/genrelist` | Daftar semua genre | — |
| `/anime/otakudesu/genre` | Anime per genre | `slug` (wajib), `page` |
| `/anime/otakudesu/jadwal` | Jadwal rilis mingguan | — |
| `/anime/otakudesu/search` | Cari anime | `query` (wajib) |
| `/anime/otakudesu/detail` | Detail + daftar episode | `slug` (wajib) |
| `/anime/otakudesu/episode` | Episode lengkap (stream, download) | `slug` (wajib) |
| `/anime/otakudesu/batch` | Batch download | `slug` (wajib) |
| `/anime/otakudesu/watch` | Ringan: title + stream | `slug` (wajib) |

### Samehadaku — `/anime/samehadaku/*`

| Endpoint | Deskripsi | Param |
|---|---|---|
| `/anime/samehadaku/home` | Episode terbaru dari homepage | `page` (opsional) |
| `/anime/samehadaku/terbaru` | Anime terbaru | `page` (opsional) |
| `/anime/samehadaku/ongoing` | Sedang tayang | `page` (opsional) |
| `/anime/samehadaku/completed` | Selesai tayang | `page` (opsional) |
| `/anime/samehadaku/batch` | Katalog batch download | `page` (opsional) |
| `/anime/samehadaku/schedule` | Jadwal per hari | `day` (default `monday`) |
| `/anime/samehadaku/search` | Cari anime | `query` (wajib), `page` |
| `/anime/samehadaku/detail` | Detail + daftar episode | `slug` (wajib) |
| `/anime/samehadaku/episode` | Episode lengkap | `slug` (wajib, contoh `one-piece-episode-1`) |
| `/anime/samehadaku/genre` | Anime per genre | `slug` (wajib), `page` |
| `/anime/samehadaku/watch` | Ringan: title + stream | `slug` (wajib) |

> Catatan: `v2.samehadaku.how` dilindungi Cloudflare — sebagian path (mis. `/`, `/search`)
> bisa sesekali mengembalikan `403`. Endpoint lain umumnya stabil.

---

## 🧪 Cara Pakai API

Format respons konsisten:

```json
{
  "status": true,
  "creator": "Veruu | Community VeruProject",
  "result": { "creator": "rynaqrtz", "page": "search", "url": "...", "data": { "query": "naruto", "items": [] } }
}
```

### cURL

```bash
# Katalog
curl https://your-api.com/api/endpoints

# Panggil dengan parameter
curl -G "https://your-api.com/anime/otakudesu/search" \
  --data-urlencode "query=naruto"
```

### Node.js

```js
const data = await fetch(
  "https://your-api.com/anime/otakudesu/search?query=" + encodeURIComponent("naruto")
).then((r) => r.json());
if (data.status) console.log(data.result.data.items);
```

### Python

```python
import requests
data = requests.get(
    "https://your-api.com/anime/otakudesu/search",
    params={"query": "naruto"},
).json()
print(data["status"], data["result"]["data"]["items"])
```

### PHP

```php
$data = json_decode(file_get_contents(
    "https://your-api.com/anime/otakudesu/search?query=" . urlencode("naruto")
), true);
echo $data["status"] ? json_encode($data["result"]) : $data["message"];
```

### Go

```go
resp, _ := http.Get("https://your-api.com/anime/otakudesu/search?query=" + url.QueryEscape("naruto"))
defer resp.Body.Close()
body, _ := io.ReadAll(resp.Body)
fmt.Println(string(body))
```

---

## ➕ Menambah Endpoint Baru

1. Buat file baru di `src/plugins/<kategori>/<nama>.js` (atau tambah di file yang sudah ada).
2. Olahnya **satu plugin per endpoint**, atau **array** bila ingin banyak endpoint dalam satu file:

```js
// src/plugins/anime/kusonime.js
const handler = (title) => ({ judul: title });

export default [
  {
    name: "Kusonime — Karakter",
    category: "anime",
    path: "/anime/kusonime/karakter",
    method: ["GET"],
    description: "Cari karakter anime.",
    params: { nama: { type: "string", required: true, description: "Nama karakter" } },
    cache: 60,
    execute: async ({ query }) => handler(query.nama)
  },
  {
    name: "Kusonime — Jadwal",
    category: "anime",
    path: "/anime/kusonime/jadwal",
    method: ["GET"],
    description: "Jadwal rilis.",
    params: {},
    cache: 300,
    execute: async () => ({ list: [] })
  }
];
```

Aturan penting:

| Aturan | Keterangan |
|---|---|
| `path` | Wajib unik. Segmen ke-2 setelah kategori = **provider** → otomatis jadi judul grup di UI. |
| `execute({ query, body })` | Wajib; balikkan `result` apa pun (JSON) atau throw `Error`. |
| `method` | `GET` / `POST`. |
| `params` | Validasi otomatis; `type` didukung: `string`, `number`, `boolean`. |
| `cache` (detik) | Respons hasil di-cache di memori. Kosongkan untuk tanpa cache. |
| `timeout` (ms) | Default `60000`. |

Behavior:

- **Lokal** (`npm run dev`) → watcher memuat ulang file berubah otomatis.
- **Vercel** → daftar endpoint/`/api/endpoints` memuat ulang per request (engine `resolveSingleRouteOnDemand`).
- **Cloudflare Workers** → tambahkan ke daftar registrasi di `worker.js` agar ikut ter-bundle:

```js
import kusonime from "./src/plugins/anime/kusonime.js";
for (const plugin of kusonime) registerPlugin(plugin, plugin.path);
```

- **UI** → endpoint baru otomatis muncul di daftar dengan judul grup = provider (mis. "Kusonime"), dengan jarak antar-grup 64px.

---

## 🚧 Deploy

### Vercel

```bash
npm i -g vercel
vercel --prod
# atau
npm run deploy:vercel
```

Konfigurasi sudah ada: `vercel.json` + `api/index.js`.

### Cloudflare Workers

```bash
npm i -g wrangler
npx wrangler login
npm run deploy:cf   # = wrangler deploy
```

Konfigurasi: `worker.js` + `wrangler.jsonc`. Asset UI disajikan otomatis dari folder `public/`.

> `workerd` (runtime wrangler) belum mendukung Android — jalankan deploy dari PC/VPS/CI.

---

## 📁 Struktur Folder

```
├── api/index.js          # Entry Vercel
├── public/index.html     # Landing page + UI tester (single file)
├── src/
│   ├── app.js            # Server Express (lokal & Vercel)
│   ├── function.js       # Engine plugin, cache, validasi
│   ├── watcher.js        # Hot-reload plugin saat develop
│   └── plugins/
│       └── anime/
│           ├── otakudesu.js   # 11 endpoint
│           └── samehadaku.js  # 11 endpoint
├── worker.js             # Entry Cloudflare Workers
├── wrangler.jsonc        # Konfigurasi Workers
├── vercel.json           # Konfigurasi Vercel
└── index.js              # Entry lokal (npm start)
```

---

## 🪪 Lisensi & Pemilik

Dibuat dengan 🖤 oleh **VeruProject** — `creator` di setiap respons: `Veruu | Community VeruProject`.

API internet ketiga (Otakudesu, Samehadaku) milik pemiliknya masing-masing. Gunakan secara bijak.