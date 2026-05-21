/**
 * Animated Doodle System with GSRCDN Integration
 * Version: 5.0.0
 * 
 * TERMINOLOGY CLARIFICATION:
 *   - DOODLE = Top header special event graphic (like Google Doodles)
 *             Temporary, animated, date-specific graphics for holidays/events
 *   - LOGO   = Second row permanent brand/site logo
 *             Your business identity that stays constant
 * 
 * This system manages DOODLES (event graphics), not logos.
 * 
 * Fixes from v4.1.1:
 *   - [BUG #1] GSRCDN.makeRequest() now called directly with correct parameters
 *   - [BUG #2] Response shape accepts both {success: true} and {status: 'success'}
 *   - [BUG #3] Year-wrap date logic tightened
 *   - [BUG #4] Cache version tracking
 *   - [NEW] Renamed everything from "logo" → "doodle" for clarity
 * 
 * Features:
 *   - Priority system for overlapping events
 *   - Smooth transitions between doodles
 *   - Retry logic for failed requests
 *   - Configuration validation
 *   - Per-doodle custom links
 *   - Analytics callback
 *   - Debug mode
 *   - Universal date parser (10+ formats)
 *   - Universal image source parser (11+ types)
 */

(function(window) {
    'use strict';

    const AnimatedDoodleSystem = {
        config: {
            // DOM selectors
            doodleContainer: '#siteDoodle',      // Top header doodle element
            doodleLink: '.doodle a',             // Doodle link wrapper
            logoContainer: '#siteLogo',          // Second row brand logo (for reference)
            defaultDoodle: 'logo.png',           // Fallback when no event is active
            width: 120,
            height: 55,

            // GSRCDN Configuration
            scriptUrl: '',
            sheetName: 'Sheet3',
            startRow: 101,

            // Cache settings
            cacheKey: 'animatedDoodles_cache',
            cacheDuration: 3600000, // 1 hour

            // Retry configuration
            maxRetries: 3,
            retryDelay: 2000, // ms

            // Transition settings
            enableTransitions: true,
            transitionDuration: 300, // ms

            // Image path configurations (universal)
            cdnPath: '',           // e.g. 'https://cdn.example.com/doodles/'
            imgixDomain: '',       // e.g. 'mystore.imgix.net'
            cloudinaryCloud: '',   // e.g. 'mycloud'
            githubRepo: '',        // e.g. 'username/repo@main/doodles/'

            fallbackFormat: 'png',
            clickAction: 'home',   // 'home' | 'special-page' | 'none'
            specialPageUrl: '/special-event',

            // Analytics callback
            onDoodleChange: null,  // function(eventName, doodleData) {}

            // Debug mode (suppresses logs when false)
            debug: false,

            fallbackDoodles: {
                'default': {
                    src: 'logo.png',
                    alt: 'Store Logo',
                    animated: false
                }
            }
        },

        animatedDoodles: {},
        currentDoodle: null,
        isLoading: false,
        retryCount: 0,
        autoCheckInterval: null,
        autoRefreshInterval: null,

        // ─────────────────────────────────────────
        // INIT
        // ─────────────────────────────────────────

        init: async function(userConfig = {}) {
            this.config = { ...this.config, ...userConfig };
            this.log('🚀 Initializing Animated Doodle System v5.0.0');

            try {
                await this.loadDoodlesFromGSRCDNWithRetry();
                this.detectCurrentEvent();
                this.loadDoodle();
                this.setupClickHandler();
                this.startAutoCheck();
                this.log('✅ Animated Doodle System initialized successfully');
            } catch (error) {
                console.error('❌ Failed to initialize doodle system:', error);
                this.useFallbackDoodles();
            }

            return this;
        },

        // ─────────────────────────────────────────
        // FETCH WITH RETRY
        // ─────────────────────────────────────────

        loadDoodlesFromGSRCDNWithRetry: async function() {
            for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
                try {
                    await this.loadDoodlesFromGSRCDN();
                    return;
                } catch (error) {
                    this.log(`⚠️ Attempt ${attempt}/${this.config.maxRetries} failed:`, error.message);
                    if (attempt < this.config.maxRetries) {
                        this.log(`⏳ Retrying in ${this.config.retryDelay}ms...`);
                        await this.sleep(this.config.retryDelay);
                    } else {
                        throw error;
                    }
                }
            }
        },

        loadDoodlesFromGSRCDN: async function() {
            const cachedData = this.getFromCache();
            if (cachedData) {
                this.log('📦 Using cached doodle data');
                this.animatedDoodles = cachedData;
                return;
            }

            this.log('📡 Fetching doodle data from GSRCDN...');

            try {
                let doodleData;

                if (window.GSRCDN && typeof GSRCDN.makeRequest === 'function') {
                    this.log('📡 Using GSRCDN.makeRequest method');

                    // FIX: Use makeRequest() directly so we control the exact parameter names.
                    // GSRCDN.getData() sends the sheet name as 'dataType', but the Apps Script
                    // expects 'sheetName'. Calling makeRequest() directly sends the correct keys.
                    doodleData = await GSRCDN.makeRequest({
                        action   : 'getData',
                        sheetName: this.config.sheetName,
                        startRow : this.config.startRow
                    });
                } else {
                    this.log('📡 Using direct fetch method');
                    const requestBody = {
                        action: 'getData',
                        sheetName: this.config.sheetName,
                        startRow: this.config.startRow
                    };

                    const response = await fetch(this.config.scriptUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain' },
                        body: JSON.stringify(requestBody)
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    doodleData = await response.json();
                }

                this.log('📊 Doodle data received:', doodleData);

                if (!doodleData) {
                    throw new Error('No doodle data returned from GSRCDN');
                }

                this.animatedDoodles = this.parseGSRCDNData(doodleData);
                this.validateDoodleConfig();
                this.saveToCache(this.animatedDoodles);

                this.log('✅ Doodle data loaded from GSRCDN');
            } catch (error) {
                console.error('❌ Error fetching from GSRCDN:', error);
                throw error;
            }
        },

        // ─────────────────────────────────────────
        // PARSE
        // ─────────────────────────────────────────

        parseGSRCDNData: function(response) {
            this.log('🔍 Parsing GSRCDN response');

            let rows = [];

            // FIX #2: GSRCDN.makeRequest() returns { status: 'success', data: [...] }
            // but the old check looked for response.success (boolean), which was always
            // undefined → every successful response fell through to the error branch.
            // Now we accept either shape: { success: true } OR { status: 'success' }.
            const isSuccess =
                (response && response.success === true) ||
                (response && response.status === 'success');

            if (isSuccess && Array.isArray(response.data)) {
                rows = response.data;
                this.log('📊 Found', rows.length, 'doodle entries');
            } else if (Array.isArray(response)) {
                rows = response;
            } else if (response && Array.isArray(response.data)) {
                rows = response.data;
            } else {
                console.error('❌ Invalid data format:', response);
                throw new Error('Invalid GSRCDN response format');
            }

            if (!rows || rows.length === 0) {
                throw new Error('No doodle data found in response');
            }

            const doodles = {};

            rows.forEach((row) => {
                if (!row.eventName || row.eventName === '' || row.eventName === '-') {
                    this.log('⚠️ Skipping row without eventName:', row);
                    return;
                }

                const isEnabled = row.enabled !== undefined
                    ? (row.enabled === true || row.enabled === 'true' || row.enabled === 1)
                    : true;

                if (!isEnabled) {
                    this.log('⏭️ Skipping disabled event:', row.eventName);
                    return;
                }

                const eventKey = row.eventName.toLowerCase().trim();

                doodles[eventKey] = {
                    src: this.parseImageSource(row.src),       // universal image parser
                    alt: row.alt || 'Event Doodle',
                    animated: row.animated === true || row.animated === 'true' || row.animated === 1,
                    startDate: this.parseUniversalDate(row.startDate),
                    endDate: this.parseUniversalDate(row.endDate),
                    manual: row.manual === true || row.manual === 'true' || row.manual === 1 || false,
                    priority: this.parsePriority(row.priority),
                    link: row.link || null
                };

                this.log(`✅ Parsed doodle: ${eventKey}`, doodles[eventKey]);
            });

            if (!doodles['default']) {
                this.log('⚠️ No default doodle found, using fallback');
                doodles['default'] = this.config.fallbackDoodles['default'];
            }

            this.log('📦 Total doodles loaded:', Object.keys(doodles).length);
            return doodles;
        },

        // ─────────────────────────────────────────
        // UNIVERSAL DATE PARSER
        // Supports: MM-DD, MM/DD, YYYY-MM-DD, YYYY/MM/DD, DD MMM,
        //           MMM DD, Unix timestamp, relative dates, ISO 8601,
        //           full date strings (e.g. "Sun Dec 25 2025 00:00:00 GMT+0530")
        // ─────────────────────────────────────────

        parseUniversalDate: function(dateInput) {
            if (!dateInput || dateInput === '-' || dateInput === '' ||
                dateInput === null || dateInput === undefined) {
                return null;
            }

            const dateStr = String(dateInput).trim();
            this.log(`🔍 Parsing date: "${dateStr}"`);

            // MM-DD
            if (/^\d{2}-\d{2}$/.test(dateStr)) {
                return dateStr;
            }

            // MM/DD
            if (/^\d{1,2}\/\d{1,2}$/.test(dateStr)) {
                const [month, day] = dateStr.split('/');
                return `${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            }

            // YYYY-MM-DD or YYYY/MM/DD
            if (/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/.test(dateStr)) {
                try {
                    const date = new Date(dateStr);
                    if (!isNaN(date.getTime())) {
                        return this._toMMDD(date);
                    }
                } catch (e) { /* fall through */ }
            }

            // Month-name formats ("25 Dec", "Dec 25", "December 25", "25 December")
            const monthNames = {
                jan: '01', january: '01',
                feb: '02', february: '02',
                mar: '03', march: '03',
                apr: '04', april: '04',
                may: '05',
                jun: '06', june: '06',
                jul: '07', july: '07',
                aug: '08', august: '08',
                sep: '09', sept: '09', september: '09',
                oct: '10', october: '10',
                nov: '11', november: '11',
                dec: '12', december: '12'
            };

            const monthPattern = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)';

            const dayMonthMatch = dateStr.match(new RegExp(`(\\d{1,2})\\s+${monthPattern}`, 'i'));
            if (dayMonthMatch) {
                const month = monthNames[dayMonthMatch[2].toLowerCase()];
                const day = dayMonthMatch[1].padStart(2, '0');
                return `${month}-${day}`;
            }

            const monthDayMatch = dateStr.match(new RegExp(`${monthPattern}\\s+(\\d{1,2})`, 'i'));
            if (monthDayMatch) {
                const month = monthNames[monthDayMatch[1].toLowerCase()];
                const day = monthDayMatch[2].padStart(2, '0');
                return `${month}-${day}`;
            }

            // Unix timestamp (ms, 13 digits)
            if (/^\d{13}$/.test(dateStr)) {
                try {
                    const date = new Date(parseInt(dateStr, 10));
                    if (!isNaN(date.getTime())) return this._toMMDD(date);
                } catch (e) { /* fall through */ }
            }

            // Relative: "today", "tomorrow", "in X days", "after X days"
            const today = new Date();
            const lower = dateStr.toLowerCase();

            if (lower === 'today') return this._toMMDD(today);

            if (lower === 'tomorrow') {
                const d = new Date(today);
                d.setDate(d.getDate() + 1);
                return this._toMMDD(d);
            }

            const relMatch = dateStr.match(/(in|after)\s+(\d+)\s+days?/i);
            if (relMatch) {
                const d = new Date(today);
                d.setDate(d.getDate() + parseInt(relMatch[2], 10));
                return this._toMMDD(d);
            }

            // Generic last-resort parse (handles full date strings, ISO 8601, etc.)
            try {
                const date = new Date(dateStr);
                if (!isNaN(date.getTime())) return this._toMMDD(date);
            } catch (e) { /* fall through */ }

            console.error('❌ Unrecognized date format:', dateStr);
            return null;
        },

        /** Helper: Date → "MM-DD" */
        _toMMDD: function(date) {
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day   = String(date.getDate()).padStart(2, '0');
            return `${month}-${day}`;
        },

        // ─────────────────────────────────────────
        // UNIVERSAL IMAGE SOURCE PARSER
        // Supports: full URLs, relative paths, cdn:, imgix:, cloudinary:,
        //           github:, gh:, drive:, gdrive:, dropbox:, npm:, unpkg:,
        //           data URIs
        // ─────────────────────────────────────────

        parseImageSource: function(srcInput) {
            if (!srcInput || srcInput === '' || srcInput === '-') {
                this.log('⚠️ Empty image source, using default');
                return this.config.defaultDoodle;
            }

            const src = String(srcInput).trim();
            this.log(`🔍 Parsing image source: "${src}"`);

            // Full URL
            if (/^https?:\/\//i.test(src)) return src;

            // Data URI
            if (/^data:image\//i.test(src)) return src;

            // cdn:filename
            if (src.startsWith('cdn:')) {
                return this.config.cdnPath + src.substring(4);
            }

            // imgix:filename
            if (src.startsWith('imgix:')) {
                return `https://${this.config.imgixDomain}/${src.substring(6)}`;
            }

            // cloudinary:path
            if (src.startsWith('cloudinary:')) {
                return `https://res.cloudinary.com/${this.config.cloudinaryCloud}/image/upload/${src.substring(11)}`;
            }

            // github:filename  (uses config.githubRepo as base)
            if (src.startsWith('github:')) {
                return `https://cdn.jsdelivr.net/gh/${this.config.githubRepo}${src.substring(7)}`;
            }

            // gh:username/repo@branch/path/file  (fully-specified)
            if (src.startsWith('gh:')) {
                return `https://cdn.jsdelivr.net/gh/${src.substring(3)}`;
            }

            // drive: or gdrive:FILE_ID
            if (src.startsWith('drive:') || src.startsWith('gdrive:')) {
                const fileId = src.split(':')[1];
                return `https://drive.google.com/uc?export=view&id=${fileId}`;
            }

            // dropbox:path
            if (src.startsWith('dropbox:')) {
                return `https://www.dropbox.com/s/${src.substring(8)}?raw=1`;
            }

            // npm:package@version/file
            if (src.startsWith('npm:')) {
                return `https://cdn.jsdelivr.net/npm/${src.substring(4)}`;
            }

            // unpkg:package@version/file
            if (src.startsWith('unpkg:')) {
                return `https://unpkg.com/${src.substring(6)}`;
            }

            // Relative path — resolve against cdnPath if set
            if (this.config.cdnPath) {
                const clean = src.replace(/^\.?\//, '');
                return this.config.cdnPath + clean;
            }

            // Fallback: use as-is
            return src;
        },

        // ─────────────────────────────────────────
        // PRIORITY PARSER
        // ─────────────────────────────────────────

        parsePriority: function(priority) {
            if (!priority || priority === '-' || priority === '') return 0;
            const parsed = parseInt(priority, 10);
            return isNaN(parsed) ? 0 : parsed;
        },

        // ─────────────────────────────────────────
        // VALIDATION
        // ─────────────────────────────────────────

        validateDoodleConfig: function() {
            const issues = [];

            for (const [eventName, doodleData] of Object.entries(this.animatedDoodles)) {
                if (!doodleData.src || doodleData.src === '') {
                    issues.push(`Event "${eventName}" has no image source`);
                }

                if (doodleData.startDate && doodleData.endDate) {
                    const [startM, startD] = doodleData.startDate.split('-').map(Number);
                    const [endM, endD]     = doodleData.endDate.split('-').map(Number);

                    if (startM === endM && startD > endD) {
                        issues.push(`Event "${eventName}" has start date after end date in same month`);
                    }
                }
            }

            if (issues.length > 0) {
                console.warn('⚠️ Doodle configuration issues:', issues);
            }

            return issues.length === 0;
        },

        // ─────────────────────────────────────────
        // CACHE
        // ─────────────────────────────────────────

        saveToCache: function(data) {
            try {
                localStorage.setItem(this.config.cacheKey, JSON.stringify({
                    timestamp: Date.now(),
                    version: '5.0.0',
                    data
                }));
                this.log('💾 Cached doodle data');
            } catch (error) {
                this.log('⚠️ Failed to save cache:', error);
            }
        },

        getFromCache: function() {
            try {
                const raw = localStorage.getItem(this.config.cacheKey);
                if (!raw) return null;

                const cached = JSON.parse(raw);

                // Version bumped to 5.0.0 — auto-busts any older cache
                if (cached.version !== '5.0.0') {
                    this.log('🔄 Cache version mismatch, invalidating');
                    localStorage.removeItem(this.config.cacheKey);
                    return null;
                }

                if (Date.now() - cached.timestamp < this.config.cacheDuration) {
                    return cached.data;
                }

                localStorage.removeItem(this.config.cacheKey);
                return null;
            } catch (error) {
                this.log('⚠️ Failed to read cache:', error);
                return null;
            }
        },

        clearCache: function() {
            localStorage.removeItem(this.config.cacheKey);
            this.log('🗑️ Cache cleared');
        },

        // ─────────────────────────────────────────
        // EVENT DETECTION (with priority)
        // ─────────────────────────────────────────

        useFallbackDoodles: function() {
            this.log('⚠️ Using fallback doodles');
            this.animatedDoodles = this.config.fallbackDoodles;
            this.currentDoodle = 'default';
            this.loadDoodle();
        },

        detectCurrentEvent: function() {
            const currentDate = this._toMMDD(new Date());
            this.log('📅 Current date:', currentDate);

            const activeEvents = [];

            for (const [eventName, eventData] of Object.entries(this.animatedDoodles)) {
                if (eventData.manual || eventName === 'default') continue;

                if (eventData.startDate && eventData.endDate) {
                    if (this.isDateInRange(currentDate, eventData.startDate, eventData.endDate)) {
                        activeEvents.push({
                            name: eventName,
                            priority: eventData.priority || 0,
                            data: eventData
                        });
                        this.log('✅ Active event:', eventName, '(priority:', eventData.priority || 0, ')');
                    }
                }
            }

            if (activeEvents.length > 0) {
                activeEvents.sort((a, b) => b.priority - a.priority);
                this.currentDoodle = activeEvents[0].name;
                this.log('🎯 Selected:', this.currentDoodle, '(priority:', activeEvents[0].priority, ')');

                if (activeEvents.length > 1) {
                    this.log('ℹ️ Other active events:', activeEvents.slice(1).map(e => e.name).join(', '));
                }
            } else {
                this.currentDoodle = 'default';
                this.log('🏠 Using default doodle');
            }
        },

        // FIX #3: Year-wrap date logic tightened
        isDateInRange: function(current, start, end) {
            const [startMonth, startDay]     = start.split('-').map(Number);
            const [endMonth,   endDay]       = end.split('-').map(Number);
            const [currentMonth, currentDay] = current.split('-').map(Number);

            if (startMonth > endMonth) {
                // Year-wrap (e.g. Dec 27 – Jan 5)
                return (
                    (currentMonth === startMonth && currentDay >= startDay) ||
                    (currentMonth === endMonth   && currentDay <= endDay)   ||
                    (currentMonth > startMonth)  ||
                    (currentMonth < endMonth)
                );
            } else {
                // Normal range (e.g. Dec 25 – Dec 26, or Feb 14 – Feb 15)
                return (
                    (currentMonth === startMonth && currentDay >= startDay) ||
                    (currentMonth === endMonth   && currentDay <= endDay)   ||
                    (currentMonth > startMonth   && currentMonth < endMonth)
                );
            }
        },

        // ─────────────────────────────────────────
        // DOODLE LOADING (with transitions + analytics)
        // ─────────────────────────────────────────

        loadDoodle: function(force = false) {
            const doodleData = this.animatedDoodles[this.currentDoodle];
            if (!doodleData) {
                this.log('⚠️ Doodle data not found for:', this.currentDoodle);
                return;
            }

            const doodleImg = document.querySelector(this.config.doodleContainer);
            if (!doodleImg) {
                this.log('⚠️ Doodle container not found:', this.config.doodleContainer);
                return;
            }

            if (!force && doodleImg.dataset.doodleEvent === this.currentDoodle) {
                this.log('ℹ️ Doodle already loaded:', this.currentDoodle);
                return;
            }

            const doodleUrl = doodleData.src;

            doodleImg.dataset.loading = 'true';

            if (this.config.enableTransitions) {
                doodleImg.style.transition = `opacity ${this.config.transitionDuration}ms ease-in-out`;
                doodleImg.style.opacity = '0';
            }

            this.preloadImage(doodleUrl, () => {
                setTimeout(() => {
                    doodleImg.src    = doodleUrl;
                    doodleImg.alt    = doodleData.alt;
                    doodleImg.width  = this.config.width;
                    doodleImg.height = this.config.height;

                    if (doodleData.animated) {
                        doodleImg.classList.add('animated-doodle');
                    } else {
                        doodleImg.classList.remove('animated-doodle');
                    }

                    doodleImg.dataset.doodleEvent = this.currentDoodle;
                    doodleImg.dataset.loading   = 'false';

                    if (this.config.enableTransitions) {
                        doodleImg.style.opacity = '1';
                    }

                    this.log('✅ Loaded doodle:', doodleData.alt, `(${this.currentDoodle})`);

                    if (typeof this.config.onDoodleChange === 'function') {
                        this.config.onDoodleChange(this.currentDoodle, doodleData);
                    }
                }, this.config.enableTransitions ? this.config.transitionDuration : 0);
            });
        },

        preloadImage: function(url, callback) {
            const img = new Image();
            img.onload  = () => callback && callback();
            img.onerror = () => {
                console.error('❌ Failed to load doodle:', url);
                callback && callback();
            };
            img.src = url;
        },

        // ─────────────────────────────────────────
        // CLICK HANDLER (with custom per-doodle links)
        // ─────────────────────────────────────────

        setupClickHandler: function() {
            const doodleLink = document.querySelector(this.config.doodleLink);
            if (!doodleLink) return;

            const doodleData = this.animatedDoodles[this.currentDoodle];

            if (doodleData?.link) {
                doodleLink.href = doodleData.link;
            } else if (this.config.clickAction === 'special-page' && doodleData?.animated) {
                doodleLink.href = this.config.specialPageUrl;
            } else if (this.config.clickAction === 'home') {
                doodleLink.href = '/';
            }
        },

        // ─────────────────────────────────────────
        // PUBLIC API
        // ─────────────────────────────────────────

        triggerDoodle: function(eventName) {
            if (!this.animatedDoodles[eventName]) {
                console.error('❌ Doodle event not found:', eventName);
                return;
            }
            this.currentDoodle = eventName;
            this.loadDoodle(true);
            this.setupClickHandler();
            this.log('🎯 Manually triggered doodle:', eventName);
        },

        resetDoodle: function() {
            this.currentDoodle = 'default';
            this.loadDoodle(true);
            this.setupClickHandler();
            this.log('🔄 Reset to default doodle');
        },

        refreshDoodles: async function() {
            this.log('🔄 Refreshing doodles from GSRCDN...');
            this.clearCache();
            await this.loadDoodlesFromGSRCDNWithRetry();
            this.detectCurrentEvent();
            this.loadDoodle(true);
            this.setupClickHandler();
        },

        getCurrentDoodle: function() {
            return { event: this.currentDoodle, data: this.animatedDoodles[this.currentDoodle] };
        },

        getAllDoodles: function() {
            return this.animatedDoodles;
        },

        getActiveEvents: function() {
            const currentDate = this._toMMDD(new Date());
            const active = [];

            for (const [eventName, eventData] of Object.entries(this.animatedDoodles)) {
                if (eventName === 'default' || eventData.manual) continue;
                if (eventData.startDate && eventData.endDate) {
                    if (this.isDateInRange(currentDate, eventData.startDate, eventData.endDate)) {
                        active.push({ name: eventName, ...eventData });
                    }
                }
            }

            return active;
        },

        // ─────────────────────────────────────────
        // AUTO-CHECK INTERVALS (with cleanup)
        // ─────────────────────────────────────────

        startAutoCheck: function() {
            this.stopAutoCheck();

            this.autoCheckInterval = setInterval(() => {
                this.log('⏰ Auto-checking for doodle events...');
                this.detectCurrentEvent();
                this.loadDoodle();
            }, 3600000); // 1 hour

            this.autoRefreshInterval = setInterval(() => {
                this.log('⏰ Auto-refreshing from GSRCDN...');
                this.refreshDoodles();
            }, 86400000); // 24 hours
        },

        stopAutoCheck: function() {
            if (this.autoCheckInterval) {
                clearInterval(this.autoCheckInterval);
                this.autoCheckInterval = null;
            }
            if (this.autoRefreshInterval) {
                clearInterval(this.autoRefreshInterval);
                this.autoRefreshInterval = null;
            }
            this.log('⏸️ Auto-check stopped');
        },

        // ─────────────────────────────────────────
        // UTILITIES
        // ─────────────────────────────────────────

        sleep: function(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        log: function(...args) {
            if (this.config.debug) {
                console.log('[AnimatedDoodle]', ...args);
            }
        },

        destroy: function() {
            this.stopAutoCheck();
            this.animatedDoodles = {};
            this.currentDoodle = null;
            this.log('💥 AnimatedDoodleSystem destroyed');
        }
    };

    window.AnimatedDoodleSystem = AnimatedDoodleSystem;

})(window);


/*
============================================================
 animated_doodle_system.js — v5.0.0 DOCUMENTATION
============================================================

TERMINOLOGY:
  🎨 DOODLE = Top header event graphic (temporary, animated)
  🏢 LOGO   = Second row permanent brand mark (stays constant)

This system manages DOODLES, not logos.

============================================================
 GOOGLE SHEETS COLUMN FORMAT (Row 100 = headers)
============================================================

eventName | src | alt | animated | startDate | endDate | manual | enabled | priority | link

Example rows:
default    | https://example.com/logo.png     | Store Logo      | FALSE | -      | -      | FALSE | TRUE | 0  |
christmas  | cdn:christmas-doodle.webp        | Christmas       | TRUE  | Dec 25 | Dec 26 | FALSE | TRUE | 10 | /christmas-sale
newyear    | github:newyear-doodle.gif        | Happy New Year  | TRUE  | Dec 27 | Jan 5  | FALSE | TRUE | 5  |
valentine  | cloudinary:v123/valentine.png    | Valentine's Day | TRUE  | 02-14  | 02-15  | FALSE | TRUE | 8  |
flashsale  | imgix:flash-doodle.webp          | Flash Sale!     | TRUE  | today  | in 1 day| FALSE| TRUE | 20 | /flash-sale
diwali     | drive:1A2B3C4D5E6F7G8H            | Happy Diwali    | TRUE  | Nov 01 | Nov 05 | FALSE | TRUE | 10 |

============================================================
 INIT EXAMPLE
============================================================

await AnimatedDoodleSystem.init({
    // DOM selectors
    doodleContainer: '#siteDoodle',                // Top header doodle
    doodleLink: '.header-top .doodle-link',        // Doodle link wrapper
    logoContainer: '#siteLogo',                     // Your brand logo (for reference)
    width: 120,
    height: 55,

    // GSRCDN config
    scriptUrl: GSRCDN_CONFIG.scriptUrl,
    sheetName: 'Sheet3',
    startRow: 101,

    // ⚠️ cdnPath must be a hosted URL, NOT a local file:/// path
    cdnPath: 'https://cdn.example.com/doodles/',
    imgixDomain: 'store.imgix.net',
    cloudinaryCloud: 'mycloud',
    githubRepo: 'user/repo@main/doodles/',

    // Settings
    cacheDuration: 3600000,
    enableTransitions: true,
    transitionDuration: 300,
    maxRetries: 3,
    retryDelay: 2000,
    clickAction: 'home',
    debug: true,   // ← set true during testing to see all logs

    fallbackDoodles: {
        'default': {
            src: SHOP_CONFIG.logo || 'logo.png',
            alt: SHOP_CONFIG.businessName || 'Store',
            animated: false
        }
    },

    onDoodleChange: function(eventName, doodleData) {
        // Example: Mirror to mobile header
        const mobileDoodle = document.getElementById('siteDoodleMobile');
        if (mobileDoodle) {
            mobileDoodle.src = doodleData.src;
            mobileDoodle.alt = doodleData.alt;
            mobileDoodle.classList.toggle('animated-doodle', !!doodleData.animated);
        }
        
        // Example: Update mobile link
        const mobileLink = document.querySelector('.mobile-header .doodle-link');
        if (mobileLink && doodleData.link) mobileLink.href = doodleData.link;
        
        console.log('[Doodle] Active event:', eventName);
    }
});

============================================================
 CONSOLE / DEBUG COMMANDS
============================================================

AnimatedDoodleSystem.triggerDoodle('christmas');    // force a doodle
AnimatedDoodleSystem.resetDoodle();                  // back to default
AnimatedDoodleSystem.refreshDoodles();               // clear cache + reload
AnimatedDoodleSystem.clearCache();                   // cache only
AnimatedDoodleSystem.getCurrentDoodle();             // { event, data }
AnimatedDoodleSystem.getAllDoodles();                // all loaded doodles
AnimatedDoodleSystem.getActiveEvents();              // currently in-range events
AnimatedDoodleSystem.stopAutoCheck();                // pause timers
AnimatedDoodleSystem.destroy();                      // full cleanup

// Test parsers directly
AnimatedDoodleSystem.parseUniversalDate('Dec 25');
AnimatedDoodleSystem.parseUniversalDate('in 5 days');
AnimatedDoodleSystem.parseImageSource('cdn:doodle.png');
AnimatedDoodleSystem.parseImageSource('drive:1A2B3C4D5E');

============================================================
 HTML STRUCTURE EXAMPLE
============================================================

<div class="header-top">
    <!-- TOP HEADER: Event Doodle (temporary) -->
    <a href="/" class="doodle-link">
        <img id="siteDoodle" src="logo.png" alt="Store" width="120" height="55">
    </a>
</div>

<div class="header-second-row">
    <!-- SECOND ROW: Brand Logo (permanent) -->
    <a href="/" class="logo-link">
        <img id="siteLogo" src="brand-logo.png" alt="Brand Name" width="200" height="80">
    </a>
</div>

============================================================
 MIGRATION FROM v4.1.1 (logo → doodle naming)
============================================================

OLD CODE (v4.1.1):
  AnimatedLogoSystem.init({ logoContainer: '#siteLogo', ... })
  AnimatedLogoSystem.triggerLogo('christmas')
  AnimatedLogoSystem.getCurrentLogo()

NEW CODE (v5.0.0):
  AnimatedDoodleSystem.init({ doodleContainer: '#siteDoodle', ... })
  AnimatedDoodleSystem.triggerDoodle('christmas')
  AnimatedDoodleSystem.getCurrentDoodle()

SEARCH & REPLACE in your HTML/JS:
  AnimatedLogoSystem       → AnimatedDoodleSystem
  .triggerLogo(            → .triggerDoodle(
  .resetLogo(              → .resetDoodle(
  .refreshLogos(           → .refreshDoodles(
  .getCurrentLogo(         → .getCurrentDoodle(
  .getAllLogos(            → .getAllDoodles(
  onLogoChange:            → onDoodleChange:
  logoContainer:           → doodleContainer:
  logoLink:                → doodleLink:

============================================================
*/
