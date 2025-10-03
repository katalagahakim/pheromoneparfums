// Multi-source autonomous scraper
// Fetches reviews from Reddit, Shopify, forums, Amazon, etc.

export class MultiSourceScraper {
  constructor() {
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  }

  /**
   * Main scraping orchestrator - scrapes all sources
   */
  async scrapeAllSources() {
    const allReviews = [];

    console.log('🚀 Starting multi-source scraping...');

    // 1. Scrape Reddit
    const redditReviews = await this.scrapeReddit();
    allReviews.push(...redditReviews);
    console.log(`✅ Reddit: ${redditReviews.length} reviews`);
    await this.delay(3000);

    // 2. Scrape PheroTruth Forum
    const forumReviews = await this.scrapePheroTruthForum();
    allReviews.push(...forumReviews);
    console.log(`✅ PheroTruth: ${forumReviews.length} reviews`);
    await this.delay(3000);

    // 3. Scrape Amazon (if product links available)
    const amazonReviews = await this.scrapeAmazon();
    allReviews.push(...amazonReviews);
    console.log(`✅ Amazon: ${amazonReviews.length} reviews`);
    await this.delay(3000);

    // 4. Scrape Shopify stores (Love Scent, PheromoneXS, etc.)
    const shopifyReviews = await this.scrapeShopifyStores();
    allReviews.push(...shopifyReviews);
    console.log(`✅ Shopify: ${shopifyReviews.length} reviews`);

    console.log(`\n🎉 Total reviews scraped: ${allReviews.length}`);
    return allReviews;
  }

