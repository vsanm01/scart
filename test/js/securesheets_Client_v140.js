/**
 * ============================================================================
 * SECURESHEETS CLIENT LIBRARY v1.4. 
 * The Ultimate Edition: Merged Security + Enhanced Queries
 * Compatible with SecureSheets Server v3.9.0
 * ============================================================================
 * @author SecureSheets Team
 * @version 1.4.0
 * @license MIT
 * 
 * ============================================================================
 */

(function(window) {
    'use strict';

    // ============================================
    // CORE OBJECT
    // ============================================
    const SecureSheets = {
        version: '1.4.0',
        serverVersion: '3.9.0',
        config: {
            scriptUrl: '',
            apiToken: '',
            hmacSecret: '',
            origin: '',
            enableCSRF: true,
            enableNonce: true,
            checksumValidation: true,      
            enforceHttps: true,            
            autoOrigin: true,              
            rateLimitEnabled: true,
            maxRequests: 100,
            cacheTimeout: 300000,          
            defaultTimeout: 30000,         
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
    // ERROR HANDLING 
    // ============================================

    /**
     * Create a custom error with code and details
     */
    SecureSheets.createError = function(message, code, details = null) {
        const error = new Error(message);
        error.code = code;
        error.serverResponse = details;
        error.timestamp = new Date().toISOString();
        return error;
    };

    /**
     * Parse error response
     */
    SecureSheets.parseError = function(errorData) {
        let message = 'SecureSheets: ';
        
        if (errorData.error) {
            message += errorData.error;
        } else if (errorData.message) {
            message += errorData.message;
        } else {
            message += 'Unknown error occurred';
        }
        
        if (errorData.code) {
            message += ' (Code: ' + errorData.code + ')';
        }
        
        const error = new Error(message);
        error.code = errorData.code || 'UNKNOWN_ERROR';
        error.serverResponse = errorData;
        error.timestamp = new Date().toISOString();
        
        if (errorData.details) {
            error.details = errorData.details;
        }
        
        return error;
    };

    /**
     * Format error for display
     */
    SecureSheets.formatError = function(error) {
        return {
            message: error.message,
            code: error.code || 'UNKNOWN_ERROR',
            details: error.serverResponse || null,
            stack: SecureSheets.config.debug ? error.stack : undefined,
            timestamp: error.timestamp || new Date().toISOString()
        };
    };

    /**
     * Handle error response
     */
    SecureSheets.handleErrorResponse = async function(response) {
        let errorData;
        
        try {
            errorData = await response.json();
        } catch (e) {
            errorData = {
                error: `HTTP ${response.status}: ${response.statusText}`,
                code: 'HTTP_ERROR'
            };
        }
        
        throw SecureSheets.parseError(errorData);
    };

    // ============================================
    // CONFIGURATION METHODS 
    // ============================================

    /**
     * Configure the SecureSheets client with validation
     */
    SecureSheets.configure = function(options) {
        if (!options) {
            throw SecureSheets.createError(
                'Configuration options are required',
                'CONFIG_REQUIRED'
            );
        }

        if (options.scriptUrl !== undefined) {
            if (!options.scriptUrl) {
                throw SecureSheets.createError(
                    'scriptUrl cannot be empty',
                    'CONFIG_MISSING_URL'
                );
            }

            const enforceHttps = options.enforceHttps !== undefined ? 
                options.enforceHttps : SecureSheets.config.enforceHttps;
            
            if (enforceHttps && !options.scriptUrl.startsWith('https://')) {
                throw SecureSheets.createError(
                    'scriptUrl must use HTTPS',
                    'CONFIG_HTTPS_REQUIRED'
                );
            }

            SecureSheets.config.scriptUrl = options.scriptUrl;
        }

        if (options.apiToken) SecureSheets.config.apiToken = options.apiToken;
        if (options.hmacSecret) SecureSheets.config.hmacSecret = options.hmacSecret;
        
        if (options.origin !== undefined) {
            SecureSheets.config.origin = options.origin;
        } else if (options.autoOrigin !== false && SecureSheets.config.autoOrigin) {
            SecureSheets.config.origin = SecureSheets.getOrigin();
        }
        
        if (typeof options.enableCSRF === 'boolean') SecureSheets.config.enableCSRF = options.enableCSRF;
        if (typeof options.enableNonce === 'boolean') SecureSheets.config.enableNonce = options.enableNonce;
        if (typeof options.checksumValidation === 'boolean') SecureSheets.config.checksumValidation = options.checksumValidation;
        if (typeof options.enforceHttps === 'boolean') SecureSheets.config.enforceHttps = options.enforceHttps;
        if (typeof options.autoOrigin === 'boolean') SecureSheets.config.autoOrigin = options.autoOrigin;
        if (typeof options.rateLimitEnabled === 'boolean') SecureSheets.config.rateLimitEnabled = options.rateLimitEnabled;
        if (options.maxRequests) SecureSheets.config.maxRequests = options.maxRequests;
        if (options.cacheTimeout) SecureSheets.config.cacheTimeout = options.cacheTimeout;
        if (options.defaultTimeout) SecureSheets.config.defaultTimeout = options.defaultTimeout;
        if (typeof options.debug === 'boolean') SecureSheets.config.debug = options.debug;

        if (SecureSheets.config.debug) {
            console.log('SecureSheets v1.3.1-enhanced: Configured', {
                scriptUrl: SecureSheets.config.scriptUrl,
                origin: SecureSheets.config.origin,
                enableCSRF: SecureSheets.config.enableCSRF,
                enableNonce: SecureSheets.config.enableNonce,
                checksumValidation: SecureSheets.config.checksumValidation,
                enforceHttps: SecureSheets.config.enforceHttps,
                autoOrigin: SecureSheets.config.autoOrigin
            });
        }
    };

    /**
     * NEW: Configure with environment variables
     */
    SecureSheets.configureWithEnvironment = async function(envVars) {
        const env = envVars || (typeof process !== 'undefined' ? process.env : {});
        
        if (!env.SHEETS_BASE_URL || !env.API_TOKEN || !env.HMAC_SECRET) {
            throw SecureSheets.createError(
                'Missing required environment variables. Required: SHEETS_BASE_URL, API_TOKEN, HMAC_SECRET',
                'ENV_CONFIG_MISSING'
            );
        }

        const options = {
            scriptUrl: env.SHEETS_BASE_URL,
            apiToken: env.API_TOKEN,
            hmacSecret: env.HMAC_SECRET,
            origin: env.ORIGIN || undefined,
            enableCSRF: env.ENABLE_CSRF !== 'false',
            enableNonce: env.ENABLE_NONCE !== 'false',
            checksumValidation: env.CHECKSUM_VALIDATION !== 'false',
            enforceHttps: env.ENFORCE_HTTPS !== 'false',
            autoOrigin: env.AUTO_ORIGIN !== 'false',
            rateLimitEnabled: env.RATE_LIMIT_ENABLED !== 'false',
            maxRequests: parseInt(env.MAX_REQUESTS) || 100,
            cacheTimeout: parseInt(env.CACHE_TIMEOUT) || 300000,
            defaultTimeout: parseInt(env.DEFAULT_TIMEOUT) || 30000,
            debug: env.NODE_ENV === 'development' || env.DEBUG === 'true'
        };

        if (SecureSheets.config.debug) {
            console.log('🔧 SecureSheets: Configuring with environment variables');
        }

        return await SecureSheets.configureWithDiscovery(options);
    };

    /**
     * Configure with auto-discovery
     */
    SecureSheets.configureWithDiscovery = async function(options) {
        SecureSheets.configure(options);

        try {
            const serverConfig = await SecureSheets.getServerConfig();
            SecureSheets.serverInfo = serverConfig;

            if (SecureSheets.config.debug) {
                console.log('SecureSheets: Auto-discovery complete', serverConfig);
            }

            return serverConfig;
        } catch (error) {
            console.warn('SecureSheets: Auto-discovery failed', error);
            return null;
        }
    };

    /**
     * Get current configuration
     */
    SecureSheets.getConfig = function() {
        return { ...SecureSheets.config };
    };

    /**
     * Get complete client configuration 
     */
    SecureSheets.getClientConfig = function() {
        return {
            scriptUrl: SecureSheets.config.scriptUrl,
            origin: SecureSheets.config.origin,
            enableCSRF: SecureSheets.config.enableCSRF,
            enableNonce: SecureSheets.config.enableNonce,
            checksumValidation: SecureSheets.config.checksumValidation,
            enforceHttps: SecureSheets.config.enforceHttps,
            autoOrigin: SecureSheets.config.autoOrigin,
            rateLimitEnabled: SecureSheets.config.rateLimitEnabled,
            maxRequests: SecureSheets.config.maxRequests,
            cacheTimeout: SecureSheets.config.cacheTimeout,
            defaultTimeout: SecureSheets.config.defaultTimeout,
            debug: SecureSheets.config.debug,
            version: SecureSheets.version,
            serverVersion: SecureSheets.serverVersion,
            currentOrigin: SecureSheets.getOrigin()
        };
    };

    /**
     * Check if library is configured
     */
    SecureSheets.isConfigured = function() {
        return !!(SecureSheets.config.scriptUrl && 
                  SecureSheets.config.apiToken && 
                  SecureSheets.config.hmacSecret);
    };

    /**
     * Enable debug mode
     */
    SecureSheets.setDebug = function(enable = true) {
        SecureSheets.config.debug = enable;
        console.log('SecureSheets: Debug mode ' + (enable ? 'enabled' : 'disabled'));
    };

    /**
     * Get library version
     */
    SecureSheets.getVersion = function() {
        return SecureSheets.version;
    };

    // ============================================
    // ORIGIN DETECTION 
    // ============================================

    /**
     * Get current origin
     */
    SecureSheets.getOrigin = function() {
        return window.location.origin || 
               (window.location.protocol + '//' + window.location.host);
    };

    // ============================================
    // SERVER INFO METHODS
    // ============================================

    /**
     * Get server information
     */
    SecureSheets.getServerInfo = function() {
        return SecureSheets.serverInfo;
    };

    /**
     * Check if server has a specific feature
     */
    SecureSheets.hasFeature = function(featureName) {
        if (!SecureSheets.serverInfo || !SecureSheets.serverInfo.features) {
            return false;
        }
        
        if (SecureSheets.serverInfo.features.core && 
            SecureSheets.serverInfo.features.core.includes(featureName)) {
            return true;
        }
        
        return SecureSheets.serverInfo.features[featureName] === true;
    };

    /**
     * Get server configuration from API
     */
    SecureSheets.getServerConfig = async function() {
        const params = new URLSearchParams({
            action: 'config'
        });
        
        if (SecureSheets.config.origin) {
            params.append('origin', SecureSheets.config.origin);
        }
        
        const url = SecureSheets.config.scriptUrl + '?' + params.toString();
        const response = await fetch(url);
        
        if (!response.ok) {
            throw SecureSheets.createError(
                'Failed to fetch server config: ' + response.statusText,
                'CONFIG_FETCH_FAILED'
            );
        }

        return await response.json();
    };

    // ============================================
    // AUTHENTICATION METHODS
    // ============================================

    /**
     * Compute HMAC-SHA256 signature
     */
    SecureSheets.computeHMAC = function(message, secret) {
        if (typeof CryptoJS === 'undefined') {
            throw SecureSheets.createError(
                'CryptoJS library is required. Include https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js',
                'DEPENDENCY_MISSING'
            );
        }

        if (!message || !secret) {
            throw SecureSheets.createError(
                'Message and secret are required for HMAC computation',
                'HMAC_PARAMS_REQUIRED'
            );
        }

        const hmac = CryptoJS.HmacSHA256(message, secret);
        return CryptoJS.enc.Hex.stringify(hmac);
    };

    /**
     * Generate request signature for v3.9.0
     */
    SecureSheets.generateSignature = function(params) {
        const sortedKeys = Object.keys(params).sort();
        const signatureString = sortedKeys
            .map(key => key + '=' + String(params[key] || ''))
            .join('&');
        
        if (SecureSheets.config.debug) {
            console.log('SecureSheets: Signature string:', signatureString);
        }
        
        return SecureSheets.computeHMAC(signatureString, SecureSheets.config.hmacSecret);
    };

    /**
     * Generate nonce
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
            throw SecureSheets.createError(
                'Failed to generate unique nonce',
                'NONCE_GENERATION_FAILED'
            );
        }

        SecureSheets.usedNonces.add(nonce);

        if (SecureSheets.usedNonces.size > 1000) {
            const firstNonce = SecureSheets.usedNonces.values().next().value;
            SecureSheets.usedNonces.delete(firstNonce);
        }

        return nonce;
    };

    /**
     * Generate CSRF token with HMAC 
     */
    SecureSheets.generateCSRFToken = function() {
        if (!SecureSheets.config.enableCSRF) {
            return null;
        }

        const origin = SecureSheets.config.origin || SecureSheets.getOrigin();
        const timestamp = Date.now();
        const signature = SecureSheets.computeHMAC(
            timestamp + ':' + origin, 
            SecureSheets.config.hmacSecret
        );
        
        return timestamp + ':' + signature;
    };

    /**
     * Get CSRF token (cached or generate new)
     */
    SecureSheets.getCSRFToken = function() {
        if (!SecureSheets.config.enableCSRF) {
            return null;
        }

        const now = Date.now();

        if (SecureSheets.csrfToken && SecureSheets.csrfExpiry && now < SecureSheets.csrfExpiry) {
            return SecureSheets.csrfToken;
        }

        const token = SecureSheets.generateCSRFToken();
        SecureSheets.csrfToken = token;
        SecureSheets.csrfExpiry = now + (30 * 60 * 1000);

        if (SecureSheets.config.debug) {
            console.log('SecureSheets: Generated new HMAC-based CSRF token');
        }

        return token;
    };

    /**
     * Clear CSRF token cache
     */
    SecureSheets.clearCSRFToken = function() {
        SecureSheets.csrfToken = null;
        SecureSheets.csrfExpiry = null;
    };

    // ============================================
    // CHECKSUM VALIDATION
    // ============================================

    /**
     * Validate response checksum
     */
    SecureSheets.validateChecksum = function(data) {
        if (!data.checksum || !data.data) {
            if (SecureSheets.config.debug) {
                console.warn('SecureSheets: No checksum or data to validate');
            }
            return false;
        }

        try {
            if (typeof CryptoJS === 'undefined') {
                console.error('SecureSheets: CryptoJS required for checksum validation');
                return false;
            }

            const jsonString = JSON.stringify(data.data);
            const hash = CryptoJS.SHA256(jsonString).toString();
            
            const isValid = hash === data.checksum;
            
            if (SecureSheets.config.debug) {
                console.log('SecureSheets: Checksum validation:', isValid ? 'PASSED' : 'FAILED');
                if (!isValid) {
                    console.log('Expected:', data.checksum);
                    console.log('Computed:', hash);
                }
            }
            
            return isValid;
        } catch (error) {
            console.error('SecureSheets: Checksum validation error:', error);
            return false;
        }
    };

  // ============================================
    // RATE LIMITING
    // ============================================

    /**
     * Check rate limit
     */
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
            throw SecureSheets.createError(
                `Rate limit exceeded. Resets at ${resetTime.toLocaleTimeString()}`,
                'RATE_LIMIT_EXCEEDED',
                {
                    resetTime: resetTime.toISOString(),
                    currentRequests: SecureSheets.requestCount,
                    maxRequests: SecureSheets.config.maxRequests
                }
            );
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
            console.log('SecureSheets: Rate limit counter reset');
        }
    };

    /**
     * Get rate limit status
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
     */
    SecureSheets.setCached = function(key, data) {
        SecureSheets.cache.set(key, {
            data: data,
            expiry: Date.now() + SecureSheets.config.cacheTimeout
        });
    };

    /**
     * Clear cache
     */
    SecureSheets.clearCache = function(key) {
        if (key) {
            SecureSheets.cache.delete(key);
        } else {
            SecureSheets.cache.clear();
        }
    };

    // ============================================
    // HTTP REQUEST METHODS
    // ============================================

    /**
     * Build URL with parameters
     * @private
     */
    function buildUrl(params) {
        const queryParams = new URLSearchParams();
        
        for (const key in params) {
            if (params.hasOwnProperty(key) && params[key] !== null && params[key] !== undefined) {
                queryParams.append(key, params[key]);
            }
        }
        
        return SecureSheets.config.scriptUrl + '?' + queryParams.toString();
    }

    /**
     * Make authenticated GET request with timeout support
     */
    SecureSheets.makeRequest = async function(params = {}, options = {}) {
        if (!SecureSheets.config.scriptUrl) {
            throw SecureSheets.createError(
                'API not configured. Call SecureSheets.configure() first.',
                'NOT_CONFIGURED'
            );
        }

        SecureSheets.checkRateLimit();

        params.token = SecureSheets.config.apiToken;
        
        if (SecureSheets.config.origin) {
            params.origin = SecureSheets.config.origin;
        } else if (SecureSheets.config.autoOrigin) {
            params.origin = SecureSheets.getOrigin();
        }
        
        if (SecureSheets.config.autoOrigin) {
            params.referrer = window.location.href;
        }
        
        params.timestamp = new Date().toISOString();

        if (SecureSheets.config.enableNonce) {
            const nonce = SecureSheets.generateNonce();
            if (nonce) params.nonce = nonce;
        }

        if (options.useCache !== false) {
            const cacheKey = JSON.stringify(params);
            const cached = SecureSheets.getCached(cacheKey);
            if (cached) {
                return cached;
            }
        }

        params.signature = SecureSheets.generateSignature(params);

        const url = buildUrl(params);

        if (SecureSheets.config.debug) {
            console.log('SecureSheets: Making request', params);
        }

        const timeout = options.timeout || SecureSheets.config.defaultTimeout;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const fetchOptions = {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    ...options.headers
                },
                signal: controller.signal
            };

            const response = await fetch(url, fetchOptions);
            clearTimeout(timeoutId);

            if (!response.ok) {
                return await SecureSheets.handleErrorResponse(response);
            }

            const data = await response.json();

            if (SecureSheets.config.checksumValidation && data.checksum) {
                if (!SecureSheets.validateChecksum(data)) {
                    throw SecureSheets.createError(
                        'Data integrity check failed (checksum mismatch)',
                        'CHECKSUM_MISMATCH',
                        { expectedChecksum: data.checksum }
                    );
                }
            }

            if (options.useCache !== false) {
                const cacheKey = JSON.stringify(params);
                SecureSheets.setCached(cacheKey, data);
            }

            return data;

        } catch (error) {
            clearTimeout(timeoutId);

            if (error.name === 'AbortError') {
                throw SecureSheets.createError(
                    'Request timeout',
                    'TIMEOUT',
                    { timeout: timeout }
                );
            }

            if (error.code) {
                throw error;
            }

            throw SecureSheets.createError(
                error.message,
                'REQUEST_FAILED',
                { originalError: error.toString() }
            );
        }
    };

    /**
     * Make authenticated POST request with timeout support
     */
    SecureSheets.makePostRequest = async function(body = {}, options = {}) {
        if (!SecureSheets.config.scriptUrl) {
            throw SecureSheets.createError(
                'API not configured. Call SecureSheets.configure() first.',
                'NOT_CONFIGURED'
            );
        }

        SecureSheets.checkRateLimit();

        body.token = SecureSheets.config.apiToken;
        
        if (SecureSheets.config.origin) {
            body.origin = SecureSheets.config.origin;
        } else if (SecureSheets.config.autoOrigin) {
            body.origin = SecureSheets.getOrigin();
        }
        
        body.timestamp = new Date().toISOString();

        if (SecureSheets.config.enableCSRF) {
            body['csrf-token'] = SecureSheets.getCSRFToken();
        }

        if (SecureSheets.config.enableNonce) {
            const nonce = SecureSheets.generateNonce();
            if (nonce) body.nonce = nonce;
        }

        body.signature = SecureSheets.generateSignature(body);

        if (SecureSheets.config.debug) {
            console.log('SecureSheets: Making POST request', body);
        }

        const timeout = options.timeout || SecureSheets.config.defaultTimeout;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const fetchOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    ...options.headers
                },
                body: JSON.stringify(body),
                signal: controller.signal
            };

            const response = await fetch(SecureSheets.config.scriptUrl, fetchOptions);
            clearTimeout(timeoutId);

            if (!response.ok) {
                return await SecureSheets.handleErrorResponse(response);
            }

            const responseData = await response.json();

            if (SecureSheets.config.checksumValidation && responseData.checksum) {
                if (!SecureSheets.validateChecksum(responseData)) {
                    throw SecureSheets.createError(
                        'Data integrity check failed (checksum mismatch)',
                        'CHECKSUM_MISMATCH',
                        { expectedChecksum: responseData.checksum }
                    );
                }
            }

            return responseData;

        } catch (error) {
            clearTimeout(timeoutId);

            if (error.name === 'AbortError') {
                throw SecureSheets.createError(
                    'Request timeout',
                    'TIMEOUT',
                    { timeout: timeout }
                );
            }

            if (error.code) {
                throw error;
            }

            throw SecureSheets.createError(
                error.message,
                'POST_REQUEST_FAILED',
                { originalError: error.toString() }
            );
        }
    };

    /**
     * Make public request (no authentication, with timeout)
     */
    SecureSheets.makePublicRequest = async function(params = {}, options = {}) {
        if (!SecureSheets.config.scriptUrl) {
            throw SecureSheets.createError(
                'API not configured. Call SecureSheets.configure() first.',
                'NOT_CONFIGURED'
            );
        }

        SecureSheets.checkRateLimit();

        if (SecureSheets.config.origin) {
            params.origin = SecureSheets.config.origin;
        } else if (SecureSheets.config.autoOrigin) {
            params.origin = SecureSheets.getOrigin();
        }

        if (SecureSheets.config.autoOrigin) {
            params.referrer = window.location.href;
        }

        if (options.useCache !== false) {
            const cacheKey = JSON.stringify(params);
            const cached = SecureSheets.getCached(cacheKey);
            if (cached) return cached;
        }

        const url = buildUrl(params);

        if (SecureSheets.config.debug) {
            console.log('SecureSheets: Making public request', params);
        }

        const timeout = options.timeout || SecureSheets.config.defaultTimeout;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const fetchOptions = {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    ...options.headers
                },
                signal: controller.signal
            };

            const response = await fetch(url, fetchOptions);
            clearTimeout(timeoutId);

            if (!response.ok) {
                return await SecureSheets.handleErrorResponse(response);
            }

            const data = await response.json();

            if (options.useCache !== false) {
                const cacheKey = JSON.stringify(params);
                SecureSheets.setCached(cacheKey, data);
            }

            return data;

        } catch (error) {
            clearTimeout(timeoutId);

            if (error.name === 'AbortError') {
                throw SecureSheets.createError(
                    'Request timeout',
                    'TIMEOUT',
                    { timeout: timeout }
                );
            }

            if (error.code) {
                throw error;
            }

            throw SecureSheets.createError(
                error.message,
                'REQUEST_FAILED',
                { originalError: error.toString() }
            );
        }
    };

    // ============================================
    // PUBLIC API METHODS (NO AUTH)
    // ============================================

    /**
     * Health check endpoint
     */
    SecureSheets.healthCheck = async function(options = {}) {
        return await SecureSheets.makePublicRequest({ action: 'health' }, options);
    };

    /**
     * Get scrolling messages with optional callback 
     */
    SecureSheets.getScrollingMessages = async function(callback, options = {}) {
        const params = { action: 'scrolling' };
        if (callback) params.callback = callback;
        return await SecureSheets.makePublicRequest(params, options);
    };

    /**
     * Get doodle events with optional callback 
     */
    SecureSheets.getDoodleEvents = async function(callback, options = {}) {
        const params = { action: 'doodle' };
        if (callback) params.callback = callback;
        return await SecureSheets.makePublicRequest(params, options);
    };

    /**
     * Get modal content with optional callback 
     */
    SecureSheets.getModalContent = async function(sheet, cell, callback, options = {}) {
        const params = { 
            action: 'modal',
            sheet: sheet,
            cell: cell
        };
        if (callback) params.callback = callback;
        return await SecureSheets.makePublicRequest(params, options);
    };

    /**
     * Get batch data with optional callback 
     */
    SecureSheets.getBatch = async function(actions, callback, options = {}) {
        const params = {
            action: 'batch',
            actions: Array.isArray(actions) ? actions.join(',') : actions
        };
        if (callback) params.callback = callback;
        return await SecureSheets.makePublicRequest(params, options);
    };

    // ============================================
    // PROTECTED API METHODS (AUTH REQUIRED)
    // ============================================

    /**
     * Get sheet data (requires HMAC)
     */
    SecureSheets.getData = async function(sheet = null, options = {}) {
        const params = {
            action: 'getData'
        };
        
        if (sheet) {
            if (Array.isArray(sheet)) {
                params.sheets = sheet.join(',');
            } else {
                params.sheet = sheet;
            }
        }

        return await SecureSheets.makeRequest(params, options);
    };

    /**
     * Get cell data (B4 or B7 - requires HMAC)
     */
    SecureSheets.getCellData = async function(cell, options = {}) {
        const params = {
            action: 'cellData',
            cell: cell.toUpperCase()
        };

        return await SecureSheets.makeRequest(params, options);
    };

    /**
     * NEW: Get data from a specific cell (Enhanced feature)
     */
    SecureSheets.getCellDataEnhanced = async function(cell, options = {}) {
        if (!cell || typeof cell !== 'string') {
            throw SecureSheets.createError(
                'Cell reference is required (e.g., "A1" or "Sheet2!B5")',
                'INVALID_CELL_REFERENCE'
            );
        }

        const params = {
            action: 'getCell',
            cell: cell.toUpperCase()
        };

        return await SecureSheets.makeRequest(params, options);
    };

    /**
     * NEW: Get data from a specific range
     */
    SecureSheets.getRangeData = async function(range, options = {}) {
        if (!range || typeof range !== 'string') {
            throw SecureSheets.createError(
                'Range reference is required (e.g., "A1:B10" or "Sheet2!A1:D20")',
                'INVALID_RANGE_REFERENCE'
            );
        }

        const params = {
            action: 'getRange',
            range: range.toUpperCase()
        };

        return await SecureSheets.makeRequest(params, options);
    };

    /**
     * NEW: Get data from multiple cells in a single request
     */
    SecureSheets.getCellDataBatch = async function(cells, options = {}) {
        if (!Array.isArray(cells) || cells.length === 0) {
            throw SecureSheets.createError(
                'Cells array is required',
                'INVALID_BATCH_CELLS'
            );
        }

        const params = {
            action: 'getCellBatch',
            cells: cells.map(c => c.toUpperCase()).join(',')
        };

        return await SecureSheets.makeRequest(params, options);
    };

    /**
     * Get multiple sheets data
     */
    SecureSheets.getDataMultiSheet = async function(sheets, options = {}) {
        return await SecureSheets.getData(sheets, options);
    };

    /**
     * POST request for data
     */
    SecureSheets.postData = async function(data, options = {}) {
        return await SecureSheets.makePostRequest(data, options);
    };

    /**
     * POST convenience method for single sheet 
     */
    SecureSheets.postGetSheetData = async function(sheet, additionalParams = {}, options = {}) {
        return await SecureSheets.makePostRequest({
            action: 'getData',
            sheet: sheet,
            ...additionalParams
        }, options);
    };

    /**
     * POST convenience method for multiple sheets 
     */
    SecureSheets.postGetMultiSheetData = async function(sheets, additionalParams = {}, options = {}) {
        return await SecureSheets.makePostRequest({
            action: 'getData',
            sheets: Array.isArray(sheets) ? sheets.join(',') : sheets,
            ...additionalParams
        }, options);
    };

    /**
     * NEW: Get cell data via POST (with CSRF protection)
     */
    SecureSheets.getCellDataPost = async function(cell, options = {}) {
        if (!cell || typeof cell !== 'string') {
            throw SecureSheets.createError(
                'Cell reference is required',
                'INVALID_CELL_REFERENCE'
            );
        }

        const body = {
            action: 'getCell',
            cell: cell.toUpperCase()
        };

        return await SecureSheets.makePostRequest(body, options);
    };

