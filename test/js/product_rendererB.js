/**
 * ProductRenderer - A reusable product grid rendering library
 * Version: 1.5.0 - Updated with repositioned buttons
 * 
 * Usage:
 * <script src="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/js/all.min.js"></script>
 * <script src="product-renderer.js"></script>
 * 
 * ProductRenderer.init({
 *   containerId: 'productsGrid',
 *   products: yourProductsArray,
 *   currency: '₹',
 *   onAddToCart: (productId) => { ... },
 *   onQuickView: (productId) => { ... },
 *   onShare: (productId) => { ... }
 * });
 * 
 * Note: Wishlist functionality has been completely removed from this version.
 * 
 * ProductRenderer.render();
 * ProductRenderer.render(filteredProducts); // Render specific products
 */

(function(window) {
    'use strict';
    
    const ProductRenderer = {
        config: {
            containerId: 'productsGrid',
            products: [],
            currency: '$',
            showDiscount: true,
            showRating: true,
            enableQuickView: true,
            enableShare: true,
            enableLightbox: false,
            onAddToCart: null,
            onQuickView: null,
            onShare: null,
            gridColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            emptyMessage: 'No Products Found',
            emptyIcon: 'fas fa-inbox'
        },
        
        container: null,
        
        /**
         * Initialize the library with configuration
         */
        init: function(options) {
            this.config = Object.assign({}, this.config, options);
            this.container = document.getElementById(this.config.containerId);
            
            if (!this.container) {
                console.error(`Container with id "${this.config.containerId}" not found`);
                return;
            }
            
            this.injectStyles();
        },
        
        /**
         * Inject required CSS styles
         */
        injectStyles: function() {
            if (document.getElementById('pr-styles')) return;
            
            const styles = `
                <style id="pr-styles">
                    .pr-grid {
                        display: grid;
                        grid-template-columns: repeat(5, 1fr);
                        gap: 20px;
                        width: 100%;
                        margin-bottom: 40px;
                    }
                    
                    .pr-empty {
                        grid-column: 1/-1;
                        text-align: center;
                        padding: 60px 20px;
                    }
                    
                    .pr-empty-icon {
                        font-size: 64px;
                        color: #d1d5db;
                        margin-bottom: 20px;
                    }
                    
                    .pr-empty-message {
                        color: #6b7280;
                        font-size: 20px;
                        font-weight: 600;
                        margin: 0;
                    }
                    
                    .pr-card {
                        background: white;
                        border-radius: 12px;
                        overflow: hidden;
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
                        border: 1px solid #f1f3f4;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        position: relative;
                    }
                    
                    .pr-card:hover {
                        transform: translateY(-4px);
                        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
                    }
                    
                    .pr-image-container {
                        position: relative;
                        width: 100%;
                        height: 220px;
                        background: #f8f9fa;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        overflow: hidden;
                        border-bottom: 1px solid #f1f3f4;
                    }
                    
                    .pr-image {
                        width: 100%;
                        height: 100%;
                        object-fit: cover;
                        transition: transform 0.3s ease;
                    }
                    
                    .pr-card:hover .pr-image {
                        transform: scale(1.05);
                    }
                    
                    .pr-image-emoji {
                        font-size: 48px;
                    }
                    
                    /* UNIFIED BADGE STYLING - DARK TRANSPARENT BACKDROP */
                    .pr-badge {
                        position: absolute;
                        top: 15px;
                        right: 15px;
                        background: rgba(0, 0, 0, 0.50);
                        backdrop-filter: blur(12px);
                        -webkit-backdrop-filter: blur(12px);
                        color: white;
                        padding: 6px 12px;
                        border-radius: 20px;
                        font-weight: 700;
                        font-size: 12px;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                        border: 1px solid rgba(0, 0, 0, 0.7);
                        z-index: 2;
                        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                    }
                    
                    /* REPOSITIONED ACTION BUTTONS - BOTTOM CORNERS */
                    .pr-actions {
                        position: absolute;
                        bottom: 15px;
                        left: 15px;
                        right: 15px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        opacity: 0;
                        transform: translateY(10px);
                        transition: all 0.3s;
                        z-index: 2;
                    }
                    
                    .pr-card:hover .pr-actions {
                        opacity: 1;
                        transform: translateY(0);
                    }
                    
                    .pr-action-btn {
                        width: 40px;
                        height: 40px;
                        border-radius: 20px;
                        background: rgba(0, 0, 0, 0.50);
                        backdrop-filter: blur(12px);
                        -webkit-backdrop-filter: blur(12px);
                        border: 1px solid rgba(0, 0, 0, 0.7);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        transition: all 0.3s;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                        color: white;
                        font-size: 16px;
                        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                    }
                    
                    .pr-action-btn:hover {
                        transform: scale(1.1);
                        background: rgba(0, 0, 0, 0.65);
                        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
                    }
                    
                    .pr-info {
                        padding: 20px;
                    }
                    
                    .pr-category {
                        display: inline-block;
                        color: #0066cc;
                        padding: 0;
                        border: none;
                        background: transparent;
                        font-size: 12px;
                        font-weight: 500;
                        margin-bottom: 16px;
                        text-transform: capitalize;
                        cursor: pointer;
                        text-decoration: underline;
                        transition: color 0.3s;
                    }
                    
                    .pr-category:hover {
                        color: #004499;
                    }
                    
                    .pr-title {
                        font-size: 18px;
                        font-weight: 600;
                        color: #212529;
                        margin: 0 0 8px 0;
                        line-height: 1.4;
                        display: -webkit-box;
                        -webkit-line-clamp: 2;
                        -webkit-box-orient: vertical;
                        overflow: hidden;
                    }
                    
                    .pr-rating {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        margin-bottom: 12px;
                    }
                    
                    .pr-stars {
                        color: #fbbf24;
                        font-size: 14px;
                    }
                    
                    .pr-rating-count {
                        color: #9ca3af;
                        font-size: 13px;
                    }
                    
                    .pr-price {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        margin-bottom: 16px;
                    }
                    
                    .pr-price-current {
                        font-size: 24px;
                        font-weight: 700;
                        color: #495057;
                    }
                    
                    .pr-price-current .pr-currency {
                        font-size: 20px;
                    }
                    
                    .pr-price-original {
                        font-size: 16px;
                        color: #9ca3af;
                        text-decoration: line-through;
                    }
                    
                    .pr-add-to-cart {
                        width: 100%;
                        padding: 12px;
                        background: #ffd814;
                        color: black;
                        border: none;
                        border-radius: 8px;
                        font-weight: 600;
                        font-size: 16px;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        transition: all 0.3s;
                    }
                    
                    .pr-add-to-cart:hover {
                        background: #f7ca00;
                        transform: translateY(-1px);
                    }
                    
                    .pr-add-to-cart:active {
                        transform: translateY(0);
                    }
                    
                    /* Desktop Large (≥1200px) - 5 columns */
                    @media (min-width: 1200px) {
                        .pr-grid {
                            grid-template-columns: repeat(5, 1fr);
                            gap: 20px;
                        }
                    }
                    
                    /* Desktop (992px-1199px) - 4 columns */
                    @media (min-width: 992px) and (max-width: 1199px) {
                        .pr-grid {
                            grid-template-columns: repeat(4, 1fr);
                            gap: 18px;
                        }
                    }
                    
                    /* Tablet (769px-991px) - 3 columns */
                    @media (min-width: 769px) and (max-width: 991px) {
                        .pr-grid {
                            grid-template-columns: repeat(3, 1fr);
                            gap: 16px;
                        }
                    }
                    
                    /* Mobile (≤768px) - 2 columns - ALWAYS VISIBLE BUTTONS */
                    @media (max-width: 768px) {
                        .pr-grid {
                            grid-template-columns: repeat(2, 1fr);
                            gap: 15px;
                        }
                        
                        .pr-image-container {
                            height: 140px;
                        }
                        
                        .pr-image-emoji {
                            font-size: 32px;
                        }
                        
                        /* MOBILE BADGE - DARK TRANSPARENT BACKDROP */
                        .pr-badge {
                            top: 8px;
                            right: 8px;
                            padding: 4px 10px;
                            border-radius: 14px;
                            font-size: 10px;
                            font-weight: 600;
                            background: rgba(0, 0, 0, 0.50);
                            backdrop-filter: blur(12px);
                            -webkit-backdrop-filter: blur(12px);
                            border: 1px solid rgba(0, 0, 0, 0.7);
                            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.15);
                        }
                        
                        /* MOBILE ACTION BUTTONS - ALWAYS VISIBLE WITH DARK BACKDROP */
                        .pr-actions {
                            opacity: 1;
                            transform: translateY(0);
                            bottom: 8px;
                            left: 8px;
                            right: 8px;
                        }
                        
                        .pr-action-btn {
                            width: 32px;
                            height: 32px;
                            font-size: 13px;
                            border-radius: 16px;
                            background: rgba(0, 0, 0, 0.50);
                            backdrop-filter: blur(12px);
                            -webkit-backdrop-filter: blur(12px);
                            border: 1px solid rgba(0, 0, 0, 0.7);
                            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.15);
                        }
                        
                        .pr-action-btn:hover {
                            background: rgba(0, 0, 0, 0.65);
                            transform: scale(1);
                        }
                        
                        .pr-info {
                            padding: 12px;
                        }
                        
                        .pr-category {
                            font-size: 10px;
                            margin-bottom: 10px;
                        }
                        
                        .pr-title {
                            font-size: 14px;
                            margin-bottom: 5px;
                        }
                        
                        .pr-price {
                            margin-bottom: 10px;
                        }
                        
                        .pr-price-current {
                            font-size: 18px;
                        }
                        
                        .pr-price-current .pr-currency {
                            font-size: 16px;
                        }
                        
                        .pr-add-to-cart {
                            padding: 8px;
                            font-size: 12px;
                        }
                    }
                    
                    /* Small Mobile (≤480px) - 2 columns - ALWAYS VISIBLE BUTTONS */
                    @media (max-width: 480px) {
                        .pr-grid {
                            gap: 12px;
                        }
                        
                        .pr-image-container {
                            height: 120px;
                        }
                        
                        .pr-image-emoji {
                            font-size: 28px;
                        }
                        
                        /* SMALL MOBILE BADGE - DARK TRANSPARENT BACKDROP */
                        .pr-badge {
                            top: 6px;
                            right: 6px;
                            padding: 3px 8px;
                            border-radius: 12px;
                            font-size: 9px;
                            background: rgba(0, 0, 0, 0.50);
                            backdrop-filter: blur(12px);
                            -webkit-backdrop-filter: blur(12px);
                            border: 1px solid rgba(0, 0, 0, 0.7);
                            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.15);
                        }
                        
                        /* SMALL MOBILE ACTION BUTTONS - ALWAYS VISIBLE WITH DARK BACKDROP */
                        .pr-actions {
                            opacity: 1;
                            transform: translateY(0);
                            bottom: 6px;
                            left: 6px;
                            right: 6px;
                        }
                        
                        .pr-action-btn {
                            width: 30px;
                            height: 30px;
                            font-size: 12px;
                            border-radius: 15px;
                            background: rgba(0, 0, 0, 0.50);
                            backdrop-filter: blur(12px);
                            -webkit-backdrop-filter: blur(12px);
                            border: 1px solid rgba(0, 0, 0, 0.7);
                            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.15);
                        }
                        
                        .pr-action-btn:hover {
                            background: rgba(0, 0, 0, 0.65);
                        }
                        
                        .pr-info {
                            padding: 10px;
                        }
                        
                        .pr-title {
                            font-size: 13px;
                        }
                        
                        .pr-price-current {
                            font-size: 16px;
                        }
                    }
                </style>
            `;
            
            document.head.insertAdjacentHTML('beforeend', styles);
        },
        
        /**
         * Check if URL is valid
         */
        isValidURL: function(string) {
            try {
                new URL(string);
                return true;
            } catch (_) {
                return false;
            }
        },
        
        /**
         * Generate star rating HTML
         */
        generateStars: function(rating) {
            let stars = '';
            const fullStars = Math.floor(rating);
            const hasHalfStar = rating % 1 !== 0;
            
            for (let i = 0; i < fullStars; i++) {
                stars += '<i class="fas fa-star"></i>';
            }
            
            if (hasHalfStar) {
                stars += '<i class="fas fa-star-half-alt"></i>';
            }
            
            const emptyStars = 5 - Math.ceil(rating);
            for (let i = 0; i < emptyStars; i++) {
                stars += '<i class="far fa-star"></i>';
            }
            
            return stars;
        },
        
        /**
         * Generate image content HTML
         */
        generateImageContent: function(product) {
            if (product.image && this.isValidURL(product.image)) {
                return `
                    <img 
                        src="${product.image}" 
                        alt="${product.title}" 
                        class="pr-image"
                        onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" 
                    />
                    <div class="pr-image-emoji" style="display: none;">🛒</div>
                `;
            } else if (product.image && product.image.trim() !== '') {
                return `<div class="pr-image-emoji">${product.image}</div>`;
            } else {
                return '<div class="pr-image-emoji">🛒</div>';
            }
        },
        
        /**
         * Generate action buttons HTML
         */
        generateActions: function(product) {
            let actions = '<div class="pr-actions">';
            
            // Share button - Left side
            if (this.config.enableShare) {
                actions += `
                    <button class="pr-action-btn" data-action="share" data-product-id="${product.id}" title="Share">
                        <i class="fas fa-share-alt"></i>
                    </button>
                `;
            } else {
                actions += '<div></div>'; // Spacer for flexbox
            }
            
            // Quick View button - Right side
            if (this.config.enableQuickView) {
                actions += `
                    <button class="pr-action-btn" data-action="quickView" data-product-id="${product.id}" title="Quick View">
                        <i class="fas fa-eye"></i>
                    </button>
                `;
            }
            
            actions += '</div>';
            return actions;
        },
        
        /**
         * Generate product card HTML
         */
        generateCard: function(product) {
            if (!product.title || !product.price) return '';
            
            const discount = this.config.showDiscount && product.originalPrice 
                ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
                : 0;
            
            const imageContent = this.generateImageContent(product);
            const actions = this.generateActions(product);
            
            return `
                <div class="pr-card" data-product-id="${product.id}" data-category="${product.category || ''}" data-price="${product.price}">
                    <div class="pr-image-container">
                        ${imageContent}
                        ${discount > 0 ? `<span class="pr-badge">${discount}% OFF</span>` : ''}
                        ${actions}
                    </div>
                    <div class="pr-info">
                        ${product.category ? `<div class="pr-category">${product.category}</div>` : ''}
                        <h3 class="pr-title">${product.title}</h3>
                        ${this.config.showRating && product.rating ? `
                            <div class="pr-rating">
                                <div class="pr-stars">${this.generateStars(product.rating)}</div>
                                ${product.reviews ? `<span class="pr-rating-count">(${product.reviews})</span>` : ''}
                            </div>
                        ` : ''}
                        <div class="pr-price">
                            <span class="pr-price-current"><span class="pr-currency">${this.config.currency}</span>${product.price.toFixed(2)}</span>
                            ${product.originalPrice ? `<span class="pr-price-original">${this.config.currency}${product.originalPrice.toFixed(2)}</span>` : ''}
                        </div>
                        <button class="pr-add-to-cart" data-action="addToCart" data-product-id="${product.id}">
                             Add to Cart
                        </button>
                    </div>
                </div>
            `;
        },
        
        /**
         * Generate empty state HTML
         */
        generateEmptyState: function() {
            return `
                <div class="pr-empty">
                    <div class="pr-empty-icon">
                        <i class="${this.config.emptyIcon}"></i>
                    </div>
                    <h3 class="pr-empty-message">${this.config.emptyMessage}</h3>
                </div>
            `;
        },
        
        /**
         * Attach event listeners to action buttons
         */
        attachEventListeners: function() {
            const buttons = this.container.querySelectorAll('[data-action]');
            
            buttons.forEach(button => {
                button.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = e.currentTarget.dataset.action;
                    const productId = e.currentTarget.dataset.productId;
                    
                    switch(action) {
                        case 'addToCart':
                            if (this.config.onAddToCart) {
                                this.config.onAddToCart(productId);
                            }
                            break;
                        case 'quickView':
                            if (this.config.onQuickView) {
                                this.config.onQuickView(productId);
                            }
                            break;
                        case 'share':
                            if (this.config.onShare) {
                                this.config.onShare(productId);
                            }
                            break;
                    }
                });
            });
        },
        
        /**
         * Render products to the container
         */
        render: function(productsToRender) {
            if (!this.container) {
                console.error('Container not initialized. Call init() first.');
                return;
            }
            
            // Use provided products or default to config products
            const products = productsToRender || this.config.products;
            
            // Clear container
            this.container.innerHTML = '';
            
            // Add grid class
            if (!this.container.classList.contains('pr-grid')) {
                this.container.classList.add('pr-grid');
            }
            
            // Check if products exist
            if (!products || products.length === 0) {
                this.container.innerHTML = this.generateEmptyState();
                return;
            }
            
            // Generate and append product cards
            products.forEach(product => {
                const cardHTML = this.generateCard(product);
                if (cardHTML) {
                    this.container.insertAdjacentHTML('beforeend', cardHTML);
                }
            });
            
            // Attach event listeners
            this.attachEventListeners();
        },
        
        /**
         * Update products array
         */
        updateProducts: function(products) {
            this.config.products = products;
        },
        
        /**
         * Filter products by category
         */
        filterByCategory: function(category) {
            if (!category || category === 'all') {
                return this.config.products;
            }
            return this.config.products.filter(p => p.category === category);
        },
        
        /**
         * Filter products by price range
         */
        filterByPrice: function(min, max) {
            return this.config.products.filter(p => p.price >= min && p.price <= max);
        },
        
        /**
         * Search products by text
         */
        search: function(query) {
            const lowerQuery = query.toLowerCase();
            return this.config.products.filter(p => 
                p.title.toLowerCase().includes(lowerQuery) ||
                (p.category && p.category.toLowerCase().includes(lowerQuery)) ||
                (p.description && p.description.toLowerCase().includes(lowerQuery))
            );
        },
        
        /**
         * Sort products
         */
        sort: function(products, sortBy) {
            const sorted = [...products];
            
            switch(sortBy) {
                case 'price-asc':
                    return sorted.sort((a, b) => a.price - b.price);
                case 'price-desc':
                    return sorted.sort((a, b) => b.price - a.price);
                case 'name-asc':
                    return sorted.sort((a, b) => a.title.localeCompare(b.title));
                case 'name-desc':
                    return sorted.sort((a, b) => b.title.localeCompare(a.title));
                case 'rating':
                    return sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
                default:
                    return sorted;
            }
        }
    };
    
    // Expose to global scope
    window.ProductRenderer = ProductRenderer;
    
})(window);