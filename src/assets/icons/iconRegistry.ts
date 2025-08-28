// Import all icons statically for Vite
import discordIcon from './discord.png'
import spotifyIcon from './spotify.png'
import chromeIcon from './chrome.png'
import firefoxIcon from './firefox.png'
import vivaldiIcon from './vivaldi.png'
import vlcIcon from './vlcmediaplayer.png'
import appleMusicIcon from './applemusic.png'
import minecraftIcon from './minecraft.png'
import valorantIcon from './valorant.png'

// Icon registry - maps icon file names to imported assets
export const iconRegistry: Record<string, string> = {
  'discord.png': discordIcon,
  'spotify.png': spotifyIcon,
  'chrome.png': chromeIcon,
  'firefox.png': firefoxIcon,
  'vivaldi.png': vivaldiIcon,
  'vlcmediaplayer.png': vlcIcon,
  'applemusic.png': appleMusicIcon,
  'minecraft.png': minecraftIcon,
  'valorant.png': valorantIcon,
}

// Helper function to get icon URL by filename
export function getIconUrl(iconFile: string): string | null {
  return iconRegistry[iconFile] || null;
}
