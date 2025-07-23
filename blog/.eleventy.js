const { DateTime } = require("luxon");
const markdownItAnchor = require("markdown-it-anchor");

const pluginRss = require("@11ty/eleventy-plugin-rss");
const pluginSyntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const pluginNavigation = require("@11ty/eleventy-navigation");

module.exports = function(eleventyConfig) {
  // Add plugins
  eleventyConfig.addPlugin(pluginRss);
  eleventyConfig.addPlugin(pluginSyntaxHighlight);
  eleventyConfig.addPlugin(pluginNavigation);

  // Copy the `img` and `css` folders to the output
  eleventyConfig.addPassthroughCopy("blog/img");
  eleventyConfig.addPassthroughCopy("blog/css");

  // Add filters
  eleventyConfig.addFilter("readableDate", dateObj => {
    return DateTime.fromJSDate(dateObj, {zone: 'utc'}).toFormat("dd LLL yyyy");
  });

  // https://html.spec.whatwg.org/multipage/common-microsyntaxes.html#valid-date-string
  eleventyConfig.addFilter('htmlDateString', (dateObj) => {
    return DateTime.fromJSDate(dateObj, {zone: 'utc'}).toFormat('yyyy-LL-dd');
  });

  // Get the first `n` elements of a collection.
  eleventyConfig.addFilter("head", (array, n) => {
    if(!Array.isArray(array) || array.length === 0) {
      return [];
    }
    if( n < 0 ) {
      return array.slice(n);
    }

    return array.slice(0, n);
  });

  // Return the smallest number argument
  eleventyConfig.addFilter("min", (...numbers) => {
    return Math.min.apply(null, numbers);
  });

  // Return all tags from a collection
  eleventyConfig.addFilter("getAllTags", collection => {
    let tagSet = new Set();
    for(let item of collection) {
      (item.data.tags || []).forEach(tag => tagSet.add(tag));
    }
    return Array.from(tagSet).sort();
  });

  // Filter out specific tags
  eleventyConfig.addFilter("filterTagList", tags => {
    return (tags || []).filter(tag => ["all", "nav", "post", "posts"].indexOf(tag) === -1);
  });

  // Shortcode for the current year
  eleventyConfig.addShortcode("currentYear", () => {
    return new Date().getFullYear().toString();
  });

  // Create excerpt from post content
  eleventyConfig.addFilter("excerpt", (post) => {
    const content = post.replace(/^\s*[\r\n]/gm, "").replace(/\<[^\>]*\>/g, "");
    return content.substr(0, content.lastIndexOf(" ", 200)) + "...";
  });

  // Configure markdown library and settings
  let markdownLibrary = require("markdown-it")({html: true, breaks: true, linkify: true}).use(markdownItAnchor);
  eleventyConfig.setLibrary("md", markdownLibrary);

  // Override Browsersync defaults (used only with --serve)
  eleventyConfig.setBrowserSyncConfig({
    callbacks: {
      ready: function(err, browserSync) {
        const content_404 = require('fs').readFileSync('_site/404.html');

        browserSync.addMiddleware("*", (req, res) => {
          // Provides the 404 content without redirect.
          res.write(content_404);
          res.end();
        });
      },
    },
    ui: false,
    ghostMode: false
  });

  return {
    // Control which files Eleventy will process
    templateFormats: [
      "md",
      "njk",
      "html",
      "liquid"
    ],

    // Pre-process *.md files with: (default: `liquid`)
    markdownTemplateEngine: "njk",

    // Pre-process *.html files with: (default: `liquid`)
    htmlTemplateEngine: "njk",

    // -----------------------------------------------------------------
    // If your site deploys to a subdirectory, change `pathPrefix`.
    // Don't worry about leading and trailing slashes, we normalize these.

    // If you don't have a subdirectory, use "" or "/" (they do the same thing)
    // This is only used for link URLs (it does not affect your file structure)
    // Best paired with the `url` filter: https://www.11ty.dev/docs/filters/url/

    // You can also pass this in on the command line using `--pathprefix`
    // pathPrefix: "/",
    // -----------------------------------------------------------------

    // Directory structure
    dir: {
      input: "blog",
      includes: "_includes",
      data: "_data",
      output: "dist"
    }
  };
};
