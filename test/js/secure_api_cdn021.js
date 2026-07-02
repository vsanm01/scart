/**
 * GSRCDN Secure API Library
 * Version: 1.2.0
 *
 * A client-side library for making requests to a Google Apps Script backend
 * built on the SecureSheets library (v3.8.1) + the GSRECOM router (v1.4.0).
 *
 * v1.2.0 CHANGES — GSRECOM v1.4.0 compatibility:
 * - makePublicRequest() now sends &origin=/&referrer= automatically (same
 *   value GSRCDN.makeRequest() already sends). GSRECOM v1.4.0 turns on
 *   domain validation for the scrolling/doodle/coupons/modal endpoints by
 *   default, so without this every public-endpoint call would come back
 *   { error: 'Access denied', code: 'ERR_SEC_003' }.
 * - getScrollingMessages() / getDoodleEvents() / getCoupons() /
 *   getModalContent() all take a new optional additionalParams object, so
 *   you can override origin/referrer, or pass 'user-ip' if you have a
 *   trusted source for the visitor's real IP (see IMPORTANT notes below —
 *   this library does not fetch that IP for you).
 * - FIX: getModalContent() never actually sent the `range` param that
 *   GSRECOM's modal endpoint requires, so every call failed with
 *   "Range parameter is required" regardless of server version. `range`
 *   is now a required second argument:
 *   getModalContent(sheetName, range, additionalParams).
 * - Still no token or HMAC signature on the public path — that part of
 *   GSRECOM v1.4.0 is unchanged.
 *
 * v1.1.1 FIX: getData() now sends the `sheet` query param (what SecureSheets'
 * handleProtectedRequest actually reads via e.parameter.sheet). Previous
 * versions sent `dataType`, which the server silently ignored, causing every
 * getData() call to fall back to config.mainSheetName regardless of which
 * sheet was requested.
 *
 * IMPORTANT - READ BEFORE USE:
 * - This backend is READ-ONLY. Only `action=getData` is implemented
 *   server-side (both handleGetRequest and handlePostRequest). There is no
 *   add/update/delete endpoint, so those methods have been removed below.
 * - All requests are sent as GET (the backend's POST path also only
 *   supports getData, so there's no benefit to using POST here).
 * - SECURITY NOTE: hmacSecret and apiToken are visible to anyone who views
 *   page source or the Network tab. They are NOT a real secret in a
 *   browser context - treat them as light obfuscation, not access control.
 *   Use this only for data that's okay to expose publicly. For anything
 *   sensitive, proxy requests through a server you control that holds the
 *   real secret.
 * - The router's public endpoints (scrolling / doodle / coupons / modal)
 *   still need NO token or signature. As of GSRECOM v1.4.0, though, they
 *   are not fully open either: by default the server checks
 *   &origin=/&referrer= against an allowed domain, and separately checks
 *   &user-ip= against an IP blacklist. This library sends origin/referrer
 *   for you automatically; it does NOT send user-ip, because a browser has
 *   no reliable way to learn its own public IP — without one, the
 *   blacklist check simply has nothing to match against. Both checks fail
 *   OPEN if GSRECOM's own Sheet1 config can't load, and both read
 *   client-supplied query params that GSRECOM's own docs describe as
 *   deterrents against casual misuse, not hard security boundaries — see
 *   GSRECOM's v1.4.0 changelog for the full fail-open/fail-closed behavior.
 *
 * Dependencies: CryptoJS (for HMAC-SHA256) - only needed if you call
 * GSRCDN.getData() (the protected/signed path).
 * - Include before this script: https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js
 *
 * Usage:
 * 1. Configure your API settings with GSRCDN.configure()
 * 2. Make requests with GSRCDN.getData() (protected/signed) or
 *    GSRCDN.getScrollingMessages() / getDoodleEvents() / getCoupons() /
 *    getModalContent() (public, no token/signature, matches the router)
 */

