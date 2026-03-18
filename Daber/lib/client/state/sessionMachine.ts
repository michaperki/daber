"use client";
import React from 'react';
import type { LessonItem, AttemptResponse } from '@/lib/contracts';

/* ── Session state machine ────────────────────────────────────
 *
 *  loading ──▶ prompting ──▶ listening ──▶ transcribing
 *       ▲          ▲               │             │
 *       │          │               ▼             ▼
 *       │          │          (cancel)      reviewing ──▶ evaluating
 *       │          │                              │            │
 *       │          │                              ▼            ▼
 *       │          └──────────── advancing ◀── feedback
 *       │                                         │
 *       └──────────────────── complete ◀──────────┘ (done)
 *
 * ──────────────────────────────────────────────────────────── */

export type SessionPhase =
  | 'loading'
  | 'prompting'
  | 'listening'
  | 'transcribing'
  | 'reviewing'
  | 'evaluating'
  | 'feedback'
  | 'advancing'
  | 'complete';

export type SessionState = {
  phase: SessionPhase;
  item: LessonItem | null;
  progress: { index: number; total: number };
  transcript: string;
  feedback: AttemptResponse | null;
  hintVisible: boolean;
};

export type SessionAction =
  | { type: 'ITEM_LOADED'; item: LessonItem; index: number; total: number; showHint: boolean }
  | { type: 'SESSION_DONE' }
  | { type: 'START_LISTENING' }
  | { type: 'CANCEL_LISTENING' }
  | { type: 'TRANSCRIPT_RECEIVED'; transcript: string }
  | { type: 'EDIT_TRANSCRIPT'; transcript: string }
  | { type: 'SUBMIT' }
  | { type: 'FEEDBACK_RECEIVED'; feedback: AttemptResponse }
  | { type: 'OVERRIDE_FEEDBACK'; feedback: AttemptResponse }
  | { type: 'NEXT_ITEM' }
  | { type: 'TOGGLE_HINT' }
  | { type: 'CLEAR_TRANSCRIPT' };

export const initialSessionState: SessionState = {
  phase: 'loading',
  item: null,
  progress: { index: 0, total: 0 },
  transcript: '',
  feedback: null,
  hintVisible: false,
};

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'ITEM_LOADED':
      return {
        ...state,
        phase: 'prompting',
        item: action.item,
        progress: { index: action.index, total: action.total },
        transcript: '',
        feedback: null,
        hintVisible: action.showHint,
      };

    case 'SESSION_DONE':
      return { ...state, phase: 'complete' };

    case 'START_LISTENING':
      // Only allowed from prompting, reviewing (record again), or feedback (try again / auto-resume)
      if (state.phase !== 'prompting' && state.phase !== 'reviewing' && state.phase !== 'feedback') return state;
      return { ...state, phase: 'listening', transcript: '', feedback: null };

    case 'CANCEL_LISTENING':
      if (state.phase !== 'listening') return state;
      return { ...state, phase: 'prompting' };

    case 'TRANSCRIPT_RECEIVED':
      if (state.phase !== 'listening') return state;
      return { ...state, phase: 'reviewing', transcript: action.transcript };

    case 'EDIT_TRANSCRIPT':
      if (state.phase !== 'reviewing') return state;
      return { ...state, transcript: action.transcript };

    case 'CLEAR_TRANSCRIPT':
      if (state.phase !== 'reviewing') return state;
      return { ...state, transcript: '' };

    case 'SUBMIT':
      if (state.phase !== 'reviewing' && state.phase !== 'listening') return state;
      return { ...state, phase: 'evaluating' };

    case 'FEEDBACK_RECEIVED':
      if (state.phase !== 'evaluating') return state;
      return { ...state, phase: 'feedback', feedback: action.feedback };

    case 'OVERRIDE_FEEDBACK':
      if (state.phase !== 'feedback') return state;
      return { ...state, feedback: action.feedback };

    case 'NEXT_ITEM':
      if (state.phase !== 'feedback' && state.phase !== 'prompting') return state;
      return { ...state, phase: 'loading', item: null, transcript: '', feedback: null };

    case 'TOGGLE_HINT':
      return { ...state, hintVisible: !state.hintVisible };

    default:
      return state;
  }
}

export function useSessionMachine() {
  const [state, dispatch] = React.useReducer(sessionReducer, initialSessionState);
  return { state, dispatch };
}
