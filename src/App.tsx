import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { getDevices, setRoute, setStreamVolume, type DeviceInfo, type StreamId, getRoutes, listAudioApps, type AppSession, getAppCategories, setAppCategory, clearAppCategory, getAppIcon, setAppVolume } from './bridge'
import { invoke } from '@tauri-apps/api/core'
import { check as checkUpdate } from '@tauri-apps/plugin-updater'

// Throttle function to limit API calls frequency
function useThrottle<T extends (...args: any[]) => any>(func: T, delay: number): T {
  const [lastCall, setLastCall] = useState<number>(0)
  
  return useCallback((...args: any[]) => {
    const now = Date.now()
    if (now - lastCall >= delay) {
      setLastCall(now)
      return func(...args)
    }
  }, [func, delay, lastCall]) as T
}

// Debounce hook for volume changes
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

const defaultStreams: StreamId[] = ['game', 'voice', 'music']

// Stream display configuration
const streamNames = {
  game: 'Game Audio',
  voice: 'Voice Chat',  
  music: 'Music & Media'
}

const streamIcons = {
  game: '🎮',
  voice: '🎤',
  music: '🎵'
}

// Category management types
type Category = {
  id: string
  name: string
  color: string
  icon: string
}

const defaultCategories: Category[] = [
  { id: 'game', name: 'Gaming', color: 'from-green-500 to-emerald-600', icon: '🎮' },
  { id: 'voice', name: 'Voice Chat', color: 'from-blue-500 to-cyan-600', icon: '🎤' },
  { id: 'music', name: 'Music', color: 'from-purple-500 to-pink-600', icon: '🎵' },
]

