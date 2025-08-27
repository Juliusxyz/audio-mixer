import React, { useEffect, useMemo, useState } from 'react'
import { getDevices, setRoute, setStreamVolume, type DeviceInfo, type StreamId, getRoutes, listAudioApps, type AppSession, getAppCategories, setAppCategory, clearAppCategory } from './bridge'
import { invoke } from '@tauri-apps/api/core'
import { check as checkUpdate } from '@tauri-apps/plugin-updater'

const defaultStreams: StreamId[] = ['game', 'voice', 'music']

export default function App() {
  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [routes, setRoutesState] = useState<Record<StreamId, string | null>>({ game: null, voice: null, music: null })
  const [volumes, setVolumes] = useState<Record<StreamId, number>>({ game: 0.8, voice: 0.8, music: 0.8 })
  const [updateInfo, setUpdateInfo] = useState<{version: string, notes?: string, available: boolean} | null>(null)
  const [apps, setApps] = useState<AppSession[]>([])
  const [appCategories, setAppCategoriesState] = useState<Record<number, StreamId>>({})

  useEffect(() => {
    // Initial data
  getDevices().then(setDevices).catch(console.error)
  getRoutes().then(setRoutesState).catch(console.error)
  listAudioApps().then(setApps).catch(console.error)
  getAppCategories().then(setAppCategoriesState).catch(console.error)
  }, [])

  useEffect(() => {
    // Lightweight polling to catch newly created audio sessions (e.g., apps opened after launch)
    const id = setInterval(() => {
      listAudioApps().then(setApps).catch(() => {})
    }, 4000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    // Auto-update check on startup (disabled in dev to avoid permission issues)
    if (import.meta.env.PROD) {
      (async () => {
        try {
          const update = await checkUpdate()
          if (update) {
            setUpdateInfo({ version: update.version, notes: update.body, available: true })
          }
        } catch (e) {
          console.warn('Update check failed', e)
        }
      })()
    }
  }, [])

  const outputDevices = useMemo(() => devices.filter((d: DeviceInfo) => d.kind === 'output'), [devices])

  const onVolume = async (stream: StreamId, v: number) => {
    setVolumes((prev: Record<StreamId, number>) => ({ ...prev, [stream]: v }))
    try { await setStreamVolume(stream, v) } catch {}
  }

  const onRoute = async (stream: StreamId, deviceId: string | null) => {
    const ok = await setRoute(stream, deviceId)
    if (ok) setRoutesState((prev: Record<StreamId, string | null>) => ({ ...prev, [stream]: deviceId }))
  }

  const onAssign = async (pid: number, value: '' | StreamId) => {
    try {
      if (value === '') {
        const ok = await clearAppCategory(pid)
        if (ok) setAppCategoriesState(prev => { const n = { ...prev }; delete n[pid]; return n })
      } else {
        const ok = await setAppCategory(pid, value)
        if (ok) setAppCategoriesState(prev => ({ ...prev, [pid]: value }))
      }
    } catch (e) { console.error(e) }
  }

  return (
    <div className="min-h-screen p-6">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Audio Mixer</h1>
        <div className="flex items-center gap-2">
          <button className="btn text-xs" onClick={() => {
            // Simple preset example (boost voice volume)
            const nv = { ...volumes, voice: 1.0 }
            setVolumes(nv)
            setStreamVolume('voice', 1.0)
          }}>Preset: Voice</button>
          <span className="text-sm text-slate-400">Windows 10+</span>
        </div>
      </header>

      <div>
        <main className="space-y-4">
          {defaultStreams.map((sid) => (
            <StreamCard key={sid} stream={sid} devices={outputDevices} route={routes[sid]} volume={volumes[sid]} onRoute={onRoute} onVolume={onVolume} />
          ))}

          <section className="panel p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">Apps → Kategorie zuordnen</h3>
              <button className="btn text-xs" onClick={() => { listAudioApps().then(setApps); getAppCategories().then(setAppCategoriesState) }}>Aktualisieren</button>
            </div>
            <div className="space-y-2 max-h-[50vh] overflow-auto pr-1">
              {apps.map(a => {
                const current = appCategories[a.pid] ?? ''
                return (
                  <div key={a.pid} className="flex items-center justify-between bg-slate-800/60 px-3 py-2 rounded-md">
                    <div className="truncate">
                      <div className="text-sm truncate max-w-[40vw]">{a.name}</div>
                      <div className="text-[10px] text-slate-400">PID {a.pid}</div>
                    </div>
                    <select className="bg-slate-900 rounded px-2 py-1 text-sm"
                      value={current}
                      onChange={(e) => onAssign(a.pid, e.target.value as '' | StreamId)}>
                      <option value="">Ohne Kategorie</option>
                      <option value="game">Spiel</option>
                      <option value="voice">Voice</option>
                      <option value="music">Musik</option>
                    </select>
                  </div>
                )
              })}
              {apps.length === 0 && <div className="text-sm text-slate-400">Keine Apps aktiv</div>}
            </div>
          </section>
        </main>
      </div>

      {updateInfo?.available && (
        <UpdateModal version={updateInfo.version} notes={updateInfo.notes} onClose={() => setUpdateInfo(null)} />
      )}
    </div>
  )
}

type StreamCardProps = {
  key?: React.Key
  stream: StreamId
  devices: DeviceInfo[]
  route: string | null
  volume: number
  onRoute: (s: StreamId, id: string | null) => void | Promise<void>
  onVolume: (s: StreamId, v: number) => void | Promise<void>
}

function StreamCard({ stream, devices, route, volume, onRoute, onVolume }: StreamCardProps) {
  const label: Record<StreamId, string> = { game: 'Spiel', voice: 'Voice Chat', music: 'Musik' }
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium">{label[stream]}</h3>
        <div className="flex items-center gap-2">
          <button className="btn text-xs" title="EQ (Stub)">EQ</button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4 items-center">
        <div className="col-span-7">
          <input className="slider" type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => onVolume(stream, Number(e.target.value))} />
        </div>
        <div className="col-span-5">
          <select className="w-full bg-slate-800 rounded-md px-3 py-2" value={route ?? ''} onChange={(e) => onRoute(stream, e.target.value || null)}>
            <option value="">Standardgerät</option>
            {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}

// DnD UI entfernt – Zuordnung erfolgt jetzt über ein Dropdown pro App.

function UpdateModal({ version, notes, onClose }:{ version: string, notes?: string, onClose: () => void }){
  const onInstall = async () => {
    try {
      const update = await checkUpdate()
      if (update) {
        await update.downloadAndInstall()
        // App will auto-restart after installation
      }
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
      <div className="panel p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-2">Update verfügbar: v{version}</h3>
        <div className="text-sm text-slate-300 whitespace-pre-wrap max-h-60 overflow-auto mb-4">{notes ?? 'Eine neue Version ist verfügbar.'}</div>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Später installieren</button>
          <button className="btn bg-brand-700 hover:bg-brand-600" onClick={onInstall}>Jetzt installieren</button>
        </div>
      </div>
    </div>
  )
}
