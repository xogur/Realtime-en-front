import type { DurationMinutes } from './types';

export function localDateValue(value: Date): string {
  const y = value.getFullYear(); const m = String(value.getMonth() + 1).padStart(2, '0'); const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addCalendarMonth(value: Date): Date {
  const result = new Date(value.getFullYear(), value.getMonth() + 1, value.getDate());
  if (result.getDate() !== value.getDate()) result.setDate(0);
  return result;
}

export type BookingStep = 'date' | 'time' | 'cocoon';
export const DURATION_OPTIONS: DurationMinutes[] = [30, 60];
