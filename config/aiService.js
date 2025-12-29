// config/aiService.js
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Analyze food image using Claude Vision API
 * @param {string} base64Image - Base64 encoded image data
 * @param {string} mimeType - Image MIME type (e.g., 'image/jpeg', 'image/png')
 */
async function analyzeFoodImage(base64Image, mimeType) {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: `Analyze this food image and provide the following information in JSON format:
{
  "name": "name of the dish",
  "cuisine": "type of cuisine (e.g., Italian, Chinese, American)",
  "description": "brief description of the dish and its appearance",
  "ingredients": ["ingredient1", "ingredient2", "ingredient3"],
  "estimatedCalories": number (reasonable estimate),
  "dietaryInfo": ["vegetarian", "vegan", "gluten-free", etc. - leave empty array if none apply"],
  "confidence": number between 0-100 (how confident you are in the identification)
}

Respond ONLY with the JSON object, no additional text.`
            }
          ],
        },
      ],
    });

    const responseText = message.content[0].text;
    
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      
      // Validate and format the response
      return {
        name: analysis.name || analysis.dishName || 'Unknown Dish',
        cuisine: analysis.cuisine || 'Unknown',
        description: analysis.description || '',
        ingredients: analysis.ingredients || analysis.mainIngredients || [],
        estimatedCalories: analysis.estimatedCalories || 0,
        dietaryInfo: analysis.dietaryInfo || [],
        confidence: analysis.confidence || 0
      };
    }
    
    throw new Error('Could not parse AI response');
  } catch (error) {
    console.error('Error analyzing food image:', error);
    throw new Error(`Failed to analyze image: ${error.message}`);
  }
}

/**
 * Analyze food description text using Claude
 * @param {string} description - Text description of the food
 */
async function analyzeFoodDescription(description) {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Based on this food description: "${description}", provide the following information in JSON format:
{
  "name": "name of the dish",
  "cuisine": "type of cuisine (e.g., Italian, Chinese, Mexican)",
  "description": "detailed description of the dish",
  "ingredients": ["ingredient1", "ingredient2", "ingredient3"],
  "estimatedCalories": number (reasonable estimate),
  "dietaryInfo": ["vegetarian", "vegan", "gluten-free", etc. - leave empty array if none apply"],
  "confidence": number between 0-100
}

Respond ONLY with the JSON object, no additional text.`
        },
      ],
    });

    const responseText = message.content[0].text;
    
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      
      // Validate and format the response
      return {
        name: analysis.name || analysis.dishName || 'Unknown Dish',
        cuisine: analysis.cuisine || 'Unknown',
        description: analysis.description || description,
        ingredients: analysis.ingredients || analysis.mainIngredients || [],
        estimatedCalories: analysis.estimatedCalories || 0,
        dietaryInfo: analysis.dietaryInfo || [],
        confidence: analysis.confidence || 0
      };
    }
    
    throw new Error('Could not parse AI response');
  } catch (error) {
    console.error('Error analyzing food description:', error);
    throw new Error(`Failed to analyze description: ${error.message}`);
  }
}

/**
 * Get detailed nutritional information for a dish
 * @param {string} dishName - Name of the dish
 */
async function getNutritionalInfo(dishName) {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: `Provide detailed nutritional information for "${dishName}" in JSON format:
{
  "dishName": "${dishName}",
  "servingSize": "typical serving size (e.g., 1 cup, 200g)",
  "calories": number,
  "macronutrients": {
    "protein": "Xg",
    "carbohydrates": "Xg",
    "fat": "Xg",
    "fiber": "Xg"
  },
  "vitamins": ["vitamin A", "vitamin C", etc.],
  "minerals": ["iron", "calcium", etc.],
  "ingredients": ["detailed ingredient 1", "detailed ingredient 2"],
  "allergens": ["common allergens present like nuts, dairy, gluten"],
  "healthBenefits": ["benefit 1", "benefit 2", "benefit 3"]
}

Provide accurate, typical nutritional information for a standard serving. Respond ONLY with the JSON object, no additional text.`
        },
      ],
    });

    const responseText = message.content[0].text;
    
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const nutritionInfo = JSON.parse(jsonMatch[0]);
      return nutritionInfo;
    }
    
    throw new Error('Could not parse AI response');
  } catch (error) {
    console.error('Error getting nutritional info:', error);
    throw new Error(`Failed to get nutritional info: ${error.message}`);
  }
}

/**
 * Test the AI service connection
 */
async function testConnection() {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: 'Respond with: "AI Service Connected"'
        }
      ],
    });

    console.log('✅ AI Service connected:', message.content[0].text);
    return true;
  } catch (error) {
    console.error('❌ AI Service connection failed:', error.message);
    return false;
  }
}

module.exports = {
  analyzeFoodImage,
  analyzeFoodDescription,
  getNutritionalInfo,
  testConnection
};