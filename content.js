// Sats Converter Content Script
(function() {
    'use strict';

    let bitcoinPrice = null;
    let isEnabled = true;
    let processedElements = new WeakSet();
    let isProcessingOwnChanges = false;
    
    // Check if we're on Amazon
    const isAmazonSite = window.location.hostname.includes('amazon.com');

    // Currency symbols and patterns
    const currencyPatterns = {
        USD: {
            symbols: ['$', 'USD', 'usd'],
            regex: /\$\s?(\d+(?:,\d{3})*(?:\.\d+)?)\s?\b(thousand|million|billion|trillion)\b|\$\s?(\d+(?:,\d{3})*(?:\.\d+)?)\s?([kKmMbBtT])|(\d+(?:,\d{3})*(?:\.\d+)?)\s?\b(thousand|million|billion|trillion)\b\s?USD|(\d+(?:,\d{3})*(?:\.\d+)?)\s?([kKmMbBtT])\s?USD|\$\s?(\d+(?:,\d{3})*(?:\.\d+)?)(?!\w)|(?<!\w)(\d+(?:,\d{3})*(?:\.\d+)?)\s?USD/gi
        },
        EUR: {
            symbols: ['€', 'EUR', 'eur'],
            regex: /€\s?(\d+(?:,\d{3})*(?:\.\d+)?)\s?\b(thousand|million|billion|trillion)\b|€\s?(\d+(?:,\d{3})*(?:\.\d+)?)\s?([kKmMbBtT])|(\d+(?:,\d{3})*(?:\.\d+)?)\s?\b(thousand|million|billion|trillion)\b\s?EUR|(\d+(?:,\d{3})*(?:\.\d+)?)\s?([kKmMbBtT])\s?EUR|€\s?(\d+(?:,\d{3})*(?:\.\d+)?)(?!\w)|(?<!\w)(\d+(?:,\d{3})*(?:\.\d+)?)\s?EUR/gi
        },
        GBP: {
            symbols: ['£', 'GBP', 'gbp'],
            regex: /£\s?(\d+(?:,\d{3})*(?:\.\d+)?)\s?\b(thousand|million|billion|trillion)\b|£\s?(\d+(?:,\d{3})*(?:\.\d+)?)\s?([kKmMbBtT])|(\d+(?:,\d{3})*(?:\.\d+)?)\s?\b(thousand|million|billion|trillion)\b\s?GBP|(\d+(?:,\d{3})*(?:\.\d+)?)\s?([kKmMbBtT])\s?GBP|£\s?(\d+(?:,\d{3})*(?:\.\d+)?)(?!\w)|(?<!\w)(\d+(?:,\d{3})*(?:\.\d+)?)\s?GBP/gi
        },
        JPY: {
            symbols: ['¥', 'JPY', 'jpy'],
            regex: /¥\s?(\d+(?:,\d{3})*)\s?\b(thousand|million|billion|trillion)\b|¥\s?(\d+(?:,\d{3})*)\s?([kKmMbBtT])|(\d+(?:,\d{3})*)\s?\b(thousand|million|billion|trillion)\b\s?JPY|(\d+(?:,\d{3})*)\s?([kKmMbBtT])\s?JPY|¥\s?(\d+(?:,\d{3})*)(?!\w)|(?<!\w)(\d+(?:,\d{3})*)\s?JPY/gi
        }
    };

    // Pre-parse currency patterns once for performance
    const currencyEntries = Object.entries(currencyPatterns);

    // Helper function to expand numerical abbreviations
    function expandAbbreviation(numberStr, abbreviation) {
        let baseNumber = parseFloat(numberStr.replace(/,/g, ''));
        if (isNaN(baseNumber)) return null;
        
        if (!abbreviation || abbreviation.trim() === '') return baseNumber;
        
        const multipliers = {
            // Single letter abbreviations
            'k': 1000,
            'K': 1000,
            'm': 1000000,
            'M': 1000000,
            'b': 1000000000,
            'B': 1000000000,
            't': 1000000000000,
            'T': 1000000000000,
            // Full word abbreviations (case insensitive)
            'thousand': 1000,
            'million': 1000000,
            'billion': 1000000000,
            'trillion': 1000000000000
        };
        
        const multiplier = multipliers[abbreviation.toLowerCase()];
        return multiplier ? baseNumber * multiplier : baseNumber;
    }

    // Helper function to check if element should be skipped on Amazon
    function shouldSkipAmazonElement(element) {
        if (!isAmazonSite) return false;
        
        // Check if element or any parent has comparison-table in ID or class
        let currentElement = element;
        while (currentElement && currentElement !== document.body) {
            // Check ID
            if (currentElement.id && currentElement.id.includes('comparison-table')) {
                return true;
            }
            
            // Check class
            if (currentElement.className && 
                typeof currentElement.className === 'string' && 
                currentElement.className.includes('comparison-table')) {
                return true;
            }
            
            currentElement = currentElement.parentElement;
        }
        
        return false;
    }

    // Initialize the extension
    function init() {
        // Get user settings first
        chrome.storage.sync.get(['isEnabled'], (result) => {
            isEnabled = result.isEnabled !== false; // Default to true
            
            // Then get Bitcoin price with retry logic
            fetchBitcoinPriceWithRetry();
        });
    }

    // Fetch Bitcoin price with retry mechanism
    function fetchBitcoinPriceWithRetry(attempt = 1, maxAttempts = 3) {
        chrome.runtime.sendMessage({action: 'getBitcoinPrice'}, (response) => {
            if (response && response.price) {
                bitcoinPrice = response.price;
                console.log(`Sats Converter: Bitcoin price loaded: $${bitcoinPrice}`);
                
                if (isEnabled && bitcoinPrice) {
                    processPage();
                    observeChanges();
                }
            } else if (attempt < maxAttempts) {
                // Retry after a delay
                console.log(`Sats Converter: Bitcoin price not ready, retrying (${attempt}/${maxAttempts})...`);
                setTimeout(() => {
                    fetchBitcoinPriceWithRetry(attempt + 1, maxAttempts);
                }, 1000 * attempt); // Exponential backoff: 1s, 2s, 3s
            } else {
                console.log('Sats Converter: Failed to get Bitcoin price after', maxAttempts, 'attempts');
                // Still set up observer in case price comes later via updatePrice message
                if (isEnabled) {
                    observeChanges();
                }
            }
        });
    }

    // Convert currency amount to Sats
    function convertToSats(amount, currency = 'USD') {
        if (!bitcoinPrice) return null;
        
        const exchangeRates = {
            'USD': 1,
            'EUR': 1.1, // Approximate, should be fetched from API
            'GBP': 1.27,
            'JPY': 0.0067
        };

        const usdAmount = amount * (exchangeRates[currency] || 1);
        const btcAmount = usdAmount / bitcoinPrice;
        const sats = Math.round(btcAmount * 100000000); // 1 BTC = 100,000,000 sats
        
        return sats;
    }

    // Format number with commas
    function formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    // Process text nodes and replace currency with Sats
    function processTextNode(textNode) {
        if (processedElements.has(textNode)) return;
        
        // Skip if parent already contains converted elements
        if (textNode.parentNode && (
            textNode.parentNode.classList?.contains('sats-converted') ||
            textNode.parentNode.classList?.contains('a-offscreen') ||
            textNode.parentNode.querySelector?.('.sats-converted'))) {
            return;
        }

        // Skip Amazon comparison table elements
        if (shouldSkipAmazonElement(textNode.parentNode)) {
            return;
        }
        
        let text = textNode.textContent;
        let hasMatch = false;
        
                // Check each currency pattern
        currencyEntries.forEach(([currency, pattern]) => {
            text = text.replace(pattern.regex, (match, g1, g2, g3, g4, g5, g6, g7, g8, g9, g10) => {
                hasMatch = true;
                
                // Determine number and abbreviation from the captured groups
                let numberStr, abbreviation;
                
                if (g1 && g2) {
                    // Symbol format with full word (e.g., $160 billion)
                    numberStr = g1;
                    abbreviation = g2;
                } else if (g3 && g4) {
                    // Symbol format with single letter (e.g., $150k)
                    numberStr = g3;
                    abbreviation = g4;
                } else if (g5 && g6) {
                    // Text format with full word (e.g., 160 billion USD)
                    numberStr = g5;
                    abbreviation = g6;
                } else if (g7 && g8) {
                    // Text format with single letter (e.g., 150k USD)
                    numberStr = g7;
                    abbreviation = g8;
                } else if (g9) {
                    // Regular price with symbol (e.g., $12.99)
                    numberStr = g9;
                    abbreviation = null;
                } else if (g10) {
                    // Regular price with suffix (e.g., 12.99 USD)
                    numberStr = g10;
                    abbreviation = null;
                } else {
                    return match;
                }
                
                const amount = expandAbbreviation(numberStr, abbreviation);
                if (amount === null || isNaN(amount)) return match;
                
                const sats = convertToSats(amount, currency);
                 
                if (sats !== null && sats < 100000000) {
                    // Reference local images using chrome.runtime.getURL()
                    // Examples:
                    // const bitcoinIconUrl = chrome.runtime.getURL('icons/icon16.png');
                    // const customIconUrl = chrome.runtime.getURL('images/bitcoin-sats.png');
                     
                    const satsIconURL = chrome.runtime.getURL('icons/icon16.png');
                    return `<span class="sats-converted" style="color: #f7931a; font-weight: bold; white-space: nowrap;"><img src="${satsIconURL}" style="height: 15px; width: 15px; vertical-align: middle; margin-right: 2px;">${formatNumber(sats)}</span>`;
                } else if (sats !== null && sats >= 100000000) {
                    const btcAmount = formatNumber((sats / 100000000).toFixed(3));
                    return `<span class="sats-converted" style="color: #f7931a; font-weight: bold; white-space: nowrap;">₿${btcAmount}</span>`;
                }
                return match;
            });
        });

        if (hasMatch && textNode.parentNode) {
            isProcessingOwnChanges = true;
            const wrapper = document.createElement('span');
            wrapper.innerHTML = text;
            textNode.parentNode.replaceChild(wrapper, textNode);
            isProcessingOwnChanges = false;
            processedElements.add(wrapper);
        }
    }

    // Process structured price elements (like Amazon's format)
    function processStructuredPrices(element) {
        if (processedElements.has(element) || 
            element.classList?.contains('sats-converted') ||
            element.classList?.contains('a-offscreen') ||
            element.querySelector?.('.sats-converted')) return;

        // Skip Amazon comparison table elements
        if (shouldSkipAmazonElement(element))  {
            return;
        }

        // Look for Amazon-style price structures
        const priceContainers = element.querySelectorAll('span[aria-hidden="true"]');
        
        priceContainers.forEach(container => {
            if (processedElements.has(container) 
                    || container.classList.contains('sats-converted') 
                    || container.classList.contains('a-offscreen') 
                    || shouldSkipAmazonElement(container)) {
                        return;
                    }
            
            const symbolEl = container.querySelector('.a-price-symbol');
            const wholeEl = container.querySelector('.a-price-whole');
            const fractionEl = container.querySelector('.a-price-fraction');
            
            if (symbolEl && wholeEl && fractionEl) {
                const symbol = symbolEl.textContent.trim();
                const whole = wholeEl.textContent.replace(/[.,]/g, ''); // Remove any decimal points
                const fractionText = fractionEl.textContent.trim();
                
                // Check if fraction contains abbreviation (letters or full words)
                let amount;
                
                // First check if fraction is just a full word abbreviation
                if (fractionText.match(/^\b(thousand|million|billion|trillion)\b$/i)) {
                    // Handle case where fraction is just the word (e.g., $160 billion)
                    amount = expandAbbreviation(whole, fractionText);
                } else {
                    const abbreviationMatch = fractionText.match(/^(\d+)([kKmMbBtT])$/i);
                    
                    if (abbreviationMatch) {
                        const fraction = abbreviationMatch[1];
                        const abbreviation = abbreviationMatch[2];
                        
                        if (abbreviation) {
                            // Handle abbreviated format like $150k (whole=150, fraction=k)
                            amount = expandAbbreviation(whole, abbreviation);
                        } else {
                            // Normal decimal format
                            amount = parseFloat(`${whole}.${fraction}`);
                        }
                    } else {
                        // Fallback to original logic - normal decimal
                        amount = parseFloat(`${whole}.${fractionText}`);
                    }
                }
                
                // Determine currency from symbol
                let currency = 'USD';
                if (symbol === '$') currency = 'USD';
                else if (symbol === '€') currency = 'EUR';
                else if (symbol === '£') currency = 'GBP';
                else if (symbol === '¥') currency = 'JPY';
                
                if (!isNaN(amount) && amount !== null) {
                     const sats = convertToSats(amount, currency);
                     
                     if (sats !== null && sats < 100000000) {
                         const satsIconURL = chrome.runtime.getURL('icons/icon16.png');
                         isProcessingOwnChanges = true;
                         container.innerHTML = `<span class="sats-converted" style="color: #f7931a; font-weight: bold; white-space: nowrap;"><img src="${satsIconURL}" style="height: 18px; width: 18px; vertical-align: middle; margin-right: 2px;">${formatNumber(sats)}</span>`;
                         isProcessingOwnChanges = false;
                     } else if (sats !== null && sats >= 100000000) {
                         const btcAmount = formatNumber((sats / 100000000).toFixed(3));
                         isProcessingOwnChanges = true;
                         container.innerHTML = `<span class="sats-converted" style="color: #f7931a; font-weight: bold; white-space: nowrap;">₿${btcAmount}</span>`;
                         isProcessingOwnChanges = false;
                     }
                     
                     processedElements.add(container);
                }
            }
        });
    }

    // Process all text nodes in an element
    function processElement(element) {
        if (processedElements.has(element) || 
            element.classList?.contains('sats-converted') ||
            element.classList?.contains('a-offscreen') ||
            element.querySelector?.('.sats-converted') ||
            shouldSkipAmazonElement(element)) return;
        
        // First, handle structured prices
        processStructuredPrices(element);
        
        // Then handle regular text nodes
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    // Skip script, style, and already processed nodes
                    const parent = node.parentNode;
                    if (!parent || 
                        parent.tagName === 'SCRIPT' || 
                        parent.tagName === 'STYLE' ||
                        parent.classList?.contains('sats-converted') ||
                        parent.classList?.contains('a-offscreen') ||
                        parent.closest?.('.sats-converted') ||
                        processedElements.has(parent) ||
                        shouldSkipAmazonElement(parent)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }

        textNodes.forEach(processTextNode);
    }

    // Process the entire page
    function processPage() {
        if (!isEnabled || !bitcoinPrice) return;
        processElement(document.body);
    }

    // Observe DOM changes for dynamic content
    function observeChanges() {
        const observer = new MutationObserver((mutations) => {
            if (!isEnabled || !bitcoinPrice || isProcessingOwnChanges) return;
            
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE && 
                        !node.classList?.contains('sats-converted') &&
                        !node.querySelector?.('.sats-converted') &&
                        !shouldSkipAmazonElement(node)) {
                        processElement(node);
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Listen for messages from popup/background
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'toggleEnabled') {
            isEnabled = request.enabled;
            if (isEnabled && bitcoinPrice) {
                processPage();
            } else {
                // Reload page to remove conversions
                location.reload();
            }
        } else if (request.action === 'updatePrice') {
            bitcoinPrice = request.price;
            console.log(`Sats Converter: Price updated via message: $${bitcoinPrice}`);
            if (isEnabled && bitcoinPrice) {
                processPage();
            }
        }
    });

    // Start the extension
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(); 