#![cfg(target_os = "windows")]
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};

// cpal provides cross-platform audio backend detection and device listing; on Windows it uses WASAPI.
use cpal::traits::{DeviceTrait, HostTrait};
use tauri::Manager;

// Windows COM / WASAPI imports for per-app session enumeration and volume control
use windows::core::Interface;
use windows::Win32::Media::Audio::{eMultimedia, eRender, IAudioSessionControl, IAudioSessionControl2, IAudioSessionEnumerator, IAudioSessionManager2, IMMDevice, IMMDeviceEnumerator, MMDeviceEnumerator, ISimpleAudioVolume, IMMDeviceCollection, DEVICE_STATE_ACTIVE};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED};
use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
use windows::Win32::System::ProcessStatus::K32GetProcessImageFileNameW;
use windows::Win32::Foundation::{HANDLE, BOOL, CloseHandle};

#[derive(Debug, Clone, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum DeviceKind {
    Input,
    Output,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
    pub kind: DeviceKind,
    pub is_default: bool,
    pub backend: String,
}

// For simplicity, we define three logical streams. In a real app you would integrate with per-process audio sessions.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq, Hash, Ord, PartialOrd)]
#[serde(rename_all = "snake_case")]
pub enum StreamId { Game, Voice, Music }

type Routes = HashMap<StreamId, Option<String>>; // route to device id

#[tauri::command]
fn list_audio_devices() -> Vec<DeviceInfo> {
    // Enumerate devices via cpal (WASAPI on Windows)
    let host = cpal::default_host();

    let default_output = host.default_output_device().map(|d| d.name().unwrap_or_default());
    let default_output_name = default_output.unwrap_or_default();

    let mut out = Vec::new();

    // To provide unique IDs for React keys and routing selections, we create
    // a stable-in-session identifier of the shape: "<name>::<kind>#<n>".
    use std::collections::hash_map::Entry;
    let mut seen: HashMap<(DeviceKind, String), usize> = HashMap::new();
    if let Ok(devices) = host.devices() {
        for dev in devices {
            let name = dev.name().unwrap_or_else(|_| "Unbekannt".into());
            // Determine kind by probing supported configs
            let is_output = dev.supported_output_configs().is_ok();
            let kind = if is_output { DeviceKind::Output } else { DeviceKind::Input };
            let is_default = is_output && name == default_output_name;
            let key = (kind.clone(), name.clone());
            let idx = match seen.entry(key) {
                Entry::Occupied(mut e) => {
                    *e.get_mut() += 1;
                    *e.get()
                }
                Entry::Vacant(v) => {
                    v.insert(0);
                    0
                }
            };
            let id = format!("{}::{:?}#{}", name, kind, idx);

            out.push(DeviceInfo {
                id,
                name,
                kind,
                is_default,
                backend: "WASAPI".into(),
            });
        }
    }

    out
}

// Persistence helpers (module scope)
#[derive(Debug, Serialize, Deserialize, Default)]
struct PersistedState {
    routes: Routes,
    volumes: HashMap<StreamId, f32>,
    app_categories: HashMap<u32, StreamId>,
}

fn state_file_path() -> std::path::PathBuf {
    let base = dirs_next::config_dir()
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from(".")));
    let dir = base.join("audio-mixer");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("state.json")
}

fn load_state() -> MixerState {
    let path = state_file_path();
    if let Ok(data) = std::fs::read(path) {
        if let Ok(p) = serde_json::from_slice::<PersistedState>(&data) {
            return MixerState { routes: p.routes, volumes: p.volumes, app_categories: p.app_categories };
        }
    }
    MixerState::default()
}

fn save_state_snapshot(state: &std::sync::Mutex<MixerState>) {
    let (routes, volumes, app_categories) = {
        let s = state.lock().unwrap();
        (s.routes.clone(), s.volumes.clone(), s.app_categories.clone())
    };
    let p = PersistedState { routes, volumes, app_categories };
    if let Ok(json) = serde_json::to_vec_pretty(&p) {
        let _ = std::fs::write(state_file_path(), json);
    }
}

// In-memory routing/volume state. For a real app, persist to a file and drive actual audio pipelines.
#[derive(Default)]
struct MixerState {
    routes: Routes,
    volumes: HashMap<StreamId, f32>,
    // Map process id -> assigned logical stream
    app_categories: HashMap<u32, StreamId>,
}

