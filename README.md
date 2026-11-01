# ♻️ Smart E-Waste Management Portal

A prototype web-to-chat e-waste management portal. Clients register on the web with their WhatsApp number, after which an automated WhatsApp bot (powered by **Evolution API v2** and **n8n**) guides them conversationally through scheduling electronic waste pickups. All data and anti-spam metrics persist in **PostgreSQL**.

---

## 🛠️ Tech Stack

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-4.x-000000?style=for-the-badge&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![n8n](https://img.shields.io/badge/n8n-Automation-EA4B71?style=for-the-badge&logo=n8n&logoColor=white)
![Evolution API](https://img.shields.io/badge/Evolution_API-v2.1.1-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-Secure_Auth-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)

</div>

---

## 📐 Architecture Overview

```text
Browser (HTML5/CSS3/Vanilla JS)
   |  HTTP (fetch)
   v
Backend API (Node.js + Express) ---> PostgreSQL (db: ewaste)
   |  POST /webhook/registered
   v
n8n  <--- webhook/wa-inbound --- Evolution API <---> WhatsApp (Bot SIM)
 |  reads/writes PostgreSQL
 |  sends replies: POST /message/sendText/ewaste-bot (with 1500ms delay)
 v
Client's WhatsApp
```

All 5 core services run within a single isolated Docker network. Internal communication routes through container hostnames (`postgres:5432`, `evolution-api:8080`, `n8n:5678`), removing any requirement for tunnels or public IPs.

---

## 🌐 Services & Ports Directory

| Service | Local URL | Port Mapping (Host:Container) | Description |
| :--- | :--- | :--- | :--- |
| **Web Portal & API** | [http://localhost:3000](http://localhost:3000) | `3000:3000` | Client landing page, register, login & dashboard |
| **Evolution API Manager** | [http://localhost:8080/manager](http://localhost:8080/manager) | `127.0.0.1:8080:8080` | Web QR scanner & WhatsApp session control |
| **n8n Workflow Canvas** | [http://localhost:5678](http://localhost:5678) | `127.0.0.1:5678:5678` | Visual automation builder and execution monitor |
| **PostgreSQL 16** | `localhost:5433` | `127.0.0.1:5433:5432` | Multi-database server (`ewaste`, `n8n`, `evolution`) |
| **Redis 7** | Internal only | `6379:6379` | In-memory session store for Evolution API |

> [!NOTE]
> PostgreSQL is mapped to host port **5433** to prevent collisions with existing local PostgreSQL installations on port 5432. Inside the Docker network, services communicate directly on default port `5432`.

---

## 📥 Complete Installation & Setup Guide

### 1. Prerequisites
Before beginning, verify you have the following installed on your machine:
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) (v24.x or newer) with Docker Compose v2.
* `git` and `curl` command-line utilities.
* A **dedicated phone / spare SIM** with WhatsApp installed (never use a personal account for bot development).

---

### 2. Clone Repository & Setup Environment
Clone the repository and create your local `.env` file:

```bash
git clone https://github.com/pranavperingeth/E-waste-management---IE.git ewaste-portal
cd ewaste-portal
cp .env.example .env
```

Open `.env` in any text editor and adjust passwords or secrets as desired:

```env
# PostgreSQL
POSTGRES_USER=ewaste_user
POSTGRES_PASSWORD=change_me
POSTGRES_DB=ewaste

# Backend
BACKEND_PORT=3000
JWT_SECRET=change_me_long_random
INTERNAL_SECRET=change_me_shared_with_n8n
N8N_WEBHOOK_URL=http://n8n:5678/webhook/registered

# n8n
N8N_ENCRYPTION_KEY=change_me_random
GENERIC_TIMEZONE=Asia/Kolkata

# Evolution API
EVOLUTION_API_KEY=change_me_long_random_uuid
EVOLUTION_INSTANCE=ewaste-bot
```

---

### 3. Launch Docker Containers
Build the backend container and spin up all 5 microservices in detached mode:

```bash
docker compose up -d --build
```

Verify that all 5 containers are running:

```bash
docker compose ps
```

All services (`backend`, `evolution-api`, `n8n`, `postgres`, `redis`) should display status **Up**.

---

### 4. Connect WhatsApp Bot via Evolution API

Replace `KEY` with the `EVOLUTION_API_KEY` defined in your `.env` (default: `change_me_long_random_uuid`).

#### Step 4.1: Create the Bot Instance
```bash
curl -X POST http://localhost:8080/instance/create \
  -H "apikey: KEY" \
  -H "Content-Type: application/json" \
  -d '{"instanceName":"ewaste-bot","qrcode":true,"integration":"WHATSAPP-BAILEYS"}'
```

#### Step 4.2: Scan the QR Code
1. Open [http://localhost:8080/manager](http://localhost:8080/manager) in your browser.
2. Sign in using your `EVOLUTION_API_KEY`.
3. Select instance **`ewaste-bot`**.
4. Open WhatsApp on your spare phone $\rightarrow$ tap **Linked Devices** $\rightarrow$ **Link a Device** and scan the QR code.

#### Step 4.3: Route Inbound WhatsApp Messages to n8n
Point incoming WhatsApp messages to the internal n8n webhook:

```bash
curl -X POST http://localhost:8080/webhook/set/ewaste-bot \
  -H "apikey: KEY" \
  -H "Content-Type: application/json" \
  -d '{"webhook":{"enabled":true,"url":"http://n8n:5678/webhook/wa-inbound","byEvents":false,"base64":false,"events":["MESSAGES_UPSERT"]}}'
```

#### Step 4.4: (Optional) Send a Test Message
```bash
curl -X POST http://localhost:8080/message/sendText/ewaste-bot \
  -H "apikey: KEY" \
  -H "Content-Type: application/json" \
  -d '{"number":"919876543210","text":"Test message from E-Waste Bot","delay":1500}'
```

---

### 5. Setup n8n Workflows

1. Open [http://localhost:5678](http://localhost:5678) in your browser and complete the one-time owner account setup.
2. Under **Credentials** $\rightarrow$ **Add Credential**:
   * **Header Auth**:
     * Name: `Evolution API`
     * Header Name: `apikey`
     * Header Value: `<EVOLUTION_API_KEY>` (from `.env`)
   * **Postgres**:
     * Name: `ewaste DB`
     * Host: `postgres`
     * Port: `5432`
     * Database: `ewaste`
     * User: `ewaste_user`
     * Password: `<POSTGRES_PASSWORD>` (from `.env`)
3. Import the 3 workflow JSON files located in `n8n/workflows/` (*Workflows $\rightarrow$ Import from File*):
   * `00-send-reply.json` *(import first)*
   * `01-welcome.json`
   * `02-bot.json`
4. In `01-welcome` and `02-bot`, verify that each **Execute Workflow** node references the imported `00-send-reply` sub-workflow.
5. Toggle the status of `01-welcome` and `02-bot` to **Active**.

---

## 🤖 WhatsApp Chatbot User Flow

Once registered on the web portal, users interact with the bot using simple conversational commands:

```text
User 💬: BOOK
Bot  🤖: What are you recycling? Reply with a number:
         1️⃣ Phone
         2️⃣ Laptop
         3️⃣ Battery
         4️⃣ Appliance
         5️⃣ Cables
         6️⃣ Other

User 💬: 1
Bot  🤖: 📦 Category: phone. How many items? (1-50)

User 💬: 2
Bot  🤖: 📍 Please enter the pickup address.

User 💬: Flat 402, Green Enclave, MG Road, Bengaluru
Bot  🤖: 📅 Pickup date? Format: DD-MM-YYYY (within the next 14 days)

User 💬: 10-11-2026
Bot  🤖: 📋 Booking Summary:
         📦 Category: phone
         🔢 Quantity: 2
         📍 Address: Flat 402, Green Enclave, MG Road, Bengaluru
         📅 Date: 10-11-2026
         Reply YES to confirm or CANCEL to abort.

User 💬: YES
Bot  🤖: ✅ Booked! Your reference is EW-XXXXXX.
```

### Global Commands
* `BOOK`: Initiates a pickup schedule request.
* `STATUS`: Queries PostgreSQL and returns the client's last 3 bookings with live status.
* `CANCEL`: Immediately clears conversational context and resets state to `IDLE`.
* `HELP`: Displays all commands.

---

## 🛡️ Anti-Spam & Abuse Protection Matrix

| Rule | Trigger Condition | System Action |
| :--- | :--- | :--- |
| **R1: Flood Protection** | $> 10$ messages in 60 seconds | Temporarily suspends user for 15 minutes, logs event, and sends single warning. |
| **R2: Daily Booking Cap** | $> 3$ bookings created within 24 hours | Refuses request and suggests managing existing bookings. |
| **R3: Pending Cap** | $> 2$ bookings with status `PENDING` | Refuses new requests until existing pickups are fulfilled. |
| **R4: Repeat Violator** | $\ge 3$ blocked violations within 24 hours | Escalates to a 24-hour hard block (`is_blocked = TRUE`). |
| **R5: Unregistered Check** | Sender number not present in `registrations` | Sends a one-time signup invite; silences after 3 attempts in 10 minutes. |
| **R6: Block Enforcer** | `is_blocked = TRUE` and `blocked_until > NOW()` | Silently drops message without triggering replies. |
| **Web Rate Limiting** | $> 10$ requests / 15 min per IP on `/api/register` or `/api/login` | Returns `HTTP 429 Too Many Requests`. |

---

## 💾 Database Backup & Maintenance

* **Create Backup**:
  ```bash
  docker compose exec postgres pg_dump -U ewaste_user ewaste > backup.sql
  ```
* **Restore Backup**:
  ```bash
  cat backup.sql | docker compose exec -T postgres psql -U ewaste_user -d ewaste
  ```
* **Restart Services Without Data Loss**:
  ```bash
  docker compose down && docker compose up -d
  ```

---

## ⚠️ Safety Notes for Evolution API

1. **Dedicated Number**: Always use a spare SIM or virtual WhatsApp number for the bot. Never use your primary personal number.
2. **Opt-in Communication Only**: The bot only contacts clients who registered through the portal and only responds to inbound messages.
3. **Pacing**: Outgoing messages enforce a `1500ms` delay (`"delay": 1500`) to respect messaging rate safety margins.
