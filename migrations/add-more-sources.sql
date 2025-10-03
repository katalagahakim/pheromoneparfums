-- Add many more review sources for comprehensive coverage

-- Major Pheromone Forums & Communities
INSERT OR IGNORE INTO source_sites (name, domain, site_type, crawl_frequency, reputation_score, selector_config) VALUES
('Pheromone Talk Forum', 'pheromonetalk.com', 'forum', 3, 95, '{"review": ".post-content", "title": ".post-title", "text": ".post-body", "author": ".post-author", "date": "time"}'),
('Love Scent Community', 'community.love-scent.com', 'forum', 3, 90, '{"review": ".message-body", "text": ".message-content", "author": ".author-name", "date": ".date"}'),
('Pheromone XS Forum', 'forum.pheromonexs.com', 'forum', 7, 85, '{"review": ".post", "text": ".content", "author": ".username", "date": ".postdate"}'),
('Liquid Alchemy Labs Forum', 'liquidalchemylabs.com/forum', 'forum', 7, 88, '{"review": ".post-content", "text": ".post-body", "author": ".author", "date": ".date"}'),

-- Reddit Communities
('Reddit Pheromones', 'reddit.com', 'reddit', 1, 92, '{"subreddits": ["pheromones", "fragrance", "attraction", "seduction", "askmen", "askwomen"]}'),

-- YouTube Reviews (via comments/descriptions)
('YouTube Pheromone Reviews', 'youtube.com', 'youtube', 7, 80, '{"search": "pheromone review", "channels": ["pheromone reviews", "attraction science"]}'),

-- Major E-commerce Review Sections
('Amazon Pheromone Reviews', 'amazon.com', 'ecommerce', 7, 75, '{"review": "[data-hook=review]", "text": "[data-hook=review-body]", "author": ".a-profile-name", "rating": ".review-rating", "date": "[data-hook=review-date]"}'),
('eBay Pheromone Feedback', 'ebay.com', 'ecommerce', 14, 70, '{"review": ".reviews", "text": ".review-item-content", "author": ".review-item-author", "date": ".review-item-date"}'),

-- Specialized Review Sites
('Pheromone Reviews Blog', 'pheromonereviewsblog.com', 'blog', 7, 88, '{"review": "article", "title": ".entry-title", "text": ".entry-content", "author": ".author", "date": ".published"}'),
('Attraction Institute Reviews', 'attractioninstitute.org/reviews', 'blog', 14, 82, '{"review": ".review-post", "text": ".review-content", "author": ".author-name", "date": ".post-date"}'),
('Pheromone Guide', 'pheromoneguide.com', 'blog', 7, 86, '{"review": ".guide-review", "text": ".review-text", "author": ".reviewer", "date": ".review-date"}'),

-- Social Media & Alternative Platforms
('Twitter Pheromone Discussions', 'twitter.com', 'social', 3, 65, '{"search": "pheromone review", "hashtags": ["#pheromones", "#pheromonereviews"]}'),
('Quora Pheromone Questions', 'quora.com', 'qa', 7, 78, '{"topic": "Pheromones", "search": "pheromone product review"}'),
('Discord Pheromone Communities', 'discord.com', 'community', 7, 72, '{"servers": ["pheromone enthusiasts", "attraction science"]}'),

-- International Forums
('UK Pheromone Forum', 'ukpheromones.co.uk', 'forum', 7, 80, '{"review": ".post", "text": ".post-body", "author": ".author", "date": ".date"}'),
('European Pheromone Community', 'pheromone.eu', 'forum', 14, 75, '{"review": ".message", "text": ".content", "author": ".user", "date": ".timestamp"}'),
('Australian Pheromone Reviews', 'pheromones.com.au', 'forum', 14, 73, '{"review": ".review", "text": ".review-text", "author": ".reviewer", "date": ".date"}'),

-- Niche Communities
('Bodybuilding Forum - Pheromones', 'bodybuilding.com/fun/pheromones', 'forum', 14, 68, '{"review": ".post", "text": ".content", "author": ".username"}'),
('Pickup Artist Forums', 'pickupartistforum.com', 'forum', 14, 65, '{"review": ".post", "text": ".message", "author": ".author"}'),
('Dating Advice Forums', 'datingadvice.com/forum', 'forum', 14, 70, '{"review": ".post", "text": ".post-content", "author": ".username"}'),

-- Scientific & Research Communities
('Research Gate - Pheromones', 'researchgate.net', 'academic', 30, 95, '{"search": "human pheromones", "type": "discussions"}'),
('Science Forums', 'scienceforums.net', 'forum', 14, 85, '{"search": "pheromone", "section": "biology"}'),

-- Product-Specific Forums
('Alpha Dream Forum', 'alphadream.com/forum', 'forum', 7, 87, '{"review": ".post", "text": ".content", "author": ".author", "date": ".date"}'),
('Androtics Forum', 'androtics.com/forum', 'forum', 7, 84, '{"review": ".post", "text": ".message", "author": ".username"}'),
('True Pheromones Community', 'truepheromones.com/community', 'forum', 7, 81, '{"review": ".post", "text": ".body", "author": ".author"}');

-- Update crawl frequency for existing high-value sources
UPDATE source_sites SET crawl_frequency = 1 WHERE name = 'Reddit Pheromones';
UPDATE source_sites SET crawl_frequency = 2 WHERE reputation_score >= 90;
UPDATE source_sites SET crawl_frequency = 5 WHERE reputation_score >= 80 AND reputation_score < 90;
