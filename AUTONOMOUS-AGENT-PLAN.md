# Pheromone Parfums - Autonomous Review Agent Plan

## 1. Project Overview

**Goal**: Build a fully autonomous system that discovers, fetches, processes, and publishes pheromone product reviews from across the internet with minimal manual intervention.

**Current State**:
- Static blog powered by Eleventy (11ty)
- Cloudflare Workers agent that generates AI-written reviews
- OpenAI API integration for content generation
- GitHub-based content management
- Deployed on Cloudflare Pages

**Target State**:
- Autonomous web crawler that finds real pheromone product reviews
- Intelligent extraction and normalization of review data
- Deduplication and quality filtering
- Search functionality by product type, brand, pheromone type, rating
- Automated publishing pipeline
- User-friendly search interface

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Scheduled Cloudflare Worker (Cron: daily)                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 1. Source Discovery → Find review sites/pages        │  │
│  │ 2. Web Scraping → Fetch review content               │  │
│  │ 3. Extraction → Parse reviews from HTML              │  │
│  │ 4. Normalization → Standardize format/ratings        │  │
│  │ 5. Deduplication → Remove duplicates                 │  │
│  │ 6. Enrichment → Add metadata, sentiment, embeddings  │  │
│  │ 7. Quality Filter → Remove spam/low-quality          │  │
│  │ 8. Commit to GitHub → Save as markdown files         │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  GitHub Repository                                           │
│  - blog/content/blog/*.md (review markdown files)           │
│  - Auto-triggers Cloudflare Pages build                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare Pages (Eleventy Build)                          │
│  - Generates static HTML                                     │
│  - Search index (JSON)                                       │
│  - Filter/facet capabilities                                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  User Interface                                              │
│  - Search by product name, brand, type                       │
│  - Filter by pheromone compounds, gender, rating             │
│  - Browse by category                                        │
│  - Read full reviews with source attribution                │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Data Model & Storage

### 3.1 Storage Strategy

**Use Cloudflare KV or D1 for persistent data**:
- KV for caching, deduplication hashes, and crawl state
- D1 (SQLite) for structured review/product data
- GitHub repository as the source of truth for published content

### 3.2 Database Schema (Cloudflare D1)

```sql
-- Products table (canonical product entries)
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_name TEXT NOT NULL UNIQUE,
  brand TEXT,
  product_type TEXT,           -- 'cologne', 'oil', 'spray', 'gel'
  gender_target TEXT,           -- 'men', 'women', 'unisex'
  pheromone_compounds TEXT,     -- JSON array: ["androstenone", "androstenol"]
  price_range TEXT,             -- 'budget', 'mid', 'premium'
  official_url TEXT,
  image_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Source sites (where we fetch reviews from)
CREATE TABLE source_sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  site_type TEXT,               -- 'blog', 'forum', 'ecommerce', 'reddit'
  robots_allowed INTEGER DEFAULT 1,
  crawl_frequency INTEGER DEFAULT 7, -- days between crawls
  reputation_score INTEGER DEFAULT 50, -- 0-100
  last_crawled DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Reviews (normalized review data)
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER,
  source_site_id INTEGER,
  source_url TEXT NOT NULL,
  review_title TEXT,
  review_text TEXT NOT NULL,
  reviewer_name TEXT,
  rating REAL,                  -- normalized 0-5 scale
  review_date DATE,
  helpful_votes INTEGER,
  verified_purchase INTEGER DEFAULT 0,
  language TEXT DEFAULT 'en',
  sentiment_score REAL,         -- -1 to 1
  content_hash TEXT UNIQUE,     -- for deduplication
  published_to_github INTEGER DEFAULT 0,
  github_file_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (source_site_id) REFERENCES source_sites(id)
);

-- Crawl log (track crawling activity)
CREATE TABLE crawl_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_site_id INTEGER,
  url TEXT,
  status TEXT,                  -- 'success', 'failed', 'skipped'
  reviews_found INTEGER DEFAULT 0,
  error_message TEXT,
  crawled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_site_id) REFERENCES source_sites(id)
);

-- Product metadata cache (for search/filter)
CREATE TABLE product_metadata (
  product_id INTEGER PRIMARY KEY,
  avg_rating REAL,
  review_count INTEGER,
  pros TEXT,                    -- JSON array
  cons TEXT,                    -- JSON array
  top_keywords TEXT,            -- JSON array
  last_updated DATETIME,
  FOREIGN KEY (product_id) REFERENCES products(id)
);
```

### 3.3 Cloudflare KV Structure

```javascript
// Deduplication cache (key: content_hash, value: review_id)
KV_NAMESPACE.put(`review:${contentHash}`, reviewId)

// Crawl state (prevent duplicate crawls)
KV_NAMESPACE.put(`crawl:${url}`, timestamp, { expirationTtl: 86400 }) // 24hr

// Product name normalization cache
KV_NAMESPACE.put(`product:${rawName}`, canonicalProductId)

// Rate limiting (per domain)
KV_NAMESPACE.put(`ratelimit:${domain}`, requestCount, { expirationTtl: 60 })
```

---

## 4. Web Scraping & Extraction Pipeline

### 4.1 Target Sources (Initial Seed List)

**Priority 1 - High-Value Sources**:
- Pheromone forums (PheroTruth, Love Scent forums)
- Reddit: r/pheromones, r/fragrance (use Reddit API)
- Dedicated review sites (PheromoneReviews.com if exists)
- YouTube comments/descriptions (via YouTube API)

**Priority 2 - Secondary Sources**:
- Amazon product pages (respect ToS - read-only public reviews)
- Personal blogs reviewing pheromone products
- Forum threads (PheromoneXS forum, etc.)

**Priority 3 - Lower Priority**:
- Social media mentions (Twitter/X, Instagram)
- News articles and press releases

### 4.2 Scraping Implementation (Cloudflare Workers)

**Challenges with Cloudflare Workers**:
- No Playwright/Puppeteer (CPU-intensive, requires full browser)
- No long-running processes (max 30s CPU time)
- Limited to fetch API and HTML parsing

**Solutions**:
1. Use Cloudflare Browser Rendering API (new, may have limits)
2. Use external scraping service (BrightData, ScrapingBee) called from Worker
3. Parse static HTML with lightweight parser (linkedom, node-html-parser)
4. Use official APIs where available (Reddit API, YouTube API)

### 4.3 Scraping Workflow (Pseudocode)

```javascript
// functions/api/src/scraper.js
import { HTMLRewriter } from 'cloudflare:workers';

export class ReviewScraper {
  constructor(env) {
    this.env = env;
  }

  async scrapeSource(sourceUrl, sourceConfig) {
    // 1. Check robots.txt
    const robotsAllowed = await this.checkRobots(sourceUrl);
    if (!robotsAllowed) {
      console.log(`Robots.txt disallows: ${sourceUrl}`);
      return null;
    }

    // 2. Rate limiting check
    const domain = new URL(sourceUrl).hostname;
    const rateLimited = await this.checkRateLimit(domain);
    if (rateLimited) {
      console.log(`Rate limited: ${domain}`);
      return null;
    }

    // 3. Fetch page
    const response = await fetch(sourceUrl, {
      headers: {
        'User-Agent': 'PheromoneParfumsBot/1.0 (+https://pheromoneparfums.com/about)'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();

    // 4. Extract reviews using site-specific selectors
    const reviews = await this.extractReviews(html, sourceConfig);

    // 5. Update rate limit
    await this.updateRateLimit(domain);

    return reviews;
  }

  async extractReviews(html, config) {
    // Use site-specific CSS selectors from config
    const { parse } = await import('node-html-parser');
    const root = parse(html);

    const reviews = [];
    const reviewNodes = root.querySelectorAll(config.selectors.review);

    for (const node of reviewNodes) {
      const review = {
        title: node.querySelector(config.selectors.title)?.text?.trim(),
        text: node.querySelector(config.selectors.text)?.text?.trim(),
        author: node.querySelector(config.selectors.author)?.text?.trim(),
        rating: this.extractRating(node, config.selectors.rating),
        date: this.extractDate(node, config.selectors.date),
        productName: this.extractProductName(node, config.selectors.product),
      };

      if (review.text && review.text.length > 50) {
        reviews.push(review);
      }
    }

    return reviews;
  }

  extractRating(node, selector) {
    const ratingEl = node.querySelector(selector);
    if (!ratingEl) return null;

    const text = ratingEl.text.trim();

    // Handle different rating formats
    // "4.5/5", "4.5 out of 5", "★★★★☆", "90%"

    // Stars (count filled stars)
    const stars = (text.match(/★/g) || []).length;
    if (stars > 0) return stars;

    // Numeric (4.5/5, 4.5 out of 5)
    const numMatch = text.match(/(\d+\.?\d*)\s*(?:\/|out of)\s*(\d+)/i);
    if (numMatch) {
      const [, val, max] = numMatch;
      return (parseFloat(val) / parseFloat(max)) * 5;
    }

    // Percentage (90%)
    const pctMatch = text.match(/(\d+)%/);
    if (pctMatch) {
      return (parseInt(pctMatch[1]) / 100) * 5;
    }

    // Direct number (assume 5-point scale)
    const directMatch = text.match(/(\d+\.?\d*)/);
    if (directMatch) {
      return parseFloat(directMatch[1]);
    }

    return null;
  }

  extractDate(node, selector) {
    const dateEl = node.querySelector(selector);
    if (!dateEl) return null;

    const text = dateEl.text.trim();
    const datetime = dateEl.getAttribute('datetime');

    // Try datetime attribute first
    if (datetime) {
      return new Date(datetime).toISOString().split('T')[0];
    }

    // Parse relative dates: "2 days ago", "3 weeks ago"
    const relativeMatch = text.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
    if (relativeMatch) {
      const [, amount, unit] = relativeMatch;
      const date = new Date();
      const units = {
        second: 1000,
        minute: 60000,
        hour: 3600000,
        day: 86400000,
        week: 604800000,
        month: 2592000000,
        year: 31536000000
      };
      date.setTime(date.getTime() - (parseInt(amount) * units[unit.toLowerCase()]));
      return date.toISOString().split('T')[0];
    }

    // Try to parse as regular date
    try {
      const parsed = new Date(text);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
      }
    } catch (e) {
      // Ignore parse errors
    }

    return null;
  }

  extractProductName(node, selector) {
    const productEl = node.querySelector(selector);
    return productEl?.text?.trim() || null;
  }

  async checkRobots(url) {
    const domain = new URL(url).origin;
    const robotsUrl = `${domain}/robots.txt`;

    try {
      const response = await fetch(robotsUrl);
      if (!response.ok) return true; // No robots.txt = allowed

      const robotsTxt = await response.text();
      // Simple check - in production use a proper robots.txt parser
      return !robotsTxt.includes('Disallow: /');
    } catch (e) {
      return true; // Error fetching = assume allowed
    }
  }

  async checkRateLimit(domain) {
    const key = `ratelimit:${domain}`;
    const count = await this.env.KV.get(key);

    // Limit: 10 requests per minute per domain
    if (count && parseInt(count) >= 10) {
      return true; // Rate limited
    }

    return false;
  }

  async updateRateLimit(domain) {
    const key = `ratelimit:${domain}`;
    const count = await this.env.KV.get(key) || '0';
    await this.env.KV.put(key, String(parseInt(count) + 1), { expirationTtl: 60 });
  }
}
```

### 4.4 Site-Specific Extraction Configs

Store these in D1 or as JSON in the codebase:

```json
{
  "sources": [
    {
      "name": "PheroTruth Forum",
      "domain": "pherotruth.com",
      "type": "forum",
      "crawl_frequency": 7,
      "selectors": {
        "review": ".post-content",
        "title": ".post-title",
        "text": ".post-body",
        "author": ".post-author",
        "rating": ".rating-stars",
        "date": "time.post-date",
        "product": ".product-name"
      }
    },
    {
      "name": "Reddit Pheromones",
      "domain": "reddit.com",
      "type": "forum",
      "api": "https://www.reddit.com/r/pheromones/top.json?t=week",
      "use_api": true
    }
  ]
}
```

---

## 5. Review Normalization & Processing

### 5.1 Product Name Canonicalization

**Challenge**: Same product appears with different names
- "Alfa Maschio by Alpha Dream"
- "Alpha Dream Alfa Maschio"
- "Alfa Maschio cologne"

**Solution**: Use OpenAI to normalize product names

```javascript
async canonicalizeProductName(rawName, brand) {
  // Check cache first
  const cacheKey = `product:${rawName.toLowerCase()}`;
  const cached = await this.env.KV.get(cacheKey);
  if (cached) return cached;

  // Ask OpenAI to canonicalize
  const response = await this.openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a product name normalizer. Return only the canonical product name and brand in format: 'ProductName|Brand'"
      },
      {
        role: "user",
        content: `Normalize this product name: "${rawName}". Brand hint: "${brand || 'unknown'}"`
      }
    ]
  });

  const canonical = response.choices[0].message.content.trim();

  // Cache for 30 days
  await this.env.KV.put(cacheKey, canonical, { expirationTtl: 2592000 });

  return canonical;
}
```

### 5.2 Deduplication Strategy

**Method 1: Content Hash** (exact duplicates)
```javascript
function generateContentHash(review) {
  const content = `${review.text}|${review.author}|${review.source}`;
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))
    .then(buf => Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(''));
}
```

**Method 2: Semantic Similarity** (near-duplicates)
```javascript
async findNearDuplicates(reviewText, threshold = 0.9) {
  // Generate embedding for new review
  const embedding = await this.openai.embeddings.create({
    model: "text-embedding-3-small",
    input: reviewText
  });

  // Query Vectorize for similar reviews (if using Cloudflare Vectorize)
  const results = await this.env.VECTORIZE.query(embedding.data[0].embedding, {
    topK: 5,
    returnMetadata: true
  });

  // Filter by similarity threshold
  return results.matches.filter(m => m.score >= threshold);
}
```

### 5.3 Quality Filtering

```javascript
function isHighQualityReview(review) {
  // Minimum length
  if (review.text.length < 100) return false;

  // Check for spam patterns
  const spamPatterns = [
    /buy now/gi,
    /click here/gi,
    /limited time offer/gi,
    /http[s]?:\/\//gi  // Contains URLs (likely spam)
  ];

  for (const pattern of spamPatterns) {
    if (pattern.test(review.text)) return false;
  }

  // Check for meaningful content (not just "Great product!")
  const sentences = review.text.split(/[.!?]+/).filter(s => s.trim().length > 20);
  if (sentences.length < 2) return false;

  // Check language (if we only want English)
  // Use a simple heuristic: check for common English words
  const englishWords = ['the', 'is', 'was', 'this', 'that', 'with', 'for', 'from'];
  const lowerText = review.text.toLowerCase();
  const englishWordCount = englishWords.filter(w => lowerText.includes(` ${w} `)).length;
  if (englishWordCount < 2) return false;

  return true;
}
```

### 5.4 Sentiment Analysis

```javascript
async analyzeSentiment(reviewText) {
  const response = await this.openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "Analyze the sentiment of this review. Return a JSON with: sentiment (positive/negative/neutral), score (-1 to 1), pros (array), cons (array)"
      },
      {
        role: "user",
        content: reviewText
      }
    ],
    response_format: { type: "json_object" }
  });

  return JSON.parse(response.choices[0].message.content);
}
```

---

## 6. GitHub Integration & Publishing

### 6.1 Markdown File Generation

```javascript
function generateMarkdownReview(product, reviews, metadata) {
  const avgRating = metadata.avg_rating.toFixed(1);
  const reviewCount = reviews.length;

  // Generate frontmatter
  const frontmatter = `---
title: "${product.canonical_name} by ${product.brand} - ${reviewCount} Reviews"
description: "Comprehensive review analysis of ${product.canonical_name}, a ${product.product_type} pheromone product"
date: ${new Date().toISOString().split('T')[0]}
tags: ["${product.brand.toLowerCase()}", "${product.product_type}", "${product.gender_target}", "pheromone"]
product:
  brand: "${product.brand}"
  name: "${product.canonical_name}"
  type: "${product.product_type}"
  gender: "${product.gender_target}"
  rating: ${avgRating}
  review_count: ${reviewCount}
  compounds: ${JSON.stringify(JSON.parse(product.pheromone_compounds || '[]'))}
  pros: ${JSON.stringify(metadata.pros)}
  cons: ${JSON.stringify(metadata.cons)}
layout: layouts/post.njk
---`;

  // Generate body
  const body = `
# ${product.canonical_name} Review Analysis

## Overview

Based on ${reviewCount} user reviews from across the web, ${product.canonical_name} by ${product.brand} receives an average rating of **${avgRating}/5**.

**Product Type**: ${product.product_type}
**Target Gender**: ${product.gender_target}
**Pheromone Compounds**: ${JSON.parse(product.pheromone_compounds || '[]').join(', ')}

## Aggregate Analysis

### Pros
${metadata.pros.map(pro => `- ${pro}`).join('\n')}

### Cons
${metadata.cons.map(con => `- ${con}`).join('\n')}

## User Reviews

${reviews.slice(0, 10).map((review, i) => `
### Review ${i + 1} - ${review.rating ? `${review.rating}/5` : 'Unrated'}

${review.review_title ? `**${review.review_title}**\n\n` : ''}${review.review_text}

*By ${review.reviewer_name || 'Anonymous'} on ${review.review_date || 'Unknown date'}*
*Source: [${new URL(review.source_url).hostname}](${review.source_url})*

---
`).join('\n')}

${reviewCount > 10 ? `\n*Showing 10 of ${reviewCount} reviews. More reviews available from verified sources.*\n` : ''}

## Review Sources

This analysis aggregates reviews from:
${[...new Set(reviews.map(r => new URL(r.source_url).hostname))].map(domain => `- ${domain}`).join('\n')}

All reviews are sourced from publicly available websites and attributed to their original sources.

## Conclusion

${generateConclusion(metadata, reviewCount)}

---

*Last updated: ${new Date().toLocaleDateString()}*
*Review data collected from publicly available sources*
`;

  return frontmatter + '\n\n' + body;
}

function generateConclusion(metadata, reviewCount) {
  const avgRating = metadata.avg_rating;

  if (avgRating >= 4.5) {
    return `With an outstanding average rating of ${avgRating.toFixed(1)}/5 across ${reviewCount} reviews, ${metadata.product_name} is highly recommended by users. The overwhelming majority of reviewers report positive experiences, particularly highlighting ${metadata.pros[0]?.toLowerCase()}.`;
  } else if (avgRating >= 4.0) {
    return `${metadata.product_name} receives solid ratings averaging ${avgRating.toFixed(1)}/5 from ${reviewCount} reviews. Most users report satisfaction, though some note ${metadata.cons[0]?.toLowerCase()}.`;
  } else if (avgRating >= 3.0) {
    return `With a mixed rating of ${avgRating.toFixed(1)}/5 across ${reviewCount} reviews, ${metadata.product_name} shows variable results. Consider the specific pros and cons carefully based on your needs.`;
  } else {
    return `${metadata.product_name} receives below-average ratings (${avgRating.toFixed(1)}/5) from ${reviewCount} reviews. Users frequently mention issues with ${metadata.cons[0]?.toLowerCase()}.`;
  }
}
```

### 6.2 Committing to GitHub

```javascript
async publishReviewToGitHub(product, markdownContent) {
  const slug = product.canonical_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const filePath = `blog/content/blog/${slug}.md`;

  try {
    // Check if file already exists
    let sha;
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.config.repoOwner,
        repo: this.config.repoName,
        path: filePath
      });
      sha = data.sha;
    } catch (e) {
      // File doesn't exist, which is fine
    }

    // Create or update file
    await this.octokit.repos.createOrUpdateFileContents({
      owner: this.config.repoOwner,
      repo: this.config.repoName,
      path: filePath,
      message: `Update review: ${product.canonical_name} (${new Date().toISOString()})`,
      content: Buffer.from(markdownContent).toString('base64'),
      sha
    });

    console.log(`Published: ${filePath}`);
    return { success: true, path: filePath };
  } catch (error) {
    console.error(`Failed to publish ${filePath}:`, error);
    return { success: false, error: error.message };
  }
}
```

---

## 7. Search & Filter Implementation

### 7.1 Eleventy Search Index Generation

Update `.eleventy.js` to generate a comprehensive search index:

```javascript
// blog/.eleventy.js - Add this collection
eleventyConfig.addCollection("searchIndex", function(collectionApi) {
  const posts = collectionApi.getAll()[0].data.collections.posts;

  return posts.map(post => ({
    url: post.url,
    title: post.data.title,
    description: post.data.description,
    brand: post.data.product?.brand,
    productName: post.data.product?.name,
    productType: post.data.product?.type,
    gender: post.data.product?.gender,
    rating: post.data.product?.rating,
    reviewCount: post.data.product?.review_count,
    compounds: post.data.product?.compounds || [],
    tags: post.data.tags,
    date: post.date,
    content: post.template.frontMatter.content.substring(0, 500)
  }));
});
```

Create search index template:

```njk
---
permalink: /search-index.json
---
{{ collections.searchIndex | json }}
```

### 7.2 Client-Side Search Implementation

Create `blog/js/search.js`:

```javascript
class PheromoneSearch {
  constructor() {
    this.index = [];
    this.init();
  }

  async init() {
    // Load search index
    const response = await fetch('/search-index.json');
    this.index = await response.json();

    this.setupEventListeners();
  }

  setupEventListeners() {
    const searchInput = document.getElementById('search-input');
    const filterBrand = document.getElementById('filter-brand');
    const filterType = document.getElementById('filter-type');
    const filterGender = document.getElementById('filter-gender');
    const filterMinRating = document.getElementById('filter-min-rating');
    const filterCompounds = document.getElementById('filter-compounds');

    const performSearch = () => {
      const query = searchInput.value;
      const filters = {
        brand: filterBrand?.value,
        type: filterType?.value,
        gender: filterGender?.value,
        minRating: parseFloat(filterMinRating?.value || 0),
        compounds: Array.from(filterCompounds?.selectedOptions || []).map(o => o.value)
      };

      const results = this.search(query, filters);
      this.displayResults(results);
    };

    searchInput?.addEventListener('input', performSearch);
    filterBrand?.addEventListener('change', performSearch);
    filterType?.addEventListener('change', performSearch);
    filterGender?.addEventListener('change', performSearch);
    filterMinRating?.addEventListener('change', performSearch);
    filterCompounds?.addEventListener('change', performSearch);
  }

  search(query, filters) {
    let results = this.index;

    // Text search
    if (query && query.length > 0) {
      const lowerQuery = query.toLowerCase();
      results = results.filter(item => {
        return (
          item.title?.toLowerCase().includes(lowerQuery) ||
          item.productName?.toLowerCase().includes(lowerQuery) ||
          item.brand?.toLowerCase().includes(lowerQuery) ||
          item.description?.toLowerCase().includes(lowerQuery) ||
          item.content?.toLowerCase().includes(lowerQuery)
        );
      });
    }

    // Apply filters
    if (filters.brand) {
      results = results.filter(item => item.brand === filters.brand);
    }

    if (filters.type) {
      results = results.filter(item => item.productType === filters.type);
    }

    if (filters.gender) {
      results = results.filter(item => item.gender === filters.gender);
    }

    if (filters.minRating > 0) {
      results = results.filter(item => item.rating >= filters.minRating);
    }

    if (filters.compounds && filters.compounds.length > 0) {
      results = results.filter(item => {
        return filters.compounds.some(compound =>
          item.compounds?.includes(compound)
        );
      });
    }

    // Sort by rating (descending)
    results.sort((a, b) => (b.rating || 0) - (a.rating || 0));

    return results;
  }

  displayResults(results) {
    const container = document.getElementById('search-results');
    if (!container) return;

    if (results.length === 0) {
      container.innerHTML = '<p>No reviews found matching your criteria.</p>';
      return;
    }

    container.innerHTML = results.map(result => `
      <div class="review-card">
        <h3><a href="${result.url}">${result.title}</a></h3>
        <div class="review-meta">
          <span class="brand">${result.brand}</span>
          <span class="type">${result.productType}</span>
          <span class="rating">⭐ ${result.rating?.toFixed(1) || 'N/A'}</span>
          <span class="review-count">${result.reviewCount || 0} reviews</span>
        </div>
        ${result.compounds?.length > 0 ? `
          <div class="compounds">
            <strong>Compounds:</strong> ${result.compounds.join(', ')}
          </div>
        ` : ''}
        <p>${result.description}</p>
        <a href="${result.url}" class="read-more">Read Full Review →</a>
      </div>
    `).join('');
  }

  getUniqueValues(field) {
    return [...new Set(this.index.map(item => item[field]).filter(Boolean))];
  }
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new PheromoneSearch());
} else {
  new PheromoneSearch();
}
```

### 7.3 Search UI Template

Create `blog/search.njk`:

```njk
---
layout: layouts/base.njk
title: Search Pheromone Reviews
permalink: /search/
---

<div class="container search-page">
  <h1>Search Pheromone Reviews</h1>

  <div class="search-container">
    <input
      type="text"
      id="search-input"
      placeholder="Search by product name, brand, or keyword..."
      class="search-input"
    />
  </div>

  <div class="filters">
    <h2>Filters</h2>

    <div class="filter-group">
      <label for="filter-type">Product Type:</label>
      <select id="filter-type">
        <option value="">All Types</option>
        <option value="cologne">Cologne</option>
        <option value="oil">Oil</option>
        <option value="spray">Spray</option>
        <option value="gel">Gel</option>
      </select>
    </div>

    <div class="filter-group">
      <label for="filter-gender">Target Gender:</label>
      <select id="filter-gender">
        <option value="">All</option>
        <option value="men">Men</option>
        <option value="women">Women</option>
        <option value="unisex">Unisex</option>
      </select>
    </div>

    <div class="filter-group">
      <label for="filter-brand">Brand:</label>
      <select id="filter-brand">
        <option value="">All Brands</option>
        <!-- Populated dynamically -->
      </select>
    </div>

    <div class="filter-group">
      <label for="filter-min-rating">Minimum Rating:</label>
      <select id="filter-min-rating">
        <option value="0">Any</option>
        <option value="3">3+ Stars</option>
        <option value="4">4+ Stars</option>
        <option value="4.5">4.5+ Stars</option>
      </select>
    </div>

    <div class="filter-group">
      <label for="filter-compounds">Pheromone Compounds:</label>
      <select id="filter-compounds" multiple>
        <option value="androstenone">Androstenone</option>
        <option value="androstenol">Androstenol</option>
        <option value="androstadienone">Androstadienone</option>
        <option value="androsterone">Androsterone</option>
        <option value="estratetraenol">Estratetraenol</option>
        <option value="copulins">Copulins</option>
      </select>
    </div>
  </div>

  <div id="search-results" class="results-container">
    <!-- Results populated by search.js -->
    <p>Loading...</p>
  </div>
</div>

<script src="/js/search.js"></script>
```

---

## 8. Agent Orchestration (Main Loop)

### 8.1 Updated Agent Class

```javascript
// functions/api/src/autonomous-agent.js
import { PheromoneReviewAgent } from './agent.js';
import { ReviewScraper } from './scraper.js';
import { Octokit } from '@octokit/rest';
import OpenAI from 'openai';

export class AutonomousReviewAgent {
  constructor(env, config) {
    this.env = env;
    this.config = config;
    this.octokit = new Octokit({ auth: config.githubToken });
    this.openai = new OpenAI({ apiKey: config.openaiApiKey });
    this.scraper = new ReviewScraper(env);
  }

  async run() {
    console.log('=== Autonomous Agent Starting ===');

    try {
      // Step 1: Get sources to crawl
      const sources = await this.getSourcesToCrawl();
      console.log(`Found ${sources.length} sources to crawl`);

      // Step 2: Scrape each source
      const allReviews = [];
      for (const source of sources) {
        try {
          const reviews = await this.scraper.scrapeSource(source.url, source);
          allReviews.push(...reviews.map(r => ({ ...r, source })));

          // Log crawl
          await this.logCrawl(source, 'success', reviews.length);

          // Delay between sources (politeness)
          await this.delay(5000);
        } catch (error) {
          console.error(`Error scraping ${source.name}:`, error);
          await this.logCrawl(source, 'failed', 0, error.message);
        }
      }

      console.log(`Scraped ${allReviews.length} reviews`);

      // Step 3: Process reviews
      const processedReviews = [];
      for (const review of allReviews) {
        try {
          const processed = await this.processReview(review);
          if (processed) {
            processedReviews.push(processed);
          }
        } catch (error) {
          console.error('Error processing review:', error);
        }
      }

      console.log(`Processed ${processedReviews.length} high-quality reviews`);

      // Step 4: Group by product
      const reviewsByProduct = this.groupByProduct(processedReviews);
      console.log(`Grouped into ${Object.keys(reviewsByProduct).length} products`);

      // Step 5: Generate and publish markdown for each product
      let published = 0;
      for (const [productId, reviews] of Object.entries(reviewsByProduct)) {
        try {
          const product = reviews[0].product; // All have same product
          const metadata = await this.generateMetadata(reviews);
          const markdown = this.generateMarkdown(product, reviews, metadata);

          const result = await this.publishToGitHub(product, markdown);
          if (result.success) {
            published++;

            // Mark reviews as published
            for (const review of reviews) {
              await this.markAsPublished(review.id, result.path);
            }
          }
        } catch (error) {
          console.error(`Error publishing product ${productId}:`, error);
        }
      }

      console.log(`=== Agent Complete: Published ${published} products ===`);

      return {
        success: true,
        stats: {
          sourcesProcessed: sources.length,
          reviewsScraped: allReviews.length,
          reviewsProcessed: processedReviews.length,
          productsPublished: published
        }
      };
    } catch (error) {
      console.error('Agent error:', error);
      return { success: false, error: error.message };
    }
  }

  async getSourcesToCrawl() {
    // Query D1 for sources that need crawling
    const stmt = this.env.DB.prepare(`
      SELECT * FROM source_sites
      WHERE robots_allowed = 1
        AND (
          last_crawled IS NULL
          OR datetime(last_crawled, '+' || crawl_frequency || ' days') < datetime('now')
        )
      ORDER BY reputation_score DESC
      LIMIT 10
    `);

    const { results } = await stmt.all();
    return results;
  }

  async processReview(review) {
    // 1. Quality filter
    if (!this.isHighQuality(review)) {
      return null;
    }

    // 2. Generate content hash
    const contentHash = await this.generateHash(review.text);

    // 3. Check for duplicates
    const duplicate = await this.env.KV.get(`review:${contentHash}`);
    if (duplicate) {
      console.log('Duplicate review found, skipping');
      return null;
    }

    // 4. Canonicalize product name
    const canonicalProduct = await this.canonicalizeProduct(
      review.productName,
      review.source.name
    );

    // 5. Sentiment analysis
    const sentiment = await this.analyzeSentiment(review.text);

    // 6. Save to D1
    const reviewId = await this.saveReview({
      ...review,
      product: canonicalProduct,
      contentHash,
      sentiment
    });

    // 7. Cache hash
    await this.env.KV.put(`review:${contentHash}`, String(reviewId));

    return {
      id: reviewId,
      ...review,
      product: canonicalProduct,
      sentiment
    };
  }

  isHighQuality(review) {
    if (!review.text || review.text.length < 100) return false;

    const spamPatterns = [
      /buy now/gi,
      /click here/gi,
      /limited time/gi
    ];

    return !spamPatterns.some(p => p.test(review.text));
  }

  async generateHash(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async canonicalizeProduct(rawName, sourceName) {
    // Check cache
    const cacheKey = `product:${rawName.toLowerCase()}`;
    const cached = await this.env.KV.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Use OpenAI to extract product info
    const response = await this.openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Extract product information from the given name. Return JSON with: name, brand, type (cologne/oil/spray/gel), gender (men/women/unisex), compounds (array of pheromone compounds mentioned)"
        },
        {
          role: "user",
          content: `Product name: "${rawName}"`
        }
      ],
      response_format: { type: "json_object" }
    });

    const productInfo = JSON.parse(response.choices[0].message.content);

    // Check if product exists in DB
    const existing = await this.findProduct(productInfo.name, productInfo.brand);

    let product;
    if (existing) {
      product = existing;
    } else {
      // Create new product
      product = await this.createProduct(productInfo);
    }

    // Cache for 7 days
    await this.env.KV.put(cacheKey, JSON.stringify(product), { expirationTtl: 604800 });

    return product;
  }

  async analyzeSentiment(text) {
    const response = await this.openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Analyze sentiment. Return JSON with: sentiment (positive/negative/neutral), score (-1 to 1), pros (array, max 3), cons (array, max 3)"
        },
        {
          role: "user",
          content: text.substring(0, 1000) // Limit tokens
        }
      ],
      response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message.content);
  }

  groupByProduct(reviews) {
    const grouped = {};
    for (const review of reviews) {
      const key = review.product.id;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(review);
    }
    return grouped;
  }

  async generateMetadata(reviews) {
    const ratings = reviews.filter(r => r.rating).map(r => r.rating);
    const avgRating = ratings.length > 0
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length
      : 0;

    // Aggregate pros/cons from sentiment analysis
    const allPros = reviews.flatMap(r => r.sentiment?.pros || []);
    const allCons = reviews.flatMap(r => r.sentiment?.cons || []);

    // Count frequency and take top 5
    const topPros = this.getTopItems(allPros, 5);
    const topCons = this.getTopItems(allCons, 5);

    return {
      avg_rating: avgRating,
      review_count: reviews.length,
      pros: topPros,
      cons: topCons
    };
  }

  getTopItems(items, limit) {
    const counts = {};
    for (const item of items) {
      counts[item] = (counts[item] || 0) + 1;
    }

    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([item]) => item);
  }

  generateMarkdown(product, reviews, metadata) {
    // Use the function from section 6.1
    return generateMarkdownReview(product, reviews, metadata);
  }

  async publishToGitHub(product, markdown) {
    // Use the function from section 6.2
    return await publishReviewToGitHub.call(this, product, markdown);
  }

  async logCrawl(source, status, reviewsFound, errorMessage = null) {
    await this.env.DB.prepare(`
      INSERT INTO crawl_log (source_site_id, url, status, reviews_found, error_message)
      VALUES (?, ?, ?, ?, ?)
    `).bind(source.id, source.url, status, reviewsFound, errorMessage).run();

    // Update last_crawled
    if (status === 'success') {
      await this.env.DB.prepare(`
        UPDATE source_sites
        SET last_crawled = datetime('now')
        WHERE id = ?
      `).bind(source.id).run();
    }
  }

  async saveReview(review) {
    const result = await this.env.DB.prepare(`
      INSERT INTO reviews (
        product_id, source_site_id, source_url, review_title, review_text,
        reviewer_name, rating, review_date, sentiment_score, content_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `).bind(
      review.product.id,
      review.source.id,
      review.source.url,
      review.title || null,
      review.text,
      review.author || null,
      review.rating || null,
      review.date || null,
      review.sentiment?.score || null,
      review.contentHash
    ).run();

    return result.results[0].id;
  }

  async findProduct(name, brand) {
    const stmt = this.env.DB.prepare(`
      SELECT * FROM products
      WHERE canonical_name = ? AND brand = ?
      LIMIT 1
    `).bind(name, brand);

    const { results } = await stmt.all();
    return results[0] || null;
  }

  async createProduct(productInfo) {
    const result = await this.env.DB.prepare(`
      INSERT INTO products (
        canonical_name, brand, product_type, gender_target, pheromone_compounds
      ) VALUES (?, ?, ?, ?, ?)
      RETURNING *
    `).bind(
      productInfo.name,
      productInfo.brand,
      productInfo.type || 'cologne',
      productInfo.gender || 'unisex',
      JSON.stringify(productInfo.compounds || [])
    ).run();

    return result.results[0];
  }

  async markAsPublished(reviewId, githubPath) {
    await this.env.DB.prepare(`
      UPDATE reviews
      SET published_to_github = 1, github_file_path = ?
      WHERE id = ?
    `).bind(githubPath, reviewId).run();
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 8.2 Updated Worker Entry Point

```javascript
// functions/api/src/index.js
import { Router } from 'itty-router';
import { AutonomousReviewAgent } from './autonomous-agent';

const router = Router();

router.post('/generate', async (request, env, ctx) => {
  const agent = new AutonomousReviewAgent(env, {
    githubToken: env.GITHUB_TOKEN,
    repoOwner: env.GITHUB_REPO_OWNER,
    repoName: env.GITHUB_REPO_NAME,
    openaiApiKey: env.OPENAI_API_KEY
  });

  // Run async (don't wait for completion)
  ctx.waitUntil(agent.run());

  return new Response(JSON.stringify({
    success: true,
    message: 'Agent started'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

router.all('*', () => new Response('Not Found', { status: 404 }));

export default {
  async fetch(request, env, ctx) {
    return router.handle(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    // Run daily
    const agent = new AutonomousReviewAgent(env, {
      githubToken: env.GITHUB_TOKEN,
      repoOwner: env.GITHUB_REPO_OWNER,
      repoName: env.GITHUB_REPO_NAME,
      openaiApiKey: env.OPENAI_API_KEY
    });

    ctx.waitUntil(agent.run());
  }
};
```

---

## 9. Configuration & Deployment

### 9.1 Update wrangler.toml

```toml
name = "pheromone-parfums"
main = "functions/api/src/index.js"
compatibility_date = "2023-10-02"

[site]
bucket = "./dist"

[[d1_databases]]
binding = "DB"
database_name = "pheromone_reviews"
database_id = "your-database-id"

[[kv_namespaces]]
binding = "KV"
id = "your-kv-id"

[triggers]
crons = ["0 3 * * *"]  # Daily at 3 AM UTC

[vars]
GITHUB_REPO_NAME = "pheromoneparfums"
GITHUB_REPO_OWNER = "katalagahakim"
MAX_REVIEWS_PER_RUN = "50"
MAX_REVIEWS_TOTAL = "500"

# Secrets (set via wrangler secret put)
# - GITHUB_TOKEN
# - OPENAI_API_KEY
```

### 9.2 Setup Commands

```bash
# Create D1 database
npx wrangler d1 create pheromone_reviews

# Create KV namespace
npx wrangler kv:namespace create "PHEROMONE_KV"

# Run migrations
npx wrangler d1 execute pheromone_reviews --file=./migrations/schema.sql

# Set secrets
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put OPENAI_API_KEY

# Deploy
npx wrangler deploy
```

### 9.3 Database Migration File

Create `migrations/schema.sql` with the schema from section 3.2.

---

## 10. Legal, Ethical & Best Practices

### 10.1 robots.txt Compliance

Always check and respect `robots.txt` before scraping any site.

### 10.2 Attribution

Every review MUST include:
- Link to original source
- Source site name
- Original author (if available)
- Date of review

### 10.3 Opt-Out Policy

Create `/opt-out` page allowing site owners to request removal of their content.

### 10.4 Rate Limiting

- Max 10 requests per minute per domain
- 5-second delay between requests to same domain
- Respect `Crawl-delay` directive in robots.txt

### 10.5 User Agent

Use identifiable user agent:
```
PheromoneParfumsBot/1.0 (+https://pheromoneparfums.com/about)
```

### 10.6 Data Retention

- Keep raw HTML snapshots for 90 days (audit trail)
- Respect GDPR: don't store PII
- Provide data deletion upon request

---

## 11. Monitoring & Maintenance

### 11.1 Logging

Use Cloudflare Workers Analytics and Logs:
- Track crawl success/failure rates
- Monitor API usage (OpenAI costs)
- Alert on repeated failures

### 11.2 Metrics to Track

- Reviews scraped per day
- Duplicate rate
- Quality filter rejection rate
- Products published per day
- Search query patterns

### 11.3 Manual Override

Build simple admin interface to:
- Trigger manual crawls
- Review flagged content
- Merge duplicate products
- Edit product metadata

---

## 12. Roadmap & Next Steps

### Phase 1: MVP (Week 1-2)
- [ ] Set up D1 database and schema
- [ ] Implement basic scraper for 2-3 sources
- [ ] Implement review processing pipeline
- [ ] Generate and commit markdown files
- [ ] Deploy to Cloudflare Workers

### Phase 2: Search & UX (Week 3-4)
- [ ] Build search index generation
- [ ] Implement client-side search
- [ ] Add filter UI
- [ ] Improve review page templates
- [ ] Add product comparison feature

### Phase 3: Scale & Quality (Week 5-6)
- [ ] Add 10+ more sources
- [ ] Implement semantic deduplication
- [ ] Improve product canonicalization
- [ ] Add sentiment analysis
- [ ] Build admin dashboard

### Phase 4: Advanced Features (Week 7-8)
- [ ] Vector search for semantic queries
- [ ] Review helpfulness voting
- [ ] Product recommendations
- [ ] Email alerts for new reviews
- [ ] API for third-party access

---

## 13. Cost Estimation

### Cloudflare Costs
- Workers: Free tier (100k requests/day)
- D1: Free tier (5GB storage, 5M rows)
- KV: Free tier (1GB, 100k reads/day)
- Pages: Free

### OpenAI Costs (estimated)
- Product canonicalization: ~$0.0001 per product
- Sentiment analysis: ~$0.0005 per review
- Embeddings (if used): ~$0.0001 per review

**Estimated monthly cost for 100 reviews/day**: ~$5-10

---

## 14. Success Metrics

- **Coverage**: 500+ products reviewed within 3 months
- **Quality**: 90%+ high-quality reviews (>100 chars, meaningful content)
- **Freshness**: Reviews updated within 7 days of source publication
- **Search Performance**: <200ms search response time
- **User Engagement**: >1000 searches/month after 3 months

---

## 15. Risks & Mitigation

| Risk | Mitigation |
|------|------------|
| Legal issues (scraping ToS violations) | Only scrape sites with permissive robots.txt, provide opt-out |
| IP blocking | Implement polite crawling, use residential proxies if needed |
| Poor data quality | Multi-stage quality filtering, manual review queue |
| High OpenAI costs | Cache aggressively, batch requests, use mini models |
| Duplicate content | Robust deduplication with content hashing + semantic similarity |
| Site structure changes | Store site configs in DB, easy to update selectors |

---

## 16. Conclusion

This plan outlines a fully autonomous pheromone review aggregation system that:

1. ✅ Discovers and scrapes reviews from across the web
2. ✅ Processes and normalizes review data intelligently
3. ✅ Removes duplicates and spam
4. ✅ Generates comprehensive product review pages
5. ✅ Publishes automatically to GitHub/Cloudflare Pages
6. ✅ Provides powerful search and filtering for users
7. ✅ Requires minimal ongoing manual effort

The system respects legal and ethical boundaries while providing high-quality, user-focused content.

**Ready to implement? Start with Phase 1 MVP tasks and iterate from there.**
