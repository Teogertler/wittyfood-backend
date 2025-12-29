// routes/restaurants.js
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const authMiddleware = require('../middleware/auth');
const { calculateDistance } = require('../utils/dishMatching');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// GET /api/restaurants - Get all restaurants
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { latitude, longitude, maxDistance, cuisineType } = req.query;

    let query = supabase
      .from('restaurants')
      .select('*')
      .order('name');

    // Filter by cuisine type if provided
    if (cuisineType) {
      query = query.eq('cuisine_type', cuisineType);
    }

    const { data: restaurants, error } = await query;

    if (error) {
      throw new Error('Failed to fetch restaurants');
    }

    // Add distance if user location provided
    let result = restaurants;
    if (latitude && longitude) {
      result = restaurants.map(restaurant => ({
        ...restaurant,
        distance: calculateDistance(
          parseFloat(latitude),
          parseFloat(longitude),
          restaurant.latitude,
          restaurant.longitude
        )
      }));

      // Filter by distance if specified
      if (maxDistance) {
        result = result.filter(r => r.distance <= parseFloat(maxDistance));
      }

      // Sort by distance
      result.sort((a, b) => a.distance - b.distance);
    }

    res.json({
      restaurants: result,
      count: result.length
    });

  } catch (error) {
    console.error('Get restaurants error:', error);
    res.status(500).json({
      error: 'Failed to fetch restaurants'
    });
  }
});

// GET /api/restaurants/:restaurantId - Get restaurant details
router.get('/:restaurantId', authMiddleware, async (req, res) => {
  try {
    const { restaurantId } = req.params;

    const { data: restaurant, error } = await supabase
      .from('restaurants')
      .select('*')
      .eq('id', restaurantId)
      .single();

    if (error || !restaurant) {
      return res.status(404).json({
        error: 'Restaurant not found'
      });
    }

    res.json({ restaurant });

  } catch (error) {
    console.error('Get restaurant error:', error);
    res.status(500).json({
      error: 'Failed to fetch restaurant details'
    });
  }
});

// GET /api/restaurants/:restaurantId/menu - Get restaurant menu
router.get('/:restaurantId/menu', authMiddleware, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { category, maxPrice, minPrice } = req.query;

    // First check if restaurant exists
    const { data: restaurant, error: restaurantError } = await supabase
      .from('restaurants')
      .select('id, name')
      .eq('id', restaurantId)
      .single();

    if (restaurantError || !restaurant) {
      return res.status(404).json({
        error: 'Restaurant not found'
      });
    }

    // Build dishes query
    let query = supabase
      .from('restaurant_dishes')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('name');

    // Apply filters
    if (category) {
      query = query.eq('category', category);
    }

    if (minPrice) {
      query = query.gte('price', parseFloat(minPrice));
    }

    if (maxPrice) {
      query = query.lte('price', parseFloat(maxPrice));
    }

    const { data: dishes, error: dishesError } = await query;

    if (dishesError) {
      throw new Error('Failed to fetch menu');
    }

    res.json({
      restaurant: {
        id: restaurant.id,
        name: restaurant.name
      },
      menu: dishes,
      count: dishes.length
    });

  } catch (error) {
    console.error('Get menu error:', error);
    res.status(500).json({
      error: 'Failed to fetch restaurant menu'
    });
  }
});

// GET /api/restaurants/search/nearby - Search nearby restaurants
router.get('/search/nearby', authMiddleware, async (req, res) => {
  try {
    const { latitude, longitude, radius = 5 } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        error: 'Please provide latitude and longitude'
      });
    }

    const { data: restaurants, error } = await supabase
      .from('restaurants')
      .select('*');

    if (error) {
      throw new Error('Failed to fetch restaurants');
    }

    // Calculate distances and filter
    const nearbyRestaurants = restaurants
      .map(restaurant => ({
        ...restaurant,
        distance: calculateDistance(
          parseFloat(latitude),
          parseFloat(longitude),
          restaurant.latitude,
          restaurant.longitude
        )
      }))
      .filter(restaurant => restaurant.distance <= parseFloat(radius))
      .sort((a, b) => a.distance - b.distance);

    res.json({
      restaurants: nearbyRestaurants,
      count: nearbyRestaurants.length,
      searchRadius: parseFloat(radius)
    });

  } catch (error) {
    console.error('Search nearby error:', error);
    res.status(500).json({
      error: 'Failed to search nearby restaurants'
    });
  }
});

module.exports = router;
