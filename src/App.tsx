import React, { useState, useRef, useEffect } from "react";
import {
  GripVertical,
  LogIn,
  LogOut,
  X,
  Trash2,
  User,
  CalendarRange,
  ChevronDown,
  Tag,
} from "lucide-react";

// ---------- flats & rooms (your real property/room map) ----------
interface Flat {
  key: string;
  label: string;
  rooms: string[];
}

interface Source {
  code: string;
  label: string;
  color: string;
}

interface Room {
  id: string;
  room: string;
  name: string;
  start: string; // ISO yyyy-mm-dd, "" if unassigned
  end: string; // ISO yyyy-mm-dd, "" if unassigned
  source: string; // one of SOURCES[].code, "" if unset
}

type StatusKey =
  | "available"
  | "occupied"
  | "arriving"
  | "departing"
  | "turnover";

interface StatusTheme {
  bg: string;
  border: string;
  badge: string;
  text: string;
  muted: string;
}

interface DragState {
  id: string;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  w: number;
  overId: string | null;
}

const flats: Flat[] = [
  {
    key: "superior-302",
    label: "Superior - 302",
    rooms: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
  },
  {
    key: "superior-301",
    label: "Superior - 301",
    rooms: ["10", "11", "12", "14", "15", "16", "17", "18", "19"],
  },
  {
    key: "deluxe",
    label: "Deluxe",
    rooms: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
  },
  {
    key: "vogue-m2",
    label: "Vouge Inn - M2",
    rooms: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"],
  },
  {
    key: "vogue-m3",
    label: "Vouge Inn - M3",
    rooms: [
      "12",
      "14",
      "15",
      "16",
      "17",
      "18",
      "19",
      "20",
      "21",
      "22",
      "23",
      "24",
    ],
  },
  {
    key: "dsv-m",
    label: "DSV - M",
    rooms: ["1", "2", "3", "4", "5", "6", "7", "8"],
  },
  { key: "dsv-101", label: "DSV - 101", rooms: ["1", "2", "3", "4"] },
];

// ---------- booking sources ----------
const SOURCES: Source[] = [
  { code: "B", label: "Booking.com", color: "#3d7dd8" },
  { code: "A", label: "Agoda", color: "#e0507a" },
  { code: "ABB", label: "Airbnb", color: "#35b0a3" },
  { code: "Exp", label: "Expedia", color: "#f2c14e" },
  { code: "D", label: "Walk-in", color: "#9098ab" },
];
const sourceInfo = (code: string): Source | null =>
  SOURCES.find((s) => s.code === code) || null;

const buildDefaultRooms = (): Room[] =>
  flats.flatMap((f) =>
    f.rooms.map((r) => ({
      id: `${f.key}-${r}`,
      room: r,
      name: "",
      start: "",
      end: "",
      source: "",
    })),
  );

// ---------- status theming ----------
// occupied (plain)  -> white
// available          -> light green
// arriving today      -> light blue
// departing today     -> light red
// turnover today      -> light amber/gold (arrival + departure same day)
const STATUS_THEME: Record<StatusKey, StatusTheme> = {
  available: {
    bg: "#e3f7e9",
    border: "#a9e2ba",
    badge: "#2f9e57",
    text: "#173622",
    muted: "#4d7a5c",
  },
  occupied: {
    bg: "#ffffff",
    border: "#e4e6ea",
    badge: "#5b6472",
    text: "#1c2027",
    muted: "#6b7280",
  },
  arriving: {
    bg: "#dfeafe",
    border: "#a9c9f5",
    badge: "#3667c9",
    text: "#152238",
    muted: "#3f5674",
  },
  departing: {
    bg: "#fbe0e2",
    border: "#f0aeb2",
    badge: "#c1414d",
    text: "#3a1417",
    muted: "#7a4145",
  },
  turnover: {
    bg: "#fbeecb",
    border: "#eecd82",
    badge: "#b3872a",
    text: "#372a0c",
    muted: "#7a6229",
  },
};

