# 🗄️ Database Persistence & Multi-User Guide

## Current Setup

**Database Type:** SQLite (File-based)  
**Location:** `data/millennium.db`  
**Size:** ~127 KB  
**Hosting:** Render.com

---

## ✅ How Data Persistence Works

### Local Development (Your Computer)
- ✅ **Database File**: `data/millennium.db` on your hard drive
- ✅ **Persistence**: Permanent (saved to disk)
- ✅ **Users**: All users share the same database file
- ✅ **New Data**: Automatically saved to file

### Web Hosting (Render.com)
- ⚠️ **Database File**: Created in container filesystem
- ⚠️ **Persistence**: **TEMPORARY** by default
- ⚠️ **Problem**: Render uses ephemeral storage - data resets on restart
- ✅ **Solution**: Use Render Persistent Disk

---

## 🚨 Current Issues

### Issue 1: Other Users Not Visible
**Cause:** Users are looking at different deployments or local vs production

**Fix:**
1. Ensure all users access the same URL: `https://millenium.onrender.com`
2. All users must register/login on the production site
3. Local development (localhost:3000) is separate from production

### Issue 2: Data Disappears After Restart
**Cause:** Render.com uses ephemeral storage - SQLite file is lost on restart

**Fix:** Configure Render Persistent Disk (see below)

---

## 🔧 Solution 1: Configure Render Persistent Disk

### Step 1: Add Persistent Disk to Render

1. Go to Render Dashboard: https://dashboard.render.com
2. Select your `millenium` service
3. Go to **Settings** tab
4. Scroll to **Disks** section
5. Click **Add Disk**

**Disk Configuration:**
```
Name: millennium-data
Mount Path: /app/data
Size: 1 GB (free tier allows up to 1GB)
```

6. Click **Save**
7. Render will redeploy your app

### Step 2: Verify Data Directory

The database will now be stored at:
```
/app/data/millennium.db
```

This location persists between deployments! 🎉

---

## 🔧 Solution 2: Use PostgreSQL (Recommended for Production)

For better production reliability, use PostgreSQL instead of SQLite.

### Why PostgreSQL?
- ✅ Built-in persistence (no ephemeral storage issues)
- ✅ Better for multi-user concurrent access
- ✅ Render provides free PostgreSQL database
- ✅ More reliable for production
- ✅ Better backup options

### How to Switch to PostgreSQL

**1. Create PostgreSQL Database on Render:**
- Go to Render Dashboard
- Click "New +" → "PostgreSQL"
- Name: `millennium-db`
- Region: Same as your web service
- Click "Create Database"

**2. Get Database URL:**
- Copy the "Internal Database URL"
- Example: `postgresql://user:pass@host:5432/dbname`

**3. Update `.env` file:**
```env
DATABASE_URL=postgresql://user:pass@host:5432/dbname
```

**4. Install PostgreSQL driver:**
```bash
npm install pg
```

**5. Update `database.ts`:**
(I can help you convert the SQLite code to PostgreSQL if needed)

---

## 🔍 How to Check if Users See Each Other

### Test Multi-User Access

**User 1 (Computer A):**
```
1. Go to: https://millenium.onrender.com
2. Register account: username1 / password1
3. Login
4. Add a device or ticket
```

**User 2 (Computer B):**
```
1. Go to: https://millenium.onrender.com
2. Register account: username2 / password2
3. Login
4. Check if you see User 1's data
```

### Expected Behavior
- ✅ Both users should see the same data
- ✅ Admin users see everything
- ✅ Technician/Customer users see role-specific data
- ✅ New data from any user appears immediately

---

## 📊 Current Data Sharing Setup

The app **already shares data** between users:

| User Role | What They See |
|-----------|---------------|
| **Admin** | All devices, tickets, users, inventory |
| **Technician** | Assigned tickets, devices, inventory |
| **Customer** | Only their organization's devices & tickets |

---

## 🔄 Data Flow

```
User Action (Browser)
    ↓
API Request (/api/devices, /api/tickets, etc.)
    ↓
Server (src/routes/api.ts)
    ↓
Database Layer (src/db/database.ts)
    ↓
SQLite File (data/millennium.db)
    ↓
Data Saved to Disk
```

---

## 🛠️ Quick Fixes

### Fix 1: Ensure Database is Seeded on Render

**Add to `package.json`:**
```json
{
  "scripts": {
    "build": "tsc && npm run db:seed",
    "start": "node dist/server.js"
  }
}
```

This ensures the database is seeded on every deployment.

### Fix 2: Add Database Init Check

**In `src/server.ts`:**
```typescript
// Initialize database on startup
db.initSchema();
console.log('  ✅ Database schema initialized');
```

This ensures tables exist even if database is new.

---

## 📝 Render.com Configuration

### Recommended Settings

**Build Command:**
```bash
npm install && npm run build
```

**Start Command:**
```bash
npm start
```

**Environment Variables:**
```
NODE_ENV=production
PORT=3000
```

**Persistent Disk:**
```
Mount Path: /app/data
Size: 1 GB
```

---

## ✅ Verification Steps

### 1. Check Database File Exists
```bash
# On Render Shell (open from dashboard)
ls -lh /app/data/
# Should show: millennium.db
```

### 2. Check Database Has Data
```bash
# Count users
sqlite3 /app/data/millennium.db "SELECT COUNT(*) FROM users;"
# Should show: 6 (or more)
```

### 3. Check API Responses
```bash
# Test from browser console
fetch('https://millenium.onrender.com/api/devices')
  .then(r => r.json())
  .then(data => console.log(data));
# Should return: array of devices
```

---

## 🎯 Current Status

✅ **Local Development**: Working perfectly  
⚠️ **Web Hosting**: Needs persistent disk configuration  
✅ **Multi-User**: Already supported (same database)  
✅ **Data Saving**: Working (SQLite transactions)  

---

## 🚀 Next Steps

### Option A: Keep SQLite + Add Persistent Disk (Easier)
1. Add persistent disk to Render service
2. Redeploy
3. Data will persist forever

### Option B: Switch to PostgreSQL (Better for Production)
1. Create PostgreSQL database on Render
2. Update code to use PostgreSQL
3. More reliable for multiple users
4. Better backup/restore options

---

## 📞 Common Questions

**Q: Why can't other users see my data?**  
A: They might be on localhost (your computer) while you're on Render. Both must use the same URL.

**Q: Why does data disappear after restart?**  
A: Render uses ephemeral storage. Add a persistent disk to fix this.

**Q: Can multiple users add data at the same time?**  
A: Yes! SQLite supports concurrent writes via WAL mode (already enabled).

**Q: How do I backup the database?**  
A: Download `/app/data/millennium.db` from Render Shell, or use PostgreSQL with automatic backups.

---

## 🔗 Useful Links

- **Render Dashboard**: https://dashboard.render.com
- **Render Persistent Disks**: https://render.com/docs/disks
- **Your App**: https://millenium.onrender.com
- **GitHub Repo**: https://github.com/johnpaulpangelino6-svg/millenium

---

**Need help?** Let me know which solution you prefer:
1. Add persistent disk (quick, keeps SQLite)
2. Switch to PostgreSQL (better long-term)
