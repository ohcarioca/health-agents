// Professional color palette (deterministic by index)
export const PROFESSIONAL_COLORS = [
  "#6366f1", // indigo
  "#06b6d4", // cyan
  "#f59e0b", // amber
  "#10b981", // emerald
  "#f43f5e", // rose
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
] as const;

export function getProfessionalColor(index: number): string {
  return PROFESSIONAL_COLORS[index % PROFESSIONAL_COLORS.length];
}

// Date helpers
export function getWeekRange(date: Date): { start: Date; end: Date } {
  const d = new Date(date);
  const day = d.getDay();
  // Monday-based week
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function getDayRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function getMonthRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// Grid constants
export const GRID_START_HOUR = 6;
export const GRID_END_HOUR = 21;
export const SLOT_DURATION_MINUTES = 30;
export const TOTAL_SLOTS = (GRID_END_HOUR - GRID_START_HOUR) * (60 / SLOT_DURATION_MINUTES);

// Calculate top position and height for an event in the grid
export function getEventPosition(
  startsAt: Date,
  endsAt: Date,
): { top: number; height: number } {
  const startMinutes = startsAt.getHours() * 60 + startsAt.getMinutes();
  const endMinutes = endsAt.getHours() * 60 + endsAt.getMinutes();
  const gridStartMinutes = GRID_START_HOUR * 60;
  const gridTotalMinutes = (GRID_END_HOUR - GRID_START_HOUR) * 60;

  const top = ((startMinutes - gridStartMinutes) / gridTotalMinutes) * 100;
  const height = ((endMinutes - startMinutes) / gridTotalMinutes) * 100;

  return {
    top: Math.max(0, top),
    height: Math.max(1, Math.min(height, 100 - top)),
  };
}
