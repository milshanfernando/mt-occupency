import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import {
  GripVertical,
  LogIn,
  LogOut,
  X,
  Trash2,
  User,
  ChevronDown,
  Tag,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// ---------- flats & rooms ----------
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
  h: number;
  overId: string | null;
}

const flats: Flat[] = [
  {
    key: "superior-302",
    label: "Superior — 302",
    rooms: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
  },
  {
    key: "superior-301",
    label: "Superior — 301",
    rooms: ["10", "11", "12", "14", "15", "16", "17", "18", "19"],
  },
  {
    key: "deluxe",
    label: "Deluxe",
    rooms: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
  },
  {
    key: "vogue-m2",
    label: "Vouge Inn — M2",
    rooms: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"],
  },
  {
    key: "vogue-m3",
    label: "Vouge Inn — M3",
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
    label: "DSV — M",
    rooms: ["1", "2", "3", "4", "5", "6", "7", "8"],
  },
  { key: "dsv-101", label: "DSV — 101", rooms: ["1", "2", "3", "4"] },
];

const SOURCES: Source[] = [
  { code: "B", label: "Booking.com", color: "#4e83d6" },
  { code: "A", label: "Agoda", color: "#d5688f" },
  { code: "ABB", label: "Airbnb", color: "#3fada0" },
  { code: "Exp", label: "Expedia", color: "#d3ab4e" },
  { code: "D", label: "Walk-in", color: "#8891a1" },
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

// ---------- persistence (browser localStorage) ----------
const STORAGE_KEY = "occupancy-board-rooms-v1";

const loadRooms = (): Room[] => {
  if (typeof window === "undefined") return buildDefaultRooms();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildDefaultRooms();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return buildDefaultRooms();
    // merge saved data onto the current room map, so adding/removing
    // rooms in `flats` above never breaks a previously saved board
    const saved: Record<string, Room> = {};
    parsed.forEach((r: Room) => {
      if (r && typeof r.id === "string") saved[r.id] = r;
    });
    return buildDefaultRooms().map((r) =>
      saved[r.id] ? { ...r, ...saved[r.id] } : r,
    );
  } catch (err) {
    console.error("Failed to load saved occupancy data:", err);
    return buildDefaultRooms();
  }
};

const persistRooms = (rooms: Room[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
  } catch (err) {
    console.error("Failed to save occupancy data:", err);
  }
};

// ---------- status theming ----------
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
  return `${d}/${m}`;
};
const today = new Date();
const todayISO = toISO(today);

