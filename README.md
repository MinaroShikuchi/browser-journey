# 🗺️ Browser Journey

A Chrome extension that visualizes your browsing history as an interactive network graph, helping you understand your web navigation patterns.

## Features

✨ **Interactive Network Graph**
- Each domain appears as a bubble, sized by visit count
- Lines show navigation transitions between domains
- Zoom, pan, and drag nodes for exploration

🔍 **Powerful Filtering**
- Search domains by name
- Filter by date range
- Set minimum visit thresholds
- Real-time graph updates

📊 **Detailed Analytics**
- Click any domain to see visit details
- View timestamps and page titles
- Reopen any URL from history
- Track your browsing patterns

💾 **Data Management**
- Export complete data as JSON
- Export visualization as PNG image
- Clear history with confirmation
- All data stored locally (privacy-first)

## Installation

### From Source

1. **Clone or download this repository**
   ```bash
   git clone https://github.com/yourusername/browser-journey.git
   cd browser-journey
   ```

2. **Create extension icons** (if not already present)
   - You need three icon sizes: 16x16, 48x48, and 128x128 pixels
   - Place them in the `icons/` directory
   - Name them: `icon16.png`, `icon48.png`, `icon128.png`

3. **Load the extension in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)
   - Click "Load unpacked"
   - Select the `browser-journey` directory

4. **Start browsing!**
   - The extension will automatically track your navigation
   - Click the extension icon to see quick stats
   - Click "Open Visualization" to see your journey graph

## Usage

### Quick Stats Popup
Click the Browser Journey icon in your toolbar to see:
- Total unique domains visited
- Total number of visits
- Visits today

### Visualization Page
Click "Open Visualization" to access the full interactive graph:

**Navigation:**
- **Zoom:** Mouse wheel or pinch gesture
- **Pan:** Click and drag on empty space
- **Move nodes:** Click and drag individual bubbles
- **Select domain:** Click any bubble to see details

**Filtering:**
- **Search:** Type domain name to highlight matches
- **Date Range:** Select start/end dates to filter visits
- **Min Visits:** Use slider to show only frequently visited domains
- **Apply/Reset:** Apply filters or reset to show all data

**Actions:**
- **Export JSON:** Download complete browsing data
- **Export Image:** Save current graph as PNG
- **Clear History:** Remove all or selected data
- **Refresh:** Reload graph with latest data

### Detail Panel
When you click a domain bubble:
- View total visits, first visit, and last visit times
- See list of recent page visits with titles
- Click "Reopen" to open any URL in a new tab
- Close panel with X button or click elsewhere

## Privacy & Data

🔒 **Your data stays private:**
- All browsing data is stored locally in Chrome's storage
- No external servers or analytics
- No data is ever transmitted outside your browser
- You can clear your history at any time

📦 **Data Storage:**
- Uses Chrome Storage API (local storage)
- Automatic cleanup of data older than 90 days
- Typical storage: ~1-5 MB for thousands of visits

## Technical Details

### Architecture
- **Manifest Version:** 3 (latest Chrome extension API)
- **Visualization:** D3.js v7 force-directed graph
- **Storage:** Chrome Storage API (local)
- **Languages:** JavaScript (ES6+), HTML5, CSS3

### File Structure
```
browser-journey/
├── manifest.json              # Extension configuration
├── background.js              # Service worker for tracking
├── popup/
│   ├── popup.html            # Extension popup UI
│   ├── popup.js              # Popup logic
│   └── popup.css             # Popup styles
├── visualization/
│   ├── visualization.html    # Main graph page
│   ├── visualization.js      # Graph rendering
│   ├── visualization.css     # Graph styles
│   └── dataManager.js        # Data access layer
├── icons/                    # Extension icons
└── README.md                 # This file
```

### Data Structure

**Visits:**
```javascript
{
  id: "unique-id",
  domain: "example.com",
  url: "https://example.com/page",
  title: "Page Title",
  timestamp: 1700000000000,
  fromDomain: "google.com",
  tabId: 123
}
```

**Domains:**
```javascript
{
  "example.com": {
    visitCount: 10,
    firstVisit: 1700000000000,
    lastVisit: 1700000000000,
    favicon: "https://..."
  }
}
```

**Transitions:**
```javascript
{
  "google.com->example.com": {
    count: 5,
    lastVisit: 1700000000000
  }
}
```

## Troubleshooting

### Extension not tracking visits
- Make sure the extension is enabled in `chrome://extensions/`
- Check that you've granted necessary permissions
- Try refreshing the page you're visiting

### Graph not loading
- Click the "Refresh" button
- Check browser console for errors (F12)
- Ensure you have browsing data (visit some sites first)

### Performance issues with large datasets
- Use filters to reduce displayed data
- Set higher minimum visit threshold
- Clear old history data

### Export not working
- Check browser's download settings
- Ensure pop-ups are not blocked
- Try a different export format

## Development

### Prerequisites
- Chrome browser (version 88+)
- Basic knowledge of JavaScript and Chrome Extensions

### Local Development
1. Make changes to source files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the Browser Journey card
4. Test your changes

### Building for Production
The extension is ready to use as-is. For distribution:
1. Ensure all icons are present
2. Update version in `manifest.json`
3. Zip the entire directory
4. Upload to Chrome Web Store

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

### Ideas for Future Enhancements
- Session grouping and timeline view
- Category tagging for domains
- Productivity analytics and insights
- Browser sync across devices
- Custom color schemes and themes
- AI-powered pattern recognition

## License

MIT License - feel free to use and modify as needed.

## Credits

- Built with [D3.js](https://d3js.org/) for visualization
- Icons from [your icon source]
- Inspired by the need to understand web browsing patterns

## Support

If you encounter any issues or have questions:
- Open an issue on GitHub
- Check the troubleshooting section above
- Review Chrome extension documentation

---

**Enjoy exploring your browsing journey! 🚀**