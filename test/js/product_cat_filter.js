/**
 * ProductFilterManager - A reusable module for filtering and categorizing products
 * Version: 1.0.0
 * 
 * Dependencies:
 * - jQuery (optional, will use vanilla JS if not available)
 * 
 * Usage:
 * const filterManager = new ProductFilterManager({
 *   products: myProducts,
 *   categoryContainer: '#categoryList',
 *   priceFilterSelector: '#priceFilter',
 *   sortFilterSelector: '#sortFilter',
 *   minPriceSelector: '#minPrice',
 *   maxPriceSelector: '#maxPrice',
 *   onFilterChange: (filteredProducts) => {
 *     console.log('Filtered:', filteredProducts);
 *     renderProducts(filteredProducts);
 *   },
 *   categoryLabels: {
 *     all: 'All Products'
 *   }
 * });
 * 
 * filterManager.init();
 */

class ProductFilterManager {
    constructor(options = {}) {
        this.config = {
            products: options.products || [],
            categoryContainer: options.categoryContainer || '#categoryList',
            priceFilterSelector: options.priceFilterSelector || '#priceFilter',
            sortFilterSelector: options.sortFilterSelector || '#sortFilter',
            minPriceSelector: options.minPriceSelector || '#minPrice',
            maxPriceSelector: options.maxPriceSelector || '#maxPrice',
            onFilterChange: options.onFilterChange || null,
            onCategoryChange: options.onCategoryChange || null,
            categoryLabels: options.categoryLabels || { all: 'All Products' },
            activeClass: options.activeClass || 'active',
            categoryItemClass: options.categoryItemClass || 'category-item',
            priceRanges: options.priceRanges || [
                { value: '0-50', min: 0, max: 50, label: 'Under $50' },
                { value: '50-100', min: 50, max: 100, label: '$50 - $100' },
                { value: '100-200', min: 100, max: 200, label: '$100 - $200' },
                { value: '200+', min: 200, max: Infinity, label: '$200+' }
            ],
            sortOptions: options.sortOptions || {
                'featured': (a, b) => 0,
                'price-low': (a, b) => a.price - b.price,
                'price-high': (a, b) => b.price - a.price,
                'rating': (a, b) => b.rating - a.rating,
                'newest': null // Will reverse the array
            }
        };
        
        this.currentCategory = 'all';
        this.filteredProducts = [];
        this.useJQuery = typeof jQuery !== 'undefined';
    }

    /**
     * Initialize the filter manager
     */
    init() {
        this.renderCategories();
        this.applyFilters();
    }

    /**
     * Update products array
     */
    setProducts(products) {
        this.config.products = products;
        this.renderCategories();
        this.applyFilters();
    }

    /**
     * Get all unique categories from products (excluding C1)
     */
    getCategories() {
        const categories = [...new Set(this.config.products.map(p => p.category))];
        // Filter out C1
        const filtered = categories.filter(cat => cat !== 'C1');
        return ['all', ...filtered];
    }

    /**
     * Render category buttons/filters
     */
    renderCategories() {
        const container = this._getElement(this.config.categoryContainer);
        if (!container) return;

        this._empty(container);
        
        const categories = this.getCategories();
        
        categories.forEach(category => {
            const categoryItem = this._createElement('div');
            this._addClass(categoryItem, this.config.categoryItemClass);
            
            const label = category === 'all' 
                ? (this.config.categoryLabels.all || 'All Products')
                : category;
            
            this._setText(categoryItem, label);
            
            if (category === this.currentCategory) {
                this._addClass(categoryItem, this.config.activeClass);
            }
            
            this._onClick(categoryItem, () => {
                this.filterByCategory(category);
            });
            
            this._append(container, categoryItem);
        });
    }

    /**
     * Filter products by category
     */
    filterByCategory(category) {
        this.currentCategory = category;
        this.updateCategoryUI();
        this.applyFilters();
        
        if (this.config.onCategoryChange) {
            this.config.onCategoryChange(category, this.filteredProducts);
        }
    }

    /**
     * Update category UI to show active state
     */
    updateCategoryUI() {
        const container = this._getElement(this.config.categoryContainer);
        if (!container) return;

        const items = this._getChildren(container, '.' + this.config.categoryItemClass);
        
        items.forEach(item => {
            const text = this._getText(item);
            const categoryLabel = this.currentCategory === 'all' 
                ? (this.config.categoryLabels.all || 'All Products')
                : this.currentCategory;
            
            if (text === categoryLabel) {
                this._addClass(item, this.config.activeClass);
            } else {
                this._removeClass(item, this.config.activeClass);
            }
        });
    }

