/**
 * ShopCart.js v1.0.0
 * Enhanced shopping cart library with manual save functionality
 * (c) 2025
 * MIT License
 */

(function(global) {
    'use strict';

    class ShopCart {
        constructor(options = {}) {
            this.cart = [];
            this.products = [];
            this.tempEdits = new Map(); // Track unsaved changes
            this.options = {
                currency: options.currency || '$',
                locale: options.locale || 'en-US',
                primaryColor: options.primaryColor || '#2596be',
                onCartUpdate: options.onCartUpdate || null,
                onNotification: options.onNotification || null,
                onUnsavedChanges: options.onUnsavedChanges || null,
                selectors: {
                    cartItems: options.selectors?.cartItems || '#cartItems',
                    cartCount: options.selectors?.cartCount || '#cartCount',
                    cartTotal: options.selectors?.cartTotal || '#cartTotal',
                    cartSidebar: options.selectors?.cartSidebar || '#cartSidebar',
                    wishlistSidebar: options.selectors?.wishlistSidebar || '#wishlistSidebar'
                }
            };

            // Load cart from localStorage if available
            this.loadCart();
            
            // Inject required CSS
            this.injectStyles();
        }

        // Inject custom styles
        injectStyles() {
            if (document.getElementById('shopcart-styles')) return;
            
            const style = document.createElement('style');
            style.id = 'shopcart-styles';
            style.textContent = `
                .quantity-btn, .save-qty-btn, .cancel-qty-btn, .remove-btn {
                    transition: all 0.3s ease;
                }
                
                .quantity-btn {
                    background: #e5e7eb;
                    border: none;
                    width: 32px;
                    height: 32px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: bold;
                    color: #374151;
                }
                
                .quantity-btn:hover:not(:disabled) {
                    background: #d1d5db;
                }
                
                .quantity-btn:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }
                
                .save-qty-btn {
                    background: ${this.options.primaryColor};
                    color: white;
                    border: none;
                    padding: 6px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                    font-size: 13px;
                    margin-left: 8px;
                }
                
                .save-qty-btn:hover {
                    background: ${this.adjustColor(this.options.primaryColor, -20)};
                }
                
                .cancel-qty-btn {
                    background: #6b7280;
                    color: white;
                    border: none;
                    padding: 6px 12px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                    font-size: 13px;
                    margin-left: 4px;
                }
                
                .cancel-qty-btn:hover {
                    background: #4b5563;
                }
                
                .remove-btn {
                    background: none;
                    border: none;
                    color: #ef4444;
                    cursor: pointer;
                    margin-top: 8px;
                    font-size: 14px;
                }
                
                .remove-btn:hover {
                    color: #dc2626;
                }
                
                .quantity-input {
                    width: 50px;
                    text-align: center;
                    border: 1px solid #d1d5db;
                    border-radius: 6px;
                    padding: 4px;
                    font-size: 14px;
                    margin: 0 4px;
                }
                
                .quantity-input:focus {
                    outline: none;
                    border-color: ${this.options.primaryColor};
                }
                
                .quantity-controls {
                    display: flex;
                    align-items: center;
                    margin-top: 8px;
                    flex-wrap: wrap;
                    gap: 4px;
                }
                
                .item-edited {
                    background: #fef3c7;
                    border-left: 3px solid #f59e0b;
                    padding-left: 8px;
                }
                
                .unsaved-badge {
                    background: #f59e0b;
                    color: white;
                    font-size: 11px;
                    padding: 2px 8px;
                    border-radius: 10px;
                    font-weight: 600;
                    margin-left: 8px;
                }
                
                .cart-item {
                    display: flex;
                    gap: 12px;
                    padding: 16px;
                    border-bottom: 1px solid #e5e7eb;
                    transition: background 0.2s;
                }
                
                .cart-item-image {
                    width: 80px;
                    height: 80px;
                    border-radius: 8px;
                    overflow: hidden;
                    flex-shrink: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #f3f4f6;
                    font-size: 32px;
                }
                
                .cart-item-image img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }
                
                .cart-item-info {
                    flex: 1;
                }
                
                .cart-item-title {
                    font-weight: 600;
                    font-size: 15px;
                    margin-bottom: 4px;
                    color: #111827;
                }
                
                .cart-item-price {
                    color: #6b7280;
                    font-size: 14px;
                    margin-bottom: 8px;
                }
                
                .item-subtotal {
                    font-size: 14px;
                    color: #374151;
                    margin-top: 8px;
                }
                
                .stock-status {
                    font-size: 12px;
                    margin-top: 6px;
                }
                
                .stock-available {
                    color: #059669;
                }
                
                .stock-low {
                    color: #d97706;
                    font-weight: 600;
                }
                
                .stock-out {
                    color: #dc2626;
                    font-weight: 600;
                }
                
                .shopcart-notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: white;
                    padding: 16px 20px;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    z-index: 9999;
                    min-width: 300px;
                    animation: slideIn 0.3s ease;
                }
                
                @keyframes slideIn {
                    from {
                        transform: translateX(400px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                
                .notification-success {
                    border-left: 4px solid #10b981;
                }
                
                .notification-error {
                    border-left: 4px solid #ef4444;
                }
                
                .notification-warning {
                    border-left: 4px solid #f59e0b;
                }
                
                .notification-info {
                    border-left: 4px solid ${this.options.primaryColor};
                }
            `;
            document.head.appendChild(style);
        }

        // Adjust color brightness
        adjustColor(color, amount) {
            const hex = color.replace('#', '');
            const num = parseInt(hex, 16);
            const r = Math.max(0, Math.min(255, (num >> 16) + amount));
            const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount));
            const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount));
            return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
        }

        // Initialize with products
        setProducts(products) {
            this.products = products;
        }

        // Format price
        formatPrice(price) {
            return this.options.currency + price.toFixed(2);
        }

        // Check if URL is valid
        isValidURL(string) {
            try {
                new URL(string);
                return true;
            } catch (_) {
                return false;
            }
        }

        // Show notification
        showNotification(type, message) {
            if (this.options.onNotification) {
                this.options.onNotification(type, message);
                return;
            }
            
            // Remove existing notifications
            const existing = document.querySelectorAll('.shopcart-notification');
            existing.forEach(el => el.remove());
            
            const notification = document.createElement('div');
            notification.className = `shopcart-notification notification-${type}`;
            notification.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="font-size: 20px;">
                        ${type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '⚠' : 'ℹ'}
                    </div>
                    <div style="flex: 1;">
                        <div style="font-weight: 600; margin-bottom: 2px;">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
                        <div style="font-size: 14px; color: #6b7280;">${message}</div>
                    </div>
                </div>
            `;
            document.body.appendChild(notification);
            
            setTimeout(() => {
                notification.style.animation = 'slideIn 0.3s ease reverse';
                setTimeout(() => notification.remove(), 300);
            }, 3000);
        }

        // Get element
        $(selector) {
            return document.querySelector(selector);
        }

        // Get all elements
        $$(selector) {
            return document.querySelectorAll(selector);
        }

        // Check for unsaved changes
        hasUnsavedChanges() {
            return this.tempEdits.size > 0;
        }

        // Get unsaved changes count
        getUnsavedCount() {
            return this.tempEdits.size;
        }

        // Add to cart
        addToCart(productId, quantity = 1) {
            const product = this.products.find(p => p.id === productId);
            
            if (!product) {
                this.showNotification('error', 'Product not found');
                return false;
            }
            
            if (product.stock !== undefined && product.stock <= 0) {
                this.showNotification('warning', 'Product is out of stock');
                return false;
            }
            
            const existingItem = this.cart.find(item => item.id === productId);
            if (existingItem) {
                const newQuantity = existingItem.quantity + quantity;
                if (product.stock !== undefined && newQuantity > product.stock) {
                    this.showNotification('warning', `Maximum stock reached (${product.stock} available)`);
                    existingItem.quantity = product.stock;
                } else {
                    existingItem.quantity = newQuantity;
                }
            } else {
                const finalQuantity = product.stock !== undefined ? Math.min(quantity, product.stock) : quantity;
                this.cart.push({...product, quantity: finalQuantity});
            }
            
            this.saveCart();
            this.updateCartUI();
            this.showNotification('success', `${product.title} added to cart!`);
            return true;
        }

        // Start editing quantity (temporary)
        startEditQuantity(productId, change) {
            const product = this.products.find(p => p.id === productId);
            const cartItem = this.cart.find(item => item.id === productId);
            
            if (!product || !cartItem) {
                this.showNotification('error', 'Product not found');
                return;
            }
            
            // Get current temp value or actual cart value
            let currentTemp = this.tempEdits.get(productId) ?? cartItem.quantity;
            let newQuantity = currentTemp + change;
            
            // Validation
            if (newQuantity < 0) {
                this.showNotification('warning', 'Quantity cannot be negative');
                return;
            }
            
            if (newQuantity === 0) {
                this.tempEdits.set(productId, 0);
                this.updateCartUI();
                this.notifyUnsavedChanges();
                return;
            }
            
            if (product.stock !== undefined && newQuantity > product.stock) {
                this.showNotification('warning', `Maximum stock reached (${product.stock} available)`);
                return;
            }
            
            this.tempEdits.set(productId, newQuantity);
            this.updateCartUI();
            this.notifyUnsavedChanges();
        }

        // Set quantity directly (temporary)
        setTempQuantity(productId, value) {
            const product = this.products.find(p => p.id === productId);
            const cartItem = this.cart.find(item => item.id === productId);
            
            if (!product || !cartItem) {
                this.showNotification('error', 'Product not found');
                return;
            }
            
            let quantity = parseInt(value);
            
            if (isNaN(quantity) || quantity < 0) {
                this.showNotification('warning', 'Please enter a valid quantity');
                this.updateCartUI();
                return;
            }
            
            if (product.stock !== undefined && quantity > product.stock) {
                this.showNotification('warning', `Only ${product.stock} items available`);
                quantity = product.stock;
            }
            
            this.tempEdits.set(productId, quantity);
            this.updateCartUI();
            this.notifyUnsavedChanges();
        }

        // Save quantity changes
        saveQuantity(productId) {
            const tempQuantity = this.tempEdits.get(productId);
            
            if (tempQuantity === undefined) {
                this.showNotification('info', 'No changes to save');
                return;
            }
            
            if (tempQuantity === 0) {
                if (confirm('Remove this item from cart?')) {
                    this.removeFromCart(productId);
                } else {
                    this.tempEdits.delete(productId);
                    this.updateCartUI();
                }
                return;
            }
            
            const cartItem = this.cart.find(item => item.id === productId);
            if (cartItem) {
                cartItem.quantity = tempQuantity;
                this.tempEdits.delete(productId);
                this.saveCart();
                this.updateCartUI();
                this.showNotification('success', 'Quantity updated successfully');
                this.notifyUnsavedChanges();
            }
        }

        // Cancel quantity changes
        cancelQuantity(productId) {
            this.tempEdits.delete(productId);
            this.updateCartUI();
            this.notifyUnsavedChanges();
            this.showNotification('info', 'Changes cancelled');
        }

        // Save all quantity changes
        saveAllQuantities() {
            if (!this.hasUnsavedChanges()) {
                this.showNotification('info', 'No changes to save');
                return;
            }
            
            const itemsToRemove = [];
            
            this.tempEdits.forEach((quantity, productId) => {
                if (quantity === 0) {
                    itemsToRemove.push(productId);
                } else {
                    const cartItem = this.cart.find(item => item.id === productId);
                    if (cartItem) {
                        cartItem.quantity = quantity;
                    }
                }
            });
            
            if (itemsToRemove.length > 0) {
                if (confirm(`Remove ${itemsToRemove.length} item(s) from cart?`)) {
                    itemsToRemove.forEach(id => this.removeFromCart(id));
                }
            }
            
            this.tempEdits.clear();
            this.saveCart();
            this.updateCartUI();
            this.showNotification('success', 'All changes saved');
            this.notifyUnsavedChanges();
        }

        // Cancel all quantity changes
        cancelAllQuantities() {
            if (!this.hasUnsavedChanges()) {
                return;
            }
            
            if (confirm('Discard all unsaved changes?')) {
                this.tempEdits.clear();
                this.updateCartUI();
                this.showNotification('info', 'All changes cancelled');
                this.notifyUnsavedChanges();
            }
        }

        // Notify about unsaved changes
        notifyUnsavedChanges() {
            if (this.options.onUnsavedChanges) {
                this.options.onUnsavedChanges(this.hasUnsavedChanges(), this.getUnsavedCount());
            }
        }

        // Remove from cart
        removeFromCart(productId) {
            this.cart = this.cart.filter(item => item.id !== productId);
            this.tempEdits.delete(productId);
            this.saveCart();
            this.updateCartUI();
            this.showNotification('info', 'Item removed from cart');
            this.notifyUnsavedChanges();
        }

        // Update cart UI
        updateCartUI() {
            const cartItems = this.$(this.options.selectors.cartItems);
            const cartCount = this.$(this.options.selectors.cartCount);
            const cartTotal = this.$(this.options.selectors.cartTotal);
            
            if (!cartItems) return;
            
            cartItems.innerHTML = '';
            
            if (this.cart.length === 0) {
                cartItems.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 50px 20px;">Your cart is empty</p>';
                if (cartCount) cartCount.textContent = '0';
                if (cartTotal) cartTotal.textContent = this.formatPrice(0);
                
                if (this.options.onCartUpdate) {
                    this.options.onCartUpdate(this.cart, 0, 0);
                }
                return;
            }
            
            let total = 0;
            let itemCount = 0;
            
            this.cart.forEach(item => {
                const product = this.products.find(p => p.id === item.id);
                const stock = product?.stock;
                const hasUnsaved = this.tempEdits.has(item.id);
                const displayQuantity = hasUnsaved ? this.tempEdits.get(item.id) : item.quantity;
                const itemSubtotal = item.price * item.quantity;
                const tempSubtotal = item.price * displayQuantity;
                
                total += itemSubtotal;
                itemCount += item.quantity;
                
                let itemImageContent;
                if (item.image && this.isValidURL(item.image)) {
                    itemImageContent = `<img src="${item.image}" alt="${item.title}" />`;
                } else if (item.image && item.image.trim() !== '') {
                    itemImageContent = item.image;
                } else {
                    itemImageContent = '🛒';
                }
                
                let stockClass = 'stock-available';
                let stockText = stock ? `${stock} available` : '';
                if (stock !== undefined) {
                    if (stock <= 0) {
                        stockClass = 'stock-out';
                        stockText = 'Out of stock';
                    } else if (stock <= 5) {
                        stockClass = 'stock-low';
                        stockText = `Only ${stock} left`;
                    }
                }
                
                const cartItem = document.createElement('div');
                cartItem.className = `cart-item ${hasUnsaved ? 'item-edited' : ''}`;
                cartItem.dataset.itemId = item.id;
                cartItem.innerHTML = `
                    <div class="cart-item-image">${itemImageContent}</div>
                    <div class="cart-item-info">
                        <div class="cart-item-title">
                            ${item.title}
                            ${hasUnsaved ? '<span class="unsaved-badge">UNSAVED</span>' : ''}
                        </div>
                        <div class="cart-item-price">${this.formatPrice(item.price)}</div>
                        
                        <div class="quantity-controls">
                            <button class="quantity-btn" data-action="decrease" data-product-id="${item.id}" 
                                ${displayQuantity <= 0 ? 'disabled' : ''}>
                                <i class="fas fa-minus"></i>
                            </button>
                            <input type="number" class="quantity-input" value="${displayQuantity}" 
                                   min="0" ${stock !== undefined ? `max="${stock}"` : ''} 
                                   data-product-id="${item.id}">
                            <button class="quantity-btn" data-action="increase" data-product-id="${item.id}" 
                                ${stock !== undefined && displayQuantity >= stock ? 'disabled' : ''}>
                                <i class="fas fa-plus"></i>
                            </button>
                            ${hasUnsaved ? `
                                <button class="save-qty-btn" data-product-id="${item.id}">Save</button>
                                <button class="cancel-qty-btn" data-product-id="${item.id}">Cancel</button>
                            ` : ''}
                        </div>
                        
                        <div class="item-subtotal">
                            ${hasUnsaved && tempSubtotal !== itemSubtotal ? `
                                <span style="text-decoration: line-through; color: #9ca3af;">${this.formatPrice(itemSubtotal)}</span>
                                → <strong>${this.formatPrice(tempSubtotal)}</strong>
                            ` : `Subtotal: <strong>${this.formatPrice(itemSubtotal)}</strong>`}
                        </div>
                        
                        ${stockText ? `<div class="stock-status ${stockClass}">${stockText}</div>` : ''}
                        
                        <button class="remove-btn" data-product-id="${item.id}">
                            <i class="fas fa-trash"></i> Remove
                        </button>
                    </div>
                `;
                
                cartItems.appendChild(cartItem);
            });
            
            if (cartCount) cartCount.textContent = itemCount;
            if (cartTotal) cartTotal.textContent = this.formatPrice(total);
            
            // Attach event listeners
            this.attachCartEventListeners();
            
            if (this.options.onCartUpdate) {
                this.options.onCartUpdate(this.cart, total, itemCount);
            }
        }

        // Attach event listeners to cart items
        attachCartEventListeners() {
            // Quantity buttons
            this.$$('.quantity-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const productId = btn.dataset.productId;
                    const action = btn.dataset.action;
                    const change = action === 'increase' ? 1 : -1;
                    this.startEditQuantity(productId, change);
                });
            });

            // Quantity inputs
            this.$$('.quantity-input').forEach(input => {
                input.addEventListener('change', () => {
                    const productId = input.dataset.productId;
                    this.setTempQuantity(productId, input.value);
                });
            });

            // Save buttons
            this.$$('.save-qty-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const productId = btn.dataset.productId;
                    this.saveQuantity(productId);
                });
            });

            // Cancel buttons
            this.$$('.cancel-qty-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const productId = btn.dataset.productId;
                    this.cancelQuantity(productId);
                });
            });

            // Remove buttons
            this.$$('.remove-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const productId = btn.dataset.productId;
                    this.removeFromCart(productId);
                });
            });
        }

        // Toggle cart
        toggleCart() {
            const cartSidebar = this.$(this.options.selectors.cartSidebar);
            const wishlistSidebar = this.$(this.options.selectors.wishlistSidebar);
            
            if (wishlistSidebar) {
                wishlistSidebar.classList.remove('active');
            }
            
            if (cartSidebar) {
                cartSidebar.classList.toggle('active');
                
                if (cartSidebar.classList.contains('active')) {
                    this.showOverlay();
                } else {
                    this.hideOverlay();
                }
            }
        }

        // Close cart
        closeCart() {
            if (this.hasUnsavedChanges()) {
                if (!confirm('You have unsaved changes. Close anyway?')) {
                    return false;
                }
                this.tempEdits.clear();
            }
            
            const cartSidebar = this.$(this.options.selectors.cartSidebar);
            if (cartSidebar) {
                cartSidebar.classList.remove('active');
            }
            this.hideOverlay();
            return true;
        }

        // Show overlay
        showOverlay() {
            if (!this.$('.shopcart-overlay')) {
                const overlay = document.createElement('div');
                overlay.className = 'shopcart-overlay';
                overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1500;';
                overlay.addEventListener('click', () => this.closeCart());
                document.body.appendChild(overlay);
            }
        }

        // Hide overlay
        hideOverlay() {
            const overlay = this.$('.shopcart-overlay');
            if (overlay) {
                overlay.remove();
            }
        }

        // Get cart data
        getCart() {
            return this.cart;
        }

        // Get cart total
        getCartTotal() {
            return this.cart.reduce((total, item) => total + (item.price * item.quantity), 0);
        }

        // Get cart count
        getCartCount() {
            return this.cart.reduce((count, item) => count + item.quantity, 0);
        }

        // Clear cart
        clearCart() {
            if (confirm('Clear all items from cart?')) {
                this.cart = [];
                this.tempEdits.clear();
                this.saveCart();
                this.updateCartUI();
                this.showNotification('info', 'Cart cleared');
                this.notifyUnsavedChanges();
            }
        }

        // Save cart to localStorage
        saveCart() {
            try {
                localStorage.setItem('shopcart_items', JSON.stringify(this.cart));
            } catch (e) {
                console.warn('Could not save cart to localStorage:', e);
            }
        }

        // Load cart from localStorage
        loadCart() {
            try {
                const saved = localStorage.getItem('shopcart_items');
                if (saved) {
                    this.cart = JSON.parse(saved);
                }
            } catch (e) {
                console.warn('Could not load cart from localStorage:', e);
            }
        }
    }

    // Export for different module systems
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ShopCart;
    } else if (typeof define === 'function' && define.amd) {
        define(function() { return ShopCart; });
    } else {
        global.ShopCart = ShopCart;
    }

})(typeof window !== 'undefined' ? window : this);
