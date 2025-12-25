// lib/timezone.ts
/**
 * Timezone handling utilities
 *
 * This module provides consistent timezone handling across the application.
 * All dates are stored in UTC in the database, but displayed and input
 * in the user's local timezone.
 */

import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';
import { format as formatDate } from 'date-fns';

// Default timezone - should be configurable per user
const DEFAULT_TIMEZONE = process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE || 'America/Chicago';

/**
 * Get the user's timezone
 * For now, uses default timezone from env
 * TODO: Get from user profile when user preferences are implemented
 */
export function getUserTimezone(): string {
  return DEFAULT_TIMEZONE;
}

/**
 * Combine a date string (YYYY-MM-DD) and time string (HH:MM) in user's timezone
 * Returns UTC Date object for storage
 *
 * @param date - Date string in YYYY-MM-DD format
 * @param time - Time string in HH:MM format
 * @param timezone - Timezone identifier (defaults to user's timezone)
 * @returns Date object in UTC
 *
 * @example
 * combineLocalWithTz('2024-12-24', '14:30', 'America/Chicago')
 * // Returns Date object representing 2024-12-24 14:30 CST in UTC
 */
export function combineLocalWithTz(
  date: string,
  time: string,
  timezone: string = getUserTimezone()
): Date {
  const dateTimeStr = `${date}T${time}:00`;
  return fromZonedTime(dateTimeStr, timezone);
}

/**
 * Format ISO timestamp for display in user's timezone
 *
 * @param isoString - ISO 8601 timestamp string
 * @param formatStr - date-fns format string
 * @param timezone - Timezone identifier (defaults to user's timezone)
 * @returns Formatted date string
 *
 * @example
 * formatForDisplay('2024-12-24T20:30:00.000Z', 'MMM d, yyyy h:mm a', 'America/Chicago')
 * // Returns "Dec 24, 2024 2:30 PM"
 */
export function formatForDisplay(
  isoString: string,
  formatStr: string = 'MMM d, yyyy h:mm a',
  timezone: string = getUserTimezone()
): string {
  return formatInTimeZone(isoString, timezone, formatStr);
}

/**
 * Convert UTC date to user's timezone
 *
 * @param utcDate - Date object in UTC
 * @param timezone - Timezone identifier (defaults to user's timezone)
 * @returns Date object adjusted to timezone
 */
export function toUserTimezone(
  utcDate: Date,
  timezone: string = getUserTimezone()
): Date {
  return toZonedTime(utcDate, timezone);
}

/**
 * Extract date string (YYYY-MM-DD) from ISO timestamp in user's timezone
 *
 * @param isoString - ISO 8601 timestamp string
 * @param timezone - Timezone identifier (defaults to user's timezone)
 * @returns Date string in YYYY-MM-DD format
 *
 * @example
 * extractDateInTz('2024-12-24T20:30:00.000Z', 'America/Chicago')
 * // Returns "2024-12-24"
 */
export function extractDateInTz(
  isoString: string,
  timezone: string = getUserTimezone()
): string {
  return formatInTimeZone(isoString, timezone, 'yyyy-MM-dd');
}

/**
 * Extract time string (HH:mm) from ISO timestamp in user's timezone
 *
 * @param isoString - ISO 8601 timestamp string
 * @param timezone - Timezone identifier (defaults to user's timezone)
 * @returns Time string in HH:mm format
 *
 * @example
 * extractTimeInTz('2024-12-24T20:30:00.000Z', 'America/Chicago')
 * // Returns "14:30"
 */
export function extractTimeInTz(
  isoString: string,
  timezone: string = getUserTimezone()
): string {
  return formatInTimeZone(isoString, timezone, 'HH:mm');
}

/**
 * Calculate hours between two timestamps
 *
 * @param startIso - Start time ISO string
 * @param endIso - End time ISO string
 * @returns Hours as decimal number
 *
 * @example
 * calculateHours('2024-12-24T09:00:00.000Z', '2024-12-24T13:00:00.000Z')
 * // Returns 4
 */
export function calculateHours(startIso: string, endIso: string): number {
  const start = new Date(startIso);
  const end = new Date(endIso);
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}

/**
 * Calculate pay based on hours and rate, with breakdown minimum
 *
 * @param hours - Hours worked
 * @param payRate - Hourly pay rate
 * @param shiftType - Type of shift (Setup, Lights, Breakdown, Other)
 * @returns Total pay due
 *
 * @example
 * calculatePay(1.5, 25, 'Breakdown')
 * // Returns 50 (minimum for breakdown)
 *
 * calculatePay(4, 25, 'Setup')
 * // Returns 100
 */
export function calculatePay(
  hours: number,
  payRate: number,
  shiftType?: string | null
): number {
  const basePay = hours * payRate;

  // Apply $50 minimum for Breakdown shifts
  if (shiftType?.toLowerCase() === 'breakdown' && basePay < 50) {
    return 50;
  }

  return basePay;
}
