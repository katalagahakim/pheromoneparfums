// Autonomous Review Agent - Main Orchestrator
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

  /**
   * Main agent run loop
   */
  async run() {
    console.log('=== Autonomous Review Agent Starting ===');
    console.log(`Time: ${new Date().toISOString()}`);

    try {
      // Step 1: Get sources to crawl
      const sources = await this.getSourcesToCrawl();
      console.log(`Found ${sources.length} sources to crawl`);

      if (sources.length === 0) {
        console.log('No sources need crawling at this time');
        return { success: true, stats: { sourcesProcessed: 0 } };
      }

      // Step 2: Scrape each source
      const allReviews = [];
      for (const source of sources) {
        try {
          console.log(`Scraping: ${source.name}`);
          const reviews = await this.scraper.scrapeSource(source);
          allReviews.push(...reviews.map(r => ({ ...r, sourceId: source.id })));

          await this.logCrawl(source.id, source.domain, 'success', reviews.length);

          // Delay between sources
          await this.delay(5000);
        } catch (error) {
          console.error(`Error scraping ${source.name}:`, error);
          await this.logCrawl(source.id, source.domain, 'failed', 0, error.message);
        }
      }

      console.log(`Scraped ${allReviews.length} total reviews`);

      // Step 3: Process each review
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
          const product = reviews[0].product;
          const metadata = await this.generateMetadata(reviews);
          const markdown = this.generateMarkdown(product, reviews, metadata);

          const result = await this.publishToGitHub(product, markdown);
          if (result.success) {
            published++;

            // Mark reviews as published
            for (const review of reviews) {
              await this.markAsPublished(review.id, result.path);
            }

            // Update product metadata
            await this.updateProductMetadata(productId, metadata);
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
      console.error('Fatal agent error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get sources that need crawling
   */
  async getSourcesToCrawl() {
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
    return results || [];
  }

  /**
   * Process a single review
   */
  async processReview(review) {
    console.log(`Processing review from ${review.sourceUrl}`);

    // 1. Quality filter
    if (!this.isHighQuality(review)) {
      console.log('Review failed quality check');
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
      review.productName || 'Unknown Product',
      review.text
    );

    if (!canonicalProduct) {
      console.log('Could not identify product, skipping');
      return null;
    }

    // 5. Sentiment analysis
    const sentiment = await this.analyzeSentiment(review.text);

    // 6. Save to D1
    const reviewId = await this.saveReview({
      productId: canonicalProduct.id,
      sourceId: review.sourceId,
      sourceUrl: review.sourceUrl,
      reviewTitle: review.title,
      reviewText: review.text,
      reviewerName: review.author,
      rating: review.rating,
      reviewDate: review.date,
      sentimentScore: sentiment.score,
      pros: JSON.stringify(sentiment.pros || []),
      cons: JSON.stringify(sentiment.cons || []),
      contentHash
    });

    // 7. Cache hash to prevent duplicates
    await this.env.KV.put(`review:${contentHash}`, String(reviewId), { expirationTtl: 2592000 }); // 30 days

    console.log(`✓ Saved review #${reviewId} for product: ${canonicalProduct.canonical_name}`);

    return {
      id: reviewId,
      ...review,
      product: canonicalProduct,
      sentiment
    };
  }

  /**
   * Check if review meets quality standards
   */
  isHighQuality(review) {
    if (!review.text || review.text.length < 100) return false;

    // Check for spam patterns
    const spamPatterns = [
      /buy now/gi,
      /click here/gi,
      /limited time/gi,
      /\b(viagra|cialis|pharmacy)\b/gi
    ];

    for (const pattern of spamPatterns) {
      if (pattern.test(review.text)) return false;
    }

    // Check for meaningful sentences
    const sentences = review.text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    if (sentences.length < 2) return false;

    return true;
  }

  /**
   * Generate SHA-256 hash of content
   */
  async generateHash(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Canonicalize product name using AI
   */
  async canonicalizeProduct(rawName, reviewText) {
    // Check cache first
    const cacheKey = `product:${rawName.toLowerCase()}`;
    const cached = await this.env.KV.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    try {
      // Use OpenAI to extract product info
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a product information extractor for pheromone fragrances. Extract product details from the review text. Return JSON with: name (canonical product name), brand, type (cologne/oil/spray/gel), gender (men/women/unisex), compounds (array of pheromone compound names like androstenone, androstenol, etc.). If you cannot determine a field, use null."
          },
          {
            role: "user",
            content: `Product name hint: "${rawName}"\n\nReview text:\n${reviewText.substring(0, 1000)}`
          }
        ],
        response_format: { type: "json_object" }
      });

      const productInfo = JSON.parse(response.choices[0].message.content);

      if (!productInfo.name || productInfo.name === 'null' || productInfo.name.toLowerCase() === 'unknown') {
        console.log('AI could not identify product');
        return null;
      }

      // Check if product exists in DB
      let product = await this.findProduct(productInfo.name, productInfo.brand);

      if (!product) {
        // Create new product
        product = await this.createProduct(productInfo);
        console.log(`Created new product: ${product.canonical_name}`);
      }

      // Cache for 7 days
      await this.env.KV.put(cacheKey, JSON.stringify(product), { expirationTtl: 604800 });

      return product;
    } catch (error) {
      console.error('Error canonicalizing product:', error);
      return null;
    }
  }

  /**
   * Analyze sentiment and extract pros/cons
   */
  async analyzeSentiment(text) {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Analyze the sentiment of this pheromone product review. Return JSON with: sentiment (positive/negative/neutral), score (-1 to 1, where 1 is very positive), pros (array of positive aspects, max 3), cons (array of negative aspects, max 3)"
          },
          {
            role: "user",
            content: text.substring(0, 1500)
          }
        ],
        response_format: { type: "json_object" }
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('Error analyzing sentiment:', error);
      return {
        sentiment: 'neutral',
        score: 0,
        pros: [],
        cons: []
      };
    }
  }

  /**
   * Group reviews by product ID
   */
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

  /**
   * Generate aggregate metadata for a product
   */
  async generateMetadata(reviews) {
    const ratings = reviews.filter(r => r.rating).map(r => r.rating);
    const avgRating = ratings.length > 0
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length
      : 0;

    // Aggregate pros/cons
    const allPros = reviews.flatMap(r => {
      try {
        return r.sentiment?.pros || [];
      } catch {
        return [];
      }
    });

    const allCons = reviews.flatMap(r => {
      try {
        return r.sentiment?.cons || [];
      } catch {
        return [];
      }
    });

    const topPros = this.getTopItems(allPros, 5);
    const topCons = this.getTopItems(allCons, 5);

    return {
      avg_rating: avgRating,
      review_count: reviews.length,
      pros: topPros,
      cons: topCons
    };
  }

  /**
   * Get most frequent items from array
   */
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

  /**
   * Generate markdown file for product
   */
  generateMarkdown(product, reviews, metadata) {
    const avgRating = metadata.avg_rating.toFixed(1);
    const reviewCount = reviews.length;

    const frontmatter = `---
title: "${product.canonical_name} by ${product.brand} - ${reviewCount} Real User Reviews"
description: "Comprehensive analysis of ${product.canonical_name} based on ${reviewCount} verified user reviews from across the web"
date: ${new Date().toISOString().split('T')[0]}
tags: ["${product.brand.toLowerCase()}", "${product.product_type}", "${product.gender_target}", "pheromone", "review"]
product:
  brand: "${product.brand}"
  name: "${product.canonical_name}"
  type: "${product.product_type}"
  gender: "${product.gender_target}"
  rating: ${avgRating}
  review_count: ${reviewCount}
  compounds: ${product.pheromone_compounds || '[]'}
  pros: ${JSON.stringify(metadata.pros)}
  cons: ${JSON.stringify(metadata.cons)}
layout: layouts/post.njk
---`;

    const body = `
# ${product.canonical_name} - User Review Analysis

## Overview

Based on **${reviewCount} real user reviews** collected from across the web, ${product.canonical_name} by ${product.brand} receives an average rating of **${avgRating}/5**.

**Product Details:**
- **Type**: ${product.product_type}
- **Target**: ${product.gender_target}
- **Brand**: ${product.brand}
${product.pheromone_compounds ? `- **Pheromone Compounds**: ${JSON.parse(product.pheromone_compounds).join(', ')}` : ''}

---

## Aggregate Analysis

### What Users Love (Pros)
${metadata.pros.length > 0 ? metadata.pros.map(pro => `- ${pro}`).join('\n') : '- Positive feedback collected'}

### Common Concerns (Cons)
${metadata.cons.length > 0 ? metadata.cons.map(con => `- ${con}`).join('\n') : '- Some concerns noted'}

---

## User Reviews (${reviewCount} Total Reviews)

${reviews.map((review, i) => {
  const rating = review.rating ? `**Rating**: ${review.rating.toFixed(1)}/5` : '';
  return `
### Review ${i + 1} ${rating ? `- ${rating}` : ''}

${review.title ? `**${review.title}**\n\n` : ''}${review.text}

*By ${review.author || 'Anonymous'} ${review.date ? `on ${review.date}` : ''}*
*Source: [${new URL(review.sourceUrl).hostname}](${review.sourceUrl})*

---
`;
}).join('\n')}

## Review Sources

This analysis aggregates reviews from trusted sources:
${[...new Set(reviews.map(r => new URL(r.sourceUrl).hostname))].map(domain => `- ${domain}`).join('\n')}

All reviews are sourced from publicly available websites and fully attributed to their original sources.

---

## Conclusion

${this.generateConclusion(product.canonical_name, metadata)}

---

*Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}*
*This page aggregates real user reviews from public sources. We are not affiliated with ${product.brand}.*
`;

    return frontmatter + '\n\n' + body;
  }

  /**
   * Generate conclusion based on rating
   */
  generateConclusion(productName, metadata) {
    const avgRating = metadata.avg_rating;
    const reviewCount = metadata.review_count;

    if (avgRating >= 4.5) {
      return `With an outstanding average rating of **${avgRating.toFixed(1)}/5** across ${reviewCount} reviews, **${productName}** is highly recommended by users. The overwhelming majority of reviewers report positive experiences${metadata.pros[0] ? `, particularly highlighting ${metadata.pros[0].toLowerCase()}` : ''}.`;
    } else if (avgRating >= 4.0) {
      return `**${productName}** receives solid ratings averaging **${avgRating.toFixed(1)}/5** from ${reviewCount} reviews. Most users report satisfaction${metadata.cons[0] ? `, though some note ${metadata.cons[0].toLowerCase()}` : ''}.`;
    } else if (avgRating >= 3.0) {
      return `With a mixed rating of **${avgRating.toFixed(1)}/5** across ${reviewCount} reviews, **${productName}** shows variable results. Consider the specific pros and cons carefully based on your needs.`;
    } else if (avgRating > 0) {
      return `**${productName}** receives below-average ratings (**${avgRating.toFixed(1)}/5**) from ${reviewCount} reviews${metadata.cons[0] ? `. Users frequently mention concerns about ${metadata.cons[0].toLowerCase()}` : ''}.`;
    } else {
      return `Based on ${reviewCount} reviews, **${productName}** has mixed feedback. Read individual reviews to make an informed decision.`;
    }
  }

  /**
   * Publish markdown to GitHub
   */
  async publishToGitHub(product, markdown) {
    const slug = product.canonical_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const filePath = `blog/content/blog/${slug}.md`;

    try {
      let sha;
      try {
        const { data } = await this.octokit.repos.getContent({
          owner: this.config.repoOwner,
          repo: this.config.repoName,
          path: filePath
        });
        sha = data.sha;
        console.log(`Updating existing file: ${filePath}`);
      } catch (e) {
        console.log(`Creating new file: ${filePath}`);
      }

      await this.octokit.repos.createOrUpdateFileContents({
        owner: this.config.repoOwner,
        repo: this.config.repoName,
        path: filePath,
        message: `Update review: ${product.canonical_name} (${new Date().toISOString()})`,
        content: Buffer.from(markdown).toString('base64'),
        sha
      });

      console.log(`✓ Published: ${filePath}`);
      return { success: true, path: filePath };
    } catch (error) {
      console.error(`Failed to publish ${filePath}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Database operations
   */
  async saveReview(data) {
    const stmt = this.env.DB.prepare(`
      INSERT INTO reviews (
        product_id, source_site_id, source_url, review_title, review_text,
        reviewer_name, rating, review_date, sentiment_score, pros, cons, content_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = await stmt.bind(
      data.productId,
      data.sourceId,
      data.sourceUrl,
      data.reviewTitle,
      data.reviewText,
      data.reviewerName,
      data.rating,
      data.reviewDate,
      data.sentimentScore,
      data.pros,
      data.cons,
      data.contentHash
    ).run();

    return result.meta.last_row_id;
  }

  async findProduct(name, brand) {
    const stmt = this.env.DB.prepare(`
      SELECT * FROM products
      WHERE canonical_name = ? AND brand = ?
      LIMIT 1
    `);

    const result = await stmt.bind(name, brand).first();
    return result;
  }

  async createProduct(productInfo) {
    const stmt = this.env.DB.prepare(`
      INSERT INTO products (canonical_name, brand, product_type, gender_target, pheromone_compounds)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = await stmt.bind(
      productInfo.name,
      productInfo.brand || 'Unknown',
      productInfo.type || 'cologne',
      productInfo.gender || 'unisex',
      JSON.stringify(productInfo.compounds || [])
    ).run();

    return {
      id: result.meta.last_row_id,
      canonical_name: productInfo.name,
      brand: productInfo.brand || 'Unknown',
      product_type: productInfo.type || 'cologne',
      gender_target: productInfo.gender || 'unisex',
      pheromone_compounds: JSON.stringify(productInfo.compounds || [])
    };
  }

  async markAsPublished(reviewId, githubPath) {
    const stmt = this.env.DB.prepare(`
      UPDATE reviews
      SET published_to_github = 1, github_file_path = ?
      WHERE id = ?
    `);

    await stmt.bind(githubPath, reviewId).run();
  }

  async updateProductMetadata(productId, metadata) {
    const stmt = this.env.DB.prepare(`
      INSERT OR REPLACE INTO product_metadata (product_id, avg_rating, review_count, pros, cons, last_updated)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);

    await stmt.bind(
      productId,
      metadata.avg_rating,
      metadata.review_count,
      JSON.stringify(metadata.pros),
      JSON.stringify(metadata.cons)
    ).run();
  }

  async logCrawl(siteId, url, status, reviewsFound, errorMessage = null) {
    const stmt = this.env.DB.prepare(`
      INSERT INTO crawl_log (source_site_id, url, status, reviews_found, error_message)
      VALUES (?, ?, ?, ?, ?)
    `);

    await stmt.bind(siteId, url, status, reviewsFound, errorMessage).run();

    if (status === 'success') {
      const updateStmt = this.env.DB.prepare(`
        UPDATE source_sites
        SET last_crawled = datetime('now')
        WHERE id = ?
      `);
      await updateStmt.bind(siteId).run();
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
