import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { CenteredDialogModal } from "@/components/CenteredDialogModal";
import {
  computeLivePositionMetrics,
  type PositionCardViewModel,
} from "@/components/portfolio/positionCardModel";
import { TradeMarginInput } from "@/components/portfolio/TradeMarginInput";
import {
  TradeMetaCard,
  TradeMetaRow,
} from "@/components/portfolio/TradeSummaryCard";
import { useColors } from "@/hooks/useColors";
import { useMarketTick } from "@/hooks/useMarketTick";
import type { PortfolioAccountSnapshot } from "@/lib/portfolio/accounts/portfolioAccountSnapshot";
import {
  formatQuantity,
  formatSignedUsd,
  formatUsd,
  parsePositiveNumber,
  signedValueColor,
} from "@/lib/portfolio/accounts/format";
import {
  closeQuantityFromPercent,
  formatCloseQuantity,
  isHundredPercent,
  maxCloseQuantity,
  validateCloseQuantity,
  type CanonicalClosePosition,
} from "@/lib/portfolio/sizing/PositionSizing";

type ClosePositionConfirmModalProps = {
  visible: boolean;
  /** Snapshot at open — must not reset when mark ticks. */
  view: PositionCardViewModel | null;
  accountSnapshot: PortfolioAccountSnapshot | null;
  submitting?: boolean;
  onClose: () => void;
  onConfirm: (quantity: number) => void;
};

/** Static position facts — isolated from mark ticks. */
const StaticCloseDetails = memo(function StaticCloseDetails({
  view,
  canonicalQuantity,
}: {
  view: PositionCardViewModel;
  canonicalQuantity: number;
}) {
  const colors = useColors();
  const sideColor = view.sideIsLong ? colors.success : colors.primary;

  return (
    <View style={styles.staticBlock}>
      <View style={styles.titleRow}>
        <Text style={[styles.symbol, { color: colors.foreground }]}>{view.symbol}</Text>
        <View
          style={[
            styles.badge,
            { borderColor: colors.border, backgroundColor: colors.secondary },
          ]}
        >
          <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>
            {view.domain === "SPOT" ? "SPOT" : "PERP"}
          </Text>
        </View>
        <View style={[styles.badge, { borderColor: colors.border, backgroundColor: sideColor }]}>
          <Text style={styles.sideBadgeText}>{view.sideLabel}</Text>
        </View>
      </View>

      <TradeMetaCard>
        <TradeMetaRow label="Precio de entrada" value={formatUsd(view.avgEntry)} />
        <TradeMetaRow
          label="Posición total"
          value={`${formatQuantity(canonicalQuantity, 6)} ${view.quantityAsset}`}
        />
      </TradeMetaCard>
    </View>
  );
});

/** Live mark + PnL only — subscribes directly to tick store. */
const LiveCloseMetrics = memo(function LiveCloseMetrics({
  view,
  closeQuantity,
  positionQuantity,
}: {
  view: PositionCardViewModel;
  closeQuantity: number;
  positionQuantity: number;
}) {
  const colors = useColors();
  const { price: mark } = useMarketTick(view.symbol);
  const ratio = positionQuantity > 0 ? closeQuantity / positionQuantity : 0;
  const scaledView = useMemo(
    () => ({
      ...view,
      quantity: closeQuantity,
      unrealizedPnL: view.unrealizedPnL * ratio,
    }),
    [closeQuantity, ratio, view],
  );
  const live = computeLivePositionMetrics(scaledView, mark ?? 0);
  const pnlColor = signedValueColor(live.unrealizedPnL, colors);

  return (
    <TradeMetaCard>
      <TradeMetaRow
        label="Precio de mercado actual"
        value={formatUsd(live.markPrice)}
      />
      <View style={styles.pnlRow}>
        <Text style={[styles.pnlLabel, { color: colors.mutedForeground }]}>
          PnL estimado
        </Text>
        <Text style={[styles.pnlValue, { color: pnlColor }]} numberOfLines={2}>
          {formatSignedUsd(live.unrealizedPnL)}
        </Text>
      </View>
    </TradeMetaCard>
  );
});

/**
 * Close confirmation — executes only after explicit Confirm with selected quantity.
 * All sizing and validation via PositionSizing.validateCloseQuantity.
 */
