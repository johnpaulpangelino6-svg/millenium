# 🚀 Deployment & Data Persistence Setup

## 📋 Quick Summary

**Current Status:**
- ✅ Database: SQLite (file-based)
- ✅ Local: Data persists permanently
- ⚠️ Render: Needs persistent disk setup
- ✅ Multi-user: Already supported

---

## 🔧 Step-by-Step: Configure Render for Data Persistence

### Step 1: Add Persistent Disk to Render

1. **Login to Render Dashboard**
   - Go to: https://dashboard.render.com
   - Find your service: `millenium`

2. **Navigate to Settings**
   - Click on your service
   - Go to **Settings** tab

3. **Add Persistent Disk**
   - Scroll down to **Disks** section
   - Click **+ Add Disk** button

4. **Configure Disk**
   ```
   Name: millennium-data
   Mount Path: /app/data
   Size: 1 GB
   ```

5. **Save Changes**
   - Click **Save**
   - Render will automatically redeploy

### Step 2: Verify Deployment

After redeploy completes (~2-3 minutes):

1. Open your app: https://millenium.onrender.com
2. Login or register a user
3. Add some data (device, ticket, etc.)
4. Restart the service (Settings → Manual Deploy → Deploy latest commit)
5. Check if data is still there ✅

---

## 📊 How Multi-User Works

### Current Setup (Already Working!)

**All users connect to the same database:**

```
User A (Browser) ──┐
                   ├──> Server ──> data/millennium.db
User B (Browser) ──┘
```

**What this means:**
- ✅ User A registers → User B can see them (if admin)
- ✅ User A adds device → All users see it
- ✅ User B adds ticket → All users see it
- ✅ Real-time sharing (on page refresh)

### Test Multi-User

**Computer 1:**
```
1. Go to: https://millenium.onrender.com
2. Register: admin / Admin@2026!
3. Add a device
```

**Computer 2 (or phone):**
```
1. Go to: https://millenium.onrender.com
2. Register: tech1 / password
3. Login
4. Should see the device from Computer 1
```

---

## 🗄️ Database Location

### Local Development
```
Location: c:\xampp\htdocs\millenium-smartboard-main\data\millennium.db
Access: Direct file access
Persistence: Permanent (on your hard drive)
```

### Render Production (With Persistent Disk)
```
Location: /app/data/millennium.db
Access: Via mounted disk
Persistence: Permanent (survives restarts)
```

### Render Production (Without Persistent Disk)
```
Location: /app/data/millennium.db
Access: Ephemeral container filesystem
Persistence: TEMPORARY (resets on restart) ❌
```

---

## ✅ Data Saving Confirmation

All these operations **automatically save** to database:

### User Operations
- ✅ Register new user → Saved
- ✅ Login → Session tracked
- ✅ Update profile → Saved

### Device Operations
- ✅ Add device → Saved
- ✅ Update device status → Saved
- ✅ Delete device → Removed

### Ticket Operations
- ✅ Create ticket → Saved
- ✅ Update ticket → Saved
- ✅ Add comment → Saved

### Inventory Operations
- ✅ Add part → Saved
- ✅ Update stock → Saved
- ✅ Use part → Stock updated

---

## 🔍 Verify Data is Saving

### Method 1: Check in App
```
1. Login to app
2. Add a device
3. Logout
4. Login again
5. Check if device is still there ✅
```

### Method 2: Check Database File
```powershell
# Check file size (should grow when adding data)
Get-Item data/millennium.db | Select-Object Length, LastWriteTime

# Before: 126976 bytes
# After adding data: Should be larger
```

### Method 3: Test API Directly
```javascript
// In browser console
fetch('https://millenium.onrender.com/api/devices')
  .then(r => r.json())
  .then(data => console.log('Devices:', data));
```

---

## 🎯 Common Scenarios

### Scenario 1: Data Disappears After Restart
**Cause:** No persistent disk configured on Render  
**Fix:** Add persistent disk (see Step 1 above)

### Scenario 2: Other Users Can't See My Data
**Cause:** You're on localhost, they're on production (or vice versa)  
**Fix:** Both use same URL (https://millenium.onrender.com)

### Scenario 3: Local Data Doesn't Appear on Production
**Cause:** Local and production are separate databases  
**Fix:** This is normal! Export/import if you need to migrate data

### Scenario 4: User Registers But Can't Login
**Cause:** Password hash mismatch or database not initialized  
**Fix:** Ensure database is seeded: `npm run db:seed`

---

## 📁 Files Modified

### 1. `src/server.ts`
```typescript
// Added schema initialization on startup
db.initSchema();
console.log('✅ Database schema initialized.');
```

### 2. `package.json`
```json
{
  "scripts": {
    "build": "tsc",
    "postbuild": "echo 'Build complete'"
  }
}
```

### 3. `render.yaml` (New File)
```yaml
disk:
  name: millennium-data
  mountPath: /app/data
  sizeGB: 1
```

---

## 🚀 Deployment Checklist

Before deploying to production:

- [ ] Persistent disk configured on Render
- [ ] Build command: `npm install && npm run build`
- [ ] Start command: `npm start`
- [ ] Environment variable: `NODE_ENV=production`
- [ ] Database seeded: `npm run db:seed` (run once)
- [ ] Test multi-user access
- [ ] Verify data persists after restart

---

## 📞 Testing Guide

### Test 1: Single User Persistence
```
1. Register user
2. Add 3 devices
3. Logout
4. Login again
5. ✅ Should see 3 devices
```

### Test 2: Multi-User Sharing
```
User A:
1. Login as admin
2. Add device "Device A"

User B:
1. Login as technician
2. ✅ Should see "Device A"
```

### Test 3: Data Survives Restart
```
1. Add data
2. Manually redeploy on Render
3. Wait for deploy to complete
4. Check app
5. ✅ Data should still be there
```

---

## 🔗 Quick Links

- **Local App**: http://localhost:3000
- **Production App**: https://millenium.onrender.com
- **Render Dashboard**: https://dashboard.render.com
- **GitHub Repo**: https://github.com/johnpaulpangelino6-svg/millenium

---

## ✅ Current Status

| Feature | Status | Notes |
|---------|--------|-------|
| Local Database | ✅ Working | Data persists on your computer |
| Multi-User Support | ✅ Working | All users share same database |
| Data Saving | ✅ Working | All operations save automatically |
| Render Persistence | ⏳ Setup Required | Need to add persistent disk |
| User Registration | ✅ Working | Creates account in database |
| User Login | ✅ Working | Validates against database |

---

## 🎯 Next Steps

### Option A: Quick Fix (Recommended)
1. Add persistent disk to Render (5 minutes)
2. Redeploy
3. ✅ Done! Data persists forever

### Option B: Advanced (Better Long-Term)
1. Switch from SQLite to PostgreSQL
2. Better for production
3. Automatic backups
4. Better concurrent access

**Which option do you prefer?**

---

**Need Help?** 
- Check database file size to verify data is saving
- Test with 2 browsers to verify multi-user
- Check Render logs if deployment fails
