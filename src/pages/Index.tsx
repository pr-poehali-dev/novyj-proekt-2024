import { useState, useRef } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";

interface Config {
  appName: string;
  authorName: string;
  version: string;
  createAutorun: boolean;
  createWeb: boolean;
  desktopShortcut: boolean;
  requireAdmin: boolean;
  autoLaunch: boolean;
}

type Step = "config" | "files" | "build" | "done";

const STEPS: { id: Step; label: string }[] = [
  { id: "config", label: "Настройки" },
  { id: "files", label: "Файлы" },
  { id: "build", label: "Сборка" },
  { id: "done", label: "Готово" },
];

function generateIss(cfg: Config, fileList: string[]): string {
  const files = fileList.length > 0
    ? fileList.map(f => `Source: "editor_files\\${f}"; DestDir: "{app}"; Flags: ignoreversion`).join("\n")
    : `Source: "your_editor_files\\*"; DestDir: "{app}"; Flags: recursesubdirs`;

  return `; Inno Setup Script — сгенерировано MyEditorConstructor Web
; Автор: ${cfg.authorName}
; Дата: ${new Date().toLocaleDateString("ru-RU")}

[Setup]
AppName=${cfg.appName}
AppVersion=${cfg.version}
AppPublisher=${cfg.authorName}
DefaultDirName={autopf}\\${cfg.appName}
DefaultGroupName=${cfg.appName}
OutputDir=output
OutputBaseFilename=${cfg.appName.replace(/\s+/g, "_")}_AutoInstall
Compression=lzma
SolidCompression=yes
WizardStyle=modern
${cfg.requireAdmin ? "PrivilegesRequired=admin" : "PrivilegesRequired=lowest"}
DisableStartupPrompt=yes
DisableProgramGroupPage=yes
DirExistsWarning=no

[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\\Russian.isl"

[Files]
${files}

[Icons]
Name: "{group}\\${cfg.appName}"; Filename: "{app}\\${cfg.appName}.exe"
${cfg.desktopShortcut ? `Name: "{autodesktop}\\${cfg.appName}"; Filename: "{app}\\${cfg.appName}.exe"; Tasks: desktopicon` : ""}

[Tasks]
${cfg.desktopShortcut ? `Name: "desktopicon"; Description: "Создать ярлык на рабочем столе"; GroupDescription: "Ярлыки:"; Flags: unchecked` : ""}

[Run]
${cfg.autoLaunch ? `Filename: "{app}\\${cfg.appName}.exe"; Description: "Запустить после установки"; Flags: nowait postinstall skipifsilent` : ""}
`;
}

function generateAutorun(cfg: Config): string {
  return `[AutoRun]
open=${cfg.appName.replace(/\s+/g, "_")}_AutoInstall.exe
icon=icon.ico
label=${cfg.appName}
action=Установить ${cfg.appName}
`;
}

function generateWebConfig(cfg: Config): string {
  return JSON.stringify({
    app_name: cfg.appName,
    version: cfg.version,
    author: cfg.authorName,
    port: 8080,
    debug: false,
    auto_install: true,
    require_admin: cfg.requireAdmin,
    desktop_shortcut: cfg.desktopShortcut,
    created_at: new Date().toISOString(),
  }, null, 2);
}

