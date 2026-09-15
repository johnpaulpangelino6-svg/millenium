import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'node:path';
import { apiRouter } from './routes/api.js';
import { db } from './db/database.js';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';

// Setup CORS & JSON body parsing
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static frontend assets
const publicPath = path.resolve(process.cwd(), 'public');
app.use(express.static(publicPath));

// API Router
app.use('/api', apiRouter);

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'online',
    system: 'Millennium SmartBoard Management System',
    company: 'Brains Infinite Innovations',
    database: 'MySQL (XAMPP)',
    timestamp: new Date().toISOString(),
  });
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

// Verify SQLite connection before accepting traffic
db.testConnection()
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log('================================================================');
      console.log('  🌟 MILLENNIUM SMARTBOARD MANAGEMENT SYSTEM');
      console.log('  🏢 Brains Infinite Innovations - Device & Service Platform');
      console.log('================================================================');
      console.log(`  🌐 Server running at:  http://${HOST}:${PORT}`);
      console.log(`  📡 REST API Base:      http://${HOST}:${PORT}/api`);
      console.log(`  🗄️  Database Engine:   SQLite (File-based, No XAMPP needed!)`);
      console.log(`  💾 Database File:      data/millennium.db`);
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

export default app;
