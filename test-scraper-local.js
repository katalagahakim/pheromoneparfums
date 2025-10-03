// Local test script to demonstrate scraping functionality
// This simulates what will happen when deployed to Cloudflare

const fetch = require('node-fetch');

console.log('🧪 Testing Pheromone Review Scraper\n');
console.log('================================================\n');

// Test 1: Scrape Reddit (this actually works without Cloudflare)
async function testRedditScraping() {
  console.log('📱 Test 1: Scraping Reddit r/pheromones...\n');

  try {
    const response = await fetch('https://www.reddit.com/r/pheromones/top.json?t=week&limit=10', {
      headers: {
        'User-Agent': 'PheromoneParfumsBot/1.0'
      }
    });

    if (!response.ok) {
      console.log('❌ Reddit API returned:', response.status);
      return;
    }

    const data = await response.json();
    const posts = data.data.children;

    console.log(`✅ Found ${posts.length} posts from r/pheromones\n`);

    let reviewCount = 0;
    posts.forEach((post, i) => {
      const p = post.data;
      const isReview = (p.title + ' ' + p.selftext).toLowerCase().includes('review') ||
                      (p.title + ' ' + p.selftext).toLowerCase().includes('experience');

      if (isReview && p.selftext && p.selftext.length > 100) {
        reviewCount++;
        console.log(`📝 Review ${reviewCount}:`);
        console.log(`   Title: ${p.title}`);
        console.log(`   Author: ${p.author}`);
        console.log(`   Length: ${p.selftext.length} chars`);
        console.log(`   URL: https://reddit.com${p.permalink}`);
        console.log(`   Preview: ${p.selftext.substring(0, 100)}...\n`);
      }
    });

    console.log(`✅ Found ${reviewCount} potential pheromone reviews on Reddit!\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Test 2: Show what would be scraped from other sources
function showPlannedSources() {
  console.log('\n================================================');
  console.log('📊 Configured Review Sources (30+):\n');

  const sources = [
    { name: 'Reddit r/pheromones', estimate: '20-50 reviews/day' },
    { name: 'PheroTruth Forum', estimate: '10-30 reviews/day' },
    { name: 'Love Scent Community', estimate: '5-15 reviews/day' },
    { name: 'PheromoneXS Forum', estimate: '5-10 reviews/day' },
    { name: 'Liquid Alchemy Labs Forum', estimate: '5-10 reviews/day' },
    { name: 'Amazon Product Reviews', estimate: '20-40 reviews/day' },
    { name: 'YouTube Comments', estimate: '10-20 reviews/day' },
    { name: 'Various Pheromone Blogs', estimate: '5-15 reviews/day' },
    { name: 'Other Forums & Communities', estimate: '20-40 reviews/day' }
  ];

  sources.forEach((source, i) => {
    console.log(`${i + 1}. ${source.name}`);
    console.log(`   Estimated: ${source.estimate}\n`);
  });

  console.log('📈 Total Expected: 100-230 reviews per day');
  console.log('📅 After 30 days: ~3,000-7,000 reviews');
  console.log('📅 After 1 year: ~36,500-84,000 reviews\n');
}

// Test 3: Show example of what gets saved
function showExampleOutput() {
  console.log('================================================');
  console.log('📄 Example: What Gets Generated\n');

  console.log('When a review is found, the system:');
  console.log('1. ✅ Extracts review text, author, rating, date');
  console.log('2. ✅ Identifies the product name (e.g., "Alfa Maschio")');
  console.log('3. ✅ Checks for duplicates (by content hash)');
  console.log('4. ✅ Analyzes sentiment (pros/cons using AI)');
  console.log('5. ✅ Saves to database');
  console.log('6. ✅ Groups all reviews for the same product');
  console.log('7. ✅ Generates markdown file with ALL reviews');
  console.log('8. ✅ Commits to GitHub');
  console.log('9. ✅ Cloudflare Pages rebuilds site automatically');
  console.log('10. ✅ New reviews appear on your site!\n');
}

// Run tests
async function main() {
  await testRedditScraping();
  showPlannedSources();
  showExampleOutput();

  console.log('================================================');
  console.log('🚀 TO SEE REAL SCRAPING:\n');
  console.log('1. Deploy to Cloudflare (follow SETUP.md)');
  console.log('2. Run migrations to create database');
  console.log('3. Trigger scrape: curl -X POST https://your-worker.workers.dev/scrape');
  console.log('4. Wait 2-5 minutes');
  console.log('5. Check your GitHub repo for new markdown files');
  console.log('6. Your site rebuilds automatically with new reviews!\n');
  console.log('================================================\n');
}

main();
