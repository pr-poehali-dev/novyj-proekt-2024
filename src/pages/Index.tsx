import { useState, useRef, useCallback, useEffect } from "react";
import Icon from "@/components/ui/icon";

type ElementType = "text" | "button" | "image" | "shape" | "input" | "card";

interface CanvasElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  color: string;
  bgColor: string;
  fontSize: number;
  borderRadius: number;
  opacity: number;
  bold: boolean;
  italic: boolean;
}

const WIDGETS: { type: ElementType; label: string; icon: string; emoji: string }[] = [
  { type: "text", label: "Текст", icon: "Type", emoji: "T" },
  { type: "button", label: "Кнопка", icon: "MousePointerClick", emoji: "▶" },
  { type: "input", label: "Поле", icon: "TextCursor", emoji: "▭" },
  { type: "card", label: "Карточка", icon: "Square", emoji: "▣" },
  { type: "image", label: "Фото", icon: "Image", emoji: "⬛" },
  { type: "shape", label: "Фигура", icon: "Triangle", emoji: "◆" },
];

const COLORS = [
  "#c8ff00", "#ff2d78", "#00ffcc", "#ff6b35",
  "#7c3aed", "#06b6d4", "#f59e0b", "#ffffff",
  "#ef4444", "#10b981", "#3b82f6", "#000000",
];

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

function makeElement(type: ElementType, x: number, y: number): CanvasElement {
  const defaults: Record<ElementType, Partial<CanvasElement>> = {
    text: { content: "Заголовок", width: 200, height: 50, color: "#ffffff", bgColor: "transparent", fontSize: 28, borderRadius: 0 },
    button: { content: "Нажми меня", width: 160, height: 48, color: "#080810", bgColor: "#c8ff00", fontSize: 15, borderRadius: 8 },
    input: { content: "Введите текст...", width: 220, height: 44, color: "#aaaaaa", bgColor: "#12121f", fontSize: 14, borderRadius: 6 },
    card: { content: "Карточка", width: 200, height: 130, color: "#ffffff", bgColor: "#1a1a2e", fontSize: 16, borderRadius: 12 },
    image: { content: "Изображение", width: 200, height: 140, color: "#555577", bgColor: "#12121f", fontSize: 13, borderRadius: 8 },
    shape: { content: "", width: 100, height: 100, color: "#c8ff00", bgColor: "#c8ff00", fontSize: 14, borderRadius: 50 },
  };
  return {
    id: generateId(),
    type,
    x,
    y,
    width: 200,
    height: 60,
    content: "",
    color: "#ffffff",
    bgColor: "#1a1a2e",
    fontSize: 16,
    borderRadius: 8,
    opacity: 100,
    bold: false,
    italic: false,
    ...defaults[type],
  };
}

