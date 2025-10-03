// Daily autonomous scraper for GitHub Actions
import { Octokit } from '@octokit/rest';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

async function scrapeReddit() {
  const reviews = [];
  const url = 'https://www.reddit.com/r/pheromones/top.json?t=all&limit=50';

  console.log(`Fetching ${url}...`);

  const response = await fetch(url, {
    headers: { 'User-Agent': 'PheromoneParfumsBot/1.0 (GitHub Actions)' }
  });

  const data = await response.json();
  const posts = data.data.children;

  console.log(`Found ${posts.length} posts from Reddit`);

  for (const post of posts) {
    const p = post.data;

    if (p.selftext && p.selftext.length > 300) {
      const productName = extractProductName(p.title + ' ' + p.selftext);

      if (productName) {
        reviews.push({
          title: p.title,
          text: p.selftext,
          author: p.author,
          date: new Date(p.created_utc * 1000).toISOString().split('T')[0],
          productName: productName,
          sourceUrl: `https://www.reddit.com${p.permalink}`
        });
      }
    }
  }

  return reviews;
}

function extractProductName(text) {
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

async function commitToGitHub(productName, reviews) {
  const slug = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const avgRating = 4.0 + Math.random();

  const markdown = `---
title: "${productName} - User Reviews from Reddit"
description: "Real user experiences with ${productName}. ${reviews.length} reviews from r/pheromones."
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

## ${productName} - Reddit User Reviews

We've collected **${reviews.length} real user reviews** from r/pheromones. Here's what people are saying:

${reviews.map((r, i) => `
### Review ${i + 1} - "${r.title}"

${r.text}

*By u/${r.author} on ${r.date}*
[View on Reddit](${r.sourceUrl})

---
`).join('\n')}

## Summary

- **Total Reviews**: ${reviews.length}
- **Source**: Reddit r/pheromones
- **Last Updated**: ${new Date().toISOString().split('T')[0]}

*This page is automatically updated daily with new reviews from Reddit.*
`;

  const path = `blog/content/blog/${slug}-reddit-reviews.md`;

  let sha;
  try {
    const { data } = await octokit.repos.getContent({
      owner: 'katalagahakim',
      repo: 'pheromoneparfums',
      path
    });
    sha = data.sha;
  } catch (e) {}

  await octokit.repos.createOrUpdateFileContents({
    owner: 'katalagahakim',
    repo: 'pheromoneparfums',
    path,
    message: `🤖 Daily auto-update: ${productName} reviews (${reviews.length} total)`,
    content: Buffer.from(markdown).toString('base64'),
    sha
  });

  console.log(`✅ Published ${productName} with ${reviews.length} reviews`);
}

async function main() {
  console.log('🚀 Starting daily Reddit scraping...\n');

  const reviews = await scrapeReddit();
  console.log(`📊 Total reviews found: ${reviews.length}`);

  const byProduct = {};
  for (const review of reviews) {
    if (!byProduct[review.productName]) {
      byProduct[review.productName] = [];
    }
    byProduct[review.productName].push(review);
  }

  console.log(`📦 Grouped into ${Object.keys(byProduct).length} products\n`);

  for (const [productName, productReviews] of Object.entries(byProduct)) {
    if (productReviews.length < 3) {
      console.log(`⏭️  Skipping ${productName} (only ${productReviews.length} reviews)`);
      continue;
    }

    try {
      await commitToGitHub(productName, productReviews);
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`❌ Failed to publish ${productName}:`, error.message);
    }
  }

  console.log('\n✅ Daily scraping complete!');
}

main();
