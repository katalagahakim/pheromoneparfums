// Simplified scraper that actually works
// Direct Reddit scraping without complex filtering

export async function scrapeRedditSimple() {
  const reviews = [];

  try {
    // Scrape r/pheromones directly
    const url = 'https://www.reddit.com/r/pheromones/top.json?t=all&limit=50';
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'PheromoneParfumsBot/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Reddit returned ${response.status}`);
    }

    const data = await response.json();
    const posts = data.data.children;

    console.log(`Found ${posts.length} posts from Reddit`);

    for (const post of posts) {
      const p = post.data;

      // Only take posts with actual text content
      if (p.selftext && p.selftext.length > 200) {
        const text = p.selftext;
        const title = p.title;

        // Extract product name from title or text
        const productName = extractProductName(title + ' ' + text);

        reviews.push({
          title: title,
          text: text.substring(0, 2000), // Limit to 2000 chars
          author: p.author,
          date: new Date(p.created_utc * 1000).toISOString().split('T')[0],
          productName: productName,
          sourceUrl: `https://www.reddit.com${p.permalink}`,
          rating: null
        });
      }
    }

    console.log(`Extracted ${reviews.length} reviews`);
    return reviews;

  } catch (error) {
    console.error('Reddit scraping error:', error);
    return [];
  }
}

function extractProductName(text) {
  const lowerText = text.toLowerCase();

  // Common product names
  const products = [
    'alfa maschio',
    'bad wolf',
    'aqua vitae',
    'pherazone',
    'nexus pheromones',
    'pheromax',
    'evolve-xs',
    'pheromonexs',
    'true pheromones',
    'alpha-q',
    'cohesion',
    'nude alpha',
    'glace',
    'ascend',
    'love scent',
    'edge',
    'primal instinct',
    'raw chemistry',
    'chikara'
  ];

  for (const product of products) {
    if (lowerText.includes(product)) {
      return product.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  }

  return null;
}
