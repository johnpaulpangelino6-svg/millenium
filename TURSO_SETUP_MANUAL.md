# 🚀 TURSO CLOUD DATABASE - MANUAL SETUP GUIDE
**Step-by-Step Instructions to Set Up Real-Time Database**

---

## 📋 **WHAT YOU'LL DO:**

1. Create Turso account (2 minutes)
2. Create database (1 minute)
3. Get connection details (1 minute)
4. Update your project (2 minutes)
5. Deploy and test (2 minutes)

**Total Time: ~10 minutes**

---

## 🌐 **STEP 1: CREATE TURSO ACCOUNT**

### **Option A: Sign up with GitHub** ⭐ (Easiest)

1. Visit: **https://turso.tech**
2. Click **"Sign Up"** or **"Get Started"**
3. Click **"Continue with GitHub"**
4. Authorize Turso
5. Done! You're logged in ✅

### **Option B: Sign up with Email**

1. Visit: **https://turso.tech**
2. Click **"Sign Up"**
3. Enter your email
4. Verify email
5. Done! ✅

---

## 💾 **STEP 2: CREATE DATABASE**

### **Web Dashboard Method** (Recommended):

1. **Go to Dashboard:**
   - Visit: https://turso.tech/app
   - You should see "Databases" page

2. **Create New Database:**
   - Click **"Create Database"** button
   - Database name: `millennium-smartboard`
   - Region: Choose closest to you (e.g., "US East")
   - Click **"Create"**

3. **Wait for Creation:**
   - Takes ~10 seconds
   - You'll see green checkmark when ready ✅

---

## 🔑 **STEP 3: GET CONNECTION DETAILS**

### **3A: Get Database URL**

1. Click on your database name: `millennium-smartboard`
2. Look for **"URL"** section
3. Copy the URL (looks like):
   ```
   libsql://millennium-smartboard-yourname.turso.io
   ```
4. **Save this URL** - you'll need it!

### **3B: Create Auth Token**

1. Still on database page, find **"Authentication Tokens"** section
2. Click **"Create Token"** button
3. Name: `production` (or any name)
4. Click **"Create"**
5. **COPY THE TOKEN IMMEDIATELY!**
   ```
   eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...
   ```
6. **⚠️ IMPORTANT:** You can only see this token ONCE!
7. **Save it somewhere safe** (notepad, password manager)

---

## 📝 **STEP 4: UPDATE YOUR PROJECT**

### **4A: Update `.env` File**

Open: `c:\xampp\htdocs\millenium-smartboard-main\.env`

Replace the content with:

```env
# Millennium SmartBoard Management System

PORT=3000
NODE_ENV=development

# Real-time Cloud Database (Turso)
DATABASE_URL=libsql://millennium-smartboard-yourname.turso.io
DATABASE_AUTH_TOKEN=eyJhbGc...your-full-token-here
```

**Replace:**
- `millennium-smartboard-yourname.turso.io` with YOUR actual URL
- `eyJhbGc...` with YOUR actual token

**Save the file!**

### **4B: Update Render.com Environment**

1. **Go to Render Dashboard:**
   - Visit: https://dashboard.render.com
   - Login if needed

2. **Select Your Service:**
   - Click on: `millenium` (your web service)

3. **Add Environment Variables:**
   - Click **"Environment"** in left sidebar
   - Click **"Add Environment Variable"**
   
4. **Add First Variable:**
   ```
   Key: DATABASE_URL
   Value: libsql://millennium-smartboard-yourname.turso.io
   ```
   - Click **"Add"**

5. **Add Second Variable:**
   ```
   Key: DATABASE_AUTH_TOKEN
   Value: eyJhbGc...your-full-token-here
   ```
   - Click **"Add"**

6. **Save Changes:**
   - Click **"Save Changes"** at bottom
   - Render will automatically redeploy (takes 2-3 minutes)

---

## 🎯 **STEP 5: INITIALIZE DATABASE**

### **5A: Install Dependencies**

```powershell
cd c:\xampp\htdocs\millenium-smartboard-main
npm install
```

### **5B: Seed Database**

```powershell
npm run db:seed
```

**You should see:**
```
🌐 External Database: CONNECTING to libsql://millennium-smartboard-***.turso.io
  ☁️ Mode: Cloud Synchronized
🌱 Millennium SmartBoard — SQLite Seed Script
============================================
📦 Initializing database schema...
  ✅ SQLite schema initialized.
👤 Seeding users...
   ✅ 6 users seeded.
...
```

---

## ✅ **STEP 6: TEST IT WORKS**

### **6A: Test Local**

```powershell
npm run dev
```

