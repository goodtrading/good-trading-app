import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type InventoryHolding = {
  id: string;
  symbol: string;
  name: string;
  quantity: number;
  costBasisUsd: number;
  updatedAt: number;
};

export type InventoryContextValue = {
  holdings: InventoryHolding[];
  addHolding: (input: Omit<InventoryHolding, "id" | "updatedAt">) => void;
  updateHolding: (id: string, patch: Partial<Pick<InventoryHolding, "quantity" | "costBasisUsd" | "name">>) => void;
  removeHolding: (id: string) => void;
};

const InventoryBoundaryContext = createContext<InventoryContextValue | null>(null);

function createHoldingId(): string {
  return `holding_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * DECLARATIVE WRITE context — manual holdings only.
 * Must not import trading engines, ledger, or broker adapters.
 */
export function InventoryContextProvider({ children }: { children: ReactNode }) {
  const [holdings, setHoldings] = useState<InventoryHolding[]>([]);

  const addHolding = useCallback((input: Omit<InventoryHolding, "id" | "updatedAt">) => {
    setHoldings((current) => [
      ...current,
      {
        ...input,
        id: createHoldingId(),
        updatedAt: Date.now(),
      },
    ]);
  }, []);

  const updateHolding = useCallback(
    (id: string, patch: Partial<Pick<InventoryHolding, "quantity" | "costBasisUsd" | "name">>) => {
      setHoldings((current) =>
        current.map((holding) =>
          holding.id === id ? { ...holding, ...patch, updatedAt: Date.now() } : holding,
        ),
      );
    },
    [],
  );

  const removeHolding = useCallback((id: string) => {
    setHoldings((current) => current.filter((holding) => holding.id !== id));
  }, []);

  const value = useMemo<InventoryContextValue>(
    () => ({
      holdings,
      addHolding,
      updateHolding,
      removeHolding,
    }),
    [addHolding, holdings, removeHolding, updateHolding],
  );

  return (
    <InventoryBoundaryContext.Provider value={value}>{children}</InventoryBoundaryContext.Provider>
  );
}

export function useInventoryContext(): InventoryContextValue {
  const ctx = useContext(InventoryBoundaryContext);
  if (!ctx) {
    throw new Error(
      "useInventoryContext must be used within InventoryContextProvider (INVENTORY bounded context only)",
    );
  }
  return ctx;
}
