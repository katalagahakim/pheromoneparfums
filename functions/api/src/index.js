import { Router } from 'itty-router';
import { AutonomousReviewAgent } from './autonomous-agent.js';
import { PheromoneReviewAgent } from './agent.js';

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

    const agent = initializeAutonomousAgent(env);

    // Run the autonomous scraping
    ctx.waitUntil(agent.run());
  },
};
