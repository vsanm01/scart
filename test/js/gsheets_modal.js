/**
 * Enhanced Google Sheets Modal Library
 * A reusable library to display Google Sheets cell data in modals
 * Version: 2.0.0
 * 
 * Supports:
 * - Single cells: 'B37'
 * - Column ranges: 'B37:B44'
 * - Row ranges: 'B37:F37'
 * - Full ranges: 'B37:D44'
 * - Multiple cells: 'B37,D44,F50'
 * 
 * Usage:
 * 1. Include this script in your HTML
 * 2. Initialize: GoogleSheetsModal.init('YOUR_SCRIPT_URL');
 * 3. Show modal: GoogleSheetsModal.showCell('Title', 'SheetName', 'CellRange');
 */

(function(window) {
    'use strict';
    
    const GoogleSheetsModal = {
        scriptUrl: '',
        modalId: 'gsm-modal',
        initialized: false,
        
        /**
         * Initialize the library with Google Apps Script URL
         * @param {string} url - Google Apps Script Web App URL
         */
        init: function(url) {
            this.scriptUrl = url;
            this.createModal();
            this.attachEventListeners();
            this.initialized = true;
            console.log('Enhanced Google Sheets Modal Library initialized');
        },
        
        /**
         * Set or update the script URL
         * @param {string} url - Google Apps Script Web App URL
         */
        setScriptUrl: function(url) {
            this.scriptUrl = url;
        },
        
        /**
         * Create modal HTML structure
         */
        createModal: function() {
            if (document.getElementById(this.modalId)) {
                return;
            }
            
            const modalHTML = `
                <div id="${this.modalId}" class="gsm-modal">
                    <div class="gsm-modal-content">
                        <div class="gsm-modal-header">
                            <h2 id="${this.modalId}-title">Information</h2>
                            <button class="gsm-close-btn" onclick="GoogleSheetsModal.close()">×</button>
                        </div>
                        <div class="gsm-modal-body" id="${this.modalId}-body">
                            Loading...
                        </div>
                    </div>
                </div>
            `;
            
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            
            if (!document.getElementById('gsm-styles')) {
                this.addStyles();
            }
        },
        
        /**
         * Add CSS styles for the modal
         */
        addStyles: function() {
            const styles = `
                .gsm-modal {
                    display: none;
                    position: fixed;
                    z-index: 10000;
                    left: 0;
                    top: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0,0,0,0.5);
                    animation: gsm-fadeIn 0.3s;
                }
                
                @keyframes gsm-fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                
                .gsm-modal-content {
                    background-color: white;
                    margin: 5% auto;
                    padding: 30px;
                    border-radius: 15px;
                    width: 80%;
                    max-width: 700px;
                    max-height: 70vh;
                    overflow-y: auto;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    animation: gsm-slideDown 0.3s;
                }
                
                @keyframes gsm-slideDown {
                    from {
                        transform: translateY(-50px);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }
                
                .gsm-modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    padding-bottom: 15px;
                    border-bottom: 2px solid #eee;
                }
                
                .gsm-modal-header h2 {
                    color: #667eea;
                    margin: 0;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                }
                
                .gsm-close-btn {
                    background: #f44336;
                    color: white;
                    border: none;
                    width: 35px;
                    height: 35px;
                    border-radius: 50%;
                    font-size: 24px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.3s;
                    line-height: 1;
                    padding: 0;
                }
                
                .gsm-close-btn:hover {
                    background: #d32f2f;
                    transform: rotate(90deg);
                }
                
                .gsm-modal-body {
                    color: #555;
                    line-height: 1.8;
                    font-size: 15px;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                }
                
                .gsm-modal-body p {
                    margin: 10px 0;
                }
                
                .gsm-modal-body ul {
                    margin: 10px 0;
                    padding-left: 25px;
                }
                
                .gsm-modal-body li {
                    margin: 8px 0;
                }
                
                .gsm-modal-body table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 15px 0;
                }
                
                .gsm-modal-body th {
                    background: #667eea;
                    color: white;
                    padding: 12px;
                    text-align: left;
                    font-weight: 600;
                }
                
                .gsm-modal-body td {
                    padding: 10px 12px;
                    border-bottom: 1px solid #eee;
                }
                
                .gsm-modal-body tr:hover {
                    background: #f9f9f9;
                }
                
                .gsm-loading {
                    text-align: center;
                    padding: 20px;
                }
                
                .gsm-error {
                    color: #c33;
                    background: #fee;
                    padding: 15px;
                    border-radius: 8px;
                    border-left: 4px solid #c33;
                }
                
                .gsm-cell-group {
                    margin: 15px 0;
                    padding: 15px;
                    background: #f9f9f9;
                    border-radius: 8px;
                    border-left: 4px solid #667eea;
                }
                
                .gsm-cell-label {
                    font-weight: 600;
                    color: #667eea;
                    margin-bottom: 5px;
                }
            `;
            
            const styleSheet = document.createElement('style');
            styleSheet.id = 'gsm-styles';
            styleSheet.textContent = styles;
            document.head.appendChild(styleSheet);
        },
        
        /**
         * Attach event listeners
         */
        attachEventListeners: function() {
            window.addEventListener('click', (event) => {
                const modal = document.getElementById(this.modalId);
                if (event.target === modal) {
                    this.close();
                }
            });
            
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    this.close();
                }
            });
        },
        
        /**
         * Determine the type of range
         * @param {string} range - Cell range
         * @returns {string} - 'single', 'column', 'row', 'table', 'multiple'
         */
        detectRangeType: function(range) {
            // Multiple non-contiguous cells (e.g., 'B37,D44,F50')
            if (range.includes(',')) {
                return 'multiple';
            }
            
            // Single cell or range
            if (range.includes(':')) {
                const [start, end] = range.split(':');
                const startMatch = start.match(/([A-Z]+)(\d+)/);
                const endMatch = end.match(/([A-Z]+)(\d+)/);
                
                if (startMatch && endMatch) {
                    const [, startCol, startRow] = startMatch;
                    const [, endCol, endRow] = endMatch;
                    
                    // Same column = column range
                    if (startCol === endCol) return 'column';
                    // Same row = row range
                    if (startRow === endRow) return 'row';
                    // Different columns and rows = table
                    return 'table';
                }
            }
            
            return 'single';
        },
        
        /**
         * Format data based on range type
         * @param {Array} data - Data from Google Sheets
         * @param {string} rangeType - Type of range
         * @param {string} range - Original range string
         * @returns {string} - Formatted HTML
         */
        formatData: function(data, rangeType, range) {
            if (!data || data.length === 0) {
                return '<p>No data found in the specified range</p>';
            }
            
            switch (rangeType) {
                case 'single':
                    return this.formatSingle(data);
                
                case 'column':
                    return this.formatColumn(data);
                
                case 'row':
                    return this.formatRow(data);
                
                case 'table':
                    return this.formatTable(data);
                
                case 'multiple':
                    return this.formatMultiple(data, range);
                
                default:
                    return '<p>Unable to format data</p>';
            }
        },
        
        /**
         * Format single cell
         */
        formatSingle: function(data) {
            const cellValue = data[0] ? Object.values(data[0])[0] : '';
            const content = cellValue ? String(cellValue).replace(/\n/g, '<br>') : 'No content found';
            return `<p>${content}</p>`;
        },
        
        /**
         * Format column range (vertical list)
         */
        formatColumn: function(data) {
            let html = '<ul>';
            data.forEach(row => {
                const value = Object.values(row)[0];
                if (value !== undefined && value !== null && value !== '') {
                    html += `<li>${String(value).replace(/\n/g, '<br>')}</li>`;
                }
            });
            html += '</ul>';
            return html;
        },
        
        /**
         * Format row range (horizontal list)
         */
        formatRow: function(data) {
            if (data.length === 0) return '<p>No data found</p>';
            
            let html = '<ul>';
            const row = data[0];
            Object.values(row).forEach(value => {
                if (value !== undefined && value !== null && value !== '') {
                    html += `<li>${String(value).replace(/\n/g, '<br>')}</li>`;
                }
            });
            html += '</ul>';
            return html;
        },
        
        /**
         * Format table range
         */
        formatTable: function(data) {
            let html = '<table>';
            
            // First row as header
            const headers = data[0];
            html += '<thead><tr>';
            Object.values(headers).forEach(header => {
                html += `<th>${header || ''}</th>`;
            });
            html += '</tr></thead>';
            
            // Remaining rows as data
            html += '<tbody>';
            for (let i = 1; i < data.length; i++) {
                html += '<tr>';
                Object.values(data[i]).forEach(cell => {
                    const cellContent = cell !== undefined && cell !== null ? String(cell).replace(/\n/g, '<br>') : '';
                    html += `<td>${cellContent}</td>`;
                });
                html += '</tr>';
            }
            html += '</tbody></table>';
            
            return html;
        },
        
        /**
         * Format multiple non-contiguous cells
         */
        formatMultiple: function(data, range) {
            const cells = range.split(',').map(c => c.trim());
            let html = '';
            
            data.forEach((row, index) => {
                const cellLabel = cells[index] || `Cell ${index + 1}`;
                const value = Object.values(row)[0];
                const content = value !== undefined && value !== null ? String(value).replace(/\n/g, '<br>') : 'Empty';
                
                html += `
                    <div class="gsm-cell-group">
                        <div class="gsm-cell-label">${cellLabel}</div>
                        <div>${content}</div>
                    </div>
                `;
            });
            
            return html;
        },
        
        /**
         * Show modal with cell data
         * @param {string} title - Modal title
         * @param {string} sheetName - Sheet name
         * @param {string} cellRange - Cell range (e.g., 'B37', 'B37:B44', 'B37:F37', 'B37,D44')
         */
        showCell: async function(title, sheetName, cellRange) {
            if (!this.initialized) {
                console.error('Google Sheets Modal not initialized. Call GoogleSheetsModal.init(url) first.');
                return;
            }
            
            if (!this.scriptUrl) {
                console.error('Script URL not set. Call GoogleSheetsModal.setScriptUrl(url) first.');
                return;
            }
            
            const modal = document.getElementById(this.modalId);
            const modalTitle = document.getElementById(`${this.modalId}-title`);
            const modalBody = document.getElementById(`${this.modalId}-body`);
            
            modalTitle.textContent = title;
            modalBody.innerHTML = '<p class="gsm-loading">Loading...</p>';
            modal.style.display = 'block';
            
            try {
                // Detect range type
                const rangeType = this.detectRangeType(cellRange);
                
                // Fetch data
                const url = `${this.scriptUrl}?sheet=${encodeURIComponent(sheetName)}&range=${encodeURIComponent(cellRange)}`;
                const response = await fetch(url);
                const data = await response.json();
                
                if (data.error) {
                    throw new Error(data.error);
                }
                
                // Format and display data
                const formattedContent = this.formatData(data, rangeType, cellRange);
                modalBody.innerHTML = formattedContent;
                
            } catch (error) {
                modalBody.innerHTML = `<div class="gsm-error">Error loading data: ${error.message}</div>`;
                console.error('Error:', error);
            }
        },
        
        /**
         * Show modal with custom content
         * @param {string} title - Modal title
         * @param {string} content - HTML content
         */
        showContent: function(title, content) {
            if (!this.initialized) {
                console.error('Google Sheets Modal not initialized. Call GoogleSheetsModal.init(url) first.');
                return;
            }
            
            const modal = document.getElementById(this.modalId);
            const modalTitle = document.getElementById(`${this.modalId}-title`);
            const modalBody = document.getElementById(`${this.modalId}-body`);
            
            modalTitle.textContent = title;
            modalBody.innerHTML = content;
            modal.style.display = 'block';
        },
        
        /**
         * Close the modal
         */
        close: function() {
            const modal = document.getElementById(this.modalId);
            if (modal) {
                modal.style.display = 'none';
            }
        }
    };
    
    window.GoogleSheetsModal = GoogleSheetsModal;
    
})(window);


