/**
 * Tunables — prefer env with sane defaults (no magic numbers in scripts).
 */

export const cheekyConfig = {
  defaultPort: Number(process.env.CHEEKY_OS_PORT || process.env.PORT || 3000),
  smokeBaseUrl: process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000",
  vipMinDormancyDays: 45,
  reactivationQuietDays: 75,
  quoteAccelerationSweetMinDays: 40,
  quoteAccelerationSweetMaxDays: 120,
} as const;
