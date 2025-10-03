# Setup Instructions - Autonomous Pheromone Review System

This guide will walk you through setting up the autonomous review scraping and publishing system.

## Prerequisites

- Node.js installed (v18 or higher)
- Cloudflare account
- GitHub account with repository access
- OpenAI API key

---

## Step 1: Install Dependencies

```bash
npm install
```

---

## Step 2: Create Cloudflare D1 Database

```bash
# Create the D1 database
npx wrangler d1 create pheromone_reviews
```

**Output will look like:**
```
✅ Successfully created DB 'pheromone_reviews'

[[d1_databases]]
binding = "DB"
database_name = "pheromone_reviews"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Copy the `database_id` and update it in `wrangler.toml`** (line 17).

---

## Step 3: Create Cloudflare KV Namespace

```bash
# Create KV namespace
npx wrangler kv:namespace create "PHEROMONE_KV"
```

**Output will look like:**
```
🌀 Creating namespace with title "pheromone-parfums-PHEROMONE_KV"
✨ Success!
Add the following to your wrangler.toml:
{ binding = "KV", id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
```

**Copy the `id` and update it in `wrangler.toml`** (line 24).

---

## Step 4: Run Database Migrations

```bash
# Apply the schema to your D1 database
npx wrangler d1 execute pheromone_reviews --file=./migrations/schema.sql
```

This will create all the necessary tables and seed initial data.

---

## Step 5: Set Environment Secrets

```bash
# Set GitHub token (needs repo write access)
npx wrangler secret put GITHUB_TOKEN
# Paste your GitHub personal access token when prompted

# Set OpenAI API key
npx wrangler secret put OPENAI_API_KEY
# Paste your OpenAI API key when prompted
```

### How to get these tokens:

**GitHub Token:**
1. Go to https://github.com/settings/tokens
2. Click "Generate new token" → "Generate new token (classic)"
3. Give it a name like "Pheromone Review Bot"
4. Select scopes: `repo` (full control)
5. Click "Generate token" and copy it

**OpenAI API Key:**
1. Go to https://platform.openai.com/api-keys
2. Click "Create new secret key"
3. Copy the key (it won't be shown again)

---

## Step 6: Test Locally (Optional)

```bash
# Build the blog
npm run build

# Test the worker locally
npx wrangler dev functions/api/src/index.js --local
```

Visit `http://localhost:8787/health` to verify the worker is running.

---

## Step 7: Deploy to Cloudflare

```bash
# Deploy the worker
npx wrangler deploy

# Deploy the blog to Cloudflare Pages
npm run deploy
```

---

## Step 8: Trigger First Scrape

After deployment, trigger the first scrape manually:

```bash
# Get your worker URL from the deploy output, then:
curl -X POST https://pheromone-parfums.YOUR-SUBDOMAIN.workers.dev/scrape
```

Or visit your worker's URL and add `/scrape` as a POST request using a tool like Postman.

---

## Step 9: Verify Everything Works

### Check the worker logs:
```bash
npx wrangler tail
```

### Check the database:
```bash
# See all reviews
npx wrangler d1 execute pheromone_reviews --command="SELECT COUNT(*) as review_count FROM reviews"

# See all products
npx wrangler d1 execute pheromone_reviews --command="SELECT * FROM products"

# See crawl log
npx wrangler d1 execute pheromone_reviews --command="SELECT * FROM crawl_log ORDER BY crawled_at DESC LIMIT 10"
```

---

## Daily Automated Scraping

The system is configured to run automatically every day at 3 AM UTC via the cron trigger in `wrangler.toml`:

```toml
[triggers]
crons = ["0 3 * * *"]
```

You can change this schedule as needed. Cron format: `minute hour day month dayOfWeek`

---

## Troubleshooting

### Worker fails to start

- **Check that D1 database_id and KV id are correct in wrangler.toml**
- Run `npx wrangler dev` to see detailed error messages

### No reviews are being scraped

- Check the crawl_log table: `npx wrangler d1 execute pheromone_reviews --command="SELECT * FROM crawl_log"`
- Verify robots.txt allows scraping on target sites
- Check rate limiting isn't blocking requests

### Reviews aren't appearing on the site

- Make sure reviews have `published_to_github = 1` in the database
- Check GitHub repository for new commits
- Wait for Cloudflare Pages to rebuild (usually 1-2 minutes)
- Clear browser cache

### OpenAI API errors

- Verify your API key is correct: `npx wrangler secret list`
- Check your OpenAI account has credits
- Review the error in worker logs: `npx wrangler tail`

### Database connection errors

- Verify D1 binding is correct in wrangler.toml
- Re-run migrations: `npx wrangler d1 execute pheromone_reviews --file=./migrations/schema.sql`

---

## Monitoring

### View worker logs in real-time:
```bash
npx wrangler tail
```

### Check recent crawls:
```bash
npx wrangler d1 execute pheromone_reviews --command="
  SELECT ss.name, cl.status, cl.reviews_found, cl.crawled_at
  FROM crawl_log cl
  JOIN source_sites ss ON cl.source_site_id = ss.id
  ORDER BY cl.crawled_at DESC
  LIMIT 20
"
```

### View product statistics:
```bash
npx wrangler d1 execute pheromone_reviews --command="
  SELECT p.canonical_name, p.brand, COUNT(r.id) as review_count, pm.avg_rating
  FROM products p
  LEFT JOIN reviews r ON p.id = r.product_id
  LEFT JOIN product_metadata pm ON p.id = pm.product_id
  GROUP BY p.id
  ORDER BY review_count DESC
"
```

---

## Adding New Source Sites

To add a new website to scrape:

```bash
npx wrangler d1 execute pheromone_reviews --command="
  INSERT INTO source_sites (name, domain, site_type, crawl_frequency, reputation_score, selector_config)
  VALUES (
    'Example Review Site',
    'example.com',
    'blog',
    7,
    75,
    '{\"review\": \".review-container\", \"title\": \".review-title\", \"text\": \".review-body\", \"author\": \".author-name\", \"rating\": \".star-rating\", \"date\": \".post-date\"}'
  )
"
```

Adjust the CSS selectors in `selector_config` to match the site's HTML structure.

---

## Manual Operations

### Manually trigger a scrape:
```bash
curl -X POST https://YOUR-WORKER-URL.workers.dev/scrape
```

### Generate AI-written review (old method):
```bash
curl -X POST https://YOUR-WORKER-URL.workers.dev/generate
```

### Generate review for specific product:
```bash
curl -X POST https://YOUR-WORKER-URL.workers.dev/generate-specific \
  -H "Content-Type: application/json" \
  -d '{"product": {"name": "Alfa Maschio", "brand": "Alpha Dream"}}'
```

---

## Updating the System

When you make changes to the code:

```bash
# Deploy worker changes
npx wrangler deploy

# Deploy blog changes
npm run build
npm run deploy
```

---

## Cost Estimates

### Cloudflare (Free Tier):
- Workers: 100,000 requests/day (free)
- D1: 5GB storage, 5M rows (free)
- KV: 1GB, 100k reads/day (free)
- Pages: Unlimited (free)

### OpenAI API:
- Product canonicalization: ~$0.0001 per product
- Sentiment analysis: ~$0.0005 per review
- **Estimated**: $5-10/month for 100 reviews/day

---

## Security Best Practices

- Never commit API keys to the repository
- Use `wrangler secret` for all sensitive values
- Review crawl logs regularly for suspicious activity
- Respect robots.txt and rate limits
- Provide an opt-out page for website owners

---

## Next Steps

After setup:

1. Wait for first automated scrape (next day at 3 AM UTC) or trigger manually
2. Check the `/search` page on your site to see reviews
3. Monitor crawl logs and adjust source sites as needed
4. Add more source sites to expand coverage
5. Customize the search UI and filters as desired

---

## Support

For issues or questions:
- Check the logs: `npx wrangler tail`
- Review database state with D1 commands above
- See `AUTONOMOUS-AGENT-PLAN.md` for architecture details
- Open an issue in the GitHub repository

---

**You're all set! The autonomous system will now scrape, process, and publish pheromone reviews automatically.** 🚀
