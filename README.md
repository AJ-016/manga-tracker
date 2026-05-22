# NEXUSLIST 📚

NexusList is a premium, minimalist dark-themed dashboard application built to track Manga, Manhua, and Manhwa reading progress. It features direct user authentication, a streamlined dynamic chapter manager, automatic image optimization, and smart automated cloud storage garbage collection.

## ✨ Key Features

- **Isolated User Profiles:** Full user authentication powered by Supabase Auth, ensuring everyone maintains completely separate, private tracking shelves.
- **Dynamic Chapter Engine:** Instantly update chapter increments with responsive step-counters, or open the detailed editor to modify fields.
- **Smart Image Uploads & Compression:** Allows local photo file uploads directly from any device. Photos are automatically crunched to highly optimized sub-50KB `.webp` assets in the browser before being streamed to cloud buckets.
- **Automated Storage Garbage Collection:** Implements proactive data cleaning. When a tracking row is deleted, or a cover image is replaced, the old image asset is automatically purged from the Supabase Storage bucket, protecting your free tier storage limits from bloated file accumulation.
- **Premium UI/UX:** Responsive grid cards utilizing glassmorphic details, clear text truncation, clean loading state spinners, and vibrant glowing neon accent indicators customized by content type.

## 🛠️ Built With

- **Frontend Framework:** React.js (Vite)
- **Database & Authentication Backend:** Supabase (PostgreSQL with Row-Level Security)
- **Cloud Object Storage:** Supabase Storage Buckets
- **Image Processing Library:** `browser-image-compression`
- **Typography & Aesthetics:** Plus Jakarta Sans & Custom Inline Responsive CSS Styles

## 🚀 Local Development Setup

To run this project locally on your machine, follow these configurations:

### 1. Clone the repository
```
git clone <your-github-repository-url>
cd nexuslist
```
### 2. Install dependencies
```
npm install
```
### 3. Setup Environment Variables
Create a file named .env.local in your root directory and paste your Supabase configurations:

```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_public_api_key
```
### 4. Fire up the local dev server
```
npm run dev
```
Open http://localhost:5173 in your browser to interact with the client!

## 🔐 Database & Storage Configuration Reference
This application relies on explicit Postgres schema policies to isolate data correctly across multiple profiles:

Database Row Level Security (RLS)
The reading_list table contains an auto-incrementing identity primary key id and a foreign key link user_id mapped to auth.users(id). Access is constrained via this SQL policy rule for all operations:

```
auth.uid() = user_id
```

Storage Bucket Policy Rules
Images are routed into individual user folders inside a public bucket named covers. Folder isolation is strictly maintained through this bucket insertion condition text definition:

```
(auth.uid()::text = (storage.foldername(name))[1])
```

## 🌐 Production Deployment
This application is configured for production hosting on Vercel. Every update pushed to the main git branch automatically compiles, bundles, optimizes, and updates the live web application domain.
