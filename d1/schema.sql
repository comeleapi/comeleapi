-- ============================================================
-- comeleapi — Schema Cloudflare D1 (SQLite)
-- Applicare con:
--   npm run db:schema         (D1 locale, wrangler dev)
--   npm run db:schema:remote  (D1 di produzione)
-- Convenzioni: BOOLEAN → INTEGER 0/1, TIMESTAMPTZ → TEXT ISO 8601.
-- ============================================================

-- Tabella prodotti (oli essenziali)
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_desc TEXT NOT NULL DEFAULT '',
  benefits TEXT NOT NULL DEFAULT '',
  price TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  visible INTEGER NOT NULL DEFAULT 1,
  "order" INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Tabella lead (richieste dal form contatto)
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  day TEXT NOT NULL DEFAULT '',
  slot TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'archived')),
  read INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'form-frontend',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Tabella utenti admin
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'admin',
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Tabella sottoscrizioni push
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Sessioni gestionale (al posto della Map in memoria di server.js)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  csrf_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

-- Rate limiting login/contact (contatore per chiave IP+scope, pulizia lazy)
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  first_at INTEGER NOT NULL,
  locked_until INTEGER NOT NULL DEFAULT 0
);

-- Immagini caricate dal gestionale (BLOB in D1, servite su /uploads/:id)
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  bytes BLOB NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

-- Indici
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_order ON products ("order" ASC);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
