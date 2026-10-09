# LearnFlow deployment

## Local

Backend `.env`:

```env
PORT=3000
NODE_ENV=development
MONGODB_URI=...
JWT_SECRET=...
CLIENT_URL=http://localhost:5173
VIDEOS_CSV=data/videos_final.csv
PDFS_CSV=data/pdfs_final.csv
```

Frontend `.env`:

```env
VITE_API_URL=http://localhost:3000/api
```

Run:

```bash
cd backend
npm install
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

## Render backend

- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`

Environment variables:

```env
NODE_ENV=production
MONGODB_URI=...
JWT_SECRET=...
CLIENT_URL=https://YOUR-FRONTEND.vercel.app
VIDEOS_CSV=data/videos_final.csv
PDFS_CSV=data/pdfs_final.csv
```

Do not add a trailing slash to `CLIENT_URL`.

## Vercel frontend

Environment variable:

```env
VITE_API_URL=https://YOUR-BACKEND.onrender.com/api
```

Redeploy the frontend after changing `VITE_API_URL`.

## Cookie auth

Production uses an HttpOnly cookie with `Secure=true` and `SameSite=None`.
Use the Vercel frontend with the Render backend for production testing. For local development, use the local frontend with the local backend.
