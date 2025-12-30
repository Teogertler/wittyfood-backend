// routes/users.js
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============================================
// PROFILE ROUTES
// ============================================

// GET /api/users/profile - Get user profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, created_at')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Get favorites count
    const { count: favoritesCount } = await supabase
      .from('favorites')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id);

    res.json({
      user: {
        ...user,
        favoritesCount: favoritesCount || 0
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: 'Failed to fetch profile'
    });
  }
});

// PUT /api/users/profile - Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        error: 'Name is required'
      });
    }

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update({ name: name.trim() })
      .eq('id', req.user.id)
      .select('id, email, name, created_at')
      .single();

    if (error) {
      throw new Error('Failed to update profile');
    }

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      error: 'Failed to update profile'
    });
  }
});

// ============================================
// SETTINGS ROUTES
// ============================================

// GET /api/users/settings - Get user settings
router.get('/settings', authMiddleware, async (req, res) => {
  try {
    const { data: settings, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found, which is OK for new users
      throw error;
    }

    // Return settings or defaults
    const defaultSettings = {
      dark_mode: false,
      notifications_new_matches: true,
      notifications_favorite_updates: true,
      notifications_nearby_deals: true,
      notifications_daily_inspiration: false,
      default_search_radius: 5,
      default_min_similarity: 30,
      language: 'en'
    };

    res.json({
      settings: settings || defaultSettings
    });

  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      error: 'Failed to fetch settings'
    });
  }
});

// PUT /api/users/settings - Update user settings
router.put('/settings', authMiddleware, async (req, res) => {
  try {
    const {
      dark_mode,
      notifications_new_matches,
      notifications_favorite_updates,
      notifications_nearby_deals,
      notifications_daily_inspiration,
      default_search_radius,
      default_min_similarity,
      language
    } = req.body;

    // Check if settings exist
    const { data: existingSettings } = await supabase
      .from('user_settings')
      .select('id')
      .eq('user_id', req.user.id)
      .single();

    let result;

    if (existingSettings) {
      // Update existing settings
      const { data, error } = await supabase
        .from('user_settings')
        .update({
          dark_mode,
          notifications_new_matches,
          notifications_favorite_updates,
          notifications_nearby_deals,
          notifications_daily_inspiration,
          default_search_radius,
          default_min_similarity,
          language
        })
        .eq('user_id', req.user.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Insert new settings
      const { data, error } = await supabase
        .from('user_settings')
        .insert([{
          user_id: req.user.id,
          dark_mode,
          notifications_new_matches,
          notifications_favorite_updates,
          notifications_nearby_deals,
          notifications_daily_inspiration,
          default_search_radius,
          default_min_similarity,
          language
        }])
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    res.json({
      message: 'Settings updated successfully',
      settings: result
    });

  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      error: 'Failed to update settings'
    });
  }
});

// ============================================
// SEARCH HISTORY ROUTES
// ============================================

// GET /api/users/search-history - Get user's search history
router.get('/search-history', authMiddleware, async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const { data: history, error } = await supabase
      .from('search_history')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) {
      throw error;
    }

    // Transform to frontend format
    const formattedHistory = (history || []).map(item => ({
      id: item.id,
      query: {
        name: item.dish_name,
        cuisine: item.dish_cuisine,
        description: item.dish_description,
        ingredients: item.dish_ingredients || [],
        estimatedCalories: item.dish_estimated_calories,
        dietaryInfo: item.dish_dietary_info || [],
        confidence: item.dish_confidence
      },
      results: [], // Results aren't stored, just metadata
      resultsCount: item.results_count,
      timestamp: item.created_at,
      imageUri: item.image_uri
    }));

    res.json({
      history: formattedHistory,
      count: formattedHistory.length
    });

  } catch (error) {
    console.error('Get search history error:', error);
    res.status(500).json({
      error: 'Failed to fetch search history'
    });
  }
});

// POST /api/users/search-history - Add to search history
router.post('/search-history', authMiddleware, async (req, res) => {
  try {
    const {
      query,
      resultsCount,
      imageUri
    } = req.body;

    if (!query || !query.name) {
      return res.status(400).json({
        error: 'Query with dish name is required'
      });
    }

    const { data: entry, error } = await supabase
      .from('search_history')
      .insert([{
        user_id: req.user.id,
        dish_name: query.name,
        dish_cuisine: query.cuisine,
        dish_description: query.description,
        dish_ingredients: query.ingredients,
        dish_estimated_calories: query.estimatedCalories,
        dish_dietary_info: query.dietaryInfo,
        dish_confidence: query.confidence,
        results_count: resultsCount || 0,
        image_uri: imageUri
      }])
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json({
      message: 'Search added to history',
      entry: {
        id: entry.id,
        query: {
          name: entry.dish_name,
          cuisine: entry.dish_cuisine,
          description: entry.dish_description,
          ingredients: entry.dish_ingredients || [],
          estimatedCalories: entry.dish_estimated_calories,
          dietaryInfo: entry.dish_dietary_info || [],
          confidence: entry.dish_confidence
        },
        resultsCount: entry.results_count,
        timestamp: entry.created_at,
        imageUri: entry.image_uri
      }
    });

  } catch (error) {
    console.error('Add search history error:', error);
    res.status(500).json({
      error: 'Failed to add to search history'
    });
  }
});

