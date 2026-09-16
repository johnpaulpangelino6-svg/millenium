# 🔐 Admin Portal Access Guide

## ✅ Admin Account Status: ACTIVE

Your admin account has been verified and the password has been reset.

---

## 👤 Admin Login Credentials

```
Username: admin
Password: admin123
Role:     Administrator (Full Access)
Email:    admin@brains.asia
```

---

## 🌐 How to Access the Admin Portal

### Option 1: Local Development
1. Make sure the server is running:
   ```bash
   npm run dev
   ```

2. Open your browser and go to:
   ```
   http://localhost:3000
   ```

3. You should see the device selection page (Desktop/Mobile)
4. Choose your layout
5. Click **Login** button
6. Enter credentials:
   - Username: `admin`
   - Password: `admin123`
7. Click **Sign In**

### Option 2: Deployed Version (Render.com)
1. Go to your deployed URL:
   ```
   https://millenium.onrender.com
   ```
   (or your specific Render URL)

2. Follow the same login steps as above

---

## 🔧 Troubleshooting

### Problem: "Invalid credentials" error

**Solution 1: Reset Password**
Run this command in your project directory:
```bash
node fix-admin.js
```

**Solution 2: Check Database**
```bash
npm run db:seed
```
This will recreate all default users.

### Problem: Can't see login page

**Check Server Status:**
```bash
# Check if server is running
netstat -ano | findstr :3000

# If not running, start it
npm run dev
```

### Problem: Login button doesn't work

**Clear Browser Cache:**
1. Press `Ctrl + Shift + Delete`
2. Clear cache and cookies
3. Refresh page (F5)

### Problem: Stuck on device selection

**Clear localStorage:**
1. Open browser console (F12)
2. Run: `localStorage.clear()`
3. Refresh page

---

## 👥 All Available User Accounts

### 1. Admin Account (Full Access)
- **Username**: `admin`
- **Password**: `admin123`
- **Role**: Administrator
- **Access**: All features (Dashboard, Devices, Tickets, Inventory, CMS, Analytics)

### 2. Technician Account (Limited Access)
- **Username**: `jsantos`
- **Password**: `tech123`
- **Role**: Technician
- **Access**: Devices, Service Tickets, Inventory

### 3. Customer Account (View Only)
- **Username**: `orgen`
- **Password**: `customer123`
- **Role**: Customer
- **Access**: Customer Portal, View Tickets, Warranty Info

---

## 🔐 Security Notes

1. **Change the default password** after first login
2. Password is stored using custom hash function (MHASH)
3. Never share admin credentials
4. Use strong passwords in production

---

## 🛠️ Additional Commands

### View All Users
```bash
node fix-admin.js
```

### Reset Database
```bash
npm run db:seed
```

### Check Server Logs
```bash
npm run dev
```

### Stop All Node Processes
```powershell
Get-Process -Name "node" | Stop-Process -Force
```

---

## 📱 Mobile Access

If you selected **Mobile** layout:
- Full-width responsive design
- Touch-friendly interface
- Simplified navigation
- All features accessible

To switch layouts:
1. Click **Layout** button in top navigation
2. Choose Desktop or Mobile
3. Login again

---

## 🚀 Quick Start Guide

1. ✅ **Server Running**: Port 3000
2. ✅ **Database Ready**: `data/millennium.db`
3. ✅ **Admin Account Active**: Username `admin`
4. ✅ **Password Verified**: `admin123`

**Next Steps:**
1. Open browser: `http://localhost:3000`
2. Select device layout (Desktop recommended)
3. Click Login
4. Enter: `admin` / `admin123`
5. Access full admin dashboard

---

## 📞 Need Help?

If you still can't access the admin portal:

1. Check if port 3000 is available
2. Make sure no firewall is blocking
3. Try different browser
4. Clear all browser data
5. Run `node fix-admin.js` again

---

**Last Updated**: Admin password reset successful  
**Status**: ✅ Ready to login