**Expected Console Output:**
```
🌐 External Database: CONNECTING to libsql://millennium-smartboard-***.turso.io
  ☁️ Mode: Cloud Synchronized (Shared between localhost and web hosting)
  ✅ Database connection successful.
================================================================
  🌟 MILLENNIUM SMARTBOARD MANAGEMENT SYSTEM
================================================================
  🗄️  Database Engine:   External Cloud Database (Turso / LibSQL)
  ☁️  Cloud Sync:        ✅ Real-time sync with Web Hosting
```

### **6B: Test Registration**

1. Visit: http://localhost:3000
2. Click "Register"
3. Create new user:
   - Username: `testuser`
   - Email: `test@example.com`
   - Password: `Test@2026!`
   - Role: customer
   - Location: Manila
4. Click Register
5. **Success!** ✅

### **6C: Verify on Production**

1. Wait 2-3 minutes for Render deployment
2. Visit: https://millenium.onrender.com
3. Login as admin: `admin` / `Admin@2026!`
4. Go to User Management
5. **You should see `testuser`!** ✅

### **6D: Test Production → Local**

1. On production (https://millenium.onrender.com)
2. Register another user: `produser`
3. Go back to local: http://localhost:3000
4. Check user list
5. **`produser` should appear!** ✅

---

## 🎉 **SUCCESS! YOU'RE DONE!**

### **What You Now Have:**

✅ **Real-time cloud database** - Turso  
✅ **Instant sync** - Local ↔ Production  
✅ **Never lose data** - Even if webhost restarts  
✅ **Single source of truth** - One database for everything  
✅ **Free forever** - Turso free tier  

### **From Now On:**

- Register user anywhere → Appears everywhere instantly
- All data saved to cloud → Never lost
- Restart webhost → Data persists
- No more separate databases!

---

## 🔍 **VERIFICATION CHECKLIST:**

- [ ] `.env` has `DATABASE_URL` and `DATABASE_AUTH_TOKEN`
- [ ] Render environment variables added
- [ ] `npm run db:seed` succeeded
- [ ] Local shows "Cloud Synchronized" message
- [ ] Production deployed successfully
- [ ] Register user locally → Appears on production
- [ ] Register user on production → Appears locally
- [ ] 6 default users visible everywhere

---

## 🆘 **TROUBLESHOOTING:**

### ❌ "Failed to connect to database"

**Check:**
1. DATABASE_URL is correct (starts with `libsql://`)
2. DATABASE_AUTH_TOKEN is not empty
3. No extra spaces in .env file
4. Token is valid (not expired)

**Fix:**
```powershell
# Verify .env file
cat .env

# Should show:
# DATABASE_URL=libsql://...
# DATABASE_AUTH_TOKEN=eyJh...
```

### ❌ "Permission denied"

**Fix:**
1. Go to Turso dashboard
2. Click database → "Authentication Tokens"
3. Create new token
4. Copy and update .env + Render environment

### ❌ "Data not syncing"

**Check:**
1. Both local and production have SAME DATABASE_URL
2. Render environment variables saved
3. Render deployed successfully
4. Both servers restarted

**Fix:**
```powershell
# Restart local
Ctrl+C
npm run dev

# Redeploy production
# Go to Render → Manual Deploy → "Deploy latest commit"
```

### ❌ "User not found" after seeding

**This is normal!**
- Seed script only runs once
- If you already ran it before, users already exist
- Try registering a NEW user to test

---

## 📊 **VIEW YOUR DATA:**

### **Turso Dashboard:**
1. Go to: https://turso.tech/app
2. Click your database: `millennium-smartboard`
3. Click "SQL Editor"
4. Run query:
   ```sql
   SELECT * FROM users;
   ```
5. See all your users! ✅

---

## 💰 **TURSO FREE TIER:**

Your free tier includes:
- ✅ 500 databases
- ✅ 1 GB storage per database
- ✅ Unlimited reads
- ✅ 1 million rows written/month
- ✅ More than enough! 🎉

---

## 📚 **QUICK REFERENCE:**

### **Your Connection Details:**
```
Database URL: libsql://millennium-smartboard-yourname.turso.io
Auth Token: (stored in .env and Render)
Dashboard: https://turso.tech/app
```

### **Commands:**
```powershell
# Seed database (first time only)
npm run db:seed

# Start local server
npm run dev

# Push changes to production
npm run sync
```

### **URLs:**
```
Local: http://localhost:3000
Production: https://millenium.onrender.com
Turso Dashboard: https://turso.tech/app
Render Dashboard: https://dashboard.render.com
```

---

## ✅ **NEXT STEPS:**

1. Follow all steps above
2. Test registration works
3. Verify data syncs
4. Start using your app!

**Your data is now safe in the cloud forever!** ☁️💾

---

**Need Help?** 
- Check troubleshooting section above
- Visit Turso docs: https://docs.turso.tech
- Ask me any questions!

**Last Updated:** September 15, 2026  
**Setup Time:** ~10 minutes  
**Difficulty:** Easy  
**Cost:** FREE ✅
