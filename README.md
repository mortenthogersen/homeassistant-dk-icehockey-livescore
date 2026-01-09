# Hockey Cards for Home Assistant

A collection of custom Home Assistant cards for displaying Danish hockey match information, including live scores, match tickers, and league standings.

## Cards Included

1. **Hockey Scoreboard Card** - Displays a main team's full scoreboard with other teams in a list below
2. **Hockey Ticker Card** - Continuous scrolling ticker showing multiple matches
3. **Hockey Table Card** - League points table with standings

## Installation

1. Copy the card files to your Home Assistant `www` directory:
   - `hockey-scoreboard-card.js`
   - `hockey-ticker-card.js`
   - `hockey-table-card.js`

2. Add the resources to your Home Assistant via the UI:
   - Go to **Settings** → **Dashboards** → **Resources**
   - Click **+ ADD RESOURCE** (or **+** button)
      - Enter the URL with cache busting: `/local/hockey-scoreboard-card.js?v=1.0.4`
   - Set Type to: `JavaScript Module`
   - Click **CREATE**
   - Repeat for `hockey-ticker-card.js?v=1.0.3` and `hockey-table-card.js?v=1.0.0`

   **Note:** The version query parameter (e.g., `?v=1.0.2`) is used for cache busting. When you update the card files, increment the version number and update the resource URLs to ensure browsers load the latest version.

3. The resources should be available immediately (you may need to refresh your browser).

## Team Codes

All cards use 3-letter team shortcuts. Available teams:

- **RUN** - Rungsted
- **SON** - SønderjyskE
- **FRE** - Frederikshavn
- **AAL** - Aalborg
- **ESB** - Esbjerg
- **HER** - Herning
- **HLV** - Herlev
- **ROD** - Rødovre
- **ODE** - Odense

---

## Hockey Scoreboard Card

Displays a full scoreboard for your main team at the top, with other teams shown in a ticker-style list below. Goal notifications appear only for the main team.

### Configuration Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `main_team` | string | Yes | - | 3-letter code of the main team to display (e.g., "ODE") |
| `other_teams` | list | Yes | - | Array of 3-letter team codes to show in the list below (e.g., ["HER", "AAL"]) |
| `league_id` | number | No | 4 | League ID |
| `season` | number | No | 2025 | Season year |
| `update_interval` | number | No | 10 | Update interval in seconds |

### Example Configuration

```yaml
type: custom:hockey-scoreboard-card
main_team: ODE
other_teams:
  - RUN
  - SON
  - FRE
  - AAL
  - ESB
  - HER
  - HLV
  - ROD
league_id: 4
season: 2025
update_interval: 10
```

### Notes

- The main team's match is automatically excluded from the `other_teams` list
- Goal notifications (green overlay) are shown only for the main team
- If no match is found for the main team, the scoreboard is hidden and an error message is displayed
- Upcoming matches (BEFORE_MATCH status) display "Kommende kamp" with the scheduled start time
- The `other_teams` list shows all matches where any of the specified teams are playing

---

## Hockey Ticker Card

A continuous scrolling ticker that displays multiple matches in a marquee-style format. Shows live matches with running time, upcoming matches with date/time, and finished matches with final scores.

### Configuration Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `league_id` | number | No | 4 | League ID |
| `season` | number | No | 2025 | Season year |
| `update_interval` | number | No | 10 | Update interval in seconds |
| `scroll_speed` | number | No | 3 | Seconds per match in the scroll |
| `teams` | list | No | null | Optional: Filter to show only matches involving these teams (3-letter codes) |

### Example Configuration (All Teams)

```yaml
type: custom:hockey-ticker-card
league_id: 4
season: 2025
update_interval: 10
scroll_speed: 3
teams:
  - RUN
  - SON
  - FRE
  - AAL
  - ESB
  - HER
  - HLV
  - ROD
  - ODE
```

### Example Configuration (Specific Teams Only)

```yaml
type: custom:hockey-ticker-card
league_id: 4
season: 2025
update_interval: 10
scroll_speed: 3
teams:
  - ODE
  - HER
  - AAL
```

### Example Configuration (All Matches - No Filter)

```yaml
type: custom:hockey-ticker-card
league_id: 4
season: 2025
update_interval: 10
scroll_speed: 3
```

