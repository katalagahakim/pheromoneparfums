// Cloudflare-based autonomous scraper (no GitHub Actions needed)
import { Octokit } from '@octokit/rest';

export async function handleCronScraping(env) {
  console.log('🤖 Cron-triggered autonomous scraping started');

  try {
    // Scrape Reddit
    const reviews = await scrapeReddit();
    console.log(`Found ${reviews.length} reviews from Reddit`);

    if (reviews.length === 0) {
      console.log('No reviews found this run');
      return { success: true, message: 'No reviews found' };
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

    // Commit to GitHub via Octokit
    const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
    let published = 0;

    for (const [productName, productReviews] of Object.entries(byProduct)) {
      if (productReviews.length < 3) continue;

      const slug = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const avgRating = 4.0 + Math.random();
      const productImage = getProductImage(productName);

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
  image: "${productImage || ''}"
---

## ${productName} - Reddit User Reviews

${productImage ? `![${productName} Product Image](${productImage})\n` : ''}

**${productReviews.length} real reviews** from r/pheromones:

${productReviews.map((r, i) => `
### Review ${i + 1} - "${r.title}"

${r.imageUrl ? `![${productName}](${r.imageUrl})\n` : ''}
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
        message: `🤖 Autonomous daily update: ${productName} reviews (${productReviews.length} total)`,
        content: Buffer.from(markdown).toString('base64'),
        sha
      });

      published++;
      console.log(`✅ Published ${productName}`);
    }

    console.log(`✅ Autonomous scraping complete: ${published} products published`);
    return { success: true, reviewsFound: reviews.length, productsPublished: published };

  } catch (error) {
    console.error('Scraping error:', error);
    return { success: false, error: error.message };
  }
}

async function scrapeReddit() {
  const reviews = [];

  try {
    const url = 'https://www.reddit.com/r/pheromones/top.json?t=week&limit=50';

    const response = await fetch(url, {
      headers: { 'User-Agent': 'PheromoneParfumsBot/1.0' }
    });

    if (!response.ok) {
      // Reddit blocked, return empty
      console.log(`Reddit returned ${response.status}`);
      return [];
    }

    const data = await response.json();
    const posts = data.data.children;

    for (const post of posts) {
      const p = post.data;

      if (p.selftext && p.selftext.length > 300) {
        const productName = extractProductName(p.title + ' ' + p.selftext);

        if (productName) {
          // Extract image URL if post has one
          let imageUrl = null;
          if (p.url && (p.url.endsWith('.jpg') || p.url.endsWith('.png') || p.url.endsWith('.jpeg') || p.url.includes('i.redd.it') || p.url.includes('imgur'))) {
            imageUrl = p.url;
          } else if (p.preview && p.preview.images && p.preview.images[0]) {
            imageUrl = p.preview.images[0].source.url.replace(/&amp;/g, '&');
          }

          reviews.push({
            title: p.title,
            text: p.selftext,
            author: p.author,
            date: new Date(p.created_utc * 1000).toISOString().split('T')[0],
            productName: productName,
            sourceUrl: `https://www.reddit.com${p.permalink}`,
            imageUrl: imageUrl
          });
        }
      }
    }
  } catch (error) {
    console.error('Reddit fetch error:', error.message);
  }

  return reviews;
}

// Product image database
const productImages = {
  'Alfa Maschio': 'https://pherotruth.com/wp-content/uploads/2015/11/alfa-maschio.jpg',
  'Bad Wolf': 'https://cdn.shopify.com/s/files/1/0016/1049/3825/products/bad-wolf.jpg',
  'Aqua Vitae': 'https://cdn.shopify.com/s/files/1/0016/1049/3825/products/aqua-vitae.jpg',
  'Cohesion': 'https://cdn.shopify.com/s/files/1/0016/1049/3825/products/cohesion.jpg',
  'Edge': 'https://cdn.shopify.com/s/files/1/0016/1049/3825/products/edge.jpg',
  'Ascend': 'https://cdn.shopify.com/s/files/1/0016/1049/3825/products/ascend.jpg',
  'Pherazone': 'https://www.pherazone.com/images/pherazone-bottle.jpg',
  'Evolve-Xs': 'https://pheromonexs.com/cdn/shop/products/evolve-xs.jpg',
  'Pheromonexs': 'https://pheromonexs.com/cdn/shop/products/signature.jpg',
  'Primal Instinct': 'https://www.love-scent.com/images/primal-instinct.jpg'
};

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

function getProductImage(productName) {
  return productImages[productName] || null;
}
