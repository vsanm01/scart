/**
 * SecureSheets Config Loader v2.1 Enhanced
 * Universal Configuration Loader for SecureSheets Client
 * Compatible with SecureSheets Client Library v1.2.1 Enhanced
 * 
 * NEW IN v2.1:
 * ✅ Support for cell-specific queries (getCellData)
 * ✅ Support for range queries (getRangeData)
 * ✅ Batch cell loading for better performance
 * ✅ Zero-secrets pattern support
 * ✅ POST request support with CSRF
 * ✅ Enhanced error handling
 * 
 * Usage Example 1: Traditional full sheet loading
 * <script src="https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js"></script>
 * <script src="securesheets_v1.2.1_enhanced.js"></script>
 * <script src="securesheets_config_loader_v2.1.js"></script>
 * <script>
 *   // Configure SecureSheets with zero-secrets pattern
 *   await SecureSheets.configureWithEnvironment();
 *   
 *   const loader = new SecureSheetsConfig({
 *     sheetName: 'Sheet2',
 *     columnIndex: 1,
 *     startRow: 21,
 *     mode: 'sheet',  // 'sheet', 'cell', or 'range'
 *     onSuccess: (config) => console.log('Loaded:', config),
 *     onError: (error) => console.error('Failed:', error)
 *   });
 *   
 *   loader.addMapping([
 *     { key: 'businessName', type: 'string' },
 *     { key: 'businessPhone', type: 'string' },
 *     { key: 'businessEmail', type: 'string' }
 *   ]);
 *   
 *   await loader.load();
 * </script>
 * 
 * Usage Example 2: Cell-specific queries (EFFICIENT!)
 * <script>
 *   const loader = new SecureSheetsConfig({
 *     sheetName: 'Sheet2',
 *     mode: 'cell',  // Use cell-specific queries
 *     useBatch: true  // Batch multiple cells into one request
 *   });
 *   
 *   loader.addMapping([
 *     { key: 'businessName', cell: 'B21', type: 'string' },
 *     { key: 'logo', cell: 'B24', type: 'string' },
 *     { key: 'taxRate', cell: 'B27', type: 'number' }
 *   ]);
 *   
 *   await loader.load();
 * </script>
 * 
 * Usage Example 3: Range queries
 * <script>
 *   const loader = new SecureSheetsConfig({
 *     sheetName: 'Sheet2',
 *     mode: 'range',
 *     range: 'B21:B50'  // Load specific range
 *   });
 *   
 *   await loader.load();
 * </script>
 */

