// Single Turso store instance shared across the whole app.
// In local dev: uses an in-memory map (no env vars needed).
// In production: set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN.

import { createTursoDataStore } from "@farcaster/snap-turso";

export const store = createTursoDataStore();
