# Telegram City Rater

A Telegram Web App that allows users to rate cities and see community rankings.

## Features

- 🏙️ Rate 1,500+ cities with like/dislike/don't know options
- 📊 View real-time community rankings
- 🎯 Continuous rating experience without interruptions
- 📱 Mobile-optimized Telegram Web App interface

## Tech Stack

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js, Express.js
- **Data**: JSON-based city database
- **Platform**: Telegram Web Apps

## Local Development

### Prerequisites
- Node.js (v14 or higher)
- Python 3 (for local frontend server)

### Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd telegram-city-rater
   ```

2. **Install backend dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Start the backend server**
   ```bash
   node server.js
   ```
   The backend will run on `http://localhost:3000`

4. **Start the frontend server** (in a new terminal)
   ```bash
   python3 -m http.server 8000
   ```
   The frontend will be available at `http://localhost:8000`

## Deployment

### Backend Deployment
- Deploy to Render, Railway, or Heroku
- Update the `API_URL` in `script.js` to point to your deployed backend

### Frontend Deployment
- Deploy to GitHub Pages, Netlify, or Vercel
- Use the deployed URL when creating your Telegram Web App

## Telegram Bot Setup

1. Create a bot with [@BotFather](https://t.me/botfather)
2. Create a Web App with `/newapp`
3. Set the URL to your deployed frontend
4. Share your bot with users!

## Project Structure

```
telegram-city-rater/
├── index.html          # Main HTML file
├── script.js           # Frontend JavaScript
├── style.css           # Styles
├── cities.json         # City database
├── backend/
│   ├── server.js       # Express server
│   ├── package.json    # Backend dependencies
│   └── node_modules/   # Backend packages
└── README.md           # This file
```

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT License # Force redeploy Wed Jun 25 02:51:15 MSK 2025
