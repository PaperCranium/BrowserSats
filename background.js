// Sats Converter Background Script
let bitcoinPrice = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Fetch Bitcoin price from CoinGecko API
async function fetchBitcoinPrice() {
    const now = Date.now();
    
    // Use cached price if it's still fresh
    if (bitcoinPrice && (now - lastFetchTime) < CACHE_DURATION) {
        return bitcoinPrice;
    }

    try {
        console.log('Fetching Bitcoin price...');
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        bitcoinPrice = data.bitcoin.usd;
        lastFetchTime = now;
        
        console.log(`Bitcoin price updated: $${bitcoinPrice}`);
        
        // Store in chrome storage for persistence
        chrome.storage.local.set({
            bitcoinPrice: bitcoinPrice,
            lastFetchTime: lastFetchTime
        });
        
        return bitcoinPrice;
    } catch (error) {
        console.error('Error fetching Bitcoin price:', error);
        
        // Try to use stored price as fallback
        const result = await chrome.storage.local.get(['bitcoinPrice', 'lastFetchTime']);
        if (result.bitcoinPrice) {
            bitcoinPrice = result.bitcoinPrice;
            lastFetchTime = result.lastFetchTime || 0;
            console.log(`Using cached Bitcoin price: $${bitcoinPrice}`);
            return bitcoinPrice;
        }
        
        return null;
    }
}

// Notify all content scripts about price updates
function notifyContentScripts(price) {
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                action: 'updatePrice',
                price: price
            }).catch(() => {
                // Ignore errors for tabs that don't have content script
            });
        });
    });
}

// Initialize extension on startup
async function initialize() {
    console.log('Sats Converter extension starting...');
    
    // Load cached data
    const result = await chrome.storage.local.get(['bitcoinPrice', 'lastFetchTime']);
    if (result.bitcoinPrice) {
        bitcoinPrice = result.bitcoinPrice;
        lastFetchTime = result.lastFetchTime || 0;
        console.log(`Background: Loaded cached Bitcoin price: $${bitcoinPrice}`);
        
        // Notify content scripts about cached price
        notifyContentScripts(bitcoinPrice);
    }
    
    // Fetch fresh price
    const freshPrice = await fetchBitcoinPrice();
    if (freshPrice && freshPrice !== bitcoinPrice) {
        // Notify content scripts about fresh price update
        console.log(`Background: Notifying content scripts of fresh price: $${freshPrice}`);
        notifyContentScripts(freshPrice);
    }
    
    // Set up periodic price updates
    setInterval(() => {
        fetchBitcoinPrice().then(price => {
            if (price && price !== bitcoinPrice) {
                console.log(`Background: Price changed, notifying content scripts: $${price}`);
                notifyContentScripts(price);
            }
        });
    }, CACHE_DURATION);
}

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request);
    
    if (request.action === 'getBitcoinPrice') {
        if (bitcoinPrice) {
            sendResponse({ price: bitcoinPrice });
        } else {
            // Fetch price if not available
            fetchBitcoinPrice().then(price => {
                sendResponse({ price: price });
            }).catch(error => {
                console.error('Error getting Bitcoin price:', error);
                sendResponse({ price: null });
            });
            return true; // Keep message channel open for async response
        }
    } else if (request.action === 'refreshPrice') {
        fetchBitcoinPrice().then(price => {
            sendResponse({ price: price });
            
            // Notify all content scripts about price update
            if (price) {
                console.log(`Background: Manual refresh, notifying content scripts: $${price}`);
                notifyContentScripts(price);
            }
        }).catch(error => {
            console.error('Error refreshing Bitcoin price:', error);
            sendResponse({ price: null });
        });
        return true; // Keep message channel open for async response
    }
});

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
    console.log('Sats Converter installed/updated:', details.reason);
    
    // Set default settings
    chrome.storage.sync.set({
        isEnabled: true
    });
    
    initialize();
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
    console.log('Sats Converter starting up...');
    initialize();
});

// Initialize immediately
initialize(); 