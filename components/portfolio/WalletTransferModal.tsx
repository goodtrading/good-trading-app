import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { CenteredDialogModal } from "@/components/CenteredDialogModal";
import { useColors } from "@/hooks/useColors";
import { useMarketPriceRef } from "@/hooks/useMarketTick";
import type { PortfolioAccountSnapshot } from "@/lib/portfolio/accounts/portfolioAccountSnapshot";
import { formatUsd, parsePositiveNumber } from "@/lib/portfolio/accounts/format";
import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import {
  walletService,
  WalletTransferError,
} from "@/lib/portfolio/wallets/WalletService";

type TransferDirection = "SPOT_TO_PERP" | "PERP_TO_SPOT";

type WalletTransferModalProps = {
  visible: boolean;
  accountId: string;
  accountSnapshot: PortfolioAccountSnapshot | null;
  onClose: () => void;
  onTransferred: () => void;
};

/**
 * Transfer form state is local and only initializes on visible false → true.
 * Market price ticks must not remount or reset inputs.
 */
export const WalletTransferModal = memo(function WalletTransferModal({
  visible,
  accountId,
  accountSnapshot,
  onClose,
  onTransferred,
}: WalletTransferModalProps) {
  const colors = useColors();
  const marketPriceRef = useMarketPriceRef(PORTFOLIO_V1_SYMBOL);
  const [direction, setDirection] = useState<TransferDirection>("SPOT_TO_PERP");
  const [amount, setAmount] = useState("");
  const [perpAvailable, setPerpAvailable] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const spotFree = accountSnapshot?.sizing.spotUsdtAvailable ?? 0;

  const wasVisibleRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      wasVisibleRef.current = false;
      return;
    }

    // Initialize only on open (false → true), never on price ticks.
    if (wasVisibleRef.current) return;
    wasVisibleRef.current = true;

    let active = true;
    setError(null);
    setAmount("");
    setDirection("SPOT_TO_PERP");
    setLoading(true);

    void (async () => {
      try {
        const perpBalance =
          accountSnapshot?.sizing.perpAvailable ??
          (
            await walletService.getPerpWallet(
              accountId,
              marketPriceRef.current ?? 0,
            )
          ).availableBalance;
        if (!active) return;
        setPerpAvailable(perpBalance);
      } catch (err: unknown) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "No se pudieron cargar wallets");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [accountId, accountSnapshot?.sizing.perpAvailable, visible]);

  const sourceBalance = direction === "SPOT_TO_PERP" ? spotFree : perpAvailable;

  const applyPercent = (percent: number) => {
    const value = (sourceBalance * percent) / 100;
    setAmount(value > 0 ? String(Number(value.toFixed(8))) : "");
  };

  const handleConfirm = async () => {
    setError(null);
    const value = parsePositiveNumber(amount);
    if (value == null) {
      setError("Ingresa un monto válido");
      return;
    }
    if (value > sourceBalance) {
      setError("Monto superior al saldo disponible");
      return;
    }

    setSubmitting(true);
    try {
      if (direction === "SPOT_TO_PERP") {
        await walletService.transferSpotToPerp(accountId, value);
      } else {
        await walletService.transferPerpToSpot(
          accountId,
          value,
          marketPriceRef.current ?? 0,
        );
      }
      onTransferred();
      setAmount("");
      const perp = await walletService.getPerpWallet(
        accountId,
        marketPriceRef.current ?? 0,
      );
      setPerpAvailable(perp.availableBalance);
    } catch (err: unknown) {
      const message =
        err instanceof WalletTransferError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Transferencia fallida";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const directionOptions = useMemo(
    () =>
      [
        { id: "SPOT_TO_PERP" as const, label: "Spot → Perp" },
        { id: "PERP_TO_SPOT" as const, label: "Perp → Spot" },
      ] as const,
    [],
  );

  return (
    <CenteredDialogModal visible={visible} title="Transferir USDT" onClose={onClose}>
      <View style={styles.body}>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <View style={styles.directionRow}>
              {directionOptions.map((option) => {
                const selected = direction === option.id;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => {
                      setDirection(option.id);
                      setAmount("");
                    }}
                    style={[
                      styles.directionChip,
                      {
                        borderColor: colors.border,
                        backgroundColor: selected ? colors.secondary : "transparent",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.directionText,
                        { color: selected ? colors.primary : colors.mutedForeground },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Saldo origen
            </Text>
            <Text style={[styles.balance, { color: colors.foreground }]}>
              {formatUsd(sourceBalance)}
            </Text>

            <Text style={[styles.label, { color: colors.mutedForeground }]}>Monto</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                },
              ]}
            />

            <View style={styles.percentRow}>
              {[25, 50, 100].map((percent) => (
                <Pressable
                  key={percent}
                  onPress={() => applyPercent(percent)}
                  style={[
                    styles.percentChip,
                    { borderColor: colors.border, backgroundColor: colors.secondary },
                  ]}
                >
                  <Text style={[styles.percentText, { color: colors.foreground }]}>
                    {percent}%
                  </Text>
                </Pressable>
              ))}
            </View>

            {error ? (
              <Text style={[styles.error, { color: colors.primary }]}>{error}</Text>
            ) : null}

            <Pressable
              onPress={() => void handleConfirm()}
              disabled={submitting}
              style={({ pressed }) => [
                styles.confirm,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed || submitting ? 0.8 : 1,
                },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.confirmText}>Confirmar transferencia</Text>
              )}
            </Pressable>
          </>
        )}
      </View>
    </CenteredDialogModal>
  );
});

const styles = StyleSheet.create({
  body: {
    gap: 12,
  },
  directionRow: {
    flexDirection: "row",
    gap: 8,
  },
  directionChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  directionText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  label: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  balance: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  percentRow: {
    flexDirection: "row",
    gap: 8,
  },
  percentChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  percentText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  error: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  confirm: {
    minHeight: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmText: {
    color: "#ffffff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
