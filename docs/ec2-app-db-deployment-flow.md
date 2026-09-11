# EC2 App + Database Deployment Flow

This guide is the simplified deployment flow for running **AI Roleplay** and **PostgreSQL** on one EC2 instance.

Reference guide: https://github.com/AgoraIO-Support/CSETrainingSystem/blob/main/Deployment/Deployment.md

That reference uses the same general production patterns we want here:

- EC2 with an Elastic IP
- app runtime kept alive with `systemd`
- private environment file with locked permissions
- Prisma migrations before running the app
- S3 for backups/assets when needed
- logs and restart commands for operations

This repo does **not** currently use the referenced guide's Podman/Containerfile setup, so this flow uses Node.js, PostgreSQL, Nginx, and systemd directly on EC2.

---

## 1. Target Setup

Use one EC2 instance for both services:

```text
Custom domain
  -> EC2 Elastic IP
  -> Nginx on ports 80/443
  -> Next.js app on localhost:3000
  -> PostgreSQL on localhost:5432
```

PostgreSQL should only listen locally. Do **not** expose port `5432` publicly.

---

## 2. AWS Resources

Create or confirm these resources:

- EC2 instance: Ubuntu LTS or Amazon Linux 2023
- Instance size: `t3.medium` or better for app + database
- EBS volume: 30-50 GB gp3 minimum
- Elastic IP attached to the instance
- S3 bucket for database backups
- Security group rules:

```text
Inbound:
22   SSH    your admin IP only
80   HTTP   0.0.0.0/0
443  HTTPS  0.0.0.0/0
5432 PostgreSQL - do not open
```

---

## 3. Install Server Packages

SSH into EC2, then install Node.js, PostgreSQL, Nginx, Git, and AWS CLI.

Ubuntu example:

```bash
sudo apt update
sudo apt install -y git nginx postgresql postgresql-contrib awscli curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
psql --version
```

Amazon Linux 2023 example:

```bash
sudo dnf update -y
sudo dnf install -y git nginx postgresql16 postgresql16-server awscli nodejs npm
node --version
npm --version
psql --version
```

---

## 4. Configure PostgreSQL

Create the app database and user.

```bash
sudo -u postgres psql
```

Inside `psql`:

```sql
CREATE DATABASE ai_roleplay;
CREATE USER ai_roleplay_user WITH ENCRYPTED PASSWORD 'REPLACE_WITH_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE ai_roleplay TO ai_roleplay_user;
\q
```

For same-instance deployment, use localhost in the app env:

```env
DATABASE_URL=postgresql://ai_roleplay_user:REPLACE_WITH_STRONG_PASSWORD@localhost:5432/ai_roleplay?schema=public
```

---

## 5. Clone The Repository

```bash
sudo mkdir -p /opt/ai-roleplay
sudo chown -R $USER:$USER /opt/ai-roleplay
git clone https://github.com/AgoraIO-Support/AI-Roleplay.git /opt/ai-roleplay/app
cd /opt/ai-roleplay/app
```

---

## 6. Create Production Environment File

Create a private env file outside the repo:

