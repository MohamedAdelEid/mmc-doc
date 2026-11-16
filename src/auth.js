const bcrypt = require('bcryptjs');

const CODE_RE = /^[a-zA-Z0-9_-]{3,64}$/;

function normalizeCode(code) {
  return String(code || '').trim().toLowerCase();
}

function isValidCode(code) {
  return CODE_RE.test(code);
}

async function hashPassword(password) {
  return bcrypt.hash(String(password), 10);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(String(password), hash);
}

function createKeyOk(createKey) {
  const expected = process.env.MMC_CREATE_KEY || '';
  return Boolean(expected) && String(createKey || '') === expected;
}

module.exports = {
  normalizeCode,
  isValidCode,
  hashPassword,
  verifyPassword,
  createKeyOk,
};
// DB_HOST=srv2121.hstgr.io
// DB_PORT=3306
// DB_NAME=u932811814_chat
// DB_USER=u932811814_chat
// DB_PASS="AdelSaad140150##"

// MMC_CREATE_KEY=mmc-create-2026
// MMC_DATA_KEY=mmc-doc-data-key-change-me-now
// PORT=3847
