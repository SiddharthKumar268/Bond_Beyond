const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables');
  process.exit(1);
}

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
  .then(() => {
    console.log('✓ MongoDB Atlas connected successfully');
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed (SIGTERM)');
  process.exit(0);
});

const { router: authRouter } = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const workloadRoutes = require('./routes/workload');
const gradeRoutes = require('./routes/grades');
const calendarRoutes = require('./routes/calendar');
const burnoutRoutes = require('./routes/burnout');
const proctorRoutes = require('./routes/proctor');
const adminRoutes = require('./routes/admin');

app.use('/api/auth', authRouter);
app.use('/api/tasks', taskRoutes);
app.use('/api/workload', workloadRoutes);
app.use('/api/grades', gradeRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/burnout', burnoutRoutes);
app.use('/api/proctor', proctorRoutes);
app.use('/api/admin', adminRoutes);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/api', (req, res) => {
  res.json({
    message: 'Burnout Prediction System API',
    status: 'running',
    version: '1.0.0'
  });
});

const frontendPath = path.join(__dirname, '../frontend');

app.use(express.static(frontendPath));
app.use('/css', express.static(path.join(frontendPath, 'css')));
app.use('/js', express.static(path.join(frontendPath, 'js')));
app.use('/pages', express.static(path.join(frontendPath, 'pages')));

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Server running on port ${PORT}`);
  console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;