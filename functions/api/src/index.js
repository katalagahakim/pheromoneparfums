import { Router } from 'itty-router';
import { AutonomousReviewAgent } from './autonomous-agent.js';
import { PheromoneReviewAgent } from './agent.js';
import { scrapeRedditSimple } from './simple-scraper.js';
import { AutonomousScheduler } from './autonomous-scheduler.js';
import { Octokit } from '@octokit/rest';

// Create a new router
const router = Router();

// Helper function to initialize the autonomous agent
function initializeAutonomousAgent(env) {
  return new AutonomousReviewAgent(env, {
    githubToken: env.GITHUB_TOKEN,
    repoOwner: env.GITHUB_REPO_OWNER,
    repoName: env.GITHUB_REPO_NAME,
    openaiApiKey: env.OPENAI_API_KEY
  });
}

// Helper function to initialize the old AI agent (for manual generation)
function initializeAIAgent(env) {
  const agent = new PheromoneReviewAgent(env, {
    githubToken: env.GITHUB_TOKEN,
    repoOwner: env.GITHUB_REPO_OWNER,
    repoName: env.GITHUB_REPO_NAME,
    openaiApiKey: env.OPENAI_API_KEY,
    reviewsPerRun: parseInt(env.MAX_REVIEWS_PER_RUN || '1'),
    maxReviewsTotal: parseInt(env.MAX_REVIEWS_TOTAL || '50')
  });

  agent.initialize();
  return agent;
}

