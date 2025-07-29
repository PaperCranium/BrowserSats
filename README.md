# Sats Converter Chrome Extension

A Chrome extension that automatically detects and converts all currencies and prices on webpages to Bitcoin Sats.

## Features

- 🪙 Automatically detects USD ($), EUR (€), GBP (£), and JPY (¥) prices on any webpage
- ⚡ Converts currencies to Bitcoin Sats in real-time
- 📈 Fetches live Bitcoin prices from CoinGecko API
- 🎛️ Toggle conversion on/off via popup interface
- 🔄 Manual price refresh functionality
- 🌐 Works on all websites
- 📱 Responsive design for mobile and desktop

## Installation

1. **Download or Clone**: Download this extension folder to your computer
2. **Open Chrome Extensions**: Go to `chrome://extensions/` in your Chrome browser
3. **Enable Developer Mode**: Toggle the "Developer mode" switch in the top right
4. **Load Extension**: Click "Load unpacked" and select the SatsExtension folder
5. **Pin Extension**: Click the puzzle piece icon in your toolbar and pin the Sats Converter

## Usage

1. **Automatic Conversion**: Once installed, the extension will automatically start converting prices on websites
2. **Toggle On/Off**: Click the extension icon to open the popup and toggle conversion on/off
3. **Refresh Bitcoin Price**: Use the "Refresh Price" button in the popup to get the latest Bitcoin price
4. **View Current Price**: The popup shows the current Bitcoin price and conversion rate

## Supported Currencies

- **USD**: $ symbol and "USD" text
- **EUR**: € symbol and "EUR" text  
- **GBP**: £ symbol and "GBP" text
- **JPY**: ¥ symbol and "JPY" text

## How It Works

1. The extension fetches the current Bitcoin price from CoinGecko API
2. It scans webpages for currency patterns in two ways:
   - **Text-based detection**: Uses regex to find prices in plain text (e.g., "$19.99", "€25.50", "$150k")
   - **HTML structure detection**: Identifies complex price structures used by e-commerce sites
3. **Numerical abbreviations** are automatically expanded (K=thousands, M=millions, B=billions, T=trillions)
4. Detected prices are converted to USD equivalent (if not already USD)
5. USD amounts are then converted to Bitcoin Sats (1 BTC = 100,000,000 sats)
6. Original prices are replaced with orange-highlighted Sats values

### Supported Price Structures

**Plain Text Formats:**
- `$19.99`, `$1,234.56`, `19.99 USD`
- `€25.50`, `25.50 EUR`  
- `£15.99`, `15.99 GBP`
- `¥1000`, `1000 JPY`

**Abbreviated Formats (K/M/B/T):**
- `$150k` = `$150,000`
- `$2.5M` = `$2,500,000`
- `$1.2B` = `$1,200,000,000`
- `$500T` = `$500,000,000,000,000`
- Works with all currencies: `€150k`, `£2.5M`, `¥1B`
- Case insensitive: `$150K` = `$150k`

**Full Word Abbreviations:**
- `$45 thousand` = `$45,000`
- `$2.5 million` = `$2,500,000`
- `$160 billion` = `$160,000,000,000`
- `$500 trillion` = `$500,000,000,000,000`
- Works with all currencies and cases: `€160 Billion`, `£2.5 Million`

**Complex HTML Structures (e.g., Amazon):**
```html
<span aria-hidden="true">
    <span class="a-price-symbol">$</span>
    <span class="a-price-whole">169<span class="a-price-decimal">.</span></span>
    <span class="a-price-fraction">97</span>
</span>
```

**Generic Price Elements:**
- Elements with classes containing "price", "cost", or "amount"

## Technical Details

- **Manifest Version**: 3 (latest Chrome extension standard)
- **API**: CoinGecko free API for Bitcoin price data
- **Storage**: Chrome sync storage for user preferences
- **Permissions**: Active tab access and storage permissions
- **Update Frequency**: Bitcoin price updates every 5 minutes

## Privacy

- No personal data is collected or transmitted
- Only accesses current tab when extension is active
- Bitcoin price data comes from public CoinGecko API
- All settings stored locally in Chrome sync storage

## Troubleshooting

**Extension not working?**
- Check if Developer mode is enabled in Chrome extensions
- Refresh the webpage after installing/enabling the extension
- Check the popup to ensure conversion is enabled

**Prices not converting on page load?**
- **Fixed in latest version**: Added retry logic to handle Bitcoin price loading delays
- Check browser console (F12) for "Sats Converter" logs to see if price is loading
- If prices don't convert initially, wait 2-3 seconds for retry attempts
- Try refreshing the Bitcoin price in the popup as a fallback

**Other price conversion issues?**
- Make sure you have an internet connection for Bitcoin price data
- Some websites may have unusual price formatting that isn't detected

**Want to add more currencies?**
- The extension can be easily modified to support additional currencies
- Edit the `currencyPatterns` object in `content.js` to add new patterns

## Using Local Images

The extension supports referencing local images in the conversion display. Here's how:

1. **Add Images**: Place your images in the `icons/` or `images/` folder
2. **Reference in Code**: Use `chrome.runtime.getURL()` to get the proper URL:
   ```javascript
   const iconUrl = chrome.runtime.getURL('icons/my-icon.png');
   const customUrl = chrome.runtime.getURL('images/bitcoin-sats.png');
   ```
3. **Web Accessible Resources**: Images are already configured as web accessible resources in `manifest.json`

**Example Usage** (in `content.js` line 85):
```javascript
const bitcoinIconUrl = chrome.runtime.getURL('icons/icon16.png');
return `<span class="sats-converted"><img src="${bitcoinIconUrl}" style="width: 16px; height: 16px;">${formatNumber(sats)} sats</span>`;
```

## Development

To modify or enhance the extension:

1. Edit the relevant files (`content.js`, `background.js`, `popup.js`, etc.)
2. Go to `chrome://extensions/`
3. Click the refresh icon on the Sats Converter extension
4. Test your changes on various websites

## License

This project is open source and available under the MIT License. 