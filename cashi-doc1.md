# Developer API Doc | Cashi.id

# API Documentation

Integrasikan pembayaran dengan mudah dan cepat

### API Key Diperlukan

Semua request harus menyertakan API Key di header:

`x-api-key: YOUR_API_KEY`

Dapatkan API Key di Dashboard → Settings → API Keys

cURL / PostmanGanti YOUR\_API\_KEY dengan API Key Anda

```
curl -X POST https://cashi.id/api/create-order \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
  "amount": 50000,
  "order_id": "TRX123",
  "kode_channel": "QRIS_CUSTOM"
}'
```

## Contoh Request

EndpointBodyContoh Request

POST`https://cashi.id/api/create-order`

Parameter

Contoh

Tipe

Wajib

Keterangan

amount

50000

Number

Ya

Nominal pembayaran (min 2.000, max 10.000.000)

order\_id

TRX123

String

Tidak

ID unik dari sistem Anda (wajib unik!)

kode\_channel

BCA

String

Tidak

Pilih metode pembayaran (lihat tab di bawah)

QRIS UtamaQRIS CustomVirtual AccountRetail

```
{
  "amount": 50000,
  "order_id": "TRX123",
  "kode_channel": "QRIS_CUSTOM"
}
```

Kode channel dapat ditemukan di Metode Pembayaran pada dashboard merchant.

## Response

Berikut response API sesuai dengan kategori pembayarannya

QRISVirtual AkunRetail

```
{
    "success": true,
    "orderId": "TRX12345",
    "amount": 50000,
    "checkout_url": "https://cashi.id/pay/TRX12345",
    "qrUrl": "data:image/png; ......",
    "expires_at": "0",
    "provider": "CASHI",
    "fee": 0.7
}
```

### Webhooks

#### WAJIB: Verifikasi Signature

JANGAN memproses webhook tanpa verifikasi signature.  
Risiko keamanan jika tidak diverifikasi:

-   Attacker dapat mengirim request webhook palsu
-   Penambahan saldo tanpa pembayaran yang sah
-   Webhook dapat di-replay (diproses berulang)
-   Potensi kerugian finansial bagi bisnis Anda

PHPNODEJS

NODEJS HANDLER

const crypto = require('crypto');

app.post('/webhook', (req, res) => {
  const signature = req.headers\['x-gateway-signature'\];
  
  if (!signature) {
    return res.status(401).send('Missing signature');
  }

  const payload = JSON.stringify(req.body);
  const expected = crypto
    .createHmac('sha256', 'YOUR\_SECRET\_KEY')
    .update(payload)
    .digest('hex');

  if (signature !== expected) {
    return res.status(401).send('Invalid signature');
  }

  const { event, data } = req.body;

  if (event === 'PAYMENT\_SETTLED') {
    if (data.order\_id?.startsWith('TEST-')) {
      return res.status(200).send('Test OK');
    }

    if (data.status === 'SETTLED') {
      // Update database: ubah status order jadi lunas
      // await db.query('UPDATE orders SET status = "paid" WHERE order\_id = ?', \[data.order\_id\]);
    }
    
    res.status(200).send('OK');
  } else {
    res.status(200).send('Event ignored');
  }
});

### Check Status

GET`https://cashi.id/api/check-status/:orderId`

{
  "success": true,
  "status": "SETTLED",
  "amount": 50078,
  "order\_id": "INV-123"
}

Butuh bantuan? Hubungi tim support kami di [support@cashi.id](mailto:support@cashi.id)