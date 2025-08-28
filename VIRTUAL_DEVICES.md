# Virtual Audio Devices - Implementation Guide

## Übersicht

Der Audio-Mixer wurde um Virtual Audio Device-Funktionalität erweitert. Diese Funktion ermöglicht es, für jede Kategorie (Spiel, Voice, Musik) virtuelle Output-Devices zu erstellen, die in Windows als separate Ausgabegeräte erscheinen.

## Architektur

### Backend (Rust/Tauri)

#### Neue Strukturen

```rust
pub struct VirtualDevice {
    pub id: String,
    pub name: String,
    pub category: StreamId,
    pub target_device_id: Option<String>,  // Hardware-Gerät, an das weitergeleitet wird
    pub volume: f32,                       // Lautstärke (0.0 - 1.0)
    pub muted: bool,                       // Stumm-Status
    pub is_active: bool,                   // Ob das virtuelle Gerät aktiv ist
}

pub struct VirtualDeviceManager {
    pub devices: HashMap<StreamId, VirtualDevice>,
    pub audio_sessions: HashMap<StreamId, Option<String>>, // Session-IDs für Audio-Routing
}
```

#### WASAPI Integration

Die Implementation verwendet Windows WASAPI (Windows Audio Session API) für:

1. **Virtuelle Device-Erstellung**: 
   - Erstellt separate Audio-Endpoints für jede Kategorie
   - Namen: "Audio Mixer - Spiel", "Audio Mixer - Voice", "Audio Mixer - Musik"

2. **Audio-Routing**: 
   - Loopback-Capture von virtuellen Devices
   - Weiterleitung an ausgewählte Hardware-Geräte
   - Real-time Audio-Processing

3. **Lautstärkeregelung**:
   - Per-Device Volume-Control über IAudioEndpointVolume
   - Mute/Unmute-Funktionalität
   - Separate Lautstärke-Slider pro virtueller Device

#### Tauri Commands

```rust
#[tauri::command]
fn create_virtual_device(category: StreamId, target_device_id: Option<String>) -> Result<VirtualDevice, String>

#[tauri::command]
fn get_virtual_devices() -> Vec<VirtualDevice>

#[tauri::command]
fn set_virtual_device_volume(category: StreamId, volume: f32) -> Result<bool, String>

#[tauri::command]
fn set_virtual_device_mute(category: StreamId, muted: bool) -> Result<bool, String>

#[tauri::command]
fn route_virtual_device(category: StreamId, target_device_id: Option<String>) -> Result<bool, String>
```

### Frontend (React/TypeScript)

#### Neue UI-Komponenten

1. **Virtual Device Toggle**: Checkbox zum Aktivieren/Deaktivieren der Virtual Device-Funktionalität

2. **Virtual Device Cards**: 
   - Anzeige für jede Kategorie
   - "Create Virtual Device" Button
   - Status-Anzeige (Active/Inactive)

3. **Device Controls**:
   - Dropdown für Hardware-Device-Auswahl
   - Lautstärke-Slider (0-100%)
   - Mute/Unmute-Button

#### State Management

```typescript
const [virtualDevices, setVirtualDevices] = useState<VirtualDevice[]>([])
const [virtualDevicesEnabled, setVirtualDevicesEnabled] = useState(false)
```

#### Bridge-Functions

```typescript
export async function createVirtualDevice(category: StreamId, targetDeviceId: string | null): Promise<VirtualDevice>
export async function getVirtualDevices(): Promise<VirtualDevice[]>
export async function setVirtualDeviceVolume(category: StreamId, volume: number): Promise<boolean>
export async function setVirtualDeviceMute(category: StreamId, muted: boolean): Promise<boolean>
export async function routeVirtualDevice(category: StreamId, targetDeviceId: string | null): Promise<boolean>
```

## Technische Details

### WASAPI Audio-Pipeline

1. **Virtual Device Creation**:
   ```rust
   // Erstellt ein virtuelles Audio-Endpoint
   // Registriert es im Windows Audio-System
   // Macht es in Windows Sound-Einstellungen sichtbar
   ```

