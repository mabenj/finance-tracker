import { z } from 'zod';

// Use this for every text field in tRPC mutations (spec §8.3):
// trim → non-empty → max 100 chars → any characters allowed.
export const trimmedText = z
  .string()
  .trim()
  .min(1, 'Must not be empty')
  .max(100, 'Must be 100 characters or fewer');

// Monetary amounts: integers (EUR cents), zero or positive (spec §8.2).
export const eurCents = z.number().int().min(0, 'Amount must be zero or positive');

// Tri-state recurrence for expenses and incomes (CONTEXT.md glossary):
//   none     → does not carry forward
//   fixed    → carries forward with its previous amount
//   variable → carries forward at €0
export const recurrence = z.enum(['none', 'fixed', 'variable']);
export type Recurrence = z.infer<typeof recurrence>;
