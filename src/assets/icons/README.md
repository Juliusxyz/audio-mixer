# Icons Folder

This folder contains application icons for the audio mixer.

## Icon Guidelines
- **Format**: PNG preferred
- **Size**: 32x32 or 64x64 pixels recommended
- **Naming**: Use lowercase, descriptive names (e.g., `spotify.png`, `discord.png`)
- **Quality**: Use high-quality icons, preferably official application icons

## Adding New Icons
1. Place the PNG file in this folder
2. Update `iconMapping.ts` to map the process name to the icon file
3. The app will automatically use the mapped icon

## Placeholder Icons
You can start by adding icons for the most common applications:
- `spotify.png` - Spotify music player
- `discord.png` - Discord chat application  
- `chrome.png` - Google Chrome browser
- `firefox.png` - Mozilla Firefox browser
- `steam.png` - Steam gaming platform
- `vlc.png` - VLC media player
- `obs.png` - OBS Studio streaming software
- `vscode.png` - Visual Studio Code editor

The system will fall back to letter icons for any applications without mapped icons.
