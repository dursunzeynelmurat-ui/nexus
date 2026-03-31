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

## Production Deployment (AWS EC2 + Nginx + PM2)

This app is a **Node/Express server + Vite-built frontend**, so the recommended production path is:

- Run app process with **PM2**
- Put **Nginx** in front as reverse proxy
- Use **Hostinger only for DNS/domain records** (A record -> EC2 public IP)

### 1) EC2 setup (Ubuntu example)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pm2
```

### 2) App setup

```bash
sudo mkdir -p /var/www/nexus
sudo chown -R $USER:$USER /var/www/nexus
cd /var/www/nexus
git clone <REPO_URL>
cd nexus---professional-whatsapp-management-\&-automation
npm ci
npm run build
cp env.example .env
```

Fill `.env`:
- `PORT=3000`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_TOKEN_SECRET`

### 3) Start with PM2

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

### 4) Nginx reverse proxy

Create `/etc/nginx/sites-available/nexus`:

```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable config:

```bash
sudo ln -s /etc/nginx/sites-available/nexus /etc/nginx/sites-enabled/nexus
sudo nginx -t
sudo systemctl restart nginx
```

### 5) DNS (Hostinger)

- In Hostinger DNS panel, add/update `A` record for your domain/subdomain to EC2 public IP.
- Wait for DNS propagation.

### 6) Health check

- App health endpoint: `GET /healthz`
- Quick check:

```bash
curl http://127.0.0.1:3000/healthz
```

### 7) Persistence note

WhatsApp auth/session files (`auth_info_*`, `contacts_*.json`, `groups_*.json`) are stored on local disk.  
Do not wipe server disk if session continuity is required.
