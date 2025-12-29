require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const dishRoutes = require('./routes/dishes');
const restaurantRoutes = require('./routes/restaurants');
const userRoutes = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 5000;

// ===========================================
// CORS Configuration - Allow mobile app access
// ===========================================
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Allow all origins for mobile app (they don't send origin headers)
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

app.use(cors(corsOptions));

// ===========================================
// Middleware
// ===========================================
app.use(express.json({ limit: '50mb' })); // Increased for base64 images
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Static files for uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===========================================
// Routes
// ===========================================
app.use('/api/auth', authRoutes);
app.use('/api/dishes', dishRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/users', userRoutes);

// ===========================================
// Health check endpoint
// ===========================================
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'WittyFood2 Backend is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'WittyFood2 API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      dishes: '/api/dishes',
      restaurants: '/api/restaurants',
      users: '/api/users'
    }
  });
});

// ===========================================
// Error handling middleware
// ===========================================
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  
  res.status(err.status || 500).json({ 
    error: 'Something went wrong!', 
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found', 
    message: `Route ${req.method} ${req.path} not found` 
  });
});

// ===========================================
// Start server
// ===========================================
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🚀 ================================================');
  console.log(`🚀 WittyFood2 Backend running on port ${PORT}`);
  console.log(`🚀 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🚀 Health check: http://localhost:${PORT}/api/health`);
  console.log('🚀 ================================================');
  console.log('');
});
