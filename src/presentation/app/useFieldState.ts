import type { Dispatch,SetStateAction } from 'react';
import { useReducer } from 'react';

/** A single reducer owns a form/workspace; fields retain typed functional setters. */
export function useFieldState<T extends object>(initialize: () => T) {
  const [state, dispatch] = useReducer((current: T, action: (value: T) => T) => action(current), undefined, initialize);
  return <K extends keyof T>(key: K): [T[K], Dispatch<SetStateAction<T[K]>>] => [state[key], value => {
    dispatch(current => ({ ...current, [key]: typeof value === 'function'
      ? (value as (previous: T[K]) => T[K])(current[key]) : value }));
  }];
}
