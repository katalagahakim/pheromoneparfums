# Local Testing Guide

## ✅ Blog is Running!

Your blog is currently running at: **http://localhost:8080**

---

## 🔗 Test These Pages:

### 1. **Homepage**
http://localhost:8080

View the main landing page with latest reviews.

---

### 2. **Search Page** (NEW!)
http://localhost:8080/search/

Test the new search and filter functionality:
- Search by product name, brand, or keyword
- Filter by product type (cologne, oil, etc.)
- Filter by gender target
- Filter by brand
- Filter by minimum rating
- Filter by pheromone compounds

**Try searching for**: "Alfa Maschio", "cologne", "pheromone", etc.

---

### 3. **All Reviews**
http://localhost:8080/reviews/

Browse all existing reviews.

---

### 4. **Search Index JSON** (Backend)
http://localhost:8080/search-index.json

View the raw search index data that powers the search functionality.

---

### 5. **Individual Review Pages**
- http://localhost:8080/content/blog/alfa-maschio/
- http://localhost:8080/content/blog/pheromonexs-signature/
- http://localhost:8080/content/blog/nexus-pheromones/
- http://localhost:8080/content/blog/pherazone-review/
- http://localhost:8080/content/blog/pheromax-for-women/
- http://localhost:8080/content/blog/true-pheromones-alpha-q/

---

## 📝 What's Working:

✅ Static blog generation (Eleventy)
✅ Search index generation
✅ Client-side search JavaScript
✅ Filter functionality
✅ All existing review pages

---

## ⚠️ What's NOT Testable Locally (Requires Cloudflare):

❌ **Web scraping functionality** - Requires Cloudflare Workers environment
❌ **D1 Database** - Only available in Cloudflare environment
❌ **KV Storage** - Only available in Cloudflare environment
❌ **Cron jobs** - Only run in Cloudflare environment
❌ **Autonomous agent** - Requires all of the above

---

## 🧪 To Test the Scraping Agent:

You have two options:

### Option 1: Deploy to Cloudflare (Recommended)

Follow the `SETUP.md` guide to deploy everything to Cloudflare, then you can:
1. Trigger manual scrape via API
2. Test with actual data sources
3. See real reviews being fetched and published

### Option 2: Mock Test (Development)

You can create a mock test by:

1. Create a test file: `functions/api/src/test-agent.js`
2. Mock the environment variables
3. Mock the D1 and KV responses
4. Run with `node functions/api/src/test-agent.js`

Would you like me to create a mock test script?

---

## 🎯 Current Status:

**Frontend (Blog)**: ✅ Fully functional locally
**Search**: ✅ Fully functional locally
**Backend (Agent)**: ⏳ Needs Cloudflare environment to test

---

## 🚀 Next Steps:

1. **Test the search page** at http://localhost:8080/search/
2. **Verify existing reviews** load correctly
3. **Check the search index JSON** is generating properly
4. If everything looks good, proceed with Cloudflare deployment using `SETUP.md`

---

## 📌 Notes:

- The search page will show your existing 7 reviews with filtering
- Once you deploy and run the scraper, new reviews will appear here automatically
- The search index rebuilds every time Eleventy builds the site
- All review data is stored in markdown files in `blog/content/blog/`

---

## 🛑 To Stop the Local Server:

Press `Ctrl+C` in the terminal where the server is running.

Or if you need to kill it manually, look for the process on port 8080.

---

**Enjoy testing! 🎉**
