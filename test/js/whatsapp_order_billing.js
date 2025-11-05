/**
 * WhatsApp Order Billing System
 * Version: 1.0.0
 * A lightweight, reusable library for generating and sending orders via WhatsApp
 * License: MIT
 */

(function(window) {
    'use strict';

    /**
     * WhatsAppBilling Constructor
     * @param {Object} config - Configuration options
     */
    function WhatsAppBilling(config) {
        this.config = {
            // WhatsApp Configuration
            whatsappNumber: '',
            countryCode: '91',
            
            // Display Configuration
            currency: '₹',
            currencyPosition: 'before', // 'before' or 'after'
            dateFormat: 'locale', // 'locale', 'iso', 'custom'
            timeFormat: '12h', // '12h' or '24h'
            
            // Message Configuration
            messageTemplate: 'default', // 'default', 'minimal', 'detailed', 'custom'
            includeTimestamp: true,
            includeWebsiteUrl: true,
            includeAttribution: true,
            customAttribution: '',
            
            // Separator Configuration
            separatorChar: '═',
            separatorLength: 25,
            useBoldHeaders: true,
            
            // Order Configuration
            showItemNumbers: true,
            showSubtotal: true,
            showDeliveryCharge: true,
            groupByCategory: false,
            
            // Callbacks
            onBeforeSend: null,
            onAfterSend: null,
            onError: null,
            onSuccess: null,
            
            // Validation
            validatePhone: true,
            validateOrder: true,
            minOrderAmount: 0,
            
            // Custom Fields
            customFields: [],
            
            ...config
        };
        
        this.orderData = null;
    }

    /**
     * Format currency value
     */
    WhatsAppBilling.prototype.formatCurrency = function(amount) {
        const formatted = typeof amount === 'number' ? amount.toFixed(2) : amount;
        
        if (this.config.currencyPosition === 'after') {
            return `${formatted}${this.config.currency}`;
        }
        return `${this.config.currency}${formatted}`;
    };

    /**
     * Create separator line
     */
    WhatsAppBilling.prototype.createSeparator = function() {
        return this.config.separatorChar.repeat(this.config.separatorLength);
    };

    /**
     * Format text as bold (WhatsApp markdown)
     */
    WhatsAppBilling.prototype.bold = function(text) {
        return this.config.useBoldHeaders ? `*${text}*` : text;
    };

    /**
     * Format date and time
     */
    WhatsAppBilling.prototype.formatDateTime = function(date) {
        const d = date || new Date();
        
        if (this.config.dateFormat === 'iso') {
            return d.toISOString();
        } else if (this.config.dateFormat === 'locale') {
            const dateStr = d.toLocaleDateString();
            const timeStr = this.config.timeFormat === '12h' 
                ? d.toLocaleTimeString('en-US', { hour12: true })
                : d.toLocaleTimeString('en-US', { hour12: false });
            return `${dateStr} ${timeStr}`;
        } else {
            return d.toString();
        }
    };

    /**
     * Validate order data
     */
    WhatsAppBilling.prototype.validateOrder = function(orderData) {
        const errors = [];

        // Check required fields
        if (!orderData.name || orderData.name.trim() === '') {
            errors.push('Customer name is required');
        }

        if (!orderData.mobile || orderData.mobile.trim() === '') {
            errors.push('Mobile number is required');
        }

        // Validate phone number
        if (this.config.validatePhone && orderData.mobile) {
            const phoneRegex = /^[0-9]{10}$/;
            if (!phoneRegex.test(orderData.mobile.replace(/\D/g, ''))) {
                errors.push('Invalid mobile number format');
            }
        }

        // Validate cart
        if (!orderData.cart || !Array.isArray(orderData.cart) || orderData.cart.length === 0) {
            errors.push('Cart is empty');
        }

        // Validate minimum order amount
        if (this.config.minOrderAmount > 0 && orderData.total < this.config.minOrderAmount) {
            errors.push(`Minimum order amount is ${this.formatCurrency(this.config.minOrderAmount)}`);
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    };

    /**
     * Generate WhatsApp message - Default Template
     */
    WhatsAppBilling.prototype.generateDefaultMessage = function(orderData) {
        let message = '';

        // Header
        message += this.bold('NEW ORDER') + '%0A';
        message += this.createSeparator() + '%0A';

        // Customer Information
        message += `Name: ${orderData.name}%0A`;
        message += `Mobile: ${orderData.mobile}%0A`;
        
        if (orderData.email && orderData.email.trim() !== '') {
            message += `Email: ${orderData.email}%0A`;
        }

        // Delivery Information
        const deliveryLabel = orderData.deliveryType === 'delivery' 
            ? orderData.deliveryOption?.label || 'Home Delivery'
            : orderData.deliveryOption?.label || 'Pickup';
        
        message += `Delivery: ${deliveryLabel}%0A`;
        
        if (orderData.address && orderData.address.trim() !== '') {
            message += `Address: ${orderData.address}%0A`;
        }

        // Custom Fields
        if (this.config.customFields.length > 0) {
            this.config.customFields.forEach(field => {
                if (orderData[field.key]) {
                    message += `${field.label}: ${orderData[field.key]}%0A`;
                }
            });
        }

        message += '%0A';
        message += this.createSeparator() + '%0A';
        message += this.bold('ORDER ITEMS') + '%0A';
        message += this.createSeparator() + '%0A';

        // Order Items
        if (this.config.groupByCategory && orderData.cart.some(item => item.category)) {
            // Group by category
            const grouped = {};
            orderData.cart.forEach(item => {
                const category = item.category || 'Other';
                if (!grouped[category]) grouped[category] = [];
                grouped[category].push(item);
            });

            Object.keys(grouped).forEach(category => {
                message += `%0A${this.bold(category)}%0A`;
                grouped[category].forEach((item, index) => {
                    const itemTotal = item.price * item.quantity;
                    const prefix = this.config.showItemNumbers ? `${index + 1}. ` : '• ';
                    message += `${prefix}${item.name} × ${item.quantity} = ${this.formatCurrency(itemTotal)}%0A`;
                });
            });
        } else {
            // Simple list
            orderData.cart.forEach((item, index) => {
                const itemTotal = item.price * item.quantity;
                const prefix = this.config.showItemNumbers ? `${index + 1}. ` : '• ';
                message += `${prefix}${item.name} × ${item.quantity} = ${this.formatCurrency(itemTotal)}%0A`;
            });
        }

        message += this.createSeparator() + '%0A';

        // Pricing Breakdown
        if (this.config.showSubtotal) {
            message += `Subtotal: ${this.formatCurrency(orderData.subtotal)}%0A`;
        }
        
        if (this.config.showDeliveryCharge && orderData.deliveryCharge > 0) {
            message += `Delivery Charge: ${this.formatCurrency(orderData.deliveryCharge)}%0A`;
        }

        message += this.bold(`TOTAL: ${this.formatCurrency(orderData.total)}`) + '%0A';
        message += this.createSeparator() + '%0A';

        // Timestamp
        if (this.config.includeTimestamp) {
            message += `Date: ${this.formatDateTime()}%0A`;
        }

        // Website URL
        if (this.config.includeWebsiteUrl) {
            message += `Website: ${window.location.origin}%0A`;
        }

        // Attribution
        if (this.config.includeAttribution) {
            const attribution = this.config.customAttribution || 'Generated via WhatsApp Billing System';
            message += `%0A${attribution}`;
        }

        return message;
    };

    /**
     * Generate WhatsApp message - Minimal Template
     */
    WhatsAppBilling.prototype.generateMinimalMessage = function(orderData) {
        let message = '';

        message += `${this.bold('Order from:')} ${orderData.name}%0A`;
        message += `${this.bold('Phone:')} ${orderData.mobile}%0A%0A`;

        orderData.cart.forEach((item, index) => {
            message += `${index + 1}. ${item.name} × ${item.quantity}%0A`;
        });

        message += `%0A${this.bold('Total:')} ${this.formatCurrency(orderData.total)}`;

        return message;
    };

    /**
     * Generate WhatsApp message - Detailed Template
     */
    WhatsAppBilling.prototype.generateDetailedMessage = function(orderData) {
        let message = '';

        // Header with order ID
        const orderId = orderData.orderId || `ORD${Date.now()}`;
        message += this.bold(`ORDER #${orderId}`) + '%0A';
        message += this.createSeparator() + '%0A%0A';

        // Customer Details Section
        message += this.bold('CUSTOMER DETAILS') + '%0A';
        message += `Name: ${orderData.name}%0A`;
        message += `Mobile: ${orderData.mobile}%0A`;
        if (orderData.email) message += `Email: ${orderData.email}%0A`;
        message += '%0A';

        // Delivery Details Section
        message += this.bold('DELIVERY DETAILS') + '%0A';
        message += `Type: ${orderData.deliveryOption?.label || 'Standard'}%0A`;
        if (orderData.address) {
            message += `Address: ${orderData.address}%0A`;
        }
        message += '%0A';

        // Items Section
        message += this.bold('ORDER ITEMS') + '%0A';
        message += this.createSeparator() + '%0A';
        
        orderData.cart.forEach((item, index) => {
            message += `${index + 1}. ${this.bold(item.name)}%0A`;
            message += `   Price: ${this.formatCurrency(item.price)}%0A`;
            message += `   Qty: ${item.quantity}%0A`;
            message += `   Subtotal: ${this.formatCurrency(item.price * item.quantity)}%0A`;
            if (index < orderData.cart.length - 1) message += '%0A';
        });

        message += this.createSeparator() + '%0A';

        // Payment Summary
        message += this.bold('PAYMENT SUMMARY') + '%0A';
        message += `Items Total: ${this.formatCurrency(orderData.subtotal)}%0A`;
        if (orderData.deliveryCharge > 0) {
            message += `Delivery: ${this.formatCurrency(orderData.deliveryCharge)}%0A`;
        }
        if (orderData.tax) {
            message += `Tax: ${this.formatCurrency(orderData.tax)}%0A`;
        }
        if (orderData.discount) {
            message += `Discount: -${this.formatCurrency(orderData.discount)}%0A`;
        }
        message += this.createSeparator() + '%0A';
        message += this.bold(`GRAND TOTAL: ${this.formatCurrency(orderData.total)}`) + '%0A';
        message += this.createSeparator() + '%0A%0A';

        // Footer
        message += `Order Date: ${this.formatDateTime()}%0A`;
        if (this.config.includeWebsiteUrl) {
            message += `Website: ${window.location.origin}%0A`;
        }

        return message;
    };

    /**
     * Generate WhatsApp message based on template
     */
    WhatsAppBilling.prototype.generateMessage = function(orderData) {
        switch (this.config.messageTemplate) {
            case 'minimal':
                return this.generateMinimalMessage(orderData);
            case 'detailed':
                return this.generateDetailedMessage(orderData);
            case 'custom':
                // Allow custom message generation
                if (typeof this.config.customMessageGenerator === 'function') {
                    return this.config.customMessageGenerator(orderData, this);
                }
                return this.generateDefaultMessage(orderData);
            default:
                return this.generateDefaultMessage(orderData);
        }
    };

    /**
     * Build WhatsApp URL
     */
    WhatsAppBilling.prototype.buildWhatsAppUrl = function(message) {
        // Clean and format phone number
        let phoneNumber = this.config.whatsappNumber.replace(/\D/g, '');
        
        // Add country code if not present
        if (!phoneNumber.startsWith(this.config.countryCode)) {
            phoneNumber = this.config.countryCode + phoneNumber;
        }

        // Build URL
        return `https://wa.me/${phoneNumber}?text=${message}`;
    };

    /**
     * Send order via WhatsApp
     */
    WhatsAppBilling.prototype.send = function(orderData) {
        try {
            // Store order data
            this.orderData = orderData;

            // Validate WhatsApp number
            if (!this.config.whatsappNumber) {
                throw new Error('WhatsApp number is not configured');
            }

            // Validate order
            if (this.config.validateOrder) {
                const validation = this.validateOrder(orderData);
                if (!validation.isValid) {
                    if (this.config.onError) {
                        this.config.onError(validation.errors);
                    }
                    throw new Error('Order validation failed: ' + validation.errors.join(', '));
                }
            }

            // Before send callback
            if (this.config.onBeforeSend) {
                const shouldContinue = this.config.onBeforeSend(orderData);
                if (shouldContinue === false) {
                    return false;
                }
            }

            // Generate message
            const message = this.generateMessage(orderData);

            // Build WhatsApp URL
            const whatsappUrl = this.buildWhatsAppUrl(message);

            // Open WhatsApp
            const newWindow = window.open(whatsappUrl, '_blank');

            if (newWindow) {
                // Success callback
                if (this.config.onSuccess) {
                    this.config.onSuccess(orderData);
                }

                // After send callback
                if (this.config.onAfterSend) {
                    this.config.onAfterSend(orderData);
                }

                return true;
            } else {
                throw new Error('Failed to open WhatsApp. Please check popup blocker settings.');
            }

        } catch (error) {
            console.error('WhatsAppBilling Error:', error);
            
            if (this.config.onError) {
                this.config.onError(error.message);
            }
            
            return false;
        }
    };

    /**
     * Quick send with minimal data
     */
    WhatsAppBilling.prototype.quickSend = function(name, mobile, cart, options = {}) {
        const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const deliveryCharge = options.deliveryCharge || 0;
        const total = subtotal + deliveryCharge;

        const orderData = {
            name: name,
            mobile: mobile,
            email: options.email || '',
            cart: cart,
            subtotal: subtotal,
            deliveryCharge: deliveryCharge,
            total: total,
            deliveryType: options.deliveryType || 'delivery',
            address: options.address || '',
            deliveryOption: options.deliveryOption || { label: 'Standard Delivery' },
            ...options
        };

        return this.send(orderData);
    };

    /**
     * Get last order data
     */
    WhatsAppBilling.prototype.getLastOrder = function() {
        return this.orderData;
    };

    /**
     * Preview message without sending
     */
    WhatsAppBilling.prototype.preview = function(orderData) {
        const message = this.generateMessage(orderData);
        return decodeURIComponent(message.replace(/%0A/g, '\n'));
    };

    /**
     * Update configuration
     */
    WhatsAppBilling.prototype.updateConfig = function(newConfig) {
        this.config = { ...this.config, ...newConfig };
        return this;
    };

    /**
     * Static method to create instance
     */
    WhatsAppBilling.create = function(config) {
        return new WhatsAppBilling(config);
    };

    // Expose to global scope
    window.WhatsAppBilling = WhatsAppBilling;

    // AMD/CommonJS compatibility
    if (typeof define === 'function' && define.amd) {
        define([], function() { return WhatsAppBilling; });
    } else if (typeof module === 'object' && module.exports) {
        module.exports = WhatsAppBilling;
    }

})(window);