# Philly Badlandz — Complete 2D Arcade Edition V15

**Full nine-fighter game** with 8 Philly-themed arenas, CPU training, live online rooms, best-of-three matches, synchronized health and damage, combos, abilities, supers, Ultras, chat, fullscreen start, and the original red/black arcade menus.

## Windows installation
1. Extract the ZIP into a fresh folder (do not overwrite your backup).
2. Open the `philly_badlandz` directory.
3. Double-click `START_PHILLY_BADLANDZ.bat`.
4. The launcher verifies **V15-SMOOTH-ARCADE** on its dedicated port **3124** before opening the browser.
5. Full game: http://localhost:3124/ — fighter animation viewer: http://localhost:3124/motion-check.html — all nine full-body sprites: http://localhost:3124/character-check.html.

Node.js LTS is needed to run the server. Dependencies are bundled; if they are missing, the launcher attempts an npm install.

## Multiplayer
Both fighters must connect to the same running game server; localhost works only on the host PC. If playing from another device, use a reachable host address and allow traffic to your game server through the firewall or hosting setup. Only use networks you trust; don't assume internet hosting or public matchmaking is configured automatically.

## V15 animations
- Newly regenerated 2D motion sheets for all nine approved full-body character sprites.
- 16-frame walking and primary strike/kick cycles, 12-frame idles, plus defensive and knockout animations.
- Distinct jab, cross, hook and uppercut paths; a kick chamber, strike, retraction and recovery.
- Fixed-length two-section limb posing, improved hip overlap and better control of source-leg visibility.
- Steadier foot contact and framerate-independent network-position smoothing.
- Optimized image resolution and memory-bounded animation preloading for better frame pacing.

## Real limitations
This is still photo-derived **2D articulated cutout animation**. It retains the illustrated faces and clothing, but extreme attacks can still show imperfect cloth or joint seams. Professional fighting animation quality requires consistent frame-by-frame artwork or a professionally rigged model with many separately designed poses. Automated tests do not replace visual testing with two real players.

## Troubleshooting
- If you see the older game, close old game windows and check the `V15` label at the top. V15 uses port 3124.
- If motion is missing, load `/motion-check.html` and check for failed asset requests in the browser's F12 console.
- Online rooms work only when both players are on the same reachable game server.
