// lib/pay.ts
export type ShiftRow = {
  shift_type: 'Setup' | 'Breakdown' | 'Shop' | string;
  hours_worked?: number | string | null;
  pay_rate?: number | string | null;
  pay_due?: number | string | null; // may already be present from DB
};

/** Use DB pay_due if present; otherwise compute with Breakdown $50 min. */
export function calcPayRow(s: ShiftRow): number {
  if (s.pay_due !== undefined && s.pay_due !== null && s.pay_due !== '')
    return Number(s.pay_due);
  const hours = Number(s.hours_worked ?? 0);
  const rate  = Number(s.pay_rate ?? 25);

  // Breakdown shifts have a $50 minimum regardless of hours worked
  if (s.shift_type === 'Breakdown') {
    return Math.max(hours * rate, 50);
  }

  return hours * rate;
}