/* ==================== EXAMPLE USAGE ==================== */

/*

// 1. Include this script in your HTML
<script src="path/to/enhanced-google-sheets-modal.js"></script>

// 2. Initialize with your Google Apps Script URL
<script>
    GoogleSheetsModal.init('https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec');
</script>

// 3. Use in your HTML buttons

<!-- Single Cell -->
<button onclick="GoogleSheetsModal.showCell('FAQ', 'Sheet3', 'B37')">
    Single Cell (B37)
</button>

<!-- Column Range (Displays as bullet list) -->
<button onclick="GoogleSheetsModal.showCell('FAQ List', 'Sheet3', 'B37:B44')">
    Column Range (B37:B44)
</button>

<!-- Row Range (Displays as bullet list) -->
<button onclick="GoogleSheetsModal.showCell('Menu Items', 'Sheet3', 'B37:F37')">
    Row Range (B37:F37)
</button>

<!-- Table Range (Displays as formatted table) -->
<button onclick="GoogleSheetsModal.showCell('Data Table', 'Sheet3', 'B37:D44')">
    Table Range (B37:D44)
</button>

<!-- Multiple Non-Contiguous Cells (Displays as grouped sections) -->
<button onclick="GoogleSheetsModal.showCell('Multiple Cells', 'Sheet3', 'B37,D44,F50')">
    Multiple Cells (B37, D44, F50)
</button>

// 4. Or use in JavaScript
document.getElementById('myBtn').addEventListener('click', function() {
    GoogleSheetsModal.showCell('Title', 'Sheet1', 'A1:A10');
});

*/