#[tauri::command]
fn get_routes(state: tauri::State<std::sync::Mutex<MixerState>>) -> BTreeMap<StreamId, Option<String>> {
    state
        .lock()
        .unwrap()
        .routes
        .iter()
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect()
}

#[tauri::command]
fn set_route(
    stream: StreamId,
    device_id: Option<String>,
    state: tauri::State<std::sync::Mutex<MixerState>>,
) -> bool {
    state.lock().unwrap().routes.insert(stream, device_id);
    save_state_snapshot(&state);
    true
}

#[derive(Debug, Clone, Serialize)]
pub struct AppSession {
    pub pid: u32,
    pub name: String,
    pub volume: f32,
    pub muted: bool,
}

fn process_name_from_pid(pid: u32) -> Option<String> {
    unsafe {
        let handle: HANDLE = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, BOOL(0), pid).ok()?;
        if handle.is_invalid() { return None; }
        let mut buf = [0u16; 32768];
        let len = K32GetProcessImageFileNameW(handle, &mut buf);
        let _ = CloseHandle(handle);
        if len == 0 { return None; }
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        let name = path.rsplit(['\\', '/']).next().unwrap_or(path.as_str()).to_string();
        Some(name)
    }
}

#[tauri::command]
fn list_audio_apps() -> Result<Vec<AppSession>, String> {
    unsafe {
        let hr = CoInitializeEx(None, COINIT_MULTITHREADED);
        let need_uninit = hr.is_ok();
        let result = (|| -> Result<Vec<AppSession>, String> {
            let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .map_err(|e| format!("Create MMDeviceEnumerator failed: {e}"))?;

            let devices: IMMDeviceCollection = enumerator
                .EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)
                .map_err(|e| format!("EnumAudioEndpoints failed: {e}"))?;
            let dev_count = devices
                .GetCount()
                .map_err(|e| format!("GetCount(devices) failed: {e}"))? as i32;

            let mut out = Vec::new();
            let mut seen: std::collections::HashSet<u32> = std::collections::HashSet::new();

            for di in 0..dev_count {
                let device: IMMDevice = devices
                    .Item(di as u32)
                    .map_err(|e| format!("Get device {di} failed: {e}"))?;

                let mgr: IAudioSessionManager2 = device
                    .Activate::<IAudioSessionManager2>(CLSCTX_ALL, None)
                    .map_err(|e| format!("Activate IAudioSessionManager2 failed: {e}"))?;

                let sessions: IAudioSessionEnumerator = mgr
                    .GetSessionEnumerator()
                    .map_err(|e| format!("GetSessionEnumerator failed: {e}"))?;
                let count = sessions
                    .GetCount()
                    .map_err(|e| format!("GetCount(sessions) failed: {e}"))? as i32;

                for i in 0..count {
                    let ctrl: IAudioSessionControl = sessions
                        .GetSession(i)
                        .map_err(|e| format!("GetSession({i}) failed: {e}"))?;
                    let ctrl2: IAudioSessionControl2 = ctrl
                        .cast()
                        .map_err(|e| format!("Query IAudioSessionControl2 failed: {e}"))?;
                    let pid = ctrl2
                        .GetProcessId()
                        .map_err(|e| format!("GetProcessId failed: {e}"))?;
                    if pid == 0 || seen.contains(&pid) { continue; }

                    let simple: ISimpleAudioVolume = ctrl
                        .cast()
                        .map_err(|e| format!("Query ISimpleAudioVolume failed: {e}"))?;
                    let volume = simple
                        .GetMasterVolume()
                        .map_err(|e| format!("GetMasterVolume failed: {e}"))?;
                    let muted = simple
                        .GetMute()
                        .map_err(|e| format!("GetMute failed: {e}"))?
                        .as_bool();

                    let name = process_name_from_pid(pid).unwrap_or_else(|| format!("PID {pid}"));
                    out.push(AppSession { pid, name, volume, muted });
                    seen.insert(pid);
                }
            }
            Ok(out)
        })();
        if need_uninit { CoUninitialize(); }
        result
    }
}

#[tauri::command]
fn get_app_categories(state: tauri::State<std::sync::Mutex<MixerState>>) -> BTreeMap<u32, StreamId> {
    state
        .lock()
        .unwrap()
        .app_categories
        .iter()
        .map(|(k, v)| (*k, v.clone()))
        .collect()
}

#[tauri::command]
fn set_app_category(
    pid: u32,
    stream: StreamId,
    state: tauri::State<std::sync::Mutex<MixerState>>,
) -> bool {
    state.lock().unwrap().app_categories.insert(pid, stream);
    save_state_snapshot(&state);
    true
}

