# 🚀 QUICK START GUIDE
**Millennium SmartBoard Management System**

---

## ⚡ FASTEST WAY TO GET STARTED

### **1. Login to Your System** 🔐
```
Username: admin
Password: Admin@2026!
```
**URL (Local):** http://localhost:3000  
**URL (Production):** https://millenium.onrender.com

---

## 📋 DAILY WORKFLOW

### **When You Make Code Changes:**

**Option A - One Click** ⭐ (Recommended)
```
1. Double-click: sync.bat
2. Wait 2-3 minutes
3. Done! Webhost updated ✅
```

**Option B - Terminal Command**
```powershell
npm run sync
```

**Option C - Automatic Mode** (No clicks needed!)
```powershell
npm run auto-watch
# Saves and pushes automatically when you edit files
# Press Ctrl+C to stop
```

---

## 👥 ALL SYSTEM USERS

| Username | Password | Role | Organization |
|----------|----------|------|--------------|
| `admin` | `Admin@2026!` | 🔴 Admin | Brains Infinite Innovations |
| `manager` | `Manager@2026!` | 🔴 Admin | Brains Infinite Innovations |
| `jsantos` | `Tech@2026!` | 🟢 Technician | Brains Infinite Innovations |
| `amendoza` | `Tech@2026!` | 🟢 Technician | Brains Infinite Innovations |
| `abcuniv` | `School@2026!` | 🟡 Customer | ABC University |
| `ayalaland` | `Corp@2026!` | 🟡 Customer | Ayala Land Inc. |

---

## 🛠️ COMMON COMMANDS

```powershell
# Start development server
npm run dev

# Push updates to webhost
npm run sync

# Auto-watch and sync on file changes
npm run auto-watch

# Reset database (back to 6 default users)
npm run db:seed

# Build for production
npm run build
```

---

## 🔍 CHECK SYSTEM STATUS

### **View All Users in Database**
1. Start server: `npm run dev`
2. Visit: http://localhost:3000/check-database.html
3. See all users, roles, and database status

### **Check Git Status**
```powershell
git status
git log --oneline -5
```

### **Check Webhost Deployment**
- Visit: https://dashboard.render.com
- Check latest deployment status
- View logs if needed

---

## 📁 DATABASE LOCATIONS

**Local (Development):**
```
c:\xampp\htdocs\millenium-smartboard-main\data\millennium.db
```

**Production (Webhost):**
```
/app/data/millennium.db (on Render.com server)
```

> **Note:** These are SEPARATE databases. Users created locally don't automatically appear in production.

---

## 🆘 TROUBLESHOOTING

### ❌ "Cannot login" or "Invalid credentials"
**Solution:**
```powershell
npm run db:seed
```
This resets database to 6 default users.

### ❌ "Database not found"
**Solution:**
```powershell
npm run db:seed
```

### ❌ "Webhost not updating"
**Solution:**
1. Check you pushed to GitHub: `git status`
2. Check Render.com dashboard for deployment status
3. Wait 2-3 minutes for deployment
4. Clear browser cache and refresh

### ❌ "Auto-sync not working"
**Solution:**
```powershell
# Manual sync
npm run sync

# Or just push manually
git add .
git commit -m "Update code"
git push origin main
```

---

## 🎯 KEY FEATURES

✅ **Multi-User System** - 3 roles (Admin, Technician, Customer)  
✅ **Persistent Database** - SQLite file-based, never loses data  
✅ **Auto-Sync to Webhost** - 3 easy methods to deploy  
✅ **Real-Time Updates** - Changes deploy in 2-3 minutes  
✅ **Complete Documentation** - All guides included  
✅ **Database Checker** - Visual tool to see all users  

---

## 📚 DETAILED DOCUMENTATION

| Document | What It Contains |
|----------|------------------|
| `SYSTEM_STATUS.md` | Complete system overview and verification |
| `USER_SYSTEM_GUIDE.md` | User authentication and database details |
| `GIT_GUIDE.md` | Git commands and workflow |
| `README.md` | Project overview and setup |
| `QUICK_START.md` | This file - quick reference |

---

## 🌐 IMPORTANT LINKS

| Resource | URL |
|----------|-----|
| **Local Development** | http://localhost:3000 |
| **Production Webhost** | https://millenium.onrender.com |
| **Database Checker** | http://localhost:3000/check-database.html |
| **GitHub Repository** | https://github.com/johnpaulpangelino6-svg/millenium.git |
| **Render Dashboard** | https://dashboard.render.com |

---

## ⚙️ AUTO-SYNC FILES

| File | Purpose |
|------|---------|
| `sync.bat` | Double-click to sync (Windows) |
| `auto-sync.ps1` | PowerShell script for git operations |
| `auto-watch.js` | Auto-watches files and syncs on changes |

---

## 💡 PRO TIPS

1. **Use auto-watch during development**
   ```powershell
   npm run auto-watch
   ```
   This saves you from manual git commands!

2. **Check database status regularly**
   - Visit: http://localhost:3000/check-database.html

3. **Keep admin credentials safe**
   - Username: `admin`
   - Password: `Admin@2026!`

4. **Monitor Render.com deployments**
   - Check dashboard after each push
   - View logs if deployment fails

5. **Clear browser cache after updates**
   - Press `Ctrl + F5` to hard refresh

---

## 🎉 YOU'RE READY!

Everything is set up and working. Just remember:

1. **Make changes** to your code
2. **Run sync** (double-click `sync.bat` or `npm run sync`)
3. **Wait 2-3 minutes** for deployment
4. **Visit webhost** to see your changes live!

---

**Last Updated:** September 15, 2026  
**System Status:** 🟢 All systems operational  
**Latest Commit:** `64d8f41`  
**Webhost:** https://millenium.onrender.com  
**Support:** Brains Infinite Innovations Inc.
