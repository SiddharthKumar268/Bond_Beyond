const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ============================================
// GUARD: Fail fast if JWT_SECRET is missing
// ============================================
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET not set in .env');
  process.exit(1);
}

// ============================================
// HELPERS
// ============================================
function generateToken(userId, role) {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '7d' });
}

function safeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    rollNumber: user.rollNumber,
    department: user.department,
    semester: user.semester,
    batch: user.batch,
    proctorId: user.proctorId,
    adminLevel: user.adminLevel,
    permissions: user.permissions
  };
}

// ============================================
// REGISTER
// ============================================
router.post('/register', async (req, res) => {
  try {
    const {
      name, email, password, role,
      rollNumber, department, semester, batch,
      proctorId, adminLevel
    } = req.body;

    // --- Base field validation ---
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!['student', 'proctor', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // --- Role-specific validation ---
    if (role === 'student') {
      if (!rollNumber) return res.status(400).json({ error: 'Roll number is required' });
      if (!department) return res.status(400).json({ error: 'Department is required' });
      if (!semester)   return res.status(400).json({ error: 'Semester is required' });
      if (!batch)      return res.status(400).json({ error: 'Batch is required' });
    }
    if (role === 'proctor') {
      if (!proctorId)  return res.status(400).json({ error: 'Proctor ID is required' });
      if (!department) return res.status(400).json({ error: 'Department is required' });
    }
    if (role === 'admin') {
      if (!department) return res.status(400).json({ error: 'Department is required' });
    }

    // --- Duplicate email check ---
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // --- Build user object ---
    // FIX: Use `new User().save()` not `User.create()`
    // so both pre('save') hooks in the schema fire correctly
    const userData = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password, // schema pre('save') hook hashes this
      role
    };

    if (role === 'student') {
      userData.rollNumber = rollNumber.trim().toUpperCase();
      userData.department = department;
      userData.semester   = parseInt(semester);
      userData.batch      = batch.trim();
    } else if (role === 'proctor') {
      userData.proctorId  = proctorId.trim().toUpperCase();
      userData.department = department;
    } else if (role === 'admin') {
      userData.adminLevel = adminLevel || 'limited';
      userData.department = department;
    }

    const user = new User(userData);
    await user.save();

    const token = generateToken(user._id, user.role);
    return res.status(201).json({ token, user: safeUser(user) });

  } catch (error) {
    console.error('[register] Error:', error);

    if (error.code === 11000) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    if (error.name === 'ValidationError') {
      const msg = Object.values(error.errors).map(e => e.message).join(', ');
      return res.status(400).json({ error: msg });
    }

    return res.status(500).json({
      error: 'Registration failed. Please try again.',
      detail: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================
// LOGIN
// ============================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is deactivated. Contact admin.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id, user.role);
    return res.json({ token, user: safeUser(user) });

  } catch (error) {
    console.error('[login] Error:', error);
    return res.status(500).json({
      error: 'Login failed. Please try again.',
      detail: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================
// AUTH MIDDLEWARE
// ============================================
function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Malformed authorization header' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId   = decoded.userId;
    req.userRole = decoded.role;
    next();

  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { router, authMiddleware };