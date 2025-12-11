/**
 * ProductRenderer v2.0
 * Compatible with SecureSheets Client Library v1.3.0
 */

class ProductRenderer {
    constructor(options = {}) {
        this.containerSelector = options.container || '.product-grid';
        this.sheetName = options.sheetName || 'Products';
        this.dataFetcher = options.dataFetcher || (typeof SecureSheets !== 'undefined' ? SecureSheets : null);
        this.useCache = options.useCache !== undefined ? options.useCache : true;
        this.template = options.template || 'default';
        this.verbose = options.verbose !== undefined ? options.verbose : true;
        
        this.products = [];
        this.container = null;
        this.initialized = false;
        
        // Callbacks
        this.onLoad = options.onLoad || null;
        this.onError = options.onError || null;
        this.onRender = options.onRender || null;
        
        // Filters
        this.filters = {
            category: null,
            minPrice: null,
            maxPrice: null,
            search: null
        };
    }

    /**
     * Validate setup
     */
    validate() {
        if (!this.dataFetcher) {
            throw new Error('❌ SecureSheets not loaded. Please include securesheets_client_complete.js');
        }
        
        if (!this.dataFetcher.isConfigured()) {
            throw new Error('❌ SecureSheets not configured. Call SecureSheets.configure() first');
        }
        
        return true;
    }

    /**
     * Initialize the renderer
     */
    init(containerSelector) {
        if (containerSelector) {
            this.containerSelector = containerSelector;
        }
        
        this.container = document.querySelector(this.containerSelector);
        
        if (!this.container) {
            throw new Error(`Container not found: ${this.containerSelector}`);
        }
        
        this.initialized = true;
        this.log('success', '✅ ProductRenderer initialized');
        return this;
    }

    /**
     * Load products from sheet
     */
    async loadProducts() {
        try {
            if (!this.initialized) {
                throw new Error('Container not initialized. Call init() first.');
            }
            
            this.validate();
            
            this.log('info', `📄 Loading products from ${this.sheetName}...`);
            
            const response = await this.dataFetcher.getData(this.sheetName, {
                useCache: this.useCache
            });

            this.log('info', '📊 Response received:', response);

            // Handle SecureSheets response format
            if (response.status === 'error' || response.error) {
                throw new Error(response.message || response.error || 'Failed to load products');
            }

            // Extract data from response
            let data;
            if (response.status === 'success' && response.data) {
                data = response.data;
            } else if (response.sheets && response.sheets[this.sheetName]) {
                data = response.sheets[this.sheetName];
            } else if (Array.isArray(response)) {
                data = response;
            } else {
                throw new Error('Unexpected response format from SecureSheets');
            }

            if (!data || data.length === 0) {
                this.log('warn', '⚠️ No products found');
                this.products = [];
                return this.products;
            }

            // Parse products
            this.products = this.parseProducts(data);
            
            this.log('success', `✅ Loaded ${this.products.length} products`);
            
            if (this.onLoad) {
                this.onLoad(this.products);
            }
            
            return this.products;

        } catch (error) {
            this.log('error', '❌ Error loading products:', error);
            if (this.onError) {
                this.onError(error);
            }
            throw error;
        }
    }

    /**
     * Parse products from sheet data
     * Expected columns: name, price, description, image, category, featured, inStock
     */
    parseProducts(data) {
        return data.map((row, index) => {
            return {
                id: row.id || row.productId || `product_${index}`,
                name: row.name || row.productName || 'Unnamed Product',
                price: parseFloat(row.price) || 0,
                description: row.description || '',
                image: row.image || row.imageUrl || 'https://via.placeholder.com/300x300',
                category: row.category || 'Uncategorized',
                featured: this.parseBoolean(row.featured),
                inStock: row.inStock !== undefined ? this.parseBoolean(row.inStock) : true,
                sku: row.sku || '',
                tags: row.tags ? row.tags.split(',').map(t => t.trim()) : []
            };
        });
    }

    /**
     * Parse boolean values
     */
    parseBoolean(value) {
        if (value === undefined || value === null) return false;
        if (typeof value === 'boolean') return value;
        const str = String(value).toLowerCase().trim();
        return str === 'true' || str === '1' || str === 'yes';
    }

    /**
     * Render products to container
     */
    render(products = null) {
        if (!this.initialized) {
            throw new Error('Container not initialized. Call init() first.');
        }
        
        const productsToRender = products || this.getFilteredProducts();
        
        this.log('info', `🎨 Rendering ${productsToRender.length} products...`);
        
        // Clear container
        this.container.innerHTML = '';
        
        if (productsToRender.length === 0) {
            this.container.innerHTML = '<p class="no-products">No products found</p>';
            return;
        }
        
        // Render each product
        productsToRender.forEach(product => {
            const productElement = this.createProductElement(product);
            this.container.appendChild(productElement);
        });
        
        this.log('success', '✅ Products rendered');
        
        if (this.onRender) {
            this.onRender(productsToRender);
        }
    }