// DELETE /api/users/search-history/:id - Delete a search history item
router.delete('/search-history/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: deleted, error } = await supabase
      .from('search_history')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select();

    if (error) {
      throw error;
    }

    if (!deleted || deleted.length === 0) {
      return res.status(404).json({
        error: 'History item not found'
      });
    }

    res.json({
      message: 'History item deleted'
    });

  } catch (error) {
    console.error('Delete search history error:', error);
    res.status(500).json({
      error: 'Failed to delete history item'
    });
  }
});

// DELETE /api/users/search-history - Clear all search history
router.delete('/search-history', authMiddleware, async (req, res) => {
  try {
    const { error } = await supabase
      .from('search_history')
      .delete()
      .eq('user_id', req.user.id);

    if (error) {
      throw error;
    }

    res.json({
      message: 'Search history cleared'
    });

  } catch (error) {
    console.error('Clear search history error:', error);
    res.status(500).json({
      error: 'Failed to clear search history'
    });
  }
});

// ============================================
// FAVORITES ROUTES
// ============================================

// GET /api/users/favorites - Get user's favorite dishes
router.get('/favorites', authMiddleware, async (req, res) => {
  try {
    const { data: favorites, error } = await supabase
      .from('favorites')
      .select(`
        id,
        dish_id,
        created_at,
        dish:restaurant_dishes(
          *,
          restaurant:restaurants(*)
        )
      `)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error('Failed to fetch favorites');
    }

    res.json({
      favorites: favorites || [],
      count: favorites?.length || 0
    });

  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({
      error: 'Failed to fetch favorites'
    });
  }
});

// POST /api/users/favorites/:dishId - Add dish to favorites
router.post('/favorites/:dishId', authMiddleware, async (req, res) => {
  try {
    const { dishId } = req.params;

    // Check if dish exists
    const { data: dish, error: dishError } = await supabase
      .from('restaurant_dishes')
      .select('id')
      .eq('id', dishId)
      .single();

    if (dishError || !dish) {
      return res.status(404).json({
        error: 'Dish not found'
      });
    }

    // Check if already favorited
    const { data: existingFavorite } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('dish_id', dishId)
      .single();

    if (existingFavorite) {
      return res.status(400).json({
        error: 'Dish already in favorites'
      });
    }

    // Add to favorites
    const { data: favorite, error } = await supabase
      .from('favorites')
      .insert([
        {
          user_id: req.user.id,
          dish_id: dishId
        }
      ])
      .select()
      .single();

    if (error) {
      throw new Error('Failed to add favorite');
    }

    res.status(201).json({
      message: 'Dish added to favorites',
      favorite
    });

  } catch (error) {
    console.error('Add favorite error:', error);
    res.status(500).json({
      error: 'Failed to add dish to favorites'
    });
  }
});

// DELETE /api/users/favorites/:dishId - Remove dish from favorites
router.delete('/favorites/:dishId', authMiddleware, async (req, res) => {
  try {
    const { dishId } = req.params;

    // Find and delete the favorite
    const { data: deleted, error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', req.user.id)
      .eq('dish_id', dishId)
      .select();

    if (error) {
      throw new Error('Failed to remove favorite');
    }

    if (!deleted || deleted.length === 0) {
      return res.status(404).json({
        error: 'Favorite not found'
      });
    }

    res.json({
      message: 'Dish removed from favorites'
    });

  } catch (error) {
    console.error('Remove favorite error:', error);
    res.status(500).json({
      error: 'Failed to remove dish from favorites'
    });
  }
});

// GET /api/users/favorites/check/:dishId - Check if dish is favorited
router.get('/favorites/check/:dishId', authMiddleware, async (req, res) => {
  try {
    const { dishId } = req.params;

    const { data: favorite, error } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('dish_id', dishId)
      .single();

    res.json({
      isFavorite: !!favorite
    });

  } catch (error) {
    // If no favorite found, just return false
    res.json({
      isFavorite: false
    });
  }
});

// POST /api/users/favorites/toggle/:dishId - Toggle dish favorite (add or remove)
router.post('/favorites/toggle/:dishId', authMiddleware, async (req, res) => {
  try {
    const { dishId } = req.params;

    // Check if dish exists
    const { data: dish, error: dishError } = await supabase
      .from('restaurant_dishes')
      .select('id')
      .eq('id', dishId)
      .single();

    if (dishError || !dish) {
      return res.status(404).json({
        error: 'Dish not found'
      });
    }

    // Check if already favorited
    const { data: existingFavorite } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('dish_id', dishId)
      .single();

    if (existingFavorite) {
      // Remove from favorites
      const { error: deleteError } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', req.user.id)
        .eq('dish_id', dishId);

      if (deleteError) {
        throw new Error('Failed to remove favorite');
      }

      return res.json({
        message: 'Dish removed from favorites',
        isFavorite: false
      });
    } else {
      // Add to favorites
      const { data: favorite, error: insertError } = await supabase
        .from('favorites')
        .insert([
          {
            user_id: req.user.id,
            dish_id: dishId
          }
        ])
        .select()
        .single();

      if (insertError) {
        throw new Error('Failed to add favorite');
      }

      return res.status(201).json({
        message: 'Dish added to favorites',
        isFavorite: true,
        favorite
      });
    }

  } catch (error) {
    console.error('Toggle favorite error:', error);
    res.status(500).json({
      error: 'Failed to toggle favorite'
    });
  }
});

module.exports = router;