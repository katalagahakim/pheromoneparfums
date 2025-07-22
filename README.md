# Autonomous Pheromone Review Blog

This project creates an autonomous system that generates pheromone fragrance product reviews using Cloudflare Workers AI agents and publishes them to a static blog hosted on Cloudflare Pages.

## Project Overview

The system consists of two main components:

1. **Cloudflare AI Agent**: An autonomous worker that searches for pheromone product reviews and forum discussions, analyzes them, and generates comprehensive review content
2. **Static Blog Site**: An Eleventy-based blog hosted on Cloudflare Pages that displays the generated reviews

### Key Features

- **Autonomous Content Generation**: The agent automatically researches and generates high-quality pheromone product reviews
- **Scheduled Publishing**: New reviews are generated and published on a regular schedule
- **Beautiful Blog Interface**: A responsive, modern blog design optimized for readability
- **SEO Optimized**: Includes sitemap, meta tags, and structured data for better search engine visibility
- **Tag-Based Navigation**: Reviews are categorized by brand, product type, and other relevant tags

## Usage

For detailed instructions on using the autonomous agent and customizing the blog, please refer to the [USAGE.md](./USAGE.md) file.

## Project Structure

```
├── agent/                 # Cloudflare Worker AI Agent code
│   ├── src/               # Source code for the agent
│   │   ├── index.js       # Main entry point for the agent
│   │   └── agent.js       # Agent implementation
│   ├── wrangler.toml      # Cloudflare Worker configuration
│   └── package.json       # Dependencies for the agent
│
├── blog/                  # Eleventy blog site
│   ├── _data/             # Site data
│   ├── _includes/         # Templates and layouts
│   ├── content/           # Blog content
│   │   └── blog/          # Blog posts
│   ├── .eleventy.js       # Eleventy configuration
│   └── package.json       # Dependencies for the blog
│
├── package.json          # Root package.json with workspace configuration
├── USAGE.md              # Detailed usage instructions
└── README.md             # Project documentation
```

## Setup Instructions

### Prerequisites

- Node.js and npm installed
- Cloudflare account
- GitHub account
- OpenAI API key

### Quick Start

1. Clone the repository
2. Install dependencies (for Windows PowerShell):
   ```powershell
   # Install root dependencies
   npm install
   
   # Install blog dependencies
   npm run install:blog
   
   # Install agent dependencies
   npm run install:agent
   ```
3. Start the blog for local development:
   ```powershell
   npm run start:blog
   ```
4. Start the agent for local development:
   ```powershell
   npm run start:agent
   ```

> **Note:** 
> - The updated scripts now use `npx` to directly call the locally installed binaries
> - PowerShell doesn't support the `&&` operator like bash does. The scripts in package.json have been updated to work with PowerShell
> - Make sure all dependencies are properly installed before starting the blog or agent

### Setting Up the Agent

1. Navigate to the `agent` directory
2. Run `npm install` to install dependencies
3. Create a `.dev.vars` file with your API keys and configuration
4. Run `npx wrangler dev` to test locally
5. Deploy with `npx wrangler deploy`

### Setting Up the Blog

1. Navigate to the `blog` directory
2. Run `npm install` to install dependencies
3. Run `npx @11ty/eleventy --serve` to test locally
4. Connect to Cloudflare Pages for deployment

## How It Works

1. The Cloudflare AI Agent runs on a schedule to generate new pheromone product reviews
2. It searches for information about popular pheromone products
3. It analyzes the information and generates comprehensive reviews
4. The reviews are committed to the GitHub repository as Markdown files
5. Cloudflare Pages automatically builds and deploys the updated blog

## Configuration

See the `.env.example` files in each directory for required environment variables.

## Troubleshooting

- **`npm install` fails with `ECONNRESET` or other network errors:** This may be a temporary issue with the npm registry or your network connection. Try running the command again. If the problem persists, you may need to configure a proxy or check your firewall settings.
- **`npm install` fails with `EBUSY` on Windows:** This error indicates that a file or directory is locked. Try the following steps:
  1. Close any open editors or terminals that might be using the project files.
  2. Run `npm cache clean --force`.
  3. Delete the `node_modules` directory and the `package-lock.json` file in the failing workspace (`agent` or `blog`).
  4. Try running `npm install` again.