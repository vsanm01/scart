/**
 * SheetConfig.js v2.0
 * Universal Google Sheets Configuration Loader
 * Compatible with SecureSheets v1.3.0 & Server v3.9.0
 * 
 * DEPENDENCIES:
 * - CryptoJS: https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js
 * - SecureSheets v1.3.0 (required)
 * 
 * USAGE:
 * <script src="https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js"></script>
 * <script src="securesheets_v1.3.0.js"></script>
 * <script src="sheetconfig.js"></script>
 * 
 * <script>
 *   // Configure SecureSheets first
 *   SecureSheets.configure({
 *     scriptUrl: 'https://script.google.com/macros/s/YOUR_ID/exec',
 *     apiToken: 'your-token',
 *     hmacSecret: 'your-secret',
 *     origin: window.location.origin
 *   });
 * 
 *   // Create SheetConfig loader
 *   const loader = new SheetConfig({
 *     sheetName: 'Sheet2',        // Protected sheet (requires HMAC)
 *     columnIndex: 1,             // Column B (0=A, 1=B, 2=C, etc.)
 *     startRow: 21,               // Default start row
 *     verbose: true,              // Enable logging
 *     onSuccess: (config) => console.log('✅ Loaded:', config),
 *     onError: (error) => console.error('❌ Failed:', error)
 *   });
 *   
 *   // METHOD 1: Default auto-increment from startRow (21)
 *   loader.addMapping([
 *     { key: 'businessName', type: 'string' },      // row 21
 *     { key: 'businessPhone', type: 'string' },     // row 22
 *     { key: 'businessEmail', type: 'string' }      // row 23
 *   ]);
 *   
 *   // METHOD 2: Use 'row' property to specify exact row
 *   loader.addMapping([
 *     { key: 'logo', type: 'string', row: 24 },     // row 24 (exact)
 *     { key: 'tagline', type: 'string', row: 30 }   // row 30 (exact)
 *   ]);
 *   
 *   // METHOD 3: Use null placeholders to skip rows
 *   loader.addMapping([
 *     { key: 'currency', type: 'string' },          // row 24
 *     null,                                         // skip row 25
 *     null,                                         // skip row 26
 *     { key: 'taxRate', type: 'number' }            // row 27
 *   ]);
 *   
 *   // METHOD 4: Override startRow for a group
 *   loader.addMapping([
 *     { key: 'social.facebook', type: 'string' },   // row 37
 *     { key: 'social.instagram', type: 'string' }   // row 38
 *   ], 37);
 *   
 *   // METHOD 5: Nested objects with dot notation
 *   loader.addMapping([
 *     { key: 'settings.theme', type: 'string' },
 *     { key: 'settings.language', type: 'string' },
 *     { key: 'settings.notifications', type: 'boolean' }
 *   ], 50);
 *   
 *   // Load the configuration
 *   const result = await loader.load();
 *   console.log(result.data);
 * </script>
 * 
 * SUPPORTED SHEETS (v3.9.0):
 * - Sheet2, Sheet4: Protected sheets (require HMAC authentication)
 * - Sheet3, Sheet5, Sheet6: Public sheets (domain validation only)
 * - Sheet1, Sheet7, ReadMe, SecurityLogs: BLOCKED (never accessible)
 */

