# 🎯 Demo Account Guide - Millennium SmartBoard

## ✅ Server Status
**Server Running:** http://localhost:3000  
**Database:** SQLite (data/millennium.db)  
**Status:** ✅ All demo accounts seeded and ready

---

## 🔐 Demo Account Credentials

### 1. **Admin Account** (Full System Access)
- **Username:** `admin`
- **Password:** `Admin@2026!`
- **Access:** Dashboard, Devices, Analytics, User Management
- **Features:** Full control over all modules

### 2. **Technician Account** (Field Service)
- **Username:** `jsantos`
- **Password:** `Tech@2026!`
- **Access:** Assigned Jobs, Inventory, Service Tickets
- **Features:** Job management, parts inventory

### 3. **Customer Account** (Client Portal)
- **Username:** `abcuniv`
- **Password:** `School@2026!`
- **Access:** Your Devices, Service Status, Support
- **Features:** Track your devices, view service history

---

## 🚀 How to Use Demo Accounts

### Method 1: One-Click Demo Login (Recommended)
On the login page, you'll see three colored buttons:
1. **🏢 Admin** - Click for instant admin access
2. **🔧 Technician** - Click for technician portal
3. **🏫 Customer** - Click for customer portal

### Method 2: Manual Login
1. Go to http://localhost:3000
2. Enter username and password from above
3. Click "Sign In"

---

## 🔧 Troubleshooting

### Issue: "Demo account not connected"

**Solution 1: Restart the server**
```powershell
# Stop server (Ctrl+C)
npm run dev
```

**Solution 2: Reseed the database**
```powershell
npm run db:seed
npm run dev
```

**Solution 3: Check server is running**
```powershell
# Visit http://localhost:3000
# You should see the login page
```

### Issue: "Invalid credentials"

**Cause:** Database not seeded or password mismatch

**Fix:**
```powershell
npm run db:seed
```

### Issue: Server not starting

**Check port 3000 is available:**
```powershell
# Kill any process on port 3000
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force

# Then restart
npm run dev
```

---

## 📊 What Each Role Can See

### Admin
- ✅ Dashboard (KPIs, charts, alerts)
- ✅ Device Fleet (all devices)
- ✅ Service Tickets (all tickets)
- ✅ Inventory Management
- ✅ User Management
- ✅ Interactive Board Showcase
- ✅ Warranty Scanner
- ✅ Analytics & Reports

### Technician
- ✅ Assigned Service Jobs
- ✅ Parts Inventory
- ✅ My Tickets (assigned to them)
- ✅ Device Details
- ✅ Interactive Board Showcase
- ❌ User Management

### Customer
- ✅ My Devices (only their organization's)
- ✅ My Service Tickets
- ✅ Device Status
- ✅ Interactive Board Showcase
- ❌ All Devices
- ❌ Inventory
- ❌ User Management

---

## 🌐 Access URLs

**Local Development:**
- Frontend: http://localhost:3000
- API: http://localhost:3000/api
- Login Page: http://localhost:3000 (default)

**Production (Render.com):**
- Frontend: https://millenium.onrender.com
- API: https://millenium.onrender.com/api

---

## 🎨 Interactive Board Demo

After logging in with any account:
1. Click **"Interactive Board"** in the sidebar
2. Explore the 4K SmartBoard simulator
3. Test features:
   - 4K Display
   - Wireless Casting
   - Stylus Board
   - OPS Module
   - Camera
   - Audio

---

## 🛠️ Development Commands

```powershell
# Start development server
npm run dev

# Reseed database with demo accounts
npm run db:seed

# Build TypeScript
npm run build

# Check database status
# Database location: data/millennium.db
# Use DB Browser for SQLite to inspect
```

---

## ✅ Verification Checklist

- [ ] Server running on port 3000
- [ ] Database file exists (data/millennium.db)
- [ ] Can access http://localhost:3000
- [ ] Demo buttons visible on login page
- [ ] Admin login works (admin / Admin@2026!)
- [ ] Technician login works (jsantos / Tech@2026!)
- [ ] Customer login works (abcuniv / School@2026!)

---

## 🎯 Quick Test

Open PowerShell and run:
```powershell
# Test API health
curl http://localhost:3000/api/devices

# Should return JSON with devices list
```

---

## 📞 Need Help?

If demo accounts still don't work:
1. Check server is running: `npm run dev`
2. Reseed database: `npm run db:seed`
3. Check browser console (F12) for errors
4. Verify port 3000 is not blocked by firewall

**All demo accounts are now seeded and ready to use!** 🎉
