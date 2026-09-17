# 👥 USER SYSTEM & DATABASE GUIDE
**Millennium SmartBoard Management System**

---

## 📊 DATABASE STATUS

✅ **Database Engine:** SQLite (File-based, no MySQL/XAMPP needed)  
✅ **Database Location:** `data/millennium.db`  
✅ **Multi-User Support:** YES - All users share the same database  
✅ **Data Persistence:** YES - All data is saved to disk  

---

## 👤 SYSTEM USERS (6 USERS SEEDED)

### 1️⃣ **Admin Users** (2 users)

| Username | Password | Role | Organization |
|----------|----------|------|--------------|
| `admin` | `Admin@2026!` | Admin | Brains Infinite Innovations Inc. |
| `manager` | `Manager@2026!` | Admin | Brains Infinite Innovations Inc. |

**Permissions:** Full system access, manage all devices, users, tickets

---

### 2️⃣ **Technician Users** (2 users)

| Username | Password | Role | Organization |
|----------|----------|------|--------------|
| `jsantos` | `Tech@2026!` | Technician | Brains Infinite Innovations Inc. |
| `amendoza` | `Tech@2026!` | Technician | Brains Infinite Innovations Inc. |

**Permissions:** View devices, manage service tickets, update repairs

---

### 3️⃣ **Customer Users** (2 users)

| Username | Password | Role | Organization |
|----------|----------|------|--------------|
| `abcuniv` | `School@2026!` | Customer | ABC University |
| `ayalaland` | `Corp@2026!` | Customer | Ayala Land Inc. |

**Permissions:** View own devices, create tickets, track service status

---

## 🔐 HOW USER AUTHENTICATION WORKS

1. **User Login:** Users enter username and password on the login page
2. **Password Hashing:** Password is hashed using a custom hash function
3. **Database Check:** System queries `users` table to verify credentials
4. **Session Creation:** On success, user info is stored in browser `localStorage`
5. **Role-Based Access:** User's role determines which features they can access

---

## 🗄️ DATABASE TABLES

### **users** table
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'technician', 'customer')),
  location TEXT DEFAULT 'All Locations',
  allowed_locations TEXT DEFAULT '[]',
  organization TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
```

---

## 📍 LOCAL VS PRODUCTION DATABASE

### **LOCAL (Development)**
- **Location:** `c:\xampp\htdocs\millenium-smartboard-main\data\millennium.db`
- **Users:** Any users you create locally (4 users: admin, orgen, hello, manager)
- **Purpose:** Testing and development

### **PRODUCTION (Render.com)**
- **Location:** `/app/data/millennium.db` (on Render server)
- **Users:** 6 seeded users (admin, manager, jsantos, amendoza, abcuniv, ayalaland)
- **Purpose:** Live webhost for real use

> **⚠️ IMPORTANT:** Local and production databases are **SEPARATE**. Users created locally will NOT appear in production automatically. They must register via the production website UI.

---

## ➕ HOW TO ADD NEW USERS

### **Option 1: Register via Web UI** (Recommended)
1. Go to the login page
2. Click "Register" or "Create Account"
3. Fill in the registration form
4. New user is added to the database

### **Option 2: Admin Panel** (Admin only)
1. Login as `admin` / `Admin@2026!`
2. Go to User Management
3. Click "Add New User"
4. Fill in user details and save

### **Option 3: Run Seed Script** (Reset to defaults)
```powershell
npm run db:seed
```
This resets the database to 6 default users.

---

## 🔍 HOW TO VIEW ALL USERS

### **Option 1: Via Web UI**
1. Login as admin
2. Go to **User Management** page
3. View list of all registered users

### **Option 2: Via API**
```http
GET /api/auth/users
```
Returns JSON array of all users (without passwords)

### **Option 3: Direct Database Query**
```powershell
# Install SQLite viewer (optional)
npm install -g sqlite3

# Query users
sqlite3 data/millennium.db "SELECT * FROM users;"
```

---

## 🛠️ TROUBLESHOOTING

### ❌ Problem: "User not found" or "Invalid credentials"
**Solution:** Run `npm run db:seed` to reset users to default

### ❌ Problem: "Local users not showing in production"
**Solution:** This is normal! Local and production have separate databases. Users must register on production via the web UI.

### ❌ Problem: "Database file not found"
**Solution:** 
```powershell
npm run db:seed
```
This creates the database file and seeds users.

### ❌ Problem: "Can't see new users I created"
**Solution:** 
1. Check you're logged into the correct database (local vs production)
2. Refresh the page
3. Logout and login again

---

## 🚀 PRODUCTION DEPLOYMENT

When you push code to GitHub:
1. **Auto-sync** pushes code to GitHub
2. **Render.com** detects changes and auto-deploys
3. **Production database** at `/app/data/millennium.db` persists all data
4. **Users register** via production web UI at https://millenium.onrender.com

---

## 📝 USER REGISTRATION FLOW

```
User visits website
     ↓
Clicks "Register"
     ↓
Fills in registration form
     ↓
System validates input
     ↓
Password is hashed
     ↓
User is saved to database
     ↓
Auto-login after registration
     ↓
User can access the system
```

---

## 🔒 SECURITY NOTES

- ✅ Passwords are **never stored in plain text**
- ✅ All passwords are **hashed** using custom hash function
- ✅ Password hash is stored in `password_hash` column
- ✅ API endpoints do NOT return `password_hash` to clients
- ✅ SQLite database file has file-system permissions

---

## 📞 ADMIN SUPPORT

**Default Admin Login:**
- Username: `admin`
- Password: `Admin@2026!`

**Full Admin Access:**
- Manage all users
- Manage all devices
- Manage all tickets
- View all customers
- System configuration

---

## ✅ QUICK REFERENCE

| Task | Command |
|------|---------|
| Reset database to defaults | `npm run db:seed` |
| Start development server | `npm run dev` |
| Push updates to GitHub | Double-click `sync.bat` |
| View database location | Console log on server start |
| Login as admin | `admin` / `Admin@2026!` |

---

**Last Updated:** September 15, 2026  
**System:** Millennium SmartBoard Management System  
**Company:** Brains Infinite Innovations Inc.