function renderElement(el: CanvasElement) {
  const baseStyle: React.CSSProperties = {
    width: el.width,
    height: el.height,
    borderRadius: el.borderRadius,
    opacity: el.opacity / 100,
    fontSize: el.fontSize,
    color: el.color,
    backgroundColor: el.bgColor === "transparent" ? "transparent" : el.bgColor,
    fontWeight: el.bold ? 700 : 400,
    fontStyle: el.italic ? "italic" : "normal",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    fontFamily: "'Golos Text', sans-serif",
    userSelect: "none",
    pointerEvents: "none",
  };

  if (el.type === "text") {
    return <div style={{ ...baseStyle, justifyContent: "flex-start", padding: "4px 8px", fontFamily: "'Oswald', sans-serif" }}>{el.content}</div>;
  }
  if (el.type === "button") {
    return <div style={{ ...baseStyle, cursor: "pointer", border: "none", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", fontFamily: "'Oswald', sans-serif" }}>{el.content}</div>;
  }
  if (el.type === "input") {
    return <div style={{ ...baseStyle, justifyContent: "flex-start", padding: "0 12px", border: "1px solid #2a2a3e" }}>{el.content}</div>;
  }
  if (el.type === "card") {
    return (
      <div style={{ ...baseStyle, flexDirection: "column", alignItems: "flex-start", justifyContent: "flex-end", padding: 16, border: "1px solid #22223b" }}>
        <div style={{ width: "100%", height: 4, background: "#c8ff00", borderRadius: 2, marginBottom: 10 }} />
        <span style={{ fontSize: el.fontSize, fontWeight: 600 }}>{el.content}</span>
      </div>
    );
  }
  if (el.type === "image") {
    return (
      <div style={{ ...baseStyle, flexDirection: "column", gap: 6, border: "1px dashed #2a2a3e" }}>
        <span style={{ fontSize: 32 }}>🖼</span>
        <span style={{ fontSize: 12, color: "#555577" }}>{el.content}</span>
      </div>
    );
  }
  if (el.type === "shape") {
    return <div style={{ ...baseStyle }} />;
  }
  return null;
}

const PANEL_TABS = ["Элементы", "Слои"] as const;
type PanelTab = typeof PANEL_TABS[number];

export default function Index() {
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>("Элементы");
  const [dragging, setDragging] = useState<{ id: string; offX: number; offY: number } | null>(null);
  const [resizing, setResizing] = useState<{ id: string; startX: number; startY: number; startW: number; startH: number } | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const canvasRef = useRef<HTMLDivElement>(null);

  const selectedEl = elements.find((e) => e.id === selected) ?? null;

  function updateElement(id: string, patch: Partial<CanvasElement>) {
    setElements((els) => els.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function deleteElement(id: string) {
    setElements((els) => els.filter((e) => e.id !== id));
    if (selected === id) setSelected(null);
  }

  function duplicateElement(id: string) {
    const el = elements.find((e) => e.id === id);
    if (!el) return;
    const copy = { ...el, id: generateId(), x: el.x + 20, y: el.y + 20 };
    setElements((els) => [...els, copy]);
    setSelected(copy.id);
  }

  function addElement(type: ElementType) {
    const el = makeElement(type, 80 + Math.random() * 200, 60 + Math.random() * 200);
    setElements((els) => [...els, el]);
    setSelected(el.id);
  }

  const onCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const nx = e.clientX - rect.left - dragging.offX;
      const ny = e.clientY - rect.top - dragging.offY;
      updateElement(dragging.id, { x: Math.max(0, nx), y: Math.max(0, ny) });
    }
    if (resizing) {
      const dx = e.clientX - resizing.startX;
      const dy = e.clientY - resizing.startY;
      updateElement(resizing.id, {
        width: Math.max(60, resizing.startW + dx),
        height: Math.max(30, resizing.startH + dy),
      });
    }
  }, [dragging, resizing]);

  const onCanvasMouseUp = useCallback(() => {
    setDragging(null);
    setResizing(null);
  }, []);

  function onElementMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setSelected(id);
    const el = elements.find((el) => el.id === id)!;
    const rect = canvasRef.current!.getBoundingClientRect();
    setDragging({ id, offX: e.clientX - rect.left - el.x, offY: e.clientY - rect.top - el.y });
  }

  function onResizeMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    const el = elements.find((el) => el.id === id)!;
    setResizing({ id, startX: e.clientX, startY: e.clientY, startW: el.width, startH: el.height });
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        const tag = (document.activeElement as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        deleteElement(selected);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selected]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-void-900 font-golos" style={{ fontFamily: "'Golos Text', sans-serif" }}>

      {/* LEFT PANEL */}
      <aside className="w-[220px] flex-shrink-0 flex flex-col border-r border-[#1a1a2e] bg-void-800 animate-slide-left">
        {/* Logo */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[#1a1a2e]">
          <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: "#c8ff00" }}>
            <span style={{ color: "#080810", fontWeight: 900, fontSize: 13, fontFamily: "'Oswald', sans-serif" }}>C</span>
          </div>
          <span style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600, color: "#ffffff", fontSize: 15, letterSpacing: 2 }}>CONSTRUCT</span>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#1a1a2e]">
          {PANEL_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setPanelTab(tab)}
              className="flex-1 py-2.5 text-xs transition-all"
              style={{
                fontFamily: "'Oswald', sans-serif",
                fontWeight: 500,
                letterSpacing: 1,
                color: panelTab === tab ? "#c8ff00" : "#555577",
                borderBottom: panelTab === tab ? "2px solid #c8ff00" : "2px solid transparent",
                background: "transparent",
              }}
            >
              {tab.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-3">
          {panelTab === "Элементы" && (
            <div className="grid grid-cols-2 gap-2">
              {WIDGETS.map((w) => (
                <button
                  key={w.type}
                  onClick={() => addElement(w.type)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all group"
                  style={{
                    background: "#0d0d1a",
                    border: "1px solid #22223b",
                    color: "#888899",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "#c8ff00";
                    (e.currentTarget as HTMLElement).style.color = "#c8ff00";
                    (e.currentTarget as HTMLElement).style.background = "#0d1200";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "#22223b";
                    (e.currentTarget as HTMLElement).style.color = "#888899";
                    (e.currentTarget as HTMLElement).style.background = "#0d0d1a";
                  }}
                >
                  <span style={{ fontSize: 20 }}>{w.emoji}</span>
                  <span style={{ fontSize: 11, fontFamily: "'Oswald', sans-serif", letterSpacing: 1 }}>{w.label.toUpperCase()}</span>
                </button>
              ))}
            </div>
          )}

          {panelTab === "Слои" && (
            <div className="flex flex-col gap-1">
              {elements.length === 0 && (
                <div className="text-center py-8" style={{ color: "#333355", fontSize: 12 }}>
                  Нет элементов
                </div>
              )}
              {[...elements].reverse().map((el) => (
                <button
                  key={el.id}
                  onClick={() => setSelected(el.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-md text-left transition-all"
                  style={{
                    background: selected === el.id ? "#0d1200" : "transparent",
                    border: selected === el.id ? "1px solid #c8ff00" : "1px solid transparent",
                    color: selected === el.id ? "#c8ff00" : "#666688",
                    fontSize: 12,
                  }}
                >
                  <Icon name={WIDGETS.find((w) => w.type === el.type)?.icon ?? "Square"} size={12} fallback="Square" />
                  <span style={{ fontFamily: "'Oswald', sans-serif", letterSpacing: 0.5 }}>
                    {el.type.toUpperCase()} {el.content ? `— ${el.content.slice(0, 10)}` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* CANVAS */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#1a1a2e] bg-void-800">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGrid((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all"
              style={{
                background: showGrid ? "#0d1200" : "#12121f",
                border: `1px solid ${showGrid ? "#c8ff00" : "#22223b"}`,
                color: showGrid ? "#c8ff00" : "#555577",
                fontFamily: "'Oswald', sans-serif",
                letterSpacing: 1,
              }}
            >
              <Icon name="Grid3X3" size={12} fallback="Square" />
              СЕТКА
            </button>
            {selected && (
              <>
                <button
                  onClick={() => selected && duplicateElement(selected)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all"
                  style={{ background: "#12121f", border: "1px solid #22223b", color: "#555577", fontFamily: "'Oswald', sans-serif", letterSpacing: 1 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#00ffcc"; (e.currentTarget as HTMLElement).style.borderColor = "#00ffcc"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#555577"; (e.currentTarget as HTMLElement).style.borderColor = "#22223b"; }}
                >
                  <Icon name="Copy" size={12} fallback="Copy" />
                  КОПИЯ
                </button>
                <button
                  onClick={() => selected && deleteElement(selected)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all"
                  style={{ background: "#12121f", border: "1px solid #22223b", color: "#555577", fontFamily: "'Oswald', sans-serif", letterSpacing: 1 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#ff2d78"; (e.currentTarget as HTMLElement).style.borderColor = "#ff2d78"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#555577"; (e.currentTarget as HTMLElement).style.borderColor = "#22223b"; }}
                >
                  <Icon name="Trash2" size={12} fallback="Trash2" />
                  УДАЛИТЬ
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: "#333355", letterSpacing: 2 }}>
              {elements.length} ЭЛ.
            </span>
            <button
              className="px-4 py-1.5 rounded text-xs font-bold transition-all animate-pulse-neon"
              style={{ background: "#c8ff00", color: "#080810", fontFamily: "'Oswald', sans-serif", letterSpacing: 2 }}
            >
              ОПУБЛИКОВАТЬ
            </button>
          </div>
        </div>

        {/* Canvas Area */}
        <div
          className="flex-1 overflow-auto"
          style={{ background: "#080810" }}
          onClick={() => setSelected(null)}
        >
          <div
            ref={canvasRef}
            className="relative mx-auto my-8"
            style={{
              width: 900,
              height: 600,
              background: "#0d0d1a",
              border: "1px solid #1a1a2e",
              borderRadius: 12,
              backgroundImage: showGrid
                ? `
                  linear-gradient(to right, #1a1a2e 1px, transparent 1px),
                  linear-gradient(to bottom, #1a1a2e 1px, transparent 1px)
                `
                : "none",
              backgroundSize: showGrid ? "40px 40px" : "auto",
              cursor: dragging ? "grabbing" : "default",
              boxShadow: "0 0 80px #c8ff0010, 0 0 0 1px #1a1a2e",
            }}
            onMouseMove={onCanvasMouseMove}
            onMouseUp={onCanvasMouseUp}
            onMouseLeave={onCanvasMouseUp}
          >
            {/* Empty state */}
            {elements.length === 0 && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none"
                style={{ animation: "fade-in 0.6s ease-out" }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 16,
                    background: "#12121f",
                    border: "1px solid #22223b",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span style={{ fontSize: 28 }}>✦</span>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, color: "#333355", letterSpacing: 3 }}>ХОЛСТ ПУСТ</div>
                  <div style={{ fontSize: 12, color: "#222233", marginTop: 6 }}>Добавьте элементы из панели слева</div>
                </div>
              </div>
            )}

            {/* Elements */}
            {elements.map((el) => (
              <div
                key={el.id}
                style={{
                  position: "absolute",
                  left: el.x,
                  top: el.y,
                  cursor: "grab",
                  outline: selected === el.id ? "2px solid #c8ff00" : "2px solid transparent",
                  outlineOffset: 2,
                  borderRadius: el.borderRadius + 2,
                  transition: "outline 0.15s",
                }}
                onMouseDown={(e) => onElementMouseDown(e, el.id)}
              >
                {renderElement(el)}

                {/* Resize handle */}
                {selected === el.id && (
                  <>
                    <div
                      style={{
                        position: "absolute",
                        right: -5,
                        bottom: -5,
                        width: 10,
                        height: 10,
                        background: "#c8ff00",
                        borderRadius: 2,
                        cursor: "se-resize",
                        zIndex: 10,
                      }}
                      onMouseDown={(e) => onResizeMouseDown(e, el.id)}
                    />
                    {/* Corner dots */}
                    {[[-4, -4], [el.width - 4, -4], [-4, el.height - 4]].map(([rx, ry], i) => (
                      <div
                        key={i}
                        style={{
                          position: "absolute",
                          left: rx,
                          top: ry,
                          width: 8,
                          height: 8,
                          background: "#0d0d1a",
                          border: "1.5px solid #c8ff00",
                          borderRadius: 2,
                        }}
                      />
                    ))}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL — Inspector */}
      <aside
        className="w-[240px] flex-shrink-0 flex flex-col border-l border-[#1a1a2e] bg-void-800 overflow-y-auto animate-slide-right"
      >
        <div className="px-5 py-4 border-b border-[#1a1a2e]">
          <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: "#333355", letterSpacing: 3 }}>ИНСПЕКТОР</span>
        </div>

        {!selectedEl ? (
          <div className="flex-1 flex items-center justify-center">
            <div style={{ textAlign: "center", color: "#222233" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>◎</div>
              <div style={{ fontSize: 11, fontFamily: "'Oswald', sans-serif", letterSpacing: 2 }}>НЕТ ВЫДЕЛЕНИЯ</div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1 p-4">
            {/* Type badge */}
            <div className="flex items-center gap-2 mb-3">
              <span
                style={{
                  background: "#0d1200",
                  border: "1px solid #c8ff00",
                  color: "#c8ff00",
                  fontSize: 10,
                  fontFamily: "'Oswald', sans-serif",
                  letterSpacing: 2,
                  padding: "2px 8px",
                  borderRadius: 4,
                }}
              >
                {selectedEl.type.toUpperCase()}
              </span>
            </div>

            {/* Content */}
            {selectedEl.type !== "shape" && (
              <PropSection label="СОДЕРЖИМОЕ">
                <textarea
                  value={selectedEl.content}
                  onChange={(e) => updateElement(selectedEl.id, { content: e.target.value })}
                  rows={2}
                  className="w-full rounded px-3 py-2 text-sm resize-none"
                  style={{
                    background: "#0d0d1a",
                    border: "1px solid #22223b",
                    color: "#ccccee",
                    fontFamily: "'Golos Text', sans-serif",
                    outline: "none",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#c8ff00")}
                  onBlur={(e) => (e.target.style.borderColor = "#22223b")}
                />
              </PropSection>
            )}

            {/* Position & Size */}
            <PropSection label="ПОЗИЦИЯ И РАЗМЕР">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "X", key: "x" as const },
                  { label: "Y", key: "y" as const },
                  { label: "W", key: "width" as const },
                  { label: "H", key: "height" as const },
                ].map(({ label, key }) => (
                  <div key={key}>
                    <div style={{ fontSize: 9, color: "#333355", fontFamily: "'Oswald', sans-serif", letterSpacing: 1, marginBottom: 2 }}>{label}</div>
                    <input
                      type="number"
                      value={Math.round(selectedEl[key] as number)}
                      onChange={(e) => updateElement(selectedEl.id, { [key]: Number(e.target.value) })}
                      className="w-full rounded px-2 py-1.5 text-xs"
                      style={{ background: "#0d0d1a", border: "1px solid #22223b", color: "#ccccee", outline: "none" }}
                      onFocus={(e) => (e.target.style.borderColor = "#c8ff00")}
                      onBlur={(e) => (e.target.style.borderColor = "#22223b")}
                    />
                  </div>
                ))}
              </div>
            </PropSection>

            {/* Typography */}
            <PropSection label="ТИПОГРАФИКА">
              <div className="flex items-center gap-2 mb-2">
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, color: "#333355", fontFamily: "'Oswald', sans-serif", letterSpacing: 1, marginBottom: 2 }}>РАЗМЕР</div>
                  <input
                    type="number"
                    value={selectedEl.fontSize}
                    onChange={(e) => updateElement(selectedEl.id, { fontSize: Number(e.target.value) })}
                    className="w-full rounded px-2 py-1.5 text-xs"
                    style={{ background: "#0d0d1a", border: "1px solid #22223b", color: "#ccccee", outline: "none" }}
                    onFocus={(e) => (e.target.style.borderColor = "#c8ff00")}
                    onBlur={(e) => (e.target.style.borderColor = "#22223b")}
                  />
                </div>
                <div className="flex gap-1 mt-4">
                  <button
                    onClick={() => updateElement(selectedEl.id, { bold: !selectedEl.bold })}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 6,
                      background: selectedEl.bold ? "#0d1200" : "#0d0d1a",
                      border: `1px solid ${selectedEl.bold ? "#c8ff00" : "#22223b"}`,
                      color: selectedEl.bold ? "#c8ff00" : "#555577",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >B</button>
                  <button
                    onClick={() => updateElement(selectedEl.id, { italic: !selectedEl.italic })}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 6,
                      background: selectedEl.italic ? "#0d1200" : "#0d0d1a",
                      border: `1px solid ${selectedEl.italic ? "#c8ff00" : "#22223b"}`,
                      color: selectedEl.italic ? "#c8ff00" : "#555577",
                      fontStyle: "italic",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >I</button>
                </div>
              </div>
            </PropSection>

            {/* Colors */}
            <PropSection label="ЦВЕТ ТЕКСТА">
              <div className="flex flex-wrap gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => updateElement(selectedEl.id, { color: c })}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 4,
                      background: c,
                      border: selectedEl.color === c ? "2px solid #c8ff00" : "2px solid #22223b",
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
            </PropSection>

            <PropSection label="ЦВЕТ ФОНА">
              <div className="flex flex-wrap gap-1.5">
                {["transparent", ...COLORS].map((c) => (
                  <button
                    key={c}
                    onClick={() => updateElement(selectedEl.id, { bgColor: c })}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 4,
                      background: c === "transparent"
                        ? "repeating-conic-gradient(#22223b 0% 25%, transparent 0% 50%) 0 0 / 10px 10px"
                        : c,
                      border: selectedEl.bgColor === c ? "2px solid #c8ff00" : "2px solid #22223b",
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
            </PropSection>

            {/* Border radius */}
            <PropSection label="СКРУГЛЕНИЕ">
              <input
                type="range"
                min={0}
                max={60}
                value={selectedEl.borderRadius}
                onChange={(e) => updateElement(selectedEl.id, { borderRadius: Number(e.target.value) })}
                className="w-full"
                style={{ accentColor: "#c8ff00" }}
              />
              <div style={{ fontSize: 10, color: "#333355", textAlign: "right" }}>{selectedEl.borderRadius}px</div>
            </PropSection>

            {/* Opacity */}
            <PropSection label="ПРОЗРАЧНОСТЬ">
              <input
                type="range"
                min={10}
                max={100}
                value={selectedEl.opacity}
                onChange={(e) => updateElement(selectedEl.id, { opacity: Number(e.target.value) })}
                className="w-full"
                style={{ accentColor: "#00ffcc" }}
              />
              <div style={{ fontSize: 10, color: "#333355", textAlign: "right" }}>{selectedEl.opacity}%</div>
            </PropSection>

            {/* Delete */}
            <button
              onClick={() => deleteElement(selectedEl.id)}
              className="mt-3 w-full py-2 rounded text-xs transition-all"
              style={{
                background: "#160008",
                border: "1px solid #330018",
                color: "#ff2d78",
                fontFamily: "'Oswald', sans-serif",
                letterSpacing: 2,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#220010"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#160008"; }}
            >
              УДАЛИТЬ ЭЛЕМЕНТ
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

function PropSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div style={{ fontSize: 9, color: "#333355", fontFamily: "'Oswald', sans-serif", letterSpacing: 2, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
