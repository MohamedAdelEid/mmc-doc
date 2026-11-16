const crypto = require('crypto');

const PREFIX = 'enc:v1:';

function requireDataKey() {
  const raw = process.env.MMC_DATA_KEY;
  if (!raw || String(raw).length < 16) {
    throw new Error('MMC_DATA_KEY missing or too short');
  }
  return crypto.createHash('sha256').update(String(raw)).digest();
}

function codeLookupHash(code) {
  return crypto
    .createHmac('sha256', requireDataKey())
    .update(String(code))
    .digest('hex');
}

function encryptText(plain) {
  const key = requireDataKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plain), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function decryptText(value) {
  const raw = String(value || '');
  if (!raw.startsWith(PREFIX)) return raw;

  const key = requireDataKey();
  const buf = Buffer.from(raw.slice(PREFIX.length), 'base64url');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function decryptMessage(row) {
  return {
    id: row.id,
    client_id: row.client_id || null,
    sender_name: decryptText(row.sender_name),
    body: decryptText(row.body),
    created_at: row.created_at,
  };
}

module.exports = {
  codeLookupHash,
  encryptText,
  decryptText,
  decryptMessage,
};
