# CampusTrace Backend

Node.js + Express + MongoDB API for the Smart Campus Lost-Item Tracking project.

## Requirements

- Node.js 20+
- MongoDB Atlas database or a MongoDB instance
- Two different random API keys (device and admin), each at least 32 characters

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in your actual MongoDB connection string and generate two separate secrets.
3. Install dependencies and start the server:

```bash
npm install
npm start
```

Health check: `GET http://localhost:3000/api/health`

## Generate API keys

Run this command twice, once for each key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Never commit `.env` or expose either key in a public repository.

## API routes

- `GET /api/health` — service and database health
- `POST /api/items` — register an item; requires `x-admin-key`
- `GET /api/items` — list items (read-only)
- `PATCH /api/items/:id/status` — update status; requires `x-admin-key`
- `POST /api/iot/detection` — submit ESP32 scan; requires `x-device-key`
- `GET /api/iot/detections` — scan history (read-only)
- `GET /api/dashboard/summary` — dashboard counts and latest scans (read-only)

### Register an RFID item

```bash
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -H "x-admin-key: YOUR_ADMIN_KEY" \
  -d '{"uid":"01020304","name":"Demo Lost Item","category":"Personal Belongings","description":"RFID test item"}'
```

### Submit a scan

```bash
curl -X POST http://localhost:3000/api/iot/detection \
  -H "Content-Type: application/json" \
  -H "x-device-key: YOUR_DEVICE_KEY" \
  -d '{"uid":"01020304","location":"Central Library"}'
```

Allowed locations are `Central Library`, `Cafeteria`, and `Main Block`. Register the UID before submitting a scan.

## Render deployment

- Build command: `npm install`
- Start command: `npm start`
- Add `MONGODB_URI`, `DEVICE_API_KEY`, and `ADMIN_API_KEY` under Render Environment Variables.
- Render provides `PORT` automatically.

## Security notes

The item list, detection history, and dashboard summary routes are read-only but unauthenticated in this starter. Add dashboard authentication before using real student or campus data publicly. Do not use `client.setInsecure()` for production TLS validation in the ESP32 firmware.
# IOT-Project
