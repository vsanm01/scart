/**
 * QRGen - Simple QR Code Generator Library
 * Version: 1.0.0
 * 
 * Usage:
 * <script src="https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js"></script>
 * <script src="path/to/qrgen.js"></script>
 * 
 * QRGen.generate({
 *   text: 'https://example.com',
 *   container: '#qr-container',
 *   size: 256,
 *   logo: 'path/to/logo.png', // optional
 *   errorCorrection: 'H'
 * });
 */

(function(global) {
    'use strict';

    const QRGen = {
        version: '1.0.0',
        
        /**
         * Generate QR Code
         * @param {Object} options - Configuration options
         * @param {string} options.text - Text or URL to encode
         * @param {string|HTMLElement} options.container - Container selector or element
         * @param {number} options.size - QR code size (default: 256)
         * @param {string} options.logo - Logo image URL (optional)
         * @param {number} options.logoSize - Logo size as percentage of QR size (default: 20)
         * @param {string} options.errorCorrection - Error correction level: L, M, Q, H (default: H)
         * @param {string} options.foreground - Foreground color (default: #333333)
         * @param {string} options.background - Background color (default: transparent)
         * @param {Function} options.onSuccess - Callback on success
         * @param {Function} options.onError - Callback on error
         * @returns {HTMLCanvasElement|null} Generated canvas element
         */
        generate: function(options) {
            // Validate required parameters
            if (!options.text) {
                this._handleError('Text parameter is required', options.onError);
                return null;
            }

            if (!options.container) {
                this._handleError('Container parameter is required', options.onError);
                return null;
            }

            // Check if QRious library is loaded
            if (typeof QRious === 'undefined') {
                this._handleError('QRious library not loaded. Include: https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js', options.onError);
                return null;
            }

            // Set defaults
            const config = {
                text: options.text,
                size: options.size || 256,
                logo: options.logo || null,
                logoSize: options.logoSize || 20,
                errorCorrection: options.errorCorrection || 'H',
                foreground: options.foreground || '#333333',
                background: options.background || 'transparent',
                onSuccess: options.onSuccess || null,
                onError: options.onError || null
            };

            // Get container element
            const container = typeof options.container === 'string' 
                ? document.querySelector(options.container) 
                : options.container;

            if (!container) {
                this._handleError('Container element not found', config.onError);
                return null;
            }

            try {
                // Clear container
                container.innerHTML = '';

                // Create canvas
                const canvas = document.createElement('canvas');
                canvas.width = config.size;
                canvas.height = config.size;

                // Generate QR code
                const qr = new QRious({
                    element: canvas,
                    value: config.text,
                    size: config.size,
                    level: config.errorCorrection,
                    background: config.background,
                    foreground: config.foreground
                });

                // If logo is provided, add it
                if (config.logo) {
                    this._addLogo(canvas, config.logo, config.logoSize, function() {
                        container.appendChild(canvas);
                        if (config.onSuccess) config.onSuccess(canvas);
                    }, config.onError);
                } else {
                    container.appendChild(canvas);
                    if (config.onSuccess) config.onSuccess(canvas);
                }

                return canvas;

            } catch (error) {
                this._handleError('Error generating QR code: ' + error.message, config.onError);
                return null;
            }
        },

        /**
         * Add logo to QR code canvas
         * @private
         */
        _addLogo: function(canvas, logoUrl, logoSizePercent, onSuccess, onError) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            img.onload = function() {
                const ctx = canvas.getContext('2d');
                const logoSize = (canvas.width * logoSizePercent) / 100;
                const x = (canvas.width - logoSize) / 2;
                const y = (canvas.height - logoSize) / 2;

                // Draw white background circle for logo
                ctx.fillStyle = 'white';
                ctx.beginPath();
                ctx.arc(canvas.width / 2, canvas.height / 2, logoSize / 2 + 5, 0, 2 * Math.PI);
                ctx.fill();

                // Draw logo
                ctx.drawImage(img, x, y, logoSize, logoSize);
                
                if (onSuccess) onSuccess();
            };

            img.onerror = function() {
                console.warn('Failed to load logo, generating QR without logo');
                if (onSuccess) onSuccess();
            };

            img.src = logoUrl;
        },

        /**
         * Generate QR code for current page URL with optional logo
         * @param {Object} options - Configuration options (same as generate)
         * @returns {HTMLCanvasElement|null} Generated canvas element
         */
        generateForCurrentPage: function(options) {
            options = options || {};
            options.text = window.location.href;
            return this.generate(options);
        },

        /**
         * Download QR code as PNG
         * @param {HTMLCanvasElement} canvas - Canvas element to download
         * @param {string} filename - Download filename (default: qrcode.png)
         */
        download: function(canvas, filename) {
            if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
                console.error('Invalid canvas element');
                return;
            }

            filename = filename || 'qrcode.png';
            
            const link = document.createElement('a');
            link.download = filename;
            link.href = canvas.toDataURL('image/png');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        },

        /**
         * Get QR code as data URL
         * @param {HTMLCanvasElement} canvas - Canvas element
         * @returns {string} Data URL
         */
        toDataURL: function(canvas) {
            if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
                console.error('Invalid canvas element');
                return null;
            }
            return canvas.toDataURL('image/png');
        },

        /**
         * Handle errors
         * @private
         */
        _handleError: function(message, callback) {
            console.error('QRGen Error:', message);
            if (callback) callback(new Error(message));
        }
    };

    // Export to global scope
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = QRGen;
    } else {
        global.QRGen = QRGen;
    }

})(typeof window !== 'undefined' ? window : this);
