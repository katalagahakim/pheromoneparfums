import { Router } from 'itty-router';
import { PheromoneReviewAgent } from './agent';

// Create a new router
const router = Router();

// Initialize the agent
let agent;


// Handle POST requests to /generate endpoint
router.post('/generate', async (request, env, ctx) => {
  try {
    // Initialize the agent if needed
    if (!agent) {
      agent = initializeAgent(env);
    }
    
    // Start the review generation process
    const reviewPromise = agent.generateNewReviews();
    
    // Wait for the process to complete (or timeout after 50 seconds)
    ctx.waitUntil(reviewPromise);
    
    // Return immediate response
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Review generation started. Check logs for results.' 
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

// Handle POST requests to /generate-specific endpoint
router.post('/generate-specific', async (request, env, ctx) => {
  try {
    // Initialize the agent if needed
    if (!agent) {
      agent = initializeAgent(env);
    }
    
    // Parse the request body
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
    
    // Generate a review for the specified product
    const reviewPromise = agent.generateReviewForProduct(body.product);
    
    // Wait for the process to complete
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

// Handle all other requests
router.all('*', ({ next }) => next());

// Helper function to initialize the agent
function initializeAgent(env) {
  const agent = new PheromoneReviewAgent(env, {
    githubToken: env.GITHUB_TOKEN,
    repoOwner: env.GITHUB_REPO_OWNER,
    repoName: env.GITHUB_REPO_NAME,
    openaiApiKey: env.OPENAI_API_KEY,
    reviewsPerRun: parseInt(env.MAX_REVIEWS_PER_RUN || '1'),
    maxReviewsTotal: parseInt(env.MAX_REVIEWS_TOTAL || '50')
  });
  
  // Initialize the agent
  agent.initialize();
  
  return agent;
}

export default {
  // Initialize the agent when the worker starts
  async fetch(request, env, ctx) {
    return router.handle(request, env, ctx);
  },
  
  // Handle scheduled events
  async scheduled(event, env, ctx) {
    // Initialize the agent if it hasn't been initialized yet
    if (!agent) {
      agent = initializeAgent(env);
    }
    
    // Generate new reviews
    ctx.waitUntil(agent.generateNewReviews());
  },
};
