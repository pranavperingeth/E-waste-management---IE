# Smart E-Waste Management Portal

A prototype web portal where clients register and then interact with a WhatsApp bot (powered by Evolution API + n8n) to book e-waste pickups.

## Quick Start

```bash
cp .env.example .env
# Edit .env — set real passwords and secrets
docker compose up -d
```

| Service         | URL                          | Notes                               |
|----------------|------------------------------|-------------------------------------|
| Website         | http://localhost:3000         | Public — share on same Wi-Fi        |
| n8n Editor      | http://localhost:5678         | Local only (127.0.0.1)              |
| Evolution API   | http://localhost:8080         | Local only (127.0.0.1)              |
| Evolution Mgr   | http://localhost:8080/manager | QR code scanning                    |
| PostgreSQL      | localhost:5433                | Local only, mapped from 5432        |

## Architecture

```
Browser (HTML/JS)
   |  HTTP (fetch)
   v
Backend API (Node.js + Express) ---> PostgreSQL (db: ewaste)
   |  POST webhook/registered
   v
n8n  <--- webhook/wa-inbound --- Evolution API <---> WhatsApp
```

## Evolution API Setup (Phase 4 — one-time manual steps)

Replace `KEY` with your `EVOLUTION_API_KEY` from `.env`.

### Step 1: Create instance
```bash
curl -X POST http://localhost:8080/instance/create \
  -H "apikey: KEY" -H "Content-Type: application/json" \
  -d '{"instanceName":"ewaste-bot","qrcode":true,"integration":"WHATSAPP-BAILEYS"}'
```

### Step 2: Scan QR code
Open http://localhost:8080/manager, log in with the API key, open instance `ewaste-bot`, and scan the QR code with your **spare phone**: WhatsApp → Linked devices → Link a device.

### Step 3: Point inbound messages to n8n
```bash
curl -X POST http://localhost:8080/webhook/set/ewaste-bot \
  -H "apikey: KEY" -H "Content-Type: application/json" \
  -d '{"webhook":{"enabled":true,"url":"http://n8n:5678/webhook/wa-inbound","byEvents":false,"base64":false,"events":["MESSAGES_UPSERT"]}}'
```

### Step 4: Test sending
```bash
curl -X POST http://localhost:8080/message/sendText/ewaste-bot \
  -H "apikey: KEY" -H "Content-Type: application/json" \
  -d '{"number":"919876543210","text":"Test from E-Waste bot","delay":1500}'
```

## n8n Workflow Setup (Phase 5)

1. Open http://localhost:5678, complete the n8n setup wizard.
2. Create credentials:
   - **Header Auth** named `Evolution API` — header `apikey`, value = your `EVOLUTION_API_KEY`
   - **Postgres** — host `postgres`, database `ewaste`, user/password from `.env`
3. Import the 3 workflow JSON files from `n8n/workflows/` in order:
   - `00-send-reply.json` — reusable sub-workflow (import first)
   - `01-welcome.json` — triggered by website registration
   - `02-bot.json` — handles all inbound WhatsApp messages
4. In each workflow, update the credential references (click each node and select the credentials you created).
5. In `01-welcome.json`, update the IF node's secret value to match your `INTERNAL_SECRET`.
6. In `01-welcome.json` and `02-bot.json`, update each "Execute Workflow" node to point to `00-send-reply`.
7. Activate workflows `01-welcome` and `02-bot`.

## Backup

```bash
docker compose exec postgres pg_dump -U ewaste_user ewaste > backup.sql
```

## Safety Notes

- Use a **spare SIM / dedicated WhatsApp number** for the bot — NEVER a personal number
- The bot only messages registered users and only replies to people who message it
- Every outgoing message has a 1500ms delay to avoid spam detection
- Anti-spam rules block message floods, daily booking caps, and repeat offenders
