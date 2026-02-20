# Expense Splitter — Deployment & Usage Guide

Complete guide for running the expense splitter app locally and deploying it to a web server.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Getting a Telegram Bot Token](#getting-a-telegram-bot-token)
4. [Running Locally](#running-locally)
5. [Using the Web App](#using-the-web-app)
6. [Deploying to a VPS / Cloud Server](#deploying-to-a-vps--cloud-server)
7. [Setting Up HTTPS with Nginx](#setting-up-https-with-nginx)
8. [Running as a Background Service (systemd)](#running-as-a-background-service-systemd)
9. [Deploying with Docker](#deploying-with-docker)
10. [Deploying to Platform-as-a-Service](#deploying-to-platform-as-a-service)
11. [Connecting the Telegram WebApp](#connecting-the-telegram-webapp)
12. [Environment Variables Reference](#environment-variables-reference)
13. [Maintenance & Backups](#maintenance--backups)
14. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Node.js** v18 or later — [https://nodejs.org](https://nodejs.org)
- **npm** (comes with Node.js)
- **Git** (to clone the repository)
- A **Telegram account** (to create a bot via @BotFather)

Verify your installations:

```bash
node --version    # Should print v18.x.x or later
npm --version     # Should print 9.x.x or later
git --version
```

---

## Local Development Setup

### Step 1 — Clone the repository

```bash
git clone <your-repo-url>
cd expense-splitter
```

### Step 2 — Install dependencies

```bash
npm install
```

This installs all required packages: Express, better-sqlite3, node-telegram-bot-api, etc.

### Step 3 — Configure environment variables

```bash
cp .env.example .env
```

Edit the `.env` file:

```env
# Required — get this from @BotFather (see section below)
BOT_TOKEN=your_telegram_bot_token_here

# Port for the web server (default: 3000)
PORT=3000

# Public URL where the app will be accessible
# For local dev, use localhost; for production, use your domain
BASE_URL=http://localhost:3000

# SQLite database file path (auto-created on first run)
DB_PATH=./data/expense-splitter.db

# Optional — for currency conversion features
EXCHANGE_RATES_API_KEY=

# Max receipt upload size in MB
MAX_UPLOAD_SIZE=10
```

### Step 4 — Start the app

**Development mode** (auto-restarts on file changes):

```bash
npm run dev
```

**Production mode:**

```bash
npm start
```

You should see:

```
Initializing database...
Database ready.
Web server running on port 3000
============================================================
  Сочтёмся / Splitwise Bot is running!

  Web interface: http://localhost:3000
  Telegram bot: active
============================================================
```

### Step 5 — Open the web interface

Open your browser and navigate to:

```
http://localhost:3000
```

The web interface loads as a single-page application. When accessed outside of Telegram, it runs in demo mode with a test user.

---

## Getting a Telegram Bot Token

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Choose a **name** for your bot (e.g., "Expense Splitter")
4. Choose a **username** (must end with `bot`, e.g., `my_expense_splitter_bot`)
5. BotFather replies with your **bot token** — a string like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`
6. Copy the token and paste it into your `.env` file as `BOT_TOKEN`

**Set bot commands** (optional but recommended):

Send this to @BotFather:

```
/setcommands
```

Select your bot, then paste:

```
start - Start the bot
lang - Choose language
groups - My groups
newgroup - Create a new group
expense - Add an expense
balance - View balance
settle - Settle a debt
history - Expense history
friends - Friends
settings - Settings
export - Export to CSV
help - Help
```

---

## Using the Web App

### Accessing via Browser (Demo Mode)

Navigate to `http://localhost:3000` (or your deployed URL). The app works as a standalone SPA with a demo user when opened outside Telegram.

### Key Sections

| Section | What It Does |
|---------|-------------|
| **Groups** | Create/manage expense groups (Home, Trip, Couple, Other) |
| **Add Expense** | Record an expense with split options: equal, exact, percent, shares, adjustment |
| **Balance** | View who owes whom, with simplified debts |
| **History** | Browse past expenses with filters |
| **Settle** | Record a payment between members |
| **Settings** | Change language (RU/EN), currency preferences |

### Accessing via Telegram

When the bot is running and `BASE_URL` is set to an HTTPS URL, the bot sends WebApp buttons that open the web interface inside Telegram. This provides the native Telegram theme and user authentication.

### API Usage

The app exposes a REST API you can use directly:

```bash
# Get categories
curl http://localhost:3000/api/categories

# Create a group
curl -X POST http://localhost:3000/api/groups \
  -H "Content-Type: application/json" \
  -d '{"telegramId": "123456", "name": "Trip to Paris", "type": "trip", "currency": "EUR"}'

# Add an expense
curl -X POST http://localhost:3000/api/expenses \
  -H "Content-Type: application/json" \
  -d '{"telegramId": "123456", "groupId": 1, "description": "Dinner", "amount": 50, "splitType": "equal"}'

# Check balances
curl http://localhost:3000/api/groups/1/balance
```

---

## Deploying to a VPS / Cloud Server

This section covers deploying to any Linux server (Ubuntu/Debian, DigitalOcean, AWS EC2, Hetzner, Linode, etc.).

### Step 1 — Provision a server

Any VPS with:
- Ubuntu 22.04+ (or Debian 12+)
- 512 MB RAM minimum (1 GB recommended)
- 1 vCPU
- 10 GB disk

### Step 2 — Install Node.js on the server

```bash
# Connect to your server
ssh user@your-server-ip

# Install Node.js 20.x via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version
npm --version
```

### Step 3 — Install build essentials (for better-sqlite3)

`better-sqlite3` requires native compilation:

```bash
sudo apt-get install -y build-essential python3
```

### Step 4 — Upload the project

**Option A — Git clone:**

```bash
cd /opt
sudo git clone <your-repo-url> expense-splitter
cd expense-splitter
```

**Option B — SCP/rsync from your local machine:**

```bash
# From your local machine:
rsync -avz --exclude node_modules --exclude data --exclude .env \
  ./expense-splitter/ user@your-server-ip:/opt/expense-splitter/
```

### Step 5 — Install dependencies and configure

```bash
cd /opt/expense-splitter
npm install --production

cp .env.example .env
nano .env  # or use vim/vi
```

Set in `.env`:

```env
BOT_TOKEN=your_actual_bot_token
PORT=3000
BASE_URL=https://your-domain.com
DB_PATH=./data/expense-splitter.db
```

### Step 6 — Create data directories

```bash
mkdir -p data uploads
```

### Step 7 — Test the app

```bash
node src/index.js
```

If it starts without errors, press `Ctrl+C` and proceed to set it up as a service.

---

## Setting Up HTTPS with Nginx

Telegram WebApp requires HTTPS. Use Nginx as a reverse proxy with Let's Encrypt.

### Step 1 — Install Nginx and Certbot

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

### Step 2 — Configure Nginx

Create `/etc/nginx/sites-available/expense-splitter`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Allow larger file uploads for receipts
    client_max_body_size 10M;
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/expense-splitter /etc/nginx/sites-enabled/
sudo nginx -t          # Test configuration
sudo systemctl reload nginx
```

### Step 3 — Obtain SSL certificate

```bash
sudo certbot --nginx -d your-domain.com
```

Follow the prompts. Certbot auto-configures HTTPS and sets up auto-renewal.

### Step 4 — Verify HTTPS

Open `https://your-domain.com` in your browser. You should see the expense splitter web interface.

---

## Running as a Background Service (systemd)

Create a systemd service so the app starts automatically and restarts on failure.

### Step 1 — Create the service file

Create `/etc/systemd/system/expense-splitter.service`:

```ini
[Unit]
Description=Expense Splitter Bot & Web App
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/expense-splitter
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=expense-splitter
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### Step 2 — Set file permissions

```bash
sudo chown -R www-data:www-data /opt/expense-splitter
```

### Step 3 — Enable and start the service

```bash
sudo systemctl daemon-reload
sudo systemctl enable expense-splitter
sudo systemctl start expense-splitter
```

### Step 4 — Check status and logs

```bash
sudo systemctl status expense-splitter
sudo journalctl -u expense-splitter -f    # Follow live logs
```

### Managing the service

```bash
sudo systemctl restart expense-splitter   # Restart
sudo systemctl stop expense-splitter      # Stop
sudo systemctl start expense-splitter     # Start
```

---

## Deploying with Docker

If you prefer Docker, create the following files in the project root.

### Dockerfile

```dockerfile
FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

RUN mkdir -p data uploads

EXPOSE 3000

CMD ["node", "src/index.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  expense-splitter:
    build: .
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data        # Persist database
      - ./uploads:/app/uploads  # Persist uploaded receipts
    env_file:
      - .env
    environment:
      - NODE_ENV=production
```

### Run with Docker Compose

```bash
# Build and start
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down

# Rebuild after code changes
docker compose up -d --build
```

---

## Deploying to Platform-as-a-Service

### Railway

1. Push your code to a GitHub repository
2. Go to [railway.app](https://railway.app) and create a new project
3. Connect your GitHub repo
4. Add environment variables in the Railway dashboard:
   - `BOT_TOKEN` = your token
   - `PORT` = 3000
   - `BASE_URL` = the URL Railway assigns to your app
5. Railway auto-detects Node.js and deploys

### Render

1. Push code to GitHub
2. Go to [render.com](https://render.com) > New Web Service
3. Connect the repo
4. Settings:
   - **Build command:** `npm install`
   - **Start command:** `node src/index.js`
5. Add environment variables in the dashboard
6. Deploy

### Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Launch (from project directory)
fly launch

# Set secrets
fly secrets set BOT_TOKEN=your_token BASE_URL=https://your-app.fly.dev

# Deploy
fly deploy
```

**Note:** For PaaS platforms, the SQLite database file lives on ephemeral disk by default. For persistent storage, use a volume mount (e.g., `fly volumes create`) or switch to PostgreSQL for production.

---

## Connecting the Telegram WebApp

After deploying with HTTPS:

### Step 1 — Update BASE_URL

Set `BASE_URL` in your `.env` to your HTTPS domain:

```env
BASE_URL=https://your-domain.com
```

Restart the app.

### Step 2 — Set the WebApp URL in BotFather

1. Open @BotFather in Telegram
2. Send `/mybots` and select your bot
3. Go to **Bot Settings** > **Menu Button** > **Configure menu button**
4. Set the URL to `https://your-domain.com`

Now when users open your bot, they see a menu button that launches the web app inside Telegram.

### Step 3 — Test the integration

1. Open your bot in Telegram
2. Send `/start`
3. The bot should respond with inline keyboard buttons
4. Click any WebApp button — the web interface opens within Telegram
5. The app inherits the Telegram theme (dark/light) and user identity

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BOT_TOKEN` | Yes | — | Telegram bot token from @BotFather |
| `PORT` | No | `3000` | Web server port |
| `BASE_URL` | Yes (prod) | — | Public HTTPS URL for WebApp links |
| `DB_PATH` | No | `./data/expense-splitter.db` | SQLite database file location |
| `EXCHANGE_RATES_API_KEY` | No | — | API key for currency conversion (openexchangerates.org) |
| `MAX_UPLOAD_SIZE` | No | `10` | Maximum receipt upload size in MB |

---

## Maintenance & Backups

### Database backup

The entire database is a single SQLite file. Back it up by copying:

```bash
# Manual backup
cp data/expense-splitter.db data/backup-$(date +%Y%m%d).db

# Automated daily backup (add to crontab)
crontab -e
# Add this line:
0 2 * * * cp /opt/expense-splitter/data/expense-splitter.db /opt/expense-splitter/data/backup-$(date +\%Y\%m\%d).db
```

### Updating the app

```bash
cd /opt/expense-splitter
git pull origin main
npm install --production
sudo systemctl restart expense-splitter
```

### Monitoring logs

```bash
# systemd logs
sudo journalctl -u expense-splitter --since "1 hour ago"

# Docker logs
docker compose logs --tail 100 -f
```

---

## Troubleshooting

### "BOT_TOKEN is not configured"

The app starts without the Telegram bot but the web server still works. Set a valid `BOT_TOKEN` in `.env` and restart.

### "better-sqlite3 build failed"

Install build tools:

```bash
# Ubuntu/Debian
sudo apt-get install -y build-essential python3

# Alpine (Docker)
apk add --no-cache python3 make g++

# macOS
xcode-select --install
```

Then reinstall:

```bash
rm -rf node_modules
npm install
```

### "Web app not opening in Telegram"

- `BASE_URL` must be HTTPS (not HTTP) — Telegram requires a valid SSL certificate
- Verify the URL is reachable from the internet: `curl https://your-domain.com`
- Check that you configured the Menu Button URL in @BotFather

### Port already in use

```bash
# Find what's using port 3000
lsof -i :3000

# Use a different port
PORT=3001 node src/index.js
```

### Database locked errors

This can happen if multiple instances are running:

```bash
# Check for running instances
ps aux | grep "node src/index.js"

# Kill duplicates
sudo systemctl stop expense-splitter
pkill -f "node src/index.js"
sudo systemctl start expense-splitter
```

### Permission denied on data/ or uploads/

```bash
sudo chown -R www-data:www-data /opt/expense-splitter/data /opt/expense-splitter/uploads
sudo chmod 755 /opt/expense-splitter/data /opt/expense-splitter/uploads
```

---

## Quick Reference — Command Summary

```bash
# ---- Local Development ----
npm install              # Install dependencies
cp .env.example .env     # Create config file
npm run dev              # Start in dev mode (auto-reload)
npm start                # Start in production mode

# ---- Server Deployment ----
npm install --production # Install production deps only
node src/index.js        # Run the app
sudo systemctl start expense-splitter   # Start via systemd
sudo systemctl status expense-splitter  # Check status

# ---- Docker ----
docker compose up -d             # Start in background
docker compose logs -f           # View logs
docker compose down              # Stop
docker compose up -d --build     # Rebuild and start

# ---- Maintenance ----
cp data/expense-splitter.db data/backup.db   # Backup database
sudo journalctl -u expense-splitter -f       # View logs
```
