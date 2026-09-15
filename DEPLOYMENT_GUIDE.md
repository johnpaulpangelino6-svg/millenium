# 🌐 Deployment Guide - Millennium SmartBoard System

## ✅ Yes, You Can Deploy to a Web Host!

Since you're using **SQLite (file-based database)**, deployment is **simpler** than MySQL - no database server setup needed!

---

## 🎯 Best Hosting Options for This App

### 1. **Render.com** ⭐ RECOMMENDED (Free Tier Available)
- ✅ **Free tier** with 750 hours/month
- ✅ **Supports Node.js** out of the box
- ✅ **Supports SQLite** (file-based storage)
- ✅ **Auto-deploys** from GitHub
- ✅ **HTTPS** included free
- ✅ **Easy setup** (5 minutes)

### 2. **Railway.app** (Free $5 credit/month)
- ✅ Free $5 credit monthly
- ✅ Node.js support
- ✅ SQLite support
- ✅ GitHub integration
- ✅ Very fast deployment

### 3. **Fly.io** (Free tier)
- ✅ Free allowance
- ✅ Excellent SQLite support
- ✅ Global CDN
- ✅ Docker-based

### 4. **VPS Hosting** (DigitalOcean, Linode, Vultr)
- ✅ Full control
- ✅ Starting at $4-6/month
- ✅ Better for production

### ❌ **NOT Recommended:**
- ❌ **Shared hosting** (cPanel/Hostinger) - Usually doesn't support Node.js well
- ❌ **Traditional PHP hosts** - Not designed for Node.js apps

---

## 🚀 Quick Deployment (Render.com - EASIEST)

### Step 1: Prepare Your Code

**A. Add a start script for production:**

Edit `package.json`:
```json
{
  "scripts": {
    "start": "node dist/server.js",
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "db:seed": "node --import tsx/esm src/db/seed.ts",
    "postinstall": "npm run build"
  }
}
```

**B. Create a `.gitignore` if not exists:**
```
node_modules/
dist/
.env
data/*.db
*.log
```

**C. Create environment file template (`.env.example`):**
```
PORT=3000
NODE_ENV=production
```

### Step 2: Push to GitHub

```bash
# Initialize git (if not already)
git init

# Add files
git add .

# Commit
git commit -m "Initial commit - Millennium SmartBoard System"

# Create GitHub repo and push
git remote add origin https://github.com/YOUR_USERNAME/millennium-smartboard.git
git branch -M main
git push -u origin main
```

### Step 3: Deploy to Render.com

1. **Go to:** https://render.com
2. **Sign up** with GitHub
3. **Click** "New +" → "Web Service"
4. **Connect** your GitHub repository
5. **Configure:**
   - **Name:** millennium-smartboard
   - **Environment:** Node
   - **Build Command:** `npm install && npm run build && npm run db:seed`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
6. **Add Environment Variable:**
   - Key: `NODE_ENV`
   - Value: `production`
7. **Click** "Create Web Service"

**Done!** Your app will be live at: `https://millennium-smartboard.onrender.com`

---

## 📦 Deployment Files Needed

### 1. Create `render.yaml` (Optional but recommended)

```yaml
services:
  - type: web
    name: millennium-smartboard
    env: node
    plan: free
    buildCommand: npm install && npm run build && npm run db:seed
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
```

### 2. Update `.gitignore`

Make sure your `.gitignore` includes:
```
node_modules/
dist/
.env
data/millennium.db
*.log
```

**⚠️ Important:** The database will be recreated on each deployment with seed data.

---

## 🔧 Production Configuration

### Update `src/server.ts` for Production

Add this at the top:
```typescript
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';

// ... existing code ...

app.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});
```

### Update `.env` for Production

Create `.env.production`:
```
PORT=3000
NODE_ENV=production
```

---

## 🗄️ Database Persistence (IMPORTANT!)

### ⚠️ SQLite Limitation on Some Hosts

**Problem:** Some platforms (like Render free tier) have **ephemeral filesystems** - the database resets on restart.

**Solutions:**

### Option 1: Use Persistent Disk (Render Paid)
```yaml
services:
  - type: web
    name: millennium-smartboard
    env: node
    plan: starter # $7/month for persistent disk
    disk:
      name: data
      mountPath: /app/data
      sizeGB: 1
```

### Option 2: Migrate to PostgreSQL (For Production)

If you need **persistent data** on free tier:

```bash
# Install PostgreSQL adapter
npm install pg

# Update database.ts to use PostgreSQL
# (I can help you with this if needed)
```

### Option 3: Keep SQLite + Backup Strategy

```bash
# Add automatic backup to cloud storage
# Backup database every hour to S3/CloudFlare R2
```

---

## 🌍 Deployment Checklist

### Before Deploying:

