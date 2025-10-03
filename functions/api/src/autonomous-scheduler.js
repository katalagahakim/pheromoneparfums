// Autonomous Review Scraping Scheduler
// Runs automatically every day via Cloudflare Cron
// Scrapes Reddit, forums, Shopify, Amazon, etc.

import { MultiSourceScraper } from './multi-source-scraper.js';
import { Octokit } from '@octokit/rest';

export class AutonomousScheduler {
  constructor(env) {
    this.env = env;
    this.scraper = new MultiSourceScraper();
    this.octokit = new Octokit({ auth: env.GITHUB_TOKEN });
  }

  /**
   * Main autonomous run - called by cron trigger
   */
  async run() {
    console.log('🤖 AUTONOMOUS SCRAPER STARTING');
    console.log(`Time: ${new Date().toISOString()}`);
    console.log('=' .repeat(50));

    try {
      // Step 1: Scrape all sources
      const reviews = await this.scraper.scrapeAllSources();

      if (reviews.length === 0) {
        console.log('No reviews found this run');
        return { success: true, reviewsFound: 0 };
      }

      console.log(`\n📊 Found ${reviews.length} reviews total`);

      // Step 2: Group by product
      const byProduct = this.groupByProduct(reviews);
      console.log(`📦 Grouped into ${Object.keys(byProduct).length} products`);

      // Step 3: Generate and publish markdown for each product
      let published = 0;

      for (const [productName, productReviews] of Object.entries(byProduct)) {
        // Need at least 3 reviews to publish
        if (productReviews.length < 3) {
          console.log(`⏭️  Skipping ${productName} (only ${productReviews.length} reviews)`);
          continue;
        }

        try {
          await this.publishProduct(productName, productReviews);
          published++;
          console.log(`✅ Published: ${productName} (${productReviews.length} reviews)`);

          // Small delay between GitHub commits
          await this.delay(2000);
        } catch (error) {
          console.error(`❌ Failed to publish ${productName}:`, error.message);
        }
      }

      console.log('\n' + '='.repeat(50));
      console.log(`🎉 AUTONOMOUS SCRAPER COMPLETE`);
      console.log(`📝 Reviews found: ${reviews.length}`);
      console.log(`📤 Products published: ${published}`);

      return {
        success: true,
        reviewsFound: reviews.length,
        productsPublished: published,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('💥 Fatal error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Group reviews by product name
   */
  groupByProduct(reviews) {
    const grouped = {};

    for (const review of reviews) {
      if (!review.productName) continue;

      if (!grouped[review.productName]) {
        grouped[review.productName] = [];
      }

      grouped[review.productName].push(review);
    }

    return grouped;
  }

  /**
   * Publish a product with its reviews to GitHub
   */
  async publishProduct(productName, reviews) {
    const slug = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const avgRating = this.calculateAverageRating(reviews);

    // Generate markdown
    const markdown = this.generateMarkdown(productName, reviews, avgRating);

    // Commit to GitHub
    const path = `blog/content/blog/${slug}.md`;

    // Try to get existing file SHA
    let sha;
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.env.GITHUB_REPO_OWNER,
        repo: this.env.GITHUB_REPO_NAME,
        path
      });
      sha = data.sha;
    } catch (e) {
      // File doesn't exist yet
    }

    // Create or update file
    await this.octokit.repos.createOrUpdateFileContents({
      owner: this.env.GITHUB_REPO_OWNER,
      repo: this.env.GITHUB_REPO_NAME,
      path,
      message: `🤖 Auto-update: ${productName} reviews (${reviews.length} total)

Autonomous scraper found ${reviews.length} reviews from:
${this.getSourcesSummary(reviews)}

Updated: ${new Date().toISOString().split('T')[0]}`,
      content: Buffer.from(markdown).toString('base64'),
      sha
    });
  }

  /**
   * Generate markdown file content
   */
  generateMarkdown(productName, reviews, avgRating) {
    const sources = [...new Set(reviews.map(r => r.source))];

    return `---
title: "${productName} - Real User Reviews"
description: "Authentic user experiences with ${productName}. ${reviews.length} real reviews from ${sources.join(', ')}."
date: ${new Date().toISOString().split('T')[0]}
layout: layouts/post.njk
tags:
  - posts
product:
  name: "${productName}"
  brand: "Various"
  type: "pheromone"
  rating: ${avgRating.toFixed(1)}
  review_count: ${reviews.length}
  gender: "unisex"
---

## ${productName} - Real User Reviews

**${reviews.length} authentic reviews** from ${sources.join(', ')}. Last updated: ${new Date().toISOString().split('T')[0]}

### Rating: ${avgRating.toFixed(1)}/5 ⭐

${reviews.map((r, i) => `
### Review ${i + 1} ${r.rating ? `- ${r.rating.toFixed(1)}/5 ⭐` : ''}

**${r.title || 'User Review'}**

${r.text.substring(0, 2000)}${r.text.length > 2000 ? '...' : ''}

*Source: ${r.source}*
*Author: ${r.author || 'Anonymous'}*
*Date: ${r.date}*
[View Original](${r.sourceUrl})

---
`).join('\n')}

## Summary

- **Total Reviews**: ${reviews.length}
- **Average Rating**: ${avgRating.toFixed(1)}/5
- **Sources**: ${sources.join(', ')}
- **Last Updated**: ${new Date().toISOString().split('T')[0]}

*This page is automatically updated daily with new reviews from across the internet.*
`;
  }

  /**
   * Calculate average rating
   */
  calculateAverageRating(reviews) {
    const ratings = reviews.filter(r => r.rating).map(r => r.rating);

    if (ratings.length === 0) return 4.0; // Default if no ratings

    const sum = ratings.reduce((a, b) => a + b, 0);
    return sum / ratings.length;
  }

  /**
   * Get sources summary
   */
  getSourcesSummary(reviews) {
    const sources = {};

    for (const review of reviews) {
      sources[review.source] = (sources[review.source] || 0) + 1;
    }

    return Object.entries(sources)
      .map(([source, count]) => `- ${source}: ${count} reviews`)
      .join('\n');
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
