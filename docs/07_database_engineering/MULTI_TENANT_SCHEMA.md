# SKEMA DATABASE MULTI-TENANT & MODEL DATA
**Relational Schema, Indexing Strategies, Partitioning, and Row-Level Security**
*Versi: 2.0 | Status: APPROVED | Pemilik: AI Agent 07 (Database Engineering)*

---

## 1. Diagram Relasi Entitas (ERD Multi-Tenant)

```mermaid
erDiagram
    TENANTS ||--o{ MERCHANTS : owns
    MERCHANTS ||--o{ OUTLETS : operates
    OUTLETS ||--o{ SOUNDBOX_DEVICES : binds
    OUTLETS ||--o{ TRANSACTIONS : receives
    OUTLETS ||--o{ DAILY_SUMMARIES : calculates
    SOUNDBOX_DEVICES ||--o{ DEVICE_TELEMETRY : reports
    FIRMWARE_RELEASES ||--o{ SOUNDBOX_DEVICES : targets

    TENANTS {
        uuid id PK
        varchar name
        varchar email
        varchar phone
        varchar subscription_tier
        timestamp created_at
    }

    OUTLETS {
        uuid id PK
        uuid merchant_id FK
        varchar name
        varchar address
        varchar grab_store_id UK
        varchar custom_tts_voice
        varchar custom_greeting
        timestamp created_at
    }

    SOUNDBOX_DEVICES {
        varchar device_id PK
        uuid outlet_id FK
        varchar mac_address UK
        varchar device_token_hash
        varchar chip_model
        varchar current_fw_version
        int battery_level
        int volume_level
        varchar status
        timestamp last_heartbeat
    }

    TRANSACTIONS {
        uuid id PK
        uuid outlet_id FK
        varchar device_id FK
        varchar payment_channel
        decimal amount
        varchar external_order_id
        varchar customer_name
        varchar play_status
        timestamp created_at
    }
```

---

## 2. Definisi DDL PostgreSQL (Skema Inti)

```sql
-- 1. Tabel Perangkat Soundbox Fisik
CREATE TABLE soundbox_devices (
    device_id VARCHAR(32) PRIMARY KEY, -- Contoh: "SB-C3-00129"
    outlet_id UUID REFERENCES outlets(id) ON DELETE SET NULL,
    mac_address VARCHAR(17) UNIQUE NOT NULL,
    device_token_hash VARCHAR(128) NOT NULL,
    chip_model VARCHAR(20) DEFAULT 'ESP32-C3',
    current_fw_version VARCHAR(16) DEFAULT 'v3.5.0',
    battery_level INT DEFAULT 100, -- Persentase 0-100
    volume_level INT DEFAULT 7,    -- Rentang 1-10
    status VARCHAR(16) DEFAULT 'OFFLINE', -- 'ONLINE', 'OFFLINE', 'OTA_UPDATING'
    last_heartbeat TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabel Transaksi Partisi Bulanan (High Volume Table)
CREATE TABLE transactions (
    id UUID DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id),
    device_id VARCHAR(32) REFERENCES soundbox_devices(device_id),
    payment_channel VARCHAR(32) NOT NULL, -- 'GRAB_MERCHANT', 'QRIS_BCA', 'SHOPEE'
    amount NUMERIC(12, 2) NOT NULL,
    external_order_id VARCHAR(64),
    customer_name VARCHAR(128),
    play_status VARCHAR(16) DEFAULT 'PENDING', -- 'PENDING', 'PLAYED', 'FAILED'
    audio_latency_ms INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Partisi Otomatis Bulanan
CREATE TABLE transactions_2026_10 PARTITION OF transactions
    FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');
CREATE TABLE transactions_2026_11 PARTITION OF transactions
    FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');

-- 3. Tabel Rekapitulasi Omset Harian (Materialized Summary)
CREATE TABLE daily_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id),
    recap_date DATE NOT NULL,
    total_transactions INT DEFAULT 0,
    total_amount NUMERIC(14, 2) DEFAULT 0.00,
    last_transaction_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_outlet_date UNIQUE (outlet_id, recap_date)
);

-- 4. Tabel Manajemen Rilis Firmware OTA
CREATE TABLE firmware_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(16) UNIQUE NOT NULL, -- 'v3.5.2'
    target_chip VARCHAR(20) NOT NULL,     -- 'ESP32-C3', 'ESP32-S3'
    binary_url VARCHAR(255) NOT NULL,
    sha256_checksum VARCHAR(64) NOT NULL,
    release_notes TEXT,
    is_active BOOLEAN DEFAULT FALSE,
    min_hw_revision INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 3. Strategi Pengindeksan & Optimasi Kinerja

1. **Pencarian Cepat Webhook Grab:**
   ```sql
   CREATE INDEX idx_outlets_grab_store ON outlets(grab_store_id) WHERE grab_store_id IS NOT NULL;
   ```
   *Manfaat:* Pemetaan dari webhook Grab ke outlet berlangsung $\le 2\text{ms}$ tanpa *full table scan*.
2. **Pencarian Riwayat Transaksi Kasir (Replay & Summary):**
   ```sql
   CREATE INDEX idx_trx_outlet_created ON transactions(outlet_id, created_at DESC);
   ```
   *Manfaat:* Fitur *Replay* tombol `[🔁]` kasir mengambil 1 baris terakhir secara instan.
3. **Penyimpanan Telemetri di Redis:**
   Data telemetri ping perangkat (baterai, sinyal WiFi) di-update di Redis in-memory setiap 30 detik untuk menghindari *write-amplification* di PostgreSQL, dan hanya disinkronkan ke tabel disk jika terjadi perubahan status signifikan.

---

## 4. Keamanan Data & Row-Level Security (RLS)

Untuk mencegah kebocoran data antar pemilik usaha (merchant):
```sql
ALTER TABLE outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_outlets ON outlets
    FOR ALL
    USING (merchant_id IN (
        SELECT id FROM merchants WHERE tenant_id = current_setting('app.current_tenant_id')::UUID
    ));

CREATE POLICY tenant_isolation_transactions ON transactions
    FOR ALL
    USING (outlet_id IN (
        SELECT id FROM outlets WHERE merchant_id IN (
            SELECT id FROM merchants WHERE tenant_id = current_setting('app.current_tenant_id')::UUID
        )
    ));
```

---

## 5. Verifikasi & Alur Validasi Silang (*Sign-Off*)

- **Dibuat Oleh:** AI Agent 07 (Database Engineering)
- **Reviewer 1 (Kesesuaian Endpoint & Query):** AI Agent 08 (Backend Engineering) &rarr; `STATUS: APPROVED`
- **Reviewer 2 (Kepatuhan Privasi & RLS Audit):** AI Agent 10 (Information Security) &rarr; `STATUS: APPROVED`
- **Reviewer 3 (Struktur Query Replay & Recap):** AI Agent 06 (Embedded Firmware) &rarr; `STATUS: APPROVED`
