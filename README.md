# Audio Mixer (Windows, Tauri + React + Rust)

Starterprojekt fr einen Windows Audio Mixer mit moderner UI, inspiriert von SteelSeries Sonar.

Funktionen (Stand: Starter):
- Gerteiliste (WASAPI ber cpal)
- Routing-/Lautstfrkestubs ffr 3 Streams (Game/Voice/Music)
- Moderner React + Tailwind UI
- Auto-Updater via Tauri Updater Plugin (GitHub Releases)

Hinweise im Code kommentieren die wichtigen Stellen:
- `src-tauri/src/main.rs`: Gerteerkennung (cpal/WASAPI), Routing/Volume-State, Updater-Plugin.
- `src/App.tsx`: UI, Stream-Karten, Update-Popup und Installationsfluss.

## Entwickeln
1. Node 18+ und Rust (stable) installieren. Auf Windows auch Visual Studio Build Tools.
2. Abhngigkeiten installieren und Dev starten:

```powershell
# im Projektordner
yarn install # oder: npm install oder pnpm install
yarn dev     # startet Vite + Tauri Dev
```

## Build
```powershell
yarn build
```

## Updater konfigurieren
- Passe in `src-tauri/tauri.conf.json` unter `plugins.updater.endpoints` die URL deines Repos an.
- Signierschlssel/Pubkey gemff Tauri-Doku eintragen.

## Nchste Schritte
- Echte Per-Process-Audio-Sessions (WASAPI Session API) und Routing.
- Gain + EQ (Biquad/IIR) umsetzen.
- Persistenz der Einstellungen.
- Hintergrund-Update-Check periodisch anstofen.
