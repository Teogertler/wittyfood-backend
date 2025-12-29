// routes/dishes.js
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const authMiddleware = require('../middleware/auth');
const { upload, handleUploadError } = require('../middleware/upload');
const { analyzeFoodImage, analyzeFoodDescription } = require('../config/aiService');
const { findMatchingDishes, filterByDistance } = require('../utils/dishMatching');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// POST /api/dishes/analyze-image - Analyze food image with AI
router.post('/analyze-image', 
  authMiddleware,
  upload.single('image'),
  handleUploadError,
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'No image file provided'
        });
      }

      // Convert image buffer to base64
      const base64Image = req.file.buffer.toString('base64');
      const mimeType = req.file.mimetype;

      // Analyze image with Claude AI
      const dishInfo = await analyzeFoodImage(base64Image, mimeType);

      res.json({
        message: 'Image analyzed successfully',
        dish: dishInfo
      });

    } catch (error) {
      console.error('Image analysis error:', error);
      res.status(500).json({
        error: 'Failed to analyze image',
        details: error.message
      });
    }
  }
);

// POST /api/dishes/analyze-text - Analyze food description with AI
router.post('/analyze-text', authMiddleware, async (req, res) => {
  try {
    const { description } = req.body;

    if (!description || description.trim().length === 0) {
      return res.status(400).json({
        error: 'Please provide a food description'
      });
    }

    // Analyze description with Claude AI
    const dishInfo = await analyzeFoodDescription(description);

    res.json({
      message: 'Description analyzed successfully',
      dish: dishInfo
    });

  } catch (error) {
    console.error('Text analysis error:', error);
    res.status(500).json({
      error: 'Failed to analyze description',
      details: error.message
    });
  }
});

// POST /api/dishes/find-matches - Find matching dishes at nearby restaurants
router.post('/find-matches', authMiddleware, async (req, res) => {
  try {
    const {
      targetDish,
      userLocation,
      maxDistance = 10, // km
      minSimilarity = 30,
      maxPrice
    } = req.body;

    if (!targetDish || !targetDish.name) {
      return res.status(400).json({
        error: 'Please provide target dish information'
      });
    }

    if (!userLocation || !userLocation.latitude || !userLocation.longitude) {
      return res.status(400).json({
        error: 'Please provide your location'
      });
    }

    // Get all restaurants
    const { data: allRestaurants, error: restaurantsError } = await supabase
      .from('restaurants')
      .select('*');

    if (restaurantsError) {
      throw new Error('Failed to fetch restaurants');
    }

    // Filter restaurants by distance
    const nearbyRestaurants = filterByDistance(
      allRestaurants,
      userLocation.latitude,
      userLocation.longitude,
      maxDistance
    );

    if (nearbyRestaurants.length === 0) {
      return res.json({
        message: 'No restaurants found within the specified distance',
        matches: []
      });
    }

    // Get all dishes from nearby restaurants
    const restaurantIds = nearbyRestaurants.map(r => r.id);
    const { data: allDishes, error: dishesError } = await supabase
      .from('restaurant_dishes')
      .select('*')
      .in('restaurant_id', restaurantIds);

    if (dishesError) {
      throw new Error('Failed to fetch dishes');
    }

    // Find matching dishes
    let matches = findMatchingDishes(targetDish, allDishes, minSimilarity);

    // Filter by price if specified
    if (maxPrice) {
      matches = matches.filter(dish => dish.price <= maxPrice);
    }

    // Enrich matches with restaurant info and distance
    const enrichedMatches = matches.map(dish => {
      const restaurant = nearbyRestaurants.find(r => r.id === dish.restaurant_id);
      return {
        ...dish,
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          address: restaurant.address,
          cuisine_type: restaurant.cuisine_type,
          rating: restaurant.rating,
          distance: restaurant.distance
        }
      };
    });

    res.json({
      message: `Found ${enrichedMatches.length} matching dishes`,
      matches: enrichedMatches,
      searchParams: {
        maxDistance,
        minSimilarity,
        maxPrice,
        restaurantsSearched: nearbyRestaurants.length
      }
    });

  } catch (error) {
    console.error('Find matches error:', error);
    res.status(500).json({
      error: 'Failed to find matching dishes',
      details: error.message
    });
  }
});

// GET /api/dishes/:dishId - Get dish details
router.get('/:dishId', authMiddleware, async (req, res) => {
  try {
    const { dishId } = req.params;

    const { data: dish, error } = await supabase
      .from('restaurant_dishes')
      .select(`
        *,
        restaurant:restaurants(*)
      `)
      .eq('id', dishId)
      .single();

    if (error || !dish) {
      return res.status(404).json({
        error: 'Dish not found'
      });
    }

    res.json({ dish });

  } catch (error) {
    console.error('Get dish error:', error);
    res.status(500).json({
      error: 'Failed to fetch dish details'
    });
  }
});

module.exports = router;
