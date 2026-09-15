# Complete Guide: Deploying Node.js Apps to the Web

## 📚 Table of Contents
1. [Understanding Web Hosting](#understanding-web-hosting)
2. [Before You Deploy](#before-you-deploy)
3. [Step-by-Step Deployment to Render.com](#step-by-step-deployment)
4. [Troubleshooting Common Issues](#troubleshooting)
5. [Other Hosting Options](#other-hosting-options)

---

## Understanding Web Hosting

### What is Localhost vs Web Hosting?

**Localhost (Your Computer):**
- URL: `http://localhost:3000`
- Only YOU can access it
- Only works when your computer is on
- Free but not accessible to others

**Web Hosting (Cloud Server):**
- URL: `https://your-app-name.onrender.com`
- ANYONE can access it from the internet
- Works 24/7 even when your computer is off
- Free tier available (Render, Vercel, Netlify)

### Key Concepts

1. **Server Binding:**
   - `localhost` = Only your computer can connect
   - `0.0.0.0` = Accept connections from anywhere (required for cloud hosting)

2. **Environment Variables:**
   - Local: You set them in `.env` file
   - Production: You set them in hosting dashboard

3. **Build Process:**
   - Development: `npm run dev` (runs TypeScript directly)
   - Production: `npm run build` → `npm start` (compile TypeScript to JavaScript first)

---

## Before You Deploy

### ✅ Checklist: Is Your App Ready?

1. **Code is on GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
   git push -u origin main
   ```

2. **package.json has correct scripts**
   ```json
   {
     "scripts": {
       "start": "node dist/server.js",
       "build": "tsc",
       "dev": "tsx watch src/server.ts"
     }
   }
   ```

3. **Server binds to 0.0.0.0 and uses process.env.PORT**
   ```typescript
   const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
   const HOST = '0.0.0.0'; // Required for cloud hosting!
   
   app.listen(PORT, HOST, () => {
     console.log(`Server running on port ${PORT}`);
   });
   ```

4. **.gitignore is properly configured**
   ```
   node_modules/
   dist/
   .env
   data/
   *.log
   ```

5. **Database is configured for production**
   - SQLite: File-based (stores in `data/` folder)
   - PostgreSQL/MySQL: Use connection string from hosting provider

---

## Step-by-Step Deployment

### Option 1: Render.com (Recommended - Free Tier)

#### Part 1: Prepare Your Code

**1. Create `render.yaml` in your project root:**

```yaml
services:
  - type: web
    name: your-app-name
    env: node
    plan: free
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
```

**2. Ensure your server.ts is production-ready:**

```typescript
import express from 'express';
const app = express();

// CRITICAL: Use environment PORT and bind to 0.0.0.0
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const HOST = '0.0.0.0'; // Must be 0.0.0.0 for Render!

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});
```

**3. Push to GitHub:**

```bash
git add .
git commit -m "Prepare for Render deployment"
git push origin main
```

#### Part 2: Deploy on Render.com

**Step 1: Create Render Account**
1. Go to https://render.com
2. Click "Get Started for Free"
3. Sign up with GitHub (easiest way)

**Step 2: Create New Web Service**
1. Click "New +" button
2. Select "Web Service"
3. Click "Connect" next to your GitHub repository
4. If you don't see it, click "Configure account" to give Render access

**Step 3: Configure Service**
Fill in these settings:

| Setting | Value | Why |
|---------|-------|-----|
| **Name** | your-app-name | URL will be `your-app-name.onrender.com` |
| **Environment** | Node | You're using Node.js |
| **Region** | Oregon (US West) or nearest | Closest to your users |
| **Branch** | main | Deploy from main branch |
| **Root Directory** | (leave blank) | Unless your app is in a subfolder |
| **Build Command** | `npm install && npm run build` | Installs dependencies and compiles TypeScript |
| **Start Command** | `npm start` | Runs your production server |
| **Plan** | Free | $0/month (goes to sleep after 15 min inactivity) |

**Step 4: Add Environment Variables (if needed)**
Click "Advanced" → "Add Environment Variable"

Common variables:
```
NODE_ENV=production
DATABASE_URL=your-database-connection-string
API_KEY=your-secret-key
```

**Step 5: Deploy!**
1. Click "Create Web Service"
2. Render will start building and deploying
3. Watch the logs - you'll see:
   ```
   ==> Cloning from https://github.com/...
   ==> Running build command...
   ==> Build successful 🎉
   ==> Deploying...
   ==> Your service is live 🎉
   ```

**Step 6: Access Your Live App**
- Once deployed, click the URL at the top (e.g., `https://your-app-name.onrender.com`)
- Share this URL with anyone!

#### Part 3: Future Updates

Whenever you update your code:

```bash
git add .
git commit -m "Update feature X"
git push origin main
```

Render will **automatically redeploy** within 1-2 minutes!

---

## Troubleshooting

### Problem 1: "No open ports detected"

**Error:**
```
==> No open ports detected on 0.0.0.0
==> Port scan timeout reached
```

**Cause:** Server is binding to `localhost` instead of `0.0.0.0`

**Fix:**
```typescript
// ❌ WRONG
const HOST = 'localhost'; 

// ✅ CORRECT
const HOST = '0.0.0.0';
```

Also ensure you're NOT hardcoding the PORT in render.yaml:
```yaml
# ❌ WRONG - Don't set PORT
envVars:
  - key: PORT
    value: 3000

# ✅ CORRECT - Let Render set it dynamically
envVars:
  - key: NODE_ENV
    value: production
```

---

### Problem 2: TypeScript Build Errors

**Error:**
```
error TS2304: Cannot find name 'xyz'
error TS2353: Object literal may only specify known properties
```

**Cause:** Type mismatches or missing type definitions

**Fix:**
1. Test build locally BEFORE pushing:
   ```bash
   npm run build
   ```

2. Fix all TypeScript errors locally

3. Push only when build succeeds:
   ```bash
   git add .
   git commit -m "Fix TypeScript errors"
   git push origin main
   ```

---

### Problem 3: Database Connection Failed

**Error:**
```
❌ FAILED TO CONNECT TO DATABASE
ECONNREFUSED localhost:3306
```

**Cause:** Using localhost database URL in production

**Fix for SQLite (File-based):**
```typescript
// ✅ CORRECT - Works everywhere
import Database from 'better-sqlite3';
const db = new Database('data/app.db');
```

**Fix for PostgreSQL/MySQL:**
```typescript
// ✅ CORRECT - Use environment variable
const dbUrl = process.env.DATABASE_URL || 'mysql://localhost:3306/mydb';
```

Add `DATABASE_URL` in Render dashboard environment variables.

---

### Problem 4: 404 Not Found on Routes

**Error:** Frontend loads but API calls return 404

**Cause:** Missing API routes or incorrect base path

**Fix:**
```typescript
// Ensure API routes are registered
app.use('/api', apiRouter);

// Add catch-all for frontend routes (for SPAs)
app.use('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../public/index.html'));
});
```

---

### Problem 5: Application Crashed

**Error in Render logs:**
```
npm ERR! missing script: start
```

**Cause:** Missing or incorrect start script in package.json

**Fix:**
```json
{
  "scripts": {
    "start": "node dist/server.js",
    "build": "tsc"
  }
}
```

Make sure `dist/server.js` exists after build!

---

## Other Hosting Options

### Free Tier Comparison

| Provider | Free Plan | Best For | Limitations |
|----------|-----------|----------|-------------|
| **Render** | 750 hrs/month | Full-stack apps with database | Sleeps after 15 min inactivity |
| **Vercel** | Unlimited | Static sites, Next.js, serverless | No persistent storage |
| **Netlify** | 300 build minutes | Static sites, JAMstack | No backend server |
| **Railway** | $5 free credit/month | PostgreSQL included | Limited free tier |
| **Fly.io** | 3 VMs free | Global deployment | More complex setup |
| **Heroku** | No longer free | N/A | Must pay now |

### Quick Setup for Each

#### Vercel (for Next.js/React/Static)
```bash
npm install -g vercel
vercel login
vercel
```

#### Netlify (for Static Sites)
```bash
npm install -g netlify-cli
netlify login
netlify deploy
```

#### Railway (with PostgreSQL)
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

---

## Production Best Practices

### 1. Environment Variables
Never commit secrets! Use environment variables:

**.env (local - NOT committed):**
```env
DATABASE_URL=mysql://localhost:3306/mydb
API_KEY=abc123
PORT=3000
```

**Production (set in hosting dashboard):**
```
DATABASE_URL=mysql://prod-server:3306/mydb
API_KEY=xyz789
```

### 2. Logging
Use proper logging instead of console.log:

```typescript
// ❌ Basic
console.log('User logged in');

// ✅ Better
import winston from 'winston';
logger.info('User logged in', { userId: 123 });
```

### 3. Error Handling
```typescript
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal Server Error' 
      : err.message 
  });
});
```

### 4. Health Checks
```typescript
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});
```

### 5. CORS Configuration
```typescript
import cors from 'cors';

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? 'https://your-frontend.com'
    : 'http://localhost:3000'
}));
```

---

## Quick Reference Commands

### Local Development
```bash
npm install          # Install dependencies
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Start production server
```

### Git Workflow
```bash
git status           # Check what changed
git add .            # Stage all changes
git commit -m "msg"  # Commit with message
git push origin main # Push to GitHub
```

### Debugging
```bash
# Check if TypeScript compiles
npm run build

# Check if production server starts
npm start

# View recent commits
git log --oneline -5

# View differences
git diff
```

---

## Summary: The Deployment Checklist

Before every deployment, verify:

- [ ] Code compiles: `npm run build` succeeds
- [ ] Server binds to `0.0.0.0`
- [ ] PORT comes from `process.env.PORT`
- [ ] No secrets in code (use environment variables)
- [ ] .gitignore excludes node_modules, dist, .env
- [ ] package.json has "start" and "build" scripts
- [ ] Code is pushed to GitHub
- [ ] Environment variables set in hosting dashboard
- [ ] Tested locally: `npm start` works

If all checkboxes are ✅, you're ready to deploy!

---

## Need Help?

Common resources:
- Render Docs: https://render.com/docs
- Vercel Docs: https://vercel.com/docs
- Node.js Best Practices: https://github.com/goldbergyoni/nodebestpractices

Happy deploying! 🚀
