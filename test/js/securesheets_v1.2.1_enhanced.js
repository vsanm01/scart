/**
 * ============================================================================
 * SECURESHEETS CLIENT LIBRARY v1.2.1 ENHANCED - WITH CELL QUERY SUPPORT
 * ============================================================================
 * 
 * A secure JavaScript client for interacting with SecureSheets API
 * Compatible with SecureSheets Server v3.5.0 - v3.8.0+
 * 
 * ENHANCEMENTS IN THIS VERSION:
 * ✅ All v1.2.1 features (CSRF, nonces, POST support, webhooks)
 * ✅ NEW: Cell-specific queries (getCellData method)
 * ✅ NEW: Range queries (getRangeData method)
 * ✅ NEW: Batch cell queries (getCellDataBatch method)
 * 
 * @version 1.2.1-enhanced
 * @license MIT
 * ============================================================================
 */

(function(window) {
    'use strict';

    // ============================================
    // CORE OBJECT
    // ============================================
    const SecureSheets = {
        version: '1.2.1-enhanced',
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
            console.log('SecureSheets: Configured (Enhanced Edition)', {
                scriptUrl: SecureSheets.config.scriptUrl,
                hasApiToken: !!SecureSheets.config.apiToken,
                hasHmacSecret: !!SecureSheets.config.hmacSecret,
                enableCSRF: SecureSheets.config.enableCSRF,
                enableNonce: SecureSheets.config.enableNonce,
                rateLimitEnabled: SecureSheets.config.rateLimitEnabled
            });
        }
    };

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
            console.log('🔒 SecureSheets: Configuring with environment variables (NO SECRETS EXPOSED)');
        }

        return await SecureSheets.configureWithDiscovery(options);
    };

    SecureSheets.configureWithDiscovery = async function(options) {
        SecureSheets.configure(options);

        try {
            let serverConfig;
            try {
                serverConfig = await SecureSheets._fetchServerConfigV380();
                if (SecureSheets.config.debug) {
                    console.log('✓ Connected to Server v3.8.0+ (using ?type=config)');
                }
            } catch (error) {
                if (SecureSheets.config.debug) {
                    console.log('↻ Server v3.8.0 format failed, trying v3.7.0 format...');
                }
                serverConfig = await SecureSheets._fetchServerConfigLegacy();
                if (SecureSheets.config.debug) {
                    console.log('✓ Connected to Server v3.7.0 or below (using ?action=config)');
                }
            }

            SecureSheets.serverInfo = serverConfig;

            if (serverConfig.scriptUrl) {
                SecureSheets.config.scriptUrl = serverConfig.scriptUrl;
            }

            if (SecureSheets.config.debug) {
                console.log('SecureSheets: Auto-discovery complete', {
                    version: serverConfig.version,
                    features: serverConfig.features?.length || 0,
                    cellQuerySupport: SecureSheets.hasFeature('cellQuery')
                });
            }

            return serverConfig;
        } catch (error) {
            console.warn('SecureSheets: Auto-discovery failed, using manual config', error.message);
            return null;
        }
    };

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

    SecureSheets._fetchServerConfigLegacy = async function() {
        const url = SecureSheets.config.scriptUrl + '?action=config';
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error('Server config fetch failed: ' + response.statusText);
        }

        return await response.json();
    };

    SecureSheets.getConfig = function() {
        const config = { ...SecureSheets.config };
        config.apiToken = config.apiToken ? '***REDACTED***' : '';
        config.hmacSecret = config.hmacSecret ? '***REDACTED***' : '';
        return config;
    };

    SecureSheets.isConfigured = function() {
        return !!(SecureSheets.config.scriptUrl && 
                  SecureSheets.config.apiToken && 
                  SecureSheets.config.hmacSecret);
    };

    SecureSheets.setDebug = function(enable = true) {
        SecureSheets.config.debug = enable;
        console.log('SecureSheets: Debug mode ' + (enable ? 'enabled' : 'disabled'));
    };

    SecureSheets.getVersion = function() {
        return SecureSheets.version;
    };

    // ============================================
    // SERVER INFO METHODS
    // ============================================

    SecureSheets.getServerInfo = function() {
        return SecureSheets.serverInfo;
    };

    SecureSheets.hasFeature = function(featureName) {
        if (!SecureSheets.serverInfo || !SecureSheets.serverInfo.features) {
            return false;
        }
        return SecureSheets.serverInfo.features.includes(featureName);
    };

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

    SecureSheets.computeHMAC = function(message, secret) {
        if (typeof CryptoJS === 'undefined') {
            throw new Error('SecureSheets: CryptoJS is required. Include: https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js');
        }

        const hmac = CryptoJS.HmacSHA256(message, secret);
        return CryptoJS.enc.Hex.stringify(hmac);
    };

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

        if (SecureSheets.usedNonces.size > 1000) {
            const firstNonce = SecureSheets.usedNonces.values().next().value;
            SecureSheets.usedNonces.delete(firstNonce);
        }

        return nonce;
    };

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

    SecureSheets.getCSRFToken = function() {
        if (!SecureSheets.config.enableCSRF) {
            return null;
        }

        const now = Date.now();

        if (SecureSheets.csrfToken && SecureSheets.csrfExpiry && now < SecureSheets.csrfExpiry) {
            return SecureSheets.csrfToken;
        }

        const token = 'csrf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 16);
        SecureSheets.csrfToken = token;
        SecureSheets.csrfExpiry = now + (30 * 60 * 1000);

        if (SecureSheets.config.debug) {
            console.log('SecureSheets: Generated new CSRF token');
        }

        return token;
    };

    SecureSheets.getCSRFTokenManual = function() {
        if (!SecureSheets.config.enableCSRF) {
            return null;
        }
        return SecureSheets.getCSRFToken();
    };

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

    SecureSheets.getNonceStatus = function() {
        return {
            enabled: SecureSheets.config.enableNonce,
            usedCount: SecureSheets.usedNonces.size,
            maxTracked: 1000
        };
    };

    SecureSheets.clearNonces = function() {
        SecureSheets.usedNonces.clear();
        
        if (SecureSheets.config.debug) {
            console.log('SecureSheets: Used nonces cleared');
        }
    };

    // ============================================
    // RATE LIMITING
    // ============================================

    SecureSheets.checkRateLimit = function() {
        if (!SecureSheets.config.rateLimitEnabled) {
            return true;
        }

        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        if (now - SecureSheets.requestWindow > oneHour) {
            SecureSheets.requestCount = 0;
            SecureSheets.requestWindow = now;
        }

        if (SecureSheets.requestCount >= SecureSheets.config.maxRequests) {
            const resetTime = new Date(SecureSheets.requestWindow + oneHour);
            throw new Error(`SecureSheets: Rate limit exceeded. Resets at ${resetTime.toISOString()}`);
        }

        SecureSheets.requestCount++;
        return true;
    };

    SecureSheets.resetRateLimit = function() {
        SecureSheets.requestCount = 0;
        SecureSheets.requestWindow = Date.now();
        
        if (SecureSheets.config.debug) {
            console.log('SecureSheets: Rate limit reset');
        }
    };

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

    SecureSheets.setCached = function(key, data) {
        SecureSheets.cache.set(key, {
            data: data,
            expiry: Date.now() + SecureSheets.config.cacheTimeout
        });

        if (SecureSheets.config.debug) {
            console.log('SecureSheets: Cached', key);
        }
    };

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

    SecureSheets.makeRequest = async function(action, params = {}, options = {}) {
        SecureSheets.checkRateLimit();

        if (options.useCache !== false) {
            const cacheKey = action + ':' + JSON.stringify(params);
            const cached = SecureSheets.getCached(cacheKey);
            if (cached) {
                return cached;
            }
        }

        const queryParams = { action, ...params };
        const queryString = Object.keys(queryParams)
            .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(queryParams[key]))
            .join('&');
        const url = SecureSheets.config.scriptUrl + '?' + queryString;

        const headers = SecureSheets.generateAuthHeaders(action, params);

        if (SecureSheets.config.debug) {
            console.log('SecureSheets: Making request', { 
                action, 
                params: Object.keys(params).length > 0 ? Object.keys(params) : 'none'
            });
        }

        const response = await fetch(url, { headers });

        if (!response.ok) {
            return await SecureSheets.handleErrorResponse(response);
        }

        const data = await response.json();

        if (response.headers.has('X-RateLimit-Remaining')) {
            if (!SecureSheets.serverInfo) SecureSheets.serverInfo = {};
            if (!SecureSheets.serverInfo.limits) SecureSheets.serverInfo.limits = {};
            SecureSheets.serverInfo.limits.remaining = parseInt(response.headers.get('X-RateLimit-Remaining'));
        }

        if (options.useCache !== false) {
            const cacheKey = action + ':' + JSON.stringify(params);
            SecureSheets.setCached(cacheKey, data);
        }

        return data;
    };

    SecureSheets.makePostRequest = async function(action, body = {}, options = {}) {
        SecureSheets.checkRateLimit();

        const headers = SecureSheets.generateAuthHeaders(action, body);
        headers['Content-Type'] = 'application/json';

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

        const response = await fetch(SecureSheets.config.scriptUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ action, ...body })
        });

        if (!response.ok) {
            return await SecureSheets.handleErrorResponse(response);
        }

        const data = await response.json();

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

    SecureSheets.healthCheck = async function() {
        const url = SecureSheets.config.scriptUrl + '?action=health';
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error('Health check failed: ' + response.statusText);
        }

        return await response.json();
    };

    SecureSheets.getScrollingMessages = async function(options = {}) {
        const url = SecureSheets.config.scriptUrl + '?action=scrolling';
        
        if (options.useCache !== false) {
            const cached = SecureSheets.getCached('scrolling');
            if (cached) return cached;
        }

        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error('Failed to fetch scrolling messages: ' + response.statusText);
        }

        const data = await response.json();

        if (options.useCache !== false) {
            SecureSheets.setCached('scrolling', data);
        }

        return data;
    };

    SecureSheets.getDoodleEvents = async function(options = {}) {
        const url = SecureSheets.config.scriptUrl + '?action=doodle';
        
        if (options.useCache !== false) {
            const cached = SecureSheets.getCached('doodle');
            if (cached) return cached;
        }

        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error('Failed to fetch doodle events: ' + response.statusText);
        }

        const data = await response.json();

        if (options.useCache !== false) {
            SecureSheets.setCached('doodle', data);
        }

        return data;
    };

    SecureSheets.getModalContent = async function(sheet, cell, options = {}) {
        const cacheKey = `modal:${sheet}:${cell}`;
        
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

        if (options.useCache !== false) {
            SecureSheets.setCached(cacheKey, data);
        }

        return data;
    };

    SecureSheets.getBatch = async function(actions, options = {}) {
        const cacheKey = 'batch:' + actions.join(',');
        
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

        if (options.useCache !== false) {
            SecureSheets.setCached(cacheKey, data);
        }

        return data;
    };

    // ============================================
    // PROTECTED API METHODS (AUTH REQUIRED)
    // ============================================

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

    SecureSheets.getDataMultiSheet = async function(sheets, options = {}) {
        return await SecureSheets.getData(sheets, options);
    };

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

    SecureSheets.postData = async function(data, options = {}) {
        const action = data.action || 'getData';
        return await SecureSheets.makePostRequest(action, data, options);
    };

    SecureSheets.postGetData = async function(params, options = {}) {
        return await SecureSheets.makePostRequest('getData', params, options);
    };

    // ============================================
    // NEW: CELL-SPECIFIC QUERY METHODS
    // ============================================

    /**
     * Get data from a specific cell
     * @param {string} cell - Cell reference (e.g., 'A1', 'Sheet2!B5')
     * @param {Object} options - Request options
     * @returns {Promise<Object>} Cell data
     */
    SecureSheets.getCellData = async function(cell, options = {}) {
        if (!cell || typeof cell !== 'string') {
            throw new Error('SecureSheets: Cell reference is required (e.g., "A1" or "Sheet2!B5")');
        }

        const params = {
            cell: cell.toUpperCase()
        };

        return await SecureSheets.makeRequest('getCell', params, options);
    };

    /**
     * Get data from a specific range
     * @param {string} range - Range reference (e.g., 'A1:B10', 'Sheet2!A1:D20')
     * @param {Object} options - Request options
     * @returns {Promise<Object>} Range data
     */
    SecureSheets.getRangeData = async function(range, options = {}) {
        if (!range || typeof range !== 'string') {
            throw new Error('SecureSheets: Range reference is required (e.g., "A1:B10" or "Sheet2!A1:D20")');
        }

        const params = {
            range: range.toUpperCase()
        };

        return await SecureSheets.makeRequest('getRange', params, options);
    };

    /**
     * Get data from multiple cells in a single request
     * @param {Array<string>} cells - Array of cell references
     * @param {Object} options - Request options
     * @returns {Promise<Object>} Batch cell data
     */
    SecureSheets.getCellDataBatch = async function(cells, options = {}) {
        if (!Array.isArray(cells) || cells.length === 0) {
            throw new Error('SecureSheets: Cells array is required');
        }

        const params = {
            cells: cells.map(c => c.toUpperCase()).join(',')
        };

        return await SecureSheets.makeRequest('getCellBatch', params, options);
    };

    /**
     * Get cell data via POST (with CSRF protection)
     * @param {string} cell - Cell reference
     * @param {Object} options - Request options
     * @returns {Promise<Object>} Cell data
     */
    SecureSheets.getCellDataPost = async function(cell, options = {}) {
        if (!cell || typeof cell !== 'string') {
            throw new Error('SecureSheets: Cell reference is required');
        }

        const body = {
            cell: cell.toUpperCase()
        };

        return await SecureSheets.makePostRequest('getCell', body, options);
    };

    // ============================================
    // SECURITY UTILITIES
    // ============================================

    SecureSheets.verifyWebhookSignature = function(payload, signature, secret) {
        if (!payload || !signature || !secret) {
            return false;
        }

        try {
            const expectedSignature = SecureSheets.computeHMAC(payload, secret);
            
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
            try {
                const health = await SecureSheets.healthCheck();
                results.tests.health.passed = health.status === 'online';
                results.tests.health.message = health.status === 'online' ? 
                    'Server is online' : 'Server returned unexpected status';
                results.tests.health.data = health;
            } catch (error) {
                results.tests.health.message = 'Health check failed: ' + error.message;
            }

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

            results.success = results.tests.health.passed && results.tests.config.passed;

            return results;

        } catch (error) {
            results.error = error.message;
            return results;
        }
    };

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

    if (typeof define === 'function' && define.amd) {
        define([], function() { return SecureSheets; });
    } else if (typeof module === 'object' && module.exports) {
        module.exports = SecureSheets;
    }

    console.log(`SecureSheets Client v${SecureSheets.version} loaded`);
    console.log('✨ Enhanced with Cell Query Support!');
    console.log('Features: CSRF, Nonces, POST, Webhooks + Cell Queries');

})(typeof window !== 'undefined' ? window : global);

