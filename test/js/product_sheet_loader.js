/**
 * ProductSheetLoader - A reusable module for loading and normalizing product data from Google Sheets
 * Version: 1.0.0
 * 
 * Dependencies:
 * - GSRCDN (Google Sheets Reader CDN)
 * - GDriveImageHandler (optional, for image URL conversion)
 * 
 * Usage:
 * const loader = new ProductSheetLoader({
 *   sheetName: 'products',
 *   onSuccess: (products) => console.log('Loaded:', products),
 *   onError: (error) => console.error('Error:', error),
 *   imageSize: 400,
 *   defaultImage: 'https://via.placeholder.com/300x300?text=No+Image'
 * });
 * 
 * const products = await loader.fetch();
 */

class ProductSheetLoader {
    constructor(options = {}) {
        this.config = {
            sheetName: options.sheetName || 'products',
            onSuccess: options.onSuccess || null,
            onError: options.onError || null,
            imageSize: options.imageSize || 400,
            defaultImage: options.defaultImage || 'https://via.placeholder.com/300x300?text=No+Image',
            useImageHandler: options.useImageHandler !== false,
            priceMarkupMultiplier: options.priceMarkupMultiplier || 1.3
        };
        
        this.products = [];
    }

    /**
     * Fetch products from Google Sheet
     * @returns {Promise<Array>} Array of normalized product objects
     */
    async fetch() {
        try {
            if (typeof GSRCDN === 'undefined') {
                throw new Error('GSRCDN is not loaded. Please include the Google Sheets Reader CDN.');
            }

            const data = await GSRCDN.getData(this.config.sheetName);
            
            let rawProducts = [];
            if (data.data && Array.isArray(data.data)) {
                rawProducts = data.data;
            } else if (Array.isArray(data)) {
                rawProducts = data;
            }
            
            this.products = rawProducts.map((item, index) => 
                this._normalizeProduct(item, index)
            );
            
            if (this.config.onSuccess && this.products.length > 0) {
                this.config.onSuccess(this.products);
            }
            
            return this.products;
            
        } catch (error) {
            console.error('ProductSheetLoader Error:', error);
            
            if (this.config.onError) {
                this.config.onError(error);
            }
            
            this.products = [];
            return this.products;
        }
    }

    /**
     * Normalize a product item from array or object format
     * @private
     */
    _normalizeProduct(item, index) {
        let product;
        
        if (Array.isArray(item)) {
            product = this._normalizeFromArray(item, index);
        } else {
            product = this._normalizeFromObject(item, index);
        }
        
        return this._postProcessProduct(product);
    }

    /**
     * Normalize product from array format
     * @private
     */
    _normalizeFromArray(item, index) {
        return {
            id: item[0] || 'PROD' + (index + 1),
            title: item[1] || 'Unnamed Product',
            category: item[2] || 'General',
            price: parseFloat(item[3]) || 0,
            originalPrice: parseFloat(item[4]) || 0,
            image: item[5] || '',
            rating: parseFloat(item[6]) || 4.5,
            reviews: parseInt(item[7]) || 0,
            badge: item[8] || 'Sale',
            featured: item[9] === 'TRUE' || item[9] === true,
            description: item[10] || '',
            stock: parseInt(item[11]) || 10,
            createdAt: item[12] || ''
        };
    }

    /**
     * Normalize product from object format (handles various field naming conventions)
     * @private
     */
    _normalizeFromObject(item, index) {
        return {
            id: item.id || item.Id || item.ID || 'PROD' + (index + 1),
            title: item.title || item.Title || item.name || item.Name || 'Unnamed Product',
            category: item.category || item.Category || 'General',
            price: parseFloat(item.price || item.Price) || 0,
            originalPrice: parseFloat(item.originalPrice || item.OriginalPrice || item.original_price || item.price) || 0,
            image: item.image || item.Image || item.imageUrl || item.ImageUrl || '',
            rating: parseFloat(item.rating || item.Rating) || 4.5,
            reviews: parseInt(item.reviews || item.Reviews || item.reviewCount) || 0,
            badge: item.badge || item.Badge || item.label || 'Sale',
            featured: item.featured === 'TRUE' || item.featured === true || item.Featured === 'TRUE',
            description: item.description || item.Description || item.desc || '',
            stock: parseInt(item.stock || item.Stock || item.inventory) || 10,
            createdAt: item.createdAt || item.CreatedAt || item.created_at || ''
        };
    }

    /**
     * Post-process product (image handling, price validation)
     * @private
     */
    _postProcessProduct(product) {
        // Handle image URL conversion
        if (this.config.useImageHandler && typeof GDriveImageHandler !== 'undefined') {
            product.image = GDriveImageHandler.convert(product.image, this.config.imageSize) || this.config.defaultImage;
        } else if (!product.image) {
            product.image = this.config.defaultImage;
        }
        
        // Ensure originalPrice is higher than price
        if (product.originalPrice <= product.price) {
            product.originalPrice = product.price * this.config.priceMarkupMultiplier;
        }
        
        return product;
    }

    /**
     * Get all products
     * @returns {Array} Array of products
     */
    getProducts() {
        return this.products;
    }

    /**
     * Get product by ID
     * @param {string} id - Product ID
     * @returns {Object|null} Product object or null
     */
    getProductById(id) {
        return this.products.find(p => p.id === id) || null;
    }

    /**
     * Filter products by category
     * @param {string} category - Category name
     * @returns {Array} Filtered products
     */
    getProductsByCategory(category) {
        return this.products.filter(p => p.category === category);
    }

    /**
     * Get featured products
     * @returns {Array} Featured products
     */
    getFeaturedProducts() {
        return this.products.filter(p => p.featured);
    }

    /**
     * Get all unique categories
     * @returns {Array} Array of category names
     */
    getCategories() {
        return [...new Set(this.products.map(p => p.category))];
    }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProductSheetLoader;
}

if (typeof window !== 'undefined') {
    window.ProductSheetLoader = ProductSheetLoader;
}