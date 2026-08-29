/**
 * Mortgage, tax and affordability arithmetic. OWNER: [B].
 *
 * These are real numbers and the room contains people who know them. Every
 * function here is pure and unit-tested in `sim.test.ts`.
 *
 * Stamp duty bands: England, residential, standard rates as at the 2025-26
 * thresholds. `netMonthly` is a deliberate approximation of PAYE + employee
 * NI — a gameplay abstraction, and D's "what's real" panel says so.
 */

/** Monthly repayment. `annualPct` is the ANNUAL rate as a percent, e.g. 4.75 */
export function monthlyPayment(principal: number, annualPct: number, months = 300): number {
  if (months <= 0) return 0;
  const r = annualPct / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

/** Balance after `paid` payments of a `months`-term loan. Properly amortised. */
export function balanceAfter(
  principal: number,
  annualPct: number,
  months: number,
  paid: number,
): number {
  if (months <= 0) return 0;
  const n = Math.min(paid, months);
  const r = annualPct / 100 / 12;
  if (r === 0) return Math.max(0, principal * (1 - n / months));
  const g = Math.pow(1 + r, n);
  const bal = principal * g - monthlyPayment(principal, annualPct, months) * ((g - 1) / r);
  return Math.max(0, bal);
}

/** Interest paid over `paid` payments — payments made minus principal repaid. */
export function interestOver(
  principal: number,
  annualPct: number,
  months: number,
  paid: number,
): number {
  const n = Math.min(paid, months);
  const repaid = principal - balanceAfter(principal, annualPct, months, n);
  return monthlyPayment(principal, annualPct, months) * n - repaid;
}

/**
 * England residential stamp duty.
 *  Standard: 0% to 125k · 2% to 250k · 5% to 925k · 10% to 1.5m · 12% above
 *  First-time-buyer relief: 0% to 300k · 5% 300k–500k · NO relief above 500k
 */
export function stampDuty(price: number, firstTimeBuyer: boolean): number {
  const bands: [number, number][] =
    firstTimeBuyer && price <= 500_000
      ? [[300_000, 0], [500_000, 0.05]]
      : [[125_000, 0], [250_000, 0.02], [925_000, 0.05], [1_500_000, 0.1], [Infinity, 0.12]];
  let due = 0;
  let lower = 0;
  for (const [upper, rate] of bands) {
    if (price <= lower) break;
    due += (Math.min(price, upper) - lower) * rate;
    lower = upper;
  }
  return Math.round(due);
}

/** Rough PAYE + employee NI. Approximate on purpose — a gameplay abstraction. */
export function netMonthly(grossAnnual: number): number {
  const PA = 12_570;
  const HIGHER = 50_270;
  const ADDL = 125_140;
  const taxable = Math.max(0, grossAnnual - PA);
  const tax =
    Math.min(taxable, HIGHER - PA) * 0.2 +
    Math.max(0, Math.min(grossAnnual, ADDL) - HIGHER) * 0.4 +
    Math.max(0, grossAnnual - ADDL) * 0.45;
  const ni =
    Math.max(0, Math.min(grossAnnual, HIGHER) - PA) * 0.08 +
    Math.max(0, grossAnnual - HIGHER) * 0.02;
  return (grossAnnual - tax - ni) / 12;
}

export const MAX_LTI = 4.5;        // lender income multiple cap
export const MIN_DEPOSIT = 0.1;    // 10% minimum deposit
export const DEPOSIT_BUFFER = 5_000; // cash kept back rather than put into the deposit

/** Largest purchase price this household could get a lender to agree to. */
export function maxAffordable(householdIncome: number, savings: number): number {
  const borrow = householdIncome * MAX_LTI;
  const deposit = Math.max(0, savings - DEPOSIT_BUFFER);
  return Math.min(borrow + deposit, deposit / MIN_DEPOSIT);
}

/** Purchase costs beyond the deposit: stamp duty, legals, survey, moving. */
export const LEGAL_AND_SURVEY = 2_600;
export const MOVING_COST = 1_400;
export const REMORTGAGE_FEE = 999;
export const SELLING_COST_RATE = 0.018; // agent + legals on a sale
