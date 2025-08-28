# Audio Mixer - Advanced Windows Audio Management

Ein fortschrittlicher Audio-Mixer für Windows mit Virtual Cable-Unterstützung, der es ermöglicht, verschiedene Anwendungen automatisch verschiedenen Audio-Ausgabegeräten zuzuweisen.

## 🎯 Features

### Core Funktionalität
- **Audio Stream Management**: Separate Kontrolle für Gaming, Voice Chat und Musik
- **App-Kategorisierung**: Drag & Drop-Zuordnung von Anwendungen zu Kategorien
- **Hardware-Routing**: Flexibles Routing verschiedener Audio-Streams zu verschiedenen Ausgabegeräten
- **Real-time Volume Control**: Individuelle Lautstärke-Kontrolle pro Stream und App

### 🔌 **Virtual Audio Cables** (NEU!)
- **Automatische Virtual Devices**: Jede Kategorie bekommt automatisch ein virtuelles Audio-Device
- **Windows Integration**: Virtual Cables erscheinen als "Audio Mixer - [Kategorie]" in Windows Sound-Einstellungen
- **Hardware-Routing**: Jeder Virtual Cable kann an verschiedene Hardware-Geräte geroutet werden
- **Individual Controls**: Separate Lautstärke und Mute-Kontrolle pro Virtual Cable
- **Custom Categories**: Auch benutzerdefinierte Kategorien bekommen automatisch Virtual Cables

### Standard Virtual Cables
1. **"Audio Mixer - Gaming"** - Für Spiele-Audio
2. **"Audio Mixer - Voice"** - Für Voice-Chat und Kommunikation  
3. **"Audio Mixer - Musik"** - Für Musik-Wiedergabe

### Custom Categories
- **Unbegrenzte Kategorien**: Erstellen Sie eigene Audio-Kategorien
- **Auto-Virtual Cables**: Jede neue Kategorie bekommt automatisch einen Virtual Cable
- **Drag & Drop**: Einfache Zuordnung von Apps zu Custom-Kategorien
- **Persistent**: Kategorien und Zuordnungen überleben Neustarts

## 🚀 Verwendung

### Schnellstart
1. **Anwendung starten**: Audio-Mixer automatisch öffnen
2. **Virtual Cables sind aktiv**: Alle Kategorien haben automatisch Virtual Cables
3. **Apps zuordnen**: Ziehen Sie Apps per Drag & Drop in Kategorien
4. **Hardware konfigurieren**: Wählen Sie für jeden Virtual Cable das Ziel-Hardware-Gerät

### Virtual Cable Workflow
```
App (z.B. Spotify) → "Audio Mixer - Musik" → Lautsprecher
App (z.B. Discord) → "Audio Mixer - Voice" → Headset  
App (z.B. Game)    → "Audio Mixer - Gaming" → Gaming-Headset
```

### Custom Categories erstellen
1. **Neue Kategorie**: Klicken Sie auf "Add Category"
2. **Virtual Cable**: Wird automatisch erstellt als "Audio Mixer - [Ihr Name]"
3. **Apps zuweisen**: Drag & Drop von Apps in die neue Kategorie
4. **Routing**: Konfigurieren Sie das Ziel-Hardware-Gerät

## 💡 Anwendungsszenarien

### Gaming Setup
- **Spiele** → Gaming-Headset (mit Mikrofon)
- **Voice Chat** → Gaming-Headset (gleicher Output)
- **Musik/Videos** → Lautsprecher (im Hintergrund)

### Streaming Setup  
- **Game Audio** → Virtual Cable → OBS (für Stream)
- **Voice Chat** → Headset (nur für Streamer)
- **Music** → Lautsprecher (Hintergrund-Musik)

### Produktivität
- **Work Calls** → Headset
- **Media/Music** → Lautsprecher  
- **Notifications** → Stumm/separates Gerät

### Content Creation
- **Recording Software** → Virtual Cable → Aufnahme-Interface
- **Background Music** → Lautsprecher
- **Communication** → Headset

## 🔧 Technische Details

### Virtual Cable-System
- **WASAPI-Integration**: Nutzt Windows Audio Session API
- **Real-time Routing**: Audio wird in Echtzeit von Virtual Devices zu Hardware geroutet
- **Low Latency**: Optimiert für minimale Audio-Verzögerung
- **Multi-Channel**: Unterstützt Stereo und Multi-Channel Audio

### Persistierung
- **LocalStorage**: Kategorien und Virtual Cable-Einstellungen
- **Auto-Recovery**: Einstellungen werden automatisch beim Start wiederhergestellt
- **Cross-Session**: Virtual Cables bleiben zwischen App-Neustarts aktiv

## 🎛️ UI-Übersicht

### Audio Streams Sektion
Jede Kategorie wird als Stream-Karte angezeigt mit:
- **Standard-Routing**: Direkte Hardware-Auswahl
- **Virtual Cable-Sektion**: 
  - Virtual Device-Status (🟢 Active)
  - Hardware-Routing-Dropdown
  - Virtual Cable-Lautstärke-Slider
  - Mute/Unmute Button

### App Categories Sektion
- **Kategorie-Management**: Hinzufügen, Bearbeiten, Löschen
- **Drag & Drop**: Apps zu Kategorien zuordnen
- **Visual Feedback**: Echtzeit-Updates bei Zuordnungen

## ⚙️ Installation & Setup

### Voraussetzungen
- Windows 10/11
- Administrative Rechte (für Virtual Device-Erstellung)

### Installation
1. Download der neuesten Release von GitHub
2. Installation der .exe/.msi Datei
3. Erste Ausführung mit Administrator-Rechten

### Erste Konfiguration  
1. **Virtual Cables werden automatisch erstellt**
2. **Apps werden automatisch erkannt**
3. **Hardware-Geräte werden automatisch aufgelistet**
4. **Beginnen Sie mit Drag & Drop von Apps**

## 🔄 Auto-Update

Der Audio-Mixer prüft automatisch auf Updates und benachrichtigt Sie über neue Versionen. Updates können direkt aus der Anwendung installiert werden.

## 🛠️ Entwicklung

### Tech Stack
- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Rust + Tauri
- **Audio**: WASAPI (Windows Audio Session API)
- **Build**: Vite + Cargo

### Development Setup
```bash
# Dependencies installieren
npm install

# Development Server starten
npm run tauri dev

# Release Build erstellen
npm run tauri build
```

## 🐛 Troubleshooting

### Virtual Cables erscheinen nicht in Windows
- Starten Sie die App mit Administrator-Rechten
- Prüfen Sie Windows Sound-Einstellungen → Wiedergabegeräte
- Überprüfen Sie Windows Event Viewer für Audio-Fehler

### Apps werden nicht erkannt
- Starten Sie Apps nach der Audio-Mixer-Installation
- Prüfen Sie, ob Apps Audio aktiv nutzen
- Verwenden Sie den "Refresh" Button

### Audio-Probleme
- Überprüfen Sie Virtual Cable-Routing-Einstellungen
- Testen Sie Hardware-Geräte-Verbindungen
- Prüfen Sie Windows Audio-Service-Status

## 📄 Lizenz

MIT License - Siehe LICENSE-Datei für Details.

## 🤝 Contributing

Pull Requests sind willkommen! Für größere Änderungen öffnen Sie bitte zuerst ein Issue.

## 📞 Support

- **GitHub Issues**: Für Bugs und Feature-Requests
- **Discussions**: Für Fragen und Community-Support
