import { useState, useRef, useEffect, useCallback } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";

// ─── Types ──────────────────────────────────────────────────────────────────

type ConvertTarget = "setup.iss" | "autorun.inf" | "web_config.json" | "batch" | "raw";

interface DeskFile {
  id: string;
  file: File;
  target: ConvertTarget;
  status: "idle" | "building" | "done" | "error";
  resultBlob?: Blob;
  resultName?: string;
}

interface Config {
  appName: string;
  authorName: string;
  version: string;
  requireAdmin: boolean;
  desktopShortcut: boolean;
  autoLaunch: boolean;
}

const TARGET_LABELS: Record<ConvertTarget, string> = {
  "setup.iss": "Inno Setup Script (.iss)",
  "autorun.inf": "Автозапуск (autorun.inf)",
  "web_config.json": "Веб-конфиг (JSON)",
  "batch": "Батник сборки (.bat)",
  "raw": "Включить в ZIP как есть",
};

const TARGET_ICONS: Record<ConvertTarget, string> = {
  "setup.iss": "⚙️",
  "autorun.inf": "💿",
  "web_config.json": "🌐",
  "batch": "⚡",
  "raw": "📦",
};

function uid() {
  return Math.random().toString(36).slice(2);
}

// ─── Generators ─────────────────────────────────────────────────────────────

function genIss(cfg: Config, files: DeskFile[]): string {
  const rawFiles = files.filter(f => f.target === "raw");
  const fileSources = rawFiles.length > 0
    ? rawFiles.map(f => `Source: "files\\${f.file.name}"; DestDir: "{app}"; Flags: ignoreversion`).join("\n")
    : `Source: "your_files\\*"; DestDir: "{app}"; Flags: recursesubdirs`;

  return `; Inno Setup Script
; Автор: ${cfg.authorName} | Дата: ${new Date().toLocaleDateString("ru-RU")}

[Setup]
AppName=${cfg.appName}
AppVersion=${cfg.version}
AppPublisher=${cfg.authorName}
DefaultDirName={autopf}\\${cfg.appName}
DefaultGroupName=${cfg.appName}
OutputDir=output
OutputBaseFilename=${cfg.appName.replace(/\s+/g, "_")}_Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
${cfg.requireAdmin ? "PrivilegesRequired=admin" : "PrivilegesRequired=lowest"}
DisableProgramGroupPage=yes
DirExistsWarning=no

[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\\Russian.isl"

[Files]
${fileSources}

[Icons]
Name: "{group}\\${cfg.appName}"; Filename: "{app}\\${cfg.appName}.exe"
${cfg.desktopShortcut ? `Name: "{autodesktop}\\${cfg.appName}"; Filename: "{app}\\${cfg.appName}.exe"; Tasks: desktopicon` : ""}

[Tasks]
${cfg.desktopShortcut ? `Name: "desktopicon"; Description: "Ярлык на рабочем столе"; GroupDescription: "Ярлыки:"; Flags: unchecked` : ""}

[Run]
${cfg.autoLaunch ? `Filename: "{app}\\${cfg.appName}.exe"; Description: "Запустить после установки"; Flags: nowait postinstall skipifsilent` : ""}
`;
}

function genAutorun(cfg: Config): string {
  return `[AutoRun]
open=${cfg.appName.replace(/\s+/g, "_")}_Setup.exe
icon=icon.ico
label=${cfg.appName}
action=Установить ${cfg.appName}
`;
}

function genWebConfig(cfg: Config): string {
  return JSON.stringify({
    app_name: cfg.appName,
    version: cfg.version,
    author: cfg.authorName,
    port: 8080,
    debug: false,
    require_admin: cfg.requireAdmin,
    desktop_shortcut: cfg.desktopShortcut,
    created_at: new Date().toISOString(),
  }, null, 2);
}

