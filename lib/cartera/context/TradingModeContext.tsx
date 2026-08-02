import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_TRADING_MODE,
  DEFAULT_WORKSPACE_TAB,
  loadTradingMode,
  loadTradingWorkspaceTab,
  saveTradingMode,
  saveTradingWorkspaceTab,
  type TradingMode,
  type TradingWorkspaceTab,
} from "@/lib/cartera/storage/tradingModePreference";

export type TradingModeRules = {
  allowsLeverage: boolean;
  allowsMarginMode: boolean;
  allowsLiquidationUi: boolean;
  maxLeverage: number;
  defaultLeverage: number;
  instrumentLabel: string;
};

function rulesForMode(mode: TradingMode): TradingModeRules {
  if (mode === "SPOT") {
    return {
      allowsLeverage: false,
      allowsMarginMode: false,
      allowsLiquidationUi: false,
      maxLeverage: 1,
      defaultLeverage: 1,
      instrumentLabel: "Spot",
    };
  }

  return {
    allowsLeverage: true,
    allowsMarginMode: true,
    allowsLiquidationUi: true,
    maxLeverage: 125,
    defaultLeverage: 1,
    instrumentLabel: "Perpetual",
  };
}

export type TradingModeContextValue = {
  mode: TradingMode;
  setMode: (mode: TradingMode) => void;
  workspaceTab: TradingWorkspaceTab;
  setWorkspaceTab: (tab: TradingWorkspaceTab) => void;
  rules: TradingModeRules;
  preferenceReady: boolean;
};

const TradingModeContext = createContext<TradingModeContextValue | null>(null);

/**
 * SPOT / PERP execution rules + persistent workspace tabs.
 * Shares OrderRegistry / PortfolioEngine / Ledger — only validation + UI differ.
 */
export function TradingModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<TradingMode>(DEFAULT_TRADING_MODE);
  const [workspaceTab, setWorkspaceTabState] =
    useState<TradingWorkspaceTab>(DEFAULT_WORKSPACE_TAB);
  const [preferenceReady, setPreferenceReady] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [nextMode, nextTab] = await Promise.all([
        loadTradingMode(),
        loadTradingWorkspaceTab(),
      ]);
      if (!active) return;
      setModeState(nextMode);
      setWorkspaceTabState(nextTab);
      setPreferenceReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback((next: TradingMode) => {
    setModeState(next);
    void saveTradingMode(next);
  }, []);

  const setWorkspaceTab = useCallback((tab: TradingWorkspaceTab) => {
    setWorkspaceTabState(tab);
    void saveTradingWorkspaceTab(tab);
  }, []);

  const value = useMemo<TradingModeContextValue>(
    () => ({
      mode,
      setMode,
      workspaceTab,
      setWorkspaceTab,
      rules: rulesForMode(mode),
      preferenceReady,
    }),
    [mode, preferenceReady, setMode, setWorkspaceTab, workspaceTab],
  );

  return (
    <TradingModeContext.Provider value={value}>{children}</TradingModeContext.Provider>
  );
}

export function useTradingMode(): TradingModeContextValue {
  const ctx = useContext(TradingModeContext);
  if (!ctx) {
    throw new Error("useTradingMode must be used within TradingModeProvider");
  }
  return ctx;
}
