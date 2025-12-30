-- ============================================
-- WittyFood2 Rate Limiting Database Setup
-- ============================================
-- Run this SQL in your Supabase SQL Editor
-- Dashboard > SQL Editor > New Query > Paste & Run
-- ============================================

-- 1. Create the api_usage table to track daily API usage per user
CREATE TABLE IF NOT EXISTS api_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  image_scans INTEGER DEFAULT 0,
  text_analyses INTEGER DEFAULT 0,
  total_requests INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one record per user per day
  UNIQUE(user_id, date)
);

-- 2. Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_api_usage_user_date 
ON api_usage(user_id, date);

-- 3. Create index for date-based queries (for analytics)
CREATE INDEX IF NOT EXISTS idx_api_usage_date 
ON api_usage(date);

-- 4. Create function to increment usage counter atomically
CREATE OR REPLACE FUNCTION increment_usage(
  p_user_id UUID,
  p_date DATE,
  p_column TEXT
)
RETURNS void AS $$
BEGIN
  -- Try to insert or update the usage record
  INSERT INTO api_usage (user_id, date, image_scans, text_analyses, total_requests)
  VALUES (
    p_user_id, 
    p_date, 
    CASE WHEN p_column = 'image_scans' THEN 1 ELSE 0 END,
    CASE WHEN p_column = 'text_analyses' THEN 1 ELSE 0 END,
    1
  )
  ON CONFLICT (user_id, date) 
  DO UPDATE SET 
    image_scans = api_usage.image_scans + CASE WHEN p_column = 'image_scans' THEN 1 ELSE 0 END,
    text_analyses = api_usage.text_analyses + CASE WHEN p_column = 'text_analyses' THEN 1 ELSE 0 END,
    total_requests = api_usage.total_requests + 1,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- 5. Create function to get user's daily usage summary
CREATE OR REPLACE FUNCTION get_user_daily_usage(p_user_id UUID)
RETURNS TABLE (
  date DATE,
  image_scans INTEGER,
  text_analyses INTEGER,
  total_requests INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    au.date,
    au.image_scans,
    au.text_analyses,
    au.total_requests
  FROM api_usage au
  WHERE au.user_id = p_user_id
  ORDER BY au.date DESC
  LIMIT 30;
END;
$$ LANGUAGE plpgsql;

-- 6. Create function to get usage stats for admin dashboard
CREATE OR REPLACE FUNCTION get_usage_stats(
  p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  date DATE,
  total_users INTEGER,
  total_image_scans BIGINT,
  total_text_analyses BIGINT,
  total_requests BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    au.date,
    COUNT(DISTINCT au.user_id)::INTEGER as total_users,
    SUM(au.image_scans)::BIGINT as total_image_scans,
    SUM(au.text_analyses)::BIGINT as total_text_analyses,
    SUM(au.total_requests)::BIGINT as total_requests
  FROM api_usage au
  WHERE au.date BETWEEN p_start_date AND p_end_date
  GROUP BY au.date
  ORDER BY au.date DESC;
END;
$$ LANGUAGE plpgsql;

-- 7. Add subscription tier column to users table (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'subscription_tier'
  ) THEN
    ALTER TABLE users ADD COLUMN subscription_tier TEXT DEFAULT 'free';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'subscription_expires_at'
  ) THEN
    ALTER TABLE users ADD COLUMN subscription_expires_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- 8. Create view for easy usage monitoring
CREATE OR REPLACE VIEW v_daily_usage_summary AS
SELECT 
  date,
  COUNT(DISTINCT user_id) as active_users,
  SUM(image_scans) as total_image_scans,
  SUM(text_analyses) as total_text_analyses,
  SUM(total_requests) as total_api_calls,
  AVG(image_scans)::DECIMAL(10,2) as avg_scans_per_user,
  AVG(text_analyses)::DECIMAL(10,2) as avg_text_per_user
FROM api_usage
GROUP BY date
ORDER BY date DESC;

-- 9. Enable Row Level Security (RLS) for api_usage
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- 10. Create RLS policies
-- Users can only see their own usage
CREATE POLICY "Users can view own usage" ON api_usage
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can do everything (for backend)
CREATE POLICY "Service role full access" ON api_usage
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- Verification queries (run after setup)
-- ============================================

-- Check table was created
-- SELECT * FROM api_usage LIMIT 5;

-- Check function works
-- SELECT increment_usage('your-user-uuid-here'::UUID, CURRENT_DATE, 'image_scans');

-- Check daily summary view
-- SELECT * FROM v_daily_usage_summary LIMIT 7;

-- ============================================
-- Notes:
-- - Limits reset at midnight UTC
-- - Free tier: 5 image scans, 10 text analyses per day
-- - Premium tier: 50 image scans, 100 text analyses per day
-- - Adjust limits in your .env file
-- ============================================
