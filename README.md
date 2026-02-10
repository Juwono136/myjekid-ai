# MyJekID — Admin Dashboard & Sistem Chatbot Berbasis AI

![Status Proyek](https://img.shields.io/badge/Status-Production%20Ready-success)
![Node.js](https://img.shields.io/badge/Node.js-v20-green)
![Docker](https://img.shields.io/badge/Docker-Enabled-blue)
![Lisensi](https://img.shields.io/badge/Lisensi-Private-red)

**MyJekID** adalah sistem aplikasi untuk manajemen layanan kurir dan jasa pesan-antar yang beroperasi di wilayah **Pulau Sumbawa, Nusa Tenggara Barat**. Aplikasi ini menyediakan **Admin Dashboard** untuk pemantauan real-time, manajemen kurir, monitoring order, serta **AI Chatbot** (didukung Gemini/OpenAI/Ollama/LM Studio) yang menangani pelanggan dan kurir via **WhatsApp** secara otomatis.

---

## Daftar Isi

- [Fitur Utama](#fitur-utama)
- [Tech Stack](#tech-stack)
- [Struktur Proyek](#struktur-proyek)
- [Prasyarat](#prasyarat)
- [Cara Setup](#cara-setup)
- [Variabel Lingkungan](#variabel-lingkungan)
- [API & Webhook](#api--webhook)
- [Deployment](#deployment)
- [Role & Akses](#role--akses)
- [Integrasi Eksternal](#integrasi-eksternal)
- [Lisensi & Kontak](#lisensi--kontak)

---

## Fitur Utama

### AI Chatbot Real-time
- Layanan pelanggan dan kurir otomatis via **WhatsApp** (melalui WAHA).
- Dukungan multi-provider AI: **Gemini**, **OpenAI**, **Ollama**, **LM Studio**.
- Integrasi dengan **n8n** untuk alur otomatisasi (workflow).
- Mode intervensi: admin dapat mengambil alih chat dari bot dan mengobrol langsung dengan pengguna.

### Admin Dashboard (Web App)
- **Dashboard Overview** — Monitoring order, distribusi order, transaksi, dan quick access ke:
  - n8n workflow  
  - WAHA Dashboard  
  - Storage (MinIO)  
  - Chatbot  
- **Manajemen Order** — Daftar order, detail, edit status, buat order oleh admin, bukti pengiriman, timeline, peta rute.
- **Mitra Kurir** — CRUD kurir (tambah, update, hapus).
- **Live Map** — Peta real-time untuk melacak lokasi kurir.
- **Intervention / Chat** — Daftar sesi chat aktif, riwayat percakapan, kirim pesan sebagai admin, toggle mode bot/manual.
- **Laporan** — Ringkasan transaksi, grafik revenue, export Excel.
- **Manajemen User** — CRUD admin (hanya SUPER_ADMIN).
- **Pengaturan** — Profil dan ubah password.
- **Notifikasi** — Notifikasi real-time (Socket.IO) di dashboard.

---

## Tech Stack

| Layer      | Teknologi |
|-----------|-----------|
| **Frontend** | React 19, Vite 7, Redux Toolkit, React Router 7, Tailwind CSS 4, DaisyUI, Leaflet, Recharts, Socket.IO Client |
| **Backend**  | Node.js, Express 5, Sequelize (PostgreSQL), Redis, Socket.IO, JWT, Winston |
| **AI**       | Google Generative AI (Gemini), OpenAI API, Ollama, LM Studio |
| **Storage**  | MinIO (S3-compatible) |
| **WhatsApp** | WAHA (WhatsApp HTTP API) |
| **Email**    | Nodemailer (SMTP) |
| **Deploy**   | Docker, Docker Compose, GitHub Actions (CI/CD) |

---

## Struktur Proyek

```
myjekid-app/
├── client/                 # Frontend (React + Vite)
│   ├── src/
│   │   ├── components/     # UI (dashboard, orders, couriers, intervention, reports, dll.)
│   │   ├── features/       # Redux slices
│   │   ├── layouts/        # MainLayout
│   │   ├── pages/          # Halaman (Dashboard, Orders, Map, Chat, Reports, Settings, dll.)
│   │   ├── services/       # API & socket client
│   │   └── store/          # Redux store
│   ├── Dockerfile
│   └── package.json
├── server/                 # Backend (Express)
│   ├── src/
│   │   ├── config/         # database, redis
│   │   ├── controllers/    # auth, admin, order, courier, intervention, report, webhook
│   │   ├── middleware/     # auth, role, error
│   │   ├── models/         # Sequelize (admin, courier, order, chatSession, notification, dll.)
│   │   ├── routes/         # apiRoutes, webhookRoutes
│   │   ├── services/       # AI (Gemini/OpenAI/Ollama/LMStudio), order, message, storage, email, flows
│   │   └── utils/          # logger, AppError, validators, emailTemplates
│   ├── app.js              # Entry + Socket.IO
│   ├── Dockerfile
│   └── package.json
├── .github/workflows/      # CI/CD (build & push Docker, deploy)
├── docker-compose.yml
├── package.json            # Root: scripts start, postinstall, build
└── README.md
```

---

## Prasyarat

- **Node.js** v20 (disarankan LTS)
- **npm** v9+
- **PostgreSQL** (untuk database)
- **Redis** (untuk session/cache, jika dipakai)
- **Docker & Docker Compose** (opsional, untuk deploy)
- Akses ke **WAHA** (WhatsApp HTTP API)
- **MinIO** atau S3-compatible storage (untuk file/bukti)
- Salah satu: **Gemini API Key**, **OpenAI API Key**, atau **Ollama/LM Studio** (untuk AI chatbot)

---

## Cara Setup

### 1. Clone & Install Dependensi

```bash
git clone <url-repo>
cd myjekid-app
npm install
```

Script `postinstall` akan menginstall dependensi di `client/` dan `server/`.

### 2. Environment (Backend)

Buat file `server/.env` (lihat [Variabel Lingkungan](#variabel-lingkungan)). Minimal yang wajib:

- `PORT`, `NODE_ENV`, `FRONTEND_URL`, `JWT_SECRET`
- `DATABASE_URL` (PostgreSQL)
- `WAHA_API_URL`, `WAHA_API_KEY`
- `AI_PROVIDER` + API key yang sesuai (mis. `GEMINI_API_KEY` atau `OPENAI_API_KEY`)
- Konfigurasi MinIO/S3 jika dipakai
- Redis jika dipakai

### 3. Database

Pastikan PostgreSQL berjalan dan `DATABASE_URL` benar. Sequelize akan membuat/migrate tabel saat aplikasi jalan (sesuai konfigurasi di project).

### 4. Menjalankan Development

**Semua (backend + frontend):**

```bash
npm start
```

- Backend: `http://localhost:5000` (atau nilai `PORT` di `.env`)
- Frontend (Vite): biasanya `http://localhost:5173`

**Terpisah:**

```bash
# Terminal 1 — Backend
cd server && npm run dev

# Terminal 2 — Frontend
cd client && npm run dev
```

### 5. Build Production (Frontend)

```bash
npm run build
```

Output build ada di `client/dist/`. Untuk production, serve folder ini (mis. lewat Nginx atau container).

---

## Variabel Lingkungan

Variabel berikut digunakan backend (dan bisa diset di `server/.env` atau environment deployment).

| Variabel | Deskripsi | Contoh |
|----------|-----------|--------|
| **Server** | | |
| `PORT` | Port server | `5000` |
| `NODE_ENV` | environment | `development` / `production` |
| `FRONTEND_URL` | URL frontend (untuk link di email/notifikasi) | `https://app.myjekid.com` |
| `JWT_SECRET` | Secret untuk JWT | string rahasia |
| **Database** | | |
| `DATABASE_URL` | Connection string PostgreSQL | `postgres://user:pass@host:5432/dbname` |
| **Redis** | | |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Koneksi Redis | |
| **Email (SMTP)** | | |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Konfigurasi SMTP | |
| **WAHA (WhatsApp)** | | |
| `WAHA_API_URL` | Base URL WAHA | `http://localhost:7575` |
| `WAHA_API_KEY` | API key WAHA | |
| **MinIO / S3** | | |
| `S3_ENDPOINT`, `S3_PORT`, `S3_USE_SSL` | Endpoint MinIO/S3 | |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET_NAME` | Credential & bucket | |
| `BASE_IMAGE_URL` | Base URL untuk akses file (mis. public URL MinIO) | |
| **AI** | | |
| `AI_PROVIDER` | Provider: `GEMINI`, `OPENAI`, `OLLAMA`, `LMSTUDIO` | `GEMINI` |
| `GEMINI_API_KEY` | API key Google Gemini | |
| `OPENAI_API_KEY` | API key OpenAI | |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | Untuk Ollama (local) | |
| `LMSTUDIO_BASE_URL`, `LMSTUDIO_MODEL`, `LMSTUDIO_API_KEY` | Untuk LM Studio (local) | |

---

## API & Webhook

### Base URL API
- Development: `http://localhost:5000/api`  
- (Production: sesuaikan dengan domain backend)

### Autentikasi
- **POST** `/api/auth/login` — Login (body: `email`, `password`). Mengembalikan token JWT.
- Route lain (kecuali webhook) membutuhkan header: `Authorization: Bearer <token>`.

### Endpoint Utama (Protected)

| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/api/auth/me` | Profil user saat ini |
| PATCH | `/api/auth/profile`, `/api/auth/password` | Update profil & password |
| GET | `/api/dashboard/stats`, `/api/dashboard/chart` | Statistik & chart dashboard |
| GET/PUT | `/api/orders`, `/api/orders/:id` | Daftar & detail order, update order |
| GET | `/api/orders/customers` | Daftar customer |
| POST | `/api/orders/by-admin` | Buat order oleh admin |
| GET | `/api/intervention/sessions` | Sesi chat aktif |
| GET | `/api/intervention/history/:phone` | Riwayat chat per nomor |
| POST | `/api/intervention/send`, `/api/intervention/toggle-mode` | Kirim pesan & toggle mode |
| GET/PATCH | `/api/notifications`, `/api/notifications/:id/read` | Notifikasi |
| GET | `/api/reports/summary`, `/api/reports/chart`, `/api/reports/transactions` | Laporan |
| GET | `/api/reports/export/excel` | Export Excel |
| GET/POST/PUT/DELETE | `/api/couriers`, `/api/couriers/:id` | CRUD kurir |
| GET/POST/PUT/DELETE | `/api/admins`, `/api/admins/:id` | CRUD admin (SUPER_ADMIN only) |

### Webhook (Tanpa JWT)

| Method | Path | Deskripsi |
|--------|------|-----------|
| POST | `/webhook/whatsapp` | Menerima pesan masuk dari WAHA |
| POST | `/webhook/admin/session` | Set session mode (dipanggil n8n / dashboard) |
| GET | `/webhook/health` | Health check layanan webhook |

---

## Deployment

### Docker Compose

- Backend: image `juwono136/myjek-api:latest`, port `5000`.
- Frontend: image `juwono136/myjek-frontend:latest`, port `8080`.
- Variabel environment di-set di `.env` di direktori yang sama dengan `docker-compose.yml` (lihat [Variabel Lingkungan](#variabel-lingkungan)).

Jalankan:

```bash
# Pastikan network "tunnel" sudah ada (atau sesuaikan nama di compose)
docker network create tunnel
docker compose up -d
```

### CI/CD (GitHub Actions)

- **Trigger:** Push/PR ke branch `master` (kecuali perubahan hanya di `README.md`).
- **CI:** Build image Docker untuk `server` dan `client`, push ke Docker Hub (`myjek-api`, `myjek-frontend`).
- **CD:** Di runner self-hosted, pull image terbaru, `docker compose down` lalu `docker compose up -d`, dan menghubungkan container ke network `tunnel`.

Secrets yang diperlukan di GitHub: `DOCKER_USERNAME`, `DOCKER_PASSWORD`, serta semua variabel environment yang dipakai (PORT, DATABASE_URL, JWT_SECRET, WAHA_*, S3_*, REDIS_*, AI_*, dll.) dan `TUNNEL_NAME` untuk network.

---

## Role & Akses

| Role | Deskripsi | Akses Khusus |
|------|-----------|--------------|
| `SUPER_ADMIN` | Administrator penuh | User Management (CRUD admin), akses penuh order & kurir |
| `CS` | Customer Service | Update order, buat order oleh admin, update kurir |
| Role lain | Sesuai definisi di `roleMiddleware` | Dibatasi per route (lihat `restrictTo` di `apiRoutes.js`) |

Route yang memakai `restrictTo` hanya bisa diakses oleh role yang disebutkan.

---

## Integrasi Eksternal

- **WAHA** — WhatsApp HTTP API untuk kirim/terima pesan; backend menerima webhook di `/webhook/whatsapp`.
- **n8n** — Workflow automation; dapat memanggil `/webhook/admin/session` dan endpoint lain sesuai kebutuhan.
- **MinIO/S3** — Penyimpanan file (bukti, gambar); akses via `BASE_IMAGE_URL` + bucket.
- **Redis** — Session/cache (jika dikonfigurasi).
- **AI** — Satu provider aktif sesuai `AI_PROVIDER`; factory di backend memilih adapter (Gemini, OpenAI, Ollama, LM Studio).

---

## Lisensi & Kontak

- **Lisensi:** Private.  
- **Repository:** [myjekid-ai](https://github.com/Juwono136/myjekid-ai)  
- **Issues:** [GitHub Issues](https://github.com/Juwono136/myjekid-ai/issues)

Untuk pertanyaan atau dukungan, buka issue di repository di atas.
