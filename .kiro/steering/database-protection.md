---
inclusion: auto
name: database-protection
description: Protects database and user data from unauthorized modifications
---

# 🔒 DATABASE PROTECTION RULES

## ⛔ CRITICAL RULES - NEVER BREAK THESE:

### 1. **NEVER modify the database unless explicitly commanded**
   - DO NOT run `npm run db:seed` automatically
   - DO NOT create/modify users
   - DO NOT add/delete data
   - DO NOT reset the database

### 2. **ONLY modify database when user says:**
   - "add user"
   - "create user"
   - "register user"
   - "seed database"
   - "reset database"
   - "run db:seed"
   - Or any other **explicit command** about database changes

### 3. **NEVER touch these when user just types a prompt:**
   - `src/db/seed.ts`
   - `src/db/database.ts`
   - `data/millennium.db`
   - User accounts
   - Any database operations

### 4. **User registration/creation ONLY through:**
   - Web UI registration form
   - Admin panel "Create User" button
   - Explicit command from user: "create user named X"
   - Direct API calls requested by user

### 5. **Preserve existing users at all costs:**
   - NEVER delete existing users
   - NEVER overwrite user data
   - NEVER reset database without explicit permission
   - The 6 seeded users (admin, manager, jsantos, amendoza, abcuniv, ayalaland) are PERMANENT

## ✅ WHAT I CAN DO WITHOUT PERMISSION:

- Read database status
- Show user lists
- Display database information
- Answer questions about users
- Explain how to add users
- Guide user through registration process

## 🚫 WHAT I CANNOT DO WITHOUT EXPLICIT PERMISSION:

- Run `npm run db:seed`
- Create/modify/delete users
- Change user passwords
- Modify user roles
- Reset database
- Add demo users
- Seed database
- Any write operations to database

## 💡 EXAMPLES:

### ❌ BAD (Don't do this):
User: "fix the login page"
AI: *runs npm run db:seed* ❌ WRONG!

User: "update the code"
AI: *adds test users* ❌ WRONG!

User: "make changes to styling"
AI: *resets database* ❌ WRONG!

### ✅ GOOD (Do this):
User: "fix the login page"
AI: *only fixes login page code, doesn't touch database* ✅ CORRECT!

User: "update the code"
AI: *only updates requested code, leaves database alone* ✅ CORRECT!

User: "create a user named John"
AI: *creates user as requested* ✅ CORRECT!

User: "reset the database"
AI: *runs npm run db:seed as requested* ✅ CORRECT!

## 🎯 KEY PRINCIPLE:

**"If the user didn't explicitly ask for database changes, DON'T TOUCH THE DATABASE!"**

## 📋 DATABASE CHANGE COMMANDS (Only these trigger database modifications):

- "add user [name]"
- "create user [name]"
- "delete user [name]"
- "seed database"
- "reset database"
- "run db:seed"
- "initialize database"
- "add demo users"
- "register user"
- Any other **explicit** database modification command

## ✋ IF UNSURE:

When in doubt, **ASK THE USER** before making any database changes:
"Would you like me to [action] the database?"

NEVER assume the user wants database changes unless they explicitly say so.

---

**Last Updated:** September 15, 2026  
**Rule Type:** Critical - Never violate  
**Applies To:** All database and user operations
