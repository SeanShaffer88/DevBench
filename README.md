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
npm run test:smoke
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

### 4. DevBench v1.2 Highlights

- **Real 15-Language Project Scaffolder on Disk** (`server/services/projectScaffolder.ts`, `ProjectsModule.tsx`): Dry-run file-tree preview (`POST /api/projects/scaffold/preview`), consented disk scaffolding (`POST /api/projects/scaffold/execute`), CRLF Win32 & MSIX manifests, binary `assets/app.ico` + `assets/app.rc`, PowerShell `build-windows.ps1`, `.gitignore`/`.gitattributes`, and one-click rollback (`POST /api/projects/scaffolded/delete`).
- **Interactive Shell Sessions & Multi-Compiler Clickable Diagnostics** (`shared/diagnosticParser.ts`, `BottomDock.tsx`): Shell profile + working directory + project env injection with command history (`Up`/`Down`), plus a **Problems** tab parsing clickable `file:line:col` errors from MSBuild/C#/VB/F#, MSVC, TypeScript, Rust, Python, and Go.
- **Visual WinUI 3 / WPF `.xaml` Previewer & MSIX `Assets/` Tile Suite** (`XamlLayoutPreviewer.tsx`, `POST /api/windows/msix-assets`): Live XAML layout preview with Dark Mica / Light Mica / High-Contrast chrome and DPI scaling, plus 6-tile RGBA PNG generation (`Square44x44Logo`, `StoreLogo`, `Square150x150Logo`, `Wide310x150Logo`, `LargeTile310x310Logo`, `SplashScreen`).
- **Consented Git Pre-Commit Gate & Transactional SQLite Workflows** (`gitAdapter.ts`, `sqliteService.ts`): Pre-commit secret & CRLF manifest gate (`POST /api/git/precommit-check`), isolated workspace Git flows (`POST /api/git/workspace-action`), parameterized SQLite row inserts (`POST /api/sqlite/insert-row`), and SHA-256 checksummed transactional migrations (`POST /api/sqlite/apply-migration`).
- **Automated UI, Accessibility & WCAG Contrast Suite** (`tests/ui-a11y.test.tsx`): Verifies ARIA landmarks, lazy-loaded module boundaries, WCAG AA/AAA contrast ratios across Dark/Light/High-Contrast themes, diagnostic parsing, and XAML rendering.

### 5. DevBench v1.3 Highlights

- **Live V8 Inspector / DAP Session Bridge & Binary Windows Minidump (`MDMP`) Parser** (`server/services/debugMinidumpService.ts`, `DebugModule.tsx`): Attaches `node:inspector` (`Runtime.evaluate`) with secret redaction, V8 heap space metrics, and live stack frames (`POST /api/debug/inspector-snapshot`), plus binary Windows `.dmp` stream parsing (`MINIDUMP_HEADER`, `SystemInfoStream`, `ExceptionStream`, `ModuleListStream`) and sample `x64`/`ARM64` `.dmp` synthesis (`POST /api/debug/minidump/sample`, `POST /api/debug/minidump/parse`).
- **Multi-Ecosystem Lockfile Dependency Graph & License Policy Gate** (`server/services/lockfileGraphService.ts`, `PackagesModule.tsx`): Parses `package-lock.json`, `Cargo.lock`, `packages.lock.json` / `*.csproj`, `uv.lock`, and `vcpkg.json` into direct + transitive dependency graphs with configurable strong-copyleft (`GPL`/`AGPL`) and unknown-SPDX policy gates (`POST /api/packages/lockfile-graph`).
- **Permission-Enforced `worker_threads` Plugin Sandbox Runtime** (`server/services/pluginWorkerSandbox.ts`, `TeamModule.tsx`): Executes plugins inside isolated V8 `worker_threads` + frozen `vm.Context` compartments (`48 MB` heap ceiling, `1500 ms` hard timeout) mediated by a capability broker (`ALLOWED`/`DENIED` audit log) with zero direct `fs`/`process` globals (`POST /api/plugins/sandbox-run`).
- **Resizable Splitters, Multi-File Search-and-Replace with Undo Snapshots & CI E2E Smoke Suite** (`App.tsx`, `CodeModule.tsx`, `scripts/e2e-smoke.mjs`): Keyboard- and mouse-accessible (`role="separator"`) Sidebar and BottomDock splitters, dry-run multi-file diff preview (`POST /api/files/replace/preview`) with consent-gated execution and `.devbench/backups/` byte-for-byte undo restore (`POST /api/files/replace/execute`, `POST /api/files/replace/undo`), and full-stack CI E2E smoke testing (`npm run test:smoke`).

### 6. DevBench v1.4 Highlights

- **Consent-Gated Live Vitest JSON Runner & LCOV / Cobertura XML Coverage Analyzer** (`server/services/testCoverageService.ts`, `TestModule.tsx`): Runs Vitest with `--reporter=json` (`POST /api/test/run-vitest`), populates per-assertion timings and redacted failure traces in the Test Explorer, and parses both **LCOV (`lcov.info`)** and **Cobertura XML (`coverage.cobertura.xml`)** line/branch coverage reports (`POST /api/test/parse-coverage`).
- **OASIS SARIF 2.1.0 Security & Windows Manifest Export** (`server/services/securityScanner.ts`, `SecurityModule.tsx`): Exports spec-compliant `sarif-2.1.0.json` reports combining working-tree + Git commit history (`git log -p`) secret scans with Win32 (`DevBench.app.manifest`) and MSIX (`Package.appxmanifest`) security/DPI checks (`GET /api/security/sarif`).
- **OpenAPI 3.0/3.1 & Docker/Podman Compose Validators** (`server/services/specComposeValidator.ts`, `ApiDataModule.tsx`): Validates OpenAPI contracts and operations (`POST /api/specs/validate-openapi`) and audits Docker/Podman Compose services for unpinned `:latest` tags, non-loopback `0.0.0.0` port exposure, and inline secret env values (`POST /api/specs/validate-compose`).

### 7. DevBench v1.5 Highlights (Official Release `v1.5.0`)

- **Cross-Architecture Build & DAP Launch Matrix** (`server/services/buildProfileService.ts`, `BuildRunModule.tsx`): Generates `Debug`, `Release`, `AddressSanitizer`, and `Publish` build/launch profiles across Windows `x64` and `ARM64` (`POST /api/build/launch-matrix`) with one-click export and consent-gated workspace saving of `.vscode/launch.json` and `CMakePresets.json` v6 (`POST /api/build/save-launch-config`).
- **Git Commit Patch / Cherry-Pick Preview & Annotated Tag / Stash-Pop Workflows** (`server/services/gitAdapter.ts`, `GitModule.tsx`): Inspects commit diffs before cherry-picking (`POST /api/git/commit-preview`) and adds consented `stash-pop`, `create-tag`, and `cherry-pick --no-commit` operations inside isolated `workspaces/<slug>` repositories.
- **Standalone Bundled Desktop Backend & Full 4-Key Windows Registry Probing** (`scripts/bundle-server.mjs`, `electron/main.cjs`, `server/services/windowsHostBridge.ts`): Bundles the backend into a self-contained `dist-server/index.mjs` ESM bundle (`ELECTRON_RUN_AS_NODE=1` with `/api/health` readiness polling) so packaged Windows NSIS (`x64` + `ARM64`) and Portable `.exe` installers run with zero external Node/`tsx` dependencies, and probes all 4 developer Registry keys (`LongPathsEnabled`, `AllowDevelopmentWithoutDevLicense`, `WebView2 Evergreen`, `WER LocalDumps`) on live Windows hosts.




