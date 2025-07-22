# Pheromone Review Agent

This is the autonomous agent component of the Pheromone Parfums system. It's built as a Cloudflare Worker that uses OpenAI's API to generate pheromone product reviews and commits them to a GitHub repository.

## Overview

The agent performs the following tasks:

1. Searches for trending pheromone products
2. Researches these products by analyzing reviews and discussions
3. Generates comprehensive, detailed reviews
4. Formats the reviews as Markdown files
5. Commits the reviews to a GitHub repository

## Directory Structure

- `src/` - Source code for the agent
  - `index.js` - Main entry point for the Cloudflare Worker
  - `agent.js` - PheromoneReviewAgent class implementation
- `wrangler.toml` - Cloudflare Worker configuration
- `.env.example` - Example environment variables

## Setup Instructions

### Prerequisites

- Node.js and npm installed
- Cloudflare account
- GitHub account and repository for the blog content
- OpenAI API key

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

### Deployment

1. Login to Cloudflare:
   ```bash
   npx wrangler login
   ```

2. Set up your secrets:
   ```bash
   npx wrangler secret put GITHUB_TOKEN
   npx wrangler secret put OPENAI_API_KEY
   ```

3. Deploy the worker:
   ```bash
   npm run deploy
   ```

## Configuration

### Environment Variables

- `GITHUB_TOKEN` - GitHub personal access token with repo permissions
- `GITHUB_REPO_OWNER` - GitHub username or organization name
- `GITHUB_REPO_NAME` - Name of the repository for blog content
- `OPENAI_API_KEY` - OpenAI API key

### Scheduled Execution

The agent is configured to run once per day via a cron trigger in `wrangler.toml`. You can adjust the schedule by modifying the cron expression.

## API Endpoints

- `GET /` - Health check endpoint
- `POST /generate` - Manually trigger review generation

## How It Works

1. The agent is triggered either by a scheduled cron job or a manual API call
2. It uses OpenAI's API to identify trending pheromone products
3. For each product, it generates a detailed review
4. The review is formatted as a Markdown file with proper frontmatter
5. The agent uses the GitHub API to commit the review to the repository
6. Cloudflare Pages automatically rebuilds the blog when new content is committed

## License

MIT