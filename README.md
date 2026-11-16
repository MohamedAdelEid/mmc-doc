# MMC Doc

Lightweight documentation utility surface with a Node API backed by MySQL.

## Setup

1. In Hostinger phpMyAdmin, run [`sql/schema.sql`](sql/schema.sql).
2. Enable **Remote MySQL** and allow your machine IP (and later your Node host IP).
3. Copy env file and fill secrets:

```bash
cp .env.example .env
```

Required values:

- `DB_HOST` — `srv2121.hstgr.io` for remote access
- `DB_NAME` / `DB_USER` / `DB_PASS` (quote the password if it contains `#`)
- `MMC_CREATE_KEY` — shared key required to create rooms
- `MMC_DATA_KEY` — used to encrypt message text / names and blind room codes in DB
- `PORT` — default `3847`

4. Install and run:

```bash
npm install
npm start
```

Open `http://localhost:3847`.

## Hidden entry

Ways to open the gate:

- Desktop: type `mmcdoc` on the landing page (not inside an input)
- Phone: **long-press** the title **MMC Doc** (~1 second)
- Phone alt: tap revision `0.4.2` **7 times** quickly

Then:

- **Open** — join with display name, reference id, and access phrase
- **New** — create a room (also needs `MMC_CREATE_KEY`)
- **Clear chat** — deletes messages only; room stays

Tap/click the dark area outside the modal to close the gate or leave the session.

Share the live site URL + reference id + access phrase. On phone they open the URL → long-press **MMC Doc** → **Open**.

## Encryption at rest

- Room access phrases: bcrypt hash
- Room reference ids: stored as HMAC (not plaintext)
- Message sender + body: AES-256-GCM (`MMC_DATA_KEY`)

Someone opening phpMyAdmin should see ciphertext / hashes, not readable chat.

Both machines must use the **same** `MMC_DATA_KEY` in `.env`.

## Phone access

After you deploy to a server, open the public URL in the phone browser (Chrome/Safari), then long-press **MMC Doc** to open the gate — no hardware keyboard needed.

Local LAN test (server on your PC):

1. Same Wi‑Fi
2. `ipconfig` → IPv4
3. Phone: `http://YOUR_PC_IP:3847`

## API

- `POST /api/rooms` — `{ code, password, create_key }`
- `POST /api/rooms/join` — `{ code, password }`
- `POST /api/messages/clear` — `{ code, password }` (messages only)
- `POST /api/messages` — `{ code, password, sender_name, body }`
- `GET /api/messages?code=&password=&after_id=`

`.env` is gitignored — never commit real secrets.
