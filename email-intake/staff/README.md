# Staff Documents — Cheeky Tees

> Everything an employee needs to run daily operations.

## Documents

| File | What It Is | When to Use |
|------|-----------|-------------|
| [operations-guide.md](operations-guide.md) | Complete operations manual | Read when starting the job. Reference for anything you're unsure about. |
| [daily-checklist.md](daily-checklist.md) | Printable daily checklist | Print and use every day — morning, midday, and end of day. |
| [quick-reference.md](quick-reference.md) | One-page quick reference card | Keep on your desk or phone for fast lookups during the day. |

## Getting Started

If you're new, read these in order:

1. **operations-guide.md** — Read the whole thing your first day. It covers what the business does, what tools you'll use, and how to handle common situations.
2. **daily-checklist.md** — Print this out and use it every day until the routine becomes second nature.
3. **quick-reference.md** — Keep this handy for the most important info at a glance.

## Keeping Docs Updated

When the system changes (new features, new endpoints, new stages), run:

```bash
node scripts/generate-staff-docs.js
```

This validates that the staff docs reference the correct stage names, endpoints, and system details. It will report any outdated references.
