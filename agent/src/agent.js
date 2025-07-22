import { Octokit } from '@octokit/rest';
import OpenAI from 'openai';

export class PheromoneReviewAgent {
  // Initialize with configuration
  constructor(env, options) {
    this.env = env;
    this.config = {
      githubToken: options.githubToken,
      repoOwner: options.repoOwner,
      repoName: options.repoName,
      reviewsPerRun: options.reviewsPerRun || 1,
      maxReviewsTotal: options.maxReviewsTotal || 50
    };
    
    // Initialize GitHub client
    this.octokit = new Octokit({ auth: this.config.githubToken });
    
    // Initialize OpenAI client
    this.openai = new OpenAI({ apiKey: this.config.openaiApiKey });
  }
  
  // Initialize the agent
  async initialize() {
    console.log('Pheromone Review Agent initialized');
  }
  
  // Main function to generate reviews
  async generateNewReviews() {
    console.log('Generating new reviews...');
    
    try {
      // Get existing reviews to avoid duplicates and respect maxReviewsTotal
      const existingReviews = await this.getExistingReviews();
      console.log(`Found ${existingReviews.length} existing reviews`);
      
      // Check if we've reached the maximum total reviews limit
      if (existingReviews.length >= this.config.maxReviewsTotal) {
        console.log(`Maximum review limit reached (${existingReviews.length}/${this.config.maxReviewsTotal}). Skipping generation.`);
        return { success: false, error: 'Maximum review limit reached' };
      }
      
      // 1. Get list of products to review
      const products = await this.findPheromoneProducts();
      
      console.log(`Found ${products.length} products to review`);
      
      // 2. Generate reviews up to the reviewsPerRun limit
      const results = [];
      let reviewsGenerated = 0;
      
      for (const product of products) {
        // Stop if we've reached the per-run limit
        if (reviewsGenerated >= this.config.reviewsPerRun) {
          console.log(`Reviews per run limit reached (${reviewsGenerated}/${this.config.reviewsPerRun}). Stopping.`);
          break;
        }
        
        // Stop if we've reached the total limit
        if (existingReviews.length + reviewsGenerated >= this.config.maxReviewsTotal) {
          console.log(`Maximum review limit reached (${existingReviews.length + reviewsGenerated}/${this.config.maxReviewsTotal}). Stopping.`);
          break;
        }
        
        // Generate the review
        const result = await this.generateReviewForProduct(product);
        results.push(result);
        
        // Only count successful generations
        if (result.success) {
          reviewsGenerated++;
        }
      }
      
      console.log(`Generated ${reviewsGenerated} new reviews`);
      return results;
    } catch (error) {
      console.error('Error generating reviews:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Find pheromone products to review
  async findPheromoneProducts() {
    console.log('Finding pheromone products to review...');
    
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that provides information about pheromone products."
          },
          {
            role: "user",
            content: "Find the top 5 pheromone fragrance products currently being discussed online. Return as JSON array with name, brand, and type properties for each product in a 'products' array."
          }
        ],
        response_format: { type: "json_object" }
      });
      
      const content = response.choices[0].message.content;
      const data = JSON.parse(content);
      
      if (data.products && Array.isArray(data.products) && data.products.length > 0) {
        console.log(`Found ${data.products.length} products using OpenAI`);
        return data.products;
      }
      
