# WittyFood2 Backend

AI-powered food discovery backend service.

## Quick Start (Local Development)

```bash
# Install dependencies
npm install

# Create .env file (copy from .env.example)
cp .env.example .env
# Edit .env with your actual credentials

# Start development server
npm run dev

# Or start production server
npm start
```

## Deploy to Railway

### Prerequisites
1. [Railway Account](https://railway.app/) (free tier available)
2. [GitHub Account](https://github.com/)
3. Your environment variables ready

### Step-by-Step Deployment

#### 1. Push Code to GitHub

```bash
# Initialize git if not already done
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - WittyFood2 Backend"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/wittyfood-backend.git
git branch -M main
git push -u origin main
```

#### 2. Deploy on Railway

1. Go to [railway.app](https://railway.app/)
2. Click **"Start a New Project"**
3. Select **"Deploy from GitHub repo"**
4. Authorize Railway to access your GitHub
5. Select your `wittyfood-backend` repository
6. Railway will auto-detect Node.js and start building

#### 3. Add Environment Variables

In Railway dashboard:
1. Click on your project
2. Go to **"Variables"** tab
3. Click **"+ New Variable"** and add these:

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `SUPABASE_URL` | Your Supabase URL |
| `SUPABASE_ANON_KEY` | Your Supabase anon key |
| `SUPABASE_SERVICE_KEY` | Your Supabase service key |
| `JWT_SECRET` | Your JWT secret (64+ chars) |
| `ANTHROPIC_API_KEY` | Your Claude API key |
| `FRONTEND_URL` | Your frontend URL |

**Note:** `PORT` is automatically set by Railway.

#### 4. Get Your Live URL

1. Go to **Settings** → **Domains**
2. Click **"Generate Domain"**
3. You'll get a URL like: `https://wittyfood-backend-production.up.railway.app`

#### 5. Update Mobile App

Update your mobile app's `.env`:
```
EXPO_PUBLIC_API_URL=https://your-app.up.railway.app
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/auth/register` | Register user |
| POST | `/api/auth/login` | Login user |
| POST | `/api/dishes/analyze` | Analyze food image |
| GET | `/api/dishes/search` | Search dishes |
| GET | `/api/restaurants` | Get restaurants |
| GET | `/api/users/profile` | Get user profile |

## Environment Variables

See `.env.example` for all required variables.

## Project Structure

```
├── server.js          # Main entry point
├── config/
│   ├── aiService.js   # Claude AI integration
│   └── database.js    # Supabase connection
├── middleware/
│   ├── auth.js        # JWT authentication
│   └── upload.js      # File upload handling
├── routes/
│   ├── auth.js        # Authentication routes
│   ├── dishes.js      # Dish routes
│   ├── restaurants.js # Restaurant routes
│   └── users.js       # User routes
├── utils/
│   └── dishMatching.js # Dish matching logic
├── railway.json       # Railway config
├── package.json
└── .env.example
```

## Troubleshooting

### Build Fails on Railway
- Check all environment variables are set
- Ensure `package.json` has correct `start` script
- Check Railway logs for specific errors

### CORS Issues
- The backend allows all origins by default for mobile apps
- Mobile apps don't send Origin headers, so they're allowed

### API Returns 500 Errors
- Check Railway logs: Dashboard → Your Project → Logs
- Verify all environment variables are correct
- Test health endpoint: `https://your-app.up.railway.app/api/health`
