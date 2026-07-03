import { usePathname } from "expo-router";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  loadActiveCarteraContext,
  saveActiveCarteraContext,
} from "@/lib/cartera/storage/carteraContextStorage";
import {
  CARTERA_CONTEXTS,
  DEFAULT_CARTERA_CONTEXT,
  type CarteraContext,
} from "@/lib/cartera/types";

const SWITCHER_INACTIVITY_MS = 10_000;

type CarteraTabPressEvent = {
  preventDefault: () => void;
};

type CarteraTabShellContextValue = {
  context: CarteraContext;
  isSwitcherOpen: boolean;
  isHydrated: boolean;
  isOnCarteraTab: boolean;
  setContext: (context: CarteraContext) => void;
  handleCarteraTabPress: (isAlreadyOnCartera: boolean, event?: CarteraTabPressEvent) => void;
  closeSwitcher: () => void;
};

const CarteraTabShellContext = createContext<CarteraTabShellContextValue | null>(null);

function isCarteraPath(pathname: string): boolean {
  return pathname.includes("/learn") || pathname.endsWith("learn");
}

function normalizeContext(value: string | null | undefined): CarteraContext {
  if (CARTERA_CONTEXTS.includes(value as CarteraContext)) {
    return value as CarteraContext;
  }
  return DEFAULT_CARTERA_CONTEXT;
}

export function CarteraTabShellProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isOnCarteraTab = isCarteraPath(pathname);

  const [context, setContextState] = useState<CarteraContext>(DEFAULT_CARTERA_CONTEXT);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const closeSwitcher = useCallback(() => {
    clearInactivityTimer();
    setIsSwitcherOpen(false);
  }, [clearInactivityTimer]);

  const openSwitcher = useCallback(() => {
    setIsSwitcherOpen(true);
  }, []);

  useEffect(() => {
    let active = true;

    void loadActiveCarteraContext().then((stored) => {
      if (!active) return;
      setContextState(normalizeContext(stored));
      setIsHydrated(true);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    if (!isOnCarteraTab) {
      closeSwitcher();
    }
  }, [closeSwitcher, isHydrated, isOnCarteraTab]);

  useEffect(() => {
    if (!isSwitcherOpen) {
      clearInactivityTimer();
      return;
    }

    clearInactivityTimer();
    inactivityTimerRef.current = setTimeout(() => {
      setIsSwitcherOpen(false);
      inactivityTimerRef.current = null;
    }, SWITCHER_INACTIVITY_MS);

    return clearInactivityTimer;
  }, [clearInactivityTimer, isSwitcherOpen]);

  const setContext = useCallback(
    (next: CarteraContext) => {
      if (!CARTERA_CONTEXTS.includes(next)) return;
      setContextState(next);
      void saveActiveCarteraContext(next);
      closeSwitcher();
    },
    [closeSwitcher],
  );

  const handleCarteraTabPress = useCallback(
    (isAlreadyOnCartera: boolean, event?: CarteraTabPressEvent) => {
      if (isAlreadyOnCartera) {
        event?.preventDefault();
        setIsSwitcherOpen((open) => !open);
        return;
      }

      openSwitcher();
    },
    [openSwitcher],
  );

  const value = useMemo<CarteraTabShellContextValue>(
    () => ({
      context,
      isSwitcherOpen,
      isHydrated,
      isOnCarteraTab,
      setContext,
      handleCarteraTabPress,
      closeSwitcher,
    }),
    [
      closeSwitcher,
      context,
      handleCarteraTabPress,
      isHydrated,
      isOnCarteraTab,
      isSwitcherOpen,
      setContext,
    ],
  );

  return (
    <CarteraTabShellContext.Provider value={value}>{children}</CarteraTabShellContext.Provider>
  );
}

export function useCarteraTabShell(): CarteraTabShellContextValue {
  const ctx = useContext(CarteraTabShellContext);
  if (!ctx) {
    throw new Error("useCarteraTabShell must be used within CarteraTabShellProvider");
  }
  return ctx;
}