(function(global) {
    'use strict';

    class SecureSheetsConfig {
        constructor(options = {}) {
            // Configuration
            this.sheetName = options.sheetName || 'Sheet1';
            this.columnIndex = options.columnIndex !== undefined ? options.columnIndex : 1; // Default: Column B
            this.startRow = options.startRow || 1;
            this.configMapping = options.mapping || [];
            this.targetObject = options.targetObject || {};
            
            // NEW: Loading mode
            this.mode = options.mode || 'sheet'; // 'sheet', 'cell', 'range'
            this.range = options.range || null; // For range mode
            this.useBatch = options.useBatch !== undefined ? options.useBatch : true; // Batch cell queries
            
            // NEW: Request method
            this.usePost = options.usePost || false; // Use POST requests with CSRF
            
            // Callbacks
            this.onSuccess = options.onSuccess || null;
            this.onError = options.onError || null;
            this.onProgress = options.onProgress || null;
            
            // Data fetcher (SecureSheets)
            this.dataFetcher = options.dataFetcher || (typeof SecureSheets !== 'undefined' ? SecureSheets : null);
            
            // Caching
            this.useCache = options.useCache !== undefined ? options.useCache : true;
            
            // Statistics
            this.stats = {
                total: 0,
                loaded: 0,
                skipped: 0,
                errors: 0,
                mode: this.mode,
                requestCount: 0
            };
            
            // Enable/disable logging
            this.verbose = options.verbose !== undefined ? options.verbose : true;
            
            this._log('info', `🔧 Initialized SecureSheetsConfig v2.1 (mode: ${this.mode})`);
        }

        /**
         * Add parameter mapping
         * @param {Array|Object} mapping - Single mapping object or array of mappings
         * @param {Number} startRow - Optional: Override startRow for this mapping group
         */
        addMapping(mapping, startRow = null) {
            if (Array.isArray(mapping)) {
                const mappingsToAdd = startRow !== null 
                    ? mapping.map((m, i) => ({ ...m, _groupStartRow: startRow, _groupIndex: i }))
                    : mapping;
                this.configMapping.push(...mappingsToAdd);
            } else {
                if (startRow !== null) {
                    mapping._groupStartRow = startRow;
                    mapping._groupIndex = 0;
                }
                this.configMapping.push(mapping);
            }
            return this;
        }

        /**
         * Set the target object where config will be stored
         * @param {Object} obj - Target object
         */
        setTarget(obj) {
            this.targetObject = obj;
            return this;
        }

        /**
         * Main load function - dispatches to appropriate loader
         */
        async load() {
            try {
                // Validate
                if (!this.dataFetcher) {
                    throw new Error('SecureSheets not available. Please include securesheets_v1.2.1_enhanced.js first.');
                }

                if (!this.dataFetcher.isConfigured()) {
                    throw new Error('SecureSheets not configured. Please call SecureSheets.configure() or configureWithEnvironment() first.');
                }

                // Check if enhanced features are available
                const hasEnhancedFeatures = typeof this.dataFetcher.getCellData === 'function';
                if (this.mode === 'cell' && !hasEnhancedFeatures) {
                    this._log('warn', '⚠️ Cell mode requires v1.2.1 Enhanced. Falling back to sheet mode.');
                    this.mode = 'sheet';
                }

                // Dispatch to appropriate loader
                switch (this.mode) {
                    case 'cell':
                        return await this._loadWithCellQueries();
                    case 'range':
                        return await this._loadWithRangeQuery();
                    case 'sheet':
                    default:
                        return await this._loadFromSheet();
                }

            } catch (error) {
                this._log('error', '❌ Failed to load config:', error);
                
                if (this.onError) {
                    this.onError(error);
                }

                return {
                    success: false,
                    error: error.message,
                    stats: this.stats
                };
            }
        }

        /**
         * Load from full sheet (original method)
         */
        async _loadFromSheet() {
            this._log('info', `📄 Loading config from ${this.sheetName} (SHEET mode), Column ${this._getColumnLetter(this.columnIndex)}...`);
            
            // Fetch sheet data
            const response = this.usePost 
                ? await this.dataFetcher.getDataPost(this.sheetName, { useCache: this.useCache })
                : await this.dataFetcher.getData(this.sheetName, { useCache: this.useCache });
            
            this.stats.requestCount++;
            
            this._log('info', '📊 Response received');

            // Handle response
            if (response.status === 'error' || response.error) {
                throw new Error(response.message || response.error || 'Failed to load sheet data');
            }

            // Extract data
            let sheetData = this._extractSheetData(response);
            
            if (!sheetData || sheetData.length === 0) {
                throw new Error('No data found in sheet');
            }

            const headers = Object.keys(sheetData[0]);
            const columnKey = headers[this.columnIndex];

            this._log('info', `📊 Sheet has ${sheetData.length} rows`);
            this._log('info', `📊 Reading from column: ${columnKey}`);

            // Process mappings
            return await this._processMappings((config, index) => {
                const rowNumber = this._calculateRowNumber(config, index);
                const rawValue = this._getValueFromRow(sheetData, columnKey, rowNumber);
                return { rawValue, rowNumber };
            });
        }

        /**
         * Load with cell-specific queries (NEW - EFFICIENT!)
         */
        async _loadWithCellQueries() {
            this._log('info', `🎯 Loading config with CELL queries (efficient mode)...`);
            
            const validMappings = this.configMapping.filter(c => c !== null && c !== undefined);
            
            if (this.useBatch && validMappings.length > 1) {
                // Batch mode - load all cells in one request
                return await this._loadCellsBatch(validMappings);
            } else {
                // Individual mode - load cells one by one
                return await this._loadCellsIndividual(validMappings);
            }
        }

        /**
         * Load multiple cells in batch (most efficient)
         */
        async _loadCellsBatch(mappings) {
            this._log('info', `📦 Batch loading ${mappings.length} cells...`);
            
            // Build cell references
            const cellRefs = mappings.map((config, index) => {
                if (config.cell) {
                    // Explicit cell reference
                    return this._normalizeCellRef(config.cell);
                } else {
                    // Calculate from row/column
                    const rowNumber = this._calculateRowNumber(config, index);
                    const colLetter = this._getColumnLetter(this.columnIndex);
                    return `${this.sheetName}!${colLetter}${rowNumber}`;
                }
            });

            // Fetch all cells at once
            const response = await this.dataFetcher.getCellDataBatch(cellRefs, { useCache: this.useCache });
            this.stats.requestCount++;
            
            if (response.status === 'error' || response.error) {
                throw new Error(response.message || response.error || 'Failed to load cell data');
            }

            // Process results
            this.stats.total = mappings.length;
            
            mappings.forEach((config, index) => {
                try {
                    const cellData = response.data ? response.data[index] : null;
                    const rawValue = cellData ? cellData.value : null;
                    const rowNumber = this._calculateRowNumber(config, index);
                    
                    this._processValue(config, rawValue, rowNumber);
                } catch (error) {
                    this.stats.errors++;
                    this._log('error', `❌ Error processing ${config.key}:`, error);
                }
            });

            return this._finalizeLoading();
        }

        /**
         * Load cells individually
         */
        async _loadCellsIndividual(mappings) {
            this._log('info', `🔄 Loading ${mappings.length} cells individually...`);
            
            this.stats.total = mappings.length;
            
            for (let index = 0; index < mappings.length; index++) {
                const config = mappings[index];
                
                try {
                    let cellRef;
                    if (config.cell) {
                        cellRef = this._normalizeCellRef(config.cell);
                    } else {
                        const rowNumber = this._calculateRowNumber(config, index);
                        const colLetter = this._getColumnLetter(this.columnIndex);
                        cellRef = `${this.sheetName}!${colLetter}${rowNumber}`;
                    }
                    
                    // Fetch cell
                    const response = this.usePost
                        ? await this.dataFetcher.getCellDataPost(cellRef, { useCache: this.useCache })
                        : await this.dataFetcher.getCellData(cellRef, { useCache: this.useCache });
                    
                    this.stats.requestCount++;
                    
                    const rawValue = response.value || response.data?.value || null;
                    const rowNumber = this._calculateRowNumber(config, index);
                    
                    this._processValue(config, rawValue, rowNumber);
                    
                } catch (error) {
                    this.stats.errors++;
                    this._log('error', `❌ Error loading ${config.key}:`, error);
                }
            }

            return this._finalizeLoading();
        }

        /**
         * Load with range query (NEW)
         */
        async _loadWithRangeQuery() {
            this._log('info', `📐 Loading config with RANGE query: ${this.range}...`);
            
            if (!this.range) {
                throw new Error('Range must be specified for range mode');
            }

            const rangeRef = `${this.sheetName}!${this.range}`;
            
            const response = await this.dataFetcher.getRangeData(rangeRef, { useCache: this.useCache });
            this.stats.requestCount++;
            
            if (response.status === 'error' || response.error) {
                throw new Error(response.message || response.error || 'Failed to load range data');
            }

            const values = response.values || response.data?.values || [];
            
            this._log('info', `📊 Range has ${values.length} rows`);

            // Process mappings with range data
            return await this._processMappings((config, index) => {
                const rowNumber = this._calculateRowNumber(config, index);
                const rangeRowIndex = rowNumber - this.startRow;
                const rawValue = values[rangeRowIndex] ? values[rangeRowIndex][0] : null;
                return { rawValue, rowNumber };
            });
        }

        /**
         * Process all mappings with a data getter function
         */
        async _processMappings(dataGetter) {
            this.stats.total = this.configMapping.filter(c => c !== null && c !== undefined).length;
            
            this.configMapping.forEach((config, index) => {
                if (config === null || config === undefined) {
                    return;
                }
                
                try {
                    const { rawValue, rowNumber } = dataGetter(config, index);
                    this._processValue(config, rawValue, rowNumber);
                } catch (error) {
                    this.stats.errors++;
                    this._log('error', `❌ Error processing ${config.key}:`, error);
                }
            });

            return this._finalizeLoading();
        }

        /**
         * Process a single value
         */
        _processValue(config, rawValue, rowNumber) {
            if (rawValue === null || rawValue === '') {
                this.stats.skipped++;
                this._log('warn', `⚠️ ${config.key} (Row ${rowNumber}): Empty`);
                return;
            }

            const convertedValue = this._convertValue(rawValue, config.type);
            
            if (convertedValue !== null) {
                this._setNestedProperty(this.targetObject, config.key, convertedValue);
                this.stats.loaded++;
                this._log('success', `✅ ${config.key} (Row ${rowNumber}):`, convertedValue);
                
                if (this.onProgress) {
                    this.onProgress({
                        key: config.key,
                        value: convertedValue,
                        row: rowNumber,
                        progress: this.stats.loaded / this.stats.total
                    });
                }
            } else {
                this.stats.skipped++;
            }
        }

        /**
         * Finalize loading and return results
         */
        _finalizeLoading() {
            this._log('info', '\n📊 Loading Summary:');
            this._log('info', `   ✅ Loaded: ${this.stats.loaded}`);
            this._log('info', `   ⚠️ Skipped: ${this.stats.skipped}`);
            this._log('info', `   ❌ Errors: ${this.stats.errors}`);
            this._log('info', `   📋 Total: ${this.stats.total}`);
            this._log('info', `   🌐 Requests: ${this.stats.requestCount}`);

            if (this.onSuccess) {
                this.onSuccess(this.targetObject, this.stats);
            }

            return {
                success: true,
                data: this.targetObject,
                stats: this.stats
            };
        }

        /**
         * Extract sheet data from response
         */
        _extractSheetData(response) {
            if (response.status === 'success' && response.data) {
                return response.data;
            } else if (response.sheets && response.sheets[this.sheetName]) {
                return response.sheets[this.sheetName];
            } else if (Array.isArray(response)) {
                return response;
            }
            throw new Error('Unexpected response format');
        }

        /**
         * Calculate row number for a config
         */
        _calculateRowNumber(config, index) {
            if (config.row !== undefined) {
                return config.row;
            } else if (config._groupStartRow !== undefined) {
                return config._groupStartRow + config._groupIndex;
            } else {
                return this.startRow + index;
            }
        }

        /**
         * Normalize cell reference to include sheet name
         */
        _normalizeCellRef(cellRef) {
            if (cellRef.includes('!')) {
                return cellRef;
            }
            return `${this.sheetName}!${cellRef}`;
        }

        /**
         * Get value from specific row
         */
        _getValueFromRow(sheetData, columnKey, rowNumber) {
            const rowIndex = rowNumber - 1;
            
            if (sheetData.length <= rowIndex || rowIndex < 0) {
                this._log('warn', `⚠️ Row ${rowNumber} not found`);
                return null;
            }
            
            const value = sheetData[rowIndex][columnKey];
            return value ? String(value).trim() : null;
        }

        /**
         * Convert value based on type
         */
        _convertValue(value, type) {
            if (value === null || value === '') return null;

            switch (type) {
                case 'number':
                    const num = parseFloat(value);
                    return isNaN(num) ? null : num;

                case 'boolean':
                    return value.toLowerCase() === 'true' || value === '1' || value === 'yes';

                case 'array':
                    return value.split(',').map(item => item.trim()).filter(item => item);

                case 'json':
                    try {
                        return JSON.parse(value);
                    } catch (e) {
                        this._log('warn', 'Failed to parse JSON:', value);
                        return null;
                    }

                case 'string':
                default:
                    return String(value);
            }
        }

        /**
         * Set nested property using dot notation
         */
        _setNestedProperty(obj, path, value) {
            const keys = path.split('.');
            const lastKey = keys.pop();
            const target = keys.reduce((o, k) => {
                if (!o[k]) o[k] = {};
                return o[k];
            }, obj);
            target[lastKey] = value;
        }

        /**
         * Get column letter from index (0=A, 1=B, etc.)
         */
        _getColumnLetter(index) {
            let letter = '';
            while (index >= 0) {
                letter = String.fromCharCode((index % 26) + 65) + letter;
                index = Math.floor(index / 26) - 1;
            }
            return letter;
        }

        /**
         * Logging utility
         */
        _log(level, ...args) {
            if (!this.verbose) return;

            const styles = {
                success: 'color: #10b981',
                error: 'color: #ef4444',
                warn: 'color: #f59e0b',
                info: 'color: #3b82f6'
            };

            if (typeof args[0] === 'string' && args[0].match(/[✅❌⚠️📊📄🎯📦📐🔧🌐🔄]/)) {
                console.log(...args);
            } else {
                console.log(`%c[SecureSheetsConfig]`, `${styles[level] || ''}; font-weight: bold`, ...args);
            }
        }

        /**
         * Reset statistics
         */
        resetStats() {
            this.stats = { total: 0, loaded: 0, skipped: 0, errors: 0, mode: this.mode, requestCount: 0 };
            return this;
        }

        /**
         * Clear mapping
         */
        clearMapping() {
            this.configMapping = [];
            return this;
        }

        /**
         * Get current configuration
         */
        getConfig() {
            return { ...this.targetObject };
        }

        /**
         * Get statistics
         */
        getStats() {
            return { ...this.stats };
        }

        /**
         * Test connection to SecureSheets
         */
        async testConnection() {
            if (!this.dataFetcher) {
                return { success: false, error: 'SecureSheets not available' };
            }
            return await this.dataFetcher.testConnection();
        }

        /**
         * Check if enhanced features are available
         */
        hasEnhancedFeatures() {
            return this.dataFetcher && 
                   typeof this.dataFetcher.getCellData === 'function' &&
                   typeof this.dataFetcher.getRangeData === 'function';
        }
    }

    // Export to global scope
    global.SecureSheetsConfig = SecureSheetsConfig;

    // Also support CommonJS/ES6 if available
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SecureSheetsConfig;
    }

    console.log('✨ SecureSheetsConfig v2.1 Enhanced loaded');
    console.log('   📦 Features: Sheet, Cell, Range, Batch queries');

})(typeof window !== 'undefined' ? window : this);