function generateReadme(cfg: Config, fileCount: number): string {
  return `МОЙ КОНСТРУКТОР РЕДАКТОРОВ — АВТОУСТАНОВКА
==========================================
Приложение: ${cfg.appName}
Версия: ${cfg.version}
Автор: ${cfg.authorName}
Дата сборки: ${new Date().toLocaleDateString("ru-RU")}

КАК УСТАНОВИТЬ РЕДАКТОР АВТОМАТИЧЕСКИ:
---------------------------------------
1. Запустите файл ${cfg.appName.replace(/\s+/g, "_")}_AutoInstall.exe
2. Установка начнётся автоматически без лишних действий
3. Программа установится в: C:\\Program Files\\${cfg.appName}
4. После установки появится ярлык в меню «Пуск»
${cfg.desktopShortcut ? "5. Ярлык на рабочем столе — по желанию (галочка при установке)" : ""}

КАК СОБРАТЬ .EXE УСТАНОВЩИК НА WINDOWS:
-----------------------------------------
1. Скачайте Inno Setup: https://jrsoftware.org/isdl.php
2. Откройте файл setup.iss в Inno Setup Compiler
3. Нажмите Build → Compile (Ctrl+F9)
4. Готовый установщик появится в папке output\\

ЧТО ВКЛЮЧЕНО В ПАКЕТ:
----------------------
- setup.iss             — скрипт сборки для Inno Setup
- build.bat             — батник для быстрой сборки
${cfg.createAutorun ? "- autorun.inf           — автозапуск с USB/CD\n" : ""}${cfg.createWeb ? "- web_config.json       — конфигурация веб-сервера\n" : ""}${fileCount > 0 ? `- editor_files/         — ${fileCount} файл(ов) редактора\n` : ""}- README_Установка.txt  — этот файл

СИСТЕМНЫЕ ТРЕБОВАНИЯ:
----------------------
- Windows 7 / 8 / 10 / 11
${cfg.requireAdmin ? "- Права администратора (требуются для установки)" : "- Права администратора не требуются"}

АВТОРСКИЕ ПРАВА:
-----------------
© ${cfg.authorName}, ${new Date().getFullYear()}
Данный редактор является собственностью ${cfg.authorName}.
Использование и распространение допускается только с разрешения автора.
`;
}

function generateBatch(cfg: Config): string {
  return `@echo off
chcp 65001 > nul
title Сборка установщика: ${cfg.appName}
echo.
echo  Установка ${cfg.appName} v${cfg.version}
echo  Автор: ${cfg.authorName}
echo.
echo  Шаг 1: Ищем Inno Setup Compiler...
if exist "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe" (
    set ISCC="C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe"
) else if exist "C:\\Program Files\\Inno Setup 6\\ISCC.exe" (
    set ISCC="C:\\Program Files\\Inno Setup 6\\ISCC.exe"
) else (
    echo  ОШИБКА: Inno Setup не найден!
    echo  Скачайте: https://jrsoftware.org/isdl.php
    pause
    exit /b 1
)
echo  Inno Setup найден.
echo.
echo  Шаг 2: Компиляция setup.iss...
%ISCC% setup.iss
if %errorlevel% == 0 (
    echo.
    echo  ГОТОВО! Установщик создан в папке output\\
) else (
    echo  ОШИБКА при компиляции!
)
echo.
pause
`;
}

