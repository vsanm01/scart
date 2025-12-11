/**
 * ScrollingTextManager v2.0
 * Compatible with SecureSheets Client Library v1.3.0
 */

class ScrollingTextManager {
    constructor(options = {}) {
        this.containerSelector = options.container || '.scrolling-text-container';
        this.sheetName = options.sheetName || 'ScrollingMessages';
        this.dataFetcher = options.dataFetcher || (typeof SecureSheets !== 'undefined' ? SecureSheets : null);
        this.useCache = options.useCache !== undefined ? options.useCache : true;
        this.speed = options.speed || 50;
        this.direction = options.direction || 'left';
        this.messages = [];
        this.isRunning = false;
        this.verbose = options.verbose !== undefined ? options.verbose : true;
        
        // Animation properties
        this.animationId = null;
        this.position = 0;
        
        // Callbacks
        this.onLoad = options.onLoad || null;
        this.onError = options.onError || null;
    }

    /**
     * Validate SecureSheets
     */
    validate() {
        if (!this.dataFetcher) {
            throw new Error('❌ SecureSheets not loaded. Please include securesheets_client_complete.js');
        }
        
        if (!this.dataFetcher.isConfigured()) {
            throw new Error('❌ SecureSheets not configured. Call SecureSheets.configure() first');
        }
        
        return true;
    }

    /**
     * Initialize and load messages
     */
    async init() {
        try {
            this.log('info', '🚀 Initializing ScrollingText...');
            
            // Load messages from sheet
            await this.loadMessagesFromSheet();
            
            // Start animation if we have messages
            if (this.messages.length > 0) {
                this.start();
                this.log('success', `✅ ScrollingText initialized with ${this.messages.length} messages`);
            } else {
                this.log('warn', '⚠️ No messages loaded');
            }
            
            if (this.onLoad) {
                this.onLoad(this.messages);
            }
            
            return this.messages;
            
        } catch (error) {
            this.log('error', '❌ Error initializing ScrollingText:', error);
            if (this.onError) {
                this.onError(error);
            }
            throw error;
        }
    }

    /**
     * Load messages from Google Sheet via SecureSheets
     */
    async loadMessagesFromSheet() {
        try {
            this.validate();
            
            this.log('info', `📄 Loading messages from ${this.sheetName}...`);
            
            // Check if there's a public endpoint for scrolling messages
            let response;
            if (typeof this.dataFetcher.getScrollingMessages === 'function') {
                // Use public endpoint if available
                response = await this.dataFetcher.getScrollingMessages({
                    useCache: this.useCache
                });
            } else {
                // Use authenticated getData
                response = await this.dataFetcher.getData(this.sheetName, {
                    useCache: this.useCache
                });
            }

            this.log('info', '📊 Response received:', response);

            // Handle SecureSheets response format
            if (response.status === 'error' || response.error) {
                throw new Error(response.message || response.error || 'Failed to load messages');
            }

            // Extract data from response
            let data;
            if (response.status === 'success' && response.data) {
                data = response.data;
            } else if (response.sheets && response.sheets[this.sheetName]) {
                data = response.sheets[this.sheetName];
            } else if (response.messages && Array.isArray(response.messages)) {
                // Public endpoint format
                this.messages = response.messages;
                return this.messages;
            } else if (Array.isArray(response)) {
                data = response;
            } else {
                throw new Error('Unexpected response format from SecureSheets');
            }

            if (!data || data.length === 0) {
                this.log('warn', '⚠️ No messages found in sheet');
                this.messages = [];
                return this.messages;
            }

            // Parse messages from sheet data
            this.messages = this.parseMessages(data);
            
            this.log('success', `✅ Loaded ${this.messages.length} messages`);
            return this.messages;

        } catch (error) {
            this.log('error', '❌ Error loading messages:', error);
            throw error;
        }
    }