const STATUS_LABEL: Record<StatusKey, string> = {
  available: "Available",
  occupied: "Occupied",
  arriving: "Arriving",
  departing: "Departing",
  turnover: "Turnover",
};

const getStatus = (room: Room, todayISO: string): StatusKey => {
  if (!room.name) return "available";
  const arriving = room.start === todayISO;
  const departing = room.end === todayISO;
  if (arriving && departing) return "turnover";
  if (arriving) return "arriving";
  if (departing) return "departing";
  return "occupied";
};

// ---------- date helpers ----------
const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const displayDate = (iso: string) => {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  return `${m}/${d}`;
};
// longer date for the export layout, e.g. "Jul 12"
const displayDateLong = (iso: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const today = new Date();
const todayISO = toISO(today);
const todayLong = today.toLocaleDateString(undefined, {
  weekday: "long",
  month: "short",
  day: "numeric",
});

// html2canvas is loaded dynamically from a CDN; declare a minimal shape for it
type Html2Canvas = (
  el: HTMLElement,
  opts?: Record<string, unknown>,
) => Promise<HTMLCanvasElement>;

declare global {
  interface Window {
    html2canvas?: Html2Canvas;
  }
}

// ---------- html2canvas loader (for PNG export) ----------
let html2canvasPromise: Promise<Html2Canvas> | null = null;
const loadHtml2Canvas = (): Promise<Html2Canvas> => {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  if (html2canvasPromise) return html2canvasPromise;
  html2canvasPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    script.onload = () => resolve(window.html2canvas as Html2Canvas);
    script.onerror = () => reject(new Error("Could not load export library"));
    document.head.appendChild(script);
  });
  return html2canvasPromise;
};

// waits for the two Google Fonts (Fraunces + Inter) to actually be ready so
// the exported PNG never falls back to a system font mid-capture
const waitForFonts = async () => {
  const anyDoc = document as Document & { fonts?: { ready: Promise<unknown> } };
  if (anyDoc.fonts?.ready) {
    try {
      await anyDoc.fonts.ready;
    } catch {
      /* ignore */
    }
  }
  // small extra buffer for slow font swap / layout settle
  await new Promise((r) => setTimeout(r, 120));
};

