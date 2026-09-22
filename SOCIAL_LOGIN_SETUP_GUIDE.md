# 🔐 Social Login Setup Guide

## ✅ What's Already Implemented

Your app now has beautiful social login buttons for:
- 🔵 **Google** - Continue with Google
- 🔷 **Facebook** - Continue with Facebook  
- ⚫ **Apple** - Continue with Apple

### Current Status:
- ✅ UI/UX fully implemented and styled
- ✅ Buttons appear in both Login and Register forms
- ✅ Responsive design for mobile
- ✅ Dark/Light theme support
- ✅ Loading states and animations
- ⏳ OAuth integration ready to connect

---

## 🎨 What You Can See Now

1. **Restart your server:**
   ```powershell
   npm start
   ```

2. **Open the app:**
   ```
   http://localhost:3000/public/
   ```

3. **Click "Login" button** → You'll see:
   - Email/Password form
   - **"Or continue with"** divider
   - 3 beautiful social login buttons
   - Demo access buttons

4. **Click any social button:**
   - Shows "Coming soon" message
   - Button enters loading state
   - Ready for OAuth integration

---

## 🔧 How to Connect Real OAuth

### 1️⃣ Google OAuth Setup

**Step 1: Get Google Client ID**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable "Google+ API"
4. Go to "Credentials" → "Create Credentials" → "OAuth client ID"
5. Choose "Web application"
6. Add authorized JavaScript origins:
   ```
   http://localhost:3000
   https://yourdomain.com
   ```
7. Add authorized redirect URIs:
   ```
   http://localhost:3000/auth/google/callback
   https://yourdomain.com/auth/google/callback
   ```
8. Copy your **Client ID**

**Step 2: Add Google Script to HTML**

Add before closing `</body>` tag in `index.html`:

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

**Step 3: Update `.env` file**

```env
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

**Step 4: Update JavaScript**

Replace the Google section in `handleSocialLogin()`:

```javascript
if (provider === 'google') {
  google.accounts.id.initialize({
    client_id: 'YOUR_GOOGLE_CLIENT_ID',
    callback: async (response) => {
      // Send token to backend for verification
      const res = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: response.credential }),
      });
      const data = await res.json();
      if (data.success) {
        saveAuthSession(data.user);
        closeAuthModal();
        fetchAllData();
        showToast('Welcome! Logged in with Google 🎉', 'success');
      }
    }
  });
  
  google.accounts.id.prompt();
}
```

**Step 5: Backend Endpoint**

Add to `src/routes/api.ts`:

```typescript
// POST /api/auth/google
apiRouter.post('/auth/google', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    
    // Verify token with Google
    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;
    
    // Check if user exists
    let user = await db.getUserByEmail(email);
    
    if (!user) {
      // Create new user
      const result = await db.registerUser({
        username: email.split('@')[0],
        email: email,
        password: 'GOOGLE_AUTH_' + Math.random().toString(36),
        fullName: name,
        role: 'customer',
        location: 'Metro Manila',
        organization: name + "'s Organization",
      });
      user = result.user;
    }
    
    res.json({ success: true, user });
  } catch (error: any) {
    res.status(401).json({ success: false, error: 'Invalid Google token' });
  }
});
```

**Install required package:**
```bash
npm install google-auth-library
```

---

### 2️⃣ Facebook Login Setup

**Step 1: Get Facebook App ID**

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app → "Consumer" type
3. Add "Facebook Login" product
4. Go to Settings → Basic
5. Copy your **App ID**
6. Add your website URL

**Step 2: Add Facebook SDK**

Add before closing `</body>` in `index.html`:

```html
<script>
  window.fbAsyncInit = function() {
    FB.init({
      appId: 'YOUR_FACEBOOK_APP_ID',
      cookie: true,
      xfbml: true,
      version: 'v18.0'
    });
  };
</script>
<script async defer crossorigin="anonymous" 
  src="https://connect.facebook.net/en_US/sdk.js"></script>
