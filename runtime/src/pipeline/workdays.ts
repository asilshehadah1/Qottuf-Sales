// Working-day arithmetic in Riyadh time: Friday and Saturday are the weekend; holidays come from the rules file.

import type { BusinessRules } from "../config/rules.ts";

const DAY = 86_400_000;

function localDate(at: Date, offsetMinutes: number): Date {
  const shifted = new Date(at.getTime() + offsetMinutes * 60_000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

function isWorkingDay(day: Date, rules: BusinessRules): boolean {
  if (rules.work_week.weekend_days.includes(day.getUTCDay())) return false;
  return !rules.work_week.holidays.includes(day.toISOString().slice(0, 10));
}

/** Whole working days strictly after `from`'s local date, up to and including `to`'s local date. */
export function workingDaysBetween(from: Date, to: Date, rules: BusinessRules): number {
  const off = rules.work_week.timezone_offset_minutes;
  let day = localDate(from, off);
  const end = localDate(to, off);
  let n = 0;
  while (day.getTime() < end.getTime()) {
    day = new Date(day.getTime() + DAY);
    if (isWorkingDay(day, rules)) n++;
  }
  return n;
}

export function addHours(at: Date, hours: number): Date {
  return new Date(at.getTime() + hours * 3_600_000);
}
