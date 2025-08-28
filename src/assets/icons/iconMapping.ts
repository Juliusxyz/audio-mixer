// Icon mapping for known applications
// Icons should be placed in the /src/assets/icons/ folder
// Use PNG format, preferably 32x32 or 64x64 pixels

export interface IconMapping {
  processName: string;
  iconFile: string;
  displayName?: string;
}

export const iconMappings: IconMapping[] = [
  // Audio/Music Applications
  { processName: "spotify.exe", iconFile: "spotify.png", displayName: "Spotify" },
  { processName: "vlc.exe", iconFile: "vlcmediaplayer.png", displayName: "VLC Media Player" },
  { processName: "vlcmediaplayer.exe", iconFile: "vlcmediaplayer.png", displayName: "VLC Media Player" },
  { processName: "music.exe", iconFile: "applemusic.png", displayName: "Apple Music" },
  { processName: "applemusic.exe", iconFile: "applemusic.png", displayName: "Apple Music" },
  { processName: "musicbee.exe", iconFile: "musicbee.png", displayName: "MusicBee" },
  { processName: "foobar2000.exe", iconFile: "foobar2000.png", displayName: "foobar2000" },
  { processName: "winamp.exe", iconFile: "winamp.png", displayName: "Winamp" },
  { processName: "itunes.exe", iconFile: "itunes.png", displayName: "iTunes" },
  
  // Communication
  { processName: "discord.exe", iconFile: "discord.png", displayName: "Discord" },
  { processName: "skype.exe", iconFile: "skype.png", displayName: "Skype" },
  { processName: "teams.exe", iconFile: "teams.png", displayName: "Microsoft Teams" },
  { processName: "teamspeak3.exe", iconFile: "teamspeak.png", displayName: "TeamSpeak" },
  { processName: "mumble.exe", iconFile: "mumble.png", displayName: "Mumble" },
  
  // Gaming
  { processName: "steam.exe", iconFile: "steam.png", displayName: "Steam" },
  { processName: "minecraft.exe", iconFile: "minecraft.png", displayName: "Minecraft" },
  { processName: "javaw.exe", iconFile: "minecraft.png", displayName: "Minecraft (Java)" },
  { processName: "valorant.exe", iconFile: "valorant.png", displayName: "Valorant" },
  { processName: "valorant-win64-shipping.exe", iconFile: "valorant.png", displayName: "Valorant" },
  { processName: "riotclientservices.exe", iconFile: "valorant.png", displayName: "Riot Client" },
  { processName: "battle.net.exe", iconFile: "battlenet.png", displayName: "Battle.net" },
  { processName: "epicgameslauncher.exe", iconFile: "epic.png", displayName: "Epic Games" },
  { processName: "uplay.exe", iconFile: "uplay.png", displayName: "Ubisoft Connect" },
  { processName: "origin.exe", iconFile: "origin.png", displayName: "EA Origin" },
  { processName: "gog.exe", iconFile: "gog.png", displayName: "GOG Galaxy" },
  
  // Browsers
  { processName: "chrome.exe", iconFile: "chrome.png", displayName: "Google Chrome" },
  { processName: "firefox.exe", iconFile: "firefox.png", displayName: "Mozilla Firefox" },
  { processName: "vivaldi.exe", iconFile: "vivaldi.png", displayName: "Vivaldi Browser" },
  { processName: "msedge.exe", iconFile: "edge.png", displayName: "Microsoft Edge" },
  { processName: "opera.exe", iconFile: "opera.png", displayName: "Opera" },
  { processName: "brave.exe", iconFile: "brave.png", displayName: "Brave Browser" },
  
  // Creative Software
  { processName: "obs64.exe", iconFile: "obs.png", displayName: "OBS Studio" },
  { processName: "obs32.exe", iconFile: "obs.png", displayName: "OBS Studio" },
  { processName: "photoshop.exe", iconFile: "photoshop.png", displayName: "Adobe Photoshop" },
  { processName: "premiere.exe", iconFile: "premiere.png", displayName: "Adobe Premiere Pro" },
  { processName: "audacity.exe", iconFile: "audacity.png", displayName: "Audacity" },
  { processName: "blender.exe", iconFile: "blender.png", displayName: "Blender" },
  
  // Development
  { processName: "code.exe", iconFile: "vscode.png", displayName: "Visual Studio Code" },
  { processName: "devenv.exe", iconFile: "visualstudio.png", displayName: "Visual Studio" },
  { processName: "idea64.exe", iconFile: "intellij.png", displayName: "IntelliJ IDEA" },
  { processName: "sublime_text.exe", iconFile: "sublime.png", displayName: "Sublime Text" },
  
  // System
  { processName: "explorer.exe", iconFile: "explorer.png", displayName: "Windows Explorer" },
  { processName: "notepad.exe", iconFile: "notepad.png", displayName: "Notepad" },
  { processName: "calc.exe", iconFile: "calculator.png", displayName: "Calculator" },
  
  // Add more applications as needed...
];

// Helper function to find icon by process name
export function getIconForProcess(processName: string): IconMapping | undefined {
  const normalizedProcessName = processName.toLowerCase();
  return iconMappings.find(mapping => 
    mapping.processName.toLowerCase() === normalizedProcessName
  );
}

// Helper function to get all available icons
export function getAllAvailableIcons(): string[] {
  return iconMappings.map(mapping => mapping.iconFile);
}