### Notes

- If `teams` is not specified, all matches in the league are shown
- Live matches are sorted first, followed by upcoming matches (by date), then finished matches (most recent first)
- Goal notifications appear as a green overlay for live matches

---

## Hockey Table Card

Displays the league points table with current standings, including position, points, games played, wins, losses, goals, and goal difference.

### Configuration Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `season` | number | No | 2025 | Season year |
| `highlight_teams` | list | No | [] | Array of 3-letter team codes to highlight in the table |
| `update_interval` | number | No | 3600 | Update interval in seconds (default: 1 hour) |

### Example Configuration (All Teams Highlighted)

```yaml
type: custom:hockey-table-card
season: 2025
update_interval: 3600
highlight_teams:
  - RUN
  - SON
  - FRE
  - AAL
  - ESB
  - HER
  - HLV
  - ROD
  - ODE
```

### Example Configuration (Specific Teams Highlighted)

```yaml
type: custom:hockey-table-card
season: 2025
update_interval: 3600
highlight_teams:
  - ODE
  - HER
  - AAL
```
```

### Notes

- The table updates automatically at the specified interval (default: 1 hour)
- Highlighted teams are shown with a different background color
- Teams currently playing (LIVE status) show a "LIVE" badge
- Goal difference is color-coded: green for positive, red for negative

---

## Version Information

All cards include version information:

- **Hockey Scoreboard Card**: v1.0.4
- **Hockey Ticker Card**: v1.0.3
- **Hockey Table Card**: v1.0.0

Version numbers are displayed in the card UI and logged to the browser console for debugging cache issues.

### Changelog

#### Hockey Scoreboard Card v1.0.4
- Removed: Date and tournament info section (game-info) from scoreboard display
- Improved: Added better date validation and error handling for date formatting
- Fixed: Date format now correctly shows Danish format (e.g., "10. jan HH:mm") for upcoming matches

#### Hockey Scoreboard Card v1.0.3
- Updated: Date format changed to Danish format (e.g., "10. jan HH:mm") for upcoming matches

#### Hockey Scoreboard Card v1.0.2
- Updated: Upcoming matches now display date and time (dd/mm HH:mm) instead of just time

#### Hockey Scoreboard Card v1.0.1
- Fixed: Upcoming matches (BEFORE_MATCH status) now correctly display "Kommende kamp" with scheduled time instead of "SLUT"
- Fixed: Scoreboard is now hidden when no match is found for the main team (only shows error message and other teams list if configured)

#### Hockey Ticker Card v1.0.3
- Improved: Added better date validation and error handling for date formatting
- Fixed: Date format now correctly shows Danish format (e.g., "10. jan HH:mm") for upcoming matches

#### Hockey Ticker Card v1.0.2
- Updated: Date format changed to Danish format (e.g., "10. jan HH:mm") for upcoming matches

#### Hockey Ticker Card v1.0.1
- Updated: Upcoming matches now always display date and time (dd/mm HH:mm) instead of just time for today's matches

## Troubleshooting

### Cache Issues

If you're not seeing updates after making changes:

1. **Update Version Parameter**: If you've updated the card files, increment the version number in the resource URLs (e.g., change `?v=1.0.0` to `?v=1.0.1`) in **Settings** → **Dashboards** → **Resources**. This forces browsers to load the new version.
2. **Hard Refresh**: Press `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac) to clear browser cache
3. **Clear Home Assistant Cache**: In Home Assistant, go to Settings → System → Reload Resources
4. **Mobile Devices**: Clear the app cache or restart the Home Assistant app
5. **Check Console**: Open browser developer tools (F12) and check the console for version numbers to confirm the correct card is loaded

### Card Not Appearing

- Verify the resource URLs are correct in **Settings** → **Dashboards** → **Resources**
- Check that the files are in the correct directory (`config/www/` or `www/`)
- Ensure file permissions allow Home Assistant to read the files
- Check the browser console for JavaScript errors

### No Data Showing

- Verify `league_id` and `season` match the data source
- Check that team codes are correct (3-letter uppercase codes)
- Verify your internet connection (cards fetch data from external APIs)
- Check browser console for API errors

## Support

For issues or questions, check the browser console for error messages and version information. All cards log their version number and configuration on load.
