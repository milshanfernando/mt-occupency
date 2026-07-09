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
const today = new Date();
const todayISO = toISO(today);
const todayLong = today.toLocaleDateString(undefined, {
  weekday: "long",
  month: "short",
  day: "numeric",
});

const RoomOccupancyBoard: React.FC = () => {
  const [rooms, setRooms] = useState<Room[]>(() => buildDefaultRooms());
  const [flat, setFlat] = useState<string>(flats[0].key);
  const [modal, setModal] = useState<Room | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
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

  const occupiedCount = currentRooms.filter((r) => r.name).length;
  const draggedRoom = drag
    ? (rooms.find((r) => r.id === drag.id) ?? null)
    : null;

  return (
    <div className="bg-[#0f1115] text-[#eef0f3] min-h-screen font-['Inter',sans-serif]">
      <div>
        {/* header */}
        <div className="border-b border-[#272b34] px-4 sm:px-6 pt-5 pb-4">
          <p className="text-[#c9a463] tracking-[0.14em] text-xs font-semibold uppercase mb-1">
            Live Occupancy
          </p>

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
    </div>
  );
};

export default RoomOccupancyBoard;