(function(global) {
    'use strict';

    class SheetConfig {
        constructor(options = {}) {
            // Validate SecureSheets availability
            if (typeof SecureSheets === 'undefined') {
                throw new Error('SheetConfig requires SecureSheets v1.3.0 or higher. Please include securesheets.js first.');
            }

            // Configuration
            this.sheetName = options.sheetName || 'Sheet2';
            this.columnIndex = options.columnIndex !== undefined ? options.columnIndex : 1; // Default: Column B
            this.startRow = options.startRow || 1;
            this.configMapping = options.mapping || [];
            this.targetObject = options.targetObject || {};
            
            // Callbacks
            this.onSuccess = options.onSuccess || null;
            this.onError = options.onError || null;
            this.onProgress = options.onProgress || null;
            
            // Use SecureSheets as data fetcher
            this.dataFetcher = SecureSheets;
            
            // Statistics
            this.stats = {
                total: 0,
                loaded: 0,
                skipped: 0,
                errors: 0,
                warnings: []
            };
            
            // Options
            this.verbose = options.verbose !== undefined ? options.verbose : true;
            this.useCache = options.useCache !== undefined ? options.useCache : true;
            this.throwOnError = options.throwOnError !== undefined ? options.throwOnError : false;
            
            this._log('info', `📋 SheetConfig v2.0 initialized for ${this.sheetName}`);
        }

        /**
         * Add parameter mapping
         * @param {Array|Object} mapping - Single mapping object or array of mappings
         * @param {Number} startRow - Optional: Override startRow for this mapping group
         */
        addMapping(mapping, startRow = null) {
            if (Array.isArray(mapping)) {
                const mappingsToAdd = startRow !== null 
                    ? mapping.map((m, i) => m ? { ...m, _groupStartRow: startRow, _groupIndex: i } : null)
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
         * Main load function
         */
        async load() {
            try {
                this._log('info', `📄 Loading config from ${this.sheetName}, Column ${this._getColumnLetter(this.columnIndex)}...`);
                
                // Validate SecureSheets is configured
                if (!this.dataFetcher.isConfigured()) {
                    throw new Error(
                        'SecureSheets is not configured. Call SecureSheets.configure() first with:\n' +
                        '  - scriptUrl\n' +
                        '  - apiToken\n' +
                        '  - hmacSecret\n' +
                        '  - origin (window.location.origin)'
                    );
                }

                // Fetch sheet data using SecureSheets
                this._log('info', '🔄 Fetching data from server...');
                
                const response = await this.dataFetcher.getData(this.sheetName, { 
                    useCache: this.useCache 
                });

                this._log('info', '📊 Response received');

                // Handle v3.9.0 response format
                if (!response || (response.status === 'error' && !response.data)) {
                    throw new Error(response?.message || 'Failed to load sheet data');
                }

                // Extract data from response
                let sheetData;
                if (response.data && Array.isArray(response.data)) {
                    sheetData = response.data;
                } else if (response.status === 'success' && response.data) {
                    sheetData = response.data;
                } else {
                    throw new Error('Invalid response format from server');
                }

                if (!sheetData || sheetData.length === 0) {
                    throw new Error('No data found in sheet');
                }

                this._log('info', `📊 Sheet has ${sheetData.length} rows`);

                // Process all mappings
                this.stats.total = this.configMapping.filter(m => m !== null).length;
                
                let currentAutoRow = this.startRow;

                this.configMapping.forEach((config, index) => {
                    // Skip null placeholders
                    if (config === null || config === undefined) {
                        currentAutoRow++;
                        this.stats.skipped++;
                        return;
                    }
                    
                    // Calculate row number with priority:
                    // 1. Explicit 'row' property (highest priority)
                    // 2. Group startRow + group index
                    // 3. Global startRow + auto-increment (default)
                    let rowNumber;
                    if (config.row !== undefined) {
                        rowNumber = config.row;
                    } else if (config._groupStartRow !== undefined) {
                        rowNumber = config._groupStartRow + config._groupIndex;
                    } else {
                        rowNumber = currentAutoRow;
                        currentAutoRow++;
                    }
                    
                    try {
                        const rawValue = this._getValueFromRow(sheetData, rowNumber);
                        
                        if (rawValue === null || rawValue === '') {
                            this.stats.skipped++;
                            this._log('warn', `⏭️ ${config.key} (Row ${rowNumber}): Empty or not found`);
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
                            this._log('warn', `⏭️ ${config.key} (Row ${rowNumber}): Conversion failed`);
                        }
                    } catch (error) {
                        this.stats.errors++;
                        const errorMsg = `Error processing ${config.key}: ${error.message}`;
                        this.stats.warnings.push(errorMsg);
                        this._log('error', `❌ ${errorMsg}`);
                        
                        if (this.throwOnError) {
                            throw error;
                        }
                    }
                });

                // Final summary
                this._log('info', '\n📊 Loading Summary:');
                this._log('info', `   ✅ Loaded: ${this.stats.loaded}`);
                this._log('info', `   ⏭️ Skipped: ${this.stats.skipped}`);
                this._log('info', `   ❌ Errors: ${this.stats.errors}`);
                this._log('info', `   📋 Total: ${this.stats.total}`);

                if (this.stats.errors > 0) {
                    this._log('warn', '\n⚠️ Warnings:');
                    this.stats.warnings.forEach(w => this._log('warn', `   - ${w}`));
                }

                if (this.onSuccess) {
                    this.onSuccess(this.targetObject, this.stats);
                }

                return {
                    success: true,
                    data: this.targetObject,
                    stats: this.stats
                };

            } catch (error) {
                this._log('error', '❌ Failed to load config:', error.message);
                
                // Handle specific v3.9.0 error codes
                if (error.code) {
                    this._log('error', `   Error Code: ${error.code}`);
                    
                    switch (error.code) {
                        case 'ERR_AUTH_001':
                        case 'ERR_AUTH_002':
                        case 'ERR_AUTH_003':
                            this._log('error', '   💡 Check your SecureSheets configuration (token, secret, origin)');
                            break;
                        case 'ERR_AUTH_005':
                            this._log('error', '   💡 HMAC signature validation failed - check your hmacSecret');
                            break;
                        case 'ERR_SEC_003':
                            this._log('error', `   💡 Sheet "${this.sheetName}" is not accessible via API`);
                            this._log('error', '   💡 Accessible sheets: Sheet2, Sheet3, Sheet4, Sheet5, Sheet6');
                            break;
                        case 'ERR_RATE_001':
                            this._log('error', '   💡 Rate limit exceeded - wait before retrying');
                            break;
                    }
                }
                
                if (this.onError) {
                    this.onError(error);
                }

                return {
                    success: false,
                    error: error.message,
                    code: error.code,
                    stats: this.stats
                };
            }
        }

        /**
         * Get value from specific row
         * Updated for v3.9.0 response format
         */
        _getValueFromRow(sheetData, rowNumber) {
            // Convert 1-based row number to 0-based array index
            const rowIndex = rowNumber - 1;
            
            if (rowIndex < 0 || rowIndex >= sheetData.length) {
                this._log('warn', `⚠️ Row ${rowNumber} is out of bounds (sheet has ${sheetData.length} rows)`);
                return null;
            }
            
            const row = sheetData[rowIndex];
            
            // Handle different data formats
            if (Array.isArray(row)) {
                // Array format: [[col0, col1, col2, ...]]
                const value = row[this.columnIndex];
                return value !== null && value !== undefined ? String(value).trim() : null;
            } else if (typeof row === 'object') {
                // Object format: [{ col0: val, col1: val, ... }]
                const keys = Object.keys(row);
                const key = keys[this.columnIndex];
                if (key && row[key] !== null && row[key] !== undefined) {
                    return String(row[key]).trim();
                }
            }
            
            return null;
        }

        /**
         * Convert value based on type
         */
        _convertValue(value, type) {
            if (value === null || value === '') return null;

            try {
                switch (type) {
                    case 'number':
                        const num = parseFloat(value);
                        return isNaN(num) ? null : num;

                    case 'integer':
                        const int = parseInt(value, 10);
                        return isNaN(int) ? null : int;

                    case 'boolean':
                        const lower = value.toLowerCase();
                        return lower === 'true' || lower === '1' || lower === 'yes' || lower === 'on';

                    case 'array':
                        return value.split(',').map(item => item.trim()).filter(item => item);

                    case 'json':
                        try {
                            return JSON.parse(value);
                        } catch (e) {
                            this._log('warn', `Failed to parse JSON: ${value}`);
                            return null;
                        }

                    case 'url':
                        try {
                            new URL(value);
                            return value;
                        } catch (e) {
                            this._log('warn', `Invalid URL: ${value}`);
                            return null;
                        }

                    case 'email':
                        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                            return value;
                        }
                        this._log('warn', `Invalid email: ${value}`);
                        return null;

                    case 'string':
                    default:
                        return value;
                }
            } catch (error) {
                this._log('warn', `Conversion error for value "${value}" to type "${type}": ${error.message}`);
                return null;
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
                success: 'color: #10b981; font-weight: bold',
                error: 'color: #ef4444; font-weight: bold',
                warn: 'color: #f59e0b; font-weight: bold',
                info: 'color: #3b82f6; font-weight: bold'
            };

            console.log(`%c[SheetConfig v2.0]`, styles[level] || '', ...args);
        }

        /**
         * Reset statistics
         */
        resetStats() {
            this.stats = { 
                total: 0, 
                loaded: 0, 
                skipped: 0, 
                errors: 0,
                warnings: []
            };
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
            return {
                sheetName: this.sheetName,
                columnIndex: this.columnIndex,
                columnLetter: this._getColumnLetter(this.columnIndex),
                startRow: this.startRow,
                mappingCount: this.configMapping.length,
                targetObject: this.targetObject,
                stats: this.stats
            };
        }

        /**
         * Validate configuration before loading
         */
        async validate() {
            const issues = [];

            // Check SecureSheets
            if (typeof SecureSheets === 'undefined') {
                issues.push('SecureSheets library not found');
            } else if (!SecureSheets.isConfigured()) {
                issues.push('SecureSheets not configured');
            }

            // Check mappings
            if (this.configMapping.length === 0) {
                issues.push('No mappings defined');
            }

            // Check sheet name
            const blockedSheets = ['Sheet1', 'Sheet7', 'ReadMe', 'SecurityLogs'];
            if (blockedSheets.includes(this.sheetName)) {
                issues.push(`Sheet "${this.sheetName}" is blocked and cannot be accessed via API`);
            }

            return {
                valid: issues.length === 0,
                issues: issues
            };
        }
    }

    // Export to global scope
    global.SheetConfig = SheetConfig;

    // CommonJS/ES6 support
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SheetConfig;
    }

    console.log('%c[SheetConfig v2.0]', 'color: #10b981; font-weight: bold', 'Loaded - Compatible with SecureSheets v1.3.0');

})(typeof window !== 'undefined' ? window : this);
