// Test Reddit scraping locally

async function testRedditScrape() {
  try {
    console.log('Testing Reddit API...');

    const url = 'https://www.reddit.com/r/pheromones/top.json?t=all&limit=50';
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'PheromoneParfumsBot/1.0'
      }
    });

    console.log(`Response status: ${response.status}`);

    if (!response.ok) {
      console.error('Reddit API error!');
      return;
    }

    const data = await response.json();
    const posts = data.data.children;

    console.log(`Found ${posts.length} posts`);

    let reviewCount = 0;
    for (const post of posts) {
      const p = post.data;

      if (p.selftext && p.selftext.length > 200) {
        console.log(`\n--- Post ${reviewCount + 1} ---`);
        console.log(`Title: ${p.title}`);
        console.log(`Text length: ${p.selftext.length} chars`);
        console.log(`Author: ${p.author}`);
        console.log(`Preview: ${p.selftext.substring(0, 100)}...`);

        reviewCount++;
      }
    }

    console.log(`\n✅ Found ${reviewCount} posts with substantial text`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testRedditScrape();
