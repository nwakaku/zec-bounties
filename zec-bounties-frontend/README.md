# Bounty Frontend

This is the frontend interface for the Hackathon bounty management platform.  
It provides a user-friendly UI for authentication, browsing bounties, submitting work, and tracking rewards.

---

## 🚀 Getting Started

### 1. Install dependencies

```bash
yarn install
```

### 2. Start the development server

```bash
yarn dev
```

## The app will start on:

```
http://localhost:3000
```

## Backend

In development, the frontend calls the backend at `http://localhost:9000` (see `lib/configENV.ts`). Start the backend first by following `../zec-bounties-backend/README.md`, which sets `PORT=9000` in the backend's `.env`. On Vercel, API requests are routed through the frontend's `/_backend` rewrite to `https://zechub.zone`, so browser API calls are same-origin and do not require changing the backend's CORS settings.

To point a local frontend at the production backend, create `.env.local` in this directory:

```env
NEXT_PUBLIC_BACKEND_URL=https://zechub.zone
```

The API will be proxied through the local Next.js server, and the WebSocket URL is derived from this setting (`https` becomes `wss`). Set `NEXT_PUBLIC_BACKEND_WS_URL` only if your backend uses a different WebSocket URL. Restart the Next.js dev server after changing environment variables. Requests and any changes made while connected to production use live production data.
