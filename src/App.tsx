import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { getDevices, setRoute, setStreamVolume, type DeviceInfo, type StreamId, getRoutes, listAudioApps, type AppSession, getAppCategories, setAppCategory, clearAppCategory } from './bridge'
import { invoke } from '@tauri-apps/api/core'
import { check as checkUpdate } from '@tauri-apps/plugin-updater'

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
  const [pendingVolumes, setPendingVolumes] = useState<Record<StreamId, number>>({ game: 0.8, voice: 0.8, music: 0.8 })
  const [updateInfo, setUpdateInfo] = useState<{version: string, notes?: string, available: boolean} | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [apps, setApps] = useState<AppSession[]>([])
  const [appCategories, setAppCategoriesState] = useState<Record<number, StreamId | string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [categories, setCategories] = useState<Category[]>(defaultCategories)
  const [draggedApp, setDraggedApp] = useState<AppSession | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 })
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')

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

    document.addEventListener('dragover', handleGlobalDragOver)
    document.addEventListener('drop', handleGlobalDrop)

    return () => {
      document.removeEventListener('dragover', handleGlobalDragOver)
      document.removeEventListener('drop', handleGlobalDrop)
    }
  }, [])

  // Initialize pending volumes with actual volumes
  useEffect(() => {
    setPendingVolumes(volumes)
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
    
    // Auto-refresh Apps alle 4 Sekunden
    const interval = setInterval(() => {
      loadApps();
      loadAppCategories();
    }, 4000);
    
    return () => clearInterval(interval);
  }, [])

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        loadDevices(),
        loadApps(),
        loadAppCategories(),
        loadRoutes()
      ]);
    } finally {
      setIsLoading(false);
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
      const apps = await listAudioApps();
      setApps(apps);
    } catch (error) {
      console.error('Failed to load apps:', error);
    }
  };

  const loadAppCategories = async () => {
    try {
      const categories = await getAppCategories();
      setAppCategoriesState(categories);
    } catch (error) {
      console.error('Failed to load app categories:', error);
    }
  };

  const outputDevices = useMemo(() => 
    devices.filter(d => d.kind === 'output'), 
    [devices]
  );

  // Debounce volume changes to reduce backend calls
  const debouncedVolumes = useDebounce(pendingVolumes, 150) // 150ms delay

  // Effect to handle debounced volume updates
  useEffect(() => {
    const updateVolumes = async () => {
      for (const [stream, volume] of Object.entries(debouncedVolumes)) {
        if (volumes[stream as StreamId] !== volume) {
          console.log(`Setting volume for ${stream} to ${volume}`);
          const ok = await setStreamVolume(stream as StreamId, volume);
          if (ok) {
            setVolumes(prev => ({ ...prev, [stream as StreamId]: volume }));
          }
        }
      }
    }
    updateVolumes()
  }, [debouncedVolumes, volumes])

  const onRoute = async (stream: StreamId, deviceId: string | null) => {
    const ok = await setRoute(stream, deviceId);
    if (ok) {
      setRoutesState(prev => ({ ...prev, [stream]: deviceId }));
    }
  };

  // Immediate UI update for volume changes, debounced backend calls
  const onVolume = (stream: StreamId, volume: number) => {
    setPendingVolumes(prev => ({ ...prev, [stream]: volume }));
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
    
    // Add global dragging state
    document.body.classList.add('dragging-active')
    
    console.log('Drag data set, effectAllowed: move')
  }

  const handleDragEnd = (e: React.DragEvent) => {
    console.log('Drag ended - cleaning up')
    setDraggedApp(null)
    setIsDragging(false)
    // Remove global dragging state
    document.body.classList.remove('dragging-active')
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // This is crucial - without this, the drop zones won't accept drops
    e.dataTransfer.dropEffect = 'move'
    console.log('Drag over - dropEffect set to move, isTauri:', isTauri)
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    console.log('Drag enter')
    // Find the drop zone container to ensure consistent styling
    const dropZone = (e.currentTarget as HTMLElement).closest('.drop-zone') || e.currentTarget
    dropZone.classList.add('drag-over')
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    console.log('Drag leave')
    
    // Only remove hover effect if we're actually leaving the drop zone
    // Check if the related target is still within this drop zone
    const dropZone = e.currentTarget as HTMLElement
    const relatedTarget = e.relatedTarget as HTMLElement
    
    if (!relatedTarget || !dropZone.contains(relatedTarget)) {
      dropZone.classList.remove('drag-over')
    }
  }

  const handleDrop = (e: React.DragEvent, categoryId: string) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.classList.remove('drag-over')
    console.log('Drop attempted on category:', categoryId, 'with app:', draggedApp?.name)
    if (draggedApp) {
      console.log('Valid drop - assigning app to category')
      onAssign(draggedApp.pid, categoryId).then(() => {
        console.log('Assignment completed')
        setDraggedApp(null)
      }).catch(err => {
        console.error('Assignment failed:', err)
        setDraggedApp(null)
      })
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
    <div className="min-h-screen bg-black text-white">
      {/* Background pattern */}
      <div className="fixed inset-0 opacity-5">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent"></div>
      </div>
      
      <div className="relative z-10 p-6">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.464 15.536a5 5 0 010-7.072m-2.828 9.9a9 9 0 010-12.728M12 12h.01" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">
                Audio Mixer
              </h1>
              <p className="text-gray-400 text-sm">Professional Windows Audio Control</p>
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

        <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Audio Streams */}
          <section className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xl font-semibold text-gray-200">Audio Streams</h2>
              <div className="h-px bg-gradient-to-r from-blue-500/50 to-transparent flex-1"></div>
            </div>
            <div className="space-y-4">
              {defaultStreams.map((stream, index) => (
                <div key={stream}>
                  <StreamCard
                    stream={stream}
                    devices={outputDevices}
                    route={routes[stream]}
                    volume={pendingVolumes[stream]}
                    onRoute={onRoute}
                    onVolume={onVolume}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* App Categories */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xl font-semibold text-gray-200">App Categories</h2>
              <div className="h-px bg-gradient-to-r from-blue-500/50 to-transparent flex-1"></div>
            </div>
            
            <div className="panel p-4">
              {/* Categories */}
              <div className="mb-6">
                {/* Add Category Section */}
                {categories.length < 8 && (
                  <div className="flex items-center gap-2 mb-4">
                    <input
                      type="text"
                      placeholder="New category name..."
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      className="flex-1 bg-gray-800/80 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                      onKeyPress={(e) => e.key === 'Enter' && addCategory()}
                      maxLength={20}
                    />
                    <button 
                      onClick={addCategory} 
                      disabled={!newCategoryName.trim()}
                      className="btn btn-accent text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add
                    </button>
                  </div>
                )}
                
                {categories.length >= 8 && (
                  <div className="mb-4 p-2 bg-yellow-900/20 border border-yellow-600/30 rounded-lg">
                    <p className="text-xs text-yellow-400">Maximum of 8 categories reached</p>
                  </div>
                )}

                <div className="space-y-3">
                {categories.map(category => (
                  <div
                    key={category.id}
                    data-category={category.id}
                    className="drop-zone p-4 rounded-lg bg-gray-800/50 border-2 border-dashed border-gray-600 hover:border-blue-400 transition-colors min-h-[80px] flex items-center"
                    onDragOver={(e) => {
                      console.log(`DragOver on category: ${category.id}`)
                      handleDragOver(e)
                    }}
                    onDragEnter={(e) => {
                      console.log(`DragEnter on category: ${category.id}`)
                      handleDragEnter(e)
                    }}
                    onDragLeave={(e) => {
                      console.log(`DragLeave on category: ${category.id}`)
                      handleDragLeave(e)
                    }}
                    onDrop={(e) => {
                      console.log(`Drop on category: ${category.id}`)
                      handleDrop(e, category.id)
                    }}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${category.color} flex items-center justify-center text-sm`}>
                          {category.icon}
                        </div>
                        {editingCategory === category.id ? (
                          <input
                            type="text"
                            defaultValue={category.name}
                            className="bg-gray-700 border border-gray-500 rounded px-2 py-1 text-sm"
                            onBlur={(e) => updateCategoryName(category.id, e.target.value)}
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                updateCategoryName(category.id, (e.target as HTMLInputElement).value)
                              }
                            }}
                            autoFocus
                          />
                        ) : (
                          <span 
                            className="font-medium cursor-pointer hover:text-blue-400"
                            onClick={() => setEditingCategory(category.id)}
                          >
                            {category.name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">
                          {Object.values(appCategories).filter(cat => cat === category.id).length} apps
                        </span>
                        {!['game', 'voice', 'music'].includes(category.id) && (
                          <button
                            onClick={() => removeCategory(category.id)}
                            className="text-red-400 hover:text-red-300 p-1"
                            title="Delete category"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                </div>
              </div>

              {/* Unassigned Drop Zone */}
              <div
                data-category="unassigned"
                className="drop-zone p-4 rounded-lg bg-gray-900/50 border-2 border-dashed border-gray-600 hover:border-red-400 transition-colors min-h-[80px] flex items-center"
                onDragOver={(e) => {
                  console.log('DragOver on unassigned zone')
                  handleDragOver(e)
                }}
                onDragEnter={(e) => {
                  console.log('DragEnter on unassigned zone')
                  handleDragEnter(e)
                }}
                onDragLeave={(e) => {
                  console.log('DragLeave on unassigned zone')
                  handleDragLeave(e)
                }}
                onDrop={(e) => {
                  console.log('Drop on unassigned zone')
                  handleDropUnassigned(e)
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center text-sm">
                    ❌
                  </div>
                  <span className="font-medium text-gray-400">Unassigned</span>
                  <span className="text-xs text-gray-500">
                    {apps.filter(app => !appCategories[app.pid]).length} apps
                  </span>
                </div>
              </div>

              {/* Draggable Apps */}
              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-3 mt-6">Active Applications ({apps.length})</h3>
                
                {/* Test App for Debugging */}
                {apps.length === 0 && (
                  <div className="mb-4 p-2 bg-yellow-900/20 border border-yellow-600/30 rounded-lg">
                    <p className="text-xs text-yellow-400 mb-2">Debug: No apps detected. Testing with mock app:</p>
                    <div
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, { pid: 12345, name: "Test App", volume: 0.8, muted: false })}
                      onDragEnd={handleDragEnd}
                      onMouseDown={(e) => isTauri && handleMouseDown(e, { pid: 12345, name: "Test App", volume: 0.8, muted: false })}
                      className="app-card p-3 hover:bg-gray-700/50 transition-colors bg-gray-800/50 rounded"
                      style={{ cursor: isTauri ? 'pointer' : 'grab' }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded bg-gray-600 flex items-center justify-center text-xs">
                            🎵
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-200">Test Audio App</div>
                            <div className="text-xs text-gray-500">PID 12345</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-yellow-400">Try dragging me!</span>
                          {appCategories[12345] && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">→</span>
                              <div className={`w-6 h-6 rounded bg-gradient-to-br ${categories.find(cat => cat.id === appCategories[12345])?.color} flex items-center justify-center text-xs`}>
                                {categories.find(cat => cat.id === appCategories[12345])?.icon}
                              </div>
                              <span className="text-xs text-gray-400">{categories.find(cat => cat.id === appCategories[12345])?.name}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="space-y-2 max-h-[40vh] overflow-auto">
                  {apps.map(app => {
                    const assignedCategory = categories.find(cat => cat.id === appCategories[app.pid])
                    return (
                      <div
                        key={app.pid}
                        draggable={true}
                        onDragStart={(e) => handleDragStart(e, app)}
                        onDragEnd={handleDragEnd}
                        onMouseDown={(e) => isTauri && handleMouseDown(e, app)}
                        className="app-card p-3 hover:bg-gray-700/50 transition-colors"
                        style={{ cursor: isTauri ? 'pointer' : 'grab' }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded bg-gray-600 flex items-center justify-center text-xs">
                              📱
                            </div>
                            <div>
                              <div className="text-sm font-medium text-gray-200 truncate max-w-[200px]">{app.name}</div>
                              <div className="text-xs text-gray-500">PID {app.pid}</div>
                            </div>
                          </div>
                          {assignedCategory && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">→</span>
                              <div className={`w-6 h-6 rounded bg-gradient-to-br ${assignedCategory.color} flex items-center justify-center text-xs`}>
                                {assignedCategory.icon}
                              </div>
                              <span className="text-xs text-gray-400">{assignedCategory.name}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {apps.length === 0 && (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gray-800/50 flex items-center justify-center">
                        <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <p className="text-sm text-gray-400">No active apps detected</p>
                      <p className="text-xs text-gray-500 mt-1">Start some applications to assign them to categories</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </main>
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
  )
}

function StreamCard({ stream, devices, route, volume, onRoute, onVolume }: {
  stream: StreamId
  devices: DeviceInfo[]
  route: string | null
  volume: number
  onRoute: (stream: StreamId, deviceId: string | null) => void
  onVolume: (stream: StreamId, volume: number) => void
}) {
  const streamNames = {
    game: 'Gaming',
    voice: 'Voice Chat', 
    music: 'Music'
  }

  const streamIcons = {
    game: '🎮',
    voice: '🎤',
    music: '🎵'
  }

  const streamColors = {
    game: 'from-green-500 to-emerald-600',
    voice: 'from-blue-500 to-cyan-600',
    music: 'from-purple-500 to-pink-600'
  }

  return (
    <div className="panel p-4">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${streamColors[stream]} flex items-center justify-center text-sm`}>
          {streamIcons[stream]}
        </div>
        <div>
          <h3 className="font-semibold text-gray-200">{streamNames[stream]}</h3>
          <p className="text-xs text-gray-500">Audio Stream</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Output Device</label>
          <select 
            value={route || ''}
            onChange={(e) => onRoute(stream, e.target.value || null)}
            className="w-full bg-gray-800/80 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
          >
            <option value="">Default Device</option>
            {devices.map(device => (
              <option key={device.id} value={device.id}>
                {device.name} {device.is_default ? '(Default)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Volume: {Math.round(volume * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => onVolume(stream, parseFloat(e.target.value))}
            className="slider w-full"
          />
        </div>
      </div>
    </div>
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
