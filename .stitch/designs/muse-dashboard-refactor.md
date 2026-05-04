# Muse Dashboard Refactor Prompt

Platform: responsive React web app for desktop-first operations.

Screen: `/dashboard`, inside the existing Muse app shell.

Goal: turn the dashboard into a compact system overview that helps the user spot mail, proxy, token, and account issues quickly.

Required layout:

- Compact page header with eyebrow, title, one-line description, refresh button, and live summary.
- Metric grid with eight stable metric cards.
- Two-column work row: quick actions and recent mail.
- Distribution panels for provider, mailbox/account status, and proxy health.
- Top mail accounts panel with dense account rows and clear counts.

Visual constraints:

- Neutral cool paper background, graphite text, restrained borders.
- Blue primary action, teal connectivity, amber warning, green success, red danger.
- 8px component radius, 10px large panel radius.
- No large hero headline, no gradient hero, no card inside card, no decorative blobs.
- Typography must fit on mobile and desktop with no viewport-scaled font sizes.

