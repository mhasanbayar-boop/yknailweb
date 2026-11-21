const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// YÖNETİCİ ŞİFRESİ (İstediğiniz gibi değiştirin)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yk2026';
const MAX_STAMPS = 3; // 3 işlem dolduğunda 4. tırnak hediye

// Veritabanı klasörü ve dosyası
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ customers: {} }, null, 2), 'utf8');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Yardımcı fonksiyonlar
function readDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Telefon numarasını standart 10 haneli (5XXXXXXXXX) formata çevirir
function normalizePhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('90') && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
  return digits;
}

// Admin Yetki Kontrolü
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-password'];
  if (token !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Yetkisiz erişim. Şifre hatalı.' });
  }
  next();
}

// --- MÜŞTERİ API ---

// Müşteri kendi telefon numarasıyla kartını sorgular
app.get('/api/customer/:phone', (req, res) => {
  const phone = normalizePhone(req.params.phone);
  if (phone.length < 10) {
    return res.status(400).json({ error: 'Lütfen geçerli bir telefon numarası girin.' });
  }

  const db = readDB();
  const customer = db.customers[phone];

  if (!customer) {
    return res.status(404).json({ error: 'Bu numaraya ait sadakat kartı bulunamadı.' });
  }

  res.json({
    ...customer,
    maxStamps: MAX_STAMPS
  });
});

// --- YÖNETİM PANELİ API ---

// Admin Giriş Doğrulama
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    return res.json({ success: true });
  }
  res.status(401).json({ error: 'Hatalı yönetici şifresi.' });
});

// Tüm Müşterileri Getir
app.get('/api/admin/customers', requireAdmin, (req, res) => {
  const db = readDB();
  const list = Object.values(db.customers).sort(
    (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
  );
  res.json({ customers: list, maxStamps: MAX_STAMPS });
});

// Damga Vur (Müşteri yoksa otomatik oluşturur)
app.post('/api/admin/stamp', requireAdmin, (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const name = (req.body.name || '').trim();

  if (phone.length < 10) {
    return res.status(400).json({ error: 'Geçerli bir 10 haneli telefon numarası girin.' });
  }

  const db = readDB();
  const now = new Date().toISOString();

  if (!db.customers[phone]) {
    db.customers[phone] = {
      phone,
      name: name || 'Değerli Müşterimiz',
      stamps: 1,
      totalRewards: 0,
      createdAt: now,
      updatedAt: now
    };
  } else {
    if (name) db.customers[phone].name = name;
    if (db.customers[phone].stamps < MAX_STAMPS) {
      db.customers[phone].stamps += 1;
    }
    db.customers[phone].updatedAt = now;
  }

  writeDB(db);
  res.json({ customer: db.customers[phone], maxStamps: MAX_STAMPS });
});

// Damga Geri Al (-1)
app.post('/api/admin/unstamp', requireAdmin, (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const db = readDB();

  if (!db.customers[phone]) {
    return res.status(404).json({ error: 'Müşteri bulunamadı.' });
  }

  if (db.customers[phone].stamps > 0) {
    db.customers[phone].stamps -= 1;
    db.customers[phone].updatedAt = new Date().toISOString();
    writeDB(db);
  }

  res.json({ customer: db.customers[phone], maxStamps: MAX_STAMPS });
});

// Ödülü Kullan ve Kartı Sıfırla
app.post('/api/admin/redeem', requireAdmin, (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const db = readDB();

  if (!db.customers[phone]) {
    return res.status(404).json({ error: 'Müşteri bulunamadı.' });
  }

  if (db.customers[phone].stamps < MAX_STAMPS) {
    return res.status(400).json({ error: 'Kart henüz dolmamış.' });
  }

  db.customers[phone].stamps = 0;
  db.customers[phone].totalRewards = (db.customers[phone].totalRewards || 0) + 1;
  db.customers[phone].updatedAt = new Date().toISOString();
  writeDB(db);

  res.json({ customer: db.customers[phone], maxStamps: MAX_STAMPS });
});

// Yönetim paneli yönlendirmesi
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`✨ YK Nail Studio Sadakat Sistemi çalışıyor:`);
  console.log(`   Müşteri Ekranı : http://localhost:${PORT}`);
  console.log(`   Yönetim Paneli : http://localhost:${PORT}/admin`);
});