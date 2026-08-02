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

type CarteraTabPressEvent = {
  preventDefault: () => void;
};

type CarteraTabShellContextValue = {
  context: CarteraContext;
  isSwitcherOpen: boolean;
  isHydrated: boolean;
  isOnCarteraTab: boolean;
  setContext: (context: CarteraContext) => void;
  handleCarteraTabPress: (event: CarteraTabPressEvent) => void;
};

const CarteraTabShellContext = createContext<CarteraTabShellContextValue | null>(null);

/** Auto-close switcher when no option is selected. */
const SWITCHER_INACTIVITY_MS = 3_000;

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
    if (inactivityTimerRef.current != null) {
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

  const toggleSwitcher = useCallback(() => {
    setIsSwitcherOpen((open) => !open);
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

    if (isOnCarteraTab) {
      openSwitcher();
    } else {
      closeSwitcher();
    }
  }, [closeSwitcher, isHydrated, isOnCarteraTab, openSwitcher]);

  // Start / reset inactivity timer only while the switcher is open.
  useEffect(() => {
    clearInactivityTimer();
    if (!isSwitcherOpen) return;

    inactivityTimerRef.current = setTimeout(() => {
      inactivityTimerRef.current = null;
      setIsSwitcherOpen(false);
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
    (event: CarteraTabPressEvent) => {
      if (!isOnCarteraTab) return;
      event.preventDefault();
      toggleSwitcher();
    },
    [isOnCarteraTab, toggleSwitcher],
  );

  const value = useMemo<CarteraTabShellContextValue>(
    () => ({
      context,
      isSwitcherOpen,
      isHydrated,
      isOnCarteraTab,
      setContext,
      handleCarteraTabPress,
    }),
    [context, handleCarteraTabPress, isHydrated, isOnCarteraTab, isSwitcherOpen, setContext],
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
