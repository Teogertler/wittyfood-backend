// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

// Initialize Supabase with error checking
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

console.log('🔧 Supabase URL configured:', supabaseUrl ? '✓ Yes' : '✗ MISSING!');
console.log('🔧 Supabase Key configured:', supabaseKey ? '✓ Yes' : '✗ MISSING!');

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ CRITICAL: Supabase credentials missing in .env file!');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Generate JWT token
function generateToken(userId) {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Test database connection endpoint
router.get('/test-db', async (req, res) => {
  try {
    console.log('🧪 Testing database connection...');
    
    // Try to query the users table
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);

    if (error) {
      console.error('❌ Database test failed:', error);
      return res.status(500).json({
        success: false,
        error: error.message,
        hint: error.hint,
        details: error.details,
        code: error.code
      });
    }

    console.log('✅ Database connection successful!');
    res.json({
      success: true,
      message: 'Database connected successfully!',
      data
    });

  } catch (error) {
    console.error('❌ Database test exception:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/auth/signup - Register new user
router.post('/signup', async (req, res) => {
  try {
    console.log('\n📝 Signup request received');
    console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
    
    const { email, password, name } = req.body;

    // Validate input
    if (!email || !password || !name) {
      console.log('❌ Validation failed: Missing fields');
      console.log('   - email:', email ? '✓' : '✗ MISSING');
      console.log('   - password:', password ? '✓' : '✗ MISSING');
      console.log('   - name:', name ? '✓' : '✗ MISSING');
      
      return res.status(400).json({
        error: 'Please provide email, password, and name'
      });
    }

    if (password.length < 6) {
      console.log('❌ Validation failed: Password too short');
      return res.status(400).json({
        error: 'Password must be at least 6 characters long'
      });
    }

    console.log('✓ Validation passed');
    console.log('🔍 Checking if user exists...');

    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116 means no rows found, which is what we want
      console.error('❌ Error checking existing user:', checkError);
      console.error('   Code:', checkError.code);
      console.error('   Message:', checkError.message);
      console.error('   Details:', checkError.details);
      console.error('   Hint:', checkError.hint);
      
      return res.status(500).json({
        error: 'Database error while checking user',
        details: checkError.message
      });
    }

    if (existingUser) {
      console.log('❌ User already exists:', email);
      return res.status(400).json({
        error: 'Email already registered'
      });
    }

    console.log('✓ Email is available');
    console.log('🔐 Hashing password...');

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('✓ Password hashed');

    console.log('💾 Creating user in database...');

    // Create user
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([
        {
          email: email.toLowerCase(),
          password_hash: hashedPassword,
          name: name
        }
      ])
      .select()
      .single();

    if (insertError) {
      console.error('❌ Failed to create user!');
      console.error('   Error object:', JSON.stringify(insertError, null, 2));
      console.error('   Code:', insertError.code);
      console.error('   Message:', insertError.message);
      console.error('   Details:', insertError.details);
      console.error('   Hint:', insertError.hint);
      
      // Common error explanations
      if (insertError.code === '42P01') {
        console.error('   💡 TABLE DOES NOT EXIST! Run DATABASE-SCHEMA.sql in Supabase');
      } else if (insertError.code === '42501') {
        console.error('   💡 PERMISSION DENIED! Check RLS policies or disable RLS');
      } else if (insertError.code === '23505') {
        console.error('   💡 DUPLICATE KEY! Email already exists');
      }
      
      return res.status(500).json({
        error: 'Failed to create account',
        details: insertError.message,
        code: insertError.code,
        hint: insertError.hint || 'Make sure you ran DATABASE-SCHEMA.sql in Supabase'
      });
    }

    console.log('✅ User created successfully!');
    console.log('🎫 Generating token...');

    // Generate token
    const token = generateToken(newUser.id);
    console.log('✓ Token generated');

    // Return user data (without password)
    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        createdAt: newUser.created_at
      }
    });

    console.log('✅ Signup complete for:', email);

  } catch (error) {
    console.error('\n❌ SIGNUP EXCEPTION:');
    console.error('   Name:', error.name);
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
    
    res.status(500).json({
      error: 'Server error during signup',
      details: error.message
    });
  }
});

// POST /api/auth/login - Login user
router.post('/login', async (req, res) => {
  try {
    console.log('\n🔑 Login request received');
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      console.log('❌ Validation failed: Missing credentials');
      return res.status(400).json({
        error: 'Please provide email and password'
      });
    }

    console.log('🔍 Looking up user:', email);

    // Find user
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error) {
      console.log('❌ User not found or database error');
      if (error.code !== 'PGRST116') {
        console.error('   Error:', error.message);
      }
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }

    console.log('✓ User found, verifying password...');

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      console.log('❌ Invalid password');
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }

    console.log('✓ Password verified');

    // Generate token
    const token = generateToken(user.id);

    // Return user data (without password)
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.created_at
      }
    });

    console.log('✅ Login successful for:', email);

  } catch (error) {
    console.error('❌ Login error:', error.message);
    res.status(500).json({
      error: 'Server error during login'
    });
  }
});

// GET /api/auth/me - Get current user (protected route)
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'No token provided'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, created_at')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      return res.status(401).json({
        error: 'User not found'
      });
    }

    res.json({ user });

  } catch (error) {
    console.error('Auth check error:', error.message);
    res.status(401).json({
      error: 'Invalid token'
    });
  }
});

module.exports = router;
