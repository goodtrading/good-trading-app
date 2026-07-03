import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { PaperPortfolioHeader } from "@/components/portfolio/PaperPortfolioHeader";
import { PaperPortfolioOnboarding } from "@/components/portfolio/PaperPortfolioOnboarding";
import { PaperPositionDetailSheet } from "@/components/portfolio/PaperPositionDetailSheet";
import { PaperTradeSheet } from "@/components/portfolio/PaperTradeSheet";
import { computePositionReturnPercent } from "@/components/portfolio/paperDisplay";
import { useColors } from "@/hooks/useColors";
import { usePortfolioSource } from "@/lib/portfolio";
import {
  displaySymbol,
  formatQuantity,
  formatSignedUsd,
  formatUsd,
  signedValueColor,
} from "@/lib/portfolio/accounts/format";
import { usePortfolioAccountSession } from "@/lib/portfolio/accounts/usePortfolioAccountSession";
import type { Position } from "@/lib/portfolio/types";

type Props = {
  accountId: string | null;
  btcPrice: number | null;
  ethPrice: number | null;
  isLive: boolean;
  isPriceLoading: boolean;
};

export function PaperPortfolioScreen({
  accountId,
  btcPrice,
  ethPrice,
  isLive,
  isPriceLoading,
}: Props) {
  const colors = useColors();
  const { createPaperAccount } = usePortfolioSource();
  const session = usePortfolioAccountSession(btcPrice, accountId);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);

  useEffect(() => {
    setSelectedPosition(null);
    setTradeOpen(false);
  }, [accountId]);

  if (session.isBootstrapping) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!session.account) {
    return (
      <PaperPortfolioOnboarding
        onCreate={async (name, initialBalance) => {
          await createPaperAccount(name, initialBalance);
        }}
      />
    );
  }

  const { account, state, isEngineLoading, error } = session;

  const handleSelectPosition = (position: Position) => {
    setSelectedPosition(position);
  };

  return (
    <View style={styles.container}>
      {isPriceLoading && btcPrice == null ? (
        <View style={[styles.priceBanner, { borderColor: colors.border }]}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={[styles.priceBannerText, { color: colors.mutedForeground }]}>
            Conectando precio BTC en vivo…
          </Text>
        </View>
      ) : null}

      {!isLive && btcPrice == null ? (
        <Text style={[styles.priceWarning, { color: colors.primary }]}>
          Precio BTC no disponible. Los valores se actualizarán cuando el feed esté activo.
        </Text>
      ) : null}

      {isEngineLoading && !state ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 8 }} />
      ) : null}

      {error ? <Text style={[styles.error, { color: colors.primary }]}>{error}</Text> : null}

      {state && btcPrice != null ? (
        <PaperPortfolioHeader
          equityUsd={state.portfolio.equity}
          totalReturnPercent={state.portfolio.totalReturnPercent}
          initialBalance={account.initialBalance}
          cashBalance={state.portfolio.cashBalance}
          conversionRates={{ btc: btcPrice, eth: ethPrice ?? btcPrice }}
        />
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Posiciones abiertas</Text>
        <Pressable
          onPress={() => setTradeOpen(true)}
          hitSlop={8}
          disabled={btcPrice == null}
          style={({ pressed }) => [
            styles.sectionCta,
            { opacity: pressed || btcPrice == null ? 0.5 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Nueva operación"
        >
          <Feather name="plus" size={13} color={colors.primary} />
          <Text style={[styles.sectionCtaText, { color: colors.primary }]}>Nueva operación</Text>
        </Pressable>
      </View>

      {state?.positions.map((position) => {
        const pnlColor = signedValueColor(position.unrealizedPnL, colors);
        const returnPercent = computePositionReturnPercent(position);
        const returnColor = signedValueColor(returnPercent, colors);

        return (
          <Pressable
            key={position.symbol}
            onPress={() => handleSelectPosition(position)}
            style={({ pressed }) => [
              styles.positionRow,
              {
                borderColor: colors.border,
                backgroundColor: colors.card,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <View style={styles.positionLeft}>
              <Text style={[styles.positionSymbol, { color: colors.foreground }]}>
                {displaySymbol(position.symbol)}
              </Text>
              <Text style={[styles.positionQty, { color: colors.mutedForeground }]}>
                {formatQuantity(position.quantity)} {displaySymbol(position.symbol)}
              </Text>
              <Text style={[styles.positionPrice, { color: colors.mutedForeground }]}>
                {formatUsd(position.marketPrice)}
              </Text>
            </View>

            <View style={styles.positionRight}>
              <View style={styles.positionPnlBlock}>
                <Text style={[styles.positionPnl, { color: pnlColor }]}>
                  {formatSignedUsd(position.unrealizedPnL)}
                </Text>
                <Text style={[styles.positionReturn, { color: returnColor }]}>
                  {returnPercent > 0 ? "+" : ""}
                  {returnPercent.toFixed(2)}%
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </View>
          </Pressable>
        );
      })}

      <PaperTradeSheet
        visible={tradeOpen}
        onClose={() => setTradeOpen(false)}
        onBuy={session.buy}
        onSell={session.sell}
        defaultPrice={btcPrice ?? 0}
      />

      <PaperPositionDetailSheet
        visible={selectedPosition != null}
        position={selectedPosition}
        trades={state?.trades ?? []}
        onClose={() => setSelectedPosition(null)}
        onConfirmDelete={session.deletePosition}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    marginBottom: 12,
  },
  loadingWrap: {
    paddingVertical: 24,
    alignItems: "center",
  },
  priceBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  priceBannerText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  priceWarning: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    lineHeight: 16,
  },
  error: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  sectionCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sectionCtaText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
  },
  positionRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  positionLeft: {
    flex: 1,
    gap: 2,
  },
  positionSymbol: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  positionQty: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  positionPrice: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  positionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  positionPnlBlock: {
    alignItems: "flex-end",
    gap: 2,
  },
  positionPnl: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  positionReturn: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
});