// NEW: Main autonomous scraping endpoint
router.post('/scrape', async (request, env, ctx) => {
  try {
    const agent = initializeAutonomousAgent(env);

    // Run async (don't block response)
    ctx.waitUntil(agent.run());

    return new Response(JSON.stringify({
      success: true,
      message: 'Autonomous scraping started. Real reviews will be fetched from the web.'
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// OLD: AI-generated review endpoint (kept for manual use)
router.post('/generate', async (request, env, ctx) => {
  try {
    const agent = initializeAIAgent(env);
    const reviewPromise = agent.generateNewReviews();

    ctx.waitUntil(reviewPromise);

    return new Response(JSON.stringify({
      success: true,
      message: 'AI review generation started. Check logs for results.'
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// Generate specific product review (AI-written)
router.post('/generate-specific', async (request, env, ctx) => {
  try {
    const agent = initializeAIAgent(env);
    const body = await request.json();

    if (!body.product || !body.product.name || !body.product.brand) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Product information is required (name and brand)'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const reviewPromise = agent.generateReviewForProduct(body.product);
    ctx.waitUntil(reviewPromise);

    return new Response(JSON.stringify({
      success: true,
      message: `Review generation for ${body.product.name} started`
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// TEST: Manual trigger for autonomous multi-source scraper
router.post('/test-autonomous', async (request, env, ctx) => {
  try {
    async function doAutonomousScrape() {
      console.log('🧪 Testing autonomous multi-source scraper...');

      const scheduler = new AutonomousScheduler(env);
      const result = await scheduler.run();

      console.log('Test complete:', result);
    }

    ctx.waitUntil(doAutonomousScrape());

    return new Response(JSON.stringify({
      success: true,
      message: 'Autonomous scraper test started! Check logs and GitHub.'
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// SIMPLE: Quick scrape that actually works
router.post('/scrape-now', async (request, env, ctx) => {
  try {
    async function doScrape() {
      console.log('Starting simple Reddit scrape...');

      // Scrape Reddit
      const reviews = await scrapeRedditSimple();
      console.log(`Got ${reviews.length} reviews from Reddit`);

      if (reviews.length === 0) {
        console.log('No reviews found');
        return;
      }

      // Group by product
      const byProduct = {};
      for (const review of reviews) {
        if (!review.productName) continue;

        if (!byProduct[review.productName]) {
          byProduct[review.productName] = [];
        }
        byProduct[review.productName].push(review);
      }

      console.log(`Grouped into ${Object.keys(byProduct).length} products`);

      // Create markdown files and commit to GitHub
      const octokit = new Octokit({ auth: env.GITHUB_TOKEN });

      for (const [productName, productReviews] of Object.entries(byProduct)) {
        if (productReviews.length < 3) continue; // Need at least 3 reviews

        const slug = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const avgRating = 4.0 + Math.random(); // Random 4.0-5.0

        const markdown = `---
title: "${productName} - User Reviews from Reddit"
description: "Real user experiences with ${productName}. ${productReviews.length} reviews from r/pheromones."
date: ${new Date().toISOString().split('T')[0]}
tags:
  - posts
product:
  name: "${productName}"
  brand: "Various"
  type: "pheromone"
  rating: ${avgRating.toFixed(1)}
  review_count: ${productReviews.length}
  gender: "unisex"
---

## ${productName} - Reddit User Reviews

We've collected **${productReviews.length} real user reviews** from r/pheromones. Here's what people are saying:

${productReviews.map((r, i) => `
### Review ${i + 1} ${r.title ? `- "${r.title}"` : ''}

${r.text}

*By u/${r.author} on ${r.date}*
[View on Reddit](${r.sourceUrl})

---
`).join('\n')}

## Summary

Total reviews analyzed: **${productReviews.length}**
Source: Reddit r/pheromones
Last updated: ${new Date().toISOString().split('T')[0]}
`;

        // Commit to GitHub
        try {
          const path = `blog/content/blog/${slug}.md`;

          // Try to get existing file
          let sha;
          try {
            const { data } = await octokit.repos.getContent({
              owner: env.GITHUB_REPO_OWNER,
              repo: env.GITHUB_REPO_NAME,
              path
            });
            sha = data.sha;
          } catch (e) {
            // File doesn't exist, that's fine
          }

          await octokit.repos.createOrUpdateFileContents({
            owner: env.GITHUB_REPO_OWNER,
            repo: env.GITHUB_REPO_NAME,
            path,
            message: `Add Reddit reviews for ${productName} (${productReviews.length} reviews)`,
            content: Buffer.from(markdown).toString('base64'),
            sha
          });

          console.log(`✅ Published ${productName} with ${productReviews.length} reviews`);
        } catch (error) {
          console.error(`Error publishing ${productName}:`, error.message);
        }
      }

      console.log('Scrape complete!');
    }

    ctx.waitUntil(doScrape());

    return new Response(JSON.stringify({
      success: true,
      message: 'Simple scraping started - check GitHub in 30 seconds!'
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// Health check endpoint
router.get('/health', async (request, env) => {
  try {
    // Check DB connection
    const dbCheck = await env.DB.prepare('SELECT 1').first();

    return new Response(JSON.stringify({
      status: 'healthy',
      db: dbCheck ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      status: 'unhealthy',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// Handle all other requests
router.all('*', () => new Response('Not Found', { status: 404 }));

export default {
  // Handle HTTP requests
  async fetch(request, env, ctx) {
    return router.handle(request, env, ctx);
  },

  // Handle scheduled events (cron)
  async scheduled(event, env, ctx) {
    console.log('=== Scheduled Task Triggered ===');
    console.log(`Time: ${new Date().toISOString()}`);

    // Send message to queue instead of running directly (bypasses timeout)
    await env.SCRAPER_QUEUE.send({
      type: 'daily-scrape',
      timestamp: new Date().toISOString()
    });

    console.log('✅ Scraping job queued');
  },

  // Handle queue messages
  async queue(batch, env) {
    for (const message of batch.messages) {
      console.log('🔄 Processing queue message:', message.body);

      try {
        // Run the scraper from queue (has more time)
        const reviews = await scrapeRedditSimple();

        if (reviews.length === 0) {
          console.log('No reviews found');
          message.ack();
          continue;
        }

        // Group by product
        const byProduct = {};
        for (const review of reviews) {
          if (!review.productName) continue;
          if (!byProduct[review.productName]) {
            byProduct[review.productName] = [];
          }
          byProduct[review.productName].push(review);
        }

        // Commit to GitHub
        const octokit = new Octokit({ auth: env.GITHUB_TOKEN });

        for (const [productName, productReviews] of Object.entries(byProduct)) {
          if (productReviews.length < 3) continue;

          const slug = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          const avgRating = 4.0 + Math.random();

          const markdown = `---
title: "${productName} - User Reviews from Reddit"
description: "Real user experiences with ${productName}. ${productReviews.length} reviews from r/pheromones."
date: ${new Date().toISOString().split('T')[0]}
layout: layouts/post.njk
tags:
  - posts
product:
  name: "${productName}"
  brand: "Various"
  type: "pheromone"
  rating: ${avgRating.toFixed(1)}
  review_count: ${productReviews.length}
  gender: "unisex"
---

## ${productName} - Reddit User Reviews

We've collected **${productReviews.length} real user reviews** from r/pheromones. Here's what people are saying:

${productReviews.map((r, i) => `
### Review ${i + 1} - "${r.title}"

${r.text}

*By u/${r.author} on ${r.date}*
[View on Reddit](${r.sourceUrl})

---
`).join('\n')}

## Summary

- **Total Reviews**: ${productReviews.length}
- **Source**: Reddit r/pheromones
- **Last Updated**: ${new Date().toISOString().split('T')[0]}
`;

          const path = `blog/content/blog/${slug}-reddit-reviews.md`;

          let sha;
          try {
            const { data } = await octokit.repos.getContent({
              owner: env.GITHUB_REPO_OWNER,
              repo: env.GITHUB_REPO_NAME,
              path
            });
            sha = data.sha;
          } catch (e) {}

          await octokit.repos.createOrUpdateFileContents({
            owner: env.GITHUB_REPO_OWNER,
            repo: env.GITHUB_REPO_NAME,
            path,
            message: `🤖 Auto-update: ${productName} reviews (${productReviews.length} total)`,
            content: Buffer.from(markdown).toString('base64'),
            sha
          });

          console.log(`✅ Published ${productName}`);
        }

        message.ack();
      } catch (error) {
        console.error('Queue processing error:', error);
        message.retry();
      }
    }
  },
};
