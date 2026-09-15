# 🚀 Quick Start Guide - Millennium SmartBoard System

## ✅ Setup Complete!

Your system is now running and ready to use!

---

## 🌐 Access the Application

**Open your browser and go to:**
```
http://localhost:3000
```

---

## 🔑 Login Credentials

### Admin Account (Full Access)
- **Username:** `admin`
- **Password:** `Admin@2026!`
- **Access:** Dashboard, Devices, Tickets, Warranty, Inventory, Data Manager, CMS, Predictive, Analytics

### Technician Account
- **Username:** `jsantos`
- **Password:** `Tech@2026!`
- **Access:** Devices (read-only), Tickets, Inventory

### Customer Account
- **Username:** `abcuniv`
- **Password:** `School@2026!`
- **Access:** Customer Portal, My Devices, Service Requests, Warranty

---

## 📋 Testing the Customer Assignment Feature

1. **Login as Admin:** Use credentials above
2. **Navigate to Device Fleet:** Click 🖥️ icon in left sidebar
3. **Click "Register Millennium Board"** button (top right)
4. **Open the Customer dropdown** - You'll see:
   - **🏫 Schools & Universities (6 customers)**
   - **🏢 Corporate Clients (4 customers)**
   - Total: 10 customers ready to assign!

### Available Customers to Test:

**Schools:**
- ABC University - Quezon City
- XYZ International School - Taguig (BGC)
- Ateneo Innovation Hub - Quezon City
- De La Salle University - Manila
- University of Santo Tomas - Manila
- University of the Philippines Diliman - Quezon City

**Corporate:**
- Ayala Land Headquarters - Makati
- San Miguel Corporation - Mandaluyong
- BDO Unibank Corporate Center - Pasig
- Globe Telecom Plaza - Taguig (BGC)

---

## 🛠️ Common Commands

### Start the Server
```bash
npm run dev
```

### Rebuild Database (Reset Everything)
```bash
npm run db:seed
```

### Install Dependencies (if needed)
```bash
npm install
```

---

## 📊 What's Included in the Database

After seeding, you have:
- ✅ **6 Users** (2 Admins, 2 Technicians, 2 Customers)
- ✅ **10 Customers** (6 Schools, 4 Corporate)
- ✅ **10 Devices** (already assigned to customers)
- ✅ **10 Warranties** (active and expired)
- ✅ **4 Service Tickets** (various statuses)
- ✅ **6 Inventory Parts** (some low stock)
- ✅ **3 CMS Content** items
- ✅ **3 Predictive Alerts** (AI-generated)
- ✅ **4 Audit Logs**

---

## 🎯 Next Steps

1. **Test the customer dropdown** - Register a new device
2. **View existing devices** - See devices already assigned to customers
3. **Check service tickets** - See maintenance workflow
4. **Explore the dashboard** - Interactive SmartBoard showcase

---

## ⚠️ Troubleshooting

### If server won't start:
1. Make sure XAMPP MySQL is running
2. Check `.env` file exists (created automatically)
3. Run `npm install` to install dependencies
4. Run `npm run db:seed` to create database

### If "Backend not working" error:
- Verify MySQL is running in XAMPP Control Panel
- Check server console for errors
- Ensure port 3000 is not in use by another app

### To stop the server:
- Press `Ctrl+C` in the terminal running `npm run dev`

---

## 📝 Important Files

- **`.env`** - Database configuration
- **`src/db/schema.sql`** - Database structure
- **`src/db/seed.ts`** - Sample data
- **`CUSTOMER_ASSIGNMENT_GUIDE.md`** - Feature documentation

---

## 🎉 You're All Set!

The Millennium SmartBoard Management System is now running with:
- ✅ Backend API running on http://localhost:3000
- ✅ MySQL database with sample data
- ✅ 10 customers ready to assign devices to
- ✅ Customer dropdown feature working perfectly!

**Enjoy using the system!** 🚀