// finds the column count that lets every card fit on screen with no
// scrolling, keeping cards as large and as close to square as possible
const bestColumnCount = (
  count: number,
  width: number,
  height: number,
): number => {
  if (count <= 0 || width <= 0 || height <= 0) return 1;
  let best = 1;
  let bestScore = -Infinity;
  for (let c = 1; c <= count; c++) {
    const rows = Math.ceil(count / c);
    const cellW = width / c;
    const cellH = height / rows;
    const aspect = cellW / cellH;
    if (aspect < 0.42 || aspect > 2.3) continue;
    const score = Math.min(cellW, cellH);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
};

// how far (px) a touch must travel horizontally, and how "horizontal"
// it must be relative to vertical movement, to count as a swipe
const SWIPE_MIN_DISTANCE = 45;
const SWIPE_MAX_OFF_AXIS_RATIO = 0.6;

const OccupancyBoardPro: React.FC = () => {
  const [rooms, setRooms] = useState<Room[]>(() => loadRooms());
  const [flat, setFlat] = useState<string>("vogue-m2");
  const [modal, setModal] = useState<Room | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [cols, setCols] = useState(3);
  const [swipeHint, setSwipeHint] = useState<"left" | "right" | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragRef = useRef<DragState | null>(null);
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // save to localStorage every time the room data changes
  useEffect(() => {
    persistRooms(rooms);
  }, [rooms]);

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
  const currentFlatIndex = flats.findIndex((f) => f.key === flat);

  // recompute grid columns whenever the container resizes or room count changes
  useLayoutEffect(() => {
    const el = gridWrapRef.current;
    if (!el) return;
    const compute = () => {
      const rect = el.getBoundingClientRect();
      setCols(bestColumnCount(currentRooms.length, rect.width, rect.height));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [currentRooms.length]);

  // ---------- flat switching (dropdown + swipe share this) ----------
  const goToFlat = (direction: 1 | -1) => {
    const nextIndex =
      (currentFlatIndex + direction + flats.length) % flats.length;
    setFlat(flats[nextIndex].key);
    setSwipeHint(direction === 1 ? "left" : "right");
    if (swipeHintTimeoutRef.current) clearTimeout(swipeHintTimeoutRef.current);
    swipeHintTimeoutRef.current = setTimeout(() => setSwipeHint(null), 260);
  };

  // ---------- swipe-to-switch-flat (touch only, ignores drag-and-drop) ----------
  const onGridTouchStart = (e: React.TouchEvent) => {
    if (dragRef.current) return; // a room card drag is in progress
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const onGridTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || dragRef.current) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return;
    if (Math.abs(dy) > Math.abs(dx) * SWIPE_MAX_OFF_AXIS_RATIO) return;
    // swipe left (finger moves right-to-left) -> next flat
    // swipe right (finger moves left-to-right) -> previous flat
    goToFlat(dx < 0 ? 1 : -1);
  };

  const onGridTouchCancel = () => {
    touchStartRef.current = null;
  };

  useEffect(() => {
    return () => {
      if (swipeHintTimeoutRef.current)
        clearTimeout(swipeHintTimeoutRef.current);
    };
  }, []);

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
    touchStartRef.current = null; // a card drag takes priority over a swipe
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
      h: rect.height,
      overId: null,
    };
    dragRef.current = state;
    setDrag(state);
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

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
  const rows = Math.ceil(currentRooms.length / cols) || 1;

  const statusLegend: [StatusKey, string][] = [
    ["available", "Available"],
    ["occupied", "Occupied"],
    ["arriving", "Arriving"],
    ["departing", "Departing"],
    ["turnover", "Turnover"],
  ];

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        height: "100dvh",
        width: "100%",
        background: "#f6ece7",
        color: "#241d1a",
        fontFamily: "'Inter',sans-serif",
      }}
    >
      {/* header — fixed, compact but carries the full luxury identity */}
      <div
        className="shrink-0 border-b px-3 pt-2.5 pb-2"
        style={{ borderColor: "#ece1dc" }}
      >
        <div className="flex items-center justify-between gap-2">
          <p
            className="text-[9px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: "#b8863a" }}
          >
            Live Occupancy
          </p>
          <p className="text-[10px]" style={{ color: "#8a7a72" }}>
            {occupiedCount} occupied · {currentRooms.length - occupiedCount}{" "}
            available
          </p>
        </div>

        <div className="mt-1 flex items-center gap-2">
          <h1
            className="font-semibold truncate"
            style={{
              fontFamily: "'Fraunces',serif",
              fontSize: "clamp(15px,4.4vw,20px)",
              color: "#20242f",
            }}
          >
            {currentFlat?.label}
          </h1>
          <span
            className="ml-auto text-[11px] font-semibold shrink-0"
            style={{ color: "#b8863a" }}
          >
            {today.getFullYear()}/{pad(today.getMonth() + 1)}/
            {pad(today.getDate())}
          </span>
        </div>

        <div className="mt-1.5 flex items-center gap-1.5">
          <button
            onClick={() => goToFlat(-1)}
            aria-label="Previous property"
            className="shrink-0 flex items-center justify-center rounded-lg bg-white border"
            style={{
              borderColor: "#e4d4cf",
              color: "#b8863a",
              width: 28,
              height: 28,
            }}
          >
            <ChevronLeft size={14} />
          </button>
          <div className="relative flex-1 min-w-0">
            <select
              value={flat}
              onChange={(e) => setFlat(e.target.value)}
              className="w-full appearance-none rounded-lg pl-2.5 pr-7 py-1.5 text-[11px] font-semibold bg-white border focus:outline-none truncate"
              style={{ borderColor: "#e4d4cf", color: "#20242f" }}
            >
              {flats.map((f) => {
                const flatRooms = rooms.filter((r) =>
                  r.id.startsWith(f.key + "-"),
                );
                const occ = flatRooms.filter((r) => r.name).length;
                return (
                  <option key={f.key} value={f.key}>
                    {f.label} — {occ}/{flatRooms.length}
                  </option>
                );
              })}
            </select>
            <ChevronDown
              size={12}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
              style={{ color: "#b8863a" }}
            />
          </div>
          <button
            onClick={() => goToFlat(1)}
            aria-label="Next property"
            className="shrink-0 flex items-center justify-center rounded-lg bg-white border"
            style={{
              borderColor: "#e4d4cf",
              color: "#b8863a",
              width: 28,
              height: 28,
            }}
          >
            <ChevronRight size={14} />
          </button>
        </div>

        <div className="mt-1.5 flex items-center justify-between">
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            {statusLegend.map(([key, label]) => (
              <span
                key={key}
                className="flex items-center gap-1"
                style={{ fontSize: "8.5px", color: "#8a7a72" }}
              >
                <span
                  className="inline-block rounded-sm"
                  style={{
                    width: 6,
                    height: 6,
                    background: STATUS_THEME[key].badge,
                  }}
                />
                {label}
              </span>
            ))}
          </div>
          <span
            className="flex items-center gap-1 shrink-0"
            style={{ fontSize: "8.5px", color: "#c9b493" }}
          >
            {flats.map((f, i) => (
              <span
                key={f.key}
                className="inline-block rounded-full"
                style={{
                  width: i === currentFlatIndex ? 10 : 4,
                  height: 4,
                  background: i === currentFlatIndex ? "#b8863a" : "#e4d4cf",
                  transition: "width 150ms ease",
                }}
              />
            ))}
          </span>
        </div>
      </div>

      {/* room grid — fills remaining space; columns computed so nothing scrolls */}
      {/* swipe left/right anywhere in this area to switch property (mobile) */}
      <div
        ref={gridWrapRef}
        className="relative flex-1 min-h-0 px-2.5 py-2"
        onTouchStart={onGridTouchStart}
        onTouchEnd={onGridTouchEnd}
        onTouchCancel={onGridTouchCancel}
        style={{ touchAction: "pan-y" }}
      >
        <div
          className="h-full grid gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
            opacity: swipeHint ? 0.55 : 1,
            transform: swipeHint
              ? `translateX(${swipeHint === "left" ? "-6px" : "6px"})`
              : "translateX(0)",
            transition: "opacity 160ms ease, transform 160ms ease",
          }}
        >
          {currentRooms.map((room) => {
            const status = getStatus(room, todayISO);
            const theme = STATUS_THEME[status];
            const isDragging = drag?.id === room.id;
            const isOver = drag?.overId === room.id;
            const occupied = !!room.name;
            const src = sourceInfo(room.source);
            const flagged =
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
                  borderColor: isOver ? "#b8863a" : theme.border,
                  touchAction: "none",
                }}
                className={`relative min-w-0 min-h-0 rounded-lg border flex flex-col justify-between px-1.5 py-1 cursor-pointer
                  ${isOver ? "ring-1 ring-[#b8863a]" : ""}
                  ${isDragging ? "opacity-30" : "opacity-100"}`}
              >
                <div className="flex items-center justify-between w-full">
                  <span
                    className="font-bold uppercase truncate"
                    style={{
                      fontSize: "clamp(6.5px,2.1vw,9px)",
                      color: theme.muted,
                      letterSpacing: "0.02em",
                    }}
                  >
                    Rm {room.room}
                  </span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {flagged && (
                      <span
                        className="flex items-center justify-center rounded-full"
                        style={{
                          width: "clamp(10px,3.4vw,14px)",
                          height: "clamp(10px,3.4vw,14px)",
                          background: theme.badge,
                        }}
                      >
                        {status === "turnover" ? (
                          <LogOut size={8} color="#0f1115" />
                        ) : status === "arriving" ? (
                          <LogIn size={8} color="#0f1115" />
                        ) : (
                          <LogOut size={8} color="#0f1115" />
                        )}
                      </span>
                    )}
                    <button
                      onPointerDown={(e) => onHandlePointerDown(e, room)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ touchAction: "none", color: theme.muted }}
                      className="rounded hover:opacity-70"
                      aria-label="Drag to reassign"
                    >
                      <GripVertical size={10} />
                    </button>
                  </div>
                </div>

                <p
                  className="font-semibold truncate w-full"
                  style={{
                    fontSize: "clamp(7.5px,2.6vw,11.5px)",
                    color: theme.text,
                    lineHeight: 1.15,
                  }}
                >
                  {occupied ? (
                    room.name
                  ) : (
                    <span style={{ color: theme.muted }}>Available</span>
                  )}
                </p>

                {occupied ? (
                  <div className="flex items-center justify-between w-full">
                    <span
                      className="font-semibold"
                      style={{
                        fontSize: "clamp(6.5px,2.1vw,9px)",
                        color: theme.muted,
                      }}
                    >
                      {displayDate(room.start)}→{displayDate(room.end)}
                    </span>
                    {src && (
                      <span
                        title={src.label}
                        className="font-bold text-white rounded leading-none shrink-0"
                        style={{
                          fontSize: "clamp(5.5px,1.8vw,8px)",
                          padding: "1.5px 3px",
                          background: src.color,
                        }}
                      >
                        {src.code}
                      </span>
                    )}
                  </div>
                ) : (
                  <span
                    style={{
                      fontSize: "clamp(6.5px,2.1vw,9px)",
                      color: theme.muted,
                    }}
                  >
                    Tap to assign
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* source legend — fixed, slim */}
      <div
        className="shrink-0 border-t px-3 py-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5"
        style={{ borderColor: "#ece1dc" }}
      >
        <span
          className="flex items-center gap-0.5"
          style={{ fontSize: "8.5px", color: "#8a7a72" }}
        >
          <Tag size={9} /> Source:
        </span>
        {SOURCES.map((s) => (
          <span
            key={s.code}
            className="flex items-center gap-0.5"
            style={{ fontSize: "8.5px", color: "#8a7a72" }}
          >
            <span
              className="rounded text-center font-bold text-white leading-none"
              style={{
                fontSize: "7.5px",
                padding: "1px 3px",
                background: s.color,
              }}
            >
              {s.code}
            </span>
            {s.label}
          </span>
        ))}
      </div>

      {/* drag ghost */}
      {drag && draggedRoom && (
        <div
          className="fixed rounded-lg p-2 pointer-events-none z-50 flex flex-col gap-0.5 bg-white border shadow-2xl"
          style={{
            left: drag.x - drag.offsetX,
            top: drag.y - drag.offsetY,
            width: drag.w,
            height: drag.h,
            opacity: 0.95,
            borderColor: "#b8863a",
          }}
        >
          <p
            className="text-[9px] font-bold uppercase"
            style={{ color: "#8a7a72" }}
          >
            Room {draggedRoom.room}
          </p>
          <p
            className="text-[11px] font-semibold truncate"
            style={{ color: "#20242f" }}
          >
            {draggedRoom.name || "Available"}
          </p>
        </div>
      )}

      {/* modal */}
      {modal && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/60"
          onClick={closeModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-2xl p-5 flex flex-col gap-4 bg-white border-t"
            style={{
              borderColor: "#e4d4cf",
              maxHeight: "88dvh",
              overflowY: "auto",
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "#b8863a" }}
                >
                  Room {modal.room}
                </p>
                <h2
                  className="text-lg font-semibold"
                  style={{ fontFamily: "'Fraunces',serif" }}
                >
                  {modal.name ? "Edit guest" : "Assign guest"}
                </h2>
              </div>
              <button
                onClick={closeModal}
                className="text-[#8a7a72]"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[#8a7a72] text-xs font-medium flex items-center gap-1">
                <User size={12} /> Guest name
              </span>
              <input
                value={modal.name}
                onChange={(e) => setModal({ ...modal, name: e.target.value })}
                placeholder="Full name"
                className="rounded-lg px-3 py-2 text-sm outline-none bg-[#faf6f3] border border-[#e4d4cf] text-[#20242f]"
              />
            </label>

            <div className="flex gap-3">
              <label className="flex flex-col gap-1 text-sm flex-1">
                <span className="text-[#8a7a72] text-xs font-medium">
                  Check-in
                </span>
                <input
                  type="date"
                  value={modal.start}
                  onChange={(e) =>
                    setModal({ ...modal, start: e.target.value })
                  }
                  className="rounded-lg px-3 py-2 text-sm outline-none bg-[#faf6f3] border border-[#e4d4cf] text-[#20242f]"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm flex-1">
                <span className="text-[#8a7a72] text-xs font-medium">
                  Check-out
                </span>
                <input
                  type="date"
                  value={modal.end}
                  onChange={(e) => setModal({ ...modal, end: e.target.value })}
                  className="rounded-lg px-3 py-2 text-sm outline-none bg-[#faf6f3] border border-[#e4d4cf] text-[#20242f]"
                />
              </label>
            </div>

            {modal.start && modal.end && modal.end < modal.start && (
              <p className="text-xs text-[#c1616b]">
                Check-out must be on or after check-in.
              </p>
            )}

            <div className="flex flex-col gap-1.5 text-sm">
              <span className="text-[#8a7a72] text-xs font-medium flex items-center gap-1">
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
                              color: "#fff",
                            }
                          : { borderColor: "#e4d4cf", color: "#8a7a72" }
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
                className="rounded-lg px-3 py-2 text-sm font-medium text-[#8a7a72]"
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

export default OccupancyBoardPro;
