# DevBench — Modular Windows Software Development Toolkit

**DevBench** is a modular engineering workbench designed for Windows desktop software developers across any stack. Instead of crowding every tool onto one giant screen, DevBench combines a small, fast core shell with **lazy-loaded modules**, **decoupled language/framework/build/package adapters**, **context-aware project filtering**, and **explicit safety & consent gates**.

---

## Core Design Principles

1. **Decoupled Stack Adapters** — Languages, Desktop UI Frameworks, Build Systems, Package Managers, Test Runners, and Debuggers are modeled independently (`shared/catalog/ecosystems.ts`). A C++ project can pair with `CMake + Ninja + vcpkg + Qt 6` or `MSBuild + NuGet + WinUI 3`; a Rust project can pair with `Cargo + Tauri (WebView2)` or `Cargo + iced/Slint`.
2. **Project-Relevant Tools First** — Every module highlights tools, SDKs, scripts, and checks matching the active project's stack while keeping all other ecosystems searchable via `Ctrl+K` or a single filter toggle.
3. **Lazy Loading & Hideable Modules** — Optional modules load on demand (`React.lazy`) and can be hidden per workspace profile (`Settings > Per-Module Visibility`).
4. **Strict Configuration Separation** —
   - **Personal Preferences** (`localStorage` / `.devbench/local.json`, gitignored): Theme, UI scale, font size, preferred shell, hidden modules.
   - **Team-Shared Config** (`.devbench/team.json`): Commit templates, recommended toolchains, and shared tasks — **quarantined until reviewed and trusted by the developer**.
   - **Per-Project Workspace Data**: Notes, TODOs, bookmarks, and `vault://` secret references (never plaintext secrets).
5. **Explicit User Consent & Reversibility** — Spawning shell commands, installing/removing SDKs, mutating SQLite tables, or bulk-renaming files requires explicit user approval with command preview, working directory, and rollback guidance.
6. **Automatic Secret & PII Redaction** — Built-in secret detection & redaction (`shared/redaction.ts`) scrubs API keys, PATs, PEM keys, connection passwords, and personal user paths from logs, clipboard copies, and diagnostic bundles.
7. **Accessibility & Resilience** — Includes **Fluent Dark**, **Fluent Light**, and **Windows High-Contrast** themes, UI scaling (`85%–125%`), keyboard shortcuts (`Ctrl+K`, `Ctrl+B`, `Ctrl+J`, `Ctrl+/`, `Alt+1..=`), Offline-Only mode, background job progress + cancellation, and local settings backup snapshots.

---

## Language & Desktop Ecosystem Coverage

| Ecosystem | Supported Desktop Workflows & Adapters |
| :--- | :--- |
| **C# / .NET** | `.NET` SDK pinning (`global.json`), `.sln`/`.csproj`, NuGet, MSBuild, `dotnet test`, `vsdbg`, **WinUI 3**, **WPF**, **WinForms**, **.NET MAUI**, **Avalonia** |
| **C and C++** | MSVC (`cl.exe`) & LLVM/Clang, Windows 11 SDK, CMake Presets, MSBuild, Ninja, `vcpkg`, Conan, WinDbg/CDB/LLDB, `.dmp` minidumps, **Qt 6** & Win32 |
| **Visual Basic .NET** | `.vbproj`/`.sln` builds, NuGet, MSTest/NUnit, debugging, High-DPI **WinForms** & **WPF** |
| **F#** | `.fsproj`/`.sln`, `dotnet fsi` scripting, NuGet, testing, debugging, **Avalonia FuncUI** & **WPF** |
| **Rust** | `rustup`/`cargo`, `rustfmt`, `clippy`, `cargo test`, PDB native debugging, **Tauri v2**, **iced**, **egui**, **Slint** |
| **Python** | Interpreter & `.venv` selector, `uv`/`pip`/Poetry, `pytest`, `debugpy`, PyInstaller/Briefcase, **PySide6**, **PyQt6**, **Tkinter**, **wxPython** |
| **Java** | Multi-JDK switcher, Maven & Gradle, JUnit 5, JDWP debugging, `jlink`/`jpackage` MSI, **JavaFX** & **Swing** |
| **Kotlin** | Kotlin/JVM & Gradle catalogs, JUnit, JDWP, **Compose Multiplatform for Desktop** (`packageMsi`) |
| **JavaScript / TypeScript** | Node.js (`fnm`/`nvm-windows`), `npm`/`pnpm`/`yarn`, TypeScript, Vitest, V8 Inspector, **Electron**, **Tauri**, **WebView2** |
| **Dart** | Dart SDK & `pub`, **Flutter Windows Desktop** (`flutter build windows`), widget tests, `msix` packaging |
| **Go** | Go modules, `go test`, `pprof`, `GOOS=windows` (`x64`/`ARM64`) builds, Delve, **Wails** & **Fyne** |
| **Swift** | Swift on Windows toolchain & SwiftPM/CMake workflows, `swift-winui`, plus remote-build bridge guidance when Apple targets are needed |
| **Plugin / Legacy** | Permissioned isolated plugin adapters for **Delphi / Object Pascal**, **PowerShell Desktop**, **Ruby**, **PHP**, **Lua**, **Haskell**, **Julia**, and custom `devbench.adapter.json` enterprise toolchains |

---

## Top-Level Workbench Navigation

`Home · Projects · Code · Build & Run · Test · Debug · Git · Packages · APIs & Data · Windows Tools · Security · Team · Settings`

---

## Getting Started

### 1. Run Live Workbench (Web / Edge / WebView2)

```bash
npm install
npm run dev
```

- Workbench UI: `http://localhost:5173`
- Local Host Adapter API: `http://127.0.0.1:4780` (proxied automatically via `/api`)

### 2. Run Verification & Build Suite

```bash
npm test
npm run build
```

### 3. Launch / Package as Native Windows Desktop App (Electron, MSIX, WiX, Inno Setup)

DevBench includes a full suite of Windows desktop packaging, resource, and CI artifacts:
- **Context-Isolated Electron Shell**: `electron/main.cjs` & `electron/preload.cjs` + `electron-builder.yml`
- **Multi-Resolution Binary Icon & Win32 Resources**: `windows/DevBench.ico` (`16×16`, `32×32`, `48×48`, `256×256` RGBA frames) & `windows/DevBench.rc` (`VS_VERSION_INFO`), regenerated via `npm run gen:win-icon`
- **Win32 & MSIX Manifests**: `windows/DevBench.app.manifest` (`PerMonitorV2`, `longPathAware`, `asInvoker`) and `windows/Package.appxmanifest` (`runFullTrust` MSIX Desktop Bridge)
- **MSI & Setup Templates**: `windows/installers/DevBench.wxs` (WiX Toolset v5) & `windows/installers/DevBench.iss` (Inno Setup 6 `x64compatible` + `arm64`)
- **Windows Workstation Bootstrapper**: `scripts/bootstrap-windows.ps1` (`-DryRun` preview by default; `-Apply` for consented `winget` setup)
- **GitHub Actions Windows CI & Release**: `.github/workflows/ci-and-windows-release.yml` validates on both `ubuntu-latest` and `windows-latest` and builds NSIS + Portable `.exe` artifacts on `v*` tags or manual workflow dispatch

```bash
npm run gen:win-icon
npm install --save-dev electron electron-builder
npm run desktop
npm run dist:win
```
