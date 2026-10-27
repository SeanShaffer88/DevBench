# Changelog

All notable changes to **DevBench** (Modular Windows Software Development Toolkit) are documented in this file.

## [1.4.0] - 2026-10-27

### Added
- **Live Vitest JSON Runner & LCOV / Cobertura XML Coverage Engine** (`server/services/testCoverageService.ts`, `src/modules/TestModule.tsx`):
  - Consent-gated live JSON test execution (`POST /api/test/run-vitest`) returning per-suite and per-assertion results with automatic secret redaction.
  - Multi-format code coverage parser (`POST /api/test/parse-coverage`) supporting both `lcov.info` (`SF:`/`LF:`/`LH:`/`BRF:`/`BRH:`) and Cobertura XML (`<coverage>`/`<class>`/`<line>`).
- **OASIS SARIF 2.1.0 Static Security & Manifest Audit Export** (`server/services/securityScanner.ts`, `src/modules/SecurityModule.tsx`):
  - `GET /api/security/sarif` combining working-tree + Git commit history secret findings with Win32 (`DevBench.app.manifest`) and MSIX (`Package.appxmanifest`) DPI/UAC checks for GitHub Code Scanning & Azure DevOps.
- **OpenAPI 3.0/3.1 & Docker/Podman Compose Validators** (`server/services/specComposeValidator.ts`, `src/modules/ApiDataModule.tsx`):
  - Contract validation and endpoint inspection (`POST /api/specs/validate-openapi`) plus Compose YAML hygiene auditing (`POST /api/specs/validate-compose`) flagging unpinned `:latest` tags, non-loopback `0.0.0.0` port bindings, and inline secret environment variables.
- **Official Release Automation** (`.github/workflows/ci-and-windows-release.yml`):
  - Synchronized `1.4.0` / `1.4.0.0` version resources across `DevBench.rc`, `DevBench.app.manifest`, `Package.appxmanifest`, `DevBench.wxs`, and `DevBench.iss`, and enabled automatic attachment of Windows NSIS & Portable `.exe` artifacts onto tagged GitHub Releases (`v*`).

## [1.3.0] - 2026-10-27

### Added
- **Live V8 Inspector / DAP Bridge & Binary Windows Minidump (`MDMP`) Parser** (`server/services/debugMinidumpService.ts`, `src/modules/DebugModule.tsx`).
- **Multi-Ecosystem Lockfile Dependency Graph & License Policy Gate** (`server/services/lockfileGraphService.ts`, `src/modules/PackagesModule.tsx`) across `package-lock.json`, `Cargo.lock`, `packages.lock.json`, `uv.lock`, and `vcpkg.json`.
- **Permission-Enforced `worker_threads` Plugin Sandbox Runtime** (`server/services/pluginWorkerSandbox.ts`, `src/modules/TeamModule.tsx`) with frozen VM compartments, 48 MB heap cap, 1500 ms hard timeout, and capability broker audit logs.
- **WCAG Resizable Splitters, Multi-File Search-and-Replace with Undo Snapshots & CI E2E Smoke Suite** (`src/App.tsx`, `src/modules/CodeModule.tsx`, `scripts/e2e-smoke.mjs`).

## [1.2.0] - 2026-10-27

### Added
- **15-Stack Project Scaffolder on Disk** (`server/services/projectScaffolder.ts`, `src/modules/ProjectsModule.tsx`) with dry-run tree preview, CRLF Windows manifests, binary `.ico`/`.rc` generation, and consented rollback.
- **Interactive Shell Sessions & Multi-Compiler Clickable Diagnostics** (`shared/diagnosticParser.ts`, `src/components/BottomDock.tsx`).
- **Visual WinUI 3 / WPF `.xaml` Layout Previewer & 6-Tile MSIX PNG Asset Suite** (`src/components/XamlLayoutPreviewer.tsx`, `server/services/icoResourceService.ts`).
- **Consented Git Pre-Commit Gate & Checksummed SQLite Migrations** (`server/services/gitAdapter.ts`, `server/services/sqliteService.ts`).

## [1.1.0] - 2026-10-27

### Added
- Context-isolated Electron desktop shell, WiX v5 MSI (`DevBench.wxs`), Inno Setup 6 (`DevBench.iss`), MSIX `Package.appxmanifest`, binary `DevBench.ico`, PowerShell `-DryRun` workstation bootstrapper, SSE background job streaming, and `/api/ws` WebSocket echo bridge.

## [1.0.0] - 2026-10-27

### Added
- Initial **DevBench** modular workbench architecture: 13 top-level navigation modules (`React.lazy` optional loading), decoupled language/UI/build/package/test/debug catalogs covering 12 first-class desktop stacks + 6 isolated legacy/enterprise plugins, `Ctrl+K` universal command palette, Dark/Light/High-Contrast themes, explicit command consent modal, and secret/PII redaction engine.
