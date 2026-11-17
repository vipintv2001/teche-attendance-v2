require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const attendanceRoutes = require('./routes/attendanceRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { seedEmployeesIfEmpty } = require('./seedEmployees');
const { startReminderCrons } = require('./jobs/reminderCron');

const app = express();

// Trust the first reverse proxy for accurate client IP and HTTPS detection (iOS Safari cookies)
app.set('trust proxy', 1);

const rawOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  const clean = origin.replace(/\/$/, '');
  if (rawOrigins.includes(clean)) return true;
  if (/^https:\/\/teche-attendance[a-z0-9-]*\.vercel\.app$/i.test(clean)) return true;
  if (/^http:\/\/localhost(:\d+)?$/i.test(clean)) return true;
  if (/^http:\/\/127\.0\.0\.1(:\d+)?$/i.test(clean)) return true;
  return false;
}

app.use(
  cors({
    origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Not allowed by CORS: ${origin}`));
      },
      credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-token', 'x-device-token'],
          methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    })
);

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'teche-attendance-backend',
    timezone: 'Asia/Kolkata'
  });
});

app.use('/api/attendance', attendanceRoutes);
app.use('/api/admin', adminRoutes);

// Serve built frontend in production if present
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    return res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

const PORT = Number(process.env.PORT || 5000);

async function startServer() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI environment variable is missing.');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.info('[MongoDB] Connected successfully.');

  await seedEmployeesIfEmpty();
  startReminderCrons();

  app.listen(PORT, () => {
    console.info(`[Server] TECHE Attendance API running on port ${PORT}`);
  });
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = { app, startServer };

