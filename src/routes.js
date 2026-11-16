const express = require('express');
const { pool } = require('./db');
const {
  normalizeCode,
  isValidCode,
  hashPassword,
  verifyPassword,
  createKeyOk,
} = require('./auth');
const {
  codeLookupHash,
  encryptText,
  decryptMessage,
} = require('./crypto');

const router = express.Router();

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

function unauthorized(res, error = 'unauthorized') {
  return res.status(401).json({ ok: false, error });
}

async function findRoomByCode(code) {
  const lookup = codeLookupHash(code);
  const [rows] = await pool.execute(
    'SELECT id, code, password_hash FROM rooms WHERE code = :code LIMIT 1',
    { code: lookup },
  );
  return rows[0] || null;
}

async function assertRoomAccess(code, password) {
  const normalized = normalizeCode(code);
  if (!isValidCode(normalized)) {
    return { error: 'invalid_code', status: 400 };
  }
  if (!password || String(password).length < 3) {
    return { error: 'invalid_password', status: 400 };
  }

  const room = await findRoomByCode(normalized);
  if (!room) {
    return { error: 'not_found', status: 404 };
  }

  const ok = await verifyPassword(password, room.password_hash);
  if (!ok) {
    return { error: 'unauthorized', status: 401 };
  }

  return { room, code: normalized };
}

router.post('/rooms', async (req, res) => {
  try {
    const { code, password, create_key: createKey } = req.body || {};

    if (!createKeyOk(createKey)) {
      return unauthorized(res, 'invalid_create_key');
    }

    const normalized = normalizeCode(code);
    if (!isValidCode(normalized)) {
      return badRequest(res, 'invalid_code');
    }
    if (!password || String(password).length < 3 || String(password).length > 128) {
      return badRequest(res, 'invalid_password');
    }

    const existing = await findRoomByCode(normalized);
    if (existing) {
      return res.status(409).json({ ok: false, error: 'code_taken' });
    }

    const passwordHash = await hashPassword(password);
    await pool.execute(
      'INSERT INTO rooms (code, password_hash) VALUES (:code, :password_hash)',
      { code: codeLookupHash(normalized), password_hash: passwordHash },
    );

    return res.status(201).json({ ok: true, code: normalized });
  } catch (err) {
    console.error('create room failed', err.message);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

router.post('/rooms/join', async (req, res) => {
  try {
    const { code, password } = req.body || {};
    const result = await assertRoomAccess(code, password);
    if (result.error) {
      return res.status(result.status).json({ ok: false, error: result.error });
    }
    return res.json({ ok: true, code: result.code });
  } catch (err) {
    console.error('join room failed', err.message);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

router.post('/messages/clear', async (req, res) => {
  try {
    const { code, password } = req.body || {};
    const result = await assertRoomAccess(code, password);
    if (result.error) {
      return res.status(result.status).json({ ok: false, error: result.error });
    }

    await pool.execute('DELETE FROM messages WHERE room_id = :room_id', {
      room_id: result.room.id,
    });

    return res.json({ ok: true, cleared: true, code: result.code });
  } catch (err) {
    console.error('clear messages failed', err.message);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

function normalizeClientId(value) {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64);
  if (cleaned.length >= 8) return cleaned;
  return null;
}

router.post('/messages', async (req, res) => {
  try {
    const {
      code,
      password,
      sender_name: senderName,
      body,
      client_id: clientIdRaw,
    } = req.body || {};
    const result = await assertRoomAccess(code, password);
    if (result.error) {
      return res.status(result.status).json({ ok: false, error: result.error });
    }

    const name = String(senderName || '').trim().slice(0, 64);
    const text = String(body || '').trim().slice(0, 2000);
    const clientId = normalizeClientId(clientIdRaw);
    if (!name) return badRequest(res, 'invalid_sender');
    if (!text) return badRequest(res, 'invalid_body');
    if (!clientId) return badRequest(res, 'invalid_client');

    const [insert] = await pool.execute(
      `INSERT INTO messages (room_id, client_id, sender_name, body)
       VALUES (:room_id, :client_id, :sender_name, :body)`,
      {
        room_id: result.room.id,
        client_id: clientId,
        sender_name: encryptText(name),
        body: encryptText(text),
      },
    );

    const [rows] = await pool.execute(
      `SELECT id, client_id, sender_name, body, created_at
       FROM messages WHERE id = :id LIMIT 1`,
      { id: insert.insertId },
    );

    return res.status(201).json({
      ok: true,
      message: decryptMessage(rows[0]),
    });
  } catch (err) {
    console.error('send message failed', err.message);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

router.get('/messages', async (req, res) => {
  try {
    const { code, password, after_id: afterId } = req.query || {};
    const result = await assertRoomAccess(code, password);
    if (result.error) {
      return res.status(result.status).json({ ok: false, error: result.error });
    }

    const after = Number(afterId || 0);
    const [rows] = await pool.execute(
      `SELECT id, client_id, sender_name, body, created_at
       FROM messages
       WHERE room_id = :room_id AND id > :after_id
       ORDER BY id ASC
       LIMIT 200`,
      { room_id: result.room.id, after_id: Number.isFinite(after) ? after : 0 },
    );

    return res.json({
      ok: true,
      messages: rows.map(decryptMessage),
    });
  } catch (err) {
    console.error('list messages failed', err.message);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

module.exports = router;