- [ ] ✅ Code pushed to GitHub
- [ ] ✅ `.gitignore` configured (no `.env`, no `node_modules`)
- [ ] ✅ `package.json` has `build` and `start` scripts
- [ ] ✅ Database seeding works locally
- [ ] ✅ Environment variables documented

### After Deploying:

- [ ] ✅ Test the live URL
- [ ] ✅ Login with admin account
- [ ] ✅ Test customer assignment feature
- [ ] ✅ Verify all 10 customers appear
- [ ] ✅ Test device registration
- [ ] ✅ Check responsive design on mobile

---

## 🔐 Security for Production

### 1. Change Default Passwords

Edit `src/db/seed.ts` and change:
```typescript
{ username: 'admin', password: 'YOUR_SECURE_PASSWORD' }
```

### 2. Add CORS Configuration

Update `src/server.ts`:
```typescript
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? 'https://your-domain.com' 
    : '*'
}));
```

### 3. Add Rate Limiting

```bash
npm install express-rate-limit
```

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

---

## 💰 Hosting Costs Comparison

| Platform | Free Tier | Paid Tier | Best For |
|----------|-----------|-----------|----------|
| **Render** | 750hrs/mo | $7/mo | Easy deployment |
| **Railway** | $5 credit/mo | $0.000463/GB-hr | Modern stack |
| **Fly.io** | 3 shared VMs | $1.94/mo per VM | Global edge |
| **DigitalOcean** | None | $4-6/mo | Full control |
| **Heroku** | None (discontinued free) | $7/mo | Legacy apps |

---

## 🚀 Full Deployment Script (Render)

Save this as `deploy.sh`:

```bash
#!/bin/bash

echo "🚀 Deploying Millennium SmartBoard to Render..."

# Build TypeScript
echo "📦 Building TypeScript..."
npm run build

# Run database seed
echo "🌱 Seeding database..."
npm run db:seed

# Commit changes
echo "📝 Committing changes..."
git add .
git commit -m "Deploy: $(date)"

# Push to GitHub
echo "⬆️ Pushing to GitHub..."
git push origin main

echo "✅ Deploy complete! Check Render dashboard for status."
echo "🌐 Your app will be live at: https://millennium-smartboard.onrender.com"
```

Run with:
```bash
chmod +x deploy.sh
./deploy.sh
```

---

## 📱 Custom Domain Setup

### Step 1: Get a Domain
- Namecheap.com ($8-12/year)
- Google Domains
- Cloudflare Registrar

### Step 2: Configure DNS (Render)
1. Go to Render Dashboard → Your Service → Settings
2. Click "Custom Domains"
3. Add your domain: `smartboard.yourdomain.com`
4. Add DNS records:
   ```
   Type: CNAME
   Name: smartboard
   Value: millennium-smartboard.onrender.com
   ```

### Step 3: Wait for SSL
- Render automatically provisions SSL certificate
- Usually takes 5-15 minutes

---

## 🔄 CI/CD (Automatic Deployment)

### GitHub Actions (Auto-deploy on push)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Render

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run build
      - run: npm run db:seed
      # Render auto-deploys from GitHub
```

---

## 🆘 Troubleshooting

### Issue: "Cannot find module"
**Solution:** Make sure `postinstall` script runs `npm run build`

### Issue: "Database file not found"
**Solution:** Run `npm run db:seed` in build command

### Issue: "Port already in use"
**Solution:** Use `process.env.PORT` (hosting providers set this)

### Issue: "App crashes after restart"
**Solution:** Check if you need persistent disk (see persistence section above)

---

## ✅ Alternative: Deploy to Your Own VPS

If you want full control:

### 1. Get a VPS
- DigitalOcean Droplet ($4/mo)
- Linode ($5/mo)
- Vultr ($2.50/mo)

### 2. Setup Script
```bash
# SSH into your server
ssh root@your-server-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Install PM2 (process manager)
npm install -g pm2

# Clone your repo
git clone https://github.com/YOUR_USERNAME/millennium-smartboard.git
cd millennium-smartboard

# Install dependencies
npm install

# Build
npm run build

# Seed database
npm run db:seed

# Start with PM2
pm2 start dist/server.js --name millennium

# Save PM2 config
pm2 save
pm2 startup
```

### 3. Setup Nginx (Reverse Proxy)
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 🎯 Summary

**Yes, you can deploy to a web host!**

**Easiest Option:**
1. Push to GitHub
2. Connect to Render.com
3. Deploy in 5 minutes
4. Get free HTTPS URL

**For Production:**
- Use paid tier with persistent disk ($7/mo)
- Or migrate to PostgreSQL for better reliability
- Add custom domain
- Implement backups

**Your app is deployment-ready right now!** 🚀

---

## 📚 Next Steps

1. Choose a hosting platform (Render recommended)
2. Push code to GitHub
3. Deploy!
4. Test customer assignment feature live
5. Share the URL with your team

**Need help with any step? Let me know!**