const RoomOccupancyBoard: React.FC = () => {
  const [rooms, setRooms] = useState<Room[]>(() => buildDefaultRooms());
  const [flat, setFlat] = useState<string>(flats[0].key);
  const [modal, setModal] = useState<Room | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const printRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null); // mirrors `drag` for the pointermove/up listeners

  // load display fonts
  useEffect(() => {
    if (document.getElementById("occ-board-fonts")) return;
    const link = document.createElement("link");
    link.id = "occ-board-fonts";
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&family=Inter:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(link);
  }, []);

  const currentFlat = flats.find((f) => f.key === flat);
  const currentRooms = rooms.filter((r) => r.id.startsWith(flat + "-"));

  const statusCounts = currentRooms.reduce(
    (acc, r) => {
      const s = getStatus(r, todayISO);
      if (s === "available") acc.available += 1;
      else acc.occupiedTotal += 1;
      if (s === "arriving" || s === "turnover") acc.arriving += 1;
      if (s === "departing" || s === "turnover") acc.departing += 1;
      return acc;
    },
    { available: 0, occupiedTotal: 0, arriving: 0, departing: 0 } as {
      available: number;
      occupiedTotal: number;
      arriving: number;
      departing: number;
    },
  );

  // ---------- modal actions ----------
  const openModal = (room: Room) => setModal({ ...room });
  const closeModal = () => setModal(null);

  const saveModal = () => {
    if (!modal) return;
    setRooms((prev) => prev.map((r) => (r.id === modal.id ? { ...modal } : r)));
    closeModal();
  };

  const emptyModal = () => {
    if (!modal) return;
    setRooms((prev) =>
      prev.map((r) =>
        r.id === modal.id
          ? { ...r, name: "", start: "", end: "", source: "" }
          : r,
      ),
    );
    closeModal();
  };

  const canSave =
    !!modal &&
    ((!modal.name && !modal.start && !modal.end) ||
      !!(
        modal.name.trim() &&
        modal.start &&
        modal.end &&
        modal.end >= modal.start
      ));

  // ---------- drag and drop (pointer-based: works on touch + mouse) ----------
  const findRoomIdAtPoint = (
    x: number,
    y: number,
    excludeId: string,
  ): string | null => {
    const el = document.elementFromPoint(x, y);
    const target = el && (el as HTMLElement).closest("[data-room-id]");
    if (!target) return null;
    const id = target.getAttribute("data-room-id");
    return !id || id === excludeId ? null : id;
  };

  const swapRooms = (idA: string, idB: string) => {
    setRooms((prev) => {
      const a = prev.find((r) => r.id === idA);
      const b = prev.find((r) => r.id === idB);
      if (!a || !b) return prev;
      return prev.map((r) => {
        if (r.id === idA)
          return {
            ...r,
            name: b.name,
            start: b.start,
            end: b.end,
            source: b.source,
          };
        if (r.id === idB)
          return {
            ...r,
            name: a.name,
            start: a.start,
            end: a.end,
            source: a.source,
          };
        return r;
      });
    });
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragRef.current) return;
    e.preventDefault();
    const overId = findRoomIdAtPoint(e.clientX, e.clientY, dragRef.current.id);
    const next: DragState = {
      ...dragRef.current,
      x: e.clientX,
      y: e.clientY,
      overId,
    };
    dragRef.current = next;
    setDrag(next);
  };

  const endDrag = () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    document.body.style.userSelect = "";
    const finished = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (finished && finished.overId) swapRooms(finished.id, finished.overId);
  };

  const onPointerUp = () => endDrag();

  const onHandlePointerDown = (e: React.PointerEvent, room: Room) => {
    e.preventDefault();
    e.stopPropagation();
    const cardEl = cardRefs.current[room.id];
    if (!cardEl) return;
    const rect = cardEl.getBoundingClientRect();
    const state: DragState = {
      id: room.id,
      x: e.clientX,
      y: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      w: rect.width,
      overId: null,
    };
    dragRef.current = state;
    setDrag(state);
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  // clean up listeners if the component unmounts mid-drag
  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- PNG export (renders the dedicated print layout, not the live board) ----------
  const handleDownload = async () => {
    if (!printRef.current) return;
    setDownloading(true);
    setDownloadError("");
    try {
      await waitForFonts();
      const html2canvas = await loadHtml2Canvas();
      const canvas = await html2canvas(printRef.current, {
        backgroundColor: "#ffffff",
        scale: 3,
        useCORS: true,
        logging: false,
        windowWidth: printRef.current.scrollWidth,
        windowHeight: printRef.current.scrollHeight,
      });
      const link = document.createElement("a");
      const flatLabel = currentFlat?.label ?? "flat";
      const safeLabel = flatLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      link.download = `${safeLabel}-occupancy-${todayISO}.png`;
      link.href = canvas.toDataURL("image/png", 1.0);
      link.click();
    } catch (err: unknown) {
      setDownloadError("Couldn't export image. Try again.");
    } finally {
      setDownloading(false);
    }
  };

  const occupiedCount = currentRooms.filter((r) => r.name).length;
  const draggedRoom = drag
    ? (rooms.find((r) => r.id === drag.id) ?? null)
    : null;

  // how many print-grid columns to use depending on room count, so cards
  // stay readable instead of shrinking to fit everything in 3 columns
  const printColumns = currentRooms.length > 9 ? 3 : 2;

  return (
    <div className="bg-[#0f1115] text-[#eef0f3] min-h-screen font-['Inter',sans-serif]">
      <div>
        {/* header */}
        <div className="border-b border-[#272b34] px-4 sm:px-6 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[#c9a463] tracking-[0.14em] text-xs font-semibold uppercase mb-1">
              Live Occupancy
            </p>
          </div>

          <div className="flex items-end justify-between gap-3 flex-wrap">
            <h1 className="font-['Fraunces',serif] text-2xl sm:text-3xl font-semibold">
              {currentFlat?.label}
            </h1>
            <div className="text-right">
              <p className="text-sm font-medium">{todayLong}</p>
              <p className="text-[#868b99] text-xs">
                {occupiedCount} occupied · {currentRooms.length - occupiedCount}{" "}
                available
              </p>
            </div>
          </div>
          {downloadError && (
            <p className="text-xs text-[#c1616b] mt-1">{downloadError}</p>
          )}

          {/* flat picker */}
          <div className="mt-4 relative">
            <label className="sr-only" htmlFor="flat-picker">
              Select property
            </label>
            <select
              id="flat-picker"
              value={flat}
              onChange={(e) => setFlat(e.target.value)}
              className="w-full appearance-none rounded-xl px-4 py-3 pr-10 text-sm font-semibold bg-[#1a1d24] border border-[#333844] text-[#eef0f3] focus:outline-none focus:border-[#c9a463]"
            >
              {flats.map((f) => {
                const flatRooms = rooms.filter((r) =>
                  r.id.startsWith(f.key + "-"),
                );
                const occ = flatRooms.filter((r) => r.name).length;
                return (
                  <option key={f.key} value={f.key}>
                    {f.label} — {occ}/{flatRooms.length} occupied
                  </option>
                );
              })}
            </select>
            <ChevronDown
              size={16}
              className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#c9a463]"
            />
          </div>

          {/* status legend */}
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
            {[
              ["available", "Available"],
              ["occupied", "Occupied"],
              ["arriving", "Arriving today"],
              ["departing", "Departing today"],
              ["turnover", "Turnover today"],
            ].map(([key, label]) => (
              <span
                key={key}
                className="flex items-center gap-1.5 text-[11px] text-[#868b99]"
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{
                    background: STATUS_THEME[key as StatusKey].bg,
                    border: `1px solid ${STATUS_THEME[key as StatusKey].border}`,
                  }}
                />
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* grid — auto-rows-fr keeps every card the same height regardless of content */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 sm:p-6 auto-rows-fr">
          {currentRooms.map((room) => {
            const status = getStatus(room, todayISO);
            const theme = STATUS_THEME[status];
            const isDragging = drag?.id === room.id;
            const isOver = drag?.overId === room.id;
            const occupied = !!room.name;
            const src = sourceInfo(room.source);
            const highlighted =
              status === "arriving" ||
              status === "departing" ||
              status === "turnover";

            return (
              <div
                key={room.id}
                data-room-id={room.id}
                ref={(el) => {
                  cardRefs.current[room.id] = el;
                }}
                onClick={() => !drag && openModal(room)}
                style={{
                  background: theme.bg,
                  borderColor: isOver ? "#4c86c7" : theme.border,
                  touchAction: "none",
                }}
                className={`relative h-full rounded-xl p-4 flex flex-col justify-between gap-3 cursor-pointer border
                  ${isOver ? "ring-2 ring-[#4c86c7]" : ""}
                  ${isDragging ? "opacity-35" : "opacity-100"}`}
              >
                {highlighted && (
                  <div
                    className="absolute -top-3 right-3 flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-white"
                    style={{ background: theme.badge }}
                  >
                    {status === "turnover" ? (
                      <>
                        <LogOut size={12} />
                        <LogIn size={12} />
                        Turnover today
                      </>
                    ) : status === "arriving" ? (
                      <>
                        <LogIn size={12} /> Arriving today
                      </>
                    ) : (
                      <>
                        <LogOut size={12} /> Departing today
                      </>
                    )}
                  </div>
                )}

                <div className="flex items-start justify-between">
                  <div>
                    <p
                      className="text-xs font-semibold uppercase tracking-wide"
                      style={{ color: theme.muted }}
                    >
                      Room {room.room}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p
                        className="text-sm font-semibold"
                        style={{ color: theme.text }}
                      >
                        {occupied ? (
                          room.name
                        ) : (
                          <span style={{ color: theme.muted }}>Available</span>
                        )}
                      </p>
                      {occupied && src && (
                        <span
                          title={src.label}
                          className="text-[10px] font-bold leading-none rounded px-1.5 py-1 text-white"
                          style={{ background: src.color }}
                        >
                          {src.code}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onPointerDown={(e) => onHandlePointerDown(e, room)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ touchAction: "none", color: theme.muted }}
                    className="p-1 -mr-1 -mt-1 rounded hover:opacity-70"
                    aria-label="Drag to reassign"
                  >
                    <GripVertical size={16} />
                  </button>
                </div>

                {occupied ? (
                  <div
                    className="flex items-center gap-2 text-xs"
                    style={{ color: theme.muted }}
                  >
                    <CalendarRange size={13} />
                    <span
                      className="font-semibold"
                      style={{
                        color:
                          status === "arriving" || status === "turnover"
                            ? theme.badge
                            : theme.text,
                      }}
                    >
                      {displayDate(room.start)}
                    </span>
                    <span>→</span>
                    <span
                      className="font-semibold"
                      style={{
                        color:
                          status === "departing" || status === "turnover"
                            ? theme.badge
                            : theme.text,
                      }}
                    >
                      {displayDate(room.end)}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs" style={{ color: theme.muted }}>
                    Tap to assign a guest
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* source legend */}
        <div className="px-4 sm:px-6 pb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex items-center gap-1 text-[11px] text-[#868b99]">
            <Tag size={12} /> Source:
          </span>
          {SOURCES.map((s) => (
            <span
              key={s.code}
              className="flex items-center gap-1.5 text-[11px] text-[#868b99]"
            >
              <span
                className="w-6 text-center rounded text-[10px] font-bold text-white leading-none py-0.5"
                style={{ background: s.color }}
              >
                {s.code}
              </span>
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* drag ghost */}
      {drag && draggedRoom && (
        <div
          className="fixed rounded-xl p-4 pointer-events-none z-50 flex flex-col gap-1 bg-[#1a1d24] border border-[#c9a463] shadow-2xl"
          style={{
            left: drag.x - drag.offsetX,
            top: drag.y - drag.offsetY,
            width: drag.w,
            opacity: 0.95,
          }}
        >
          <p className="text-[#868b99] text-xs font-semibold uppercase">
            Room {draggedRoom.room}
          </p>
          <p className="text-sm font-semibold">
            {draggedRoom.name || "Available"}
          </p>
        </div>
      )}

      {/* modal */}
      {modal && (
        <div
          className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/55"
          onClick={closeModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5 flex flex-col gap-4 bg-[#1a1d24] border border-[#272b34]"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[#c9a463] text-xs font-semibold uppercase tracking-wide">
                  Room {modal.room}
                </p>
                <h2 className="font-['Fraunces',serif] text-lg font-semibold">
                  {modal.name ? "Edit guest" : "Assign guest"}
                </h2>
              </div>
              <button
                onClick={closeModal}
                className="text-[#868b99]"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[#868b99] text-xs font-medium flex items-center gap-1">
                <User size={12} /> Guest name
              </span>
              <input
                value={modal.name}
                onChange={(e) => setModal({ ...modal, name: e.target.value })}
                placeholder="Full name"
                className="rounded-lg px-3 py-2 text-sm outline-none bg-[#0f1115] border border-[#272b34] text-[#eef0f3]"
              />
            </label>

            <div className="flex gap-3">
              <label className="flex flex-col gap-1 text-sm flex-1">
                <span className="text-[#868b99] text-xs font-medium">
                  Check-in
                </span>
                <input
                  type="date"
                  value={modal.start}
                  onChange={(e) =>
                    setModal({ ...modal, start: e.target.value })
                  }
                  className="rounded-lg px-3 py-2 text-sm outline-none bg-[#0f1115] border border-[#272b34] text-[#eef0f3]"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm flex-1">
                <span className="text-[#868b99] text-xs font-medium">
                  Check-out
                </span>
                <input
                  type="date"
                  value={modal.end}
                  onChange={(e) => setModal({ ...modal, end: e.target.value })}
                  className="rounded-lg px-3 py-2 text-sm outline-none bg-[#0f1115] border border-[#272b34] text-[#eef0f3]"
                />
              </label>
            </div>

            {modal.start && modal.end && modal.end < modal.start && (
              <p className="text-xs text-[#c1616b]">
                Check-out must be on or after check-in.
              </p>
            )}

            <div className="flex flex-col gap-1.5 text-sm">
              <span className="text-[#868b99] text-xs font-medium flex items-center gap-1">
                <Tag size={12} /> Booking source
              </span>
              <div className="flex flex-wrap gap-1.5">
                {SOURCES.map((s) => {
                  const active = modal.source === s.code;
                  return (
                    <button
                      key={s.code}
                      onClick={() =>
                        setModal({ ...modal, source: active ? "" : s.code })
                      }
                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold border"
                      style={
                        active
                          ? {
                              background: s.color,
                              borderColor: s.color,
                              color: "#0f1115",
                            }
                          : { borderColor: "#272b34", color: "#868b99" }
                      }
                    >
                      {s.code} · {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 mt-1 items-center">
              {modal.name && (
                <button
                  onClick={emptyModal}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium bg-[#c1616b]/15 text-[#c1616b]"
                >
                  <Trash2 size={14} /> Empty room
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={closeModal}
                className="rounded-lg px-3 py-2 text-sm font-medium text-[#868b99]"
              >
                Cancel
              </button>
              <button
                onClick={saveModal}
                disabled={!canSave}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-[#0f1115] ${
                  canSave
                    ? "bg-[#c9a463] cursor-pointer"
                    : "bg-[#8a7346] opacity-50 cursor-not-allowed"
                }`}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- hidden print layout, captured for the PNG export ----------
          Rendered off-screen at all times (not display:none) so html2canvas
          can lay it out correctly. Purely visual, no interactivity.
          Each card carries the FULL guest detail set: name, source, dates,
          and a clear status badge — sized generously so nothing needs to
          be squinted at once exported. */}
      <div
        style={{ position: "fixed", top: 0, left: "-10000px", width: "860px" }}
      >
        <div
          ref={printRef}
          style={{
            width: "860px",
            background: "#ffffff",
            padding: "40px",
            fontFamily: "'Inter', sans-serif",
            color: "#1c2027",
          }}
        >
          {/* header */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              marginBottom: "6px",
            }}
          >
            <div>
              <p
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#b3872a",
                  margin: "0 0 4px",
                }}
              >
                Live Occupancy
              </p>
              <h1
                style={{
                  fontFamily: "'Fraunces', serif",
                  fontWeight: 600,
                  fontSize: "32px",
                  margin: 0,
                  color: "#1c2027",
                  lineHeight: 1.1,
                }}
              >
                {currentFlat?.label}
              </h1>
            </div>
            <div style={{ textAlign: "right" }}>
              <p
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  margin: "0 0 2px",
                  color: "#1c2027",
                }}
              >
                {todayLong}
              </p>
              <p style={{ fontSize: "12px", color: "#868b99", margin: 0 }}>
                {occupiedCount} occupied · {currentRooms.length - occupiedCount}{" "}
                available
              </p>
            </div>
          </div>

          <div
            style={{
              height: "2px",
              background:
                "linear-gradient(90deg, #c9a463 0%, #e4e6ea 40%, #e4e6ea 100%)",
              margin: "16px 0 20px",
            }}
          />

          {/* summary strip */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "28px",
              marginBottom: "24px",
              flexWrap: "wrap",
            }}
          >
            {[
              ["Departing", statusCounts.departing, STATUS_THEME.departing],
              ["Arriving", statusCounts.arriving, STATUS_THEME.arriving],
              ["Available", statusCounts.available, STATUS_THEME.available],
              ["Occupied", statusCounts.occupiedTotal, STATUS_THEME.occupied],
            ].map(([label, count, theme]) => {
              const t = theme as StatusTheme;
              return (
                <div
                  key={label as string}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    background: t.bg,
                    border: `1px solid ${t.border}`,
                    borderRadius: "999px",
                    padding: "6px 14px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "16px",
                      fontWeight: 800,
                      color: t.badge,
                    }}
                  >
                    {pad(count as number)}
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: t.muted,
                    }}
                  >
                    {label as string}
                  </span>
                </div>
              );
            })}
          </div>

          {/* room cards — full guest detail */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${printColumns}, 1fr)`,
              gap: "14px",
            }}
          >
            {currentRooms.map((room) => {
              const status = getStatus(room, todayISO);
              const theme = STATUS_THEME[status];
              const occupied = !!room.name;
              const src = sourceInfo(room.source);
              const highlighted =
                status === "arriving" ||
                status === "departing" ||
                status === "turnover";

              return (
                <div
                  key={room.id}
                  style={{
                    position: "relative",
                    background: theme.bg,
                    border: `1.5px solid ${theme.border}`,
                    borderRadius: "14px",
                    padding: "16px 18px",
                    minHeight: "104px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "10px",
                  }}
                >
                  {highlighted && (
                    <span
                      style={{
                        position: "absolute",
                        top: "-11px",
                        right: "14px",
                        background: theme.badge,
                        color: "#ffffff",
                        fontSize: "10px",
                        fontWeight: 700,
                        letterSpacing: "0.02em",
                        borderRadius: "999px",
                        padding: "4px 10px",
                      }}
                    >
                      {STATUS_LABEL[status]} today
                    </span>
                  )}

                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: "8px",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: theme.muted,
                          margin: "0 0 3px",
                        }}
                      >
                        Room {room.room}
                      </p>
                      <p
                        style={{
                          fontSize: "17px",
                          fontWeight: 700,
                          color: theme.text,
                          margin: 0,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {occupied ? room.name : "Available"}
                      </p>
                    </div>
                    {occupied && src && (
                      <span
                        style={{
                          flexShrink: 0,
                          background: src.color,
                          color: "#ffffff",
                          fontSize: "10px",
                          fontWeight: 700,
                          borderRadius: "6px",
                          padding: "3px 7px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {src.code}
                      </span>
                    )}
                  </div>

                  {occupied ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "13px",
                        fontWeight: 600,
                      }}
                    >
                      <span
                        style={{
                          color:
                            status === "arriving" || status === "turnover"
                              ? theme.badge
                              : theme.text,
                        }}
                      >
                        {displayDateLong(room.start)}
                      </span>
                      <span style={{ color: theme.muted }}>→</span>
                      <span
                        style={{
                          color:
                            status === "departing" || status === "turnover"
                              ? theme.badge
                              : theme.text,
                        }}
                      >
                        {displayDateLong(room.end)}
                      </span>
                    </div>
                  ) : (
                    <p
                      style={{
                        fontSize: "12px",
                        color: theme.muted,
                        margin: 0,
                      }}
                    >
                      No guest assigned
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* source legend */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "14px",
              marginTop: "26px",
              paddingTop: "16px",
              borderTop: "1px solid #e4e6ea",
            }}
          >
            <span
              style={{ fontSize: "11px", fontWeight: 700, color: "#868b99" }}
            >
              SOURCE
            </span>
            {SOURCES.map((s) => (
              <span
                key={s.code}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "11px",
                  color: "#6b7280",
                }}
              >
                <span
                  style={{
                    background: s.color,
                    color: "#ffffff",
                    fontSize: "10px",
                    fontWeight: 700,
                    borderRadius: "5px",
                    padding: "2px 6px",
                  }}
                >
                  {s.code}
                </span>
                {s.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoomOccupancyBoard;
