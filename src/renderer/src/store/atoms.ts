import { atom } from 'jotai';

export const splitPctAtom = atom(30);
export const activeContextTabsAtom = atom<Record<string, string>>({});
