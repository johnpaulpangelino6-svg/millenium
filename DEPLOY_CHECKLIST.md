# ✅ Deployment Checklist

## Quick Deploy to Render.com (5 Minutes)

### Step 1: Push to GitHub ⏱️ 2 minutes

```bash
# Initialize git (if not done)
git init

# Add all files
git add .

# Commit
git commit -m "Ready for deployment"

# Create GitHub repo at: https://github.com/new
# Then push:
git remote add origin https://github.com/YOUR_USERNAME/millennium-smartboard.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy to Render ⏱️ 3 minutes

1. **Go to:** https://render.com
2. **Sign up** with GitHub (free)
3. **Click:** "New +" → "Web Service"
4. **Select:** Your `millennium-smartboard` repository
5. **Configure:**
   - Name: `millennium-smartboard`
   - Environment: `Node`
   - Build Command: `npm install && npm run build && npm run db:seed`
   - Start Command: `npm start`
6. **Click:** "Create Web Service"

**Done!** Wait 3-5 minutes for deployment.

---

## ✅ Pre-Deployment Checklist

- [x] ✅ SQLite database configured
- [x] ✅ `package.json` has production scripts
- [x] ✅ `render.yaml` configuration created
- [x] ✅ `.env.example` template created
- [x] ✅ Server binds to `0.0.0.0` for production
- [x] ✅ `.gitignore` configured (no secrets)

**Everything is ready! Just push to GitHub and deploy.**

---

## 🌐 Your App Will Be Live At:

```
https://millennium-smartboard.onrender.com
```

Or your custom domain!

---

## 🔐 After Deployment

### 1. Test Login
```
URL: https://your-app.onrender.com
Username: admin
Password: Admin@2026!
```

### 2. Test Customer Assignment
1. Go to "Device Fleet"
2. Click "Register Millennium Board"
3. Open customer dropdown
4. ✅ All 10 customers should appear!

### 3. Change Default Password
For production, update admin password in `src/db/seed.ts`

---

## 💰 Cost

**Render Free Tier:**
- ✅ FREE for 750 hours/month
- ✅ Enough for 24/7 uptime
- ✅ HTTPS included
- ✅ Auto-deploy from GitHub

**Upgrade for Production ($7/mo):**
- ✅ Persistent disk (database stays after restart)
- ✅ No sleep mode
- ✅ Better performance

---

## 📱 Add Custom Domain (Optional)

1. Buy domain (e.g., Namecheap $10/year)
2. In Render Dashboard → Custom Domain
3. Add CNAME record:
   ```
   smartboard.yourdomain.com → millennium-smartboard.onrender.com
   ```
4. Wait 5-15 minutes for SSL

---

## 🆘 Troubleshooting

**Issue:** App won't start
- Check Render logs
- Verify build command succeeded
- Ensure `npm run build` works locally

**Issue:** Database resets after restart
- Render free tier has ephemeral filesystem
- Upgrade to paid plan for persistent disk
- Or migrate to PostgreSQL (free on Render)

**Issue:** Can't access app
- Check if deployment finished
- Verify URL in Render dashboard
- Check logs for errors

---

## 🎯 Quick Commands

```bash
# Test locally before deploying
npm run build
npm start

# Deploy (push to GitHub triggers auto-deploy)
git add .
git commit -m "Update"
git push

# Check deployed app
curl https://your-app.onrender.com/health
```

---

## ✅ You're Ready to Deploy!

Everything is configured. Just:
1. Push to GitHub
2. Connect to Render
3. Deploy!

**Your app will be live in 5 minutes!** 🚀
