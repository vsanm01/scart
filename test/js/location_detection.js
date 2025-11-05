/**
 * Universal Location Detection Library
 * Version: 1.0.0
 * A reusable, CDN-ready JavaScript library for detecting user location
 * Supports: GPS, IP-based, Pincode, and Manual entry
 * 
 * Usage:
 * <script src="https://yourdomain.com/location-detector.js"></script>
 * <script>
 *   const locator = new LocationDetector({
 *     containerId: 'userLocation',
 *     defaultLocation: 'Mumbai, India',
 *     autoDetect: true
 *   });
 * </script>
 */

(function(window) {
    'use strict';

    // ===================================
    // LOCATION DETECTOR CLASS
    // ===================================
    class LocationDetector {
        constructor(options = {}) {
            this.config = {
                containerId: options.containerId || 'userLocation',
                defaultLocation: options.defaultLocation || 'India',
                autoDetect: options.autoDetect !== false,
                storageKey: options.storageKey || 'userLocation',
                showNotifications: options.showNotifications !== false,
                ipApiKey: options.ipApiKey || null, // Optional: for premium IP services
                language: options.language || 'en',
                onLocationChange: options.onLocationChange || null,
                styles: options.styles || {}
            };

            this.currentLocation = null;
            this.coordinates = null;
            
            this.init();
        }

        // ===================================
        // INITIALIZATION
        // ===================================
        async init() {
            this.loadSavedLocation();
            
            if (this.config.autoDetect && !this.currentLocation) {
                await this.autoDetect();
            }
            
            this.updateDisplay();
        }

        // ===================================
        // METHOD 1: GPS LOCATION (HIGH ACCURACY)
        // ===================================
        async detectByGPS() {
            return new Promise((resolve, reject) => {
                if (!navigator.geolocation) {
                    this.notify('Geolocation is not supported', 'error');
                    reject(new Error('Geolocation not supported'));
                    return;
                }

                this.notify('Detecting your location...', 'info');

                const options = {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 300000 // Cache for 5 minutes
                };

                navigator.geolocation.getCurrentPosition(
                    async (position) => {
                        const lat = position.coords.latitude;
                        const lon = position.coords.longitude;
                        
                        this.coordinates = { lat, lon };
                        
                        try {
                            const location = await this.reverseGeocode(lat, lon);
                            this.setLocation(location, { lat, lon });
                            this.notify(`Location detected: ${location}`, 'success');
                            resolve(location);
                        } catch (error) {
                            this.notify('Could not get location details', 'error');
                            reject(error);
                        }
                    },
                    (error) => {
                        let message = 'Location detection failed';
                        
                        switch(error.code) {
                            case error.PERMISSION_DENIED:
                                message = 'Location permission denied';
                                break;
                            case error.POSITION_UNAVAILABLE:
                                message = 'Location information unavailable';
                                break;
                            case error.TIMEOUT:
                                message = 'Location request timed out';
                                break;
                        }
                        
                        this.notify(message, 'warning');
                        reject(error);
                    },
                    options
                );
            });
        }

        // Reverse geocoding using OpenStreetMap
        async reverseGeocode(lat, lon) {
            try {
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=${this.config.language}`
                );
                const data = await response.json();
                
                const address = data.address;
                const city = address.city || address.town || address.village || address.county || '';
                const state = address.state || '';
                
                return `${city}, ${state}`.trim().replace(/^,\s*|,\s*$/g, '');
            } catch (error) {
                throw new Error('Reverse geocoding failed');
            }
        }

        // ===================================
        // METHOD 2: IP-BASED DETECTION
        // ===================================
        async detectByIP() {
            try {
                // Primary: ipapi.co (1000 requests/day free)
                const response = await fetch('https://ipapi.co/json/');
                const data = await response.json();
                
                if (data.city && data.region) {
                    const location = `${data.city}, ${data.region}`;
                    this.setLocation(location, {
                        lat: data.latitude,
                        lon: data.longitude,
                        country: data.country_name,
                        postal: data.postal
                    });
                    return location;
                }
            } catch (error) {
                console.warn('Primary IP detection failed, trying fallback...');
            }

            try {
                // Fallback: ip-api.com (unlimited free for non-commercial)
                const response = await fetch('http://ip-api.com/json/?fields=status,message,country,regionName,city,lat,lon,zip');
                const data = await response.json();
                
                if (data.status === 'success') {
                    const location = `${data.city}, ${data.regionName}`;
                    this.setLocation(location, {
                        lat: data.lat,
                        lon: data.lon,
                        country: data.country,
                        postal: data.zip
                    });
                    return location;
                }
            } catch (error) {
                console.error('IP-based detection failed:', error);
            }

            // Use default if all methods fail
            this.setLocation(this.config.defaultLocation);
            return this.config.defaultLocation;
        }

        // ===================================
        // METHOD 3: PINCODE LOOKUP (INDIA)
        // ===================================
        async detectByPincode(pincode) {
            // Validate pincode format
            if (!/^\d{6}$/.test(pincode)) {
                this.notify('Please enter a valid 6-digit pincode', 'warning');
                return null;
            }

            try {
                // India Post API
                const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
                const data = await response.json();
                
                if (data[0].Status === 'Success' && data[0].PostOffice.length > 0) {
                    const po = data[0].PostOffice[0];
                    const location = `${po.District}, ${po.State}`;
                    
                    this.setLocation(location, {
                        pincode: pincode,
                        district: po.District,
                        state: po.State,
                        country: po.Country
                    });
                    
                    this.notify(`Location set to ${location}`, 'success');
                    return location;
                } else {
                    this.notify('Invalid pincode or no data found', 'error');
                    return null;
                }
            } catch (error) {
                console.error('Pincode lookup failed:', error);
                this.notify('Could not fetch location for this pincode', 'error');
                return null;
            }
        }

        // Alternative: ZIP code lookup for international
        async detectByZipCode(zipCode, countryCode = 'US') {
            try {
                // Using Zippopotam.us API (free, no key required)
                const response = await fetch(`https://api.zippopotam.us/${countryCode}/${zipCode}`);
                const data = await response.json();
                
                if (data.places && data.places.length > 0) {
                    const place = data.places[0];
                    const location = `${place['place name']}, ${place.state}`;
                    
                    this.setLocation(location, {
                        zipCode: zipCode,
                        city: place['place name'],
                        state: place.state,
                        country: data.country
                    });
                    
                    this.notify(`Location set to ${location}`, 'success');
                    return location;
                } else {
                    this.notify('Invalid ZIP code', 'error');
                    return null;
                }
            } catch (error) {
                console.error('ZIP code lookup failed:', error);
                this.notify('Could not fetch location for this ZIP code', 'error');
                return null;
            }
        }

        // ===================================
        // METHOD 4: MANUAL ENTRY
        // ===================================
        setManualLocation(locationString) {
            if (!locationString || locationString.trim() === '') {
                this.notify('Please enter a valid location', 'warning');
                return false;
            }

            this.setLocation(locationString.trim());
            this.notify(`Location updated to ${locationString}`, 'success');
            return true;
        }

        // ===================================
        // AUTO-DETECT (INTELLIGENT)
        // ===================================
        async autoDetect() {
            // Priority order:
            // 1. Check saved location
            // 2. Try IP-based (silent, no permission)
            // 3. Fall back to default

            const saved = this.loadSavedLocation();
            if (saved) {
                console.log('Using saved location:', saved);
                return saved;
            }

            try {
                const location = await this.detectByIP();
                console.log('Auto-detected location via IP:', location);
                return location;
            } catch (error) {
                console.error('Auto-detection failed:', error);
                this.setLocation(this.config.defaultLocation);
                return this.config.defaultLocation;
            }
        }

        // ===================================
        // STORAGE MANAGEMENT
        // ===================================
        setLocation(location, metadata = {}) {
            this.currentLocation = location;
            
            // Save to localStorage
            localStorage.setItem(this.config.storageKey, location);
            
            if (metadata.lat && metadata.lon) {
                this.coordinates = { lat: metadata.lat, lon: metadata.lon };
                localStorage.setItem(this.config.storageKey + '_coords', JSON.stringify(this.coordinates));
            }
            
            if (Object.keys(metadata).length > 0) {
                localStorage.setItem(this.config.storageKey + '_metadata', JSON.stringify(metadata));
            }

            this.updateDisplay();

            // Callback
            if (this.config.onLocationChange) {
                this.config.onLocationChange(location, metadata);
            }
        }

        loadSavedLocation() {
            const saved = localStorage.getItem(this.config.storageKey);
            if (saved) {
                this.currentLocation = saved;
                
                const coords = localStorage.getItem(this.config.storageKey + '_coords');
                if (coords) {
                    try {
                        this.coordinates = JSON.parse(coords);
                    } catch (e) {}
                }
            }
            return saved;
        }

        clearLocation() {
            this.currentLocation = null;
            this.coordinates = null;
            localStorage.removeItem(this.config.storageKey);
            localStorage.removeItem(this.config.storageKey + '_coords');
            localStorage.removeItem(this.config.storageKey + '_metadata');
            this.updateDisplay();
        }

        // ===================================
        // UI METHODS
        // ===================================
        updateDisplay() {
            const container = document.getElementById(this.config.containerId);
            if (container) {
                container.textContent = this.currentLocation || this.config.defaultLocation;
            }
        }

        notify(message, type = 'info') {
            if (!this.config.showNotifications) return;

            console.log(`[LocationDetector ${type.toUpperCase()}]:`, message);

            // If Toastify is available, use it
            if (window.Toastify) {
                const bgColors = {
                    success: 'linear-gradient(to right, #10b981, #059669)',
                    error: 'linear-gradient(to right, #ef4444, #dc2626)',
                    info: 'linear-gradient(to right, #3b82f6, #2563eb)',
                    warning: 'linear-gradient(to right, #f59e0b, #d97706)'
                };

                Toastify({
                    text: message,
                    duration: 3000,
                    gravity: 'top',
                    position: 'right',
                    style: {
                        background: bgColors[type] || bgColors.info
                    }
                }).showToast();
            } else {
                // Fallback to console
                console.log(message);
            }
        }

        // ===================================
        // MODAL UI (OPTIONAL)
        // ===================================
        showLocationModal() {
            const modal = document.createElement('div');
            modal.id = 'locationDetectorModal';
            modal.innerHTML = `
                <div class="location-modal-overlay">
                    <div class="location-modal-content">
                        <button class="location-modal-close" onclick="locationDetectorInstance.closeModal()">&times;</button>
                        <h3>Select Your Location</h3>
                        
                        <button class="location-btn location-btn-primary" onclick="locationDetectorInstance.detectByGPS().then(() => locationDetectorInstance.closeModal()).catch(() => {})">
                            <i class="fas fa-crosshairs"></i> Use My Current Location (GPS)
                        </button>
                        
                        <div class="location-divider">OR</div>
                        
                        <div class="location-input-group">
                            <input type="text" id="pincodeInput" placeholder="Enter 6-digit pincode" maxlength="6" class="location-input"/>
                            <button class="location-btn location-btn-secondary" onclick="locationDetectorInstance.detectByPincode(document.getElementById('pincodeInput').value).then(() => locationDetectorInstance.closeModal())">
                                <i class="fas fa-search"></i>
                            </button>
                        </div>
                        
                        <div class="location-divider">OR</div>
                        
                        <input type="text" id="manualLocationInput" placeholder="Enter city, state" class="location-input" value="${this.currentLocation || ''}"/>
                        <button class="location-btn location-btn-success" onclick="locationDetectorInstance.setManualLocation(document.getElementById('manualLocationInput').value); locationDetectorInstance.closeModal()">
                            <i class="fas fa-check"></i> Confirm Location
                        </button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Add styles if not already added
            if (!document.getElementById('locationDetectorStyles')) {
                this.injectStyles();
            }
        }

        closeModal() {
            const modal = document.getElementById('locationDetectorModal');
            if (modal) {
                modal.remove();
            }
        }

        // ===================================
        // INJECT CSS STYLES
        // ===================================
        injectStyles() {
            const styles = document.createElement('style');
            styles.id = 'locationDetectorStyles';
            styles.textContent = `
                /* Location Display Styles */
                .header-location {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    color: #6b7280;
                    font-size: 14px;
                    cursor: pointer;
                    padding: 8px 12px;
                    border-radius: 6px;
                    transition: all 0.3s;
                }

                .header-location:hover {
                    background: #f9fafb;
                }

                .header-location i {
                    color: #2563eb;
                    font-size: 16px;
                }

                .location-label {
                    font-size: 11px;
                    opacity: 0.8;
                    display: block;
                }

                .location-text {
                    font-weight: 600;
                    color: #1f2937;
                    display: block;
                }

                /* Modal Styles */
                .location-modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.7);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                    animation: fadeIn 0.3s;
                }

                .location-modal-content {
                    background: white;
                    border-radius: 12px;
                    padding: 30px;
                    max-width: 500px;
                    width: 90%;
                    position: relative;
                    animation: slideUp 0.3s;
                }

                .location-modal-close {
                    position: absolute;
                    top: 15px;
                    right: 15px;
                    background: none;
                    border: none;
                    font-size: 28px;
                    color: #9ca3af;
                    cursor: pointer;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: color 0.3s;
                }

                .location-modal-close:hover {
                    color: #1f2937;
                }

                .location-modal-content h3 {
                    margin: 0 0 20px 0;
                    text-align: center;
                    color: #1f2937;
                    font-size: 24px;
                }

                .location-btn {
                    width: 100%;
                    padding: 15px;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: 600;
                    margin-bottom: 10px;
                    transition: all 0.3s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                }

                .location-btn-primary {
                    background: #2563eb;
                    color: white;
                }

                .location-btn-primary:hover {
                    background: #1d4ed8;
                    transform: translateY(-2px);
                }

                .location-btn-secondary {
                    background: #7c3aed;
                    color: white;
                    width: auto;
                    padding: 12px 20px;
                }

                .location-btn-secondary:hover {
                    background: #6d28d9;
                }

                .location-btn-success {
                    background: #10b981;
                    color: white;
                }

                .location-btn-success:hover {
                    background: #059669;
                    transform: translateY(-2px);
                }

                .location-divider {
                    text-align: center;
                    margin: 15px 0;
                    color: #9ca3af;
                    font-size: 14px;
                }

                .location-input {
                    width: 100%;
                    padding: 12px 15px;
                    border: 2px solid #e5e7eb;
                    border-radius: 8px;
                    font-size: 15px;
                    margin-bottom: 10px;
                    transition: border-color 0.3s;
                }

                .location-input:focus {
                    outline: none;
                    border-color: #2563eb;
                }

                .location-input-group {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 10px;
                }

                .location-input-group .location-input {
                    flex: 1;
                    margin-bottom: 0;
                }

                /* Animations */
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                    }
                    to {
                        opacity: 1;
                    }
                }

                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(30px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                /* Responsive */
                @media (max-width: 768px) {
                    .header-location {
                        font-size: 12px;
                        padding: 6px 10px;
                    }

                    .location-label {
                        font-size: 10px;
                    }

                    .location-modal-content {
                        padding: 20px;
                    }

                    .location-modal-content h3 {
                        font-size: 20px;
                    }

                    .location-btn {
                        font-size: 14px;
                        padding: 12px;
                    }
                }
            `;
            
            document.head.appendChild(styles);
        }

        // ===================================
        // UTILITY METHODS
        // ===================================
        getLocation() {
            return this.currentLocation;
        }

        getCoordinates() {
            return this.coordinates;
        }

        getMetadata() {
            const metadata = localStorage.getItem(this.config.storageKey + '_metadata');
            try {
                return metadata ? JSON.parse(metadata) : null;
            } catch (e) {
                return null;
            }
        }
    }

    // ===================================
    // EXPORT TO GLOBAL SCOPE
    // ===================================
    window.LocationDetector = LocationDetector;

    // Auto-initialize if data attribute is present
    document.addEventListener('DOMContentLoaded', function() {
        const autoInit = document.querySelector('[data-location-detector]');
        if (autoInit) {
            const options = {
                containerId: autoInit.getAttribute('data-container-id') || 'userLocation',
                defaultLocation: autoInit.getAttribute('data-default-location') || 'India',
                autoDetect: autoInit.getAttribute('data-auto-detect') !== 'false'
            };
            
            window.locationDetectorInstance = new LocationDetector(options);
        }
    });

})(window);
