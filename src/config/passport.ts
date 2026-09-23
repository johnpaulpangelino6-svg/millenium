// ==========================================================================
// Millennium SmartBoard - OAuth Passport Configuration
// Google, Facebook, and Apple Authentication
// ==========================================================================

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import AppleStrategy from 'passport-apple';
import { db } from '../db/database-supabase.js';

// Session serialization
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const users = await db.getUsers();
    const user = users.find(u => u.id === id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// ==========================================================================
// GOOGLE OAUTH STRATEGY
// ==========================================================================
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback',
        scope: ['profile', 'email'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Check if user exists
          const users = await db.getUsers();
          let user = users.find(u => u.email === profile.emails?.[0].value);

          if (!user) {
            // Store OAuth user data temporarily for role selection
            const oauthData = {
              provider: 'google',
              providerId: profile.id,
              email: profile.emails?.[0].value || '',
              fullName: profile.displayName || '',
              firstName: profile.name?.givenName || '',
              lastName: profile.name?.familyName || '',
              profilePhoto: profile.photos?.[0].value || '',
              needsRoleSelection: true,
            };
            return done(null, oauthData);
          }

          // User exists, return user data
          return done(null, user);
        } catch (error) {
          return done(error as Error, undefined);
        }
      }
    )
  );
  console.log('  ✅ Google OAuth configured');
} else {
  console.log('  ⚠️  Google OAuth not configured (missing credentials)');
}

// ==========================================================================
// FACEBOOK OAUTH STRATEGY
// ==========================================================================
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  passport.use(
    new FacebookStrategy(
      {
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL: process.env.FACEBOOK_CALLBACK_URL || 'http://localhost:3000/api/auth/facebook/callback',
        profileFields: ['id', 'displayName', 'emails', 'name', 'photos'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const users = await db.getUsers();
          let user = users.find(u => u.email === profile.emails?.[0].value);

          if (!user) {
            const oauthData = {
              provider: 'facebook',
              providerId: profile.id,
              email: profile.emails?.[0].value || '',
              fullName: profile.displayName || '',
              firstName: profile.name?.givenName || '',
              lastName: profile.name?.familyName || '',
              profilePhoto: profile.photos?.[0].value || '',
              needsRoleSelection: true,
            };
            return done(null, oauthData);
          }

          return done(null, user);
        } catch (error) {
          return done(error as Error, undefined);
        }
      }
    )
  );
  console.log('  ✅ Facebook OAuth configured');
} else {
  console.log('  ⚠️  Facebook OAuth not configured (missing credentials)');
}

// ==========================================================================
// APPLE OAUTH STRATEGY
// ==========================================================================
if (process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID) {
  try {
    passport.use(
      new AppleStrategy(
        {
          clientID: process.env.APPLE_CLIENT_ID,
          teamID: process.env.APPLE_TEAM_ID,
          keyID: process.env.APPLE_KEY_ID,
          privateKeyLocation: process.env.APPLE_PRIVATE_KEY_PATH || './certs/AuthKey.p8',
          callbackURL: process.env.APPLE_CALLBACK_URL || 'http://localhost:3000/api/auth/apple/callback',
          scope: ['email', 'name'],
        },
        async (accessToken: any, refreshToken: any, idToken: any, profile: any, done: any) => {
          try {
            const users = await db.getUsers();
            let user = users.find(u => u.email === profile.email);

            if (!user) {
              const oauthData = {
                provider: 'apple',
                providerId: profile.sub,
                email: profile.email || '',
                fullName: `${profile.name?.firstName || ''} ${profile.name?.lastName || ''}`.trim() || 'Apple User',
                firstName: profile.name?.firstName || '',
                lastName: profile.name?.lastName || '',
                needsRoleSelection: true,
              };
              return done(null, oauthData);
            }

            return done(null, user);
          } catch (error) {
            return done(error as Error, undefined);
          }
        }
      )
    );
    console.log('  ✅ Apple OAuth configured');
  } catch (error) {
    console.log('  ⚠️  Apple OAuth configuration failed:', error);
  }
} else {
  console.log('  ⚠️  Apple OAuth not configured (missing credentials)');
}

export default passport;