```

**Step 3: Update JavaScript**

```javascript
if (provider === 'facebook') {
  FB.login((response) => {
    if (response.authResponse) {
      FB.api('/me', { fields: 'name,email,picture' }, async (userData) => {
        // Send to backend
        const res = await fetch(`${API_BASE}/auth/facebook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            accessToken: response.authResponse.accessToken,
            userData 
          }),
        });
        const data = await res.json();
        if (data.success) {
          saveAuthSession(data.user);
          closeAuthModal();
          fetchAllData();
          showToast('Welcome! Logged in with Facebook 🎉', 'success');
        }
      });
    }
  }, { scope: 'public_profile,email' });
}
```

---

### 3️⃣ Apple Sign In Setup

**Step 1: Configure Apple Developer Account**

1. Go to [Apple Developer](https://developer.apple.com/)
2. Create an App ID
3. Enable "Sign in with Apple" capability
4. Create a Service ID
5. Configure domains and return URLs

**Step 2: Add Apple Script**

```html
<script src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"></script>
```

**Step 3: Update JavaScript**

```javascript
if (provider === 'apple') {
  AppleID.auth.init({
    clientId: 'YOUR_SERVICE_ID',
    scope: 'name email',
    redirectURI: 'https://yourdomain.com/auth/apple/callback',
    usePopup: true
  });
  
  const data = await AppleID.auth.signIn();
  // Send to backend for processing
}
```

---

## 🏗️ Backend Database Changes Needed

Add a `getUserByEmail()` method to your database:

```typescript
async getUserByEmail(email: string): Promise<User | null> {
  const result = await pool.query(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );
  return result.rows[0] || null;
}
```

---

## 🧪 Testing Social Login

### Before OAuth Setup (Current State):
1. Click social login button
2. See "Coming soon" toast message
3. Button shows loading state
4. Everything looks great! ✨

### After OAuth Setup:
1. Click Google button
2. Google popup appears
3. User selects account
4. Automatically creates/logs in user
5. Modal closes, user logged in! 🎉

---

## 📊 Data Flow Diagram

```
User Clicks Google Button
        ↓
Google OAuth Popup Opens
        ↓
User Selects Account
        ↓
Google Returns ID Token
        ↓
Send Token to Your Backend
        ↓
Backend Verifies with Google
        ↓
Check if User Exists in DB
        ↓
Create New User OR Return Existing
        ↓
Return Session to Frontend
        ↓
Save Session & Close Modal
        ↓
User Logged In! 🎉
```

---

## 🎨 Current Features

✅ **Beautiful UI**
- Brand-colored buttons (Google blue, Facebook blue, Apple black/white)
- Smooth hover effects
- Loading states with spinners
- Responsive design

✅ **UX Best Practices**
- Clear divider: "Or continue with"
- Icons for each provider
- Consistent button sizing
- Dark/Light theme support

✅ **Ready for Integration**
- Event handlers in place
- Error handling structure
- Loading state management
- Toast notifications

---

## 🔒 Security Considerations

When implementing OAuth:

1. **Never store OAuth tokens in localStorage** - Use httpOnly cookies
2. **Always verify tokens server-side** - Don't trust client data
3. **Use HTTPS in production** - OAuth requires secure connections
4. **Implement CSRF protection** - Use state parameter
5. **Handle token expiration** - Refresh tokens when needed
6. **Validate redirect URIs** - Prevent token theft
7. **Log OAuth events** - Track successful/failed logins

---

## 📝 Environment Variables Needed

Add to `.env`:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Facebook Login
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret

# Apple Sign In
APPLE_SERVICE_ID=your-apple-service-id
APPLE_TEAM_ID=your-apple-team-id
APPLE_KEY_ID=your-apple-key-id
```

---

## 🚀 Quick Start (Current State)

**The social login UI is already live!**

```powershell
# Start server
npm start

# Open browser
http://localhost:3000/public/

# Click Login → See the beautiful social login buttons!
```

**To connect real OAuth:**
1. Choose a provider (start with Google - easiest)
2. Follow the setup guide above
3. Get your credentials
4. Update the code
5. Test and deploy!

---

## 📚 Helpful Resources

- [Google Identity](https://developers.google.com/identity/gsi/web/guides/overview)
- [Facebook Login](https://developers.facebook.com/docs/facebook-login/web)
- [Apple Sign In](https://developer.apple.com/sign-in-with-apple/)
- [OAuth 2.0 Explained](https://oauth.net/2/)
- [Passport.js](http://www.passportjs.org/) - Node.js authentication library

---

**Status:** ✅ UI Complete, Ready for OAuth Integration
**Last Updated:** January 2025
**Files Modified:** `index.html`, `style.css`, `app.js`