      console.log('No products found or invalid format from AI. Using fallback products.');
      // Return some default products as fallback
      return [
        { name: 'Alfa Maschio', brand: 'Alpha Dream', type: 'Pheromone Cologne' },
        { name: 'Pherazone Ultra', brand: 'Pherazone', type: 'Pheromone Cologne' },
        { name: 'Aqua Vitae', brand: 'PheromoneXS', type: 'Pheromone Cologne' },
        { name: 'Bad Wolf', brand: 'Liquid Alchemy Labs', type: 'Pheromone Oil' },
        { name: 'Evolve-XS', brand: 'Pheromone Treasures', type: 'Pheromone Cologne' }
      ];
    } catch (error) {
      console.error('Error finding pheromone products:', error);
      
      // Return some default products as fallback
      return [
        { name: 'Alfa Maschio', brand: 'Alpha Dream', type: 'Pheromone Cologne' },
        { name: 'Pherazone Ultra', brand: 'Pherazone', type: 'Pheromone Cologne' },
        { name: 'Aqua Vitae', brand: 'PheromoneXS', type: 'Pheromone Cologne' },
        { name: 'Bad Wolf', brand: 'Liquid Alchemy Labs', type: 'Pheromone Oil' },
        { name: 'Evolve-XS', brand: 'Pheromone Treasures', type: 'Pheromone Cologne' }
      ];
    }
  }
  
  // Get existing reviews from GitHub
  async getExistingReviews() {
    console.log('Getting existing reviews from GitHub...');
    
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.config.repoOwner,
        repo: this.config.repoName,
        path: 'blog/content/blog'
      });
      
      // Filter for markdown files
      const reviews = data
        .filter(file => file.type === 'file' && file.name.endsWith('.md'))
        .map(file => file.name);
      
      console.log(`Found ${reviews.length} existing reviews`);
      return reviews;
    } catch (error) {
      // If the directory doesn't exist yet, return an empty array
      if (error.status === 404) {
        console.log('Blog content directory not found. No existing reviews.');
        return [];
      }
      
      console.error('Error getting existing reviews:', error);
      return [];
    }
  }
  
  // Generate a review for a specific product
  async generateReviewForProduct(product) {
    console.log(`Generating review for ${product.name}...`);
    
    try {
      // Check if review already exists
      const existingReviews = await this.getExistingReviews();
      const slug = product.name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
      
      if (existingReviews.includes(`${slug}.md`)) {
        console.log(`Review for ${product.name} already exists. Skipping.`);
        return { success: false, product: product.name, error: 'Review already exists' };
      }
      
      // Research the product
      const productInfo = await this.researchProduct(product);
      
      // Generate the review content using AI
      const reviewContent = await this.generateReviewContent(product, productInfo);
      
      // Format the review as markdown
      const markdown = this.formatReviewAsMarkdown(product, reviewContent);
      
      // Commit the review to GitHub
      await this.commitReviewToGitHub(product, markdown);
      
      console.log(`Successfully generated and committed review for ${product.name}`);
      return { success: true, product: product.name };
    } catch (error) {
      console.error(`Error generating review for ${product.name}:`, error);
      return { success: false, product: product.name, error: error.message };
    }
  }
  
  // Generate a review for a product by name
  async generateReviewForProductName(productName) {
    console.log(`Generating review for product name: ${productName}...`);
    
    try {
      // Create a product object from the name
      const product = {
        name: productName,
        brand: 'Unknown', // Will be updated during research
        type: 'pheromone'
      };
      
      // Check if review already exists
      const existingReviews = await this.getExistingReviews();
      const slug = product.name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
      
      if (existingReviews.includes(`${slug}.md`)) {
        console.log(`Review for ${product.name} already exists. Skipping.`);
        return { success: false, product: product.name, error: 'Review already exists' };
      }
      
      // Research the product to get more details
      const productInfo = await this.researchProduct(product);
      
      // Update product with researched information if available
      if (productInfo.brand) {
        product.brand = productInfo.brand;
      }
      
      if (productInfo.type) {
        product.type = productInfo.type;
      }
      
      // Generate the review content using AI
      const reviewContent = await this.generateReviewContent(product, productInfo);
      
      // Format the review as markdown
      const markdown = this.formatReviewAsMarkdown(product, reviewContent);
      
      // Commit the review to GitHub
      await this.commitReviewToGitHub(product, markdown);
      
      console.log(`Successfully generated and committed review for ${product.name}`);
      return { success: true, product: product.name };
    } catch (error) {
      console.error(`Error generating review for ${productName}:`, error);
      return { success: false, product: productName, error: error.message };
    }
  }
  
  // Research a product to gather information
  async researchProduct(product) {
    console.log(`Researching ${product.name}...`);
    
    try {
      // Try using Cloudflare AI first
      try {
        const response = await this.ai.run('@cf/meta/llama-3-8b-instruct', {
          messages: [
            { role: 'system', content: 'You are a helpful assistant that researches pheromone products.' },
            { role: 'user', content: `Research the pheromone product "${product.name}" by "${product.brand}". Provide information about its composition, effects, user experiences, and general reception. Return as JSON with keys: composition, effects, userExperiences, reception.` }
          ],
          response_format: { type: 'json_object' }
        });
        
        // Parse the response
        const data = JSON.parse(response.response);
        if (data && (data.composition || data.effects)) {
          console.log(`Successfully researched ${product.name} using Cloudflare AI`);
          return data;
        }
      } catch (cloudflareError) {
        console.error(`Error researching ${product.name} with Cloudflare AI:`, cloudflareError);
      }
      
      // Fall back to OpenAI if Cloudflare AI fails
      const response = await this.openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that researches pheromone fragrance products."
          },
          {
            role: "user",
            content: `Research the pheromone fragrance product ${product.name} by ${product.brand}. Find information about its ingredients, effects, user experiences, and scientific basis. Return as JSON with sections for composition, effects, userExperiences, and reception.`
          }
        ],
        response_format: { type: "json_object" }
      });
      
      // Parse the response
      const content = response.choices[0].message.content;
      const data = JSON.parse(content);
      
      console.log(`Successfully researched ${product.name} using OpenAI`);
      return data;
    } catch (error) {
      console.error(`Error researching product ${product.name}:`, error);
      
      // Return default research as fallback
      return {
        composition: `${product.name} is a pheromone product by ${product.brand}.`,
        effects: 'Information not available',
        userExperiences: 'Information not available',
        reception: 'Information not available'
      };
    }
  }
  
  // Generate review content based on product information
  async generateReviewContent(product, productInfo) {
    console.log(`Creating review content for ${product.name}...`);
    
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert reviewer of pheromone fragrance products. Write comprehensive, informative, and engaging reviews."
          },
          {
            role: "user",
            content: `Write a comprehensive review of the pheromone fragrance product ${product.name} by ${product.brand}. Use the following information:\n\nComposition: ${JSON.stringify(productInfo.composition || productInfo.ingredients)}\nEffects: ${JSON.stringify(productInfo.effects)}\nUser Experiences: ${JSON.stringify(productInfo.userExperiences || productInfo.user_experiences)}\nReception: ${JSON.stringify(productInfo.reception || productInfo.scientific_basis)}\n\nThe review should include sections for Introduction, Composition Analysis, Performance Analysis, Application Recommendations, and Value Assessment. Also provide an overall rating from 1-5, at least 3 pros, and at least 2 cons. Return as JSON with keys: introduction, composition, performance, application, value, rating, pros (array), cons (array).`
          }
        ],
        response_format: { type: "json_object" }
      });
      
      // Parse the response
      const content = response.choices[0].message.content;
      const reviewContent = JSON.parse(content);
      
      console.log(`Successfully generated review for ${product.name} using OpenAI`);
      return this.validateReviewContent(reviewContent, product);
    } catch (error) {
      console.error(`Error generating review content for ${product.name}:`, error);
      
      // Return default review content as fallback
      return {
        introduction: `${product.name} is a pheromone product by ${product.brand}.`,
        composition: 'No composition information available.',
        performance: 'No performance information available.',
        application: 'Apply to pulse points for best results.',
        value: 'Value assessment not available.',
        rating: 3.5,
        pros: ['Easy to apply'],
        cons: ['Limited information available']
      };
    }
  }
  
  // Validate and ensure all required fields are present in review content
  validateReviewContent(reviewContent, product) {
    return {
      introduction: reviewContent.introduction || `${product.name} is a pheromone product by ${product.brand}.`,
      composition: reviewContent.composition || 'No composition information available.',
      performance: reviewContent.performance || 'No performance information available.',
      application: reviewContent.application || 'Apply to pulse points for best results.',
      value: reviewContent.value || 'Value assessment not available.',
      rating: reviewContent.rating || 3.5,
      pros: Array.isArray(reviewContent.pros) ? reviewContent.pros : ['Easy to apply'],
      cons: Array.isArray(reviewContent.cons) ? reviewContent.cons : ['Limited information available']
    };
  }
  
  // Format the review as a markdown file
  formatReviewAsMarkdown(product, reviewContent) {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const slug = product.name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
    
    // Create frontmatter
    const frontmatter = `---
title: "${product.name} by ${product.brand} - Comprehensive Pheromone Review"
description: "A detailed review of ${product.name}, a ${product.type} pheromone fragrance by ${product.brand}"
date: ${date}
tags: ["pheromone", "review", "${product.brand.toLowerCase()}", "${product.type.toLowerCase()}"]
rating: ${reviewContent.rating || 3.5}
---

`;
    
    // Format the review content as markdown
    const markdown = `
# ${product.name} Review

## Introduction
${reviewContent.introduction}

## Composition Analysis
${reviewContent.composition}

## Performance Analysis
${reviewContent.performance}

## Application Recommendations
${reviewContent.application}

## Value Assessment
${reviewContent.value}

## Pros and Cons

### Pros
${Array.isArray(reviewContent.pros) ? reviewContent.pros.map(pro => `- ${pro}`).join('\n') : '- Information not available'}

### Cons
${Array.isArray(reviewContent.cons) ? reviewContent.cons.map(con => `- ${con}`).join('\n') : '- Information not available'}

## Conclusion
Overall rating: **${reviewContent.rating}/5**
`;
    
    // Return the full markdown content
    return frontmatter + markdown;
  }
  
  // Commit the review to GitHub
  async commitReviewToGitHub(product, reviewContent) {
    console.log(`Committing review for ${product.name} to GitHub...`);
    
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const slug = product.name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
    const filePath = `blog/content/blog/${slug}.md`;
    
    try {
      // Get the current content of the file (if it exists)
      let sha;
      try {
        const { data } = await this.octokit.repos.getContent({
          owner: this.config.repoOwner,
          repo: this.config.repoName,
          path: filePath
        });
        sha = data.sha;
        console.log(`File already exists at ${filePath}, will update it`);
      } catch (error) {
        // File doesn't exist yet, which is fine
        console.log(`File doesn't exist at ${filePath}, will create it`);
      }
      
      // Create or update the file
      const response = await this.octokit.repos.createOrUpdateFileContents({
        owner: this.config.repoOwner,
        repo: this.config.repoName,
        path: filePath,
        message: `Add review for ${product.name}`,
        content: Buffer.from(reviewContent).toString('base64'),
        sha
      });
      
      console.log(`Successfully committed review for ${product.name} to GitHub`);
      return response.data;
    } catch (error) {
      console.error(`Error committing review for ${product.name} to GitHub:`, error);
      throw error;
    }
  }
}
