# Frontend US-Style Update

This version changes the ASX dashboard to match the compact US scanner layout more closely.

## Changes

- Replaced card-heavy finance dashboard with dense scanner-style terminal UI.
- Added top status strip: local time, ASX market state, countdown, next scan, equity.
- Added high-level signal banner and after-hours warning.
- Added top-three priority candidate cards.
- Added full-width advanced signals table.
- Added selected trade panel with buy zone, stop, target, warnings and read plan action.
- Added larger chart panel with entry/stop/target overlays and volume-scaled bar layer.
- Added $5,000 paper account panel and paper journal.
- Removed visible test sound buttons.
- Sound and voice are ON by default but browser audio unlock happens on first click anywhere in the app.
- Market-closed mode still shows scan candidates for planning, but blocks paper entry.

## Browser sound note

Browsers block autoplay audio. The app now attempts to unlock sound/voice on the first user click anywhere on the page. There is no large test button panel anymore.
