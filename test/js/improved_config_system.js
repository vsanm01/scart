// ================================================================
// 1️⃣ CENTRALIZED CONFIGURATION MANAGEMENT
// ================================================================

/**
 * Configuration Manager - Single source of truth
 * Handles config loading, validation, and access
 */
class ConfigManager {
    constructor() {
        this.config = this.getDefaultConfig();
        this.loaded = false;
        this.listeners = [];
    }

    /**
     * Default configuration with type definitions
     */
    getDefaultConfig() {
        return {
            // Business Information
            business: {
                name: 'ShopHub',
                phone: '1234567890',
                email: 'support@shop.com',
                logo: 'https://via.placeholder.com/50',
                tagline: 'Think Quality Think Us',
                countryCode: '91',
            },

            // Localization
            localization: {
                currency: '₹',
                currencyPosition: 'before',
                defaultLocation: 'Tiruchirappalli',
                locale: 'en-IN',
            },

            // Delivery Settings
            delivery: {
                charge: 50,
                freeAbove: 500,
                estimatedDays: '3-5',
            },

            // Social Media
            social: {
                facebook: '#',
                twitter: '#',
                instagram: '#',
                whatsapp: true,
            },

            // Features Toggle
            features: {
                notifications: true,
                quickView: true,
                imageZoom: true,
                heroSlider: true,
                flashSale: true,
                search: true,
                filters: true,
            },

            // API Configuration
            api: {
                scriptUrl: '',
                apiToken: '',
                hmacSecret: '',
                rateLimit: 100,
                timeout: 30000,
            },

            // UI Settings
            ui: {
                itemsPerPage: 12,
                imageSize: 400,
                thumbnailSize: 100,
                defaultImage: 'https://via.placeholder.com/300',
                theme: 'light',
            },

            // WhatsApp Settings
            whatsapp: {
                messageTemplate: 'default',
                includeTimestamp: true,
                includeWebsiteUrl: true,
                useBoldHeaders: true,
                showItemNumbers: true,
                validatePhone: true,
            },

            // Hero Banners
            heroBanners: [],
        };
    }

    /**
     * Load configuration from Google Sheet
     */
    async load(sheetName = 'Sheet2', columnIndex = 1, startRow = 21) {
        try {
            const loader = new SheetConfig({
                sheetName,
                columnIndex,
                startRow,
                targetObject: this.config,
                verbose: false,
                onSuccess: (config, stats) => {
                    this.loaded = true;
                    this.notifyListeners('loaded', { config, stats });
                },
                onError: (error) => {
                    console.error('Config load failed:', error);
                    this.notifyListeners('error', error);
                }
            });

            // Define mappings
            this.setupMappings(loader);
            
            // Load configuration
            await loader.load();
            
            return this.config;
        } catch (error) {
            console.error('Configuration loading failed:', error);
            throw error;
        }
    }

    /**
     * Setup configuration mappings
     */
    setupMappings(loader) {
        // Business info (rows 21-31)
        loader.addMapping([
            { key: 'business.name', type: 'string' },
            { key: 'business.phone', type: 'string' },
            { key: 'business.email', type: 'string' },
            { key: 'business.logo', type: 'string' },
            { key: 'business.tagline', type: 'string' },
            { key: 'business.countryCode', type: 'string' },
            { key: 'localization.currency', type: 'string' },
            { key: 'localization.currencyPosition', type: 'string' },
            { key: 'localization.defaultLocation', type: 'string' },
            { key: 'delivery.charge', type: 'number' },
            { key: 'delivery.freeAbove', type: 'number' },
        ]);

        // Hero Banners
        loader.addMapping([
            { key: 'heroBanners', type: 'array' }
        ], 32);

        // Social Media
        loader.addMapping([
            { key: 'social.facebook', type: 'string', row: 45 },
            { key: 'social.instagram', type: 'string', row: 46 },
            { key: 'social.twitter', type: 'string', row: 49 }
        ]);
    }

