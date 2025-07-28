// Sats Converter Popup Script
document.addEventListener('DOMContentLoaded', function() {
    const enableToggle = document.getElementById('enable-toggle');
    const refreshBtn = document.getElementById('refresh-btn');
    const bitcoinPriceEl = document.getElementById('bitcoin-price');
    const usdSatsEl = document.getElementById('usd-sats');
    const statusEl = document.getElementById('status');

    // Load current settings and Bitcoin price
    function loadSettings() {
        // Get Bitcoin price from background
        chrome.runtime.sendMessage({action: 'getBitcoinPrice'}, (response) => {
            if (response && response.price) {
                updatePriceDisplay(response.price);
            } else {
                bitcoinPriceEl.textContent = 'Price unavailable';
                statusEl.textContent = 'Unable to fetch Bitcoin price';
            }
        });

        // Get enabled state
        chrome.storage.sync.get(['isEnabled'], (result) => {
            enableToggle.checked = result.isEnabled !== false;
            updateStatus();
        });
    }

    // Update price display
    function updatePriceDisplay(price) {
        if (price) {
            bitcoinPriceEl.textContent = `$${price.toLocaleString()}`;
            
            // Calculate $1 USD to Sats conversion
            const btcAmount = 1 / price; // 1 USD in BTC
            const sats = Math.round(btcAmount * 100000000); // Convert to sats
            usdSatsEl.textContent = `${sats.toLocaleString()} sats`;
        } else {
            bitcoinPriceEl.textContent = 'Price unavailable';
            usdSatsEl.textContent = '-';
            statusEl.textContent = 'Unable to fetch Bitcoin price';
        }
    }

    // Update status message
    function updateStatus() {
        if (enableToggle.checked) {
            statusEl.textContent = 'Converting currencies to Sats!';
        } else {
            statusEl.textContent = 'Conversion disabled';
        }
    }

    // Handle enable/disable toggle
    enableToggle.addEventListener('change', function() {
        const isEnabled = enableToggle.checked;
        
        // Save setting
        chrome.storage.sync.set({isEnabled: isEnabled}, () => {
            updateStatus();
            
            // Notify all content scripts
            chrome.tabs.query({}, (tabs) => {
                tabs.forEach(tab => {
                    chrome.tabs.sendMessage(tab.id, {
                        action: 'toggleEnabled',
                        enabled: isEnabled
                    }).catch(() => {
                        // Ignore errors for tabs that don't have content script
                    });
                });
            });
        });
    });

    // Handle refresh button
    refreshBtn.addEventListener('click', function() {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Refreshing...';
        bitcoinPriceEl.classList.add('loading');
        
        chrome.runtime.sendMessage({action: 'refreshPrice'}, (response) => {
            refreshBtn.disabled = false;
            refreshBtn.textContent = 'Refresh Price';
            bitcoinPriceEl.classList.remove('loading');
            
            if (response && response.price) {
                updatePriceDisplay(response.price);
                statusEl.textContent = 'Price updated successfully!';
                
                // Reset status message after 2 seconds
                setTimeout(() => {
                    updateStatus();
                }, 2000);
            } else {
                statusEl.textContent = 'Failed to refresh price';
                setTimeout(() => {
                    updateStatus();
                }, 2000);
            }
        });
    });

    // Initialize popup
    loadSettings();
}); 