#[tauri::command]
fn clear_app_category(
    pid: u32,
    state: tauri::State<std::sync::Mutex<MixerState>>,
) -> bool {
    let removed = state.lock().unwrap().app_categories.remove(&pid).is_some();
    if removed { save_state_snapshot(&state); }
    removed
}

#[tauri::command]
fn set_app_volume(pid: u32, volume: f32) -> Result<bool, String> {
    apply_volume_to_pid(pid, volume)
}

// Hilfsfunktion: Volume auf eine spezifische PID anwenden
fn apply_volume_to_pid(pid: u32, volume: f32) -> Result<bool, String> {
    unsafe {
        let hr = CoInitializeEx(None, COINIT_MULTITHREADED);
        let need_uninit = hr.is_ok();
        let result = (|| -> Result<bool, String> {
            let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .map_err(|e| format!("Create MMDeviceEnumerator failed: {e}"))?;
            
            // Durchsuche alle aktiven Ausgabegeräte
            let devices: IMMDeviceCollection = enumerator
                .EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)
                .map_err(|e| format!("EnumAudioEndpoints failed: {e}"))?;
            let dev_count = devices
                .GetCount()
                .map_err(|e| format!("GetCount(devices) failed: {e}"))? as i32;

            for di in 0..dev_count {
                let device: IMMDevice = devices
                    .Item(di as u32)
                    .map_err(|e| format!("Get device {di} failed: {e}"))?;

                let mgr: IAudioSessionManager2 = device
                    .Activate::<IAudioSessionManager2>(CLSCTX_ALL, None)
                    .map_err(|e| format!("Activate IAudioSessionManager2 failed: {e}"))?;

                let sessions: IAudioSessionEnumerator = mgr
                    .GetSessionEnumerator()
                    .map_err(|e| format!("GetSessionEnumerator failed: {e}"))?;
                let count = sessions
                    .GetCount()
                    .map_err(|e| format!("GetCount failed: {e}"))? as i32;

                for i in 0..count {
                    let ctrl: IAudioSessionControl = sessions
                        .GetSession(i)
                        .map_err(|e| format!("GetSession({i}) failed: {e}"))?;
                    let ctrl2: IAudioSessionControl2 = ctrl
                        .cast()
                        .map_err(|e| format!("Query IAudioSessionControl2 failed: {e}"))?;
                    let this_pid = ctrl2
                        .GetProcessId()
                        .map_err(|e| format!("GetProcessId failed: {e}"))?;
                    
                    if this_pid == pid {
                        let simple: ISimpleAudioVolume = ctrl
                            .cast()
                            .map_err(|e| format!("Query ISimpleAudioVolume failed: {e}"))?;
                        simple
                            .SetMasterVolume(volume.clamp(0.0, 1.0), std::ptr::null())
                            .map_err(|e| format!("SetMasterVolume failed: {e}"))?;
                        if need_uninit { CoUninitialize(); }
                        return Ok(true);
                    }
                }
            }
            Ok(false)
        })();
        if need_uninit { CoUninitialize(); }
        result
    }
}

#[tauri::command]
fn set_stream_volume(
    stream: StreamId,
    volume: f32,
    state: tauri::State<std::sync::Mutex<MixerState>>,
) -> bool {
    let vol = volume.clamp(0.0, 1.0);
    
    // Speichere den neuen Volume-Wert für den Stream
    let pids_to_update: Vec<u32> = {
        let mut s = state.lock().unwrap();
        s.volumes.insert(stream.clone(), vol);
        
        // Finde alle PIDs, die diesem Stream zugeordnet sind
        s.app_categories
            .iter()
            .filter(|(_, assigned_stream)| **assigned_stream == stream)
            .map(|(pid, _)| *pid)
            .collect()
    };
    
    // Wende die Lautstärke auf alle zugeordneten Apps an
    for pid in pids_to_update {
        let _ = apply_volume_to_pid(pid, vol); // Ignoriere Fehler (App könnte beendet sein)
    }
    
    save_state_snapshot(&state);
    true
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            #[cfg(debug_assertions)]
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.open_devtools();
            }
            Ok(())
        })
        .manage(std::sync::Mutex::new(load_state()))
        .invoke_handler(tauri::generate_handler![
            list_audio_devices,
            get_routes,
            set_route,
            set_stream_volume,
            list_audio_apps,
            get_app_categories,
            set_app_category,
            clear_app_category,
            set_app_volume
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
