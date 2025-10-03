// Pheromone Review Search Engine
class PheromoneSearch {
  constructor() {
    this.index = [];
    this.filteredResults = [];
    this.init();
  }

  async init() {
    try {
      // Load search index
      const response = await fetch('/search-index.json');
      this.index = await response.json();
      console.log(`Loaded ${this.index.length} reviews`);

      this.setupEventListeners();
      this.populateFilters();

      // Check if we're on the search page
      if (document.getElementById('search-results')) {
        this.displayResults(this.index); // Show all initially
      }
    } catch (error) {
      console.error('Failed to load search index:', error);
    }
  }

  setupEventListeners() {
    const searchInput = document.getElementById('search-input');
    const filterBrand = document.getElementById('filter-brand');
    const filterType = document.getElementById('filter-type');
    const filterGender = document.getElementById('filter-gender');
    const filterMinRating = document.getElementById('filter-min-rating');
    const filterCompounds = document.getElementById('filter-compounds');
    const clearButton = document.getElementById('clear-filters');

    const performSearch = () => {
      const query = searchInput?.value || '';
      const filters = {
        brand: filterBrand?.value || '',
        type: filterType?.value || '',
        gender: filterGender?.value || '',
        minRating: parseFloat(filterMinRating?.value || 0),
        compounds: filterCompounds ? Array.from(filterCompounds.selectedOptions).map(o => o.value) : []
      };

      const results = this.search(query, filters);
      this.displayResults(results);
    };

    searchInput?.addEventListener('input', performSearch);
    filterBrand?.addEventListener('change', performSearch);
    filterType?.addEventListener('change', performSearch);
    filterGender?.addEventListener('change', performSearch);
    filterMinRating?.addEventListener('change', performSearch);
    filterCompounds?.addEventListener('change', performSearch);

    clearButton?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (filterBrand) filterBrand.value = '';
      if (filterType) filterType.value = '';
      if (filterGender) filterGender.value = '';
      if (filterMinRating) filterMinRating.value = '0';
      if (filterCompounds) filterCompounds.selectedIndex = -1;
      this.displayResults(this.index);
    });
  }

  populateFilters() {
    // Populate brand filter
    const brands = [...new Set(this.index.map(item => item.brand).filter(Boolean))].sort();
    const brandSelect = document.getElementById('filter-brand');
    if (brandSelect && brands.length > 0) {
      brands.forEach(brand => {
        const option = document.createElement('option');
        option.value = brand;
        option.textContent = brand;
        brandSelect.appendChild(option);
      });
    }
  }

  search(query, filters) {
    let results = this.index;

    // Text search
    if (query && query.length > 0) {
      const lowerQuery = query.toLowerCase();
      results = results.filter(item => {
        return (
          item.title?.toLowerCase().includes(lowerQuery) ||
          item.productName?.toLowerCase().includes(lowerQuery) ||
          item.brand?.toLowerCase().includes(lowerQuery) ||
          item.description?.toLowerCase().includes(lowerQuery) ||
          item.excerpt?.toLowerCase().includes(lowerQuery) ||
          (item.tags || []).some(tag => tag.toLowerCase().includes(lowerQuery))
        );
      });
    }

    // Apply filters
    if (filters.brand) {
      results = results.filter(item => item.brand === filters.brand);
    }

    if (filters.type) {
      results = results.filter(item => item.productType === filters.type);
    }

    if (filters.gender) {
      results = results.filter(item => item.gender === filters.gender);
    }

    if (filters.minRating > 0) {
      results = results.filter(item => item.rating >= filters.minRating);
    }

    if (filters.compounds && filters.compounds.length > 0) {
      results = results.filter(item => {
        const itemCompounds = item.compounds || [];
        return filters.compounds.some(compound =>
          itemCompounds.map(c => c.toLowerCase()).includes(compound.toLowerCase())
        );
      });
    }

    // Sort by rating (descending), then by review count
    results.sort((a, b) => {
      const ratingDiff = (b.rating || 0) - (a.rating || 0);
      if (ratingDiff !== 0) return ratingDiff;
      return (b.reviewCount || 0) - (a.reviewCount || 0);
    });

    return results;
  }

  displayResults(results) {
    const container = document.getElementById('search-results');
    const countContainer = document.getElementById('result-count');

    if (!container) return;

    // Update count
    if (countContainer) {
      countContainer.textContent = `${results.length} review${results.length !== 1 ? 's' : ''} found`;
    }

    if (results.length === 0) {
      container.innerHTML = '<div class="no-results"><p>No reviews found matching your criteria.</p><p>Try adjusting your filters or search terms.</p></div>';
      return;
    }

    container.innerHTML = results.map(result => `
      <article class="review-card">
        <h3><a href="${result.url}">${this.escapeHtml(result.title || result.productName)}</a></h3>
        <div class="review-meta">
          ${result.brand ? `<span class="brand"><strong>Brand:</strong> ${this.escapeHtml(result.brand)}</span>` : ''}
          ${result.productType ? `<span class="type"><strong>Type:</strong> ${this.escapeHtml(result.productType)}</span>` : ''}
          ${result.rating ? `<span class="rating">⭐ ${result.rating.toFixed(1)}/5</span>` : ''}
          ${result.reviewCount ? `<span class="review-count">${result.reviewCount} review${result.reviewCount !== 1 ? 's' : ''}</span>` : ''}
        </div>
        ${result.compounds && result.compounds.length > 0 ? `
          <div class="compounds">
            <strong>Pheromones:</strong> ${result.compounds.map(c => this.escapeHtml(c)).join(', ')}
          </div>
        ` : ''}
        ${result.description ? `<p class="excerpt">${this.escapeHtml(result.description)}</p>` : ''}
        <a href="${result.url}" class="read-more">Read Full Review →</a>
      </article>
    `).join('');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('search-container') || document.getElementById('search-results')) {
      new PheromoneSearch();
    }
  });
} else {
  if (document.getElementById('search-container') || document.getElementById('search-results')) {
    new PheromoneSearch();
  }
}
