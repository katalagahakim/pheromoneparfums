// Web scraper for pheromone reviews
// Uses fetch + HTML parsing (no Playwright needed)

export class ReviewScraper {
  constructor(env) {
    this.env = env;
    this.userAgent = 'PheromoneParfumsBot/1.0 (+https://pheromoneparfums.com/about)';
  }

  /**
   * Scrape reviews from a source URL
   */
  async scrapeSource(source) {
    console.log(`Scraping: ${source.name} (${source.domain})`);

    // Check robots.txt
    const robotsAllowed = await this.checkRobots(source.domain);
    if (!robotsAllowed) {
      console.log(`Robots.txt disallows: ${source.domain}`);
      return [];
    }

    // Check rate limit
    const rateLimited = await this.checkRateLimit(source.domain);
    if (rateLimited) {
      console.log(`Rate limited: ${source.domain}`);
      return [];
    }

    try {
      let reviews = [];

      // Handle different source types
      if (source.site_type === 'reddit') {
        reviews = await this.scrapeReddit(source);
      } else {
        reviews = await this.scrapeGeneric(source);
      }

      // Update rate limit
      await this.updateRateLimit(source.domain);

      console.log(`Found ${reviews.length} reviews from ${source.name}`);
      return reviews;
    } catch (error) {
      console.error(`Error scraping ${source.name}:`, error);
      throw error;
    }
  }

  /**
   * Scrape generic HTML pages
   */
  async scrapeGeneric(source) {
    const urls = await this.discoverUrls(source);
    const reviews = [];

    for (const url of urls) {
      try {
        const html = await this.fetchPage(url);
        const pageReviews = await this.extractReviews(html, url, source);
        reviews.push(...pageReviews);

        // Small delay between pages
        await this.delay(2000);
      } catch (error) {
        console.error(`Error fetching ${url}:`, error);
      }
    }

    return reviews;
  }

