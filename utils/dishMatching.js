// utils/dishMatching.js

/**
 * Calculate similarity between two dishes based on name, ingredients, and description
 * Returns a score from 0-100
 */
function calculateDishSimilarity(targetDish, restaurantDish) {
  let score = 0;
  let totalWeight = 0;

  // 1. Name similarity (weight: 40%)
  const nameWeight = 40;
  const nameScore = calculateTextSimilarity(
    targetDish.name?.toLowerCase() || '',
    restaurantDish.name?.toLowerCase() || ''
  );
  score += nameScore * nameWeight;
  totalWeight += nameWeight;

  // 2. Ingredients similarity (weight: 35%)
  if (targetDish.ingredients && restaurantDish.ingredients) {
    const ingredientsWeight = 35;
    const ingredientsScore = calculateArraySimilarity(
      targetDish.ingredients,
      restaurantDish.ingredients
    );
    score += ingredientsScore * ingredientsWeight;
    totalWeight += ingredientsWeight;
  }

  // 3. Description/category similarity (weight: 25%)
  if (targetDish.description && restaurantDish.description) {
    const descriptionWeight = 25;
    const descriptionScore = calculateTextSimilarity(
      targetDish.description?.toLowerCase() || '',
      restaurantDish.description?.toLowerCase() || ''
    );
    score += descriptionScore * descriptionWeight;
    totalWeight += descriptionWeight;
  }

  // Normalize score to 0-100
  const finalScore = totalWeight > 0 ? (score / totalWeight) * 100 : 0;
  return Math.round(finalScore);
}

/**
 * Calculate text similarity using word overlap
 */
function calculateTextSimilarity(text1, text2) {
  if (!text1 || !text2) return 0;

  // Tokenize and clean
  const words1 = new Set(text1.split(/\W+/).filter(w => w.length > 2));
  const words2 = new Set(text2.split(/\W+/).filter(w => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return 0;

  // Calculate Jaccard similarity
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Calculate similarity between two arrays of strings
 */
function calculateArraySimilarity(arr1, arr2) {
  if (!arr1 || !arr2 || arr1.length === 0 || arr2.length === 0) return 0;

  // Normalize arrays
  const set1 = new Set(arr1.map(item => item.toLowerCase().trim()));
  const set2 = new Set(arr2.map(item => item.toLowerCase().trim()));

  // Calculate overlap
  const intersection = new Set([...set1].filter(item => set2.has(item)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

/**
 * Filter and sort restaurant dishes by similarity
 */
function findMatchingDishes(targetDish, restaurantDishes, minSimilarity = 30) {
  const matches = restaurantDishes
    .map(dish => ({
      ...dish,
      similarity: calculateDishSimilarity(targetDish, dish)
    }))
    .filter(dish => dish.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity);

  return matches;
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 * Returns distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Filter restaurants by distance
 */
function filterByDistance(restaurants, userLat, userLon, maxDistance) {
  return restaurants
    .map(restaurant => ({
      ...restaurant,
      distance: calculateDistance(
        userLat,
        userLon,
        restaurant.latitude,
        restaurant.longitude
      )
    }))
    .filter(restaurant => restaurant.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance);
}

module.exports = {
  calculateDishSimilarity,
  findMatchingDishes,
  calculateDistance,
  filterByDistance
};
