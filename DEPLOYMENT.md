# MAMRS Deployment Guide: Supabase (PostgreSQL) + Render + Custom Domain

This guide details how to deploy the Mood and Action-Based Music Recommendation System (MAMRS) to **Render** using a **Supabase PostgreSQL** database and custom domain **`music.jaynishthakar.tech`**.

---

## What We Need From You

To complete the live deployment, you will need:

1. **Supabase Connection String (`DATABASE_URL`)**:
   - From your Supabase project dashboard.
2. **Render Account**:
   - Connected to your GitHub account to deploy the repository.
3. **DNS Access for `jaynishthakar.tech`**:
   - Ability to add a `CNAME` record pointing `music` to Render.

---

## 1. Supabase PostgreSQL Setup

1. Log into [Supabase](https://supabase.com) and create a new project (e.g., `mamrs-db`). Choose a region close to your target audience or Render instance (e.g., US East / Oregon).
2. Go to **Project Settings** (gear icon) ➔ **Database**.
3. Scroll down to **Connection parameters** / **Connection string**:
   - Select the **URI** tab.
   - Choose **Transaction pooler** (recommended for serverless/cloud instances on port `6543`) or **Direct connection** (port `5432`).
   - Copy the URI, which looks like:
     ```
     postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
     ```
   - **Important:** Replace `[YOUR-PASSWORD]` with your actual database password.

> **Automatic Schema Migration & Seeding:**
> You do **not** need to run any manual SQL migration scripts in Supabase! When MAMRS boots with `DATABASE_URL`, its built-in PostgreSQL adapter (`src/pgDatabase.js`) automatically initializes all 9 tables, indexes, and seeds the extended catalog on first connection.

---

## 2. Render Web Service Setup

### Option A: Using `render.yaml` (Recommended)
1. In your [Render Dashboard](https://dashboard.render.com), click **New +** ➔ **Blueprint**.
2. Connect your GitHub repository (`mamrs`).
3. Select the branch: `feat/supabase-postgres-deployment`.
4. Render will detect `render.yaml`.
5. Enter your `DATABASE_URL` value when prompted.
6. Click **Apply**.

### Option B: Manual Setup
1. In your Render Dashboard, click **New +** ➔ **Web Service**.
2. Connect your repository and select branch: `feat/supabase-postgres-deployment`.
3. Configure the service settings:
   - **Name:** `mamrs`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** `Free`
   - **Health Check Path:** `/api/health`
4. In **Environment Variables**, add:
   - `NODE_VERSION`: `22.14.0`
   - `COOKIE_SECURE`: `true`
   - `DATABASE_URL`: `<your-supabase-connection-string>`
5. Click **Create Web Service**.

---

## 3. Custom Domain Setup (`music.jaynishthakar.tech`)

1. Once your Render web service is created, go to **Settings** ➔ **Custom Domains** in the Render dashboard.
2. Click **Add Custom Domain** and enter:
   ```
   music.jaynishthakar.tech
   ```
3. Render will provide a CNAME target (typically `mamrs-xxxx.onrender.com` or `render.com`).
4. Log into your DNS provider for `jaynishthakar.tech` (e.g. Cloudflare, Namecheap, GoDaddy, Hostinger):
   - Add a new record:
     - **Type:** `CNAME`
     - **Name / Host:** `music`
     - **Value / Target:** `<your-render-subdomain>.onrender.com`
     - **TTL:** Auto or 3600
5. Return to Render and click **Verify**. Render will verify DNS propagation and issue a free SSL/TLS certificate via Let's Encrypt within a few minutes.

---

## 4. Local Testing with PostgreSQL (Optional)

If you wish to test with your Supabase database locally before deploying to Render:

```bash
# In Windows PowerShell:
$env:DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres"
npm start
```

If `DATABASE_URL` is omitted, MAMRS automatically falls back to the local SQLite database in `data/mamrs.sqlite`.
