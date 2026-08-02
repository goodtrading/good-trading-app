import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { TradingContextHeader } from "@/components/cartera/views/TradingContextHeader";
import { AddAccountSheet } from "@/components/portfolio/AddAccountSheet";
import { PaperAccountInfoSheet } from "@/components/portfolio/PaperAccountInfoSheet";
import { PaperCreateAccountSheet } from "@/components/portfolio/PaperCreateAccountSheet";
import { WalletScreen } from "@/components/portfolio/WalletScreen";
import { useColors } from "@/hooks/useColors";
import { useTradingContext, useTradingMode } from "@/lib/cartera";
import type { TradingMode } from "@/lib/cartera/storage/tradingModePreference";

/**
 * Trading module shell — SPOT / PERP modes share the same engine stack.
 * Live marks flow through MarketTickStore (no price props).
 */
export function TradingContextView() {
  const colors = useColors();
  const { createPaperAccount, paperAccounts } = useTradingContext();
  const { mode, setMode, preferenceReady } = useTradingMode();
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [createPaperOpen, setCreatePaperOpen] = useState(false);
  const [infoAccountId, setInfoAccountId] = useState<string | null>(null);

  const infoAccount = useMemo(
    () => paperAccounts.find((account) => account.id === infoAccountId) ?? null,
    [infoAccountId, paperAccounts],
  );

  const handleModeChange = useCallback(
    (next: TradingMode) => {
      setMode(next);
    },
    [setMode],
  );

  const handleCreatePaperAccount = useCallback(
    async (name: string, initialBalance: number) => {
      await createPaperAccount(name, initialBalance);
    },
    [createPaperAccount],
  );

  const activeMode = preferenceReady ? mode : "PERP";

  return (
    <>
      <TradingContextHeader
        onAddPress={() => setAddAccountOpen(true)}
        onAccountInfoRequest={setInfoAccountId}
      />

      <View style={styles.modeSwitch}>
        {(["SPOT", "PERP"] as const).map((entry) => {
          const selected = activeMode === entry;
          return (
            <Pressable
              key={entry}
              onPress={() => handleModeChange(entry)}
              style={[
                styles.modeChip,
                {
                  borderColor: colors.border,
                  backgroundColor: selected ? colors.secondary : "transparent",
                },
              ]}
            >
              <Text
                style={[
                  styles.modeChipText,
                  { color: selected ? colors.primary : colors.mutedForeground },
                ]}
              >
                {entry}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <WalletScreen onAddPress={() => setAddAccountOpen(true)} />

      <AddAccountSheet
        visible={addAccountOpen}
        onClose={() => setAddAccountOpen(false)}
        onCreatePaperPress={() => setCreatePaperOpen(true)}
      />
      <PaperCreateAccountSheet
        visible={createPaperOpen}
        onClose={() => setCreatePaperOpen(false)}
        onCreate={handleCreatePaperAccount}
      />
      <PaperAccountInfoSheet
        visible={infoAccount != null}
        account={infoAccount}
        onClose={() => setInfoAccountId(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  modeSwitch: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  modeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  modeChipText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
});
