-- Pheromone Review Database Schema
-- Cloudflare D1 (SQLite)

-- Products table (canonical product entries)
CREATE TABLE IF NOT EXISTS products (
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
CREATE TABLE IF NOT EXISTS source_sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  site_type TEXT,               -- 'blog', 'forum', 'ecommerce', 'reddit'
  robots_allowed INTEGER DEFAULT 1,
  crawl_frequency INTEGER DEFAULT 7, -- days between crawls
  reputation_score INTEGER DEFAULT 50, -- 0-100
  last_crawled DATETIME,
  selector_config TEXT,         -- JSON with CSS selectors
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Reviews (normalized review data)
CREATE TABLE IF NOT EXISTS reviews (
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
  pros TEXT,                    -- JSON array
  cons TEXT,                    -- JSON array
  content_hash TEXT UNIQUE,     -- for deduplication
  published_to_github INTEGER DEFAULT 0,
  github_file_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (source_site_id) REFERENCES source_sites(id)
);

-- Crawl log (track crawling activity)
CREATE TABLE IF NOT EXISTS crawl_log (
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
CREATE TABLE IF NOT EXISTS product_metadata (
  product_id INTEGER PRIMARY KEY,
  avg_rating REAL,
  review_count INTEGER,
  pros TEXT,                    -- JSON array
  cons TEXT,                    -- JSON array
  top_keywords TEXT,            -- JSON array
  last_updated DATETIME,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_source ON reviews(source_site_id);
CREATE INDEX IF NOT EXISTS idx_reviews_hash ON reviews(content_hash);
CREATE INDEX IF NOT EXISTS idx_reviews_published ON reviews(published_to_github);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(canonical_name);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_source_sites_domain ON source_sites(domain);
CREATE INDEX IF NOT EXISTS idx_crawl_log_site ON crawl_log(source_site_id);

-- Insert initial source sites
INSERT OR IGNORE INTO source_sites (name, domain, site_type, robots_allowed, crawl_frequency, reputation_score, selector_config) VALUES
('PheroTruth Forum', 'pherotruth.com', 'forum', 1, 7, 90, '{"review": ".post-content", "title": ".post-title", "text": ".post-body", "author": ".post-author", "rating": ".rating-stars", "date": "time.post-date", "product": ".product-name"}'),
('Reddit Pheromones', 'reddit.com', 'reddit', 1, 3, 85, '{"subreddits": ["pheromones", "fragrance"]}'),
('Love Scent Forum', 'love-scent.com', 'forum', 1, 7, 80, '{"review": ".message-body", "title": ".message-title", "text": ".message-content", "author": ".message-author", "date": ".message-date", "product": "h1.product-name"}'),
('Pheromone Reviews Blog', 'pheromonereviewsblog.com', 'blog', 1, 14, 75, '{"review": "article.review", "title": ".entry-title", "text": ".entry-content", "author": ".author-name", "rating": ".star-rating", "date": "time.published", "product": ".product-name"}');