export default function App() {
  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [routes, setRoutesState] = useState<Record<StreamId, string | null>>({ game: null, voice: null, music: null })
  const [volumes, setVolumes] = useState<Record<StreamId, number>>({ game: 0.8, voice: 0.8, music: 0.8 })
  const [customMixerVolumes, setCustomMixerVolumes] = useState<Record<string, number>>({})
  const [customMixerRoutes, setCustomMixerRoutes] = useState<Record<string, string | null>>({})
  // Load icon cache from localStorage on startup
  const loadIconCache = (): Record<string, string> => {
    try {
      const cached = localStorage.getItem('wavelink-icon-cache')
      if (cached) {
        const parsed = JSON.parse(cached)
        console.log('Loaded icon cache with', Object.keys(parsed).length, 'entries')
        return parsed
      }
    } catch (error) {
      console.error('Failed to load icon cache:', error)
    }
    return {}
  }

  // Save icon cache to localStorage
  const saveIconCache = (cache: Record<string, string>) => {
    try {
      localStorage.setItem('wavelink-icon-cache', JSON.stringify(cache))
      console.log('Saved icon cache with', Object.keys(cache).length, 'entries')
    } catch (error) {
      console.error('Failed to save icon cache:', error)
    }
  }

  // Load volumes from localStorage on startup
  const loadSavedVolumes = (): Record<StreamId, number> => {
    try {
      const saved = localStorage.getItem('wavelink-volumes')
      if (saved) {
        const parsed = JSON.parse(saved)
        console.log('Loaded saved volumes:', parsed)
        return { game: 0.8, voice: 0.8, music: 0.8, ...parsed }
      }
    } catch (error) {
      console.error('Failed to load saved volumes:', error)
    }
    return { game: 0.8, voice: 0.8, music: 0.8 }
  }

  // Save volumes to localStorage
  const saveVolumes = (volumes: Record<StreamId, number>) => {
    try {
      localStorage.setItem('wavelink-volumes', JSON.stringify(volumes))
      console.log('Saved volumes:', volumes)
    } catch (error) {
      console.error('Failed to save volumes:', error)
    }
  }

  // Load custom mixer volumes from localStorage on startup
  const loadCustomMixerVolumes = (): Record<string, number> => {
    try {
      const saved = localStorage.getItem('wavelink-custom-mixer-volumes')
      if (saved) {
        const parsed = JSON.parse(saved)
        console.log('Loaded saved custom mixer volumes:', parsed)
        return parsed
      }
    } catch (error) {
      console.error('Failed to load saved custom mixer volumes:', error)
    }
    return {}
  }

  // Save custom mixer volumes to localStorage
  const saveCustomMixerVolumes = (volumes: Record<string, number>) => {
    try {
      localStorage.setItem('wavelink-custom-mixer-volumes', JSON.stringify(volumes))
      console.log('Saved custom mixer volumes:', volumes)
    } catch (error) {
      console.error('Failed to save custom mixer volumes:', error)
    }
  }

  const [pendingVolumes, setPendingVolumes] = useState<Record<StreamId, number>>(loadSavedVolumes())
  const [updateInfo, setUpdateInfo] = useState<{version: string, notes?: string, available: boolean} | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [apps, setApps] = useState<AppSession[]>([])
  const [appCategories, setAppCategoriesState] = useState<Record<number, StreamId | string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [loadingStage, setLoadingStage] = useState('Initializing...')
  const [categories, setCategories] = useState<Category[]>(defaultCategories)
  const [draggedApp, setDraggedApp] = useState<AppSession | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 })
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  
  // Initialize icon cache on startup
  useEffect(() => {
    const cache = loadIconCache()
    setIconCache(cache)
  }, [])
  // Load custom mixers from localStorage on startup
  const loadSavedMixers = (): Array<{id: string, name: string, apps: number[]}> => {
    try {
      const saved = localStorage.getItem('wavelink-custom-mixers')
      if (saved) {
        const parsed = JSON.parse(saved)
        console.log('Loaded saved custom mixers:', parsed)
        return parsed
      }
    } catch (error) {
      console.error('Failed to load saved custom mixers:', error)
    }
    return []
  }

  // Load muted streams from localStorage on startup
  const loadMutedStreams = (): Set<string> => {
    try {
      const saved = localStorage.getItem('wavelink-muted-streams')
      if (saved) {
        const parsed = JSON.parse(saved) as string[]
        return new Set(parsed)
      }
    } catch (error) {
      console.error('Failed to load muted streams:', error)
    }
    return new Set()
  }

  // Save muted streams to localStorage
  const saveMutedStreams = (mutedStreams: Set<string>) => {
    try {
      localStorage.setItem('wavelink-muted-streams', JSON.stringify(Array.from(mutedStreams)))
    } catch (error) {
      console.error('Failed to save muted streams:', error)
    }
  }

  // Save custom mixers to localStorage
  const saveCustomMixers = (mixers: Array<{id: string, name: string, apps: number[]}>) => {
    try {
      localStorage.setItem('wavelink-custom-mixers', JSON.stringify(mixers))
      console.log('Saved custom mixers:', mixers)
    } catch (error) {
      console.error('Failed to save custom mixers:', error)
    }
  }

  const [customMixers, setCustomMixers] = useState<Array<{id: string, name: string, apps: number[]}>>([])
  const [editingMixer, setEditingMixer] = useState<string | null>(null)
  const [openDeviceDropdown, setOpenDeviceDropdown] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{x: number, y: number, mixerId: string} | null>(null)
  const [editingVolume, setEditingVolume] = useState<string | null>(null)
  const [tempVolumeInput, setTempVolumeInput] = useState('')
  const [mutedStreams, setMutedStreams] = useState<Set<string>>(new Set())
  const [mutedVolumes, setMutedVolumes] = useState<Record<string, number>>({})
  const [audioLevels, setAudioLevels] = useState<Record<string, number>>({})
  const [appIcons, setAppIcons] = useState<Record<number, string>>({}) // PID -> icon URL
  const [iconCache, setIconCache] = useState<Record<string, string>>({}) // process_name -> icon URL (persistent cache)
  const [loadingIcons, setLoadingIcons] = useState<Set<string>>(new Set()) // Track which icons are currently loading
  
  // Load saved data on startup
  useEffect(() => {
    // Load saved volumes
    const savedVolumes = loadSavedVolumes()
    setVolumes(savedVolumes)
    
    // Load saved custom mixers
    const savedCustomMixers = loadSavedMixers()
    setCustomMixers(savedCustomMixers)
    
    // Load saved custom mixer volumes
    const savedCustomMixerVolumes = loadCustomMixerVolumes()
    setCustomMixerVolumes(savedCustomMixerVolumes)
    
    // Load saved muted streams
    const savedMutedStreams = loadMutedStreams()
    setMutedStreams(savedMutedStreams)
    
    // Load icon cache
    const savedIconCache = loadIconCache()
    setIconCache(savedIconCache)
  }, [])
  
  useEffect(() => {
    const interval = setInterval(() => {
      setAudioLevels(prev => {
        const newLevels: Record<string, number> = {}
        
        // Simulate levels for standard streams based on volume and activity
        const streams: StreamId[] = ['game', 'voice', 'music']
        streams.forEach(stream => {
          if (!mutedStreams.has(stream) && (pendingVolumes[stream] || 0) > 0) {
            // Random audio activity simulation
            const baseLevel = (pendingVolumes[stream] || 0) * 0.8
            const variation = Math.random() * 0.4 - 0.2 // -0.2 to +0.2
            newLevels[stream] = Math.max(0, Math.min(1, baseLevel + variation))
          } else {
            newLevels[stream] = 0
          }
        })
        
        // Simulate levels for custom mixers
        customMixers.forEach(mixer => {
          if (!mutedStreams.has(mixer.id) && mixer.apps.length > 0) {
            // Simulate activity if mixer has apps
            const baseLevel = 0.6
            const variation = Math.random() * 0.4 - 0.2
            newLevels[mixer.id] = Math.max(0, Math.min(1, baseLevel + variation))
          } else {
            newLevels[mixer.id] = 0
          }
        })
        
        return newLevels
      })
    }, 100) // Update every 100ms for smooth animation
    
    return () => clearInterval(interval)
  }, [mutedStreams, pendingVolumes, customMixers])

  // Initialize volumes for existing custom mixers that don't have volumes yet
  useEffect(() => {
    const missingVolumes: Record<string, number> = {}
    let hasChanges = false
    
    customMixers.forEach(mixer => {
      if (!(mixer.id in customMixerVolumes)) {
        missingVolumes[mixer.id] = 0.8
        hasChanges = true
      }
    })
    
    if (hasChanges) {
      const newVolumes = { ...customMixerVolumes, ...missingVolumes }
      setCustomMixerVolumes(newVolumes)
      saveCustomMixerVolumes(newVolumes)
      console.log('Initialized missing custom mixer volumes:', missingVolumes)
    }
  }, [customMixers, customMixerVolumes])

  // Check if we're running in Tauri
  // More reliable Tauri detection
  const [isTauri, setIsTauri] = useState(false)
  
  useEffect(() => {
    // Check for Tauri in multiple ways
    const checkTauri = async () => {
      try {
        // Try to import Tauri API
        await import('@tauri-apps/api/app')
        console.log('Tauri detected via API import')
        setIsTauri(true)
      } catch (error) {
        // Fallback to window check
        const hasTauri = typeof window !== 'undefined' && (window as any).__TAURI__
        console.log('Tauri detection fallback:', hasTauri)
        setIsTauri(hasTauri)
      }
    }
    checkTauri()
  }, [])
  
  // Debug: Check Tauri detection
  useEffect(() => {
    console.log('isTauri:', isTauri, 'window.__TAURI__:', typeof window !== 'undefined' ? (window as any).__TAURI__ : 'undefined')
  }, [isTauri])

  // Global drag and drop handling to prevent default browser behavior
  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      e.preventDefault()
    }
    
    const handleGlobalDrop = (e: DragEvent) => {
      e.preventDefault()
    }

    const handleGlobalClick = (e: Event) => {
      // Don't close context menu if clicking on a mixer (let mixer handle it)
      const target = e.target as HTMLElement
      if (target?.closest('.wavelink-channel')) return
      
      setContextMenu(null)
      setOpenDeviceDropdown(null)
    }

    const handleGlobalContextMenu = (e: Event) => {
      // Prevent default context menu unless on a mixer
      const target = e.target as HTMLElement
      if (!target?.closest('.wavelink-channel')) {
        e.preventDefault()
      }
    }

    document.addEventListener('dragover', handleGlobalDragOver)
    document.addEventListener('drop', handleGlobalDrop)
    document.addEventListener('click', handleGlobalClick)
    document.addEventListener('contextmenu', handleGlobalContextMenu)

    return () => {
      document.removeEventListener('dragover', handleGlobalDragOver)
      document.removeEventListener('drop', handleGlobalDrop)
      document.removeEventListener('click', handleGlobalClick)
      document.removeEventListener('contextmenu', handleGlobalContextMenu)
    }
  }, [])

  // Initialize pending volumes with actual volumes (but prioritize saved ones)
  useEffect(() => {
    // Only sync from backend if we don't have saved volumes
    const hasSavedVolumes = localStorage.getItem('wavelink-volumes')
    if (!hasSavedVolumes) {
      console.log('No saved volumes found, using backend volumes:', volumes)
      setPendingVolumes(volumes)
      saveVolumes(volumes)
    } else {
      console.log('Using saved volumes, not overriding with backend')
    }
  }, [])

  useEffect(() => {
    // Auto-update check (disabled due to version parsing issues)
    // if (isTauri) {
    //   checkForUpdates();
    //   
    //   // Check for updates every hour
    //   const updateInterval = setInterval(() => {
    //     checkForUpdates();
    //   }, 60 * 60 * 1000); // 1 hour
    //   
    //   return () => clearInterval(updateInterval);
    // }
    
    // Lade initial die Daten
    loadInitialData();
    
    // PRIORITY 1: Aggressive icon preload starts IMMEDIATELY
    aggressiveIconPreload();
    
    // Auto-refresh Apps alle 4 Sekunden
    const interval = setInterval(() => {
      loadApps();
      loadAppCategories();
    }, 4000);

    // Global cleanup for drag state (in case drag ends outside the app)
    const handleGlobalCleanup = () => {
      // No longer needed for cursor management
    }

    // Listen for escape key to cancel drag
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleGlobalCleanup()
        setDraggedApp(null)
        setDragTarget(null)
        setIsDragging(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    
    return () => {
      clearInterval(interval)
      document.removeEventListener('keydown', handleEscape)
      handleGlobalCleanup() // Cleanup on unmount
    }
  }, [])

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      setLoadingStage('Loading audio devices...')
      await loadDevices()
      
      setLoadingStage('Loading applications...')
      await loadApps()
      
      setLoadingStage('Loading app categories...')
      await loadAppCategories()
      
      setLoadingStage('Loading audio routes...')
      await loadRoutes()
      
      setLoadingStage('Finalizing...')
      
      // Small delay to show completion
      setTimeout(() => {
        setIsLoading(false);
      }, 500);
    } catch (error) {
      console.error('Failed to load initial data:', error);
      setLoadingStage('Error loading data...')
      setTimeout(() => {
        setIsLoading(false);
      }, 1000);
    }
  };

  const checkForUpdates = async () => {
    console.log('checkForUpdates called, isTauri:', isTauri);
    if (!isTauri) {
      console.log('Not in Tauri mode, showing alert');
      alert('Update check only works in Tauri desktop app');
      return;
    }
    
    try {
      console.log('Checking for updates manually due to version format issues...');
      
      // Manual check using fetch to avoid Tauri version parsing issues
      const response = await fetch('https://api.github.com/repos/Juliusxyz/audio-mixer/releases/latest');
      if (!response.ok) {
        throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`);
      }
      
      const releaseData = await response.json();
      console.log('GitHub release data:', releaseData);
      
      if (!releaseData.tag_name) {
        throw new Error('No tag_name found in release data');
      }
      
      // Remove 'v' prefix if present and compare versions
      const latestVersion = releaseData.tag_name.replace(/^v/, '');
      const currentVersion = '0.1.10'; // Current app version
      
      console.log('Comparing versions:', { current: currentVersion, latest: latestVersion });
      
      // Simple version comparison (works for x.y.z format)
      const isNewerVersion = (latest: string, current: string) => {
        const latestParts = latest.split('.').map(Number);
        const currentParts = current.split('.').map(Number);
        
        for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
          const latestPart = latestParts[i] || 0;
          const currentPart = currentParts[i] || 0;
          
          if (latestPart > currentPart) return true;
          if (latestPart < currentPart) return false;
        }
        return false;
      };
      
      if (isNewerVersion(latestVersion, currentVersion)) {
        console.log('Update available:', latestVersion);
        setUpdateInfo({ 
          version: latestVersion, 
          notes: releaseData.body || 'Bug fixes and improvements', 
          available: true 
        });
        
        // Show update notification popup
        const userChoice = confirm(
          `A new version (${latestVersion}) is available!\n\n` +
          'Would you like to download it from GitHub?\n' +
          'Click OK to open the download page, or Cancel to ignore.'
        );
        
        if (userChoice) {
          // Open GitHub release page instead of using broken Tauri updater
          window.open(`https://github.com/Juliusxyz/audio-mixer/releases/tag/${releaseData.tag_name}`, '_blank');
        }
      } else {
        console.log('No updates available');
        setUpdateInfo(null);
        alert('No updates available. You have the latest version!');
      }
      
    } catch (error) {
      console.error('Update check failed:', error);
      
      // Fallback to original Tauri updater with error handling
      try {
        console.log('Falling back to Tauri updater...');
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        
        if (update?.available) {
          setUpdateInfo({ 
            version: update.version, 
            notes: update.body || 'Bug fixes and improvements', 
            available: true 
          });
          
          const userChoice = confirm(
            `A new version (${update.version}) is available!\n\n` +
            'Would you like to install it now?\n' +
            'Click OK to install now, or Cancel to install later.'
          );
          
          if (userChoice) {
            installUpdate();
          }
        } else {
          setUpdateInfo(null);
          alert('No updates available. You have the latest version!');
        }
      } catch (tauriError) {
        console.error('Both manual and Tauri update checks failed:', tauriError);
        
        const manualCheck = confirm(
          'Auto-update is not working properly.\n\n' +
          'Would you like to check for updates manually on GitHub?'
        );
        if (manualCheck) {
          window.open('https://github.com/Juliusxyz/audio-mixer/releases/latest', '_blank');
        }
      }
    }
  };

  const installUpdate = async () => {
    try {
      setIsUpdating(true);
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      
      if (update?.available) {
        await update.downloadAndInstall();
        // App startet automatisch neu nach Installation
      }
    } catch (error) {
      console.error('Update failed:', error);
      setIsUpdating(false);
      // Show error to user
      alert('Update failed. Please try again later.');
    }
  };

  const loadDevices = async () => {
    try {
      const devices = await getDevices();
      setDevices(devices);
    } catch (error) {
      console.error('Failed to load devices:', error);
    }
  };

  const loadRoutes = async () => {
    try {
      const routes = await getRoutes();
      setRoutesState(routes);
    } catch (error) {
      console.error('Failed to load routes:', error);
    }
  };

  const loadApps = async () => {
    try {
      const newApps = await listAudioApps();
      
      // Check for new apps that need icon preloading
      const currentAppPids = new Set(apps.map(app => app.pid))
      const newlyAddedApps = newApps.filter(app => !currentAppPids.has(app.pid))
      
      setApps(newApps);
      
      // Preload icons for new apps immediately (non-blocking)
      if (newlyAddedApps.length > 0) {
        console.log(`🆕 Detected ${newlyAddedApps.length} new apps, preloading icons...`)
        newlyAddedApps.forEach(app => preloadSingleIcon(app))
      }
      
      // Load missing icons for existing apps (batched, low priority)
      await loadAppIcons(newApps);
    } catch (error) {
      console.error('Failed to load apps:', error);
    }
  };

  const loadAppIcons = async (apps: AppSession[]) => {
    if (!isTauri) return; // Only load icons in Tauri environment
    
    console.log('🎨 Regular icon loading for', apps.length, 'apps (low priority)')
    
    // Apply cached icons immediately for instant UI response
    const newAppIcons: Record<number, string> = {}
    let cacheHits = 0
    
    apps.forEach(app => {
      const cachedIcon = iconCache[app.process_name]
      if (cachedIcon) {
        newAppIcons[app.pid] = cachedIcon
        cacheHits++
      }
    })
    
    if (cacheHits > 0) {
      console.log(`⚡ Applied ${cacheHits} cached icons (regular loading)`)
      setAppIcons(prev => ({ ...prev, ...newAppIcons }))
    }
    
    // Find missing icons (skip if already loading or recently failed)
    const appsNeedingIcons = apps.filter(app => 
      !iconCache[app.process_name] && !loadingIcons.has(app.process_name)
    )
    
    if (appsNeedingIcons.length === 0) {
      console.log('✅ No additional icons needed (regular loading)')
      return
    }
    
    console.log(`🔄 Regular loading ${appsNeedingIcons.length} missing icons (batched)`)
    
    // Use conservative batching for regular loading to avoid overwhelming system
    const batchSize = 2 // Smaller batches than aggressive loading
    const updatedCache = { ...iconCache }
    
    for (let i = 0; i < appsNeedingIcons.length; i += batchSize) {
      const batch = appsNeedingIcons.slice(i, i + batchSize)
      
      const batchPromises = batch.map(async (app) => {
        if (loadingIcons.has(app.process_name)) return { success: false, processName: app.process_name }
        
        // Mark as loading
        setLoadingIcons(prev => new Set(prev).add(app.process_name))
        
        try {
          console.log(`📱 Regular loading icon for ${app.name}`)
          const iconData = await getAppIcon(app.process_name)
          
          if (iconData) {
            updatedCache[app.process_name] = iconData
            setAppIcons(prev => ({ ...prev, [app.pid]: iconData }))
            console.log(`✅ Regular loaded icon for ${app.name}`)
            return { success: true, processName: app.process_name, iconData }
          } else {
            console.log(`❌ No icon found for ${app.name} (regular)`)
            return { success: false, processName: app.process_name }
          }
        } catch (error) {
          console.warn(`💥 Regular load failed for ${app.name}:`, error)
          return { success: false, processName: app.process_name }
        } finally {
          // Clear loading state
          setLoadingIcons(prev => {
            const newSet = new Set(prev)
            newSet.delete(app.process_name)
            return newSet
          })
        }
      })
      
      // Wait for this batch to complete
      await Promise.allSettled(batchPromises)
      
      // Longer delay between batches for regular loading
      if (i + batchSize < appsNeedingIcons.length) {
        await new Promise(resolve => setTimeout(resolve, 300))
      }
    }
    
    // Update persistent cache
    setIconCache(updatedCache)
    saveIconCache(updatedCache)
    
    console.log('🎉 Regular icon loading completed')
  }

  // Preload icon for a single app (useful for new apps that appear)
  const preloadSingleIcon = async (app: AppSession) => {
    if (!isTauri || iconCache[app.process_name] || loadingIcons.has(app.process_name)) {
      return // Already cached or loading
    }
    
    setLoadingIcons(prev => new Set(prev).add(app.process_name))
    
    try {
      console.log(`🔄 Preloading icon for new app: ${app.name}`)
      const iconData = await getAppIcon(app.process_name)
      
      if (iconData) {
        const updatedCache = { ...iconCache, [app.process_name]: iconData }
        setIconCache(updatedCache)
        saveIconCache(updatedCache)
        setAppIcons(prev => ({ ...prev, [app.pid]: iconData }))
        console.log(`✅ Preloaded icon for ${app.name}`)
      }
    } catch (error) {
      console.warn(`Failed to preload icon for ${app.name}:`, error)
    } finally {
      setLoadingIcons(prev => {
        const newSet = new Set(prev)
        newSet.delete(app.process_name)
        return newSet
      })
    }
  }

  const loadAppCategories = async () => {
    try {
      const categories = await getAppCategories();
      setAppCategoriesState(categories);
    } catch (error) {
      console.error('Failed to load app categories:', error);
    }
  };

  // Clean up old icons from cache (run periodically)
  const cleanupIconCache = () => {
    const currentProcessNames = new Set(apps.map(app => app.process_name))
    const cacheKeys = Object.keys(iconCache)
    
    // Remove icons for apps that no longer exist
    const keysToRemove = cacheKeys.filter(key => !currentProcessNames.has(key))
    
    if (keysToRemove.length > 0) {
      console.log(`🧹 Cleaning up ${keysToRemove.length} unused icons from cache`)
      const cleanedCache = { ...iconCache }
      keysToRemove.forEach(key => delete cleanedCache[key])
      
      setIconCache(cleanedCache)
      saveIconCache(cleanedCache)
    }
  }

  // Run cache cleanup when apps change
  useEffect(() => {
    if (apps.length > 0 && Object.keys(iconCache).length > 0) {
      // Debounce cleanup to avoid running too frequently
      const timer = setTimeout(cleanupIconCache, 2000)
      return () => clearTimeout(timer)
    }
  }, [apps, iconCache])

  // Aggressive icon preloading - starts immediately when app opens
  const aggressiveIconPreload = async () => {
    if (!isTauri) return
    
    console.log('🚀 AGGRESSIVE ICON PRELOAD STARTING...')
    
    try {
      // First get all current audio apps immediately  
      const currentApps = await listAudioApps()
      console.log(`📱 Found ${currentApps.length} apps for immediate icon loading`)
      
      // Apply any cached icons immediately
      const immediateIcons: Record<number, string> = {}
      let immediateCount = 0
      
      currentApps.forEach(app => {
        const cached = iconCache[app.process_name]
        if (cached) {
          immediateIcons[app.pid] = cached
          immediateCount++
        }
      })
      
      if (immediateCount > 0) {
        console.log(`⚡ Applied ${immediateCount} cached icons INSTANTLY`)
        setAppIcons(immediateIcons)
      }
      
      // Then aggressively load missing icons with maximum priority
      const appsNeedingIcons = currentApps.filter(app => !iconCache[app.process_name])
      
      if (appsNeedingIcons.length > 0) {
        console.log(`🔥 AGGRESSIVE loading ${appsNeedingIcons.length} missing icons with MAX PRIORITY`)
        
        // Mark as loading
        setLoadingIcons(prev => {
          const newSet = new Set(prev)
          appsNeedingIcons.forEach(app => newSet.add(app.process_name))
          return newSet
        })
        
        // Load ALL missing icons in parallel with NO throttling for maximum speed
        const aggressivePromises = appsNeedingIcons.map(async (app) => {
          try {
            const iconData = await getAppIcon(app.process_name)
            
            if (iconData) {
              // Update caches immediately
              setIconCache(prev => ({ ...prev, [app.process_name]: iconData }))
              setAppIcons(prev => ({ ...prev, [app.pid]: iconData }))
              
              console.log(`🎯 FAST loaded icon for ${app.name}`)
              return { success: true, processName: app.process_name, iconData }
            }
          } catch (error) {
            console.warn(`⚠️ Fast load failed for ${app.name}:`, error)
          }
          return { success: false, processName: app.process_name }
        })
        
        // Wait for all to complete
        const results = await Promise.allSettled(aggressivePromises)
        const successCount = results.filter(r => r.status === 'fulfilled' && r.value?.success).length
        
        console.log(`🎉 AGGRESSIVE PRELOAD COMPLETE: ${successCount}/${appsNeedingIcons.length} icons loaded`)
        
        // Save cache after aggressive loading
        const updatedCache = { ...iconCache }
        results.forEach(result => {
          if (result.status === 'fulfilled' && result.value?.success && result.value.iconData) {
            updatedCache[result.value.processName] = result.value.iconData
          }
        })
        setIconCache(updatedCache)
        saveIconCache(updatedCache)
        
        // Clear loading state
        setLoadingIcons(prev => {
          const newSet = new Set(prev)
          appsNeedingIcons.forEach(app => newSet.delete(app.process_name))
          return newSet
        })
      } else {
        console.log('✅ All icons already cached - AGGRESSIVE PRELOAD not needed')
      }
    } catch (error) {
      console.error('💥 AGGRESSIVE PRELOAD FAILED:', error)
    }
  }

  const outputDevices = useMemo(() => 
    devices.filter(d => d.kind === 'output'), 
    [devices]
  );

  // Note: Volume updates are now handled live in onVolume() function

  const onRoute = async (stream: StreamId, deviceId: string | null) => {
    const ok = await setRoute(stream, deviceId);
    if (ok) {
      setRoutesState(prev => ({ ...prev, [stream]: deviceId }));
    }
  };

  // Throttled backend update function (max 10 calls per second)
  const throttledVolumeUpdate = useThrottle(async (stream: StreamId, volume: number) => {
    try {
      // Ensure true 0 for silence and clamp values
      const clampedVolume = volume <= 0.001 ? 0.0 : Math.min(1.0, Math.max(0.0, volume))
      
      console.log(`Live setting volume for ${stream} to ${clampedVolume} (original: ${volume})`);
      const ok = await setStreamVolume(stream, clampedVolume);
      if (ok) {
        setVolumes(prev => ({ ...prev, [stream]: clampedVolume }));
        console.log(`Volume updated successfully for ${stream}`);
      } else {
        console.error(`Failed to update volume for ${stream}`);
      }
    } catch (error) {
      console.error(`Error updating volume for ${stream}:`, error);
    }
  }, 100) // 100ms throttle = max 10 updates per second

  // Immediate UI update for volume changes, with live backend updates
  const onVolume = async (stream: StreamId, volume: number) => {
    // Don't update volume if stream is muted
    if (mutedStreams.has(stream)) {
      console.log(`Blocking volume change for muted stream: ${stream} - attempted value: ${volume}`)
      return
    }
    
    console.log(`onVolume called for ${stream} with value ${volume}`)
    
    const newVolumes = { ...pendingVolumes, [stream]: volume }
    setPendingVolumes(newVolumes)
    
    // Save to localStorage immediately for persistence
    saveVolumes(newVolumes)
    
    // Throttled live backend update for smooth real-time audio
    throttledVolumeUpdate(stream, volume)
    
    // Also ensure the final value is sent immediately if it's 0 (for silence)
    if (volume <= 0.001) {
      try {
        console.log(`Immediate silence setting for ${stream} to 0.0`);
        const ok = await setStreamVolume(stream, 0.0);
        if (ok) {
          setVolumes(prev => ({ ...prev, [stream]: 0.0 }));
          console.log(`Silence applied immediately for ${stream}`);
        }
      } catch (error) {
        console.error(`Error applying immediate silence for ${stream}:`, error);
      }
    }
  };

  const onAssign = async (pid: number, value: '' | StreamId | string) => {
    console.log('onAssign called with pid:', pid, 'value:', value)
    
    // Handle test app (PID 12345) locally without backend call
    if (pid === 12345) {
      console.log('Test app detected - handling locally')
      if (value === '') {
        setAppCategoriesState(prev => { const n = { ...prev }; delete n[pid]; return n })
      } else {
        setAppCategoriesState(prev => ({ ...prev, [pid]: value }))
      }
      return
    }
    
    // For real apps, check if it's a valid StreamId for backend
    const validStreamIds: StreamId[] = ['game', 'voice', 'music']
    
    try {
      if (value === '') {
        console.log('Clearing app category for pid:', pid)
        
        // Reset app volume to 100% when unassigning
        try {
          console.log('Resetting app volume to 100% for pid:', pid)
          await setAppVolume(pid, 1.0)
          console.log('App volume reset successful')
        } catch (volumeError) {
          console.error('Failed to reset app volume:', volumeError)
          // Continue with unassign even if volume reset fails
        }
        
        const ok = await clearAppCategory(pid)
        console.log('Clear category result:', ok)
        if (ok) setAppCategoriesState(prev => { const n = { ...prev }; delete n[pid]; return n })
      } else if (validStreamIds.includes(value as StreamId)) {
        console.log('Setting app category for pid:', pid, 'to backend stream:', value)
        const ok = await setAppCategory(pid, value as StreamId)
        console.log('Set category result:', ok)
        if (ok) setAppCategoriesState(prev => ({ ...prev, [pid]: value }))
      } else {
        console.log('Custom category detected - storing locally:', value)
        // Custom categories are stored locally only
        setAppCategoriesState(prev => ({ ...prev, [pid]: value }))
      }
    } catch (e) { 
      console.error('onAssign error:', e) 
    }
  }

  // Category management functions
  const addCategory = () => {
    if (newCategoryName.trim() && categories.length < 8) {
      const newCategory: Category = {
        id: `custom_${Date.now()}`,
        name: newCategoryName.trim(),
        color: getRandomCategoryColor(),
        icon: getRandomCategoryIcon()
      }
      setCategories(prev => [...prev, newCategory])
      setNewCategoryName('')
    }
  }

  const removeCategory = (categoryId: string) => {
    // Don't allow removing default categories
    if (['game', 'voice', 'music'].includes(categoryId)) return
    
    // Clear apps assigned to this category
    Object.entries(appCategories).forEach(([pid, catId]) => {
      if (catId === categoryId) {
        onAssign(Number(pid), '')
      }
    })
    
    setCategories(prev => prev.filter(cat => cat.id !== categoryId))
  }

  const updateCategoryName = (categoryId: string, newName: string) => {
    if (newName.trim()) {
      setCategories(prev => prev.map(cat => 
        cat.id === categoryId ? { ...cat, name: newName.trim() } : cat
      ))
    }
    setEditingCategory(null)
  }

  // Custom mixer management
  const addCustomMixer = () => {
    // Limit to maximum 6 mixers total (3 default + 3 custom)
    if (customMixers.length >= 3) return
    
    const newMixer = {
      id: `mixer_${Date.now()}`,
      name: `Mixer ${customMixers.length + 4}`,
      apps: []
    }
    const updatedMixers = [...customMixers, newMixer]
    setCustomMixers(updatedMixers)
    saveCustomMixers(updatedMixers)
    
    // Initialize volume for new mixer
    const newVolumes = { ...customMixerVolumes, [newMixer.id]: 0.8 }
    setCustomMixerVolumes(newVolumes)
    saveCustomMixerVolumes(newVolumes)
  }

  const updateMixerName = (mixerId: string, newName: string) => {
    const updatedMixers = customMixers.map(mixer => 
      mixer.id === mixerId ? { ...mixer, name: newName } : mixer
    )
    setCustomMixers(updatedMixers)
    saveCustomMixers(updatedMixers)
    setEditingMixer(null)
  }

  const deleteMixer = (mixerId: string) => {
    const updatedMixers = customMixers.filter(mixer => mixer.id !== mixerId)
    setCustomMixers(updatedMixers)
    saveCustomMixers(updatedMixers)
    
    // Clear apps assigned to this mixer
    setAppCategoriesState(prev => {
      const newState = { ...prev }
      Object.keys(newState).forEach(pid => {
        if (newState[parseInt(pid)] === mixerId) {
          delete newState[parseInt(pid)]
        }
      })
      return newState
    })
    
    // Remove volume and route for deleted mixer
    setCustomMixerVolumes(prev => {
      const newVolumes = { ...prev }
      delete newVolumes[mixerId]
      return newVolumes
    })
    setCustomMixerRoutes(prev => {
      const newRoutes = { ...prev }
      delete newRoutes[mixerId]
      return newRoutes
    })
    
    setContextMenu(null)
  }

  const setCustomMixerVolume = async (mixerId: string, volume: number) => {
    // Clamp volume between 0 and 1
    const clampedVolume = Math.min(1.0, Math.max(0.0, volume))
    
    // Update state immediately for responsive UI
    const newVolumes = { ...customMixerVolumes, [mixerId]: clampedVolume }
    setCustomMixerVolumes(newVolumes)
    saveCustomMixerVolumes(newVolumes)
    
    // Find all apps assigned to this mixer and update their volumes
    Object.entries(appCategories).forEach(([pid, category]) => {
      if (category === mixerId) {
        const app = apps.find(a => a.pid === parseInt(pid))
        if (app) {
          // Set individual app volume through the backend
          // For now, we'll just store the mixer volume locally
          console.log(`Setting volume for app ${app.name} in mixer ${mixerId} to ${clampedVolume}`)
        }
      }
    })
  }

  const setCustomMixerRoute = async (mixerId: string, deviceId: string | null) => {
    // Update state immediately for responsive UI
    setCustomMixerRoutes(prev => ({ ...prev, [mixerId]: deviceId }))
    
    // For custom mixers, we can implement device routing for all apps in the mixer
    console.log(`Setting route for custom mixer ${mixerId} to device ${deviceId}`)
    
    // Find all apps assigned to this mixer and route them to the device
    Object.entries(appCategories).forEach(([pid, category]) => {
      if (category === mixerId) {
        const app = apps.find(a => a.pid === parseInt(pid))
        if (app) {
          console.log(`Routing app ${app.name} to device ${deviceId}`)
          // Here we could implement per-app routing if the backend supports it
        }
      }
    })
  }

  const handleVolumeEdit = async (streamId: string, value: string) => {
    // Don't update volume if stream is muted
    if (mutedStreams.has(streamId)) {
      console.log(`Ignoring volume edit for muted stream: ${streamId}`)
      setEditingVolume(null)
      setTempVolumeInput('')
      return
    }
    
    const numValue = parseInt(value)
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
      const volume = numValue / 100
      const newVolumes = { ...pendingVolumes, [streamId]: volume }
      setPendingVolumes(newVolumes)
      
      // Save to localStorage immediately for persistence
      saveVolumes(newVolumes)
      
      // Live backend update for immediate audio response
      try {
        // Ensure true 0 for silence and clamp values
        const clampedVolume = volume <= 0.001 ? 0.0 : Math.min(1.0, Math.max(0.0, volume))
        
        console.log(`Live setting volume for ${streamId} to ${clampedVolume} (original: ${volume})`);
        const ok = await setStreamVolume(streamId as StreamId, clampedVolume);
        if (ok) {
          setVolumes(prev => ({ ...prev, [streamId as StreamId]: clampedVolume }));
          console.log(`Volume updated successfully for ${streamId}`);
        } else {
          console.error(`Failed to update volume for ${streamId}`);
        }
      } catch (error) {
        console.error(`Error updating volume for ${streamId}:`, error);
      }
    }
    setEditingVolume(null)
    setTempVolumeInput('')
  }

  const startVolumeEdit = (streamId: string, currentVolume: number) => {
    setEditingVolume(streamId)
    setTempVolumeInput(Math.round(currentVolume * 100).toString())
  }

  const toggleMute = async (streamId: string) => {
    const isMuted = mutedStreams.has(streamId)
    
    console.log(`=== TOGGLE MUTE ${streamId} ===`)
    console.log(`Current state: ${isMuted ? 'MUTED' : 'UNMUTED'}`)
    console.log(`Current UI volume: ${(pendingVolumes as any)[streamId]} (type: ${typeof (pendingVolumes as any)[streamId]})`)
    console.log(`Saved muted volume: ${mutedVolumes[streamId]} (type: ${typeof mutedVolumes[streamId]})`)
    console.log(`Current volumes state:`, volumes)
    console.log(`Current pendingVolumes state:`, pendingVolumes)
    console.log(`Current mutedVolumes state:`, mutedVolumes)
    
    if (isMuted) {
      // Unmuting - restore original volume
      let originalVolume = mutedVolumes[streamId]
      
      // Fallback logic if no saved volume
      if (originalVolume === undefined || originalVolume === null) {
        originalVolume = volumes[streamId as StreamId] || 0.5
        console.log(`⚠️ No saved muted volume, using fallback: ${originalVolume}`)
      }
      
      // Ensure volume is a valid number
      originalVolume = Number(originalVolume)
      if (isNaN(originalVolume) || originalVolume < 0 || originalVolume > 1) {
        originalVolume = 0.5
        console.log(`⚠️ Invalid volume value, using 0.5`)
      }
      
      console.log(`UNMUTING: Restoring volume to ${originalVolume}`)
      
      // Update mute state first - this is critical!
      const newMutedStreams = new Set(mutedStreams)
      newMutedStreams.delete(streamId)
      console.log(`Removing ${streamId} from muted streams`)
      
      // Remove from muted volumes
      const newMutedVolumes = { ...mutedVolumes }
      delete newMutedVolumes[streamId]
      console.log(`Removing saved volume for ${streamId}`)
      
      // Apply state changes immediately
      setMutedStreams(newMutedStreams)
      setMutedVolumes(newMutedVolumes)
      saveMutedStreams(newMutedStreams)
      
      // Wait a moment for state to update
      await new Promise(resolve => setTimeout(resolve, 50))
      
      // Restore UI volume
      console.log(`Setting UI volume to ${originalVolume}`)
      const newVolumes = { ...pendingVolumes, [streamId]: originalVolume }
      setPendingVolumes(newVolumes)
      saveVolumes(newVolumes)
      
      // Restore backend volume directly (not throttled)
      if (isTauri) {
        try {
          console.log(`Setting backend volume for ${streamId} to ${originalVolume}`)
          const ok = await setStreamVolume(streamId as StreamId, originalVolume)
          if (ok) {
            setVolumes(prev => ({ ...prev, [streamId as StreamId]: originalVolume }))
            console.log(`✅ Backend volume restored successfully for ${streamId}`)
          } else {
            console.error(`❌ Failed to set backend volume for ${streamId}`)
          }
        } catch (error) {
          console.error(`❌ Error restoring backend volume for ${streamId}:`, error)
        }
      }
    } else {
      // Muting - save current volume and set to 0
      let currentVolume = (pendingVolumes as any)[streamId]
      
      // Fallback if no pending volume
      if (currentVolume === undefined || currentVolume === null) {
        currentVolume = volumes[streamId as StreamId] || 0.5
        console.log(`⚠️ No pending volume, using volumes state: ${currentVolume}`)
      }
      
      // Ensure volume is a valid number
      currentVolume = Number(currentVolume)
      if (isNaN(currentVolume) || currentVolume < 0 || currentVolume > 1) {
        currentVolume = 0.5
        console.log(`⚠️ Invalid volume value, using 0.5`)
      }
      
      console.log(`MUTING: Saving current volume ${currentVolume}`)
      
      // Save current volume first
      const newMutedVolumes = { ...mutedVolumes, [streamId]: currentVolume }
      setMutedVolumes(newMutedVolumes)
      console.log(`Saved volume ${currentVolume} for ${streamId}`)
      
      // Update mute state
      const newMutedStreams = new Set(mutedStreams)
      newMutedStreams.add(streamId)
      setMutedStreams(newMutedStreams)
      saveMutedStreams(newMutedStreams)
      console.log(`Added ${streamId} to muted streams`)
      
      // Set UI volume to 0
      const newVolumes = { ...pendingVolumes, [streamId]: 0 }
      setPendingVolumes(newVolumes)
      saveVolumes(newVolumes)
      console.log(`Set UI volume to 0`)
      
      // Set backend volume to 0 directly (not throttled)
      if (isTauri) {
        try {
          console.log(`Setting backend volume for ${streamId} to 0`)
          const ok = await setStreamVolume(streamId as StreamId, 0)
          if (ok) {
            setVolumes(prev => ({ ...prev, [streamId as StreamId]: 0 }))
            console.log(`✅ Backend volume muted successfully for ${streamId}`)
          } else {
            console.error(`❌ Failed to mute backend volume for ${streamId}`)
          }
        } catch (error) {
          console.error(`❌ Error muting backend volume for ${streamId}:`, error)
        }
      }
    }
    
    console.log(`=== END TOGGLE MUTE ${streamId} ===`)
    
    // Mute/unmute all apps in this stream
    if (isTauri) {
      try {
        // Check if it's a custom mixer
        const mixer = customMixers.find(m => m.id === streamId)
        if (mixer) {
          // Mute all apps in the custom mixer
          for (const appPid of mixer.apps) {
            const app = apps.find(a => a.pid === appPid)
            if (app) {
              await setAppVolume(app.pid, isMuted ? app.volume : 0.0)
              console.log(`${isMuted ? 'Unmuted' : 'Muted'} app ${app.name} (PID: ${app.pid})`)
            }
          }
        } else {
          // It's a standard stream - mute all apps assigned to this stream
          const appsInStream = apps.filter(app => appCategories[app.pid] === streamId)
          for (const app of appsInStream) {
            await setAppVolume(app.pid, isMuted ? app.volume : 0.0)
            console.log(`${isMuted ? 'Unmuted' : 'Muted'} app ${app.name} (PID: ${app.pid})`)
          }
        }
      } catch (error) {
        console.error(`Failed to ${isMuted ? 'unmute' : 'mute'} apps in stream ${streamId}:`, error)
      }
    }
  }

  // Component to render app icons with optimized loading
  const AppIcon: React.FC<{ app: AppSession }> = ({ app }) => {
    const iconData = appIcons[app.pid];
    const cleanName = app.name.replace(/\.exe$/i, '');
    const isLoading = loadingIcons.has(app.process_name);
    
    if (iconData) {
      return (
        <img 
          src={iconData}
          alt={cleanName}
          className="wavelink-app-icon-img"
          onError={() => {
            console.warn(`Icon failed to load for ${app.name}, removing from cache`)
            // Remove failed icon from both caches
            setAppIcons(prev => {
              const newIcons = { ...prev };
              delete newIcons[app.pid];
              return newIcons;
            });
            setIconCache(prev => {
              const newCache = { ...prev };
              delete newCache[app.process_name];
              saveIconCache(newCache);
              return newCache;
            });
          }}
          onLoad={() => {
            // Icon loaded successfully - no action needed
          }}
        />
      );
    }
    
    // Show loading indicator or fallback letter
    if (isLoading) {
      return (
        <div className="wavelink-app-icon-letter wavelink-app-icon-loading">
          <div className="wavelink-loading-spinner"></div>
        </div>
      );
    }
    
    // Fallback to first letter if no icon available
    return (
      <div 
        className="wavelink-app-icon-letter"
        onClick={() => {
          // Allow manual retry by clicking the letter icon
          if (!loadingIcons.has(app.process_name)) {
            console.log(`Manual retry icon load for ${app.name}`)
            preloadSingleIcon(app)
          }
        }}
        title={`Click to retry loading icon for ${cleanName}`}
      >
        {cleanName.charAt(0).toUpperCase()}
      </div>
    );
  };

  const assignAppToMixer = (appPid: number, mixerId: string) => {
    setAppCategoriesState(prev => ({ ...prev, [appPid]: mixerId }))
  }

  const getRandomCategoryColor = () => {
    const colors = [
      'from-indigo-500 to-purple-600',
      'from-pink-500 to-rose-600', 
      'from-orange-500 to-red-600',
      'from-yellow-500 to-orange-600',
      'from-teal-500 to-cyan-600',
      'from-violet-500 to-purple-600',
      'from-emerald-500 to-teal-600',
      'from-slate-500 to-gray-600'
    ]
    return colors[Math.floor(Math.random() * colors.length)]
  }

  const getRandomCategoryIcon = () => {
    const icons = ['📁', '🎯', '⚡', '🔥', '💎', '🎪', '🚀', '🎨', '🎭', '🌟', '⭐']
    return icons[Math.floor(Math.random() * icons.length)]
  }

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, app: AppSession) => {
    console.log('Drag started for app:', app.name, 'isTauri:', isTauri)
    setDraggedApp(app)
    setIsDragging(true)
    
    // Prevent event bubbling to avoid conflicts with container events
    e.stopPropagation()
    
    if (isTauri) {
      // In Tauri, use a simpler approach
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', app.pid.toString())
      console.log('Tauri drag setup completed')
    } else {
      // Regular browser setup
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', app.pid.toString())
      e.dataTransfer.setData('application/json', JSON.stringify(app))
    }
    
    console.log('Drag data set, effectAllowed: move')
  }

  const [dragTarget, setDragTarget] = useState<string | null>(null)

  const handleDragEnd = (e: React.DragEvent) => {
    console.log('Drag ended - cleaning up')
    e.stopPropagation()
    
    setDraggedApp(null)
    setDragTarget(null)
    setIsDragging(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Get the stream from data attribute
    const target = e.currentTarget as HTMLElement
    const stream = target.dataset.stream
    if (stream && draggedApp) {
      setDragTarget(stream)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only clear if we're actually leaving the container
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragTarget(null)
    }
  }

  const handleDrop = (e: React.DragEvent, categoryId: string) => {
    e.preventDefault()
    setDragTarget(null)
    
    console.log('Drop attempted on category:', categoryId, 'with app:', draggedApp?.name)
    
    if (draggedApp) {
      if (categoryId === 'remove') {
        // Remove app from all categories/mixers
        console.log('Removing app from all mixers')
        onAssign(draggedApp.pid, '').then(() => {
          console.log('App removed from all mixers')
          setDraggedApp(null)
        }).catch((err: any) => {
          console.error('Remove failed:', err)
          setDraggedApp(null)
        })
      } else {
        // Assign app to specific mixer/category
        console.log('Valid drop - assigning app to category')
        onAssign(draggedApp.pid, categoryId).then(() => {
          console.log('Assignment completed')
          setDraggedApp(null)
        }).catch((err: any) => {
          console.error('Assignment failed:', err)
          setDraggedApp(null)
        })
      }
    } else {
      console.log('No dragged app found')
      setDraggedApp(null)
    }
  }

  // Alternative mouse-based drag for Tauri
  const handleMouseDown = (e: React.MouseEvent, app: AppSession) => {
    if (!isTauri) return // Only use this in Tauri
    
    console.log('Mouse down on app:', app.name, '- starting Tauri drag')
    setDraggedApp(app)
    setIsDragging(true)
    document.body.classList.add('dragging-active')
    
    const handleMouseMove = (e: MouseEvent) => {
      setDragPosition({ x: e.clientX, y: e.clientY })
    }
    
    const handleMouseUp = (e: MouseEvent) => {
      console.log('Mouse up - checking for drop target')
      const elementBelow = document.elementFromPoint(e.clientX, e.clientY)
      const dropZone = elementBelow?.closest('.drop-zone')
      
      if (dropZone) {
        const categoryId = dropZone.getAttribute('data-category')
        console.log('Dropped on category:', categoryId)
        
        if (categoryId && categoryId !== 'unassigned') {
          console.log('Valid mouse drop - assigning app to category')
          onAssign(app.pid, categoryId).then(() => {
            console.log('Mouse assignment completed')
          }).catch(err => {
            console.error('Mouse assignment failed:', err)
          })
        } else if (categoryId === 'unassigned') {
          console.log('Valid mouse drop - removing app from category')
          onAssign(app.pid, '').then(() => {
            console.log('Mouse unassignment completed')
          }).catch(err => {
            console.error('Mouse unassignment failed:', err)
          })
        }
      }
      
      // Cleanup
      setDraggedApp(null)
      setIsDragging(false)
      document.body.classList.remove('dragging-active')
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const handleDropUnassigned = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.classList.remove('drag-over')
    console.log('Drop attempted on unassigned zone with app:', draggedApp?.name)
    if (draggedApp) {
      console.log('Valid drop - removing app from category')
      onAssign(draggedApp.pid, '').then(() => {
        console.log('Unassignment completed')
        setDraggedApp(null)
      }).catch(err => {
        console.error('Unassignment failed:', err)
        setDraggedApp(null)
      })
    }
  }

  return (
    <>
      {/* Loading Screen */}
      {isLoading && (
        <div className="wavelink-loading-screen">
          <div className="wavelink-loading-content">
            <div className="wavelink-loading-logo">
              WaveLink
            </div>
            <div className="wavelink-loading-spinner-large"></div>
            <div className="wavelink-loading-text">
              {loadingStage}
            </div>
            <div className="wavelink-loading-dots">
              <div className="wavelink-loading-dot"></div>
              <div className="wavelink-loading-dot"></div>
              <div className="wavelink-loading-dot"></div>
            </div>
          </div>
        </div>
      )}

      {/* Main App */}
      <div className="min-h-screen text-white" style={{ background: 'var(--wavelink-bg)' }}>
      <div className="p-6">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg" style={{ background: 'var(--wavelink-green)' }}>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.464 15.536a5 5 0 010-7.072m-2.828 9.9a9 9 0 010-12.728M12 12h.01" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-bold" style={{ color: 'var(--wavelink-text)' }}>
                🌊 Wave Link
              </h1>
              <p className="text-sm" style={{ color: 'var(--wavelink-text-muted)' }}>Professional Windows Audio Control</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={loadApps}
              className="btn btn-secondary text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
            
            {(isTauri || true) && (
              <button 
                onClick={checkForUpdates}
                className={`btn btn-secondary text-sm relative ${updateInfo?.available ? 'btn-accent' : ''}`}
                disabled={isUpdating}
              >
                {updateInfo?.available && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                )}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {updateInfo?.available ? 'Update Available!' : `Check Updates (${isTauri ? 'Tauri' : 'Browser'})`}
              </button>
            )}
          </div>
        </header>

        <main className="space-y-6">
          {/* WaveLink-style Mixer Section */}
          <section>
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-xl font-semibold" style={{ color: 'var(--wavelink-text)' }}>Mix Editor</h2>
              <div className="h-px bg-gradient-to-r from-green-500/50 to-transparent flex-1"></div>
            </div>
            
            <div className="wavelink-channels-grid">
              {/* Standard Audio Mixers */}
              {defaultStreams.map((stream, index) => (
                <div 
                  key={stream} 
                  className={`wavelink-channel ${mutedStreams.has(stream) ? 'muted' : ''}`}
                >
                  {/* Channel Header with Device Selector */}
                  <div className="wavelink-channel-header">
                    <div 
                      className="wavelink-channel-name"
                    >
                      {streamNames[stream]}
                    </div>
                    
                    {/* Device Dropdown */}
                    <div className={`wavelink-device-dropdown ${openDeviceDropdown === stream ? 'open' : ''}`} data-stream={stream}>
                      <button 
                        className="wavelink-device-button"
                        data-stream={stream}
                        onClick={(e) => {
                          e.stopPropagation()
                          console.log('Device dropdown clicked for stream:', stream)
                          setOpenDeviceDropdown(openDeviceDropdown === stream ? null : stream)
                        }}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                        <span>{routes[stream] ? outputDevices.find(d => d.id === routes[stream])?.name.slice(0, 8) + '...' : 'Default'}</span>
                      </button>
                      
                      {openDeviceDropdown === stream && (
                        <div 
                          className="wavelink-modal-overlay"
                          onClick={() => setOpenDeviceDropdown(null)}
                        >
                          <div 
                            className="wavelink-modal"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="wavelink-modal-header">
                              <div className="wavelink-modal-title">
                                <div className="text-sm font-semibold">Output Device</div>
                                <div className="text-xs opacity-70">
                                  {stream.charAt(0).toUpperCase() + stream.slice(1)} Stream
                                </div>
                              </div>
                              <button 
                                className="wavelink-modal-close"
                                onClick={() => setOpenDeviceDropdown(null)}
                              >
                                ×
                              </button>
                            </div>
                            
                            <div className="wavelink-modal-content">
                              <button
                                onClick={() => {
                                  console.log('Selected default device for stream:', stream)
                                  onRoute(stream, null)
                                  setOpenDeviceDropdown(null)
                                }}
                                className={`wavelink-device-option ${!routes[stream] ? 'selected' : ''}`}
                              >
                                <div className="wavelink-device-name">Default Device</div>
                                <div className="wavelink-device-info">System default audio output</div>
                              </button>
                              
                              {outputDevices.map(device => (
                                <button
                                  key={device.id}
                                  onClick={() => {
                                    console.log('Selected device for stream:', stream, 'device:', device.name)
                                    onRoute(stream, device.id)
                                    setOpenDeviceDropdown(null)
                                  }}
                                  className={`wavelink-device-option ${routes[stream] === device.id ? 'selected' : ''}`}
                                >
                                  <div className="wavelink-device-name">{device.name}</div>
                                  <div className="wavelink-device-info">
                                    {device.backend} {device.is_default ? '• System Default' : ''}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* App Container */}
                    <div 
                      className={`wavelink-app-container ${dragTarget === stream ? 'drag-highlight' : ''}`}
                      data-stream={stream}
                      onDragOver={handleDragOver}
                      onDragEnter={handleDragEnter}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, stream)}
                    >
                      {/* Show apps assigned to this stream */}
                      {(() => {
                        const assignedApps = Object.entries(appCategories)
                          .filter(([pid, category]) => 
                            typeof category === 'string' ? category === stream : category === stream
                          )
                          .map(([pid]) => {
                            const app = apps.find(a => a.pid === parseInt(pid))
                            return app ? (
                              <div 
                                key={pid} 
                                className="wavelink-app-icon" 
                                title={app.name}
                                draggable
                                onDragStart={(e) => handleDragStart(e, app)}
                                onDragEnd={handleDragEnd}
                              >
                                <AppIcon app={app} />
                              </div>
                            ) : null
                          })
                        
                        console.log(`Apps for stream ${stream}:`, assignedApps.length, 'appCategories:', appCategories)
                        return assignedApps
                      })()}
                    </div>
                  </div>
                  
                  {/* Vertical Slider Section - Level links, Slider rechts */}
                  <div className="wavelink-slider-container">
                    {/* Level Meter - Links */}
                    <div className="wavelink-level">
                      <div 
                        className="wavelink-level-fill" 
                        style={{ height: `${(audioLevels[stream] || 0) * 100}%` }}
                      ></div>
                    </div>
                    
                    {/* Volume Slider - Rechts */}
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={pendingVolumes[stream] || 0}
                      onChange={(e) => onVolume(stream, parseFloat(e.target.value))}
                      className={`wavelink-slider ${mutedStreams.has(stream) ? 'disabled' : ''}`}
                      disabled={mutedStreams.has(stream)}
                    />
                  </div>
                  
                  {/* Volume Display */}
                  {/* Volume Display */}
                  <div className="wavelink-volume-display">
                    {editingVolume === stream ? (
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={tempVolumeInput}
                        onChange={(e) => setTempVolumeInput(e.target.value)}
                        onBlur={() => handleVolumeEdit(stream, tempVolumeInput)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleVolumeEdit(stream, tempVolumeInput)
                          } else if (e.key === 'Escape') {
                            setEditingVolume(null)
                            setTempVolumeInput('')
                          }
                        }}
                        className="wavelink-volume-input"
                        autoFocus
                      />
                    ) : (
                      <span 
                        onClick={() => startVolumeEdit(stream, pendingVolumes[stream] || 0)}
                        className="wavelink-volume-text"
                      >
                        {Math.round((pendingVolumes[stream] || 0) * 100)}%
                      </span>
                    )}
                  </div>
                  
                  {/* Channel Controls */}
                  <div className="wavelink-channel-buttons">
                    <button 
                      className={`wavelink-btn-small ${mutedStreams.has(stream) ? 'muted' : ''}`}
                      onClick={() => toggleMute(stream)}
                    >
                      {mutedStreams.has(stream) ? '🔇' : '🔊'}
                    </button>
                  </div>
                </div>
              ))}

              {/* Custom Mixers */}
              {customMixers.map((mixer) => (
                <div 
                  key={mixer.id} 
                  className={`wavelink-channel ${mutedStreams.has(mixer.id) ? 'muted' : ''}`}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setContextMenu({ x: e.clientX, y: e.clientY, mixerId: mixer.id })
                  }}
                >
                  <div className="wavelink-channel-header">
                    <div 
                      className={`wavelink-channel-name ${editingMixer === mixer.id ? 'editing' : ''}`}
                      onDoubleClick={() => setEditingMixer(mixer.id)}
                    >
                      {editingMixer === mixer.id ? (
                        <input
                          type="text"
                          defaultValue={mixer.name}
                          className="bg-transparent border-none outline-none text-center w-full"
                          onBlur={(e) => updateMixerName(mixer.id, e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              updateMixerName(mixer.id, (e.target as HTMLInputElement).value)
                            }
                          }}
                          autoFocus
                        />
                      ) : (
                        mixer.name
                      )}
                    </div>
                    
                    {/* Device Dropdown for custom mixers */}
                    <div className={`wavelink-device-dropdown ${openDeviceDropdown === mixer.id ? 'open' : ''}`} data-mixer={mixer.id}>
                      <button 
                        className="wavelink-device-button"
                        data-mixer={mixer.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          console.log('Custom mixer device dropdown clicked for mixer:', mixer.id)
                          setOpenDeviceDropdown(openDeviceDropdown === mixer.id ? null : mixer.id)
                        }}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                        <span>
                          {customMixerRoutes[mixer.id] 
                            ? (outputDevices.find(d => d.id === customMixerRoutes[mixer.id])?.name.slice(0, 8) + '...' || 'Unknown')
                            : 'Default'
                          }
                        </span>
                      </button>
                      
                      {openDeviceDropdown === mixer.id && (
                        <div className="wavelink-device-menu">
                          <div 
                            className={`wavelink-device-item ${!customMixerRoutes[mixer.id] ? 'selected' : ''}`}
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              console.log('Setting custom mixer route to default for mixer:', mixer.id)
                              setCustomMixerRoute(mixer.id, null)
                              setOpenDeviceDropdown(null)
                            }}
                          >
                            Default Device
                          </div>
                          {outputDevices.map(device => (
                            <div 
                              key={device.id} 
                              className={`wavelink-device-item ${customMixerRoutes[mixer.id] === device.id ? 'selected' : ''}`}
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                console.log('Setting custom mixer route to device:', device.name, 'for mixer:', mixer.id)
                                setCustomMixerRoute(mixer.id, device.id)
                                setOpenDeviceDropdown(null)
                              }}
                            >
                              {device.name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {/* App Container for Custom Mixer */}
                    <div 
                      className={`wavelink-app-container ${dragTarget === mixer.id ? 'drag-highlight' : ''}`}
                      data-stream={mixer.id}
                      onDragOver={handleDragOver}
                      onDragEnter={handleDragEnter}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, mixer.id)}
                    >
                      {/* Show apps assigned to this custom mixer */}
                      {Object.entries(appCategories)
                        .filter(([pid, category]) => 
                          typeof category === 'string' ? category === mixer.id : category === mixer.id
                        )
                        .map(([pid]) => {
                          const app = apps.find(a => a.pid === parseInt(pid))
                          return app ? (
                            <div 
                              key={pid} 
                              className="wavelink-app-icon" 
                              title={app.name}
                              draggable
                              onDragStart={(e) => handleDragStart(e, app)}
                              onDragEnd={handleDragEnd}
                            >
                              <AppIcon app={app} />
                            </div>
                          ) : null
                        })}
                    </div>
                  </div>
                  
                  <div className="wavelink-slider-container">
                    <div className="wavelink-level">
                      <div 
                        className="wavelink-level-fill" 
                        style={{ height: `${(audioLevels[mixer.id] || 0) * 100}%` }}
                      ></div>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={customMixerVolumes[mixer.id] || 0.8}
                      onChange={(e) => setCustomMixerVolume(mixer.id, parseFloat(e.target.value))}
                      className={`wavelink-slider ${mutedStreams.has(mixer.id) ? 'disabled' : ''}`}
                      disabled={mutedStreams.has(mixer.id)}
                    />
                  </div>
                  
                  <div className="wavelink-volume-display">{Math.round((customMixerVolumes[mixer.id] || 0.8) * 100)}%</div>
                  
                  <div className="wavelink-channel-buttons">
                    <button 
                      className={`wavelink-btn-small ${mutedStreams.has(mixer.id) ? 'muted' : ''}`}
                      onClick={() => toggleMute(mixer.id)}
                    >
                      {mutedStreams.has(mixer.id) ? '🔇' : '🔊'}
                    </button>
                  </div>
                </div>
              ))}

              {/* Add Mixer Button - Only show if less than 3 custom mixers */}
              {customMixers.length < 3 && (
                <div className="wavelink-add-mixer" onClick={addCustomMixer}>
                  <div className="wavelink-add-icon">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <span style={{ color: 'var(--wavelink-text-muted)', fontSize: '12px', fontWeight: '500' }}>
                    Add Audio Mixer
                  </span>
                </div>
              )}

              {/* Apps Container */}
              <div className="wavelink-apps-container">
                <div className="wavelink-apps-header">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center text-sm" style={{ backgroundColor: 'var(--wavelink-border)' }}>
                      📱
                    </div>
                    <h3 className="font-medium" style={{ color: 'var(--wavelink-text)' }}>
                      Unassigned Apps ({apps.filter(app => !appCategories[app.pid]).length})
                    </h3>
                  </div>
                  <button 
                    className="wavelink-clear-all-btn"
                    onClick={async () => {
                      console.log('Clearing all app assignments and resetting volumes')
                      // Clear all apps from all mixers and reset their volumes
                      for (const app of apps) {
                        if (appCategories[app.pid]) {
                          try {
                            // Reset volume to 100% first
                            await setAppVolume(app.pid, 1.0)
                            console.log(`Reset volume for ${app.name}`)
                          } catch (volumeError) {
                            console.error(`Failed to reset volume for ${app.name}:`, volumeError)
                          }
                          // Then clear assignment
                          await onAssign(app.pid, '')
                        }
                      }
                    }}
                    title="Clear all app assignments and reset volumes to 100%"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1H9a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                
                <div className="wavelink-apps-list">
                  {apps.filter(app => !appCategories[app.pid]).map(app => {
                    // Remove .exe from app name
                    const cleanName = app.name.replace(/\.exe$/i, '')
                    
                    return (
                      <div
                        key={app.pid}
                        draggable
                        onDragStart={(e) => handleDragStart(e, app)}
                        onDragEnd={handleDragEnd}
                        className="wavelink-app-item"
                      >
                        <div className="wavelink-app-icon">
                          <AppIcon app={app} />
                        </div>
                        <div className="wavelink-app-info">
                          <div className="wavelink-app-name">{cleanName}</div>
                        </div>
                      </div>
                    )
                  })}
                  
                  {apps.filter(app => !appCategories[app.pid]).length === 0 && (
                    <div className="text-center py-8">
                      <div className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--wavelink-border)' }}>
                        <svg className="w-6 h-6" style={{ color: 'var(--wavelink-text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <p className="text-sm" style={{ color: 'var(--wavelink-text-muted)' }}>All apps assigned</p>
                    </div>
                  )}
                  
                  {/* Remove Zone */}
                  <div 
                    className={`wavelink-remove-zone ${dragTarget === 'remove' ? 'drag-highlight' : ''}`}
                    data-stream="remove"
                    onDragOver={handleDragOver}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'remove')}
                  >
                    <div className="wavelink-remove-icon">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1H9a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </div>
                    <div className="wavelink-remove-text">
                      Drop here to remove from mixers
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

        </main>

        {/* Context Menu */}
        {contextMenu && (
          <div 
            className="wavelink-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <div 
              className="wavelink-context-item danger"
              onClick={() => deleteMixer(contextMenu.mixerId)}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete Mixer
            </div>
          </div>
        )}
      </div>

      {updateInfo?.available && (
        <UpdateModal 
          version={updateInfo.version} 
          notes={updateInfo.notes} 
          onClose={() => setUpdateInfo(null)} 
          onInstall={installUpdate}
          isUpdating={isUpdating}
        />
      )}
    </div>
    </>
  )
}

