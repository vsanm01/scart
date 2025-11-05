/**
 * GSRCDN Secure API Library
 * Version: 1.0.0
 * 
 * A client-side library for making secure, authenticated requests to Google Apps Script APIs
 * with HMAC signature verification and comprehensive security features.
 * 
 * Dependencies: CryptoJS (for HMAC-SHA256)
 * - Include before this script: https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js
 * 
 * Usage:
 * 1. Configure your API settings with GSRCDN.configure()
 * 2. Make secure requests with GSRCDN.makeRequest()
 */

(function(window) {
    'use strict';

    // ============================================
    // GSRCDN NAMESPACE
    // ============================================
    const GSRCDN = {
        version: '1.0.0',
        config: {
            scriptUrl: null,
            apiToken: null,
            hmacSecret: null,
            rateLimitEnabled: true,
            maxRequests: 100,
            dataMasking: { enabled: false, fields: [] },
            checksumValidation: true,
            enforceHttps: true,
            debug: false
        },
        
        // Request counter for client-side rate limiting
        requestCount: 0,
        requestWindow: Date.now()
    };

    // ============================================
    // CONFIGURATION METHOD
    // ============================================
    /**
     * Configure the GSRCDN API settings
     * @param {Object} options - Configuration options
     * @param {string} options.scriptUrl - Google Apps Script Web App URL
     * @param {string} options.apiToken - API authentication token
     * @param {string} options.hmacSecret - HMAC secret key for signature generation
     * @param {boolean} [options.rateLimitEnabled=true] - Enable rate limiting
     * @param {number} [options.maxRequests=100] - Maximum requests per hour
     * @param {Object} [options.dataMasking] - Data masking configuration
     * @param {boolean} [options.checksumValidation=true] - Enable checksum validation
     * @param {boolean} [options.enforceHttps=true] - Enforce HTTPS connections
     * @param {boolean} [options.debug=false] - Enable debug logging
     */
    GSRCDN.configure = function(options) {
        if (!options) {
            throw new Error('GSRCDN: Configuration options are required');
        }

        // Required fields validation
        if (!options.scriptUrl) {
            throw new Error('GSRCDN: scriptUrl is required');
        }
        if (!options.apiToken) {
            throw new Error('GSRCDN: apiToken is required');
        }
        if (!options.hmacSecret) {
            throw new Error('GSRCDN: hmacSecret is required');
        }

        // Validate HTTPS if enforced
        if (options.enforceHttps !== false && !options.scriptUrl.startsWith('https://')) {
            throw new Error('GSRCDN: scriptUrl must use HTTPS');
        }

        // Merge configuration
        Object.assign(GSRCDN.config, options);

        if (GSRCDN.config.debug) {
            console.log('GSRCDN: Configuration loaded successfully', {
                scriptUrl: GSRCDN.config.scriptUrl,
                rateLimitEnabled: GSRCDN.config.rateLimitEnabled,
                maxRequests: GSRCDN.config.maxRequests
            });
        }

        return GSRCDN;
    };

    // ============================================
    // HMAC COMPUTATION
    // ============================================
    /**
     * Compute HMAC-SHA256 signature
     * @param {string} message - Message to sign
     * @param {string} secret - Secret key
     * @returns {string} HMAC signature in hex format
     */
    GSRCDN.computeHMAC = function(message, secret) {
        if (typeof CryptoJS === 'undefined') {
            throw new Error('GSRCDN: CryptoJS library is required. Include https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js');
        }

        if (!message || !secret) {
            throw new Error('GSRCDN: Message and secret are required for HMAC computation');
        }

        return CryptoJS.HmacSHA256(message, secret).toString();
    };

    // ============================================
    // SIGNATURE CREATION
    // ============================================
    /**
     * Create a signature from request parameters
     * @param {Object} params - Request parameters
     * @param {string} secret - HMAC secret key
     * @returns {string} Generated signature
     */
    GSRCDN.createSignature = function(params, secret) {
        if (!params || typeof params !== 'object') {
            throw new Error('GSRCDN: Parameters must be a valid object');
        }

        // Sort keys alphabetically for consistent signature
        const sortedKeys = Object.keys(params).sort();
        
        // Build signature string: key1=value1&key2=value2...
        const signatureString = sortedKeys
            .map(key => `${key}=${params[key]}`)
            .join('&');

        if (GSRCDN.config.debug) {
            console.log('GSRCDN: Signature string:', signatureString);
        }

        return GSRCDN.computeHMAC(signatureString, secret);
    };

    // ============================================
    // RATE LIMITING CHECK
    // ============================================
    /**
     * Check if request is within rate limits
     * @returns {boolean} True if within limits
     * @throws {Error} If rate limit exceeded
     */
    GSRCDN.checkRateLimit = function() {
        if (!GSRCDN.config.rateLimitEnabled) {
            return true;
        }

        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        // Reset counter if window has passed
        if (now - GSRCDN.requestWindow > oneHour) {
            GSRCDN.requestCount = 0;
            GSRCDN.requestWindow = now;
        }

        // Check limit
        if (GSRCDN.requestCount >= GSRCDN.config.maxRequests) {
            const resetTime = new Date(GSRCDN.requestWindow + oneHour);
            throw new Error(`GSRCDN: Rate limit exceeded. Resets at ${resetTime.toLocaleTimeString()}`);
        }

        GSRCDN.requestCount++;
        return true;
    };

    // ============================================
    // SECURE API REQUEST
    // ============================================
    /**
     * Make a secure API request with HMAC authentication
     * @param {Object} params - Request parameters
     * @param {string} params.action - API action to perform
     * @param {string} [params.dataType] - Type of data to retrieve/modify
     * @param {Object} [options] - Additional request options
     * @param {number} [options.timeout=30000] - Request timeout in milliseconds
     * @param {Object} [options.headers] - Additional headers
     * @returns {Promise<Object>} API response
     */
    GSRCDN.makeRequest = async function(params, options = {}) {
        // Validate configuration
        if (!GSRCDN.config.scriptUrl || !GSRCDN.config.apiToken || !GSRCDN.config.hmacSecret) {
            throw new Error('GSRCDN: API not configured. Call GSRCDN.configure() first.');
        }

        // Validate parameters
        if (!params || typeof params !== 'object') {
            throw new Error('GSRCDN: Request parameters must be an object');
        }

        if (!params.action) {
            throw new Error('GSRCDN: "action" parameter is required');
        }

        try {
            // Check rate limit
            GSRCDN.checkRateLimit();

            // Clone params to avoid mutation
            const requestParams = { ...params };

            // Add authentication and metadata
            requestParams.token = GSRCDN.config.apiToken;
            requestParams.timestamp = Date.now().toString();
            requestParams.referrer = window.location.origin;
            requestParams.origin = window.location.origin;

            // Generate signature
            requestParams.signature = GSRCDN.createSignature(requestParams, GSRCDN.config.hmacSecret);

            // Build URL with query parameters
            const url = new URL(GSRCDN.config.scriptUrl);
            Object.keys(requestParams).forEach(key => {
                url.searchParams.append(key, requestParams[key]);
            });

            if (GSRCDN.config.debug) {
                console.log('GSRCDN: Making request to:', url.toString());
                console.log('GSRCDN: Parameters:', requestParams);
            }

            // Setup fetch options
            const fetchOptions = {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    ...options.headers
                }
            };

            // Add timeout support
            const timeout = options.timeout || 30000;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            fetchOptions.signal = controller.signal;

            // Make request
            const response = await fetch(url, fetchOptions);
            clearTimeout(timeoutId);

            // Check HTTP status
            if (!response.ok) {
                throw new Error(`GSRCDN: HTTP error! Status: ${response.status} ${response.statusText}`);
            }

            // Parse response
            const data = await response.json();

            if (GSRCDN.config.debug) {
                console.log('GSRCDN: Response received:', data);
            }

            // Check API response status
            if (data.status === 'success') {
                return data;
            } else {
                throw new Error(data.message || 'GSRCDN: Request failed');
            }

        } catch (error) {
            // Handle specific error types
            if (error.name === 'AbortError') {
                throw new Error('GSRCDN: Request timeout');
            }

            console.error('GSRCDN: Request error:', error);
            throw error;
        }
    };

    // ============================================
    // CONVENIENCE METHODS
    // ============================================

    /**
     * Get data from the API
     * @param {string} dataType - Type of data to retrieve
     * @param {Object} [additionalParams] - Additional parameters
     * @returns {Promise<Object>} API response
     */
    GSRCDN.getData = async function(dataType, additionalParams = {}) {
        return GSRCDN.makeRequest({
            action: 'getData',
            dataType: dataType,
            ...additionalParams
        });
    };

    /**
     * Add data via the API
     * @param {string} dataType - Type of data to add
     * @param {Object} data - Data to add
     * @param {Object} [additionalParams] - Additional parameters
     * @returns {Promise<Object>} API response
     */
    GSRCDN.addData = async function(dataType, data, additionalParams = {}) {
        return GSRCDN.makeRequest({
            action: 'addData',
            dataType: dataType,
            data: JSON.stringify(data),
            ...additionalParams
        });
    };

    /**
     * Update data via the API
     * @param {string} dataType - Type of data to update
     * @param {string} id - ID of item to update
     * @param {Object} updates - Updates to apply
     * @param {Object} [additionalParams] - Additional parameters
     * @returns {Promise<Object>} API response
     */
    GSRCDN.updateData = async function(dataType, id, updates, additionalParams = {}) {
        return GSRCDN.makeRequest({
            action: 'updateData',
            dataType: dataType,
            id: id,
            updates: JSON.stringify(updates),
            ...additionalParams
        });
    };

    /**
     * Delete data via the API
     * @param {string} dataType - Type of data to delete
     * @param {string} id - ID of item to delete
     * @param {Object} [additionalParams] - Additional parameters
     * @returns {Promise<Object>} API response
     */
    GSRCDN.deleteData = async function(dataType, id, additionalParams = {}) {
        return GSRCDN.makeRequest({
            action: 'deleteData',
            dataType: dataType,
            id: id,
            ...additionalParams
        });
    };

    // ============================================
    // UTILITY METHODS
    // ============================================

    /**
     * Get current configuration (without sensitive data)
     * @returns {Object} Public configuration
     */
    GSRCDN.getConfig = function() {
        return {
            scriptUrl: GSRCDN.config.scriptUrl,
            rateLimitEnabled: GSRCDN.config.rateLimitEnabled,
            maxRequests: GSRCDN.config.maxRequests,
            checksumValidation: GSRCDN.config.checksumValidation,
            enforceHttps: GSRCDN.config.enforceHttps,
            debug: GSRCDN.config.debug,
            version: GSRCDN.version
        };
    };

    /**
     * Reset rate limit counter
     */
    GSRCDN.resetRateLimit = function() {
        GSRCDN.requestCount = 0;
        GSRCDN.requestWindow = Date.now();
        
        if (GSRCDN.config.debug) {
            console.log('GSRCDN: Rate limit counter reset');
        }
    };

    /**
     * Get current rate limit status
     * @returns {Object} Rate limit status
     */
    GSRCDN.getRateLimitStatus = function() {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        const resetTime = new Date(GSRCDN.requestWindow + oneHour);
        
        return {
            enabled: GSRCDN.config.rateLimitEnabled,
            currentRequests: GSRCDN.requestCount,
            maxRequests: GSRCDN.config.maxRequests,
            remaining: Math.max(0, GSRCDN.config.maxRequests - GSRCDN.requestCount),
            resetsAt: resetTime.toISOString(),
            resetsIn: Math.max(0, resetTime - now)
        };
    };

    // ============================================
    // EXPORT TO WINDOW
    // ============================================
    window.GSRCDN = GSRCDN;

    // AMD/CommonJS compatibility
    if (typeof define === 'function' && define.amd) {
        define([], function() { return GSRCDN; });
    } else if (typeof module === 'object' && module.exports) {
        module.exports = GSRCDN;
    }

    // Log initialization
    if (typeof console !== 'undefined') {
        console.log(`GSRCDN v${GSRCDN.version} loaded successfully`);
    }

})(window);