(function(window) {
    'use strict';

    // ============================================
    // GSRCDN NAMESPACE
    // ============================================
    const GSRCDN = {
        version: '1.2.0',
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
    // ORIGIN HELPER (internal)
    // ============================================
    /**
     * Resolve the page's origin for the origin/referrer params GSRECOM
     * v1.4.0's access-control layer and SecureSheets both read. Guards the
     * literal string "null" that window.location.origin returns on
     * file:// pages, so both params fall back to '' consistently instead.
     * Not attached to GSRCDN - internal use only.
     * @returns {string}
     */
    function getPageOrigin() {
        return (window.location.origin && window.location.origin !== 'null') ? window.location.origin : '';
    }

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
            requestParams.timestamp = new Date().toISOString(); // ISO string required by SecureSheets v3.8.1 validateTokenExpiration()
            // Guard null origin (file:// pages) — empty string keeps HMAC params consistent both sides
            const _pageOrigin = getPageOrigin();
            requestParams.referrer = _pageOrigin;
            requestParams.origin   = _pageOrigin;

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
     * @param {string} sheetName - Sheet to retrieve (must match SecureSheets'
     *   `sheet` query param exactly, e.g. "Sheet2", "Sheet4") — NOT a friendly
     *   name. The server reads e.parameter.sheet; anything else is silently
     *   ignored and falls back to config.mainSheetName server-side.
     * @param {Object} [additionalParams] - Additional parameters
     * @returns {Promise<Object>} API response
     */
    GSRCDN.getData = async function(sheetName, additionalParams = {}) {
        return GSRCDN.makeRequest({
            action: 'getData',
            sheet: sheetName,
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
    // PUBLIC ENDPOINTS (router-handled, no token/signature)
    // ============================================
    // These match the public branches in GSRECOM's handleGetRequest: no
    // token, no HMAC signature, no timestamp required — that part is
    // unchanged. As of GSRECOM v1.4.0, though, they are no longer fully
    // open: by default the server also checks &origin=/&referrer= against
    // an allowed domain and &user-ip= against an IP blacklist. See
    // makePublicRequest()'s JSDoc below for what this library does (and
    // doesn't) send automatically.

    /**
     * Make an unsigned request to one of the router's public endpoints.
     *
     * GSRECOM v1.4.0+: these endpoints still take no token or HMAC
     * signature, but they are no longer fully open. By default the server
     * checks &origin=/&referrer= against an allowed domain
     * (config.enableDomainValidation) and, separately, an IP blacklist read
     * from &user-ip=/x-forwarded-for/x-real-ip
     * (config.enableIpBlacklistOnPublicEndpoints) - both on by default.
     * This method sends origin/referrer automatically (same value/logic as
     * makeRequest()) so calls keep working under those defaults. It does
     * NOT send user-ip - a browser can't learn its own public IP, so
     * without one the blacklist check just has nothing to match against.
     * Pass 'user-ip' via additionalParams if you have a trusted source for
     * the visitor's real IP.
     *
     * @param {Object} params - Query parameters (must include sheet + type).
     *   May include origin/referrer/user-ip to override the auto-filled values.
     * @param {Object} [options] - timeout/headers, same as makeRequest
     * @returns {Promise<Object>} API response. Denials resolve normally
     *   (matching this endpoint's existing error convention) as
     *   { error: 'Access denied', code: 'ERR_SEC_003' | 'ERR_SEC_007' } -
     *   003 is a domain mismatch, 007 is an IP blacklist hit.
     */
    GSRCDN.makePublicRequest = async function(params, options = {}) {
        if (!GSRCDN.config.scriptUrl) {
            throw new Error('GSRCDN: API not configured. Call GSRCDN.configure() first.');
        }
        if (!params || typeof params !== 'object') {
            throw new Error('GSRCDN: Request parameters must be an object');
        }

        try {
            GSRCDN.checkRateLimit();

            // GSRECOM v1.4.0 validates these against Sheet1 B2 by default.
            // Explicit params (e.g. a caller-supplied override) win.
            const pageOrigin = getPageOrigin();
            const requestParams = { ...params };
            if (requestParams.origin === undefined)   requestParams.origin   = pageOrigin;
            if (requestParams.referrer === undefined) requestParams.referrer = pageOrigin;

            const url = new URL(GSRCDN.config.scriptUrl);
            Object.keys(requestParams).forEach(key => {
                if (requestParams[key] !== undefined && requestParams[key] !== null) {
                    url.searchParams.append(key, requestParams[key]);
                }
            });

            if (GSRCDN.config.debug) {
                console.log('GSRCDN: Public request to:', url.toString());
            }

            const fetchOptions = {
                method: 'GET',
                headers: { 'Accept': 'application/json', ...options.headers }
            };

            const timeout = options.timeout || 30000;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            fetchOptions.signal = controller.signal;

            const response = await fetch(url, fetchOptions);
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`GSRCDN: HTTP error! Status: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            if (GSRCDN.config.debug) {
                console.log('GSRCDN: Public response received:', data);
                if (data && (data.code === 'ERR_SEC_003' || data.code === 'ERR_SEC_007')) {
                    console.warn('GSRCDN: request denied by GSRECOM access control:', data.code, data.error);
                }
            }

            return data;

        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('GSRCDN: Request timeout');
            }
            console.error('GSRCDN: Public request error:', error);
            throw error;
        }
    };

    /**
     * Get scrolling messages (GSRECOM router: Sheet3, rows 1-90, ?type=scrolling).
     * @param {string} sheetName - Must match config.scrollingSheet on the server (default 'Sheet3')
     * @param {Object} [additionalParams] - Additional parameters (e.g. override
     *   origin/referrer, or pass 'user-ip' — see file header IMPORTANT notes)
     * @returns {Promise<Object>} API response
     */
    GSRCDN.getScrollingMessages = async function(sheetName = 'Sheet3', additionalParams = {}) {
        return GSRCDN.makePublicRequest({ sheet: sheetName, type: 'scrolling', ...additionalParams });
    };

    /**
     * Get doodle events (GSRECOM router: Sheet3, rows 100-149, ?type=doodle).
     * @param {string} sheetName - Must match config.doodleSheet on the server (default 'Sheet3')
     * @param {Object} [additionalParams] - Additional parameters, see getScrollingMessages
     * @returns {Promise<Object>} API response
     */
    GSRCDN.getDoodleEvents = async function(sheetName = 'Sheet3', additionalParams = {}) {
        return GSRCDN.makePublicRequest({ sheet: sheetName, type: 'doodle', ...additionalParams });
    };

    /**
     * Get coupons (GSRECOM router: Sheet3, rows 150+, ?type=coupons).
     * @param {string} sheetName - Must match config.couponSheet on the server (default 'Sheet3')
     * @param {Object} [additionalParams] - Additional parameters, see getScrollingMessages
     * @returns {Promise<Object>} API response
     */
    GSRCDN.getCoupons = async function(sheetName = 'Sheet3', additionalParams = {}) {
        return GSRCDN.makePublicRequest({ sheet: sheetName, type: 'coupons', ...additionalParams });
    };

    /**
     * Get modal content (GSRECOM router: Sheet5 or Sheet6, ?type=modal).
     *
     * v1.2.0 FIX: this previously never sent `range`, which GSRECOM's
     * _handleModalContent requires — every call resolved with
     * { error: 'Range parameter is required' }, regardless of server
     * version. `range` is now a required argument instead of being
     * silently omitted.
     *
     * @param {string} sheetName - Must be one of config.modalSheets on the server ('Sheet5' or 'Sheet6')
     * @param {string} range - A1 notation range or comma-separated cells, e.g. 'A1:B4' or 'A1,C3'
     * @param {Object} [additionalParams] - Additional parameters, see getScrollingMessages
     * @returns {Promise<Object>} API response
     */
    GSRCDN.getModalContent = async function(sheetName, range, additionalParams = {}) {
        if (!sheetName) {
            throw new Error('GSRCDN: getModalContent requires a sheetName ("Sheet5" or "Sheet6")');
        }
        if (!range) {
            throw new Error('GSRCDN: getModalContent requires a range (e.g. "A1:B4" or "A1,C3")');
        }
        return GSRCDN.makePublicRequest({ sheet: sheetName, type: 'modal', range: range, ...additionalParams });
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