/**
 * ============================================================================
 * USAGE EXAMPLES
 * ============================================================================
 * 
 * // Example 1: Traditional sheet loading (compatible with all versions)
 * await SecureSheets.configureWithEnvironment();
 * 
 * const loader = new SecureSheetsConfig({
 *   sheetName: 'Sheet2',
 *   columnIndex: 1,
 *   startRow: 21,
 *   mode: 'sheet'
 * });
 * 
 * loader.addMapping([
 *   { key: 'businessName', type: 'string' },
 *   { key: 'businessPhone', type: 'string' }
 * ]);
 * 
 * await loader.load();
 * 
 * 
 * // Example 2: Cell-specific queries (MOST EFFICIENT!)
 * const loader = new SecureSheetsConfig({
 *   sheetName: 'Sheet2',
 *   mode: 'cell',
 *   useBatch: true  // Load all cells in one request
 * });
 * 
 * loader.addMapping([
 *   { key: 'businessName', cell: 'B21', type: 'string' },
 *   { key: 'businessPhone', cell: 'B22', type: 'string' },
 *   { key: 'logo', cell: 'B24', type: 'string' },
 *   { key: 'taxRate', cell: 'B27', type: 'number' }
 * ]);
 * 
 * const result = await loader.load();
 * console.log(result.data);  // { businessName: '...', businessPhone: '...', ... }
 * console.log(result.stats.requestCount);  // 1 (all cells in one request!)
 * 
 * 
 * // Example 3: Range query
 * const loader = new SecureSheetsConfig({
 *   sheetName: 'Sheet2',
 *   mode: 'range',
 *   range: 'B21:B30',
 *   startRow: 21
 * });
 * 
 * loader.addMapping([
 *   { key: 'field1', type: 'string' },  // B21
 *   { key: 'field2', type: 'string' },  // B22
 *   { key: 'field3', type: 'number' }   // B23
 * ]);
 * 
 * await loader.load();
 * 
 * 
 * // Example 4: POST requests with CSRF
 * const loader = new SecureSheetsConfig({
 *   sheetName: 'Secret',
 *   mode: 'cell',
 *   usePost: true  // Use POST with CSRF protection
 * });
 * 
 * loader.addMapping([
 *   { key: 'apiKey', cell: 'B1', type: 'string' },
 *   { key: 'secret', cell: 'B2', type: 'string' }
 * ]);
 * 
 * await loader.load();
 * 
 * 
 * // Example 5: Check for enhanced features
 * const loader = new SecureSheetsConfig();
 * 
 * if (loader.hasEnhancedFeatures()) {
 *   console.log('✅ Using SecureSheets v1.2.1 Enhanced');
 *   loader.mode = 'cell';  // Use efficient cell queries
 * } else {
 *   console.log('⚠️ Using basic SecureSheets');
 *   loader.mode = 'sheet';  // Fall back to sheet loading
 * }
 * 
 * 
 * // Example 6: Performance comparison
 * // Traditional (loads entire sheet with 1000 rows)
 * const traditional = new SecureSheetsConfig({ mode: 'sheet' });
 * await traditional.load();  // Downloads ~100KB
 * 
 * // Cell-specific (loads only 3 cells)
 * const efficient = new SecureSheetsConfig({ mode: 'cell', useBatch: true });
 * efficient.addMapping([
 *   { key: 'a', cell: 'B21', type: 'string' },
 *   { key: 'b', cell: 'B22', type: 'string' },
 *   { key: 'c', cell: 'B23', type: 'string' }
 * ]);
 * await efficient.load();  // Downloads ~0.3KB (300x faster!)
 * 
 * ============================================================================
 */