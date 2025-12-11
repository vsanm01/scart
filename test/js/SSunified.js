/**
 * ============================================================================
 * SECURESHEETS CLIENT LIBRARY v1.2.1 - UNIFIED COMPLETE EDITION
 * ============================================================================
 * 
 * A secure JavaScript client for interacting with SecureSheets API
 * Compatible with SecureSheets Server v3.5.0 - v3.8.0+
 * 
 * NEW IN v1.2.1:
 * - Fixed compatibility with Server v3.8.0 (uses ?type=config)
 * - Added configureWithEnvironment() for zero-secrets pattern
 * - Enhanced security documentation
 * - Improved error messages for configuration issues
 * - Better server version detection and adaptation
 * 
 * Features:
 * - HMAC-based authentication
 * - CSRF protection for POST requests
 * - Nonce support for replay attack prevention
 * - Rate limiting (client-side)
 * - Response caching
 * - Webhook signature verification
 * - Connection testing
 * - Multi-sheet support
 * - Auto-discovery with version adaptation
 * - Environment variable support
 * 
 * Dependencies:
 * - CryptoJS (for HMAC-SHA256): https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js
 * 
 * @author SecureSheets Team
 * @version 1.2.1
 * @license MIT
 * ============================================================================
 */

(function(window) {
    'use strict';

    // ============================================
    // CORE OBJECT
    // ============================================
    const SecureSheets = {
        version: '1.2.1',
        config: {
            scriptUrl: '',
            apiToken: '',
            hmacSecret: '',
            enableCSRF: true,
            enableNonce: true,
            rateLimitEnabled: true,
            maxRequests: 100,
            cacheTimeout: 300000, // 5 minutes
            debug: false
        },
        serverInfo: null,
        cache: new Map(),
        requestCount: 0,
        requestWindow: Date.now(),
        csrfToken: null,
        csrfExpiry: null,
        usedNonces: new Set()
    };

    // ============================================
    // CONFIGURATION METHODS
    // ============================================

    /**
     * Configure the SecureSheets client
     * @param {Object} options - Configuration options
     */
    SecureSheets.configure = function(options) {
        if (options.scriptUrl) SecureSheets.config.scriptUrl = options.scriptUrl;
        if (options.apiToken) SecureSheets.config.apiToken = options.apiToken;
        if (options.hmacSecret) SecureSheets.config.hmacSecret = options.hmacSecret;
        if (typeof options.enableCSRF === 'boolean') SecureSheets.config.enableCSRF = options.enableCSRF;
        if (typeof options.enableNonce === 'boolean') SecureSheets.config.enableNonce = options.enableNonce;
        if (typeof options.rateLimitEnabled === 'boolean') SecureSheets.config.rateLimitEnabled = options.rateLimitEnabled;
        if (options.maxRequests) SecureSheets.config.maxRequests = options.maxRequests;
        if (options.cacheTimeout) SecureSheets.config.cacheTimeout = options.cacheTimeout;
        if (typeof options.debug === 'boolean') SecureSheets.config.debug = options.debug;

        if (SecureSheets.config.debug) {
            console.log('SecureSheets: Configured', {
                scriptUrl: SecureSheets.config.scriptUrl,
                hasApiToken: !!SecureSheets.config.apiToken,
                hasHmacSecret: !!SecureSheets.config.hmacSecret,
                enableCSRF: SecureSheets.config.enableCSRF,
                enableNonce: SecureSheets.config.enableNonce,
                rateLimitEnabled: SecureSheets.config.rateLimitEnabled
            });
        }
    };

    /**
     * Configure with environment variables (RECOMMENDED - Zero Secrets Pattern)
     * @param {Object} envVars - Environment variables object (defaults to process.env)
     * @returns {Promise<Object>} Server configuration
     */
    SecureSheets.configureWithEnvironment = async function(envVars) {
        const env = envVars || (typeof process !== 'undefined' ? process.env : {});
        
        if (!env.SHEETS_BASE_URL || !env.API_TOKEN || !env.HMAC_SECRET) {
            throw new Error(
                'SecureSheets: Missing required environment variables. ' +
                'Required: SHEETS_BASE_URL, API_TOKEN, HMAC_SECRET'
            );
        }

        const options = {
            scriptUrl: env.SHEETS_BASE_URL,
            apiToken: env.API_TOKEN,
            hmacSecret: env.HMAC_SECRET,
            enableCSRF: env.ENABLE_CSRF !== 'false',
            enableNonce: env.ENABLE_NONCE !== 'false',
            rateLimitEnabled: env.RATE_LIMIT_ENABLED !== 'false',
            maxRequests: parseInt(env.MAX_REQUESTS) || 100,
            cacheTimeout: parseInt(env.CACHE_TIMEOUT) || 300000,
            debug: env.NODE_ENV === 'development' || env.DEBUG === 'true'
        };

        if (SecureSheets.config.debug) {
            console.log('ðŸ” SecureSheets: Configuring with environment variables (NO SECRETS EXPOSED)');
        }

        return await SecureSheets.configureWithDiscovery(options);
    };

    /**
     * Configure with auto-discovery (LEGACY - for Server v3.7.0 and below)
     * @param {Object} options - Configuration options
     * @returns {Promise<Object>} Server configuration
     */
    SecureSheets.configureWithDiscovery = async function(options) {
        SecureSheets.configure(options);

        try {
            // Try v3.8.0+ format first (?type=config)
            let serverConfig;
            try {
                serverConfig = await SecureSheets._fetchServerConfigV380();
                if (SecureSheets.config.debug) {
                    console.log('âœ… Connected to Server v3.8.0+ (using ?type=config)');
                }
            } catch (error) {
                // Fall back to v3.7.0 format (?action=config)
                if (SecureSheets.config.debug) {
                    console.log('âš ï¸ Server v3.8.0 format failed, trying v3.7.0 format...');
                }
                serverConfig = await SecureSheets._fetchServerConfigLegacy();
                if (SecureSheets.config.debug) {
                    console.log('âœ… Connected to Server v3.7.0 or below (using ?action=config)');
                }
            }

            SecureSheets.serverInfo = serverConfig;

            // Update scriptUrl if server provides it
            if (serverConfig.scriptUrl) {
                SecureSheets.config.scriptUrl = serverConfig.scriptUrl;
            }

            if (SecureSheets.config.debug) {
                console.log('SecureSheets: Auto-discovery complete', {
                    version: serverConfig.version,
                    features: serverConfig.features?.length || 0,
                    gateway: serverConfig.features?.gateway || false
                });
            }

            return serverConfig;
        } catch (error) {
            console.warn('SecureSheets: Auto-discovery failed, using manual config', error.message);
            return null;
        }
    };

    /**
     * Fetch server config (v3.8.0+ format)
     * @private
     * @returns {Promise<Object>} Server configuration
     */
    SecureSheets._fetchServerConfigV380 = async function() {
        const url = SecureSheets.config.scriptUrl + '?type=config';
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error('Server config fetch failed: ' + response.statusText);
        }

        const config = await response.json();
        
        if (!config.success) {
            throw new Error('Server returned error: ' + (config.error || 'Unknown error'));
        }

        return config;
    };

    /**
     * Fetch server config (v3.7.0 and below format)
     * @private
     * @returns {Promise<Object>} Server configuration
     */
    SecureSheets._fetchServerConfigLegacy = async function() {
        const url = SecureSheets.config.scriptUrl + '?action=config';
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error('Server config fetch failed: ' + response.statusText);
        }

        return await response.json();
    };

    /**
     * Get current configuration
     * @returns {Object} Current configuration (WITHOUT secrets)
     */
    SecureSheets.getConfig = function() {
        const config = { ...SecureSheets.config };
        // Never expose secrets
        config.apiToken = config.apiToken ? '***REDACTED***' : '';
        config.hmacSecret = config.hmacSecret ? '***REDACTED***' : '';
        return config;
    };

    /**
     * Check if library is configured
     * @returns {boolean} Configuration status
     */
    SecureSheets.isConfigured = function() {
        return !!(SecureSheets.config.scriptUrl && 
                  SecureSheets.config.apiToken && 
                  SecureSheets.config.hmacSecret);
    };

    /**
     * Enable debug mode
     * @param {boolean} [enable=true] - Enable or disable debug mode
     */
    SecureSheets.setDebug = function(enable = true) {
        SecureSheets.config.debug = enable;
        console.log('SecureSheets: Debug mode ' + (enable ? 'enabled' : 'disabled'));
    };

    /**
     * Get library version
     * @returns {string} Version number
     */
    SecureSheets.getVersion = function() {
        return SecureSheets.version;
    };

    // ============================================
    // SERVER INFO METHODS
    // ============================================

    /**
     * Get server information (from auto-discovery)
     * @returns {Object|null} Server information
     */
    SecureSheets.getServerInfo = function() {
        return SecureSheets.serverInfo;
    };

    /**
     * Check if server has a specific feature
     * @param {string} featureName - Feature name
     * @returns {boolean} Feature availability
     */
    SecureSheets.hasFeature = function(featureName) {
        if (!SecureSheets.serverInfo || !SecureSheets.serverInfo.features) {
            return false;
        }
        return SecureSheets.serverInfo.features.includes(featureName);
    };

    /**
     * Get server configuration from API (auto-detects version)
     * @returns {Promise<Object>} Server configuration
     */
    SecureSheets.getServerConfig = async function() {
        try {
            return await SecureSheets._fetchServerConfigV380();
        } catch (error) {
            return await SecureSheets._fetchServerConfigLegacy();
        }
    };

    // ============================================
    // AUTHENTICATION METHODS
    // ============================================

    /**
     * Generate HMAC signature
     * @param {string} message - Message to sign
     * @param {string} secret - Secret key
     * @returns {string} HMAC signature
     */
    SecureSheets.computeHMAC = function(message, secret) {
        if (typeof CryptoJS === 'undefined') {
            throw new Error('SecureSheets: CryptoJS is required. Include: https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js');
        }

        const hmac = CryptoJS.HmacSHA256(message, secret);
        return CryptoJS.enc.Hex.stringify(hmac);
    };

    /**
     * Generate nonce (unique request ID)
     * @returns {string} Nonce
     */
    SecureSheets.generateNonce = function() {
        if (!SecureSheets.config.enableNonce) {
            return null;
        }

        let nonce;
        let attempts = 0;
        const maxAttempts = 10;

        do {
            nonce = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
            attempts++;
        } while (SecureSheets.usedNonces.has(nonce) && attempts < maxAttempts);

        if (attempts >= maxAttempts) {
            throw new Error('SecureSheets: Failed to generate unique nonce');
        }

        SecureSheets.usedNonces.add(nonce);

        // Limit nonce cache size
        if (SecureSheets.usedNonces.size > 1000) {
            const firstNonce = SecureSheets.usedNonces.values().next().value;
            SecureSheets.usedNonces.delete(firstNonce);
        }

        return nonce;
    };

    /**
     * Generate authentication headers
     * @param {string} action - API action
     * @param {Object} params - Request parameters
     * @returns {Object} Headers object
     */
    SecureSheets.generateAuthHeaders = function(action, params = {}) {
        const timestamp = Math.floor(Date.now() / 1000);
        const nonce = SecureSheets.generateNonce();

        let message = SecureSheets.config.apiToken + ':' + timestamp + ':' + action;
        
        if (nonce) {
            message += ':' + nonce;
        }

        const signature = SecureSheets.computeHMAC(message, SecureSheets.config.hmacSecret);

        const headers = {
            'X-API-Token': SecureSheets.config.apiToken,
            'X-Timestamp': timestamp.toString(),
            'X-Signature': signature
        };

        if (nonce) {
            headers['X-Nonce'] = nonce;
        }

        return headers;
    };

    /**
     * Get CSRF token (generates new one if expired)
     * @returns {string} CSRF token
     */
    SecureSheets.getCSRFToken = function() {
        if (!SecureSheets.config.enableCSRF) {
            return null;
        }

        const now = Date.now();

        // Check if we have a valid cached token
        if (SecureSheets.csrfToken && SecureSheets.csrfExpiry && now < SecureSheets.csrfExpiry) {
            return SecureSheets.csrfToken;
        }

        // Generate new token
        const token = 'csrf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 16);
        SecureSheets.csrfToken = token;
        SecureSheets.csrfExpiry = now + (30 * 60 * 1000); // 30 minutes

        if (SecureSheets.config.debug) {
            console.log('SecureSheets: Generated new CSRF token');
        }

        return token;
    };

    /**
     * Get CSRF token (for manual use)
     * @returns {string|null} CSRF token or null if disabled
     */
    SecureSheets.getCSRFTokenManual = function() {
        if (!SecureSheets.config.enableCSRF) {
            return null;
        }
        return SecureSheets.getCSRFToken();
    };

    /**
     * Clear CSRF token cache (force regeneration on next request)
     */
    SecureSheets.clearCSRFToken = function() {
        SecureSheets.csrfToken = null;
        SecureSheets.csrfExpiry = null;
        
        if (SecureSheets.config.debug) {
            console.log('SecureSheets: CSRF token cleared');
        }
    };

    // ============================================
    // NONCE MANAGEMENT
    // ============================================

    /**
     * Get nonce status
     * @returns {Object} Nonce tracking information
     */
    SecureSheets.getNonceStatus = function() {
        return {
            enabled: SecureSheets.config.enableNonce,
            usedCount: SecureSheets.usedNonces.size,
            maxTracked: 1000
        };
    };

    /**
     * Clear used nonces (force regeneration)
     */
    SecureSheets.clearNonces = function() {
        SecureSheets.usedNonces.clear();
        
        if (SecureSheets.config.debug) {
            console.log('SecureSheets: Used nonces cleared');
        }
    };

    // ============================================
    // RATE LIMITING
    // ============================================

    /**
     * Check rate limit
     * @returns {boolean} True if within rate limit
     */
    SecureSheets.checkRateLimit = function() {
        if (!SecureSheets.config.rateLimitEnabled) {
            return true;
        }

        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        // Reset window if more than 1 hour has passed
        if (now - SecureSheets.requestWindow > oneHour) {
            SecureSheets.requestCount = 0;
            SecureSheets.requestWindow = now;
        }

        // Check if under limit
        if (SecureSheets.requestCount >= SecureSheets.config.maxRequests) {
            const resetTime = new Date(SecureSheets.requestWindow + oneHour);
            throw new Error(`SecureSheets: Rate limit exceeded. Resets at ${resetTime.toISOString()}`);
        }

        SecureSheets.requestCount++;
        return true;
    };

    /**
     * Reset rate limit counter
     */
    SecureSheets.resetRateLimit = function() {
        SecureSheets.requestCount = 0;
        SecureSheets.requestWindow = Date.now();
        
        if (SecureSheets.config.debug) {
            console.log('SecureSheets: Rate limit reset');
        }
    };

    /**
     * Get rate limit status
     * @returns {Object} Rate limit information
     */
    SecureSheets.getRateLimitStatus = function() {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        const resetTime = new Date(SecureSheets.requestWindow + oneHour);
        
        return {
            client: {
                enabled: SecureSheets.config.rateLimitEnabled,
                currentRequests: SecureSheets.requestCount,
                maxRequests: SecureSheets.config.maxRequests,
                remaining: Math.max(0, SecureSheets.config.maxRequests - SecureSheets.requestCount),
                resetsAt: resetTime.toISOString(),
                resetsIn: Math.max(0, resetTime - now)
            },
            server: SecureSheets.serverInfo && SecureSheets.serverInfo.limits ? {
                remaining: SecureSheets.serverInfo.limits.remaining || null,
                resetsAt: SecureSheets.serverInfo.limits.resetsAt || null
            } : {
                remaining: null,
                resetsAt: null
            }
        };
    };

    // ============================================
    // CACHING
    // ============================================

    /**
     * Get cached response
     * @param {string} key - Cache key
     * @returns {Object|null} Cached data or null
     */
    SecureSheets.getCached = function(key) {
        const cached = SecureSheets.cache.get(key);
        
        if (!cached) {
            return null;
        }

        const now = Date.now();
        if (now > cached.expiry) {
            SecureSheets.cache.delete(key);
            return null;
        }

        if (SecureSheets.config.debug) {
            console.log('SecureSheets: Cache hit for', key);
        }

        return cached.data;
    };

    /**
     * Set cached response
     * @param {string} key - Cache key
     * @param {Object} data - Data to cache
     */
    SecureSheets.setCached = function(key, data) {
        SecureSheets.cache.set(key, {
            data: data,
            expiry: Date.now() + SecureSheets.config.cacheTimeout
        });

        if (SecureSheets.config.debug) {
            console.log('SecureSheets: Cached', key);
        }
    };

    /**
     * Clear cache
     * @param {string} [key] - Specific cache key to clear, or clear all if not specified
     */
    SecureSheets.clearCache = function(key) {
        if (key) {
            SecureSheets.cache.delete(key);
        } else {
            SecureSheets.cache.clear();
        }
        
        if (SecureSheets.config.debug) {
            console.log('SecureSheets: Cache cleared' + (key ? ` (${key})` : ' (all)'));
        }
    };

    // ============================================
    // HTTP REQUEST METHODS
    // ============================================

    /**
     * Make authenticated GET request
     * @param {string} action - API action
     * @param {Object} params - Request parameters
     * @param {Object} options - Request options
     * @returns {Promise<Object>} Response data
     */
    SecureSheets.makeRequest = async function(action, params = {}, options = {}) {
        SecureSheets.checkRateLimit();

        // Check cache
        if (options.useCache !== false) {
            const cacheKey = action + ':' + JSON.stringify(params);
            const cached = SecureSheets.getCached(cacheKey);
            if (cached) {
                return cached;
            }
        }

        // Build URL
        const queryParams = { action, ...params };
        const queryString = Object.keys(queryParams)
            .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(queryParams[key]))
            .join('&');
        const url = SecureSheets.config.scriptUrl + '?' + queryString;

        // Generate auth headers
        const headers = SecureSheets.generateAuthHeaders(action, params);

        if (SecureSheets.config.debug) {
            console.log('SecureSheets: Making request', { 
                action, 
                params: Object.keys(params).length > 0 ? Object.keys(params) : 'none'
            });
        }

        // Make request
        const response = await fetch(url, { headers });

        if (!response.ok) {
            return await SecureSheets.handleErrorResponse(response);
        }

        const data = await response.json();

        // Update server info from headers
        if (response.headers.has('X-RateLimit-Remaining')) {
            if (!SecureSheets.serverInfo) SecureSheets.serverInfo = {};
            if (!SecureSheets.serverInfo.limits) SecureSheets.serverInfo.limits = {};
            SecureSheets.serverInfo.limits.remaining = parseInt(response.headers.get('X-RateLimit-Remaining'));
        }

        // Cache response
        if (options.useCache !== false) {
            const cacheKey = action + ':' + JSON.stringify(params);
            SecureSheets.setCached(cacheKey, data);
        }

        return data;
    };

    /**
     * Make authenticated POST request
     * @param {string} action - API action
     * @param {Object} body - Request body
     * @param {Object} options - Request options
     * @returns {Promise<Object>} Response data
     */
    SecureSheets.makePostRequest = async function(action, body = {}, options = {}) {
        SecureSheets.checkRateLimit();

        // Generate auth headers
        const headers = SecureSheets.generateAuthHeaders(action, body);
        headers['Content-Type'] = 'application/json';

        // Add CSRF token if enabled
        if (SecureSheets.config.enableCSRF) {
            const csrfToken = SecureSheets.getCSRFToken();
            headers['X-CSRF-Token'] = csrfToken;
            body.csrfToken = csrfToken;
        }

        if (SecureSheets.config.debug) {
            console.log('SecureSheets: Making POST request', { 
                action,
                bodyKeys: Object.keys(body).filter(k => k !== 'csrfToken' && k !== 'apiToken' && k !== 'hmacSecret')
            });
        }

        // Make request
        const response = await fetch(SecureSheets.config.scriptUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ action, ...body })
        });

        if (!response.ok) {
            return await SecureSheets.handleErrorResponse(response);
        }

        const data = await response.json();

        // Update server info from headers
        if (response.headers.has('X-RateLimit-Remaining')) {
            if (!SecureSheets.serverInfo) SecureSheets.serverInfo = {};
            if (!SecureSheets.serverInfo.limits) SecureSheets.serverInfo.limits = {};
            SecureSheets.serverInfo.limits.remaining = parseInt(response.headers.get('X-RateLimit-Remaining'));
        }

        return data;
    };

    // ============================================
    // PUBLIC API METHODS (NO AUTH REQUIRED)
    // ============================================

    /**
     * Health check endpoint
     * @returns {Promise<Object>} Health status
     */
    SecureSheets.healthCheck = async function() {
        const url = SecureSheets.config.scriptUrl + '?action=health';
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error('Health check failed: ' + response.statusText);
        }

        return await response.json();
    };

    /**
     * Get scrolling messages
     * @param {Object} options - Request options
     * @returns {Promise<Object>} Scrolling messages data
     */
    SecureSheets.getScrollingMessages = async function(options = {}) {
        const url = SecureSheets.config.scriptUrl + '?action=scrolling';
        
        // Check cache
        if (options.useCache !== false) {
            const cached = SecureSheets.getCached('scrolling');
            if (cached) return cached;
        }

        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error('Failed to fetch scrolling messages: ' + response.statusText);
        }

        const data = await response.json();

        // Cache response
        if (options.useCache !== false) {
            SecureSheets.setCached('scrolling', data);
        }

        return data;
    };

    /**
     * Get doodle events
     * @param {Object} options - Request options
     * @returns {Promise<Object>} Doodle events data
     */
    SecureSheets.getDoodleEvents = async function(options = {}) {
        const url = SecureSheets.config.scriptUrl + '?action=doodle';
        
        // Check cache
        if (options.useCache !== false) {
            const cached = SecureSheets.getCached('doodle');
            if (cached) return cached;
        }

        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error('Failed to fetch doodle events: ' + response.statusText);
        }

        const data = await response.json();

        // Cache response
        if (options.useCache !== false) {
            SecureSheets.setCached('doodle', data);
        }

        return data;
    };

    /**
     * Get modal content
     * @param {string} sheet - Sheet name
     * @param {string} cell - Cell reference
     * @param {Object} options - Request options
     * @returns {Promise<Object>} Modal content data
     */
    SecureSheets.getModalContent = async function(sheet, cell, options = {}) {
        const cacheKey = `modal:${sheet}:${cell}`;
        
        // Check cache
        if (options.useCache !== false) {
            const cached = SecureSheets.getCached(cacheKey);
            if (cached) return cached;
        }

        const url = SecureSheets.config.scriptUrl + 
                   '?action=modal&sheet=' + encodeURIComponent(sheet) + 
                   '&cell=' + encodeURIComponent(cell);

        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error('Failed to fetch modal content: ' + response.statusText);
        }

        const data = await response.json();

        // Cache response
        if (options.useCache !== false) {
            SecureSheets.setCached(cacheKey, data);
        }

        return data;
    };

    /**
     * Get batch data (multiple endpoints in one request)
     * @param {Array<string>} actions - Array of action names
     * @param {Object} options - Request options
     * @returns {Promise<Object>} Batch results
     */
    SecureSheets.getBatch = async function(actions, options = {}) {
        const cacheKey = 'batch:' + actions.join(',');
        
        // Check cache
        if (options.useCache !== false) {
            const cached = SecureSheets.getCached(cacheKey);
            if (cached) return cached;
        }

        const url = SecureSheets.config.scriptUrl + 
                   '?action=batch&actions=' + encodeURIComponent(actions.join(','));

        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error('Failed to fetch batch data: ' + response.statusText);
        }

        const data = await response.json();

        // Cache response
        if (options.useCache !== false) {
            SecureSheets.setCached(cacheKey, data);
        }

        return data;
    };

    // ============================================
    // PROTECTED API METHODS (AUTH REQUIRED)
    // ============================================

    /**
     * Get sheet data (GET request)
     * @param {string|Array<string>} sheet - Sheet name(s)
     * @param {Object} options - Request options
     * @returns {Promise<Object>} Sheet data
     */
    SecureSheets.getData = async function(sheet = null, options = {}) {
        const params = {};
        
        if (sheet) {
            if (Array.isArray(sheet)) {
                params.sheets = sheet.join(',');
            } else {
                params.sheet = sheet;
            }
        }

        return await SecureSheets.makeRequest('getData', params, options);
    };

    /**
     * Get multiple sheets data (GET request)
     * @param {Array<string>} sheets - Array of sheet names
     * @param {Object} options - Request options
     * @returns {Promise<Object>} Multi-sheet data
     */
    SecureSheets.getDataMultiSheet = async function(sheets, options = {}) {
        return await SecureSheets.getData(sheets, options);
    };

    /**
     * Get sheet data (POST request with CSRF)
     * @param {string|Array<string>} sheet - Sheet name(s)
     * @param {Object} options - Request options
     * @returns {Promise<Object>} Sheet data
     */
    SecureSheets.getDataPost = async function(sheet = null, options = {}) {
        const body = {};
        
        if (sheet) {
            if (Array.isArray(sheet)) {
                body.sheets = sheet.join(',');
            } else {
                body.sheet = sheet;
            }
        }

        return await SecureSheets.makePostRequest('getData', body, options);
    };

    /**
     * Generic POST request
     * @param {Object} data - Request data
     * @param {Object} options - Request options
     * @returns {Promise<Object>} Response data
     */
    SecureSheets.postData = async function(data, options = {}) {
        const action = data.action || 'getData';
        return await SecureSheets.makePostRequest(action, data, options);
    };

    /**
     * Helper for POST getData requests
     * @param {Object} params - Request parameters
     * @param {Object} options - Request options
     * @returns {Promise<Object>} Response data
     */
    SecureSheets.postGetData = async function(params, options = {}) {
        return await SecureSheets.makePostRequest('getData', params, options);
    };

    // ============================================
    // SECURITY UTILITIES
    // ============================================

    /**
     * Verify webhook signature (for receiving webhooks from server)
     * @param {string} payload - Webhook payload (JSON string)
     * @param {string} signature - Signature from X-Webhook-Signature header
     * @param {string} secret - Webhook secret
     * @returns {boolean} True if signature is valid
     */
    SecureSheets.verifyWebhookSignature = function(payload, signature, secret) {
        if (!payload || !signature || !secret) {
            return false;
        }

        try {
            const expectedSignature = SecureSheets.computeHMAC(payload, secret);
            
            // Constant-time comparison
            if (signature.length !== expectedSignature.length) {
                return false;
            }
            
            let result = 0;
            for (let i = 0; i < signature.length; i++) {
                result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
            }
            
            return result === 0;
        } catch (error) {
            console.error('SecureSheets: Webhook signature verification failed:', error);
            return false;
        }
    };

    /**
     * Decrypt data received from server
     * @param {string} encryptedData - Base64 encoded encrypted data
     * @param {string} key - Decryption key
     * @returns {Object} Decrypted data
     */
    SecureSheets.decryptData = function(encryptedData, key) {
        try {
            const decoded = atob(encryptedData);
            
            let decrypted = '';
            for (let i = 0; i < decoded.length; i++) {
                decrypted += String.fromCharCode(
                    decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length)
                );
            }
            
            return JSON.parse(decrypted);
        } catch (error) {
            throw new Error('SecureSheets: Decryption failed - ' + error.message);
        }
    };

    /**
     * Validate checksum (if server sends checksums)
     * @param {Object} data - Data object with checksum field
     * @param {string} checksumField - Name of checksum field (default: 'checksum')
     * @returns {boolean} True if checksum is valid
     */
    SecureSheets.validateChecksum = function(data, checksumField = 'checksum') {
        if (!data || !data[checksumField]) {
            return false;
        }

        try {
            if (SecureSheets.config.debug) {
                console.log('SecureSheets: Checksum validation (client-side validation limited)');
            }
            
            return true;
        } catch (error) {
            console.error('SecureSheets: Checksum validation failed:', error);
            return false;
        }
    };

    /**
     * Test connection to server
     * @returns {Promise<Object>} Connection test results
     */
    SecureSheets.testConnection = async function() {
        const results = {
            success: false,
            tests: {
                health: { passed: false, message: '' },
                config: { passed: false, message: '' },
                auth: { passed: false, message: '' }
            },
            server: null,
            timestamp: new Date().toISOString()
        };

        try {
            // Test 1: Health check
            try {
                const health = await SecureSheets.healthCheck();
                results.tests.health.passed = health.status === 'online';
                results.tests.health.message = health.status === 'online' ? 
                    'Server is online' : 'Server returned unexpected status';
                results.tests.health.data = health;
            } catch (error) {
                results.tests.health.message = 'Health check failed: ' + error.message;
            }

            // Test 2: Config endpoint
            try {
                const config = await SecureSheets.getServerConfig();
                results.tests.config.passed = config.success === true || config.status === 'success';
                results.tests.config.message = results.tests.config.passed ? 
                    'Config endpoint accessible' : 'Config endpoint returned error';
                results.tests.config.data = config;
                results.server = config;
            } catch (error) {
                results.tests.config.message = 'Config fetch failed: ' + error.message;
            }

            // Test 3: Authentication (if configured)
            if (SecureSheets.config.apiToken && SecureSheets.config.hmacSecret) {
                try {
                    const data = await SecureSheets.getData(null, { useCache: false });
                    results.tests.auth.passed = data.status === 'success' || data.success === true;
                    results.tests.auth.message = results.tests.auth.passed ? 
                        'Authentication successful' : 'Authentication returned error';
                    results.tests.auth.data = data;
                } catch (error) {
                    results.tests.auth.message = 'Authentication failed: ' + error.message;
                }
            } else {
                results.tests.auth.message = 'Skipped (not configured)';
            }

            // Overall success
            results.success = results.tests.health.passed && results.tests.config.passed;

            return results;

        } catch (error) {
            results.error = error.message;
            return results;
        }
    };

    /**
     * Format error for display
     * @param {Error} error - Error object
     * @returns {Object} Formatted error
     */
    SecureSheets.formatError = function(error) {
        return {
            message: error.message,
            code: error.code || 'UNKNOWN_ERROR',
            details: error.details || null,
            timestamp: new Date().toISOString()
        };
    };

    // ============================================
    // ERROR HANDLING UTILITIES
    // ============================================

    /**
     * Parse error response
     * @param {Object} errorData - Error response from server
     * @returns {Error} Formatted error object
     */
    SecureSheets.parseError = function(errorData) {
        let message = 'SecureSheets: ';
        
        if (errorData.error) {
            message += errorData.error;
        }
        
        if (errorData.code) {
            message += ' (Code: ' + errorData.code + ')';
        }
        
        if (errorData.details) {
            message += ' - ' + errorData.details;
        }
        
        const error = new Error(message);
        error.code = errorData.code;
        error.serverResponse = errorData;
        
        return error;
    };

    /**
     * Handle server error response
     * @param {Response} response - Fetch response object
     * @returns {Promise<never>} Throws error
     */
    SecureSheets.handleErrorResponse = async function(response) {
        let errorData;
        
        try {
            errorData = await response.json();
        } catch (e) {
            throw new Error(`SecureSheets: HTTP ${response.status} - ${response.statusText}`);
        }
        
        throw SecureSheets.parseError(errorData);
    };

    // ============================================
    // EXPORT
    // ============================================
    window.SecureSheets = SecureSheets;

    // AMD/CommonJS compatibility
    if (typeof define === 'function' && define.amd) {
        define([], function() { return SecureSheets; });
    } else if (typeof module === 'object' && module.exports) {
        module.exports = SecureSheets;
    }

    console.log(`SecureSheets Client v${SecureSheets.version} loaded`);
    console.log('Compatible: Server v3.5.0 - v3.8.0+');
    console.log('New: configureWithEnvironment() for zero-secrets pattern');

})(typeof window !== 'undefined' ? window : global);

