; Inno Setup 6 Modern Per-Monitor High-DPI Installer Script for DevBench (x64 & ARM64)
#define MyAppName "DevBench"
#define MyAppVersion "1.4.0"
#define MyAppPublisher "DevBench Contributors"
#define MyAppURL "https://github.com/SeanShaffer88/DevBench"
#define MyAppExeName "DevBench.exe"

[Setup]
AppId={{4B91C6D8-7E4A-4B28-91E0-8A54C3D91F02}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible arm64
ArchitecturesInstallIn64BitMode=x64compatible arm64
SetupIconFile=..\DevBench.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
OutputDir=..\..\release
OutputBaseFilename=DevBenchSetup-{#MyAppVersion}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\..\release\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