    /**
     * Get configuration value by path
     */
    get(path, defaultValue = null) {
        const keys = path.split('.');
        let value = this.config;
        
        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return defaultValue;
            }
        }
        
        return value;
    }

    /**
     * Set configuration value by path
     */
    set(path, value) {
        const keys = path.split('.');
        let obj = this.config;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in obj)) {
                obj[key] = {};
            }
            obj = obj[key];
        }
        
        obj[keys[keys.length - 1]] = value;
        this.notifyListeners('updated', { path, value });
    }

    /**
     * Subscribe to config changes
     */
    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(cb => cb !== callback);
        };
    }

    /**
     * Notify all listeners
     */
    notifyListeners(event, data) {
        this.listeners.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                console.error('Listener error:', error);
            }
        });
    }

    /**
     * Validate configuration
     */
    validate() {
        const errors = [];

        // Validate business info
        if (!this.get('business.name')) {
            errors.push('Business name is required');
        }
        if (!this.get('business.phone')) {
            errors.push('Business phone is required');
        }

        // Validate API config
        if (!this.get('api.scriptUrl')) {
            errors.push('API script URL is required');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

// ================================================================
// 2️⃣ APPLICATION STATE MANAGER
// ================================================================

/**
 * Centralized state management for the application
 */
class StateManager {
    constructor() {
        this.state = {
            initialized: false,
            loading: true,
            errors: [],
            products: [],
            cart: [],
            filters: {
                category: 'all',
                priceRange: 'all',
                sortBy: 'featured',
                minPrice: null,
                maxPrice: null,
            },
            ui: {
                cartOpen: false,
                modalOpen: false,
                sidebarOpen: false,
            },
        };
        this.listeners = new Map();
    }

    /**
     * Get state value
     */
    get(path) {
        const keys = path.split('.');
        let value = this.state;
        
        for (const key of keys) {
            value = value?.[key];
            if (value === undefined) return undefined;
        }
        
        return value;
    }

    /**
     * Update state
     */
    set(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let obj = this.state;
        
        for (const key of keys) {
            if (!(key in obj)) obj[key] = {};
            obj = obj[key];
        }
        
        const oldValue = obj[lastKey];
        obj[lastKey] = value;
        
        this.notify(path, value, oldValue);
    }

    /**
     * Subscribe to state changes
     */
    subscribe(path, callback) {
        if (!this.listeners.has(path)) {
            this.listeners.set(path, []);
        }
        this.listeners.get(path).push(callback);
        
        return () => {
            const callbacks = this.listeners.get(path);
            const index = callbacks.indexOf(callback);
            if (index > -1) callbacks.splice(index, 1);
        };
    }

    /**
     * Notify listeners
     */
    notify(path, newValue, oldValue) {
        // Exact path listeners
        this.listeners.get(path)?.forEach(cb => {
            try {
                cb(newValue, oldValue);
            } catch (error) {
                console.error('State listener error:', error);
            }
        });

        // Parent path listeners (e.g., 'filters' when 'filters.category' changes)
        const parts = path.split('.');
        for (let i = parts.length - 1; i > 0; i--) {
            const parentPath = parts.slice(0, i).join('.');
            this.listeners.get(parentPath)?.forEach(cb => {
                try {
                    cb(this.get(parentPath));
                } catch (error) {
                    console.error('State listener error:', error);
                }
            });
        }
    }
}

// ================================================================
// 3️⃣ DEPENDENCY INJECTION CONTAINER
// ================================================================

/**
 * Service container for dependency injection
 */
class ServiceContainer {
    constructor() {
        this.services = new Map();
        this.singletons = new Map();
    }

    /**
     * Register a service
     */
    register(name, factory, singleton = true) {
        this.services.set(name, { factory, singleton });
    }

    /**
     * Get a service instance
     */
    get(name) {
        const service = this.services.get(name);
        if (!service) {
            throw new Error(`Service "${name}" not found`);
        }

        if (service.singleton) {
            if (!this.singletons.has(name)) {
                this.singletons.set(name, service.factory(this));
            }
            return this.singletons.get(name);
        }

        return service.factory(this);
    }

    /**
     * Check if service exists
     */
    has(name) {
        return this.services.has(name);
    }
}

// ================================================================
// 4️⃣ APPLICATION BOOTSTRAP
// ================================================================

/**
 * Application Bootstrap - Handles initialization sequence
 */
class AppBootstrap {
    constructor() {
        this.container = new ServiceContainer();
        this.config = new ConfigManager();
        this.state = new StateManager();
        this.initialized = false;
    }

    /**
     * Initialize application
     */
    async init() {
        try {
            this.state.set('loading', true);
            
            // Phase 1: Load configuration
            await this.loadConfiguration();
            
            // Phase 2: Setup services
            this.setupServices();
            
            // Phase 3: Load data
            await this.loadData();
            
            // Phase 4: Initialize UI
            this.initializeUI();
            
            // Phase 5: Setup event handlers
            this.setupEventHandlers();
            
            this.initialized = true;
            this.state.set('initialized', true);
            this.state.set('loading', false);
            
            console.log('✅ Application initialized successfully');
        } catch (error) {
            console.error('❌ Application initialization failed:', error);
            this.state.set('loading', false);
            this.state.set('errors', [error.message]);
            this.showErrorUI(error);
        }
    }

    /**
     * Load configuration from Google Sheets
     */
    async loadConfiguration() {
        console.log('📋 Loading configuration...');
        
        try {
            await this.config.load();
            
            // Validate configuration
            const validation = this.config.validate();
            if (!validation.valid) {
                throw new Error('Invalid configuration: ' + validation.errors.join(', '));
            }
            
            console.log('✅ Configuration loaded');
        } catch (error) {
            console.warn('⚠️ Using default configuration:', error.message);
        }
    }

    /**
     * Setup services in container
     */
    setupServices() {
        console.log('🔧 Setting up services...');
        
        // Register core services
        this.container.register('config', () => this.config);
        this.container.register('state', () => this.state);
        
        // Register product loader
        this.container.register('productLoader', (c) => {
            return new ProductSheetLoader({
                sheetName: 'products',
                imageSize: c.get('config').get('ui.imageSize'),
                defaultImage: c.get('config').get('ui.defaultImage'),
                useImageHandler: true,
                priceMarkupMultiplier: 1.3,
            });
        });
        
        // Register cart service
        this.container.register('cart', (c) => {
            return new ShopCart({
                currency: c.get('config').get('localization.currency'),
                locale: c.get('config').get('localization.locale'),
                onCartUpdate: (items, total, count) => {
                    c.get('state').set('cart', items);
                }
            });
        });
        
        // Register filter manager
        this.container.register('filterManager', (c) => {
            return new ProductFilterManager({
                products: c.get('state').get('products'),
                onFilterChange: (filtered) => {
                    c.get('state').set('products', filtered);
                }
            });
        }, false); // Not singleton, create new instance when needed
        
        console.log('✅ Services registered');
    }

    /**
     * Load application data
     */
    async loadData() {
        console.log('📦 Loading data...');
        
        const loader = this.container.get('productLoader');
        const products = await loader.fetch();
        
        this.state.set('products', products);
        
        console.log(`✅ Loaded ${products.length} products`);
    }

    /**
     * Initialize UI components
     */
    initializeUI() {
        console.log('🎨 Initializing UI...');
        
        // Initialize branding
        this.initBranding();
        
        // Initialize hero slider
        this.initHeroSlider();
        
        // Initialize product renderer
        this.initProductRenderer();
        
        // Initialize other UI components
        this.initWhatsApp();
        this.initNotifications();
        
        console.log('✅ UI initialized');
    }

    /**
     * Initialize site branding
     */
    initBranding() {
        const config = this.config;
        
        // Update logo
        const logos = document.querySelectorAll('#siteLogo, #topDoodle');
        logos.forEach(logo => {
            if (logo) {
                logo.src = config.get('business.logo');
                logo.alt = config.get('business.name');
            }
        });
        
        // Update site name
        const names = document.querySelectorAll('#siteName, #footerLogo');
        names.forEach(el => {
            if (el) el.textContent = config.get('business.name');
        });
        
        // Update tagline
        const tagline = document.querySelector('#siteTagline');
        if (tagline) {
            tagline.textContent = config.get('business.tagline');
        }
        
        // Update location
        const location = document.querySelector('#userLocation');
        if (location) {
            location.textContent = config.get('localization.defaultLocation');
        }
    }

    /**
     * Initialize hero slider
     */
    initHeroSlider() {
        const banners = this.config.get('heroBanners', []);
        
        if (banners.length > 0) {
            banners.forEach((url, i) => {
                const slide = document.querySelector(`.hero-slide-${i + 1}`);
                if (slide && url) {
                    slide.style.backgroundImage = `url(${url})`;
                }
            });
            
            new Swiper('.heroSwiper', {
                loop: true,
                autoplay: { delay: 5000, disableOnInteraction: false },
                pagination: { el: '.swiper-pagination', clickable: true },
                speed: 800,
                effect: 'fade',
            });
        }
    }

    /**
     * Initialize product renderer
     */
    initProductRenderer() {
        const products = this.state.get('products');
        
        ProductRenderer.init({
            containerId: 'productsGrid',
            products: products,
            currency: this.config.get('localization.currency'),
            showDiscount: true,
            showRating: true,
        });
        
        ProductRenderer.render();
    }

    /**
     * Initialize WhatsApp
     */
    initWhatsApp() {
        const btn = document.querySelector('#whatsappBtn');
        if (btn) {
            const phone = this.config.get('business.phone');
            const name = this.config.get('business.name');
            btn.href = `https://wa.me/${phone}?text=Hi, I'm interested in ${name}!`;
        }
    }

    /**
     * Initialize notifications
     */
    initNotifications() {
        if (this.config.get('features.notifications')) {
            // Setup notification system
        }
    }

    /**
     * Setup global event handlers
     */
    setupEventHandlers() {
        // Handle state changes
        this.state.subscribe('cart', (cart) => {
            document.querySelector('#cartCount').textContent = cart.length;
        });
        
        // Handle UI state
        this.state.subscribe('ui.cartOpen', (open) => {
            document.querySelector('#cartSidebar')
                .classList.toggle('active', open);
        });
    }

    /**
     * Show error UI
     */
    showErrorUI(error) {
        const container = document.querySelector('#productsGrid');
        if (container) {
            container.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444;"></i>
                    <h3 style="margin-top: 20px; color: #1f2937;">Failed to Load</h3>
                    <p style="color: #6b7280; margin-top: 10px;">${error.message}</p>
                    <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 24px; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        Retry
                    </button>
                </div>
            `;
        }
    }
}

// ================================================================
// 5️⃣ USAGE EXAMPLE
// ================================================================

// Global app instance
let app;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    // Create and initialize app
    app = new AppBootstrap();
    await app.init();
    
    // Make services globally accessible (optional)
    window.app = app;
    window.config = app.config;
    window.state = app.state;
    window.services = app.container;
});

// Example: Access services anywhere
// const cart = app.container.get('cart');
// const config = app.container.get('config');
// cart.addToCart(productId);
// const businessName = config.get('business.name');