// ============================================
    // SECURITY UTILITIES
    // ============================================

    /**
     * Verify webhook signature
     */
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
            console.error('SecureSheets: Webhook verification failed:', error);
            return false;
        }
    };

    /**
     * NEW: Decrypt data using XOR cipher
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
            throw SecureSheets.createError(
                'Decryption failed - ' + error.message,
                'DECRYPTION_FAILED',
                { originalError: error.toString() }
            );
        }
    };

    /**
     * NEW: Encrypt data using XOR cipher
     */
    SecureSheets.encryptData = function(data, key) {
        try {
            const jsonString = JSON.stringify(data);
            
            let encrypted = '';
            for (let i = 0; i < jsonString.length; i++) {
                encrypted += String.fromCharCode(
                    jsonString.charCodeAt(i) ^ key.charCodeAt(i % key.length)
                );
            }
            
            return btoa(encrypted);
        } catch (error) {
            throw SecureSheets.createError(
                'Encryption failed - ' + error.message,
                'ENCRYPTION_FAILED',
                { originalError: error.toString() }
            );
        }
    };

    /**
     * Test connection to server
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
            try {
                const health = await SecureSheets.healthCheck();
                results.tests.health.passed = health.status === 'online' || health.status === 'healthy';
                results.tests.health.message = results.tests.health.passed ? 
                    'Server is online' : 'Server returned unexpected status';
                results.tests.health.data = health;
            } catch (error) {
                results.tests.health.message = 'Health check failed: ' + error.message;
            }

            try {
                const config = await SecureSheets.getServerConfig();
                results.tests.config.passed = config.success === true;
                results.tests.config.message = config.success ? 
                    'Config endpoint accessible' : 'Config returned error';
                results.tests.config.data = config;
                results.server = config;
            } catch (error) {
                results.tests.config.message = 'Config fetch failed: ' + error.message;
            }

            if (SecureSheets.isConfigured()) {
                try {
                    const data = await SecureSheets.getData(null, { useCache: false });
                    results.tests.auth.passed = data.status === 'success' || data.success === true;
                    results.tests.auth.message = results.tests.auth.passed ? 
                        'Authentication successful' : 'Authentication failed';
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

    // ============================================
    // NONCE MANAGEMENT
    // ============================================

    /**
     * Get nonce status
     */
    SecureSheets.getNonceStatus = function() {
        return {
            enabled: SecureSheets.config.enableNonce,
            usedCount: SecureSheets.usedNonces.size,
            maxTracked: 1000
        };
    };

    /**
     * Clear used nonces
     */
    SecureSheets.clearNonces = function() {
        SecureSheets.usedNonces.clear();
    };

    // ============================================
    // EXPORT TO WINDOW
    // ============================================
    
    window.SecureSheets = SecureSheets;

    if (typeof define === 'function' && define.amd) {
        define([], function() { return SecureSheets; });
    } else if (typeof module === 'object' && module.exports) {
        module.exports = SecureSheets;
    }

    console.log(`SecureSheets Client v${SecureSheets.version} loaded (Server v${SecureSheets.serverVersion})`);
    console.log('✨ Enhanced Edition: Merged Security + Cell Query Features!');

})(window);

