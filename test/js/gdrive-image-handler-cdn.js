/**
 * GDrive Image Handler v1.0.0
 * A lightweight utility for converting Google Drive URLs to thumbnail/direct image URLs
 * 
 * Usage:
 * <script src="path/to/gdrive-image-handler.js"></script>
 * <script>
 * 
 * // Basic conversion
 * const imageUrl = GDriveImageHandler.convert(driveUrl);
 * // Custom size (800px)
 * const largeImg = GDriveImageHandler.convert(driveUrl, 800);
 * // Direct download link
 * const downloadUrl = GDriveImageHandler.toDownload(driveUrl);
 * // Batch convert
 * const images = GDriveImageHandler.convertBatch([url1, url2, url3]);
 * // Extract file ID
 * const fileId = GDriveImageHandler.extractFileId(driveUrl);
 * 
 * </script>
 */

(function(global) {
    'use strict';

    const GDriveImageHandler = {
        version: '1.0.0',

        /**
         * Convert Google Drive URL to thumbnail/direct image URL
         * @param {string} url - The Google Drive URL
         * @param {number} size - Optional size in pixels (default: 400)
         * @returns {string} Converted URL or original URL if not Google Drive
         */
        convert: function(url, size = 400) {
            if (!url || typeof url !== 'string' || !url.includes('drive.google.com')) {
                return url;
            }

            let fileId = null;

            // Format 1: https://drive.google.com/file/d/FILE_ID/view
            const match1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
            if (match1) fileId = match1[1];

            // Format 2: https://drive.google.com/uc?id=FILE_ID
            if (!fileId) {
                const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
                if (match2) fileId = match2[1];
            }

            // Format 3: https://drive.google.com/open?id=FILE_ID
            if (!fileId) {
                const match3 = url.match(/\/open\?id=([a-zA-Z0-9_-]+)/);
                if (match3) fileId = match3[1];
            }

            // If we found a file ID, convert to a thumbnail URL
            if (fileId) {
                return `https://drive.google.com/thumbnail?id=${fileId}&sz=s${size}`;
            }

            return url; // Return original URL if no file ID found
        },

        /**
         * Convert Google Drive URL to direct download URL
         * @param {string} url - The Google Drive URL
         * @returns {string} Direct download URL or original URL
         */
        toDownload: function(url) {
            if (!url || typeof url !== 'string' || !url.includes('drive.google.com')) {
                return url;
            }

            let fileId = null;

            const match1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
            if (match1) fileId = match1[1];

            if (!fileId) {
                const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
                if (match2) fileId = match2[1];
            }

            if (fileId) {
                return `https://drive.google.com/uc?export=download&id=${fileId}`;
            }

            return url;
        },

        /**
         * Extract file ID from Google Drive URL
         * @param {string} url - The Google Drive URL
         * @returns {string|null} File ID or null if not found
         */
        extractFileId: function(url) {
            if (!url || typeof url !== 'string' || !url.includes('drive.google.com')) {
                return null;
            }

            const match1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
            if (match1) return match1[1];

            const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
            if (match2) return match2[1];

            return null;
        },

        /**
         * Batch convert multiple Google Drive URLs
         * @param {string[]} urls - Array of Google Drive URLs
         * @param {number} size - Optional size in pixels (default: 400)
         * @returns {string[]} Array of converted URLs
         */
        convertBatch: function(urls, size = 400) {
            if (!Array.isArray(urls)) {
                return [];
            }
            return urls.map(url => this.convert(url, size));
        }
    };

    // Export for different module systems
    if (typeof module !== 'undefined' && module.exports) {
        // Node.js / CommonJS
        module.exports = GDriveImageHandler;
    } else if (typeof define === 'function' && define.amd) {
        // AMD
        define([], function() {
            return GDriveImageHandler;
        });
    } else {
        // Browser global
        global.GDriveImageHandler = GDriveImageHandler;
    }

})(typeof window !== 'undefined' ? window : this);