function genBatch(cfg: Config): string {
  return `@echo off
chcp 65001 > nul
title Сборка: ${cfg.appName}
echo.
echo  Ищем Inno Setup...
set ISCC=
if exist "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe" set ISCC="C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe"
if exist "C:\\Program Files\\Inno Setup 6\\ISCC.exe" set ISCC="C:\\Program Files\\Inno Setup 6\\ISCC.exe"
if "%ISCC%"=="" (
    echo  Inno Setup не найден. Скачайте: https://jrsoftware.org/isdl.php
    pause & exit /b 1
)
echo  Компилируем setup.iss...
%ISCC% setup.iss
if %errorlevel%==0 (echo  Готово! Файл в папке output\\) else (echo  Ошибка компиляции!)
pause
`;
}

function genReadme(cfg: Config): string {
  return `EDITOR CONSTRUCTOR — ПАКЕТ УСТАНОВЩИКА
========================================
${cfg.appName} v${cfg.version}
Автор: ${cfg.authorName}
Дата: ${new Date().toLocaleDateString("ru-RU")}

КАК СОБРАТЬ .EXE:
1. Установите Inno Setup: https://jrsoftware.org/isdl.php
2. Запустите build.bat — он найдёт Inno Setup автоматически
   ИЛИ откройте setup.iss вручную и нажмите Ctrl+F9

ОФЛАЙН-РЕЖИМ:
Приложение Editor Constructor работает без интернета.
Откройте index.html в браузере или установите как PWA.

© ${cfg.authorName}, ${new Date().getFullYear()}
`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function Index() {
  const [tab, setTab] = useState<"desk" | "config" | "build">("desk");
  const [cfg, setCfg] = useState<Config>({
    appName: "MyEditor",
    authorName: "",
    version: "1.0",
    requireAdmin: true,
    desktopShortcut: true,
    autoLaunch: true,
  });
  const [deskFiles, setDeskFiles] = useState<DeskFile[]>([]);
  const [deskDragging, setDeskDragging] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildProgress, setBuildProgress] = useState(0);
  const [resultZip, setResultZip] = useState<{ blob: Blob; name: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; fileId: string } | null>(null);
  const [offlineReady, setOfflineReady] = useState(false);
  const deskRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Register SW ──
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then(() => {
        setOfflineReady(true);
      }).catch(() => {});
    }
  }, []);

  // ── Paste from clipboard (Ctrl+V) ──
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const newFiles: DeskFile[] = [];
      for (const item of Array.from(items)) {
        const file = item.getAsFile();
        if (file) {
          newFiles.push({ id: uid(), file, target: guessTarget(file.name), status: "idle" });
        }
      }
      if (newFiles.length > 0) {
        setDeskFiles(prev => [...prev, ...newFiles]);
        setTab("desk");
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, []);

  // ── Close context menu on click ──
  useEffect(() => {
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  function guessTarget(name: string): ConvertTarget {
    if (name.endsWith(".exe")) return "setup.iss";
    if (name.endsWith(".inf")) return "autorun.inf";
    if (name.endsWith(".json")) return "web_config.json";
    if (name.endsWith(".bat") || name.endsWith(".cmd")) return "batch";
    return "raw";
  }

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    setDeskFiles(prev => [
      ...prev,
      ...arr.map(f => ({ id: uid(), file: f, target: guessTarget(f.name), status: "idle" as const })),
    ]);
  }

  function removeFile(id: string) {
    setDeskFiles(prev => prev.filter(f => f.id !== id));
    setContextMenu(null);
  }

  function setTarget(id: string, target: ConvertTarget) {
    setDeskFiles(prev => prev.map(f => f.id === id ? { ...f, target } : f));
  }

  function duplicateFile(id: string) {
    const src = deskFiles.find(f => f.id === id);
    if (!src) return;
    setDeskFiles(prev => [...prev, { ...src, id: uid(), status: "idle" }]);
    setContextMenu(null);
  }

  // ── Build pipeline ──
  const buildAll = useCallback(async () => {
    if (deskFiles.length === 0 && !cfg.appName) return;
    setBuilding(true);
    setBuildProgress(0);
    setTab("build");

    const zip = new JSZip();
    const total = deskFiles.length + 4;
    let done = 0;

    const tick = () => { done++; setBuildProgress(Math.round((done / total) * 100)); };

    // Generate by target for each file
    for (const df of deskFiles) {
      setDeskFiles(prev => prev.map(f => f.id === df.id ? { ...f, status: "building" } : f));
      await new Promise(r => setTimeout(r, 120));

      switch (df.target) {
        case "setup.iss":
          zip.file(`setup_${df.file.name.replace(/\.[^.]+$/, "")}.iss`, genIss(cfg, deskFiles));
          break;
        case "autorun.inf":
          zip.file("autorun.inf", genAutorun(cfg));
          break;
        case "web_config.json":
          zip.file("web_config.json", genWebConfig(cfg));
          break;
        case "batch":
          zip.file(`build_${df.file.name.replace(/\.[^.]+$/, "")}.bat`, genBatch(cfg));
          break;
        case "raw":
        default:
          zip.file(`files/${df.file.name}`, df.file);
          break;
      }

      setDeskFiles(prev => prev.map(f => f.id === df.id ? { ...f, status: "done" } : f));
      tick();
    }

    // Always include base scripts
    zip.file("setup.iss", genIss(cfg, deskFiles)); tick();
    zip.file("build.bat", genBatch(cfg)); tick();
    zip.file("README.txt", genReadme(cfg)); tick();
    if (cfg.appName) zip.file("autorun.inf", genAutorun(cfg)); tick();

    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const name = `${cfg.appName.replace(/\s+/g, "_")}_Package_${timestamp}.zip`;
    const blob = await zip.generateAsync({ type: "blob" });
    setResultZip({ blob, name });
    setBuildProgress(100);
    setBuilding(false);
  }, [deskFiles, cfg]);

  const S = styles;

  return (
    <div style={S.root}>
      {/* Header */}
      <header style={S.header}>
        <div style={S.logo}>
          <div style={S.logoIcon}>C</div>
          <span style={S.logoText}>EDITOR CONSTRUCTOR</span>
          <span style={S.badge}>v2.1</span>
          {offlineReady && <span style={{ ...S.badge, background: "#001a00", borderColor: "#00ff8840", color: "#00ff88", marginLeft: 4 }}>OFFLINE ✓</span>}
        </div>
        <p style={S.subtitle}>Конвейер установщиков Windows · Работает без интернета</p>
      </header>

      {/* Tabs */}
      <div style={S.tabs}>
        {([
          { id: "desk", label: "🖥 СТОЛ", count: deskFiles.length },
          { id: "config", label: "⚙️ НАСТРОЙКИ", count: 0 },
          { id: "build", label: "⚡ СБОРКА", count: 0 },
        ] as { id: typeof tab; label: string; count: number }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ ...S.tab, ...(tab === t.id ? S.tabActive : {}) }}>
            {t.label}
            {t.count > 0 && <span style={S.tabBadge}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ── TAB: DESK ── */}
      {tab === "desk" && (
        <div style={S.card}>
          <div style={S.cardHeader}>
            <span style={S.cardTitle}>СТОЛ — ЗОНА ФАЙЛОВ</span>
            <div style={{ display: "flex", gap: 8 }}>
              <Hint text="Ctrl+V — вставить из буфера обмена" />
              <button style={S.btnSm} onClick={() => fileInputRef.current?.click()}>+ Добавить</button>
              <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={e => e.target.files && addFiles(e.target.files)} />
            </div>
          </div>

          {/* Drop zone */}
          <div
            ref={deskRef}
            style={{ ...S.dropZone, ...(deskDragging ? S.dropZoneActive : {}) }}
            onDragOver={e => { e.preventDefault(); setDeskDragging(true); }}
            onDragLeave={() => setDeskDragging(false)}
            onDrop={e => {
              e.preventDefault();
              setDeskDragging(false);
              if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
            }}
          >
            {deskFiles.length === 0 ? (
              <div style={S.dropEmpty}>
                <div style={{ fontSize: 52, marginBottom: 12 }}>🖥</div>
                <div style={S.dropTitle}>ПЕРЕТАЩИТЕ ФАЙЛЫ НА СТОЛ</div>
                <div style={S.dropHint}>или нажмите «+ Добавить» · или Ctrl+V для вставки из буфера</div>
                <div style={{ ...S.dropHint, marginTop: 12, color: "#c8ff0030" }}>
                  .exe → setup.iss · .inf → autorun · .json → web_config · любые → raw
                </div>
              </div>
            ) : (
              <div style={S.fileGrid}>
                {deskFiles.map(df => (
                  <div key={df.id}
                    style={{ ...S.fileCard, ...(df.status === "done" ? S.fileCardDone : df.status === "building" ? S.fileCardBuilding : {}) }}
                    onContextMenu={e => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, fileId: df.id });
                    }}
                  >
                    <div style={S.fileIcon}>{fileIcon(df.file.name)}</div>
                    <div style={S.fileName} title={df.file.name}>{df.file.name}</div>
                    <div style={S.fileSize}>{(df.file.size / 1024).toFixed(1)} KB</div>

                    {/* Target selector */}
                    <div style={{ position: "relative", width: "100%" }}>
                      <select
                        value={df.target}
                        onChange={e => setTarget(df.id, e.target.value as ConvertTarget)}
                        style={S.select}
                      >
                        {(Object.keys(TARGET_LABELS) as ConvertTarget[]).map(k => (
                          <option key={k} value={k}>{TARGET_ICONS[k]} {TARGET_LABELS[k]}</option>
                        ))}
                      </select>
                    </div>

                    {/* Status badge */}
                    {df.status === "done" && <div style={S.statusDone}>✓ Готов</div>}
                    {df.status === "building" && <div style={S.statusBuilding}>⚙ Сборка...</div>}

                    {/* Remove */}
                    <button style={S.removeBtn} onClick={() => removeFile(df.id)}>✕</button>
                  </div>
                ))}

                {/* Add tile */}
                <div style={S.addTile} onClick={() => fileInputRef.current?.click()}>
                  <div style={{ fontSize: 28, color: "#c8ff0040" }}>+</div>
                  <div style={{ fontSize: 10, color: "#333355", fontFamily: "'Oswald', sans-serif", letterSpacing: 1 }}>ДОБАВИТЬ</div>
                </div>
              </div>
            )}
          </div>

          {deskFiles.length > 0 && (
            <div style={S.cardFooter}>
              <span style={{ fontSize: 12, color: "#444466" }}>
                {deskFiles.length} файл(ов) на столе
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={S.btnDanger} onClick={() => setDeskFiles([])}>Очистить стол</button>
                <button style={S.btnPrimary} onClick={buildAll}>
                  ⚡ Запустить конвейер
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: CONFIG ── */}
      {tab === "config" && (
        <div style={S.card}>
          <div style={S.cardHeader}>
            <span style={S.cardTitle}>НАСТРОЙКИ ПРИЛОЖЕНИЯ</span>
          </div>
          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="НАЗВАНИЕ ПРИЛОЖЕНИЯ" required>
              <input value={cfg.appName} onChange={e => setCfg(c => ({ ...c, appName: e.target.value }))}
                placeholder="MyEditor Pro" style={S.input}
                onFocus={e => (e.target.style.borderColor = "#c8ff00")}
                onBlur={e => (e.target.style.borderColor = "#22223b")} />
            </Field>
            <Field label="АВТОР / ПРАВООБЛАДАТЕЛЬ">
              <input value={cfg.authorName} onChange={e => setCfg(c => ({ ...c, authorName: e.target.value }))}
                placeholder="Николаев Владимир Владимирович" style={S.input}
                onFocus={e => (e.target.style.borderColor = "#c8ff00")}
                onBlur={e => (e.target.style.borderColor = "#22223b")} />
            </Field>
            <Field label="ВЕРСИЯ">
              <input value={cfg.version} onChange={e => setCfg(c => ({ ...c, version: e.target.value }))}
                placeholder="1.0" style={{ ...S.input, width: 100 }}
                onFocus={e => (e.target.style.borderColor = "#c8ff00")}
                onBlur={e => (e.target.style.borderColor = "#22223b")} />
            </Field>
            <div style={{ height: 1, background: "#1a1a2e" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {([
                { k: "requireAdmin" as const, label: "Права администратора", desc: "Для системных папок" },
                { k: "desktopShortcut" as const, label: "Ярлык на рабочем столе", desc: "Desktop shortcut" },
                { k: "autoLaunch" as const, label: "Автозапуск после установки", desc: "Run after install" },
              ]).map(({ k, label, desc }) => (
                <label key={k} style={{ ...S.checkCard, ...(cfg[k] ? S.checkCardActive : {}) }}
                  onClick={() => setCfg(c => ({ ...c, [k]: !c[k] }))}>
                  <div style={{ ...S.checkbox, ...(cfg[k] ? S.checkboxActive : {}) }}>
                    {cfg[k] && <span style={{ color: "#080810", fontSize: 10, fontWeight: 900 }}>✓</span>}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: cfg[k] ? "#c8ff00" : "#888899", fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: 10, color: "#333355" }}>{desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div style={S.cardFooter}>
            <span />
            <button style={S.btnPrimary} onClick={() => setTab("desk")}>
              Вернуться к столу →
            </button>
          </div>
        </div>
      )}

      {/* ── TAB: BUILD ── */}
      {tab === "build" && (
        <div style={S.card}>
          <div style={S.cardHeader}>
            <span style={S.cardTitle}>{building ? "КОНВЕЙЕР ЗАПУЩЕН..." : resultZip ? "СБОРКА ЗАВЕРШЕНА" : "КОНВЕЙЕР"}</span>
          </div>
          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Progress bar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#444466", fontFamily: "'Oswald', sans-serif", letterSpacing: 1 }}>
                <span>ПРОГРЕСС</span>
                <span>{buildProgress}%</span>
              </div>
              <div style={{ height: 6, background: "#12121f", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${buildProgress}%`, background: "linear-gradient(to right, #c8ff00, #00ffcc)", borderRadius: 3, transition: "width 0.3s", boxShadow: buildProgress > 0 ? "0 0 10px #c8ff0060" : "none" }} />
              </div>
            </div>

            {/* File pipeline status */}
            {deskFiles.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 10, color: "#444466", fontFamily: "'Oswald', sans-serif", letterSpacing: 2, marginBottom: 4 }}>ОБРАБОТКА ФАЙЛОВ</div>
                {deskFiles.map(df => (
                  <div key={df.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#12121f", borderRadius: 8, border: `1px solid ${df.status === "done" ? "#c8ff0040" : df.status === "building" ? "#00ffcc40" : "#1a1a2e"}` }}>
                    <span style={{ fontSize: 16 }}>{fileIcon(df.file.name)}</span>
                    <span style={{ flex: 1, fontSize: 12, color: "#888899" }}>{df.file.name}</span>
                    <span style={{ fontSize: 10, color: "#555577" }}>{TARGET_ICONS[df.target]} {df.target}</span>
                    <span style={{ fontSize: 12, color: df.status === "done" ? "#c8ff00" : df.status === "building" ? "#00ffcc" : "#333355" }}>
                      {df.status === "done" ? "✓" : df.status === "building" ? "⚙" : "○"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Result */}
            {resultZip && !building && (
              <>
                <div style={{ background: "#0d1200", border: "1px solid #c8ff0040", borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 10, color: "#c8ff00", fontFamily: "'Oswald', sans-serif", letterSpacing: 2, marginBottom: 10 }}>СОДЕРЖИМОЕ ZIP-ПАКЕТА</div>
                  {[
                    { icon: "⚙️", name: "setup.iss", desc: "Inno Setup скрипт" },
                    { icon: "⚡", name: "build.bat", desc: "Батник автосборки" },
                    { icon: "📋", name: "README.txt", desc: "Инструкция" },
                    { icon: "💿", name: "autorun.inf", desc: "Автозапуск" },
                    ...deskFiles.filter(f => f.target === "raw").map(f => ({ icon: "📦", name: `files/${f.file.name}`, desc: "Ваш файл" })),
                    ...deskFiles.filter(f => f.target === "setup.iss").map(f => ({ icon: "⚙️", name: `setup_${f.file.name.replace(/\.[^.]+$/, "")}.iss`, desc: "Доп. скрипт" })),
                    ...deskFiles.filter(f => f.target === "batch").map(f => ({ icon: "⚡", name: `build_${f.file.name.replace(/\.[^.]+$/, "")}.bat`, desc: "Доп. батник" })),
                  ].map((item, i, arr) => (
                    <div key={i} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: i < arr.length - 1 ? "1px solid #1a1a2e" : "none", alignItems: "center" }}>
                      <span style={{ fontSize: 14 }}>{item.icon}</span>
                      <div>
                        <div style={{ fontSize: 11, color: "#c8ff00", fontFamily: "'Oswald', sans-serif" }}>{item.name}</div>
                        <div style={{ fontSize: 10, color: "#333355" }}>{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ background: "#0d0020", border: "1px solid #7c3aed40", borderRadius: 10, padding: 14, borderLeft: "3px solid #7c3aed" }}>
                  <div style={{ fontSize: 10, color: "#7c3aed", fontFamily: "'Oswald', sans-serif", letterSpacing: 2, marginBottom: 8 }}>🪟 КАК СОБРАТЬ .EXE НА WINDOWS</div>
                  {["Установите Inno Setup: jrsoftware.org/isdl.php", "Запустите build.bat — он найдёт компилятор автоматически", "Или откройте setup.iss и нажмите Ctrl+F9"].map((t, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "#888899", marginBottom: 4 }}>
                      <span style={{ color: "#7c3aed", fontWeight: 700 }}>{i + 1}.</span>{t}
                    </div>
                  ))}
                </div>

                <button onClick={() => saveAs(resultZip.blob, resultZip.name)}
                  style={S.btnDownload}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 40px #c8ff0080"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 24px #c8ff0040"; }}>
                  ⬇ СКАЧАТЬ ZIP-ПАКЕТ
                </button>

                <button onClick={() => { setResultZip(null); setBuildProgress(0); setDeskFiles(prev => prev.map(f => ({ ...f, status: "idle" }))); setTab("desk"); }}
                  style={S.btnSecondary}>
                  ВЕРНУТЬСЯ К СТОЛУ
                </button>
              </>
            )}

            {!resultZip && !building && (
              <div style={{ textAlign: "center", padding: 32 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🖥</div>
                <div style={{ fontSize: 13, color: "#444466" }}>Добавьте файлы на стол и запустите конвейер</div>
                <button style={{ ...S.btnPrimary, marginTop: 20 }} onClick={() => setTab("desk")}>
                  Перейти к столу →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div style={{ ...S.ctxMenu, top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}>
          <div style={S.ctxTitle}>ДЕЙСТВИЯ</div>
          {(Object.keys(TARGET_LABELS) as ConvertTarget[]).map(k => (
            <button key={k} style={S.ctxItem} onClick={() => { setTarget(contextMenu.fileId, k); setContextMenu(null); }}>
              {TARGET_ICONS[k]} Преобразовать → {k}
            </button>
          ))}
          <div style={{ height: 1, background: "#1a1a2e", margin: "4px 0" }} />
          <button style={S.ctxItem} onClick={() => duplicateFile(contextMenu.fileId)}>📋 Дублировать</button>
          <button style={{ ...S.ctxItem, color: "#ff4466" }} onClick={() => removeFile(contextMenu.fileId)}>✕ Удалить</button>
        </div>
      )}

      <div style={S.footer}>
        EDITOR CONSTRUCTOR WEB v2.1 · OFFLINE-READY · ПОЕХАЛИ.DEV
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fileIcon(name: string) {
  if (name.endsWith(".exe")) return "⚙️";
  if (name.endsWith(".dll")) return "🔧";
  if (name.endsWith(".inf")) return "💿";
  if (name.endsWith(".json")) return "🌐";
  if (name.endsWith(".bat") || name.endsWith(".cmd")) return "⚡";
  if (name.endsWith(".txt") || name.endsWith(".md")) return "📋";
  if (name.endsWith(".zip") || name.endsWith(".rar")) return "📦";
  if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".ico")) return "🖼";
  return "📄";
}

function Hint({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <div style={{ width: 22, height: 22, borderRadius: "50%", border: "1px solid #22223b", color: "#444466", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, cursor: "help" }}>?</div>
      {show && (
        <div style={{ position: "absolute", top: 28, right: 0, background: "#1a1a2e", border: "1px solid #22223b", borderRadius: 6, padding: "6px 10px", fontSize: 11, color: "#888899", whiteSpace: "nowrap", zIndex: 100 }}>
          {text}
        </div>
      )}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#555577", fontFamily: "'Oswald', sans-serif", letterSpacing: 2, marginBottom: 6 }}>
        {label}{required && <span style={{ color: "#ff2d78" }}> *</span>}
      </div>
      {children}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "32px 16px 48px",
    fontFamily: "'Golos Text', sans-serif",
    background: "#080810",
    backgroundImage: `
      radial-gradient(ellipse 80% 40% at 50% 0%, #0d1a0050 0%, transparent 60%),
      linear-gradient(to right, #12121f 1px, transparent 1px),
      linear-gradient(to bottom, #12121f 1px, transparent 1px)
    `,
    backgroundSize: "auto, 60px 60px, 60px 60px",
  },
  header: { textAlign: "center", marginBottom: 28 },
  logo: { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 6 },
  logoIcon: { width: 40, height: 40, borderRadius: 9, background: "#c8ff00", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Oswald', sans-serif", fontWeight: 900, fontSize: 20, color: "#080810", boxShadow: "0 0 20px #c8ff0050" },
  logoText: { fontFamily: "'Oswald', sans-serif", fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: 4 },
  badge: { background: "#0d1200", border: "1px solid #c8ff0040", color: "#c8ff00", fontSize: 9, fontFamily: "'Oswald', sans-serif", letterSpacing: 2, padding: "2px 7px", borderRadius: 4 },
  subtitle: { color: "#333355", fontSize: 12, letterSpacing: 1, margin: 0 },
  tabs: { display: "flex", gap: 4, marginBottom: 16, background: "#0d0d1a", border: "1px solid #1a1a2e", borderRadius: 10, padding: 4 },
  tab: { padding: "8px 18px", borderRadius: 7, border: "none", background: "transparent", color: "#444466", fontFamily: "'Oswald', sans-serif", fontSize: 11, letterSpacing: 2, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s" },
  tabActive: { background: "#c8ff00", color: "#080810", fontWeight: 700 },
  tabBadge: { background: "#c8ff00", color: "#080810", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 },
  card: { width: "100%", maxWidth: 720, background: "#0d0d1a", border: "1px solid #1a1a2e", borderRadius: 14, overflow: "hidden" },
  cardHeader: { padding: "14px 20px", borderBottom: "1px solid #1a1a2e", display: "flex", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontFamily: "'Oswald', sans-serif", fontSize: 12, color: "#fff", letterSpacing: 2 },
  cardFooter: { padding: "14px 20px", borderTop: "1px solid #1a1a2e", display: "flex", alignItems: "center", justifyContent: "space-between" },
  dropZone: { margin: 16, borderRadius: 10, border: "2px dashed #1a1a2e", minHeight: 280, transition: "all 0.2s", background: "#0a0a14" },
  dropZoneActive: { borderColor: "#c8ff00", background: "#0d1200", boxShadow: "0 0 20px #c8ff0020" },
  dropEmpty: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 280, padding: 32 },
  dropTitle: { fontFamily: "'Oswald', sans-serif", fontSize: 14, color: "#333355", letterSpacing: 3, marginBottom: 8 },
  dropHint: { fontSize: 12, color: "#222244", textAlign: "center" as const },
  fileGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, padding: 16 },
  fileCard: { background: "#12121f", border: "1px solid #1a1a2e", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, position: "relative" as const, cursor: "context-menu", transition: "all 0.2s" },
  fileCardDone: { border: "1px solid #c8ff0040", background: "#0d1200" },
  fileCardBuilding: { border: "1px solid #00ffcc40", background: "#001a1a" },
  fileIcon: { fontSize: 28, marginBottom: 2 },
  fileName: { fontSize: 11, color: "#888899", textAlign: "center" as const, wordBreak: "break-all" as const, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, width: "100%" },
  fileSize: { fontSize: 10, color: "#333355" },
  select: { width: "100%", background: "#0d0d1a", border: "1px solid #22223b", borderRadius: 6, color: "#888899", fontSize: 10, padding: "4px 6px", outline: "none", fontFamily: "'Golos Text', sans-serif", cursor: "pointer" },
  statusDone: { fontSize: 10, color: "#c8ff00", fontFamily: "'Oswald', sans-serif", letterSpacing: 1 },
  statusBuilding: { fontSize: 10, color: "#00ffcc", fontFamily: "'Oswald', sans-serif", letterSpacing: 1 },
  removeBtn: { position: "absolute" as const, top: 6, right: 6, background: "transparent", border: "none", color: "#333355", fontSize: 12, cursor: "pointer", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4 },
  addTile: { background: "#0d0d1a", border: "2px dashed #1a1a2e", borderRadius: 10, minHeight: 120, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer" },
  input: { width: "100%", padding: "9px 12px", background: "#0d0d1a", border: "1px solid #22223b", borderRadius: 8, color: "#ccccee", fontSize: 13, fontFamily: "'Golos Text', sans-serif", outline: "none", transition: "border-color 0.2s", boxSizing: "border-box" as const },
  checkCard: { display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 8, border: "1px solid #1a1a2e", background: "#12121f", cursor: "pointer", transition: "all 0.2s" },
  checkCardActive: { border: "1px solid #c8ff00", background: "#0d1200" },
  checkbox: { width: 16, height: 16, borderRadius: 3, border: "2px solid #333355", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 },
  checkboxActive: { border: "2px solid #c8ff00", background: "#c8ff00" },
  btnSm: { padding: "6px 14px", borderRadius: 7, border: "1px solid #22223b", background: "transparent", color: "#888899", fontFamily: "'Oswald', sans-serif", fontSize: 10, letterSpacing: 1, cursor: "pointer" },
  btnPrimary: { padding: "9px 22px", borderRadius: 8, background: "#c8ff00", color: "#080810", border: "none", fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 2, cursor: "pointer" },
  btnDanger: { padding: "9px 16px", borderRadius: 8, background: "transparent", color: "#ff4466", border: "1px solid #ff446640", fontFamily: "'Oswald', sans-serif", fontSize: 10, letterSpacing: 1, cursor: "pointer" },
  btnSecondary: { width: "100%", padding: "10px 0", borderRadius: 10, background: "transparent", color: "#555577", fontFamily: "'Oswald', sans-serif", fontSize: 11, letterSpacing: 2, border: "1px solid #22223b", cursor: "pointer" },
  btnDownload: { width: "100%", padding: "14px 0", borderRadius: 10, background: "#c8ff00", color: "#080810", fontFamily: "'Oswald', sans-serif", fontSize: 15, fontWeight: 700, letterSpacing: 3, border: "none", cursor: "pointer", boxShadow: "0 0 24px #c8ff0040", transition: "box-shadow 0.2s" },
  ctxMenu: { position: "fixed" as const, background: "#0d0d1a", border: "1px solid #22223b", borderRadius: 8, padding: "6px 0", zIndex: 1000, minWidth: 220, boxShadow: "0 8px 32px #00000080" },
  ctxTitle: { padding: "4px 12px 6px", fontSize: 9, color: "#333355", fontFamily: "'Oswald', sans-serif", letterSpacing: 2 },
  ctxItem: { display: "block", width: "100%", textAlign: "left" as const, padding: "7px 14px", background: "transparent", border: "none", color: "#888899", fontSize: 12, cursor: "pointer", fontFamily: "'Golos Text', sans-serif" },
  footer: { marginTop: 32, color: "#1a1a2e", fontSize: 9, fontFamily: "'Oswald', sans-serif", letterSpacing: 2 },
};
