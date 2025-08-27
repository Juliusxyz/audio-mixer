import { invoke } from '@tauri-apps/api/core'

export type DeviceKind = 'input' | 'output'
export type StreamId = 'game' | 'voice' | 'music'

export interface DeviceInfo {
  id: string
  name: string
  kind: DeviceKind
  is_default: boolean
  backend: string
}

export async function getDevices(): Promise<DeviceInfo[]> {
  return await invoke<DeviceInfo[]>('list_audio_devices')
}

export async function getRoutes(): Promise<Record<StreamId, string | null>> {
  return await invoke('get_routes')
}

export async function setRoute(stream: StreamId, device_id: string | null): Promise<boolean> {
  return await invoke('set_route', { stream, deviceId: device_id })
}

export async function setStreamVolume(stream: StreamId, volume: number): Promise<boolean> {
  return await invoke('set_stream_volume', { stream, volume })
}

export interface AppSession {
  pid: number
  name: string
  volume: number
  muted: boolean
}

export async function listAudioApps(): Promise<AppSession[]> {
  return await invoke('list_audio_apps')
}

export async function getAppCategories(): Promise<Record<number, StreamId>> {
  return await invoke('get_app_categories')
}

export async function setAppCategory(pid: number, stream: StreamId): Promise<boolean> {
  return await invoke('set_app_category', { pid, stream })
}

export async function setAppVolume(pid: number, volume: number): Promise<boolean> {
  return await invoke('set_app_volume', { pid, volume })
}

export async function clearAppCategory(pid: number): Promise<boolean> {
  return await invoke('clear_app_category', { pid })
}
