import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { BottomSheetModal } from "@/components/BottomSheetModal";
import { formatPaperPnlPercent } from "@/components/portfolio/paperDisplay";
import { useColors } from "@/hooks/useColors";
import { usePortfolioSource } from "@/lib/portfolio";
import { signedValueColor } from "@/lib/portfolio/accounts/format";
import { usePortfolioAccountSession } from "@/lib/portfolio/accounts/usePortfolioAccountSession";
import type { PortfolioAccount } from "@/lib/portfolio/accounts/types";

type Props = {
  visible: boolean;
  account: PortfolioAccount | null;
  btcPrice: number | null;
  onClose: () => void;
};

function formatCreatedDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatUsdt(value: number): string {
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} USDT`;
}

export function PaperAccountInfoSheet({ visible, account, btcPrice, onClose }: Props) {
  const colors = useColors();
  const { deletePaperAccount, paperAccounts } = usePortfolioSource();
  const session = usePortfolioAccountSession(btcPrice, visible && account ? account.id : null);
  const [step, setStep] = useState<"info" | "confirm">("info");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setStep("info");
      setDeleting(false);
      setError(null);
    }
  }, [visible]);

  if (!account) return null;

  const canDelete = paperAccounts.length > 1;
  const state = session.state;
  const tradeCount = state?.trades.length ?? 0;
  const equity = state?.portfolio.equity ?? account.initialBalance;
  const returnPercent = state?.portfolio.totalReturnPercent ?? 0;
  const returnColor = signedValueColor(returnPercent, colors);

  const handleClose = () => {
    setStep("info");
    setError(null);
    onClose();
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deletePaperAccount(account.id);
      handleClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la cuenta");
    } finally {
      setDeleting(false);
    }
  };

  const title = step === "confirm" ? "Eliminar cuenta" : account.name;

  return (
    <BottomSheetModal visible={visible} title={title} onClose={handleClose}>
      {step === "confirm" ? (
        <>
          <Text style={[styles.confirmTitle, { color: colors.foreground }]}>
            ¿Eliminar esta cuenta?
          </Text>
          <Text style={[styles.confirmMessage, { color: colors.mutedForeground }]}>
            Esta acción borrará:{"\n"}• operaciones{"\n"}• posiciones{"\n"}• historial
          </Text>
          {error ? <Text style={[styles.error, { color: colors.primary }]}>{error}</Text> : null}
          <View style={styles.confirmActions}>
            <Pressable
              onPress={() => setStep("info")}
              disabled={deleting}
              style={({ pressed }) => [
                styles.confirmButton,
                styles.cancelButton,
                { borderColor: colors.border, opacity: pressed || deleting ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.cancelText, { color: colors.foreground }]}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleDelete()}
              disabled={deleting}
              style={({ pressed }) => [
                styles.confirmButton,
                { backgroundColor: colors.primary, opacity: pressed || deleting ? 0.8 : 1 },
              ]}
            >
              {deleting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.confirmText}>Eliminar</Text>
              )}
            </Pressable>
          </View>
        </>
      ) : (
        <>
          {session.isEngineLoading && !state ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
          ) : null}

          <InfoRow label="Creada" value={formatCreatedDate(account.createdAt)} />
          <InfoRow label="Capital inicial" value={formatUsdt(account.initialBalance)} />
          <InfoRow label="Valor actual" value={formatUsdt(equity)} />
          <InfoRow
            label="Retorno"
            value={formatPaperPnlPercent(returnPercent)}
            valueColor={returnColor}
          />
          <InfoRow label="Operaciones" value={String(tradeCount)} />
          <InfoRow label="Broker" value="Paper Trading" />
          <InfoRow label="Comisiones" value="0%" />

          {canDelete ? (
            <Pressable
              onPress={() => setStep("confirm")}
              style={({ pressed }) => [
                styles.deleteButton,
                { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={styles.deleteText}>Eliminar cuenta</Text>
            </Pressable>
          ) : (
            <Text style={[styles.guardText, { color: colors.mutedForeground }]}>
              Debe existir al menos una cuenta Paper.
            </Text>
          )}
        </>
      )}
    </BottomSheetModal>
  );
}

function InfoRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: valueColor ?? colors.foreground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  infoValue: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  deleteButton: {
    marginTop: 20,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  deleteText: {
    color: "#ffffff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  guardText: {
    marginTop: 20,
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    lineHeight: 16,
  },
  confirmTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  confirmMessage: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    marginBottom: 16,
  },
  error: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginBottom: 8,
  },
  confirmActions: {
    flexDirection: "row",
    gap: 10,
  },
  confirmButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelButton: {
    borderWidth: 1,
  },
  cancelText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  confirmText: {
    color: "#ffffff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
});
