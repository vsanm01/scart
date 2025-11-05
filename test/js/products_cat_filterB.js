/**
 * ProductFilterManager - A reusable module for filtering and categorizing products
 * Version: 1.2.0 - Added stock filtering and #ffd814 theme
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
 *   stockToggleSelector: '#stockToggle',
 *   onFilterChange: (filteredProducts) => {
 *     console.log('Filtered:', filteredProducts);
 *     renderProducts(filteredProducts);
 *   },
 *   categoryLabels: {
 *     all: 'All Products',
 *     bestsellers: 'Best Sellers'
 *   },
 *   accentColor: '#ffd814', // Action button color
 *   showOutOfStock: true // Default stock filter state
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
            stockToggleSelector: options.stockToggleSelector || '#stockToggle',
            onFilterChange: options.onFilterChange || null,
            onCategoryChange: options.onCategoryChange || null,
            onStockToggle: options.onStockToggle || null,
            categoryLabels: options.categoryLabels || { 
                all: 'All Products',
                bestsellers: 'Best Sellers'
            },
            activeClass: options.activeClass || 'active',
            categoryItemClass: options.categoryItemClass || 'category-item',
            accentColor: options.accentColor || '#ffd814', // NEW: Customizable accent color
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
            },
            bestSellersLimit: options.bestSellersLimit || 50,
            skipHeaderRow: options.skipHeaderRow !== undefined ? options.skipHeaderRow : true,
            headerKeywords: options.headerKeywords || ['category', 'price', 'name', 'title', 'product'],
            showOutOfStock: options.showOutOfStock !== undefined ? options.showOutOfStock : true // NEW
        };
        
        this.currentCategory = 'bestsellers'; // Default to Best Sellers
        this.filteredProducts = [];
        this.showOutOfStock = this.config.showOutOfStock; // NEW: Track stock filter state
        this.useJQuery = typeof jQuery !== 'undefined';
    }

    /**
     * Initialize the filter manager
     */
    init() {
        this.renderCategories();
        this.attachStockToggleListener(); // NEW
        this.applyAccentColorStyles(); // NEW
        this.applyFilters();
    }

    /**
     * Apply accent color to active elements
     */
    applyAccentColorStyles() {
        // Create a style element for dynamic accent color
        const styleId = 'pfm-accent-styles';
        let styleEl = document.getElementById(styleId);
        
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
        }

        styleEl.textContent = `
            .${this.config.categoryItemClass}.${this.config.activeClass} {
                background-color: ${this.config.accentColor} !important;
                border-color: ${this.config.accentColor} !important;
                color: #333 !important;
            }
            .${this.config.categoryItemClass}.${this.config.activeClass}:hover {
                opacity: 0.9;
            }
        `;
    }

    /**
     * Attach event listener to stock toggle
     */
    attachStockToggleListener() {
        const toggle = this._getElement(this.config.stockToggleSelector);
        if (!toggle) return;

        // Set initial state
        toggle.checked = this.showOutOfStock;

        this._onClick(toggle, () => {
            this.showOutOfStock = toggle.checked;
            
            if (this.config.onStockToggle) {
                this.config.onStockToggle(this.showOutOfStock);
            }
            
            this.applyFilters();
        });
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
     * Check if a product is a header row
     */
    isHeaderRow(product) {
        if (!this.config.skipHeaderRow) return false;
        
        // Check if category field contains header keywords
        const category = (product.category || '').toString().toLowerCase();
        const isHeader = this.config.headerKeywords.some(keyword => 
            category.includes(keyword)
        );
        
        // Also check if price is not a valid number
        const hasInvalidPrice = isNaN(parseFloat(product.price));
        
        return isHeader || hasInvalidPrice;
    }

    /**
     * Get valid products (excluding headers and C1)
     */
    getValidProducts() {
        return this.config.products.filter(p => 
            !this.isHeaderRow(p) && p.category !== 'C1'
        );
    }

    /**
     * Get all unique categories from products (excluding C1 and header rows)
     */
    getCategories() {
        const validProducts = this.getValidProducts();
        const categories = [...new Set(validProducts.map(p => p.category))];
        return ['all', 'bestsellers', ...categories];
    }

    /**
     * Render category buttons/filters with tick marks
     */
    renderCategories() {
        const container = this._getElement(this.config.categoryContainer);
        if (!container) return;

        this._empty(container);
        
        const categories = this.getCategories();
        
        categories.forEach(category => {
            const categoryItem = this._createElement('div');
            this._addClass(categoryItem, this.config.categoryItemClass);
            
            // Add tick mark if selected
            const tickMark = category === this.currentCategory ? '✓ ' : '';
            
            const label = category === 'all' 
                ? (this.config.categoryLabels.all || 'All Products')
                : category === 'bestsellers'
                ? (this.config.categoryLabels.bestsellers || 'Best Sellers')
                : category;
            
            this._setText(categoryItem, tickMark + label);
            
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
     * Update category UI to show active state with tick marks
     */
    updateCategoryUI() {
        const container = this._getElement(this.config.categoryContainer);
        if (!container) return;

        const items = this._getChildren(container, '.' + this.config.categoryItemClass);
        const categories = this.getCategories();
        
        items.forEach((item, index) => {
            const category = categories[index];
            
            // Add tick mark only for selected category
            const tickMark = category === this.currentCategory ? '✓ ' : '';
            
            const label = category === 'all' 
                ? (this.config.categoryLabels.all || 'All Products')
                : category === 'bestsellers'
                ? (this.config.categoryLabels.bestsellers || 'Best Sellers')
                : category;
            
            this._setText(item, tickMark + label);
            
            if (category === this.currentCategory) {
                this._addClass(item, this.config.activeClass);
            } else {
                this._removeClass(item, this.config.activeClass);
            }
        });
    }

    /**
     * Get Best Sellers - evenly distributed from each category (excluding C1 and headers)
     */
    getBestSellers() {
        const limit = this.config.bestSellersLimit;
        
        // Get all valid products
        const validProducts = this.getValidProducts();
        
        // Group by category
        const byCategory = {};
        validProducts.forEach(product => {
            if (!byCategory[product.category]) {
                byCategory[product.category] = [];
            }
            byCategory[product.category].push(product);
        });
        
        const categories = Object.keys(byCategory);
        const productsPerCategory = Math.floor(limit / categories.length);
        
        let bestSellers = [];
        
        // Take products from each category
        categories.forEach(category => {
            const categoryProducts = byCategory[category].slice(0, productsPerCategory);
            bestSellers = bestSellers.concat(categoryProducts);
        });
        
        // If we haven't reached the limit, fill with remaining products
        if (bestSellers.length < limit) {
            const remaining = limit - bestSellers.length;
            const usedIds = new Set(bestSellers.map(p => p.id || p.name));
            
            const additionalProducts = validProducts
                .filter(p => !usedIds.has(p.id || p.name))
                .slice(0, remaining);
            
            bestSellers = bestSellers.concat(additionalProducts);
        }
        
        return bestSellers.slice(0, limit);
    }

    /**
     * Apply all filters (category, price, sort, stock) - UPDATED
     */
    applyFilters() {
        const priceRange = this._getValue(this.config.priceFilterSelector);
        const sortBy = this._getValue(this.config.sortFilterSelector);
        const minPrice = parseFloat(this._getValue(this.config.minPriceSelector)) || 0;
        const maxPrice = parseFloat(this._getValue(this.config.maxPriceSelector)) || Infinity;
        
        let filtered;
        
        // Handle Best Sellers category
        if (this.currentCategory === 'bestsellers') {
            filtered = this.getBestSellers();
        } else {
            // Filter products
            filtered = this.config.products.filter(product => {
                // Skip header rows
                if (this.isHeaderRow(product)) return false;
                
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
        }

        // NEW: Apply stock filter
        if (!this.showOutOfStock) {
            filtered = filtered.filter(product => {
                // Check if product has inStock property and it's true
                return product.inStock === true || product.inStock === undefined;
            });
        }
        
        // Apply sorting (except for Best Sellers which has its own order)
        if (this.currentCategory !== 'bestsellers' && sortBy && this.config.sortOptions[sortBy]) {
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
     * Get current stock filter state
     */
    getStockFilterState() {
        return this.showOutOfStock;
    }

    /**
     * Set stock filter state programmatically
     */
    setStockFilterState(show) {
        this.showOutOfStock = show;
        const toggle = this._getElement(this.config.stockToggleSelector);
        if (toggle) {
            toggle.checked = show;
        }
        this.applyFilters();
    }

    /**
     * Reset all filters
     */
    resetFilters() {
        this.currentCategory = 'bestsellers'; // Reset to Best Sellers
        this.showOutOfStock = this.config.showOutOfStock; // Reset to default
        
        this._setValue(this.config.priceFilterSelector, 'all');
        this._setValue(this.config.sortFilterSelector, 'featured');
        this._setValue(this.config.minPriceSelector, '');
        this._setValue(this.config.maxPriceSelector, '');
        
        const toggle = this._getElement(this.config.stockToggleSelector);
        if (toggle) {
            toggle.checked = this.showOutOfStock;
        }
        
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

    /**
     * Set accent color dynamically
     */
    setAccentColor(color) {
        this.config.accentColor = color;
        this.applyAccentColorStyles();
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
        
        // Remove dynamic styles
        const styleEl = document.getElementById('pfm-accent-styles');
        if (styleEl) {
            styleEl.remove();
        }
        
        this.filteredProducts = [];
        this.currentCategory = 'bestsellers';
        this.showOutOfStock = this.config.showOutOfStock;
    }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProductFilterManager;
}

if (typeof window !== 'undefined') {
    window.ProductFilterManager = ProductFilterManager;
}