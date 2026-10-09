# CityPulse AI — Universal Worldwide City Intelligence Copilot

> **“Explore Smarter. Travel Better. Stay Aware.”**
>
> **Hackathon:** Prompt War 2026
> **Problem Statement:** City Life — Exploring, Experiencing & Navigating the Chaos We Call Home.

---

## 🌟 What's New: Universal Worldwide City Search (Upgrade)

CityPulse AI has evolved from a single-city prototype into a **Universal Metropolitan Intelligence Platform**. Users can enter **ANY city or destination worldwide** (e.g. Pune, Mumbai, London, Tokyo, Paris, New York) and instantly receive:
- **Dynamic Geocoding & Interactive Maps:** OpenStreetMap Nominatim geocodes the city center and centers Leaflet maps with custom pins.
- **Authentic Cultural Heritage & Overview:** Real summaries, descriptions, and high-resolution photography fetched from the Wikipedia Official REST API.
- **Real-Time Atmospheric Weather:** Live temperature, apparent comfort, wind velocity, humidity, and meteorological condition advisories from Open-Meteo.
- **Emergency Hotline Directory:** Verified country-specific emergency telephone numbers (e.g., India unified `112` / `100`, UK `999 / 112`, USA `911`).
- **Dynamic Point-of-Interest Discovery:** Discovers attractions, food spots, public parks, and accommodation for the selected city.
- **Full Feature Integration:** The selected city automatically cascades into the **Explorer**, **CityPulse Smart Match™** algorithm, **Side-by-Side Comparison**, **Safety Dashboard**, and **City Insights**.

---

## 🚀 Quick Run Guide

### 1. Run Locally
The application runs as a Python Flask service:
```powershell
python app.py
```
Open your browser at:
```
http://127.0.0.1:5000/
```

### 2. Run Automated Verification Tests
To run all 8 integration tests covering city search, dynamic multi-city data, smart match, comparisons, and report submissions:
```powershell
python test_app.py
```

---

## 🌐 Real Open Data Sources & Connected APIs

| Service | Purpose | Authentication / Key Required | Rate-Limiting & Caching Strategy |
|---|---|---|---|
| **OpenStreetMap Nominatim** | Geocoding city names, addresses, and discovering real amenities | **None** (Strict User-Agent header supplied) | Caches query responses to `data/city_cache.json` to respect the 1 req/sec policy. |
| **Open-Meteo API** | Real-time weather, temperature, humidity, wind, and WMO condition codes | **None** (100% Free Open Service) | Refreshed dynamically per city session with graceful offline fallbacks. |
| **Wikipedia REST API (Wikimedia)** | City overviews, cultural history, landmark descriptions, and genuine photos | **None** (Public Educational Endpoints) | Cached persistently with direct attribution links to Wikipedia articles. |
| **Leaflet & OpenStreetMap Tiles** | Interactive spatial city navigation | **None** | Vector tiles streamed directly via CDN. |

> **Transparency Note:** All external data sources are 100% free open-access APIs that require **zero paid API keys or secret credentials**. No API keys are exposed in frontend code.

---

## 🧭 Live Demo Script for Hackathon Judges

Follow this presentation sequence:

1. **The Vision & Universal Search:**
   - *Say:* "CityPulse AI is no longer hardcoded to one sample city. Users can now search for any city on the planet."
   - *Action:* On the homepage, type `Pune` in the search box. Notice the instant autocomplete suggestions. Click **Explore City** (or select a quick pill like `📍 Pune`, `📍 Mumbai`, or `📍 London`).
2. **Dynamic City Overview Banner:**
   - *Show:* The newly loaded city banner showing Pune's real skyline, live Open-Meteo temperature (e.g. 33°C), emergency number (112), and Wikipedia history.
   - *Action:* Click **📖 Read Cultural History** to open the encyclopedia extract.
3. **Dynamic Explorer & Interactive Leaflet Map:**
   - *Show:* The places grid now shows authentic Pune attractions (e.g., *Savitribai Phule Pune University*, *Raireshwar*, *Khadakwasla Dam*).
   - *Action:* Toggle the **Interactive Map** button to see Leaflet fly to Pune's exact latitude and longitude (`18.5204° N, 73.8545° E`) with clickable pins.
4. **Smart Match Calibrated to Chosen City:**
   - *Action:* Switch to **Smart Match AI**. Select `Culture & History` and `Budget / Free ($)`. Click **Re-Calculate**. Point out the calculated 99% match score calibrated to Pune's actual sites.
5. **Multi-City Comparison (Pune vs London):**
   - *Action:* Click the `📍 London` chip. Notice the smooth loading state while Open-Meteo fetches London's temperature (16°C) and OpenStreetMap discovers London landmarks.
6. **Side-by-Side Comparison:**
   - *Action:* Switch to **Compare Places** to contrast two destinations across Affordability, Ratings, Accessibility, Cleanliness, Distance, and Safety.
7. **Citizen Reporting & Emergency Intelligence:**
   - *Action:* Click **Report City Issue**, submit a note for the active city, and show it appearing at the top of the feed with disk persistence.

---

## ☁️ Deployment Guide (GitHub & Vercel)

### Option A: GitHub
1. Initialize git and commit:
   ```powershell
   git init
   git add .
   git commit -m "feat: CityPulse AI universal city search and open-data intelligence"
   ```
2. Push to your GitHub repository:
   ```powershell
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git branch -M main
   git push -u origin main
   ```

### Option B: Vercel Deployment
CityPulse AI includes pre-configured [`vercel.json`](file:///c:/Users/Shree/Desktop/prompt%20war%20hackethon/vercel.json) using `@vercel/python`.

#### How Vercel Handles Flask:
- Vercel runs Python applications via AWS Lambda Serverless Functions.
- `@vercel/python` automatically detects `app.py` and routes all traffic `/(.*)` to the Flask WSGI instance.
- **Serverless Ephemeral Storage Consideration:** Vercel serverless environments have a read-only filesystem except for `/tmp/`. Both `app.py` and `city_service.py` automatically detect `os.environ.get("VERCEL")` and redirect report writes and cache storage to `/tmp/`. For permanent multi-user persistence in production, connect a PostgreSQL / Supabase instance via environment variable.

#### Deploying to Vercel in 2 Steps:
1. Install Vercel CLI (or connect your GitHub repo via [vercel.com](https://vercel.com)):
   ```powershell
   npm i -g vercel
   vercel
   ```
2. Accept the default configuration. Vercel will build using Python 3 and deploy your live URL in under 2 minutes.

---

## 📊 Summary of Implemented Requirements
- [x] **Universal City Search** with real-time autocompletion and misspelling tolerance.
- [x] **OpenStreetMap Nominatim** integration with User-Agent compliance.
- [x] **Open-Meteo Weather** integration (live, zero API key required).
- [x] **Wikipedia Official REST API** integration for history, culture, and photos.
- [x] **Smart Caching Layer** (`data/city_cache.json`) for sub-second repeat queries.
- [x] **Full 5-Feature Integration** (Explorer, Smart Match, Compare, Safety, Insights).
- [x] **8 / 8 Automated Tests Passing** in `test_app.py`.
- [x] **Tested on Pune, Mumbai, and London** with distinct dynamic data.
- [x] **Ready for GitHub & Vercel** with `vercel.json` and `.gitignore`.