function UpdateModal({ version, notes, onClose, onInstall, isUpdating }: { 
  version: string
  notes?: string
  onClose: () => void
  onInstall: () => void
  isUpdating: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="panel p-6 max-w-md w-full mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
            {isUpdating ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
          </div>
          <h3 className="text-lg font-semibold">
            {isUpdating ? 'Installing Update...' : 'Update Available'}
          </h3>
        </div>
        
        {isUpdating ? (
          <div className="space-y-3">
            <p className="text-gray-300">Downloading and installing Audio Mixer v{version}...</p>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full animate-pulse" style={{width: '100%'}}></div>
            </div>
            <p className="text-sm text-gray-400">The app will restart automatically when the update is complete.</p>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <p className="text-gray-300 mb-2">
                <span className="text-blue-400 font-medium">Audio Mixer v{version}</span> is now available!
              </p>
              <p className="text-sm text-gray-400">
                You're currently running version {/* Add current version here if needed */}
              </p>
            </div>
            
            {notes && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  What's New:
                </h4>
                <div className="text-sm text-gray-400 bg-gray-800/50 rounded-lg p-3 max-h-32 overflow-y-auto">
                  {notes.split('\n').map((line, index) => (
                    <p key={index} className="mb-1 last:mb-0">{line}</p>
                  ))}
                </div>
              </div>
            )}
            
            <div className="flex gap-3">
              <button 
                onClick={onInstall} 
                className="btn btn-accent flex-1 flex items-center justify-center gap-2"
                disabled={isUpdating}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Install Now
              </button>
              <button 
                onClick={onClose} 
                className="btn btn-secondary"
                disabled={isUpdating}
              >
                Later
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}