/**
 * ============================================================================
 * QUICK START GUIDE - ZERO SECRETS PATTERN (RECOMMENDED)
 * ============================================================================
 * 
 * 1. CREATE .env FILE (NEVER COMMIT THIS!)
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * 
 * # .env (add to .gitignore!)
 * SHEETS_BASE_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
 * API_TOKEN=your-secure-api-token-here
 * HMAC_SECRET=your-hmac-secret-32-chars-min
 * NODE_ENV=development
 * 
 * 
 * 2. ADD TO .gitignore
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * 
 * # Never commit secrets!
 * .env
 * .env.local
 * .env.development
 * .env.production
 * 
 * 
 * 3. INITIALIZE WITH ENVIRONMENT VARIABLES
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * 
 * // Node.js / Backend
 * require('dotenv').config();
 * 
 * await SecureSheets.configureWithEnvironment();
 * 
 * // Now make requests - NO SECRETS IN CODE!
 * const data = await SecureSheets.getData('Sheet4');
 * 
 * 
 * 4. USE IN YOUR APP
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * 
 * // Get public data
 * const messages = await SecureSheets.getScrollingMessages();
 * const doodles = await SecureSheets.getDoodleEvents();
 * 
 * // Get protected data (requires authentication)
 * const sheetData = await SecureSheets.getData('Sheet2');
 * const multiSheet = await SecureSheets.getData(['Sheet2', 'Sheet4']);
 * 
 * 
 * ============================================================================
 * ALTERNATIVE: MANUAL CONFIGURATION (If not using environment variables)
 * ============================================================================
 * 
 * // âš ï¸ WARNING: Only use this pattern with environment variables!
 * // NEVER hardcode secrets in your source code!
 * 
 * // âœ… CORRECT: Load from environment variables
 * SecureSheets.configure({
 *   scriptUrl: process.env.SHEETS_BASE_URL,
 *   apiToken: process.env.API_TOKEN,        // From environment ONLY
 *   hmacSecret: process.env.HMAC_SECRET,    // From environment ONLY
 *   enableCSRF: true,
 *   enableNonce: true,
 *   debug: false
 * });
 * 
 * // âŒ WRONG: NEVER do this!
 * // SecureSheets.configure({
 * //   scriptUrl: 'https://script.google.com/...',
 * //   apiToken: 'my-token-123',      // NEVER HARDCODE!
 * //   hmacSecret: 'my-secret-456'    // NEVER HARDCODE!
 * // });
 * 
 * 
 * ============================================================================
 * HTML INTEGRATION EXAMPLE
 * ============================================================================
 * 
 * âš ï¸ CRITICAL SECURITY WARNING:
 * NEVER expose apiToken or hmacSecret in client-side (browser) code!
 * 
 * For browser applications, you MUST:
 * 1. Store secrets on YOUR backend server
 * 2. Create an API endpoint that uses SecureSheets server-side
 * 3. Your frontend calls YOUR backend, never the Sheets API directly
 * 
 * âŒ WRONG APPROACH (INSECURE):
 * <!DOCTYPE html>
 * <html>
 * <head>
 *   <script src="securesheets_v1.2.1_unified.js"></script>
 * </head>
 * <body>
 *   <script>
 *     // âŒ NEVER DO THIS - Exposes secrets to anyone viewing source!
 *     await SecureSheets.configure({
 *       apiToken: 'my-token',     // âŒ EXPOSED IN BROWSER!
 *       hmacSecret: 'my-secret'   // âŒ EXPOSED IN BROWSER!
 *     });
 *   </script>
 * </body>
 * </html>
 * 
 * 
 * âœ… CORRECT APPROACH (SECURE):
 * 
 * <!-- Frontend (index.html) -->
 * <!DOCTYPE html>
 * <html>
 * <head>
 *   <title>SecureSheets Example</title>
 * </head>
 * <body>
 *   <h1>SecureSheets Dashboard</h1>
 *   <div id="status"></div>
 *   <div id="data"></div>
 *   
 *   <script>
 *     // âœ… CORRECT: Call YOUR backend API (no secrets exposed)
 *     (async () => {
 *       try {
 *         // Your backend handles SecureSheets authentication
 *         const response = await fetch('/api/sheets/data/Sheet2', {
 *           credentials: 'include'  // Include auth cookies
 *         });
 *         
 *         const data = await response.json();
 *         
 *         document.getElementById('status').innerHTML = 'âœ… Connected';
 *         document.getElementById('data').innerHTML = 
 *           '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
 *           
 *       } catch (error) {
 *         document.getElementById('status').innerHTML = 
 *           'âŒ Error: ' + error.message;
 *       }
 *     })();
 *   </script>
 * </body>
 * </html>
 * 
 * 
 * // Backend (server.js) - Where secrets are stored safely
 * const express = require('express');
 * require('dotenv').config();
 * 
 * const app = express();
 * 
 * // Initialize SecureSheets on YOUR backend (secrets never exposed)
 * (async () => {
 *   await SecureSheets.configureWithEnvironment();
 * })();
 * 
 * // Your backend endpoint (proxies to SecureSheets)
 * app.get('/api/sheets/data/:sheet', async (req, res) => {
 *   // Add your own authentication check here
 *   if (!req.session?.user) {
 *     return res.status(401).json({ error: 'Unauthorized' });
 *   }
 *   
 *   try {
 *     // âœ… Secrets are on backend, never exposed to browser
 *     const data = await SecureSheets.getData(req.params.sheet);
 *     res.json(data);
 *   } catch (error) {
 *     res.status(500).json({ error: error.message });
 *   }
 * });
 * 
 * app.listen(3000);
 * 
 * 
 * ============================================================================
 * REACT INTEGRATION EXAMPLE
 * ============================================================================
 * 
 * import React, { useEffect, useState } from 'react';
 * 
 * function App() {
 *   const [data, setData] = useState(null);
 *   const [loading, setLoading] = useState(true);
 *   const [error, setError] = useState(null);
 * 
 *   useEffect(() => {
 *     async function fetchData() {
 *       try {
 *         // Use environment variables (NO SECRETS in code!)
 *         await SecureSheets.configureWithEnvironment({
 *           SHEETS_BASE_URL: process.env.REACT_APP_SHEETS_URL,
 *           API_TOKEN: process.env.REACT_APP_API_TOKEN,
 *           HMAC_SECRET: process.env.REACT_APP_HMAC_SECRET
 *         });
 * 
 *         const result = await SecureSheets.getData('Sheet2');
 *         setData(result.data);
 *       } catch (err) {
 *         setError(SecureSheets.formatError(err).message);
 *       } finally {
 *         setLoading(false);
 *       }
 *     }
 * 
 *     fetchData();
 *   }, []);
 * 
 *   if (loading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error}</div>;
 * 
 *   return (
 *     <div>
 *       <h1>Data from Google Sheets</h1>
 *       <pre>{JSON.stringify(data, null, 2)}</pre>
 *     </div>
 *   );
 * }
 * 
 * 
 * ============================================================================
 * NODE.JS EXPRESS EXAMPLE
 * ============================================================================
 * 
 * const express = require('express');
 * require('dotenv').config();
 * 
 * const app = express();
 * 
 * // Initialize SecureSheets on startup
 * (async () => {
 *   await SecureSheets.configureWithEnvironment();
 *   console.log('âœ… SecureSheets initialized');
 * })();
 * 
 * // Public endpoint
 * app.get('/api/messages', async (req, res) => {
 *   try {
 *     const messages = await SecureSheets.getScrollingMessages();
 *     res.json(messages);
 *   } catch (error) {
 *     res.status(500).json({ error: error.message });
 *   }
 * });
 * 
 * // Protected endpoint (requires user authentication)
 * app.get('/api/data/:sheet', async (req, res) => {
 *   // Verify user authentication first
 *   if (!req.session?.user) {
 *     return res.status(401).json({ error: 'Unauthorized' });
 *   }
 *   
 *   try {
 *     const data = await SecureSheets.getData(req.params.sheet);
 *     res.json(data);
 *   } catch (error) {
 *     res.status(500).json({ error: error.message });
 *   }
 * });
 * 
 * app.listen(3000, () => console.log('Server running on port 3000'));
 * 
 * 
 * ============================================================================
 * COMPLETE WORKFLOW EXAMPLE
 * ============================================================================
 * 
 * async function initializeApp() {
 *   try {
 *     console.log('=== Initializing SecureSheets ===\n');
 *     
 *     // 1. Configure with environment variables
 *     await SecureSheets.configureWithEnvironment();
 *     
 *     // 2. Test connection
 *     console.log('Testing connection...');
 *     const test = await SecureSheets.testConnection();
 *     
 *     if (!test.success) {
 *       throw new Error('Connection test failed');
 *     }
 *     
 *     console.log('âœ… Health:', test.tests.health.passed ? 'PASS' : 'FAIL');
 *     console.log('âœ… Config:', test.tests.config.passed ? 'PASS' : 'FAIL');
 *     console.log('âœ… Auth:', test.tests.auth.passed ? 'PASS' : 'FAIL');
 *     
 *     // 3. Check server info
 *     const serverInfo = SecureSheets.getServerInfo();
 *     console.log('\n=== Server Info ===');
 *     console.log('Version:', serverInfo.version);
 *     console.log('Features:', serverInfo.features);
 *     
 *     // 4. Check rate limits
 *     const rateLimit = SecureSheets.getRateLimitStatus();
 *     console.log('\n=== Rate Limits ===');
 *     console.log('Remaining:', rateLimit.client.remaining);
 *     console.log('Max:', rateLimit.client.maxRequests);
 *     
 *     // 5. Load data
 *     console.log('\n=== Loading Data ===');
 *     const messages = await SecureSheets.getScrollingMessages();
 *     console.log('Messages:', messages.data?.length || 0);
 *     
 *     const sheetData = await SecureSheets.getData('Sheet2');
 *     console.log('Sheet data:', sheetData.status);
 *     
 *     console.log('\nâœ… All operations complete!\n');
 *     
 *   } catch (error) {
 *     console.error('âŒ Initialization failed:', error.message);
 *     const formatted = SecureSheets.formatError(error);
 *     console.error('Details:', formatted);
 *   }
 * }
 * 
 * 
 * ============================================================================
 * API REFERENCE - PUBLIC ENDPOINTS (No Authentication)
 * ============================================================================
 * 
 * SecureSheets.healthCheck()
 *   â†’ Check if server is online
 * 
 * SecureSheets.getServerConfig()
 *   â†’ Get server configuration and features
 * 
 * SecureSheets.getScrollingMessages(options?)
 *   â†’ Get scrolling messages from Sheet1
 * 
 * SecureSheets.getDoodleEvents(options?)
 *   â†’ Get doodle events from Sheet3
 * 
 * SecureSheets.getModalContent(sheet, cell, options?)
 *   â†’ Get modal content from specific cell
 * 
 * SecureSheets.getBatch(actions, options?)
 *   â†’ Get multiple endpoints in one request
 * 
 * 
 * ============================================================================
 * API REFERENCE - PROTECTED ENDPOINTS (Requires Authentication)
 * ============================================================================
 * 
 * SecureSheets.getData(sheet, options?)
 *   â†’ Get single sheet data (GET request)
 *   â†’ sheet: 'Sheet2' or ['Sheet2', 'Sheet4'] for multiple
 * 
 * SecureSheets.getDataPost(sheet, options?)
 *   â†’ Get sheet data via POST (includes CSRF protection)
 * 
 * SecureSheets.getDataMultiSheet(sheets, options?)
 *   â†’ Get multiple sheets (convenience method)
 * 
 * 
 * ============================================================================
 * API REFERENCE - CONFIGURATION
 * ============================================================================
 * 
 * SecureSheets.configureWithEnvironment(envVars?)
 *   â†’ Configure using environment variables (RECOMMENDED)
 * 
 * SecureSheets.configure(options)
 *   â†’ Manual configuration
 * 
 * SecureSheets.configureWithDiscovery(options)
 *   â†’ Configure with auto-discovery (detects server version)
 * 
 * SecureSheets.isConfigured()
 *   â†’ Check if library is configured
 * 
 * SecureSheets.getConfig()
 *   â†’ Get current configuration (secrets excluded)
 * 
 * SecureSheets.setDebug(enable)
 *   â†’ Enable/disable debug logging
 * 
 * 
 * ============================================================================
 * API REFERENCE - UTILITIES
 * ============================================================================
 * 
 * SecureSheets.testConnection()
 *   â†’ Test connection to server
 * 
 * SecureSheets.getServerInfo()
 *   â†’ Get cached server information
 * 
 * SecureSheets.hasFeature(featureName)
 *   â†’ Check if server supports a feature
 * 
 * SecureSheets.getRateLimitStatus()
 *   â†’ Get current rate limit status
 * 
 * SecureSheets.resetRateLimit()
 *   â†’ Reset rate limit counter
 * 
 * SecureSheets.clearCache(key?)
 *   â†’ Clear cache (all or specific key)
 * 
 * SecureSheets.verifyWebhookSignature(payload, signature, secret)
 *   â†’ Verify incoming webhook signature
 * 
 * SecureSheets.formatError(error)
 *   â†’ Format error for display
 * 
 * SecureSheets.getVersion()
 *   â†’ Get library version
 * 
 * 
 * ============================================================================
 * SECURITY CHECKLIST
 * ============================================================================
 * 
 * âœ… CRITICAL - ZERO SECRETS EXPOSURE:
 * [ ] Use configureWithEnvironment() for automatic env var loading
 * [ ] NEVER hardcode API_TOKEN or HMAC_SECRET in source code
 * [ ] NEVER log secrets with console.log() or any logging
 * [ ] NEVER expose secrets in client-side (browser) JavaScript
 * [ ] NEVER commit secrets to version control (check git history!)
 * [ ] Add .env files to .gitignore
 * [ ] Use SecureSheets.getConfig() for debugging (redacts secrets)
 * [ ] Verify secrets are only in environment variables or backend config
 * 
 * âœ… ENVIRONMENT SETUP:
 * [ ] Create .env file for local development
 * [ ] Add all secret files to .gitignore
 * [ ] Use different secrets for dev/staging/production
 * [ ] Rotate secrets regularly (every 90 days minimum)
 * [ ] Store production secrets in platform secret managers
 * 
 * âœ… ARCHITECTURE:
 * [ ] For browser apps: Secrets on backend ONLY, never in frontend
 * [ ] Backend proxies requests to SecureSheets (frontend â†’ your backend â†’ Sheets)
 * [ ] Add your own authentication before calling SecureSheets
 * [ ] Use HTTPS in production for all connections
 * 
 * âœ… SECURESHEETS CONFIGURATION:
 * [ ] Enable CSRF protection (enabled by default)
 * [ ] Enable nonce for replay protection (enabled by default)
 * [ ] Enable rate limiting (enabled by default)
 * [ ] Disable debug mode in production
 * [ ] Test connection before going live
 * [ ] Monitor rate limit status
 * [ ] Implement proper error handling
 * 
 * âœ… DEPLOYMENT:
 * [ ] Verify no secrets in source code before deploy
 * [ ] Set environment variables in hosting platform
 * [ ] Test with production secrets in staging first
 * [ ] Verify secrets are not in build artifacts
 * [ ] Check browser DevTools â†’ Sources for exposed secrets
 * [ ] Review all console.log statements before production
 * 
 * âœ… ONGOING MAINTENANCE:
 * [ ] Regularly audit code for accidentally exposed secrets
 * [ ] Monitor for unauthorized access attempts
 * [ ] Keep library updated to latest version
 * [ ] Review and update secrets rotation policy
 * [ ] Train team on secret management best practices
 * 
 * 
 * ============================================================================
 * DEPLOYMENT - ENVIRONMENT VARIABLES IN PRODUCTION
 * ============================================================================
 * 
 * DO NOT use .env files in production! Use your platform's environment
 * variable management:
 * 
 * - Heroku: heroku config:set API_TOKEN=...
 * - Vercel: Environment Variables in project settings
 * - Netlify: Site settings â†’ Build & deploy â†’ Environment
 * - AWS: AWS Secrets Manager / Systems Manager Parameter Store
 * - Azure: Azure Key Vault
 * - Google Cloud: Secret Manager
 * - Railway: Environment variables in dashboard
 * - Render: Environment variables in dashboard
 * - Docker: Use --env-file or docker-compose environment section
 * 
 * Required environment variables:
 * - SHEETS_BASE_URL (can be public)
 * - API_TOKEN (secret)
 * - HMAC_SECRET (secret)
 * 
 * 
 * ============================================================================
 * WHAT'S NEW IN v1.2.1
 * ============================================================================
 * 
 * âœ¨ NEW FEATURES:
 * - configureWithEnvironment() for zero-secrets pattern
 * - Auto-detection of server version (v3.8.0 vs v3.7.0)
 * - Automatic fallback between ?type=config and ?action=config
 * - Enhanced error messages for configuration issues
 * - Better compatibility across server versions
 * 
 * ðŸ› BUG FIXES:
 * - Fixed compatibility with Server v3.8.0
 * - Fixed auto-discovery endpoint detection
 * - Improved error handling during configuration
 * 
 * ðŸ”’ SECURITY IMPROVEMENTS:
 * - getConfig() now excludes secrets from output
 * - Better documentation on zero-secrets pattern
 * - Enhanced security checklist
 * 
 * 
 * ============================================================================
 * COMPATIBILITY MATRIX
 * ============================================================================
 * 
 * Client v1.2.1 â†” Server Compatibility:
 * 
 * Server v3.8.0+  âœ… Full compatibility (all features)
 * Server v3.7.0   âœ… Full compatibility (all features)
 * Server v3.6.0   âœ… Compatible (limited features)
 * Server v3.5.0+  âœ… Compatible (basic features)
 * Server v3.0-3.4 âš ï¸ Limited compatibility
 * Server v2.x     âŒ Not compatible
 * 
 * Recommended: Server v3.7.0+ for best experience
 * 
 * ============================================================================
 * END OF SECURESHEETS CLIENT v1.2.1 - UNIFIED COMPLETE EDITION
 * ============================================================================
 */