export default function Index() {
  const [step, setStep] = useState<Step>("config");
  const [cfg, setCfg] = useState<Config>({
    appName: "",
    authorName: "",
    version: "1.0",
    createAutorun: false,
    createWeb: false,
    desktopShortcut: true,
    requireAdmin: true,
    autoLaunch: true,
  });
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [zipName, setZipName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stepIdx = STEPS.findIndex((s) => s.id === step);

  function updateCfg(patch: Partial<Config>) {
    setCfg((c) => ({ ...c, ...patch }));
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) setUploadedFiles(Array.from(e.target.files));
  }

  async function buildPackage() {
    setStep("build");
    setProgress(0);

    await new Promise((r) => setTimeout(r, 400)); setProgress(20);
    await new Promise((r) => setTimeout(r, 500)); setProgress(50);
    await new Promise((r) => setTimeout(r, 400)); setProgress(75);

    const zip = new JSZip();
    const fileNames = uploadedFiles.map((f) => f.name);

    zip.file("setup.iss", generateIss(cfg, fileNames));
    zip.file("README_Установка.txt", generateReadme(cfg, uploadedFiles.length));
    zip.file("build.bat", generateBatch(cfg));
    if (cfg.createAutorun) zip.file("autorun.inf", generateAutorun(cfg));
    if (cfg.createWeb) zip.file("web_config.json", generateWebConfig(cfg));

    if (uploadedFiles.length > 0) {
      const folder = zip.folder("editor_files")!;
      for (const file of uploadedFiles) folder.file(file.name, file);
    }

    await new Promise((r) => setTimeout(r, 300)); setProgress(90);

    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const name = `${cfg.appName.replace(/\s+/g, "_")}_Package_${timestamp}.zip`;
    setZipName(name);

    const blob = await zip.generateAsync({ type: "blob" });
    setZipUrl(URL.createObjectURL(blob));

    setProgress(100);
    await new Promise((r) => setTimeout(r, 300));
    setStep("done");
  }

  function download() {
    if (zipUrl) saveAs(zipUrl, zipName);
  }

  function reset() {
    setStep("config");
    setCfg({ appName: "", authorName: "", version: "1.0", createAutorun: false, createWeb: false, desktopShortcut: true, requireAdmin: true, autoLaunch: true });
    setUploadedFiles([]);
    setProgress(0);
    setZipUrl(null);
  }

  const canNext = step === "config" ? cfg.appName.trim().length > 0 && cfg.authorName.trim().length > 0 : true;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start py-10 px-4"
      style={{
        fontFamily: "'Golos Text', sans-serif",
        background: "#080810",
        backgroundImage: `
          radial-gradient(ellipse 80% 40% at 50% 0%, #0d1a0060 0%, transparent 60%),
          linear-gradient(to right, #12121f 1px, transparent 1px),
          linear-gradient(to bottom, #12121f 1px, transparent 1px)
        `,
        backgroundSize: "auto, 60px 60px, 60px 60px",
      }}
    >
      {/* Header */}
      <div className="text-center mb-10" style={{ animation: "fadeUp 0.5s ease-out" }}>
        <div className="flex items-center justify-center gap-3 mb-3">
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "#c8ff00", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 24px #c8ff0060" }}>
            <span style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 900, fontSize: 22, color: "#080810" }}>C</span>
          </div>
          <h1 style={{ fontFamily: "'Oswald', sans-serif", fontSize: 26, fontWeight: 700, color: "#ffffff", letterSpacing: 4, margin: 0 }}>
            EDITOR CONSTRUCTOR
          </h1>
          <span style={{ background: "#0d1200", border: "1px solid #c8ff00", color: "#c8ff00", fontSize: 10, fontFamily: "'Oswald', sans-serif", letterSpacing: 2, padding: "3px 8px", borderRadius: 4 }}>
            v2.1 WEB
          </span>
        </div>
        <p style={{ color: "#444466", fontSize: 13, letterSpacing: 1, margin: 0 }}>
          Генерация установщиков для Windows прямо в браузере
        </p>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-0 mb-8">
        {STEPS.map((s, i) => {
          const isActive = s.id === step;
          const isDone = stepIdx > i;
          return (
            <div key={s.id} className="flex items-center">
              <div className="flex flex-col items-center">
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: isDone ? "#c8ff00" : isActive ? "#0d1200" : "#12121f", border: `2px solid ${isDone || isActive ? "#c8ff00" : "#22223b"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: isDone ? "#080810" : isActive ? "#c8ff00" : "#333355", fontFamily: "'Oswald', sans-serif", transition: "all 0.3s" }}>
                  {isDone ? "✓" : i + 1}
                </div>
                <span style={{ fontSize: 9, fontFamily: "'Oswald', sans-serif", letterSpacing: 1, color: isActive ? "#c8ff00" : isDone ? "#666" : "#222233", marginTop: 4 }}>
                  {s.label.toUpperCase()}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ width: 60, height: 1, background: isDone ? "#c8ff0050" : "#1a1a2e", marginBottom: 18 }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Card */}
      <div className="w-full max-w-xl" style={{ background: "#0d0d1a", border: "1px solid #1a1a2e", borderRadius: 16, overflow: "hidden", boxShadow: "0 0 60px #c8ff0008" }}>
        {/* Card header bar */}
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #1a1a2e", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 4, height: 20, background: "#c8ff00", borderRadius: 2 }} />
          <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13, color: "#ffffff", letterSpacing: 2 }}>
            {step === "config" && "ОСНОВНЫЕ НАСТРОЙКИ"}
            {step === "files" && "ФАЙЛЫ РЕДАКТОРА"}
            {step === "build" && "ИДЁТ СБОРКА..."}
            {step === "done" && "ПАКЕТ ГОТОВ"}
          </span>
        </div>

        {/* STEP CONFIG */}
        {step === "config" && (
          <div className="p-6 flex flex-col gap-4">
            <Field label="НАЗВАНИЕ ПРИЛОЖЕНИЯ" required>
              <input value={cfg.appName} onChange={(e) => updateCfg({ appName: e.target.value })} placeholder="MyEditor Pro" style={iStyle}
                onFocus={(e) => (e.target.style.borderColor = "#c8ff00")} onBlur={(e) => (e.target.style.borderColor = "#22223b")} />
            </Field>
            <Field label="ИМЯ АВТОРА / ПРАВООБЛАДАТЕЛЬ" required>
              <input value={cfg.authorName} onChange={(e) => updateCfg({ authorName: e.target.value })} placeholder="Николаев Владимир Владимирович" style={iStyle}
                onFocus={(e) => (e.target.style.borderColor = "#c8ff00")} onBlur={(e) => (e.target.style.borderColor = "#22223b")} />
            </Field>
            <Field label="ВЕРСИЯ">
              <input value={cfg.version} onChange={(e) => updateCfg({ version: e.target.value })} placeholder="1.0" style={{ ...iStyle, width: 120 }}
                onFocus={(e) => (e.target.style.borderColor = "#c8ff00")} onBlur={(e) => (e.target.style.borderColor = "#22223b")} />
            </Field>
            <div style={{ height: 1, background: "#1a1a2e" }} />
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: "createAutorun" as const, label: "autorun.inf", desc: "Автозапуск с USB/CD" },
                { key: "createWeb" as const, label: "web_config.json", desc: "Конфиг веб-сервера" },
                { key: "desktopShortcut" as const, label: "Ярлык на рабочем столе", desc: "Desktop shortcut" },
                { key: "requireAdmin" as const, label: "Права администратора", desc: "Для системных папок" },
                { key: "autoLaunch" as const, label: "Автозапуск после установки", desc: "Run after install" },
              ].map(({ key, label, desc }) => (
                <label key={key} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 8, border: `1px solid ${cfg[key] ? "#c8ff00" : "#1a1a2e"}`, background: cfg[key] ? "#0d1200" : "#12121f", cursor: "pointer", transition: "all 0.2s" }}
                  onClick={() => updateCfg({ [key]: !cfg[key] })}>
                  <div style={{ width: 16, height: 16, borderRadius: 3, border: `2px solid ${cfg[key] ? "#c8ff00" : "#333355"}`, background: cfg[key] ? "#c8ff00" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                    {cfg[key] && <span style={{ color: "#080810", fontSize: 10, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: cfg[key] ? "#c8ff00" : "#888899", fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: 10, color: "#333355", marginTop: 1 }}>{desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* STEP FILES */}
        {step === "files" && (
          <div className="p-6 flex flex-col gap-4">
            <div
              style={{ border: "2px dashed #22223b", borderRadius: 12, padding: "36px 24px", textAlign: "center", cursor: "pointer", transition: "all 0.2s", background: uploadedFiles.length > 0 ? "#0d1200" : "#12121f" }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); setUploadedFiles(Array.from(e.dataTransfer.files)); }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#c8ff00"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#22223b"; }}
            >
              <div style={{ fontSize: 36, marginBottom: 10 }}>📁</div>
              <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13, color: "#888899", letterSpacing: 2 }}>
                {uploadedFiles.length > 0 ? `ДОБАВЛЕНО ${uploadedFiles.length} ФАЙЛОВ` : "ПЕРЕТАЩИТЕ ИЛИ КЛИКНИТЕ"}
              </div>
              <div style={{ fontSize: 11, color: "#333355", marginTop: 4 }}>.exe, .dll, .ini, .cfg и другие файлы редактора</div>
              <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={handleFiles} />
            </div>

            {uploadedFiles.length > 0 && (
              <div className="flex flex-col gap-1 max-h-44 overflow-y-auto">
                {uploadedFiles.map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "#12121f", borderRadius: 6, border: "1px solid #1a1a2e" }}>
                    <span style={{ fontSize: 14 }}>{f.name.endsWith(".exe") ? "⚙️" : f.name.endsWith(".dll") ? "🔧" : "📄"}</span>
                    <span style={{ flex: 1, fontSize: 12, color: "#888899" }}>{f.name}</span>
                    <span style={{ fontSize: 10, color: "#333355" }}>{(f.size / 1024).toFixed(1)} KB</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ padding: "12px 16px", background: "#0d0d1a", border: "1px solid #22223b", borderRadius: 8, borderLeft: "3px solid #00ffcc" }}>
              <div style={{ fontSize: 11, color: "#00ffcc", fontFamily: "'Oswald', sans-serif", letterSpacing: 1, marginBottom: 4 }}>ℹ НЕОБЯЗАТЕЛЬНО</div>
              <div style={{ fontSize: 12, color: "#555577", lineHeight: 1.6 }}>
                Файлы добавятся в ZIP-пакет в папку <span style={{ color: "#c8ff00" }}>editor_files/</span>. Скрипт setup.iss будет автоматически настроен на их подключение.
              </div>
            </div>
          </div>
        )}

        {/* STEP BUILD */}
        {step === "build" && (
          <div className="p-8 flex flex-col items-center gap-6">
            <div style={{ fontSize: 48 }}>⚙️</div>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 16, color: "#c8ff00", letterSpacing: 3 }}>СБОРКА ПАКЕТА...</div>
            <div style={{ width: "100%", height: 6, background: "#12121f", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(to right, #c8ff00, #00ffcc)", borderRadius: 3, transition: "width 0.4s ease", boxShadow: "0 0 12px #c8ff0080" }} />
            </div>
            <div style={{ fontSize: 12, color: "#333355" }}>{progress}%</div>
          </div>
        )}

        {/* STEP DONE */}
        {step === "done" && (
          <div className="p-6 flex flex-col gap-5">
            <div className="text-center">
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#0d1200", border: "2px solid #c8ff00", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 26, boxShadow: "0 0 24px #c8ff0040" }}>✓</div>
              <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, color: "#c8ff00", letterSpacing: 3 }}>ПАКЕТ ГОТОВ</div>
              <div style={{ fontSize: 11, color: "#444466", marginTop: 4 }}>{zipName}</div>
            </div>

            {/* Contents */}
            <div style={{ background: "#12121f", border: "1px solid #1a1a2e", borderRadius: 10, padding: 16 }}>
              <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10, color: "#555577", letterSpacing: 2, marginBottom: 10 }}>СОДЕРЖИМОЕ ZIP-ПАКЕТА</div>
              {[
                { icon: "📄", name: "setup.iss", desc: "Скрипт Inno Setup для сборки .exe" },
                { icon: "⚡", name: "build.bat", desc: "Батник — автоматически находит и запускает Inno Setup" },
                { icon: "📋", name: "README_Установка.txt", desc: "Инструкция по установке" },
                ...(cfg.createAutorun ? [{ icon: "💿", name: "autorun.inf", desc: "Автозапуск с USB/CD" }] : []),
                ...(cfg.createWeb ? [{ icon: "🌐", name: "web_config.json", desc: "Конфигурация веб-сервера" }] : []),
                ...(uploadedFiles.length > 0 ? [{ icon: "📁", name: `editor_files/  (${uploadedFiles.length} файл.)`, desc: "Файлы вашего редактора" }] : []),
              ].map((f, i, arr) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: i < arr.length - 1 ? "1px solid #1a1a2e" : "none" }}>
                  <span style={{ fontSize: 16 }}>{f.icon}</span>
                  <div>
                    <div style={{ fontSize: 12, color: "#c8ff00", fontFamily: "'Oswald', sans-serif" }}>{f.name}</div>
                    <div style={{ fontSize: 10, color: "#333355" }}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Windows guide */}
            <div style={{ background: "#0d0020", border: "1px solid #7c3aed40", borderRadius: 10, padding: 16, borderLeft: "3px solid #7c3aed" }}>
              <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10, color: "#7c3aed", letterSpacing: 2, marginBottom: 8 }}>🪟 КАК СОБРАТЬ .EXE НА WINDOWS</div>
              {[
                "Скачайте Inno Setup: jrsoftware.org/isdl.php",
                "Откройте setup.iss в Inno Setup Compiler",
                "Нажмите Build → Compile (Ctrl+F9)",
                "Или запустите build.bat — он всё сделает сам",
              ].map((text, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 5, fontSize: 12, color: "#888899", alignItems: "flex-start" }}>
                  <span style={{ color: "#7c3aed", fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                  {text}
                </div>
              ))}
            </div>

            <button onClick={download} style={{ width: "100%", padding: "14px 0", borderRadius: 10, background: "#c8ff00", color: "#080810", fontFamily: "'Oswald', sans-serif", fontSize: 15, fontWeight: 700, letterSpacing: 3, border: "none", cursor: "pointer", boxShadow: "0 0 24px #c8ff0040", transition: "box-shadow 0.2s" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 40px #c8ff0080"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 24px #c8ff0040"; }}>
              ⬇ СКАЧАТЬ ZIP-ПАКЕТ
            </button>

            <button onClick={reset} style={{ width: "100%", padding: "10px 0", borderRadius: 10, background: "transparent", color: "#555577", fontFamily: "'Oswald', sans-serif", fontSize: 11, letterSpacing: 2, border: "1px solid #22223b", cursor: "pointer", transition: "color 0.2s" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#ffffff"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#555577"; }}>
              СОЗДАТЬ НОВЫЙ ПАКЕТ
            </button>
          </div>
        )}

        {/* Nav */}
        {step !== "build" && step !== "done" && (
          <div style={{ padding: "14px 24px", borderTop: "1px solid #1a1a2e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={() => setStep(STEPS[stepIdx - 1]?.id ?? "config")} disabled={stepIdx === 0}
              style={{ padding: "8px 20px", borderRadius: 8, background: "transparent", color: stepIdx === 0 ? "#1a1a2e" : "#555577", border: `1px solid ${stepIdx === 0 ? "#1a1a2e" : "#22223b"}`, fontFamily: "'Oswald', sans-serif", fontSize: 11, letterSpacing: 2, cursor: stepIdx === 0 ? "not-allowed" : "pointer" }}>
              ← НАЗАД
            </button>

            {step === "files" ? (
              <button onClick={buildPackage}
                style={{ padding: "10px 28px", borderRadius: 8, background: "#c8ff00", color: "#080810", border: "none", fontFamily: "'Oswald', sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: 2, cursor: "pointer", boxShadow: "0 0 16px #c8ff0040" }}>
                СОБРАТЬ ПАКЕТ ⚡
              </button>
            ) : (
              <button onClick={() => canNext && setStep(STEPS[stepIdx + 1].id)} disabled={!canNext}
                style={{ padding: "10px 28px", borderRadius: 8, background: canNext ? "#c8ff00" : "#12121f", color: canNext ? "#080810" : "#333355", border: `1px solid ${canNext ? "#c8ff00" : "#22223b"}`, fontFamily: "'Oswald', sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: 2, cursor: canNext ? "pointer" : "not-allowed" }}>
                ДАЛЕЕ →
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: 28, color: "#1a1a2e", fontSize: 10, fontFamily: "'Oswald', sans-serif", letterSpacing: 2 }}>
        EDITOR CONSTRUCTOR WEB v2.1 — POWERED BY POEHALI.DEV
      </div>
    </div>
  );
}

const iStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  background: "#0d0d1a",
  border: "1px solid #22223b",
  borderRadius: 8,
  color: "#ccccee",
  fontSize: 14,
  fontFamily: "'Golos Text', sans-serif",
  outline: "none",
  transition: "border-color 0.2s",
};

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#555577", fontFamily: "'Oswald', sans-serif", letterSpacing: 2, marginBottom: 6 }}>
        {label} {required && <span style={{ color: "#ff2d78" }}>*</span>}
      </div>
      {children}
    </div>
  );
}
