import { signal } from '@preact/signals';
import type { DrillSession, SessionSummary } from '../session_planner';

export const activeSession = signal<DrillSession | null>(null);
export const lastSessionSummary = signal<SessionSummary | null>(null);
