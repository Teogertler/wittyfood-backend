// routes/admin.js
// Admin routes for monitoring and management
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const authMiddleware = require('../middleware/auth');
const { RATE_LIMITS } = require('../middleware/rateLimit');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Admin middleware - check if user is admin
 */
const adminMiddleware = async (req, res, next) => {
  // Check if user has admin role
  if (!req.user.is_admin && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Admin access required',
      message: 'You do not have permission to access this resource'
    });
  }
  next();
};

// GET /api/admin/usage/summary - Get overall usage summary
router.get('/usage/summary', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    const { data, error } = await supabase
      .from('api_usage')
      .select('*')
      .gte('date', startDate.toISOString().split('T')[0]);

    if (error) throw error;

    // Calculate summary stats
    const summary = {
      period: {
        start: startDate.toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0],
        days: parseInt(days)
      },
      totals: {
        image_scans: data.reduce((sum, d) => sum + d.image_scans, 0),
        text_analyses: data.reduce((sum, d) => sum + d.text_analyses, 0),
        total_requests: data.reduce((sum, d) => sum + d.total_requests, 0),
        unique_users: new Set(data.map(d => d.user_id)).size
      },
      averages: {
        daily_image_scans: data.length > 0 
          ? (data.reduce((sum, d) => sum + d.image_scans, 0) / parseInt(days)).toFixed(2)
          : 0,
        daily_text_analyses: data.length > 0
          ? (data.reduce((sum, d) => sum + d.text_analyses, 0) / parseInt(days)).toFixed(2)
          : 0,
        scans_per_user: data.length > 0
          ? (data.reduce((sum, d) => sum + d.image_scans, 0) / new Set(data.map(d => d.user_id)).size).toFixed(2)
          : 0
      },
      rateLimits: RATE_LIMITS
    };

    res.json({
      message: 'Usage summary retrieved successfully',
      summary
    });
  } catch (error) {
    console.error('Admin usage summary error:', error);
    res.status(500).json({
      error: 'Failed to get usage summary',
      details: error.message
    });
  }
});

// GET /api/admin/usage/daily - Get daily usage breakdown
router.get('/usage/daily', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { days = 7 } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    // Get daily aggregated data
    const { data, error } = await supabase
      .from('api_usage')
      .select('date, image_scans, text_analyses, total_requests, user_id')
      .gte('date', startDate.toISOString().split('T')[0])
      .order('date', { ascending: false });

    if (error) throw error;

    // Aggregate by date
    const dailyStats = {};
    data.forEach(record => {
      if (!dailyStats[record.date]) {
        dailyStats[record.date] = {
          date: record.date,
          image_scans: 0,
          text_analyses: 0,
          total_requests: 0,
          unique_users: new Set()
        };
      }
      dailyStats[record.date].image_scans += record.image_scans;
      dailyStats[record.date].text_analyses += record.text_analyses;
      dailyStats[record.date].total_requests += record.total_requests;
      dailyStats[record.date].unique_users.add(record.user_id);
    });

    // Convert to array and format
    const daily = Object.values(dailyStats)
      .map(d => ({
        ...d,
        unique_users: d.unique_users.size
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      message: 'Daily usage retrieved successfully',
      daily
    });
  } catch (error) {
    console.error('Admin daily usage error:', error);
    res.status(500).json({
      error: 'Failed to get daily usage',
      details: error.message
    });
  }
});

// GET /api/admin/usage/top-users - Get top users by usage
router.get('/usage/top-users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { days = 30, limit = 10 } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    const { data, error } = await supabase
      .from('api_usage')
      .select(`
        user_id,
        image_scans,
        text_analyses,
        total_requests,
        users (
          id,
          email,
          name,
          subscription_tier
        )
      `)
      .gte('date', startDate.toISOString().split('T')[0]);

    if (error) throw error;

    // Aggregate by user
    const userStats = {};
    data.forEach(record => {
      if (!userStats[record.user_id]) {
        userStats[record.user_id] = {
          user_id: record.user_id,
          email: record.users?.email || 'Unknown',
          name: record.users?.name || 'Unknown',
          tier: record.users?.subscription_tier || 'free',
          image_scans: 0,
          text_analyses: 0,
          total_requests: 0,
          days_active: 0
        };
      }
      userStats[record.user_id].image_scans += record.image_scans;
      userStats[record.user_id].text_analyses += record.text_analyses;
      userStats[record.user_id].total_requests += record.total_requests;
      userStats[record.user_id].days_active += 1;
    });

    // Sort by image scans (most expensive) and limit
    const topUsers = Object.values(userStats)
      .sort((a, b) => b.image_scans - a.image_scans)
      .slice(0, parseInt(limit));

    res.json({
      message: 'Top users retrieved successfully',
      topUsers,
      period: {
        start: startDate.toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
      }
    });
  } catch (error) {
    console.error('Admin top users error:', error);
    res.status(500).json({
      error: 'Failed to get top users',
      details: error.message
    });
  }
});

// GET /api/admin/config - Get current rate limit configuration
router.get('/config', authMiddleware, adminMiddleware, async (req, res) => {
  res.json({
    message: 'Configuration retrieved successfully',
    config: {
      rateLimits: RATE_LIMITS,
      environment: {
        FREE_DAILY_SCANS: process.env.FREE_DAILY_SCANS || '5 (default)',
        FREE_DAILY_TEXT: process.env.FREE_DAILY_TEXT || '10 (default)',
        PREMIUM_DAILY_SCANS: process.env.PREMIUM_DAILY_SCANS || '50 (default)',
        PREMIUM_DAILY_TEXT: process.env.PREMIUM_DAILY_TEXT || '100 (default)'
      }
    }
  });
});

// GET /api/admin/health - Extended health check with usage info
router.get('/health', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Get today's total usage
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('api_usage')
      .select('image_scans, text_analyses')
      .eq('date', today);

    const todayStats = {
      image_scans: data?.reduce((sum, d) => sum + d.image_scans, 0) || 0,
      text_analyses: data?.reduce((sum, d) => sum + d.text_analyses, 0) || 0,
      active_users: data?.length || 0
    };

    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      today: todayStats,
      rateLimits: RATE_LIMITS
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      error: error.message
    });
  }
});

module.exports = router;
