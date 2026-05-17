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
