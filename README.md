# Smart E-Waste Management Portal

A WhatsApp-first platform that makes recycling electronic waste as easy as sending a message. Users register on a website, then book e-waste pickups entirely through a WhatsApp bot. Every message and booking is tracked by a built-in anti-spam layer.

> Status: **Prototype**

---

## Why this exists

E-waste ends up in landfills mostly because disposing of it properly is inconvenient. Most people already use WhatsApp daily, so we meet them there: sign up once on the web, then book pickups with a short chat.

## Features

- Website with sign-up and login (collects the client's WhatsApp number)
- Automatic WhatsApp welcome message after registration
- Conversational booking flow on WhatsApp (category, quantity, address, date, confirmation)
- Booking status check from WhatsApp (`STATUS`) and on the web dashboard
- Anti-spam protection: message flood limits, daily booking caps, auto-blocking of repeat offenders
- Fully containerized with Docker, data persisted in PostgreSQL

---

## Architecture

```
Browser (HTML/JS)
   |
   v
Backend API (Node.js + Express) ---> PostgreSQL
   |  webhook (internal secret)
   v
n8n  <--- inbound message webhook --- Evolution API <---> WhatsApp (bot number)
 |  reads/writes PostgreSQL
 |  sends replies through Evolution API
 v
Client's WhatsApp
```

Everything runs in one Docker network, so Evolution API and n8n talk to each other directly. No public tunnel is needed for the bot.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, vanilla JavaScript |
| Backend | Node.js 20, Express 4 |
| Auth | bcrypt (password hashing), JWT (sessions) |
| Validation | libphonenumber-js (phone numbers) |
| Web abuse protection | express-rate-limit |
| Database | PostgreSQL 16 |
| Cache | Redis 7 (used by Evolution API) |
| Automation / bot logic | n8n (self-hosted) |
| WhatsApp gateway | Evolution API v2 (self-hosted, Baileys based) |
| Containers | Docker, Docker Compose |

---

## Database schema

Three application tables in the `ewaste` database. (n8n and Evolution API keep their own internal data in separate `n8n` and `evolution` databases on the same Postgres server.)

### `registrations`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| full_name | VARCHAR(100) | |
| email | VARCHAR(150) | unique |
| password_hash | TEXT | bcrypt |
| whatsapp_number | VARCHAR(20) | unique, digits with country code |
| default_address | TEXT | optional |
| chat_state | VARCHAR(20) | bot conversation step (`IDLE`, `ASK_CATEGORY`, ...) |
| chat_context | JSONB | answers collected so far in the booking chat |
| is_blocked / blocked_until | BOOLEAN / TIMESTAMPTZ | anti-spam block |
| created_at | TIMESTAMPTZ | |

### `bookings`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| booking_ref | VARCHAR(12) | unique, e.g. `EW-A1B2C3` |
| registration_id | UUID (FK) | -> registrations.id |
| item_category | VARCHAR(40) | phone, laptop, battery, appliance, cables, other |
| quantity | INT | 1 to 50 |
| pickup_address | TEXT | |
| pickup_date | DATE | |
| status | VARCHAR(20) | PENDING, CONFIRMED, PICKED_UP, CANCELLED |
| created_at | TIMESTAMPTZ | |

### `antispam_log`
| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL (PK) | |
| whatsapp_number | VARCHAR(20) | |
| registration_id | UUID (FK, nullable) | null for unknown numbers |
| event_type | VARCHAR(20) | MESSAGE, BOOKING, REGISTER |
| action | VARCHAR(10) | ALLOWED or BLOCKED |
| reason | VARCHAR(100) | e.g. `rate_limit`, `daily_booking_cap` |
| created_at | TIMESTAMPTZ | |

## Anti-spam rules

| Rule | Limit | Result |
|---|---|---|
| Message flood | more than 10 messages in 60 s | 15-minute block |
| Daily booking cap | more than 3 bookings in 24 h | booking refused |
| Pending cap | more than 2 pending bookings | booking refused |
| Repeat offender | 3 or more blocked events in 24 h | 24-hour block |
| Unregistered number | number not in `registrations` | asked to register, then ignored if it keeps messaging |
| Website | 10 requests / 15 min per IP on register and login | HTTP 429 |

These rules also protect the bot's WhatsApp number, since the bot only talks to registered users and never bulk-sends.

---

## WhatsApp commands

| Command | What it does |
|---|---|
| `BOOK` | start a pickup booking |
| `STATUS` | show your last 3 bookings |
| `CANCEL` | abort the current booking conversation |
| `HELP` | list commands |

---

## Project structure

```
ewaste-portal/
├─ docker-compose.yml
├─ .env.example
├─ db/                 SQL files run on first start (extra databases + app schema)
├─ backend/            Express API (auth, profile, bookings list)
├─ frontend/           HTML/CSS/JS pages
└─ n8n/workflows/      Exported n8n workflows (send-reply, welcome, bot)
```

---

## Getting started

### Prerequisites
- Docker and Docker Compose
- A **spare phone number / SIM with WhatsApp** for the bot (do not use a personal number)

### 1. Clone and configure
```bash
git clone <repo-url>
cd ewaste-portal
cp .env.example .env
# edit .env: set passwords and secrets
```

### 2. Start everything
```bash
docker compose up -d --build
```
- Website and API: http://localhost:3000
- n8n editor: http://localhost:5678
- Evolution API manager: http://localhost:8080/manager

### 3. Connect the bot's WhatsApp number
Create the instance, then scan the QR code from the spare phone (WhatsApp -> Linked devices -> Link a device).
```bash
curl -X POST http://localhost:8080/instance/create \
  -H "apikey: <EVOLUTION_API_KEY>" -H "Content-Type: application/json" \
  -d '{"instanceName":"ewaste-bot","qrcode":true,"integration":"WHATSAPP-BAILEYS"}'
```
Open the Evolution manager in the browser to see the QR code.

### 4. Point WhatsApp events to n8n
```bash
curl -X POST http://localhost:8080/webhook/set/ewaste-bot \
  -H "apikey: <EVOLUTION_API_KEY>" -H "Content-Type: application/json" \
  -d '{"webhook":{"enabled":true,"url":"http://n8n:5678/webhook/wa-inbound","byEvents":false,"base64":false,"events":["MESSAGES_UPSERT"]}}'
```

### 5. Import workflows
In the n8n editor: Workflows -> Import from file -> select the JSON files from `n8n/workflows/`. Create the Postgres credential and a Header Auth credential (`apikey: <EVOLUTION_API_KEY>`), attach them to the nodes, then activate the workflows.

### 6. Try it
1. Open http://localhost:3000 and register with your WhatsApp number.
2. You get a welcome message from the bot.
3. Reply `BOOK` and follow the prompts.
4. Log in on the website and see your booking on the dashboard.

---

## Environment variables

| Variable | Purpose |
|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | database credentials |
| `JWT_SECRET` | signs login tokens |
| `INTERNAL_SECRET` | shared secret between backend and n8n webhook |
| `N8N_WEBHOOK_URL` | internal URL the backend calls after registration |
| `N8N_ENCRYPTION_KEY` | encrypts n8n credentials |
| `EVOLUTION_API_KEY` | API key for Evolution API |
| `EVOLUTION_INSTANCE` | instance name (default `ewaste-bot`) |

Never commit `.env`.

## Hosting notes

- Runs comfortably on an old laptop (about 2 to 3 GB RAM for all containers). Keep it plugged in with sleep disabled.
- Free cloud backends often wipe local data, which would break the anti-spam history. Keep Postgres on the laptop with a Docker volume.
- Do not run `docker compose down -v` unless you want to wipe the database and the WhatsApp session.
- Back up regularly: `docker compose exec postgres pg_dump -U ewaste_user ewaste > backup.sql`
- For a public demo of the website only: `cloudflared tunnel --url http://localhost:3000`. Never expose n8n, Evolution API or Postgres publicly.

## Known limitations (prototype)

- Evolution API is an **unofficial** WhatsApp gateway. It is not endorsed by WhatsApp and the bot number can be restricted or banned. Use a dedicated spare number and keep message volume low.
- The bot phone must stay registered; if the session logs out, re-scan the QR code.
- No admin panel yet; booking status is updated directly in the database.

## Roadmap

- Admin dashboard for managing pickups
- Collector assignment and route planning
- Status notifications on WhatsApp
- Migration to the official WhatsApp Cloud API for production
- Item photos and estimated recycling value
- Multi-language bot

## Team

Add team member names and roles here.

## License

Add a license (e.g. MIT) before publishing.
