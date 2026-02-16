const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['student', 'proctor', 'admin'],
    required: true
  },

  rollNumber: { type: String, sparse: true },
  department: {
    type: String,
    enum: ['CSE', 'ECE', 'EEE', 'MECH', 'CIVIL', 'IT', 'OTHER', undefined]
  },
  semester: { type: Number, min: 1, max: 8 },
  batch: String,

  proctorId: { type: String, sparse: true },
  assignedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  adminLevel: {
    type: String,
    enum: ['super', 'department', 'limited'],
    default: 'limited'
  },
  permissions: {
    manageCalendar:  { type: Boolean, default: false },
    manageUsers:     { type: Boolean, default: false },
    viewAnalytics:   { type: Boolean, default: false },
    manageProctors:  { type: Boolean, default: false },
    manageAdmins:    { type: Boolean, default: false },
    exportReports:   { type: Boolean, default: false }
  },

  createdAt:      { type: Date, default: Date.now },
  lastLogin:      Date,
  isActive:       { type: Boolean, default: true },
  profilePicture: String,
  phone:          String
});

userSchema.pre('save', async function () {
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  if (this.role === 'admin' && this.isModified('adminLevel')) {
    switch (this.adminLevel) {
      case 'super':
        this.permissions = {
          manageCalendar: true,
          manageUsers:    true,
          viewAnalytics:  true,
          manageProctors: true,
          manageAdmins:   true,
          exportReports:  true
        };
        break;
      case 'department':
        this.permissions = {
          manageCalendar: true,
          manageUsers:    true,
          viewAnalytics:  true,
          manageProctors: true,
          manageAdmins:   false,
          exportReports:  true
        };
        break;
      case 'limited':
      default:
        this.permissions = {
          manageCalendar: true,
          manageUsers:    false,
          viewAnalytics:  true,
          manageProctors: false,
          manageAdmins:   false,
          exportReports:  false
        };
        break;
    }
  }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.hasPermission = function (permission) {
  if (this.role !== 'admin') return false;
  return this.permissions[permission] === true;
};

module.exports = mongoose.model('User', userSchema);