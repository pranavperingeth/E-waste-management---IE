# Smart E-Waste Management Portal

A prototype web portal where clients register and then interact with a WhatsApp bot (powered by Evolution API + n8n) to book e-waste pickups.

## Quick Start

```bash
cp .env.example .env
# Edit .env — set real passwords and secrets
docker compose up -d
```

- **Website**: http://localhost:3000
- **n8n editor**: http://localhost:5678
- **Evolution API**: http://localhost:8080

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

## Backup

```bash
docker compose exec postgres pg_dump -U ewaste_user ewaste > backup.sql
```
