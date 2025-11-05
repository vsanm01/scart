/**
 * ScrollingText.js - Google Sheets Integration
 * Auto-rotating scrolling text effects with messages from Google Sheets
 * Version: 1.0.0
 * 
 * Google Sheet Structure:
 * Sheet Name: "Sheet3"
 * 
 * Columns:
 * A: effect (rainbow, neon, disco, fire, matrix, marquee, gradient-flow, typewriter, flash-highlight, glow-pulse)
 * B: message (Your text message with emojis)
 * C: active (yes/no - to enable/disable messages)
 * D: priority (1-10 - higher shows more often)
 * 
 * Example Row:
 * rainbow | 🎉 Welcome to our store! Amazing products await! | yes | 5
 */

(function(global) {
    'use strict';

    class ScrollingTextManager {
        constructor(options = {}) {
            this.options = {
                // Google Sheets API Config (uses your existing GSRCDN_CONFIG)
                useGSRCDN: options.useGSRCDN !== false,
                sheetName: options.sheetName || 'Sheet3',
                
                // Selectors
                containerSelector: options.containerSelector || '.scrolling-text',
                textSelector: options.textSelector || '#scrolling-text',
                
                // Timing
                changeInterval: options.changeInterval || 5000, // 5 seconds
                scrollSpeed: options.scrollSpeed || 20, // seconds for one scroll
                
                // Features
                pauseOnHover: options.pauseOnHover !== false,
                randomOrder: options.randomOrder || false,
                enableLogging: options.enableLogging || false,
                
                // Fallback messages (if Sheet fails to load)
                fallbackMessages: options.fallbackMessages || [
                    { effect: 'rainbow', message: '🎉 Welcome to our store! Check out our amazing products!' },
                    { effect: 'neon', message: '⚡ Flash Sale! Limited time only!' },
                    { effect: 'disco', message: '🎊 Party Time! Latest arrivals!' },
                    { effect: 'fire', message: '🔥 Hot deals burning now!' },
                    { effect: 'matrix', message: '💻 Enter the matrix of savings...' }
                ],
                
                // Callbacks
                onLoad: options.onLoad || null,
                onError: options.onError || null,
                onChange: options.onChange || null
            };

            this.messages = [];
            this.currentIndex = 0;
            this.intervalId = null;
            this.container = null;
            this.textElement = null;
            this.isInitialized = false;

            // Available effects
            this.availableEffects = [
                'rainbow', 'neon', 'disco', 'fire', 'matrix',
                'marquee', 'gradient-flow', 'typewriter', 
                'flash-highlight', 'glow-pulse'
            ];
        }

        /**
         * Initialize the scrolling text system
         */
        async init() {
            this.log('Initializing ScrollingText Manager...');

            // Get DOM elements
            this.container = document.querySelector(this.options.containerSelector);
            this.textElement = document.querySelector(this.options.textSelector);

            if (!this.container || !this.textElement) {
                this.error('Container or text element not found');
                return false;
            }

            // Load messages from Google Sheets
            await this.loadMessagesFromSheet();

            // Setup hover pause
            if (this.options.pauseOnHover) {
                this.setupHoverPause();
            }

            // Start auto-rotation
            this.startRotation();

            this.isInitialized = true;
            this.log('ScrollingText Manager initialized successfully');

            if (this.options.onLoad) {
                this.options.onLoad(this.messages);
            }

            return true;
        }

      
/**
 * Load messages from Google Sheets - FIXED VERSION
 * This replaces the existing loadMessagesFromSheet() function
 */
async loadMessagesFromSheet() {
    this.log('📡 Loading messages from Google Sheets...');

    try {
        // Get script URL - try multiple sources
        let scriptUrl = this.options.scriptUrl;
        
        if (!scriptUrl && typeof GSRCDN_CONFIG !== 'undefined' && GSRCDN_CONFIG.scriptUrl) {
            scriptUrl = GSRCDN_CONFIG.scriptUrl;
        }
        
        if (!scriptUrl && typeof GSRCDN !== 'undefined' && GSRCDN.config && GSRCDN.config.scriptUrl) {
            scriptUrl = GSRCDN.config.scriptUrl;
        }

        if (!scriptUrl) {
            throw new Error('❌ No script URL found. Set GSRCDN.config.scriptUrl or pass scriptUrl in options.');
        }

        // Build URL for Sheet3 scrolling messages PUBLIC endpoint
        const url = `${scriptUrl}?sheet=Sheet3&type=scrolling`;
        this.log(`🔗 Fetching from: ${url}`);

        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        this.log('📦 Raw response:', result);

        // Check for errors
        if (result.error) {
            throw new Error(result.error);
        }

        // Parse the NEW Sheet3 scrolling endpoint format
        if (result.success && Array.isArray(result.data) && result.data.length > 0) {
            // New format: { success, count, data: [{effect, message, priority, row}], timestamp }
            this.log(`✅ Found ${result.count} active messages in new format`);
            
            this.messages = result.data.map(item => ({
                effect: String(item.effect || 'rainbow').toLowerCase().trim(),
                message: String(item.message || '').trim(),
                priority: parseInt(item.priority) || 1
            }));
            
        } else if (Array.isArray(result.data) && result.data.length > 0) {
            // Fallback: Try parsing as array format
            this.log('📋 Parsing as array format...');
            this.messages = this.parseSheetData(result.data);
            
        } else if (Array.isArray(result) && result.length > 0) {
            // Another fallback: Direct array
            this.log('📋 Parsing direct array...');
            this.messages = this.parseSheetData(result);
            
        } else {
            throw new Error('No valid data found in response');
        }

        // Validate messages
        this.messages = this.validateMessages(this.messages);
        this.log(`✅ Validated ${this.messages.length} messages`);

        if (this.messages.length === 0) {
            this.log('⚠️ No valid messages found, using fallback');
            this.messages = this.options.fallbackMessages;
        } else {
            // Expand messages based on priority (duplicate high priority messages)
            const originalCount = this.messages.length;
            this.messages = this.expandMessagesByPriority(this.messages);
            this.log(`📊 Expanded from ${originalCount} to ${this.messages.length} messages based on priority`);
        }

        // Shuffle if random order
        if (this.options.randomOrder) {
            this.shuffleMessages();
            this.log('🔀 Messages shuffled');
        }

        this.log('✅ Messages loaded successfully!');

    } catch (error) {
        this.error('❌ Error loading messages from Sheet3:', error);
        this.messages = this.options.fallbackMessages;
        this.log(`⚠️ Using ${this.messages.length} fallback messages`);
        
        if (this.options.onError) {
            this.options.onError(error);
        }
    }
}





        /**
         * Parse Google Sheets data
         */
        parseSheetData(data) {
            const messages = [];

            data.forEach((row, index) => {
                // Skip header row
                if (index === 0) return;

                const effect = row[0] ? row[0].toString().toLowerCase().trim() : '';
                const message = row[1] ? row[1].toString().trim() : '';
                const active = row[2] ? row[2].toString().toLowerCase().trim() : 'yes';
                const priority = row[3] ? parseInt(row[3]) : 1;

                // Only add active messages with valid effect
                if (active === 'yes' && message && this.availableEffects.includes(effect)) {
                    // Add message multiple times based on priority
                    const count = Math.max(1, Math.min(priority, 10));
                    for (let i = 0; i < count; i++) {
                        messages.push({ effect, message, priority });
                    }
                }
            });

            return messages;
        }

        /**
         * Validate messages
         */
        validateMessages(messages) {
            return messages.filter(msg => {
                return msg.effect && 
                       msg.message && 
                       this.availableEffects.includes(msg.effect);
            });
        }


/**
 * Expand messages based on priority (duplicate high priority messages)
 * Higher priority = shown more often
 * Priority 1 = shown 1 time
 * Priority 5 = shown 5 times
 * Priority 10 = shown 10 times (max)
 */
expandMessagesByPriority(messages) {
    const expanded = [];
    
    messages.forEach(msg => {
        // Clamp priority between 1 and 10
        const priority = Math.max(1, Math.min(parseInt(msg.priority) || 1, 10));
        
        // Add message 'priority' number of times
        for (let i = 0; i < priority; i++) {
            expanded.push({
                effect: msg.effect,
                message: msg.message,
                priority: msg.priority
            });
        }
    });
    
    return expanded;
}




        /**
         * Shuffle messages array
         */
        shuffleMessages() {
            for (let i = this.messages.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [this.messages[i], this.messages[j]] = [this.messages[j], this.messages[i]];
            }
        }

        /**
         * Start automatic rotation
         */
        startRotation() {
            // Show first message immediately
            this.changeMessage();

            // Set up interval
            this.intervalId = setInterval(() => {
                this.changeMessage();
            }, this.options.changeInterval);

            this.log('Auto-rotation started');
        }

        /**
         * Stop automatic rotation
         */
        stopRotation() {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
                this.log('Auto-rotation stopped');
            }
        }

        /**
         * Change to next message
         */
        changeMessage() {
            if (this.messages.length === 0) return;

            // Get current message
            const currentMessage = this.messages[this.currentIndex];

            // Remove all effect classes
            this.availableEffects.forEach(effect => {
                this.container.classList.remove(effect);
            });

            // Add new effect class
            this.container.classList.add(currentMessage.effect);

            // Update text
            this.textElement.textContent = currentMessage.message;

            // Callback
            if (this.options.onChange) {
                this.options.onChange(currentMessage, this.currentIndex);
            }

            this.log(`Changed to effect: ${currentMessage.effect}`);

            // Move to next message
            this.currentIndex = (this.currentIndex + 1) % this.messages.length;
        }

        /**
         * Setup hover pause functionality
         */
        setupHoverPause() {
            this.container.addEventListener('mouseenter', () => {
                this.stopRotation();
            });

            this.container.addEventListener('mouseleave', () => {
                this.startRotation();
            });
        }

        /**
         * Reload messages from Sheet
         */
        async reload() {
            this.log('Reloading messages...');
            this.stopRotation();
            await this.loadMessagesFromSheet();
            this.currentIndex = 0;
            this.startRotation();
        }

        /**
         * Get current message
         */
        getCurrentMessage() {
            return this.messages[this.currentIndex];
        }

        /**
         * Get all messages
         */
        getAllMessages() {
            return this.messages;
        }

        /**
         * Add custom message dynamically
         */
        addMessage(effect, message, priority = 1) {
            if (this.availableEffects.includes(effect)) {
                const count = Math.max(1, Math.min(priority, 10));
                for (let i = 0; i < count; i++) {
                    this.messages.push({ effect, message, priority });
                }
                this.log(`Added custom message with effect: ${effect}`);
                return true;
            }
            return false;
        }

        /**
         * Set messages manually (bypass Sheet)
         */
        setMessages(messages) {
            this.messages = this.validateMessages(messages);
            this.currentIndex = 0;
            this.log(`Manually set ${this.messages.length} messages`);
        }

        /**
         * Logging helper
         */
        log(...args) {
            if (this.options.enableLogging) {
                console.log('[ScrollingText]', ...args);
            }
        }

        /**
         * Error logging
         */
        error(...args) {
            console.error('[ScrollingText]', ...args);
        }

        /**
         * Destroy instance
         */
        destroy() {
            this.stopRotation();
            this.container = null;
            this.textElement = null;
            this.messages = [];
            this.isInitialized = false;
            this.log('Instance destroyed');
        }
    }

    // Export to global scope
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ScrollingTextManager;
    } else if (typeof define === 'function' && define.amd) {
        define(function() { return ScrollingTextManager; });
    } else {
        global.ScrollingTextManager = ScrollingTextManager;
    }

})(typeof window !== 'undefined' ? window : this);


/**
 * ============================================
 * USAGE EXAMPLES
 * ============================================
 */

/*

// BASIC USAGE (uses existing GSRCDN_CONFIG)
const scrollingText = new ScrollingTextManager();
scrollingText.init();


// ADVANCED USAGE
const scrollingText = new ScrollingTextManager({
    sheetName: 'Sheet3',
    changeInterval: 5000,
    randomOrder: true,
    enableLogging: true,
    
    onLoad: (messages) => {
        console.log('Loaded ' + messages.length + ' messages');
    },
    
    onChange: (message, index) => {
        console.log('Changed to:', message.effect);
    },
    
    onError: (error) => {
        console.error('Error:', error);
    }
});

scrollingText.init();


// RELOAD MESSAGES FROM SHEET
scrollingText.reload();


// ADD CUSTOM MESSAGE
scrollingText.addMessage('rainbow', '🎁 Special promotion!', 5);


// GET CURRENT MESSAGE
const current = scrollingText.getCurrentMessage();


// STOP/START ROTATION
scrollingText.stopRotation();
scrollingText.startRotation();


// DESTROY INSTANCE
scrollingText.destroy();

*/