export function ClosePositionConfirmModal({
  visible,
  view,
  accountSnapshot,
  submitting = false,
  onClose,
  onConfirm,
}: ClosePositionConfirmModalProps) {
  const colors = useColors();
  const [closePercent, setClosePercent] = useState(100);
  const [quantityInput, setQuantityInput] = useState("");
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const openSymbolRef = useRef<string | null>(null);

  const position: CanonicalClosePosition | null = view
    ? { symbol: view.symbol, quantity: view.quantity }
    : null;

  const canonicalPositionQuantity = position
    ? maxCloseQuantity(position)
    : 0;

  const resolveCloseQtyForPercent = useCallback(
    (percent: number) => {
      if (!position || !(position.quantity > 0)) return 0;
      if (accountSnapshot) {
        return accountSnapshot.sizing.closeQuantity(position.symbol, percent);
      }
      return closeQuantityFromPercent(
        position.symbol,
        position.quantity,
        percent,
      );
    },
    [accountSnapshot, position],
  );

  const applyFullCloseInput = useCallback(() => {
    if (!position) return;
    const qty = maxCloseQuantity(position);
    setQuantityInput(formatCloseQuantity(position.symbol, qty));
  }, [position]);

  useEffect(() => {
    if (!visible || !view || !position) {
      openSymbolRef.current = null;
      return;
    }
    if (openSymbolRef.current === view.symbol) return;
    openSymbolRef.current = view.symbol;
    setClosePercent(100);
    applyFullCloseInput();
    setQuantityError(null);
  }, [visible, view, position, applyFullCloseInput]);

  const applyClosePercent = useCallback(
    (percent: number) => {
      const clamped = Math.min(100, Math.max(0, percent));
      setClosePercent(clamped);
      if (isHundredPercent(clamped)) {
        applyFullCloseInput();
      } else {
        const qty = resolveCloseQtyForPercent(clamped);
        setQuantityInput(
          position && qty > 0
            ? formatCloseQuantity(position.symbol, qty)
            : "",
        );
      }
      setQuantityError(null);
    },
    [applyFullCloseInput, position, resolveCloseQtyForPercent],
  );

  const handleQuantityChange = useCallback(
    (value: string) => {
      setQuantityInput(value);
      const parsed = parsePositiveNumber(value);
      if (parsed == null || !position || canonicalPositionQuantity <= 0) {
        setClosePercent(0);
        return;
      }
      const validation = validateCloseQuantity(position, parsed);
      if (validation.isFullClose) {
        setClosePercent(100);
      } else if (validation.valid) {
        const pct = (validation.normalizedQuantity / canonicalPositionQuantity) * 100;
        setClosePercent(Math.min(100, pct));
      } else {
        setClosePercent(0);
      }
      setQuantityError(null);
    },
    [canonicalPositionQuantity, position],
  );

  const parsedQuantity = parsePositiveNumber(quantityInput);
  const closeValidation = position
    ? validateCloseQuantity(position, parsedQuantity)
    : null;
  const closeQuantity = closeValidation?.normalizedQuantity ?? 0;

  const handleConfirm = () => {
    if (!position || !closeValidation) return;
    if (!closeValidation.valid) {
      if (closeValidation.exceedsPosition) {
        setQuantityError("La cantidad supera la posición abierta");
      } else {
        setQuantityError("Indica una cantidad válida");
      }
      return;
    }
    onConfirm(closeValidation.executableQuantity);
  };

  const isOpen = visible && view != null;

  return (
    <CenteredDialogModal
      visible={isOpen}
      title="Cerrar Posición"
      onClose={onClose}
    >
      {view && position ? (
        <View style={styles.body}>
          <StaticCloseDetails view={view} canonicalQuantity={canonicalPositionQuantity} />

          <TradeMarginInput
            inputLabel="Cantidad"
            unitLabel={view.quantityAsset}
            margin={quantityInput}
            onMarginChange={handleQuantityChange}
            balancePercent={closePercent}
            onBalancePercentChange={applyClosePercent}
            availableBalanceLabel={`Disponible: ${formatCloseQuantity(view.symbol, canonicalPositionQuantity)} ${view.quantityAsset}`}
            quantityDisplay=""
            showQuantityPreview={false}
            onMaxPress={() => {
              setClosePercent(100);
              applyFullCloseInput();
              setQuantityError(null);
            }}
            error={quantityError ?? undefined}
          />

          <LiveCloseMetrics
            view={view}
            closeQuantity={closeQuantity || canonicalPositionQuantity}
            positionQuantity={canonicalPositionQuantity}
          />

          <View style={styles.footer}>
            <Pressable
              onPress={handleConfirm}
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
                <Text style={styles.confirmText}>Confirmar</Text>
              )}
            </Pressable>

            <Pressable
              onPress={onClose}
              disabled={submitting}
              style={({ pressed }) => [
                styles.cancel,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.secondary,
                  opacity: pressed || submitting ? 0.7 : 1,
                },
              ]}
            >
              <Text style={[styles.cancelText, { color: colors.foreground }]}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </CenteredDialogModal>
  );
}

const styles = StyleSheet.create({
  body: {
    flexDirection: "column",
    alignItems: "stretch",
    alignSelf: "stretch",
    width: "100%",
    gap: 16,
    paddingBottom: 4,
  },
  staticBlock: {
    flexDirection: "column",
    alignItems: "stretch",
    alignSelf: "stretch",
    width: "100%",
    gap: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    alignSelf: "stretch",
    width: "100%",
    gap: 8,
  },
  symbol: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: "Inter_600SemiBold",
  },
  sideBadgeText: {
    color: "#ffffff",
    fontSize: 11,
    lineHeight: 14,
    fontFamily: "Inter_600SemiBold",
  },
  pnlRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    alignSelf: "stretch",
    width: "100%",
    minHeight: 20,
    gap: 12,
  },
  pnlLabel: {
    flex: 1,
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Inter_500Medium",
  },
  pnlValue: {
    flexShrink: 0,
    maxWidth: "55%",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
  },
  footer: {
    flexDirection: "column",
    alignItems: "stretch",
    alignSelf: "stretch",
    width: "100%",
    gap: 10,
    paddingTop: 4,
  },
  confirm: {
    alignSelf: "stretch",
    width: "100%",
    minHeight: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  confirmText: {
    color: "#ffffff",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_600SemiBold",
  },
  cancel: {
    alignSelf: "stretch",
    width: "100%",
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  cancelText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_600SemiBold",
  },
});