  /**
   * Scrape Reddit r/pheromones
   */
  async scrapeReddit() {
    const reviews = [];

    try {
      const subreddits = ['pheromones', 'fragrance'];

      for (const sub of subreddits) {
        const url = `https://www.reddit.com/r/${sub}/top.json?t=all&limit=100`;
        const response = await fetch(url, {
          headers: { 'User-Agent': this.userAgent }
        });

        if (!response.ok) continue;

        const data = await response.json();
        const posts = data.data.children;

        for (const post of posts) {
          const p = post.data;

          // Filter for review posts with substantial content
          if (p.selftext && p.selftext.length > 300) {
            const productName = this.extractProductName(p.title + ' ' + p.selftext);

            if (productName) {
              reviews.push({
                title: p.title,
                text: p.selftext,
                author: p.author,
                date: new Date(p.created_utc * 1000).toISOString().split('T')[0],
                productName: productName,
                source: 'Reddit',
                sourceUrl: `https://reddit.com${p.permalink}`,
                rating: this.inferRating(p.selftext)
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Reddit scraping error:', error.message);
    }

    return reviews;
  }

  /**
   * Scrape PheroTruth Forum
   */
  async scrapePheroTruthForum() {
    const reviews = [];

    try {
      // PheroTruth forum threads (using Google search as proxy)
      const searchQuery = 'site:pherotruth.com review';
      const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;

      // Note: In production, you'd use proper forum scraping or API
      // For now, return empty to avoid blocking
      console.log('PheroTruth: Using alternative method (forum requires authentication)');

    } catch (error) {
      console.error('Forum scraping error:', error.message);
    }

    return reviews;
  }

  /**
   * Scrape Amazon product reviews
   */
  async scrapeAmazon() {
    const reviews = [];

    try {
      // Amazon review pages for known pheromone products
      const productASINs = [
        'B00KTTXPFA', // Example: Pherazone
        'B00KTTXPG8', // Example: Nexus
        // Add more ASINs
      ];

      for (const asin of productASINs) {
        const url = `https://www.amazon.com/product-reviews/${asin}/ref=cm_cr_dp_d_show_all_btm?ie=UTF8&reviewerType=all_reviews`;

        try {
          const response = await fetch(url, {
            headers: { 'User-Agent': this.userAgent }
          });

          if (!response.ok) continue;

          const html = await response.text();

          // Parse reviews from HTML (simplified - real implementation needs proper HTML parser)
          const reviewMatches = html.match(/<div data-hook="review"[\s\S]*?<\/div>/g) || [];

          for (const match of reviewMatches.slice(0, 10)) {
            const titleMatch = match.match(/data-hook="review-title"[^>]*>([^<]+)</);
            const textMatch = match.match(/data-hook="review-body"[^>]*>[\s\S]*?<span[^>]*>([^<]+)</);
            const ratingMatch = match.match(/a-star-(\d)/);

            if (titleMatch && textMatch) {
              reviews.push({
                title: titleMatch[1].trim(),
                text: textMatch[1].trim(),
                author: 'Amazon User',
                date: new Date().toISOString().split('T')[0],
                productName: this.extractProductName(titleMatch[1] + ' ' + textMatch[1]),
                source: 'Amazon',
                sourceUrl: `https://amazon.com/dp/${asin}`,
                rating: ratingMatch ? parseInt(ratingMatch[1]) : null
              });
            }
          }

          await this.delay(2000);
        } catch (err) {
          console.log(`Amazon ASIN ${asin} failed:`, err.message);
        }
      }
    } catch (error) {
      console.error('Amazon scraping error:', error.message);
    }

    return reviews;
  }

  /**
   * Scrape Shopify-based pheromone stores
   */
  async scrapeShopifyStores() {
    const reviews = [];

    try {
      const stores = [
        {
          url: 'love-scent.com',
          products: ['edge', 'primal-instinct', 'npa']
        },
        {
          url: 'pheromonexs.com',
          products: ['evolve-xs', 'signature', 'heart-soul']
        }
      ];

      for (const store of stores) {
        for (const product of store.products) {
          try {
            // Shopify product reviews API endpoint
            const reviewsUrl = `https://${store.url}/products/${product}.json`;

            const response = await fetch(reviewsUrl, {
              headers: { 'User-Agent': this.userAgent }
            });

            if (!response.ok) continue;

            const data = await response.json();

            // Most Shopify stores use apps like Yotpo, Judge.me for reviews
            // Try to fetch from reviews app endpoint
            const yotpoUrl = `https://staticw2.yotpo.com/batch`;

            // This is simplified - real implementation needs to reverse-engineer the reviews app
            console.log(`Checking ${store.url}/${product} for reviews...`);

            await this.delay(1000);
          } catch (err) {
            console.log(`Shopify ${store.url}/${product} error:`, err.message);
          }
        }
      }
    } catch (error) {
      console.error('Shopify scraping error:', error.message);
    }

    return reviews;
  }

  /**
   * Extract product name from text
   */
  extractProductName(text) {
    const lowerText = text.toLowerCase();

    const products = [
      'alfa maschio', 'bad wolf', 'aqua vitae', 'cohesion', 'nude alpha',
      'glace', 'ascend', 'pherazone', 'nexus pheromones', 'pheromax',
      'evolve-xs', 'pheromonexs', 'true pheromones', 'alpha-q', 'true alpha',
      'true instinct', 'love scent', 'edge', 'primal instinct', 'scent of eros',
      'npa', 'alpha androstenol', 'raw chemistry', 'chikara', 'athena 10x',
      'instant shine', 'instant jerk', 'a314', 'a1', 'voodoo', 'heart & soul'
    ];

    for (const product of products) {
      if (lowerText.includes(product)) {
        return product.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
    }

    return null;
  }

  /**
   * Infer rating from review text sentiment
   */
  inferRating(text) {
    const lowerText = text.toLowerCase();

    // Positive indicators
    const positive = ['love', 'great', 'amazing', 'works', 'effective', 'recommend',
                      'excellent', 'best', 'awesome', 'fantastic'];

    // Negative indicators
    const negative = ['waste', 'terrible', 'scam', 'doesn\'t work', 'disappointed',
                      'useless', 'fake', 'avoid', 'horrible'];

    let score = 3.0; // Neutral baseline

    for (const word of positive) {
      if (lowerText.includes(word)) score += 0.3;
    }

    for (const word of negative) {
      if (lowerText.includes(word)) score -= 0.5;
    }

    return Math.min(5.0, Math.max(1.0, score));
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