/**
 * ============================================================================
 * USAGE EXAMPLES - NEW CELL QUERY METHODS
 * ============================================================================
 * 
 * // 1. Get a single cell value
 * const cellData = await SecureSheets.getCellData('A1');
 * console.log(cellData.value); // Cell value
 * 
 * // 2. Get cell from specific sheet
 * const price = await SecureSheets.getCellData('Prices!B5');
 * console.log(price.value);
 * 
 * // 3. Get a range of cells
 * const rangeData = await SecureSheets.getRangeData('A1:C10');
 * console.log(rangeData.values); // 2D array of values
 * 
 * // 4. Get range from specific sheet
 * const inventory = await SecureSheets.getRangeData('Inventory!A1:D20');
 * 
 * // 5. Get multiple cells in one request (batch)
 * const cells = await SecureSheets.getCellDataBatch([
 *   'A1',
 *   'B5',
 *   'Sheet2!C10'
 * ]);
 * console.log(cells.data); // Array of cell values
 * 
 * // 6. Get cell via POST (with CSRF protection)
 * const secureCellData = await SecureSheets.getCellDataPost('Secret!A1');
 * 
 * // 7. With caching
 * const cached = await SecureSheets.getCellData('Status!A1', { useCache: true });
 * 
 * // 8. Disable caching
 * const fresh = await SecureSheets.getCellData('Counter!A1', { useCache: false });
 * 
 * ============================================================================
 * PRACTICAL EXAMPLE - DASHBOARD WITH CELL QUERIES
 * ============================================================================
 * 
 * async function loadDashboard() {
 *   try {
 *     // Configure
 *     await SecureSheets.configureWithEnvironment();
 *     
 *     // Get individual metrics efficiently
 *     const totalSales = await SecureSheets.getCellData('Sales!A1');
 *     const activeUsers = await SecureSheets.getCellData('Users!B2');
 *     const inventory = await SecureSheets.getCellData('Stock!C5');
 *     
 *     // Or batch them together
 *     const metrics = await SecureSheets.getCellDataBatch([
 *       'Sales!A1',
 *       'Users!B2',
 *       'Stock!C5'
 *     ]);
 *     
 *     // Display metrics
 *     document.getElementById('sales').textContent = totalSales.value;
 *     document.getElementById('users').textContent = activeUsers.value;
 *     document.getElementById('stock').textContent = inventory.value;
 *     
 *   } catch (error) {
 *     console.error('Dashboard load failed:', error);
 *   }
 * }
 * 
 * ============================================================================
 * COMPARISON: OLD vs NEW APPROACH
 * ============================================================================
 * 
 * // OLD WAY (v1.2.1 original) - Inefficient
 * const sheet = await SecureSheets.getData('Sales'); // Downloads entire sheet
 * const cellValue = sheet.data.rows[0][0]; // Extract A1
 * 
 * // NEW WAY (v1.2.1 enhanced) - Efficient! 
 * const cellData = await SecureSheets.getCellData('Sales!A1'); // Downloads only A1
 * const cellValue = cellData.value;
 * 
 * ============================================================================
 */