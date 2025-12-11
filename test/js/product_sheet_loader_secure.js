/**
 * ProductSheetLoader v2.0
 * Compatible with SecureSheets Client Library v1.3.0
 */

class ProductSheetLoader {
    constructor(options = {}) {
        this.sheetName = options.sheetName || 'Products';
        this.dataFetcher = options.dataFetcher || (typeof SecureSheets !== 'undefined' ? SecureSheets : null);
        this.useCache = options.useCache !== undefined ? options.useCache : true;
        this.verbose = options.verbose !== undefined ? options.verbose : true;
    }

    /**
     * Validate that SecureSheets is available and configured
     */
    validate() {
        if (!this.dataFetcher) {
            throw new Error('SecureSheets is not loaded. Please include securesheets_client_complete.js');
        }
        
        if (!this.dataFetcher.isConfigured()) {
            throw new Error('SecureSheets is not configured. Call SecureSheets.configure() first.');
        }
        
        return true;
    }

    /**
     * Fetch products from sheet
     */
    async fetch() {
        try {
            this.validate();
            
            if (this.verbose) {
                console.log(`[ProductSheetLoader] Fetching from ${this.sheetName}...`);
            }

            const response = await this.dataFetcher.getData(this.sheetName, {
                useCache: this.useCache
            });

            if (this.verbose) {
                console.log('[ProductSheetLoader] Response:', response);
            }

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
                console.warn('[ProductSheetLoader] No products found');
                return [];
            }

            if (this.verbose) {
                console.log(`[ProductSheetLoader] ✅ Loaded ${data.length} products`);
            }

            return data;

        } catch (error) {
            console.error('ProductSheetLoader Error:', error);
            throw error;
        }
    }

    /**
     * Fetch and parse products
     */
    async fetchAndParse(parser) {
        const data = await this.fetch();
        if (parser && typeof parser === 'function') {
            return data.map(parser);
        }
        return data;
    }

    /**
     * Test connection
     */
    async test() {
        try {
            this.validate();
            const result = await this.dataFetcher.testConnection();
            console.log('[ProductSheetLoader] Connection test:', result);
            return result;
        } catch (error) {
            console.error('[ProductSheetLoader] Connection test failed:', error);
            return { success: false, error: error.message };
        }
    }
}

// Export
if (typeof window !== 'undefined') {
    window.ProductSheetLoader = ProductSheetLoader;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProductSheetLoader;
}

console.log('ProductSheetLoader v2.0 loaded (SecureSheets compatible)');