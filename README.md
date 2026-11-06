# BIOZO Portal Full-Stack Setup

This project now includes:

- `biozo9.html`: frontend portal page
- `server.js`: Express backend with SQLite database persistence
- `biozo.db`: local SQLite database file (ignored by git)
- `package.json`: Node.js dependencies and start scripts

## Local setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Open the app:
   ```
   http://localhost:3000/biozo9.html
   ```

## API endpoints

- `POST /api/applications` — save a new application
- `GET /api/updates` — fetch updates
- `GET /api/stats` — fetch application stats
- `GET /api/applications` — read saved application summaries

## Deployment

This can be deployed to any Node.js host that supports Express, such as Vercel (serverless), Render, Railway, or Heroku.
