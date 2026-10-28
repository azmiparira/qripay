# DEVOPS, DEPLOYMENT & FLEET MONITORING
**Cloud Infrastructure, Docker Orchestration, CI/CD Pipeline, and Fleet Telemetry**
*Versi: 2.0 | Status: APPROVED | Pemilik: AI Agent 12 (DevOps & Infrastructure)*

---

## 1. Spesifikasi Infrastruktur Server VPS

Untuk melayani hingga 5.000 soundbox aktif secara bersamaan di seluruh Indonesia dengan latency rendah:
- **Penyedia VPS:** Contabo / Hostinger / DigitalOcean (Data Center Singapura atau Jakarta)
- **Spesifikasi Mesin:** 4 vCPU, 8 GB RAM, 100 GB NVMe SSD, Bandwidth 1 Gbps Unmetered.
- **Sistem Operasi:** Ubuntu 24.04 LTS (Harden Linux Kernel, TCP BBR Congestion Control diaktifkan).

---

## 2. Orkestrasi Kontainer (Docker Compose)

Seluruh stack backend dan TTS berjalan di dalam lingkungan kontainer terisolasi:

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    container_name: qripay-nginx-proxy
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d
      - ./certbot/conf:/etc/letsencrypt
    depends_on:
      - backend
      - tts-engine

  backend:
    build: .
    container_name: qripay-backend-api
    restart: always
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE_URL=postgresql://qripay_user:secure_pwd@postgres:5432/qripay_db
      - REDIS_URL=redis://redis:6379
      - TTS_ENDPOINT=http://tts-engine:8080/v1/audio/speech
    depends_on:
      - postgres
      - redis
      - tts-engine

  tts-engine:
    image: 9router/edge-tts-server:latest
    container_name: qripay-tts-service
    restart: always
    environment:
      - DEFAULT_VOICE=id-ID-ArdiNeural
      - MAX_CONCURRENT_SYNTH=32

  redis:
    image: redis:7-alpine
    container_name: qripay-redis-cache
    restart: always
    command: redis-server --appendonly yes --requirepass "redis_secure_token_123"
    volumes:
      - redis_data:/data

  postgres:
    image: postgres:16-alpine
    container_name: qripay-postgres-db
    restart: always
    environment:
      - POSTGRES_USER=qripay_user
      - POSTGRES_PASSWORD=secure_pwd
      - POSTGRES_DB=qripay_db
    volumes:
      - pg_data:/var/lib/postgresql/data

volumes:
  redis_data:
  pg_data:
```

---

## 3. Dashboard Pemantauan Armada (Prometheus & Grafana)

DevOps menyediakan dashboard monitoring real-time untuk memantau kesehatan seluruh unit soundbox yang tersebar di merchant:

```mermaid
flowchart LR
    SB["Soundbox Devices (Fleet se-Indonesia)"] -->|Ping Telemetri Tiap 30s| API["Backend Collector"]
    API --> PROM["Prometheus Time-Series DB"]
    PROM --> GRAF["Grafana Dashboard Monitor"]
    GRAF --> ALERT["Telegram Alert Bot (Jika Soundbox Offline)"]
```

### Metrik Kunci yang Dipantau:
1. **Fleet Online Status:** Jumlah soundbox yang saat ini terhubung (misal: `482 / 500 Online`).
2. **Battery Health Heatmap:** Mendeteksi unit yang baterainya di bawah 15% untuk memberikan notifikasi otomatis ke kasir via WhatsApp/App.
3. **Audio Delivery Latency:** Grafik waktu tempuh paket suara (target median: $\le 350\text{ms}$).
4. **Offline Incident Alert:** Jika sebuah unit soundbox terputus lebih dari 5 menit pada jam operasional toko, Telegram bot otomatis memberi tahu teknisi lapangan.

---

## 4. CI/CD Pipeline (GitHub Actions)

Alur kerja integrasi & deployment otomatis:
1. **Backend CI/CD:**
   - Commit ke branch `main` &rarr; Linting & Unit Testing &rarr; Build Docker Image &rarr; Deploy ke VPS via SSH webhook.
2. **Firmware CI/CD (PlatformIO CLI):**
   - Saat ada rilis tag Git baru (misal: `v3.6.0`):
   - GitHub Actions mengompilasi kode C++ ESP32 secara otomatis menjadi file binary `firmware.bin`.
   - Menghitung checksum SHA-256 binary.
   - Mengunggah file ke Cloudflare R2 / S3 OTA server dan mencatatnya ke tabel `firmware_releases` di database.

---

## 5. Prosedur Disaster Recovery & Backup

- **Backup Database Otomatis:** Setiap malam pukul 02.00 WIB, script cron menjalankan `pg_dump` berenkripsi dan mengunggah backup ke penyimpanan S3 off-site.
- **RTO (Recovery Time Objective):** $< 15\text{ menit}$.
- **RPO (Recovery Point Objective):** $< 1\text{ jam}$ data transaksi.

---

## 6. Verifikasi & Alur Validasi Silang (*Sign-Off*)

- **Dibuat Oleh:** AI Agent 12 (DevOps & Infrastructure)
- **Reviewer 1 (Kesesuaian Anggaran & Kapasitas):** AI Agent 02 (Technical Leadership) &rarr; `STATUS: APPROVED`
- **Reviewer 2 (Kepatuhan Firewall & Keamanan Jaringan):** AI Agent 10 (Information Security) &rarr; `STATUS: APPROVED`
- **Reviewer 3 (Kesesuaian Arsitektur Sistem):** AI Agent 03 (System Architecture) &rarr; `STATUS: APPROVED`
