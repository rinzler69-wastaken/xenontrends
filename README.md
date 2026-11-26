# Argon Terminal — Unified Deployment Structure

Direktori ini (`GOLIVE`) siap di-deploy secara online atau dijalankan secara terpadu di server lokal.

## Struktur Direktori

```
GOLIVE/
├── index.html            # Landing page gerbang utama (Argon Terminal Portal)
├── launcher.sh           # Script peluncur satu pintu untuk pengujian lokal
├── confluence/           # Dasbor Confluence Engine v2.4 (Sanitized & Rebranded)
│   ├── index.html
│   ├── css/
│   ├── js/
│   └── ...
└── quantum/              # Screener Kuantitatif 65 Engine (Crypto Scan Quantum v3.1)
    ├── index.html
    ├── engines.js
    ├── app.js
    ├── style.css
    └── ...
```

## Sanitasi Nama & Rebranding

Sesuai instruksi Mas Felix:
- Semua teks atau nama `IndoCukong`, `DASBOR CUKONG`, dan `Cukong` telah **dibersihkan secara menyeluruh** dari seluruh file di dalam `confluence/` (`.js`, `.html`, `.css`, `.md`, generator konten otomatis, stempel nama unduhan file).
- Rebranded menjadi **Argon Terminal / Confluence Engine (ArgonPulse⚡)**.

## Opsi Hosting / Go Live

Folder ini statis murni dengan ES Modules, sehingga sangat mudah dan gratis di-online-kan ke:
1. **Cloudflare Pages:** Tinggal hubungkan repo Git atau drag-and-drop folder `GOLIVE`.
2. **Vercel:** `npx vercel` di dalam folder `GOLIVE`.
3. **GitHub Pages / Netlify / VPS Nginx**.