```bash
sudo tee /opt/ai-roleplay/ai-roleplay.env >/dev/null <<'EOF'
NODE_ENV=production
PORT=3000
HOSTNAME=127.0.0.1

DATABASE_URL=postgresql://ai_roleplay_user:REPLACE_WITH_STRONG_PASSWORD@localhost:5432/ai_roleplay?schema=public
AUTH_SESSION_SECRET=REPLACE_WITH_LONG_RANDOM_SECRET

NEXT_PUBLIC_AGORA_APP_ID=REPLACE_ME
AGORA_APP_CERTIFICATE=REPLACE_ME
AGORA_CUSTOMER_ID=REPLACE_ME
AGORA_CUSTOMER_SECRET=REPLACE_ME

CONVOAI_BASE_URL=https://api.agora.io/api/conversational-ai-agent/v2
CONVOAI_ASR_PROVIDER=deepgram
CONVOAI_LLM_PROXY_URL=
CONVOAI_TTS_PROVIDER=minimax
CONVOAI_TTS_URL=wss://api.minimax.io/ws/v1/t2a_v2
CONVOAI_MINIMAX_TTS_MODEL=speech-2.8-turbo
CONVOAI_TTS_SPEED=1
CONVOAI_TTS_VOICE=English_expressive_narrator

OSS_API_KEY=REPLACE_ME
OSS_MODEL=gpt-5.5
OSS_REASONING_EFFORT=high

OBJECTIVE_EVALUATOR_PROVIDER=oss
OBJECTIVE_EVALUATOR_API_KEY=REPLACE_ME
OBJECTIVE_EVALUATOR_MODEL=gpt-5.5
OBJECTIVE_EVALUATOR_BASE_URL=https://v2.vexke.com/openai
OBJECTIVE_EVALUATOR_WIRE_API=responses
OBJECTIVE_EVALUATOR_MIN_CONFIDENCE=0.4

FINAL_ASSESSMENT_PROVIDER=oss
FINAL_ASSESSMENT_API_KEY=REPLACE_ME
FINAL_ASSESSMENT_MODEL=gpt-5.5
FINAL_ASSESSMENT_BASE_URL=https://v2.vexke.com/openai
FINAL_ASSESSMENT_WIRE_API=responses
EOF

sudo chmod 600 /opt/ai-roleplay/ai-roleplay.env
```

Do not commit this file.

---

## 7. Install, Migrate, And Build

```bash
cd /opt/ai-roleplay/app
npm ci
set -a
. /opt/ai-roleplay/ai-roleplay.env
set +a
npm run prisma:generate
npm run prisma:deploy
npm run build
```

If this is a fresh database, create your first root admin through your approved app/user creation process. Do not add default demo users to production.

---

## 8. Run The App With systemd

Create a service:

```bash
sudo tee /etc/systemd/system/ai-roleplay.service >/dev/null <<'EOF'
[Unit]
Description=AI Roleplay Next.js app
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=/opt/ai-roleplay/app
EnvironmentFile=/opt/ai-roleplay/ai-roleplay.env
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
User=ubuntu
Group=ubuntu

[Install]
WantedBy=multi-user.target
EOF
```

If your EC2 user is not `ubuntu`, replace `User=ubuntu` and `Group=ubuntu` with the correct Linux user.

Start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ai-roleplay
sudo systemctl status ai-roleplay --no-pager
```

View logs:

```bash
sudo journalctl -u ai-roleplay -n 200 --no-pager
sudo journalctl -u ai-roleplay -f
```

---

## 9. Configure Nginx

Create the Nginx site:

```bash
sudo tee /etc/nginx/sites-available/ai-roleplay >/dev/null <<'EOF'
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_EC2_IP;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/ai-roleplay /etc/nginx/sites-enabled/ai-roleplay
sudo nginx -t
sudo systemctl reload nginx
```

For Amazon Linux, Nginx config paths may use `/etc/nginx/conf.d/ai-roleplay.conf` instead of `sites-available` / `sites-enabled`.

---

## 10. Add A Domain And HTTPS

1. Attach an Elastic IP to EC2.
2. Add DNS records at your domain provider:

```text
A     @      EC2_ELASTIC_IP
A     www    EC2_ELASTIC_IP
```

3. Install HTTPS with Certbot.

Ubuntu example:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

After HTTPS is working, keep only ports `80` and `443` public.

---

## 11. Migrate From Neon To EC2 PostgreSQL

Run this from the EC2 instance after PostgreSQL is ready.

Set source and target URLs privately in the shell. Do not paste real values into chat or commit them.

```bash
export NEON_DATABASE_URL='postgresql://SOURCE_USER:SOURCE_PASSWORD@SOURCE_HOST/SOURCE_DB?sslmode=require'
export EC2_DATABASE_URL='postgresql://ai_roleplay_user:TARGET_PASSWORD@localhost:5432/ai_roleplay?schema=public'
```

Create a dump:

```bash
pg_dump "$NEON_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file=/tmp/ai-roleplay-neon.dump
```

Optional: copy the dump to S3:

```bash
aws s3 cp /tmp/ai-roleplay-neon.dump s3://YOUR_BACKUP_BUCKET/db-backups/ai-roleplay-neon-$(date +%F).dump
```

Restore into local PostgreSQL:

```bash
pg_restore \
  --dbname="$EC2_DATABASE_URL" \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  --verbose \
  /tmp/ai-roleplay-neon.dump
