# Setup Fully Autonomous Daily Scraping

The site is configured to scrape reviews automatically, but needs one final setup step.

## Option 1: EasyCron (100% Free, No PC Required)

1. Go to https://www.easycron.com/user/register
2. Create a free account (no credit card needed)
3. Click "Add Cron Job"
4. Set:
   - **URL**: `https://pheromone-parfums.wzmcghee.workers.dev/test-autonomous`
   - **Method**: POST
   - **Time**: Every day at 3:00 AM
   - **Timezone**: Your timezone
5. Save

That's it! Reviews will scrape daily automatically.

## Option 2: GitHub Actions (Currently Disabled Due to Errors)

The GitHub Action in `.github/workflows/daily-scraper.yml` is currently disabled.
It can be re-enabled once the runtime errors are fixed.

## Option 3: Windows Task Scheduler (Requires PC to be On)

Run `setup-daily-scraper.bat` to schedule the scraper to run daily at 3 AM.

**Note**: Your PC must be on and connected to internet at 3 AM.

## Manual Trigger

You can manually trigger scraping anytime:

```bash
npm run scrape
```

Or via URL:
```
curl -X POST https://pheromone-parfums.wzmcghee.workers.dev/test-autonomous
```

## What Gets Scraped

- Reddit r/pheromones (reviews with 300+ characters)
- Product images from Shopify, Amazon, Forums, Google Images
- Groups reviews by product (needs 3+ reviews to publish)
- Commits to GitHub automatically
- Cloudflare Pages rebuilds site automatically

## How to Check if It's Working

1. Wait 2-3 minutes after trigger
2. Run: `git pull`
3. Look for commits like: "🤖 Autonomous daily update: [Product] reviews"
4. Visit https://pheromoneparfumsagent.pages.dev/reviews/

---

**Recommended**: Use Option 1 (EasyCron) for truly autonomous operation.
