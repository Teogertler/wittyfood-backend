// middleware/rateLimit.js
// Rate limiting middleware to control API costs
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Rate limit configuration
const RATE_LIMITS = {
  free: {
    daily_scans: parseInt(process.env.FREE_DAILY_SCANS) || 5,      // Free users: 5 scans/day
    daily_text_analysis: parseInt(process.env.FREE_DAILY_TEXT) || 10  // Free users: 10 text analyses/day
  },
  premium: {
    daily_scans: parseInt(process.env.PREMIUM_DAILY_SCANS) || 50,   // Premium: 50 scans/day
    daily_text_analysis: parseInt(process.env.PREMIUM_DAILY_TEXT) || 100 // Premium: 100 text/day
  }
};

/**
 * Get the start of today in UTC
 */
function getTodayStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

/**
 * Get or create today's usage record for a user
 */
async function getOrCreateUsageRecord(userId) {
  const todayStart = getTodayStart();
  
  // Try to get existing record
  const { data: existing, error: fetchError } = await supabase
    .from('api_usage')
    .select('*')
    .eq('user_id', userId)
    .eq('date', todayStart.split('T')[0])
    .single();

  if (existing) {
    return existing;
  }

  // Create new record if none exists
  const { data: newRecord, error: insertError } = await supabase
    .from('api_usage')
    .insert({
      user_id: userId,
      date: todayStart.split('T')[0],
      image_scans: 0,
      text_analyses: 0,
      total_requests: 0
    })
    .select()
    .single();

  if (insertError) {
    // Handle race condition - record might have been created by another request
    if (insertError.code === '23505') { // Unique violation
      const { data: retryFetch } = await supabase
        .from('api_usage')
        .select('*')
        .eq('user_id', userId)
        .eq('date', todayStart.split('T')[0])
        .single();
      return retryFetch;
    }
    console.error('Error creating usage record:', insertError);
    return null;
  }

  return newRecord;
}

/**
 * Increment usage counter
 */
async function incrementUsage(userId, type) {
  const todayStart = getTodayStart();
  const column = type === 'image' ? 'image_scans' : 'text_analyses';
  
  const { data, error } = await supabase.rpc('increment_usage', {
    p_user_id: userId,
    p_date: todayStart.split('T')[0],
    p_column: column
  });

  if (error) {
    console.error('Error incrementing usage:', error);
    // Fallback: try direct update
    const { error: updateError } = await supabase
      .from('api_usage')
      .update({ 
        [column]: supabase.sql`${column} + 1`,
        total_requests: supabase.sql`total_requests + 1`
      })
      .eq('user_id', userId)
      .eq('date', todayStart.split('T')[0]);
    
    if (updateError) {
      console.error('Fallback update also failed:', updateError);
    }
  }
}

/**
 * Get user's subscription tier
 */
function getUserTier(user) {
  // Check if user has premium subscription
  // For now, check a 'subscription_tier' field or 'is_premium' field
  if (user.subscription_tier === 'premium' || user.is_premium) {
    return 'premium';
  }
  return 'free';
}

/**
 * Rate limiting middleware for image analysis (most expensive)
 */
const rateLimitImageAnalysis = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userTier = getUserTier(req.user);
    const limits = RATE_LIMITS[userTier];
    
    // Get today's usage
    const usage = await getOrCreateUsageRecord(userId);
    
    if (!usage) {
      console.error('Could not get/create usage record');
      // Allow request but log the error - don't block users due to tracking issues
      return next();
    }

    // Check if limit exceeded
    if (usage.image_scans >= limits.daily_scans) {
      return res.status(429).json({
        error: 'Daily scan limit reached',
        message: `You've used all ${limits.daily_scans} image scans for today. ${
          userTier === 'free' 
            ? 'Upgrade to Premium for more scans!' 
            : 'Your limit will reset at midnight UTC.'
        }`,
        usage: {
          used: usage.image_scans,
          limit: limits.daily_scans,
          type: 'image_scan',
          tier: userTier,
          resetsAt: getNextMidnightUTC()
        }
      });
    }

    // Attach usage info to request for potential logging
    req.usageInfo = {
      current: usage.image_scans,
      limit: limits.daily_scans,
      remaining: limits.daily_scans - usage.image_scans - 1
    };

    // Increment after successful response
    res.on('finish', async () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        await incrementUsage(userId, 'image');
      }
    });

    next();
  } catch (error) {
    console.error('Rate limit middleware error:', error);
    // Don't block requests due to rate limiting errors
    next();
  }
};

/**
 * Rate limiting middleware for text analysis (less expensive)
 */
const rateLimitTextAnalysis = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userTier = getUserTier(req.user);
    const limits = RATE_LIMITS[userTier];
    
    const usage = await getOrCreateUsageRecord(userId);
    
    if (!usage) {
      return next();
    }

    if (usage.text_analyses >= limits.daily_text_analysis) {
      return res.status(429).json({
        error: 'Daily text analysis limit reached',
        message: `You've used all ${limits.daily_text_analysis} text analyses for today. ${
          userTier === 'free' 
            ? 'Upgrade to Premium for more!' 
            : 'Your limit will reset at midnight UTC.'
        }`,
        usage: {
          used: usage.text_analyses,
          limit: limits.daily_text_analysis,
          type: 'text_analysis',
          tier: userTier,
          resetsAt: getNextMidnightUTC()
        }
      });
    }

    req.usageInfo = {
      current: usage.text_analyses,
      limit: limits.daily_text_analysis,
      remaining: limits.daily_text_analysis - usage.text_analyses - 1
    };

    res.on('finish', async () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        await incrementUsage(userId, 'text');
      }
    });

    next();
  } catch (error) {
    console.error('Rate limit middleware error:', error);
    next();
  }
};

/**
 * Get next midnight UTC timestamp
 */
function getNextMidnightUTC() {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1
  ));
  return tomorrow.toISOString();
}

/**
 * Get user's current usage stats
 */
async function getUserUsageStats(userId, userTier = 'free') {
  const usage = await getOrCreateUsageRecord(userId);
  const limits = RATE_LIMITS[userTier];
  
  return {
    date: usage?.date || getTodayStart().split('T')[0],
    image_scans: {
      used: usage?.image_scans || 0,
      limit: limits.daily_scans,
      remaining: Math.max(0, limits.daily_scans - (usage?.image_scans || 0))
    },
    text_analyses: {
      used: usage?.text_analyses || 0,
      limit: limits.daily_text_analysis,
      remaining: Math.max(0, limits.daily_text_analysis - (usage?.text_analyses || 0))
    },
    tier: userTier,
    resetsAt: getNextMidnightUTC()
  };
}

module.exports = {
  rateLimitImageAnalysis,
  rateLimitTextAnalysis,
  getUserUsageStats,
  RATE_LIMITS
};
