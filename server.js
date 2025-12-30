require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const dishRoutes = require('./routes/dishes');
const restaurantRoutes = require('./routes/restaurants');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files for uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/dishes', dishRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'WittyFood2 Backend is running',
    rateLimiting: 'enabled',
    limits: {
      free: {
        daily_scans: parseInt(process.env.FREE_DAILY_SCANS) || 5,
        daily_text: parseInt(process.env.FREE_DAILY_TEXT) || 10
      },
      premium: {
        daily_scans: parseInt(process.env.PREMIUM_DAILY_SCANS) || 50,
        daily_text: parseInt(process.env.PREMIUM_DAILY_TEXT) || 100
      }
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!', message: err.message });
});

app.listen(PORT, () => {
  console.log(`🚀 WittyFood2 Backend running on port ${PORT}`);
});