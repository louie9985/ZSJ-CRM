import { useCallback, useMemo, useState } from "react";

export interface RealtimeDraftState<T extends Record<string, unknown>> {
  readonly basedOnVersion: number;
  readonly conflicts: readonly (keyof T)[];
  readonly localDraft: Partial<T>;
  readonly serverSnapshot: Readonly<T>;
  readonly serverVersion: number;
}

export function mergeRealtimeSnapshot<T extends Record<string, unknown>>(state: RealtimeDraftState<T>, serverSnapshot: Readonly<T>, serverVersion: number): RealtimeDraftState<T> {
  if (serverVersion <= state.serverVersion) return state;
  const conflicts = Object.keys(state.localDraft).filter((key) => {
    const field = key as keyof T;
    return !Object.is(state.serverSnapshot[field], serverSnapshot[field]) && !Object.is(state.localDraft[field], serverSnapshot[field]);
  }) as (keyof T)[];
  return { ...state, conflicts: Object.freeze(conflicts), serverSnapshot, serverVersion };
}

export function useRealtimeDraftMerge<T extends Record<string, unknown>>(initial: Readonly<T>, version = 1) {
  const [state, setState] = useState<RealtimeDraftState<T>>({ basedOnVersion: version, conflicts: [], localDraft: {}, serverSnapshot: initial, serverVersion: version });
  const value = useMemo(() => ({ ...state.serverSnapshot, ...state.localDraft }) as T, [state.localDraft, state.serverSnapshot]);
  const edit = useCallback(<K extends keyof T>(field: K, fieldValue: T[K]) => { setState((current) => ({ ...current, localDraft: { ...current.localDraft, [field]: fieldValue } })); }, []);
  const receive = useCallback((snapshot: Readonly<T>, nextVersion: number) => { setState((current) => mergeRealtimeSnapshot(current, snapshot, nextVersion)); }, []);
  const acceptLatest = useCallback(() => { setState((current) => ({ ...current, basedOnVersion: current.serverVersion, conflicts: [] })); }, []);
  return Object.freeze({ acceptLatest, canSubmit: state.conflicts.length === 0 && state.basedOnVersion === state.serverVersion, edit, receive, state, value });
}