    /**
     * Parse messages from sheet data
     * Expected columns: message, enabled, color, speed
     */
    parseMessages(data) {
        const messages = [];
        
        data.forEach((row, index) => {
            // Check if message is enabled (default to true if not specified)
            const enabled = row.enabled !== undefined ? 
                (row.enabled === true || row.enabled === 'true' || row.enabled === '1' || row.enabled === 'yes') : 
                true;
            
            if (!enabled) {
                return; // Skip disabled messages
            }
            
            const message = row.message || row.text || row.content || '';
            
            if (message.trim()) {
                messages.push({
                    text: message.trim(),
                    color: row.color || '#ffffff',
                    speed: row.speed ? parseFloat(row.speed) : this.speed,
                    id: row.id || `msg_${index}`
                });
            }
        });
        
        return messages;
    }

    /**
     * Start scrolling animation
     */
    start() {
        if (this.isRunning) return;
        
        const container = document.querySelector(this.containerSelector);
        if (!container) {
            this.log('error', `❌ Container not found: ${this.containerSelector}`);
            return;
        }
        
        // Clear existing content
        container.innerHTML = '';
        
        // Create scrolling content
        const wrapper = document.createElement('div');
        wrapper.className = 'scrolling-wrapper';
        wrapper.style.cssText = `
            display: inline-block;
            white-space: nowrap;
            animation: scroll-${this.direction} ${this.speed}s linear infinite;
        `;
        
        // Add messages to wrapper
        this.messages.forEach(msg => {
            const span = document.createElement('span');
            span.className = 'scrolling-message';
            span.textContent = msg.text;
            span.style.cssText = `
                color: ${msg.color};
                padding: 0 3rem;
                display: inline-block;
            `;
            wrapper.appendChild(span);
        });
        
        // Duplicate for seamless loop
        const clone = wrapper.cloneNode(true);
        container.appendChild(wrapper);
        container.appendChild(clone);
        
        this.isRunning = true;
        this.log('success', '▶️ Scrolling animation started');
    }

    /**
     * Stop scrolling animation
     */
    stop() {
        if (!this.isRunning) return;
        
        const container = document.querySelector(this.containerSelector);
        if (container) {
            container.innerHTML = '';
        }
        
        this.isRunning = false;
        this.log('info', '⏸️ Scrolling animation stopped');
    }

    /**
     * Reload messages from sheet
     */
    async reload() {
        this.stop();
        await this.loadMessagesFromSheet();
        if (this.messages.length > 0) {
            this.start();
        }
    }

    /**
     * Set messages manually
     */
    setMessages(messages) {
        this.messages = messages;
        if (this.isRunning) {
            this.stop();
            this.start();
        }
    }

    /**
     * Get current messages
     */
    getMessages() {
        return [...this.messages];
    }

    /**
     * Logging utility
     */
    log(level, ...args) {
        if (!this.verbose) return;

        const styles = {
            success: 'color: #10b981',
            error: 'color: #ef4444',
            warn: 'color: #f59e0b',
            info: 'color: #3b82f6'
        };

        if (typeof args[0] === 'string' && args[0].match(/[✅❌⚠️📊📄🚀▶️⏸️]/)) {
            console.log(...args);
        } else {
            console.log(`%c[ScrollingText]`, `${styles[level] || ''}; font-weight: bold`, ...args);
        }
    }
}

// Export
if (typeof window !== 'undefined') {
    window.ScrollingTextManager = ScrollingTextManager;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ScrollingTextManager;
}

// Add CSS for scrolling animation
if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.textContent = `
        .scrolling-text-container {
            overflow: hidden;
            white-space: nowrap;
            position: relative;
        }
        
        @keyframes scroll-left {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
        }
        
        @keyframes scroll-right {
            0% { transform: translateX(-50%); }
            100% { transform: translateX(0); }
        }
    `;
    document.head.appendChild(style);
}

console.log('ScrollingTextManager v2.0 loaded (SecureSheets compatible)');