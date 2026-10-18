/**
 * Time and Date Calculations for Asia/Dhaka (Bangladesh Standard Time, UTC+6)
 */

export const TIMEZONE = 'Asia/Dhaka';

export function getDhakaNow(): Date {
  // Returns current date adjusted to Asia/Dhaka
  return new Date();
}

export function getDhakaDateString(date: Date = new Date()): string {
  // Returns YYYY-MM-DD in Asia/Dhaka
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

export function getDhakaTimeString(date: Date = new Date()): string {
  // Returns HH:mm (24-hour) in Asia/Dhaka
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(date);
}

export function getDhakaFormattedTime12(date: Date = new Date()): string {
  // Returns e.g. "11:02 AM" in Asia/Dhaka
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return formatter.format(date);
}

export function formatTime12FromHHMM(hhmm?: string | null): string {
  if (!hhmm) return '--:--';
  const parts = hhmm.split(':');
  if (parts.length < 2) return hhmm;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const formattedH = h % 12 === 0 ? 12 : h % 12;
  const formattedM = m.toString().padStart(2, '0');
  return `${formattedH}:${formattedM} ${ampm}`;
}

export function getDhakaDayOfWeek(dateStr: string): string {
  // dateStr is YYYY-MM-DD
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'long',
  }).format(date);
}

export function parseHHMMToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function formatMinutesToHumanDuration(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0h 0m';
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

export function calculateLateness(
  actualInHHMM: string,
  scheduledStartHHMM: string,
  graceMinutes: number
): number {
  const actualMin = parseHHMMToMinutes(actualInHHMM);
  const schedMin = parseHHMMToMinutes(scheduledStartHHMM);
  const graceThreshold = schedMin + graceMinutes;

  if (actualMin > graceThreshold) {
    return actualMin - schedMin;
  }
  return 0;
}

export function calculateExtraMinutes(
  actualOutHHMM: string,
  scheduledEndHHMM: string
): number {
  const actualMin = parseHHMMToMinutes(actualOutHHMM);
  const schedMin = parseHHMMToMinutes(scheduledEndHHMM);

  if (actualMin > schedMin) {
    return actualMin - schedMin;
  }
  return 0;
}

export function calculateElapsedMinutes(
  inHHMM: string,
  outHHMM: string
): number {
  const inMin = parseHHMMToMinutes(inHHMM);
  const outMin = parseHHMMToMinutes(outHHMM);
  return Math.max(0, outMin - inMin);
}