    /**
     * Apply all filters (category, price, sort) - UPDATED to skip C1
     */
    applyFilters() {
        const priceRange = this._getValue(this.config.priceFilterSelector);
        const sortBy = this._getValue(this.config.sortFilterSelector);
        const minPrice = parseFloat(this._getValue(this.config.minPriceSelector)) || 0;
        const maxPrice = parseFloat(this._getValue(this.config.maxPriceSelector)) || Infinity;
        
        // Filter products
        let filtered = this.config.products.filter(product => {
            // Skip C1 category products
            if (product.category === 'C1') return false;
            
            // Category filter
            const categoryMatch = this.currentCategory === 'all' || 
                                 product.category === this.currentCategory;
            
            // Custom price range filter
            const priceMatch = product.price >= minPrice && product.price <= maxPrice;
            
            // Preset price range filter
            let rangeMatch = true;
            if (priceRange && priceRange !== 'all') {
                const range = this.config.priceRanges.find(r => r.value === priceRange);
                if (range) {
                    rangeMatch = product.price >= range.min && product.price < range.max;
                }
            }
            
            return categoryMatch && priceMatch && rangeMatch;
        });
        
        // Apply sorting
        if (sortBy && this.config.sortOptions[sortBy]) {
            const sortFn = this.config.sortOptions[sortBy];
            if (sortFn === null && sortBy === 'newest') {
                filtered = filtered.reverse();
            } else if (sortFn) {
                filtered.sort(sortFn);
            }
        }
        
        this.filteredProducts = filtered;
        
        // Trigger callback
        if (this.config.onFilterChange) {
            this.config.onFilterChange(this.filteredProducts);
        }
        
        return this.filteredProducts;
    }

    /**
     * Get current filtered products
     */
    getFilteredProducts() {
        return this.filteredProducts;
    }

    /**
     * Get current category
     */
    getCurrentCategory() {
        return this.currentCategory;
    }

    /**
     * Reset all filters
     */
    resetFilters() {
        this.currentCategory = 'all';
        
        this._setValue(this.config.priceFilterSelector, 'all');
        this._setValue(this.config.sortFilterSelector, 'featured');
        this._setValue(this.config.minPriceSelector, '');
        this._setValue(this.config.maxPriceSelector, '');
        
        this.updateCategoryUI();
        this.applyFilters();
    }

    /**
     * Add custom sort option
     */
    addSortOption(key, sortFunction) {
        this.config.sortOptions[key] = sortFunction;
    }

    /**
     * Add custom price range
     */
    addPriceRange(range) {
        this.config.priceRanges.push(range);
    }

    // ============================================
    // DOM HELPER METHODS (jQuery/Vanilla JS)
    // ============================================

    _getElement(selector) {
        if (this.useJQuery) {
            const el = $(selector);
            return el.length > 0 ? el[0] : null;
        }
        return document.querySelector(selector);
    }

    _createElement(tag) {
        return document.createElement(tag);
    }

    _addClass(element, className) {
        if (this.useJQuery) {
            $(element).addClass(className);
        } else {
            element.classList.add(className);
        }
    }

    _removeClass(element, className) {
        if (this.useJQuery) {
            $(element).removeClass(className);
        } else {
            element.classList.remove(className);
        }
    }

    _setText(element, text) {
        if (this.useJQuery) {
            $(element).text(text);
        } else {
            element.textContent = text;
        }
    }

    _getText(element) {
        if (this.useJQuery) {
            return $(element).text();
        }
        return element.textContent;
    }

    _onClick(element, handler) {
        if (this.useJQuery) {
            $(element).on('click', handler);
        } else {
            element.addEventListener('click', handler);
        }
    }

    _append(parent, child) {
        if (this.useJQuery) {
            $(parent).append(child);
        } else {
            parent.appendChild(child);
        }
    }

    _empty(element) {
        if (this.useJQuery) {
            $(element).empty();
        } else {
            element.innerHTML = '';
        }
    }

    _getValue(selector) {
        const element = this._getElement(selector);
        if (!element) return null;
        return element.value;
    }

    _setValue(selector, value) {
        const element = this._getElement(selector);
        if (element) {
            element.value = value;
        }
    }

    _getChildren(parent, selector) {
        if (this.useJQuery) {
            return $(parent).find(selector).toArray();
        }
        return Array.from(parent.querySelectorAll(selector));
    }

    /**
     * Destroy and cleanup
     */
    destroy() {
        const container = this._getElement(this.config.categoryContainer);
        if (container) {
            this._empty(container);
        }
        this.filteredProducts = [];
        this.currentCategory = 'all';
    }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProductFilterManager;
}

if (typeof window !== 'undefined') {
    window.ProductFilterManager = ProductFilterManager;
}