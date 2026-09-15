# 📋 Customer Assignment Feature Guide

## Overview
When registering a new Millennium SmartBoard, you can now **select from all existing customers/organizations** in a dropdown menu, making it easy to assign devices to their accounts.

## ✨ Features Implemented

### 1. **Customer Dropdown Population**
- When you click **"Register Millennium Board"**, the system automatically loads ALL customers from the database
- Customers are organized into two groups:
  - 🏫 **Schools & Universities**
  - 🏢 **Corporate Clients**
- Each entry shows: Organization Name + City location

### 2. **Smart Auto-Fill**
When you select a customer from the dropdown:
- ✅ **Client Type** automatically fills (School or Corporate)
- ✅ **City** automatically fills based on customer's registered location
- ✅ Visual confirmation toast appears showing selected customer

### 3. **Add New Customer Option**
- If the customer isn't in the list, select **"➕ Register New Customer Organization..."**
- A text input will appear to enter the new customer name
- The system will create the customer record automatically during device registration

## 🎯 How to Use

### Step 1: Open Device Registration
1. Login as **Admin** (Technicians have read-only access)
2. Navigate to **"Device Fleet"** tab
3. Click **"➕ Register Millennium Board"** button

### Step 2: Select Customer
1. Choose **Model** (86", 75", or 65")
2. Choose **Client Type** (School or Corporate)
3. In the **"Customer / Institution Organization"** dropdown:
   - You'll see ALL registered customers grouped by type
   - The dropdown shows total count: `(10 Available)` for example
   - Select the customer you want to assign the device to

### Step 3: Complete Registration
1. Fill in **Room / Location** (e.g., "Lecture Hall 1A")
2. Fill in **City** (auto-filled if customer exists)
3. Click **"Save & Issue Warranty"**

## 📊 Available Customers (From Seed Data)

### Schools (6):
1. ABC University - Quezon City
2. XYZ International School - Taguig (BGC)
3. Ateneo Innovation Hub - Quezon City
4. De La Salle University - Manila
5. University of Santo Tomas - Manila
6. University of the Philippines Diliman - Quezon City

### Corporate (4):
1. Ayala Land Headquarters - Makati
2. San Miguel Corporation - Mandaluyong
3. BDO Unibank Corporate Center - Pasig (Ortigas)
4. Globe Telecom Plaza - Taguig (BGC)

## 🔍 Technical Details

### API Endpoints Used:
- **GET** `/api/customers` - Fetches all customer organizations
- **POST** `/api/devices` - Creates device and assigns to customer
- **POST** `/api/customers` - Auto-creates new customer if using custom input

### Data Flow:
```
1. User clicks "Register Board"
   ↓
2. Frontend fetches state.customers (already loaded on app init)
   ↓
3. Dropdown populated with all customers
   ↓
4. User selects customer
   ↓
5. Form auto-fills with customer data (clientType, city)
   ↓
6. Submit → Device created with customerId link
```

### Files Modified:
- `public/js/app.js` - Enhanced `openRegisterModal()` and `handleRegCustomerSelectChange()`
- `public/index.html` - Improved modal UI with helper text

## 💡 Tips

1. **All customers load automatically** when the app starts (in `fetchAllData()`)
2. **Grouped optgroups** make it easy to find schools vs corporate clients
3. **City information** appears next to each customer name for easy identification
4. **Real-time feedback** via toast notifications confirms your selection

## 🚀 Testing the Feature

1. Start your MySQL server (XAMPP)
2. Run the seed script: `npm run db:seed`
3. Start the dev server: `npm run dev`
4. Open browser: `http://localhost:3000`
5. Login as **admin** / **Admin@2026!**
6. Go to **Device Fleet** → Click **Register Millennium Board**
7. Open the **Customer dropdown** and see all 10 customers!

## ✅ Success Indicators

You'll know it's working when:
- ✅ Dropdown shows `(10 Available)` or similar count
- ✅ You see optgroups for "Schools & Universities" and "Corporate Clients"
- ✅ Each customer shows their city location
- ✅ Selecting a customer shows a green toast notification
- ✅ Client Type and City auto-fill when you select a customer

---

**🎉 The feature is now fully implemented and ready to use!**
