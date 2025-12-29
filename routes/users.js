// routes/users.js
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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

// GET /api/users/favorites - Get user's favorite dishes
router.get('/favorites', authMiddleware, async (req, res) => {
  try {
    const { data: favorites, error } = await supabase
      .from('favorites')
      .select(`
        id,
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

module.exports = router;
