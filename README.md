<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/1e0f3ed5-d2ad-4051-ab01-aa73bcfce7a2

## Project map

- src/features: the three user-facing areas — menu, admin, and reviews.
- src/components: only shared media and allergen UI.
- src/lib: browser API and menu helpers.
- server: application startup, database, HTTP helpers, and domain modules.
- shared: types shared by the browser and server.
- tests and scripts: verification and maintained database tooling.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy on Render (Option A)

This app needs a Node server + SQLite database (`menu.db`), so deploy it as a web service (not a static site).

1. Push this repo to GitHub.
2. In Render: create a **New Web Service** from your repo.
3. Render settings:
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `npm run start`
   - **Environment Variables**:
     - `DB_PATH=/var/data/menu.db` (recommended)
     - `ADMIN_PASSWORD=your-owner-password` (required for admin login)
     - `ADMIN_SESSION_SECRET=a-long-random-secret` (required to keep admin sessions signed)
     - `GEMINI_API_KEY=...` (optional, enables auto-translation for new items)
4. Add a **persistent disk** mounted at `/var/data` (or use the provided `render.yaml`).

On first boot, the server will seed the mounted DB from the repo's `menu.db` if the disk is empty.

Guests never need these admin variables. QR codes should point to the public menu URL, for example `/dismak-oil`, and will open without login.