/**
 * ============================================================================
 * USAGE EXAMPLES - v1.3.1 ENHANCED EDITION
 * ============================================================================
 * 
 * 1. CONFIGURATION WITH ENVIRONMENT VARIABLES (NEW!)
 * ───────────────────────────────────────────────────────────────────────────
 * 
 * // Node.js style with process.env
 * await SecureSheets.configureWithEnvironment();
 * 
 * // Or pass custom env object
 * await SecureSheets.configureWithEnvironment({
 *   SHEETS_BASE_URL: 'https://script.google.com/macros/s/YOUR_ID/exec',
 *   API_TOKEN: 'your-token',
 *   HMAC_SECRET: 'your-secret',
 *   ENABLE_CSRF: 'true',
 *   ENABLE_NONCE: 'true',
 *   CHECKSUM_VALIDATION: 'true',
 *   ENFORCE_HTTPS: 'true',
 *   DEBUG: 'true'
 * });
 * 
 * 
 * 2. CELL QUERIES - EFFICIENT DATA FETCHING (NEW!)
 * ───────────────────────────────────────────────────────────────────────────
 * 
 * // Get a single cell value
 * const cellData = await SecureSheets.getCellDataEnhanced('A1');
 * console.log(cellData.value);
 * 
 * // Get cell from specific sheet
 * const price = await SecureSheets.getCellDataEnhanced('Prices!B5');
 * 
 * // OLD METHOD: Still supported for B4/B7 cells
 * const apiToken = await SecureSheets.getCellData('B4');
 * 
 * 
 * 3. RANGE QUERIES (NEW!)
 * ───────────────────────────────────────────────────────────────────────────
 * 
 * // Get a range of cells
 * const rangeData = await SecureSheets.getRangeData('A1:C10');
 * console.log(rangeData.values); // 2D array
 * 
 * // Get range from specific sheet
 * const inventory = await SecureSheets.getRangeData('Inventory!A1:D20');
 * 
 * 
 * 4. BATCH CELL QUERIES (NEW!)
 * ───────────────────────────────────────────────────────────────────────────
 * 
 * // Get multiple cells in one request
 * const cells = await SecureSheets.getCellDataBatch([
 *   'A1',
 *   'B5',
 *   'Sheet2!C10',
 *   'Prices!D15'
 * ]);
 * console.log(cells.data); // Array of cell values
 * 
 * 
 * 5. DATA ENCRYPTION/DECRYPTION (NEW!)
 * ───────────────────────────────────────────────────────────────────────────
 * 
 * // Encrypt sensitive data
 * const encrypted = SecureSheets.encryptData(
 *   { secret: 'my-api-key', password: '123456' },
 *   'encryption-key'
 * );
 * 
 * // Decrypt data
 * const decrypted = SecureSheets.decryptData(encrypted, 'encryption-key');
 * console.log(decrypted.secret); // 'my-api-key'
 * 
 * 
 * 6. CHECKSUM VALIDATION - DATA INTEGRITY
 * ───────────────────────────────────────────────────────────────────────────
 * 
 * try {
 *   const data = await SecureSheets.getData('Sheet2');
 *   // Checksum automatically validated
 *   console.log('✅ Data integrity verified');
 * } catch (error) {
 *   if (error.code === 'CHECKSUM_MISMATCH') {
 *     console.error('⚠️ Data was tampered with!');
 *   }
 * }
 * 
 * 
 * 7. REQUEST TIMEOUTS
 * ───────────────────────────────────────────────────────────────────────────
 * 
 * // Custom timeout per request
 * const data = await SecureSheets.getCellDataEnhanced('A1', {
 *   timeout: 10000  // 10 seconds
 * });
 * 
 * 
 * 8. COMPLETE DASHBOARD EXAMPLE
 * ───────────────────────────────────────────────────────────────────────────
 * 
 * async function initDashboard() {
 *   try {
 *     // Configure with environment variables
 *     await SecureSheets.configureWithEnvironment({
 *       SHEETS_BASE_URL: 'https://script.google.com/macros/s/YOUR_ID/exec',
 *       API_TOKEN: 'your-token',
 *       HMAC_SECRET: 'your-secret',
 *       CHECKSUM_VALIDATION: 'true',
 *       ENFORCE_HTTPS: 'true',
 *       DEFAULT_TIMEOUT: '30000',
 *       DEBUG: 'true'
 *     });
 *     
 *     console.log('✅ Configuration validated');
 *     
 *     // Test connection
 *     const test = await SecureSheets.testConnection();
 *     if (!test.success) {
 *       throw new Error('Connection test failed');
 *     }
 *     console.log('✅ Connection test passed');
 *     
 *     // Load public data
 *     const [messages, doodles] = await Promise.all([
 *       SecureSheets.getScrollingMessages(),
 *       SecureSheets.getDoodleEvents()
 *     ]);
 *     console.log('✅ Public data loaded');
 *     
 *     // Efficient cell queries
 *     const metrics = await SecureSheets.getCellDataBatch([
 *       'Sales!A1',
 *       'Users!B2',
 *       'Stock!C5',
 *       'Revenue!D10'
 *     ]);
 *     console.log('✅ Metrics loaded efficiently');
 *     
 *     // Get a range for a chart
 *     const chartData = await SecureSheets.getRangeData('Charts!A1:B10');
 *     console.log('✅ Chart data loaded');
 *     
 *     // Display everything
 *     displayDashboard({ messages, doodles, metrics, chartData });
 *     
 *     console.log('🎉 Dashboard fully initialized!');
 *     
 *   } catch (error) {
 *     console.error('Dashboard error:', error);
 *     const formatted = SecureSheets.formatError(error);
 *     displayError(formatted);
 *   }
 * }
 * 
 * 
 * 9. COMPARISON: OLD vs NEW APPROACH
 * ───────────────────────────────────────────────────────────────────────────
 * 
 * // OLD WAY - Downloads entire sheet (inefficient)
 * const sheet = await SecureSheets.getData('Sales');
 * const cellValue = sheet.data.rows[0][0]; // Extract A1
 * 
 * // NEW WAY - Downloads only A1 (efficient!)
 * const cellData = await SecureSheets.getCellDataEnhanced('Sales!A1');
 * const cellValue = cellData.value;
 * 
 * // EVEN BETTER - Batch multiple cells in one request!
 * const cells = await SecureSheets.getCellDataBatch([
 *   'Sales!A1',
 *   'Sales!B1',
 *   'Sales!C1'
 * ]);
 * 
 * 
 * 10. ERROR HANDLING - ALL ERROR CODES
 * ───────────────────────────────────────────────────────────────────────────
 * 
 * try {
 *   const data = await SecureSheets.getCellDataEnhanced('A1');
 * } catch (error) {
 *   const formatted = SecureSheets.formatError(error);
 *   
 *   switch (error.code) {
 *     // Configuration errors
 *     case 'CONFIG_REQUIRED':
 *     case 'CONFIG_MISSING_URL':
 *     case 'CONFIG_HTTPS_REQUIRED':
 *     case 'ENV_CONFIG_MISSING':
 *       console.error('Configuration error:', formatted);
 *       break;
 *     
 *     // Request errors
 *     case 'TIMEOUT':
 *       console.error('Request timed out:', error.details.timeout);
 *       break;
 *     
 *     case 'CHECKSUM_MISMATCH':
 *       console.error('Data integrity check failed!');
 *       break;
 *     
 *     case 'RATE_LIMIT_EXCEEDED':
 *       console.error('Rate limit hit:', error.details);
 *       break;
 *     
 *     // Query errors
 *     case 'INVALID_CELL_REFERENCE':
 *     case 'INVALID_RANGE_REFERENCE':
 *     case 'INVALID_BATCH_CELLS':
 *       console.error('Invalid query:', formatted);
 *       break;
 *     
 *     // Encryption errors
 *     case 'ENCRYPTION_FAILED':
 *     case 'DECRYPTION_FAILED':
 *       console.error('Encryption error:', formatted);
 *       break;
 *     
 *     // Authentication errors
 *     case 'ERR_AUTH_001':
 *     case 'ERR_AUTH_002':
 *     case 'ERR_AUTH_005':
 *     case 'ERR_AUTH_006':
 *       console.error('Authentication error:', formatted);
 *       break;
 *     
 *     default:
 *       console.error('Unexpected error:', formatted);
 *   }
 * }
 * 
 * 
 */
