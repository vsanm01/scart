/**
 * SheetConfig.js v1.0
 * Universal Google Sheets Configuration Loader
 * 
 * Usage:
 * <script src="https://your-cdn.com/sheetconfig.js"></script>
 * <script>
 *   const loader = new SheetConfig({
 *     sheetName: 'Sheet2',
 *     columnIndex: 1,  // Column B
 *     startRow: 21,    // Default start row
 *     onSuccess: (config) => console.log('Loaded:', config),
 *     onError: (error) => console.error('Failed:', error)
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
 *     { key: 'currency', type: 'string' },          // row 24 (continues from addMapping)
 *     null,                                         // skip row 25
 *     null,                                         // skip row 26
 *     { key: 'taxRate', type: 'number' }            // row 27
 *   ]);
 *   
 *   // METHOD 4: Override startRow for a group
 *   loader.addMapping([
 *     { key: 'social.facebook', type: 'string' },   // row 37
 *     { key: 'social.instagram', type: 'string' }   // row 38
 *   ], 37);  // Start from row 37
 *   
 *   // METHOD 5: Combine all methods!
 *   loader.addMapping([
 *     { key: 'feature1', type: 'boolean' },         // row 43 (from group startRow)
 *     null,                                         // skip row 44
 *     { key: 'feature2', type: 'boolean' },         // row 45
 *     { key: 'special', type: 'string', row: 100 }  // row 100 (exact override)
 *   ], 43);
 *   
 *   await loader.load();
 * </script>
 */

(function(global) {
    'use strict';

    class SheetConfig {
        constructor(options = {}) {
            // Configuration
            this.sheetName = options.sheetName || 'Sheet1';
            this.columnIndex = options.columnIndex !== undefined ? options.columnIndex : 1; // Default: Column B
            this.startRow = options.startRow || 1;
            this.configMapping = options.mapping || [];
            this.targetObject = options.targetObject || {};
            
            // Callbacks
            this.onSuccess = options.onSuccess || null;
            this.onError = options.onError || null;
            this.onProgress = options.onProgress || null;
            
            // Data fetcher (SecureSheets or custom)
            this.dataFetcher = options.dataFetcher || (typeof SecureSheets !== 'undefined' ? SecureSheets : null);
            
            // Statistics
            this.stats = {
                total: 0,
                loaded: 0,
                skipped: 0,
                errors: 0
            };
            
            // Enable/disable logging
            this.verbose = options.verbose !== undefined ? options.verbose : true;
        }

        /**
         * Add parameter mapping
         * @param {Array|Object} mapping - Single mapping object or array of mappings
         * @param {Number} startRow - Optional: Override startRow for this mapping group
         */
        addMapping(mapping, startRow = null) {
            if (Array.isArray(mapping)) {
                // If startRow is provided, add it as metadata to each mapping
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
         * Main load function
         */
        async load() {
            try {
                this._log('info', `📄 Loading config from ${this.sheetName}, Column ${this._getColumnLetter(this.columnIndex)}...`);
                
                // Validate data fetcher
                if (!this.dataFetcher || typeof this.dataFetcher.getData !== 'function') {
                    throw new Error('No data fetcher available. Please provide SecureSheets or custom dataFetcher.');
                }

                // Fetch sheet data
                const response = await this.dataFetcher.getData(this.sheetName, { 
                    sheet: this.sheetName 
                });

                this._log('info', '📊 Response received:', response);

                if (response.status === 'error') {
                    throw new Error(response.message || 'Failed to load sheet data');
                }

                if (!response?.data || response.data.length === 0) {
                    throw new Error('No data found in sheet');
                }

                const sheetData = response.data;
                const headers = Object.keys(sheetData[0]);
                const columnKey = headers[this.columnIndex];

                this._log('info', `📊 Sheet has ${sheetData.length} rows`);
                this._log('info', `📊 Reading from column: ${columnKey}`);

                // Process all mappings
                this.stats.total = this.configMapping.length;
                
                this.configMapping.forEach((config, index) => {
                    // Skip null placeholders
                    if (config === null || config === undefined) {
                        this.stats.skipped++;
                        return;
                    }
                    
                    // Calculate row number with priority:
                    // 1. Explicit 'row' property (highest priority)
                    // 2. Group startRow + group index
                    // 3. Global startRow + array index (default)
                    let rowNumber;
                    if (config.row !== undefined) {
                        rowNumber = config.row; // Explicit row override
                    } else if (config._groupStartRow !== undefined) {
                        rowNumber = config._groupStartRow + config._groupIndex; // Group-based
                    } else {
                        rowNumber = this.startRow + index; // Default auto-increment
                    }
                    
                    try {
                        const rawValue = this._getValueFromRow(sheetData, columnKey, rowNumber);
                        
                        if (rawValue === null || rawValue === '') {
                            this.stats.skipped++;
                            this._log('warn', `⏭️ ${config.key} (Row ${rowNumber}): Empty`);
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
                    } catch (error) {
                        this.stats.errors++;
                        this._log('error', `❌ Error processing ${config.key}:`, error);
                    }
                });

                // Final summary
                this._log('info', '\n📊 Loading Summary:');
                this._log('info', `   ✅ Loaded: ${this.stats.loaded}`);
                this._log('info', `   ⏭️ Skipped: ${this.stats.skipped}`);
                this._log('info', `   ❌ Errors: ${this.stats.errors}`);
                this._log('info', `   📋 Total: ${this.stats.total}`);

                if (this.onSuccess) {
                    this.onSuccess(this.targetObject, this.stats);
                }

                return {
                    success: true,
                    data: this.targetObject,
                    stats: this.stats
                };

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
                    return value;
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

            if (typeof args[0] === 'string' && args[0].includes('✅❌⏭️📊📄⚠️')) {
                console.log(...args);
            } else {
                console.log(`%c[SheetConfig]`, `${styles[level] || ''}; font-weight: bold`, ...args);
            }
        }

        /**
         * Reset statistics
         */
        resetStats() {
            this.stats = { total: 0, loaded: 0, skipped: 0, errors: 0 };
            return this;
        }

        /**
         * Clear mapping
         */
        clearMapping() {
            this.configMapping = [];
            return this;
        }
    }

    // Export to global scope
    global.SheetConfig = SheetConfig;

    // Also support CommonJS/ES6 if available
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SheetConfig;
    }

})(typeof window !== 'undefined' ? window : this);
