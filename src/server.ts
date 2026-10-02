import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'node:path';
import session from 'express-session';
import passport from './config/passport.js';
import { apiRouter } from './routes/api.js';
import { db } from './db/database-supabase.js';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const HOST = '0.0.0.0'; // Always bind to 0.0.0.0 for deployment

// Setup CORS & JSON body parsing
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Setup session (required for OAuth)
app.use(session({
  secret: process.env.SESSION_SECRET || 'millennium_smartboard_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Static frontend assets
const publicPath = path.resolve(process.cwd(), 'public');
app.use(express.static(publicPath));

// API Router
app.use('/api', apiRouter);

// Health check — verifies the backend AND the database connection for real
app.get('/health', async (req: Request, res: Response) => {
  const dbOnline = await db.ping();
  res.status(dbOnline ? 200 : 503).json({
    status: dbOnline ? 'online' : 'degraded',
    system: 'Millennium SmartBoard Management System',
    company: 'Brains Infinite Innovations',
    database: 'Supabase PostgreSQL',
    databaseConnected: dbOnline,
    timestamp: new Date().toISOString(),
  });
});

// Unmatched API routes must return JSON, never the SPA HTML shell.
// (Without this, a typo'd/renamed endpoint silently returns index.html and the
// frontend reports a confusing JSON parse error instead of a clear 404.)
app.use('/api', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `API endpoint not found: ${req.method} /api${req.path}`,
  });
});

// Public landing page / new-user guide.
// Must be declared BEFORE the SPA fallback, otherwise the catch-all below
// would serve index.html for /landing and the page would never appear.
// (/landing.html is already served directly by express.static.)
app.get('/landing', (req: Request, res: Response) => {
  res.sendFile(path.resolve(publicPath, 'landing.html'));
});

// Fallback to index.html for SPA frontend routing
app.use((req: Request, res: Response) => {
  res.sendFile(path.resolve(publicPath, 'index.html'));
});

// Global error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal Server Error',
  });
});

// Verify database connection before accepting traffic
db.testConnection()
  .then(async () => {
    // Initialize schema to ensure tables exist (retry on transient pooler errors)
    for (let attempt = 1; ; attempt++) {
      try {
        await db.initSchemaAsync();
        break;
      } catch (err: any) {
        const transient = /ECONNRESET|ETIMEDOUT|ECONNREFUSED|EPIPE|Connection terminated|timeout expired/i.test(
          err?.message || ''
        );
        if (!transient || attempt >= 5) throw err;
        console.warn(`  ⚠️  Schema init attempt ${attempt}/5 failed (${err.message}) — retrying...`);
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
    console.log('  ✅ Database schema initialized.');
    
    app.listen(PORT, HOST, () => {
      console.log('================================================================');
      console.log('  🌟 MILLENNIUM SMARTBOARD MANAGEMENT SYSTEM');
      console.log('  🏢 Brains Infinite Innovations - Device & Service Platform');
      console.log('================================================================');
      console.log(`  🌐 Server running at:  http://${HOST}:${PORT}`);
      console.log(`  📡 REST API Base:      http://${HOST}:${PORT}/api`);
      console.log(`  🗄️  Database Engine:   Supabase PostgreSQL`);
      console.log(`  ☁️  Cloud Sync:        ✅ Real-time synchronized`);
      console.log(`  💾 Data Persistence:   ✅ Permanent cloud storage`);
      console.log(`  👥 Multi-User:         ✅ Shared across all instances`);
      console.log(`  🔄 Local ↔ Production: ✅ Instant sync`);
      console.log(`  👥 Multi-User:         ✅ All users share same database`);
      console.log(`  💾 Data Persistence:   ✅ Saved permanently`);
      console.log('  * Local URL:          http://localhost:3000');
      console.log('================================================================');
    });
  })
  .catch((err) => {
    console.error('================================================================');
    console.error('  ❌ FAILED TO CONNECT TO DATABASE');
    console.error(`     ${err.message}`);
    console.error('');
    console.error('  Run the seed script first:  npm run db:seed');
    console.error('================================================================');
    process.exit(1);
  });

// Prevent server crash on unhandled promise rejections (e.g. Supabase pooler ECONNRESET)
process.on('unhandledRejection', (reason: any) => {
  const msg = reason?.message || String(reason);
  if (msg.includes('ECONNRESET') || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT')) {
    console.error('⚠️  Transient DB connection error (non-fatal):', msg);
  } else {
    console.error('⚠️  Unhandled promise rejection:', msg);
  }
});

process.on('uncaughtException', (err: Error) => {
  const msg = err.message || String(err);
  if (msg.includes('ECONNRESET') || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT')) {
    console.error('⚠️  Transient DB connection error (non-fatal):', msg);
  } else {
    console.error('💥 Uncaught exception:', msg);
    console.error(err.stack);
  }
});

export default app;
