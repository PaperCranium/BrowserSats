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
            regex: /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)|(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s?USD/g
        },
        EUR: {
            symbols: ['€', 'EUR', 'eur'],
            regex: /€\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)|(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s?EUR/g
        },
        GBP: {
            symbols: ['£', 'GBP', 'gbp'],
            regex: /£\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)|(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s?GBP/g
        },
        JPY: {
            symbols: ['¥', 'JPY', 'jpy'],
            regex: /¥\s?(\d{1,3}(?:,\d{3})*)|(\d{1,3}(?:,\d{3})*)\s?JPY/g
        }
    };

    // Pre-parse currency patterns once for performance
    const currencyEntries = Object.entries(currencyPatterns);

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
        // Get Bitcoin price and settings from background
        chrome.runtime.sendMessage({action: 'getBitcoinPrice'}, (response) => {
            if (response && response.price) {
                bitcoinPrice = response.price;
                // Get user settings
                chrome.storage.sync.get(['isEnabled'], (result) => {
                    isEnabled = result.isEnabled !== false; // Default to true
                    if (isEnabled && bitcoinPrice) {
                        processPage();
                        // observeChanges();
                    }
                });
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
            console.log('skipping amazon element in processTextNode');
            return;
        }
        
        let text = textNode.textContent;
        let hasMatch = false;
        
                // Check each currency pattern
        currencyEntries.forEach(([currency, pattern]) => {
            text = text.replace(pattern.regex, (match, group1, group2) => {
                hasMatch = true;
                const amount = parseFloat((group1 || group2).replace(/,/g, ''));
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
            console.log('skipping amazon element in processStructuredPrices');
            return;
        }

        // Look for Amazon-style price structures
        const priceContainers = element.querySelectorAll('span[aria-hidden="true"]');
        
        priceContainers.forEach(container => {
            if (processedElements.has(container) 
                    || container.classList.contains('sats-converted') 
                    || container.classList.contains('a-offscreen') 
                    || shouldSkipAmazonElement(container)) {
                        console.log('skipping amazon element in processStructuredPrices');
                        return;
                    }
            
            const symbolEl = container.querySelector('.a-price-symbol');
            const wholeEl = container.querySelector('.a-price-whole');
            const fractionEl = container.querySelector('.a-price-fraction');
            
            if (symbolEl && wholeEl && fractionEl) {
                const symbol = symbolEl.textContent.trim();
                const whole = wholeEl.textContent.replace(/[.,]/g, ''); // Remove any decimal points
                const fraction = fractionEl.textContent.trim();
                
                // Determine currency from symbol
                let currency = 'USD';
                if (symbol === '$') currency = 'USD';
                else if (symbol === '€') currency = 'EUR';
                else if (symbol === '£') currency = 'GBP';
                else if (symbol === '¥') currency = 'JPY';
                
                const amount = parseFloat(`${whole}.${fraction}`);
                if (!isNaN(amount)) {
                     const sats = convertToSats(amount, currency);
                     
                     if (sats !== null && sats < 100000000) {
                         const satsIconURL = chrome.runtime.getURL('icons/icon16.png');
                         isProcessingOwnChanges = true;
                         container.innerHTML = `<span class="sats-converted" style="color: #f7931a; font-weight: bold; white-space: nowrap;"><img src="${satsIconURL}" style="height: 15px; width: 15px; vertical-align: middle; margin-right: 2px;">${formatNumber(sats)}</span>`;
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
    // function observeChanges() {
    //     const observer = new MutationObserver((mutations) => {
    //         if (!isEnabled || !bitcoinPrice || isProcessingOwnChanges) return;
            
    //         mutations.forEach((mutation) => {
    //             mutation.addedNodes.forEach((node) => {
    //                 if (node.nodeType === Node.ELEMENT_NODE && 
    //                     !node.classList?.contains('sats-converted') &&
    //                     !node.querySelector?.('.sats-converted') &&
    //                     !shouldSkipAmazonElement(node)) {
    //                     processElement(node);
    //                 }
    //             });
    //         });
    //     });

    //     observer.observe(document.body, {
    //         childList: true,
    //         subtree: true
    //     });
    // }

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
            if (isEnabled) {
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