```

Then run Prisma migrations again:

```bash
cd /opt/ai-roleplay/app
set -a
. /opt/ai-roleplay/ai-roleplay.env
set +a
npm run prisma:deploy
```

---

## 12. Verify The Deployment

Check app health:

```bash
curl -I http://127.0.0.1:3000/login
curl -I http://YOUR_DOMAIN_OR_EC2_IP/login
```

Check database records:

```bash
psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "AppUser";'
psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "RolePlay";'
psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "RolePlayAttempt";'
psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "TranscriptSession";'
psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "FinalAssessment";'
```

Manual app checks:

- Log in as root admin.
- Create or open a course.
- Assign a trainee.
- Complete a roleplay session.
- Confirm transcript save.
- Confirm final assessment generation.
- Confirm course attempts page loads.
- Confirm transcript download works for course creator/root admin.
- Confirm reset attempts used works.

---

## 13. Backups To S3

Create a backup script:

```bash
sudo tee /opt/ai-roleplay/backup-db.sh >/dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

set -a
. /opt/ai-roleplay/ai-roleplay.env
set +a

BACKUP_FILE="/tmp/ai-roleplay-$(date +%F-%H%M%S).dump"
S3_BUCKET="YOUR_BACKUP_BUCKET"

pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file="$BACKUP_FILE"
aws s3 cp "$BACKUP_FILE" "s3://${S3_BUCKET}/db-backups/$(basename "$BACKUP_FILE")"
rm -f "$BACKUP_FILE"
EOF

sudo chmod 700 /opt/ai-roleplay/backup-db.sh
```

Run daily with cron:

```bash
sudo crontab -e
```

Add:

```text
0 2 * * * /opt/ai-roleplay/backup-db.sh >> /var/log/ai-roleplay-db-backup.log 2>&1
```

Test restore regularly. A backup is not reliable until you have tested restoring it.

---

## 14. Updating The App

When new code is pushed:

```bash
cd /opt/ai-roleplay/app
git pull
npm ci
set -a
. /opt/ai-roleplay/ai-roleplay.env
set +a
npm run prisma:deploy
npm run build
sudo systemctl restart ai-roleplay
sudo journalctl -u ai-roleplay -n 100 --no-pager
```

Only rebuild/restart after code, dependencies, or environment variables change.

---

## 15. Rollback Plan

Before major updates:

```bash
/opt/ai-roleplay/backup-db.sh
git rev-parse HEAD
```

Rollback app code:

```bash
cd /opt/ai-roleplay/app
git checkout PREVIOUS_COMMIT_SHA
npm ci
npm run build
sudo systemctl restart ai-roleplay
```

Rollback database:

```bash
aws s3 cp s3://YOUR_BACKUP_BUCKET/db-backups/BACKUP_FILE.dump /tmp/restore.dump
pg_restore --dbname="$DATABASE_URL" --clean --if-exists --no-owner --no-acl --verbose /tmp/restore.dump
sudo systemctl restart ai-roleplay
```

---

## 16. Common Operations

Restart app:

```bash
sudo systemctl restart ai-roleplay
```

Check app logs:

```bash
sudo journalctl -u ai-roleplay -n 200 --no-pager
```

Check Nginx:

```bash
sudo nginx -t
sudo systemctl status nginx --no-pager
```

Check PostgreSQL:

```bash
sudo systemctl status postgresql --no-pager
```

Check listening ports:

```bash
sudo ss -ltnp
```

Expected:

```text
:80 and :443 public through Nginx
127.0.0.1:3000 for Next.js
127.0.0.1:5432 for PostgreSQL
```