    /**
     * Create product HTML element
     */
    createProductElement(product) {
        const div = document.createElement('div');
        div.className = 'product-item';
        div.setAttribute('data-product-id', product.id);
        div.setAttribute('data-category', product.category);
        
        if (!product.inStock) {
            div.classList.add('out-of-stock');
        }
        
        div.innerHTML = `
            <div class="product-image">
                <img src="${product.image}" alt="${product.name}" loading="lazy">
                ${product.featured ? '<span class="badge-featured">Featured</span>' : ''}
                ${!product.inStock ? '<span class="badge-out-of-stock">Out of Stock</span>' : ''}
            </div>
            <div class="product-info">
                <h3 class="product-name">${product.name}</h3>
                <p class="product-category">${product.category}</p>
                <p class="product-description">${product.description}</p>
                <div class="product-footer">
                    <span class="product-price">$${product.price.toFixed(2)}</span>
                    ${product.inStock ? 
                        '<button class="btn-add-to-cart">Add to Cart</button>' : 
                        '<button class="btn-notify" disabled>Notify Me</button>'
                    }
                </div>
            </div>
        `;
        
        // Add click handlers
        const addToCartBtn = div.querySelector('.btn-add-to-cart');
        if (addToCartBtn) {
            addToCartBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleAddToCart(product);
            });
        }
        
        return div;
    }

    /**
     * Handle add to cart
     */
    handleAddToCart(product) {
        this.log('info', '🛒 Add to cart:', product.name);
        // Dispatch custom event for cart handling
        window.dispatchEvent(new CustomEvent('product:addToCart', {
            detail: { product }
        }));
    }

    /**
     * Set filters
     */
    setFilter(filterName, value) {
        this.filters[filterName] = value;
        this.log('info', `🔍 Filter set: ${filterName} = ${value}`);
        return this;
    }

    /**
     * Clear all filters
     */
    clearFilters() {
        this.filters = {
            category: null,
            minPrice: null,
            maxPrice: null,
            search: null
        };
        this.log('info', '🔍 Filters cleared');
        return this;
    }

    /**
     * Get filtered products
     */
    getFilteredProducts() {
        let filtered = [...this.products];
        
        // Category filter
        if (this.filters.category) {
            filtered = filtered.filter(p => 
                p.category.toLowerCase() === this.filters.category.toLowerCase()
            );
        }
        
        // Price filters
        if (this.filters.minPrice !== null) {
            filtered = filtered.filter(p => p.price >= this.filters.minPrice);
        }
        if (this.filters.maxPrice !== null) {
            filtered = filtered.filter(p => p.price <= this.filters.maxPrice);
        }
        
        // Search filter
        if (this.filters.search) {
            const search = this.filters.search.toLowerCase();
            filtered = filtered.filter(p => 
                p.name.toLowerCase().includes(search) ||
                p.description.toLowerCase().includes(search) ||
                p.category.toLowerCase().includes(search)
            );
        }
        
        return filtered;
    }

    /**
     * Load and render in one call
     */
    async loadAndRender() {
        await this.loadProducts();
        this.render();
    }

    /**
     * Reload products
     */
    async reload() {
        // Clear cache for this sheet
        if (this.dataFetcher.clearCache) {
            this.dataFetcher.clearCache();
        }
        await this.loadAndRender();
    }

    /**
     * Get all products
     */
    getProducts() {
        return [...this.products];
    }

    /**
     * Get product by ID
     */
    getProductById(id) {
        return this.products.find(p => p.id === id);
    }

    /**
     * Get categories
     */
    getCategories() {
        return [...new Set(this.products.map(p => p.category))];
    }

    /**
     * Logging utility
     */
    log(level, ...args) {
        if (!this.verbose) return;

        const styles = {
            success: 'color: #10b981',
            error: 'color: #ef4444',
            warn: 'color: #f59e0b',
            info: 'color: #3b82f6'
        };

        if (typeof args[0] === 'string' && args[0].match(/[✅❌⚠️📊📄🚀🎨🛒🔍]/)) {
            console.log(...args);
        } else {
            console.log(`%c[ProductRenderer]`, `${styles[level] || ''}; font-weight: bold`, ...args);
        }
    }
}

// Export
if (typeof window !== 'undefined') {
    window.ProductRenderer = ProductRenderer;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProductRenderer;
}

// Add default CSS
if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.textContent = `
        .product-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 2rem;
            padding: 1rem;
        }
        
        .product-item {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            overflow: hidden;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .product-item:hover {
            transform: translateY(-4px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        
        .product-item.out-of-stock {
            opacity: 0.6;
        }
        
        .product-image {
            position: relative;
            width: 100%;
            padding-top: 100%;
            overflow: hidden;
            background: #f3f4f6;
        }
        
        .product-image img {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .badge-featured,
        .badge-out-of-stock {
            position: absolute;
            top: 10px;
            right: 10px;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
        }
        
        .badge-featured {
            background: #fbbf24;
            color: #000;
        }
        
        .badge-out-of-stock {
            background: #ef4444;
            color: #fff;
        }
        
        .product-info {
            padding: 1rem;
        }
        
        .product-name {
            font-size: 18px;
            font-weight: 600;
            margin: 0 0 0.5rem 0;
        }
        
        .product-category {
            font-size: 14px;
            color: #6b7280;
            margin: 0 0 0.5rem 0;
        }
        
        .product-description {
            font-size: 14px;
            color: #4b5563;
            margin: 0 0 1rem 0;
            line-height: 1.5;
        }
        
        .product-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .product-price {
            font-size: 20px;
            font-weight: 700;
            color: #1f2937;
        }
        
        .btn-add-to-cart,
        .btn-notify {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        
        .btn-add-to-cart {
            background: #3b82f6;
            color: white;
        }
        
        .btn-add-to-cart:hover {
            background: #2563eb;
        }
        
        .btn-notify {
            background: #e5e7eb;
            color: #6b7280;
            cursor: not-allowed;
        }
        
        .no-products {
            text-align: center;
            padding: 3rem;
            color: #6b7280;
            font-size: 18px;
        }
    `;
    document.head.appendChild(style);
}

console.log('ProductRenderer v2.0 loaded (SecureSheets compatible)');