  /**
   * Scrape Reddit using JSON API
   */
  async scrapeReddit(source) {
    const config = JSON.parse(source.selector_config);
    const subreddits = config.subreddits || ['pheromones'];
    const reviews = [];

    for (const subreddit of subreddits) {
      try {
        // Use Reddit JSON API (no auth needed for public posts)
        const url = `https://www.reddit.com/r/${subreddit}/top.json?t=week&limit=25`;
        const response = await fetch(url, {
          headers: {
            'User-Agent': this.userAgent
          }
        });

        if (!response.ok) {
          console.error(`Reddit API error: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const posts = data.data.children;

        for (const post of posts) {
          const postData = post.data;

          // Check if post is about a pheromone product review
          if (this.isReviewPost(postData.title, postData.selftext)) {
            reviews.push({
              title: postData.title,
              text: postData.selftext,
              author: postData.author,
              rating: null, // Extract from text if possible
              date: new Date(postData.created_utc * 1000).toISOString().split('T')[0],
              productName: this.extractProductName(postData.title + ' ' + postData.selftext),
              sourceUrl: `https://www.reddit.com${postData.permalink}`,
              source
            });
          }
        }

        await this.delay(2000); // Reddit rate limit
      } catch (error) {
        console.error(`Error scraping r/${subreddit}:`, error);
      }
    }

    return reviews;
  }

  /**
   * Check if a Reddit post is likely a review
   */
  isReviewPost(title, text) {
    const reviewKeywords = [
      'review', 'experience', 'tried', 'tested', 'thoughts on',
      'opinion', 'feedback', 'works', 'does it work', 'worth it'
    ];

    const productKeywords = [
      'pheromone', 'cologne', 'oil', 'spray', 'attraction',
      'alfa maschio', 'pherazone', 'nexus', 'pheromax', 'bad wolf',
      'aqua vitae', 'evolve'
    ];

    const content = (title + ' ' + text).toLowerCase();

    const hasReviewKeyword = reviewKeywords.some(kw => content.includes(kw));
    const hasProductKeyword = productKeywords.some(kw => content.includes(kw));

    return hasReviewKeyword && hasProductKeyword && text.length > 100;
  }

  /**
   * Discover URLs to crawl from a source
   */
  async discoverUrls(source) {
    // For now, return a few example URLs
    // In production, this would crawl the site's review section
    const baseUrls = {
      'pherotruth.com': [
        'https://pherotruth.com/forums/pheromone-reviews/',
        'https://pherotruth.com/forums/product-discussions/'
      ],
      'love-scent.com': [
        'https://www.love-scent.com/Pheromone-Reviews-and-Testimonials_ep_41.html'
      ]
    };

    return baseUrls[source.domain] || [];
  }

  /**
   * Fetch a page and return HTML
   */
  async fetchPage(url) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': this.userAgent
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    return await response.text();
  }

  /**
   * Extract reviews from HTML using CSS selectors
   */
  async extractReviews(html, url, source) {
    // Import HTMLRewriter or use a simple HTML parser
    const selectors = JSON.parse(source.selector_config);
    const reviews = [];

    try {
      // Use a simple regex-based extraction for now
      // In production, use a proper HTML parser like node-html-parser
      const reviewPattern = this.buildReviewPattern(selectors);
      const matches = html.match(reviewPattern);

      if (matches) {
        for (const match of matches) {
          const review = {
            title: this.extractWithSelector(match, selectors.title),
            text: this.extractWithSelector(match, selectors.text),
            author: this.extractWithSelector(match, selectors.author),
            rating: this.extractRating(match, selectors.rating),
            date: this.extractDate(match, selectors.date),
            productName: this.extractProductName(match),
            sourceUrl: url,
            source
          };

          // Only include if we have meaningful text
          if (review.text && review.text.length > 50) {
            reviews.push(review);
          }
        }
      }
    } catch (error) {
      console.error('Error extracting reviews:', error);
    }

    return reviews;
  }

  /**
   * Build a regex pattern for finding review blocks
   */
  buildReviewPattern(selectors) {
    // Simple pattern to find review-like content
    // This is a fallback - ideally use proper HTML parsing
    return /<(?:div|article)[^>]*class="[^"]*review[^"]*"[^>]*>([\s\S]*?)<\/(?:div|article)>/gi;
  }

  /**
   * Extract text using a CSS selector (simplified)
   */
  extractWithSelector(html, selector) {
    if (!selector) return null;

    // Very simple selector extraction (for production, use a real HTML parser)
    const classMatch = selector.match(/\.([a-z0-9_-]+)/i);
    if (classMatch) {
      const className = classMatch[1];
      const pattern = new RegExp(`class="[^"]*${className}[^"]*"[^>]*>(.*?)<`, 'is');
      const match = html.match(pattern);
      return match ? this.stripHtml(match[1]).trim() : null;
    }

    return null;
  }

  /**
   * Strip HTML tags
   */
  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Extract rating from HTML
   */
  extractRating(html, selector) {
    if (!selector) return null;

    const ratingText = this.extractWithSelector(html, selector);
    if (!ratingText) return null;

    // Count stars
    const stars = (ratingText.match(/★/g) || []).length;
    if (stars > 0) return stars;

    // Numeric rating (4.5/5, 4.5 out of 5)
    const numMatch = ratingText.match(/(\d+\.?\d*)\s*(?:\/|out of)\s*(\d+)/i);
    if (numMatch) {
      const [, val, max] = numMatch;
      return (parseFloat(val) / parseFloat(max)) * 5;
    }

    // Percentage (90%)
    const pctMatch = ratingText.match(/(\d+)%/);
    if (pctMatch) {
      return (parseInt(pctMatch[1]) / 100) * 5;
    }

    // Direct number
    const directMatch = ratingText.match(/(\d+\.?\d*)/);
    if (directMatch) {
      return Math.min(5, parseFloat(directMatch[1]));
    }

    return null;
  }

  /**
   * Extract date from HTML
   */
  extractDate(html, selector) {
    if (!selector) return null;

    const dateText = this.extractWithSelector(html, selector);
    if (!dateText) return null;

    // Try ISO format first
    const isoMatch = dateText.match(/\d{4}-\d{2}-\d{2}/);
    if (isoMatch) return isoMatch[0];

    // Relative dates: "2 days ago", "3 weeks ago"
    const relativeMatch = dateText.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
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

    // Try to parse as date
    try {
      const parsed = new Date(dateText);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
      }
    } catch (e) {
      // Ignore
    }

    return null;
  }

  /**
   * Extract product name from text using keywords
   */
  extractProductName(text) {
    const knownProducts = [
      'Alfa Maschio', 'Alpha Maschio',
      'Pherazone', 'Pherazone Ultra',
      'Nexus Pheromones',
      'Pheromax', 'Pheromax for Women',
      'PheromoneXS', 'Aqua Vitae', 'Evolve-XS',
      'Bad Wolf', 'Liquid Alchemy Labs',
      'True Pheromones', 'Alpha-Q', 'Alpha Q',
      'Chikara', 'Primal Instinct',
      'Raw Chemistry', 'Alpha Dream'
    ];

    const lowerText = text.toLowerCase();

    for (const product of knownProducts) {
      if (lowerText.includes(product.toLowerCase())) {
        return product;
      }
    }

    // Try to extract from title/text using AI later
    return null;
  }

  /**
   * Check robots.txt
   */
  async checkRobots(domain) {
    const robotsUrl = `https://${domain}/robots.txt`;

    try {
      const response = await fetch(robotsUrl);
      if (!response.ok) return true; // No robots.txt = allowed

      const robotsTxt = await response.text();

      // Simple check - look for "Disallow: /"
      const lines = robotsTxt.split('\n');
      let currentAgent = null;

      for (const line of lines) {
        const trimmed = line.trim().toLowerCase();

        if (trimmed.startsWith('user-agent:')) {
          currentAgent = trimmed.split(':')[1].trim();
        }

        if ((currentAgent === '*' || currentAgent === 'pheromoneparfumsbot') &&
            trimmed === 'disallow: /') {
          return false;
        }
      }

      return true;
    } catch (e) {
      return true; // Error = assume allowed
    }
  }

  /**
   * Check rate limit
   */
  async checkRateLimit(domain) {
    const key = `ratelimit:${domain}`;
    const count = await this.env.KV.get(key);

    // Limit: 10 requests per minute per domain
    if (count && parseInt(count) >= 10) {
      return true; // Rate limited
    }

    return false;
  }

  /**
   * Update rate limit counter
   */
  async updateRateLimit(domain) {
    const key = `ratelimit:${domain}`;
    const count = await this.env.KV.get(key) || '0';
    await this.env.KV.put(key, String(parseInt(count) + 1), { expirationTtl: 60 });
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
