<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/6e19b3f5-87c2-4477-9235-981d1e8402cd

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. (Optional) configure admin credentials in `.env.local`:
   - `ADMIN_USERNAME=...`
   - `ADMIN_PASSWORD=...`
   - `ADMIN_TOKEN_SECRET=...` (any long random string)
3. Run the app:
   `npm run dev`

> Note: The current app does **not** use Gemini APIs at runtime, so `GEMINI_API_KEY` is not required.

## AWS Deployment (Docker)

This repository is now container-ready for AWS ECS / App Runner / Elastic Beanstalk (Docker platform).

### 1) Build image locally

```bash
docker build -t nexus-whatsapp:latest .
```

### 2) Run locally with production server

```bash
docker run --rm -p 3000:3000 --env-file env.example nexus-whatsapp:latest
```

### 3) Required runtime notes for AWS

- App listens on `PORT` from environment (falls back to `3000`).
- For admin endpoints, set:
  - `ADMIN_USERNAME`
  - `ADMIN_PASSWORD`
  - `ADMIN_TOKEN_SECRET`
- WhatsApp auth/session files (`auth_info_*`, `contacts_*.json`, `groups_*.json`) are written to local disk.  
  In production, mount persistent storage (EFS/host volume) if you need session persistence across restarts.

### 4) Health check

Use `GET /healthz` for container health checks / ALB target group health probe.