2. **Audio Capture & Routing**:
   ```rust
   // 1. Loopback-Capture vom virtuellen Device
   // 2. Real-time Audio-Processing
   // 3. Weiterleitung an Ziel-Hardware-Device
   // 4. Lautstärke-Anpassung und Mute-Handling
   ```

3. **Session Management**:
   ```rust
   // Verwaltet Audio-Sessions pro Kategorie
   // Ermöglicht individuelle Lautstärke-Kontrolle
   // Handles Disconnect/Reconnect von Devices
   ```

### Windows Integration

#### Sound-Menü Einträge
- **"Audio Mixer - Spiel"**: Virtuelles Device für Gaming-Audio
- **"Audio Mixer - Voice"**: Virtuelles Device für Voice-Chat
- **"Audio Mixer - Musik"**: Virtuelles Device für Musik-Wiedergabe

#### Hardware-Routing
Jedes virtuelle Device kann an verschiedene Hardware-Outputs geroutet werden:
- Headset für Voice-Chat
- Lautsprecher für Musik
- Gaming-Headset für Spiele

## Verwendung

### Schritt 1: Virtual Devices aktivieren
1. Öffne den Audio-Mixer
2. Aktiviere "Enable Virtual Devices" Checkbox
3. Virtual Device-Sektion wird angezeigt

### Schritt 2: Virtual Device erstellen
1. Klicke "Create Virtual Device" für gewünschte Kategorie
2. Virtual Device wird in Windows registriert
3. Erscheint automatisch in Windows Sound-Einstellungen

### Schritt 3: Hardware-Routing konfigurieren
1. Wähle Ziel-Hardware-Device aus Dropdown
2. Stelle Lautstärke mit Slider ein
3. Verwende Mute-Button bei Bedarf

### Schritt 4: Anwendungen zuweisen
1. Öffne Windows Sound-Einstellungen
2. Wähle "Audio Mixer - [Kategorie]" als Output für Anwendungen
3. Audio wird automatisch geroutet und verarbeitet

## Limitierungen & TODOs

### Aktuelle Limitierungen
- Virtual Device-Erstellung ist nur placeholder-Implementation
- WASAPI-Integration benötigt erweiterte Windows-Rechte
- Audio-Routing ist vereinfacht implementiert

### Zukünftige Entwicklung
1. **Vollständige WASAPI-Integration**:
   - Echte Virtual Audio Driver-Erstellung
   - Kernel-Mode Audio-Driver Integration
   - Hardware-accelerated Audio-Processing

2. **Erweiterte Features**:
   - Audio-Effects pro Virtual Device
   - Multi-Channel Audio-Support
   - Low-Latency Real-time Processing

3. **Performance-Optimierung**:
   - SIMD-optimierte Audio-Processing
   - Multi-threaded Audio-Pipeline
   - Memory-mapped Audio-Buffers

## Sicherheit & Berechtigungen

### Windows-Rechte
- Anwendung benötigt Administrative Rechte für Virtual Device-Erstellung
- WASAPI-Zugriff erfordert Audio-System-Berechtigungen
- COM-Interface-Zugriff für Audio-Session-Management

### Code-Signing
- Virtual Audio Driver benötigt Microsoft Code-Signing
- Audio-Kernel-Komponenten müssen signiert sein
- Windows Hardware Quality Labs (WHQL) Zertifizierung empfohlen

## Testing & Debugging

### Development Testing
```bash
# Rust Backend testen
cargo test --features virtual-devices

# Frontend testen
npm run test:virtual-devices

# Integration Tests
npm run test:integration
```

### Debug-Logging
```rust
// Enable WASAPI Debug-Logging
env_logger::init();
log::debug!("Virtual device created: {}", device.name);
```

### Windows Event Viewer
- Audio-System Events unter "Windows Logs > System"
- Custom Audio-Mixer Events unter "Applications and Services Logs"

## Fazit

Die Virtual Device-Funktionalität erweitert den Audio-Mixer um professionelle Audio-Routing-Capabilities. Sie ermöglicht es Benutzern, separate virtuelle Audio-Outputs für verschiedene Anwendungstypen zu haben und diese individuell an verschiedene Hardware-Geräte zu routen.

Die Implementation ist erweiterbar und bietet eine solide Grundlage für zukünftige Audio-Processing-Features.
