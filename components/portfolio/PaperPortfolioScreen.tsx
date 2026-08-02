import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { ClosePositionConfirmModal } from "@/components/portfolio/ClosePositionConfirmModal";
import { EditTpSlModal } from "@/components/portfolio/EditTpSlModal";
import { OpenOrdersList } from "@/components/portfolio/OpenOrdersList";
import { OpenPositionCard } from "@/components/portfolio/OpenPositionCard";
import { PaperPortfolioHeader } from "@/components/portfolio/PaperPortfolioHeader";
import { PaperPortfolioOnboarding } from "@/components/portfolio/PaperPortfolioOnboarding";
import { SpotTradeHistoryList } from "@/components/portfolio/SpotTradeHistoryList";
import { TradeEntryModal } from "@/components/portfolio/TradeEntryModal";
import { TradeHistoryList } from "@/components/portfolio/TradeHistoryList";
import { WalletTransferModal } from "@/components/portfolio/WalletTransferModal";
import {
  spotPositionToCardView,
  perpPositionToCardView,
  type PositionCardViewModel,
} from "@/components/portfolio/positionCardModel";
import { useColors } from "@/hooks/useColors";
import { getMarketPrice, useMarketFeed } from "@/hooks/useMarketTick";
import { usePortfolioAccountSnapshot } from "@/hooks/usePortfolioAccountSnapshot";
import {
  useSpotOpenOrderEntities,
  useSpotOpenPositions,
  useSpotTrades,
} from "@/hooks/useSpotLedger";
import { financialsForMode } from "@/lib/portfolio/accounts/portfolioAccountSnapshot";
import type { PortfolioAccountSnapshot } from "@/lib/portfolio/accounts/portfolioAccountSnapshot";
import { validateCloseQuantity } from "@/lib/portfolio/sizing/PositionSizing";
import { useTradingMode } from "@/lib/cartera/context/TradingModeContext";
import type { TradingWorkspaceTab } from "@/lib/cartera/storage/tradingModePreference";
import { usePortfolioSource } from "@/lib/portfolio";
import { usePortfolioAccountSession } from "@/lib/portfolio/accounts/usePortfolioAccountSession";
import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import { buildTradeHistoryFromLedger } from "@/lib/portfolio/history/tradeHistoryFromLedger";
import { buildPositionId } from "@/lib/portfolio/orderRegistry/OrderEntity";
import type { OrderEntity } from "@/lib/portfolio/orderRegistry/OrderEntity";
import { buildSpotPositionId } from "@/lib/portfolio/spot/spotSymbol";
import { spotLedgerRuntime } from "@/lib/portfolio/spot/SpotLedgerRuntime";
import { spotLedgerStore } from "@/lib/portfolio/spot/SpotLedgerStore";
import { spotPositionRuntime } from "@/lib/portfolio/spot/SpotPositionRuntime";
import type { PortfolioEngineState } from "@/lib/portfolio/types";
import { walletService } from "@/lib/portfolio/wallets/WalletService";
import type {
  PerpWalletSnapshot,
} from "@/lib/portfolio/wallets/types";
import type { PortfolioAccount } from "@/lib/portfolio/accounts/types";

type Props = {
  accountId: string | null;
};

const PositionsBlock = memo(function PositionsBlock({
  cards,
  title,
  emptyLabel,
  closingSymbol,
  onClose,
  onEditTpSl,
}: {
  cards: PositionCardViewModel[];
  title: string;
  emptyLabel: string;
  closingSymbol: string | null;
  onClose?: (symbol: string) => void;
  onEditTpSl?: (symbol: string) => void;
}) {
  const colors = useColors();

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      {cards.length === 0 ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>{emptyLabel}</Text>
      ) : (
        <View style={styles.positionsList}>
          {cards.map((card) => (
            <OpenPositionCard
              key={card.id}
              view={card}
              closing={closingSymbol === card.symbol}
              onClosePress={onClose ? () => onClose(card.symbol) : undefined}
              onTpSlPress={onEditTpSl ? () => onEditTpSl(card.symbol) : undefined}
            />
          ))}
        </View>
      )}
    </View>
  );
});

/** SPOT header — consumes canonical account snapshot only. */
const SpotBalanceHeaderSlice = memo(function SpotBalanceHeaderSlice({
  snapshot,
  account,
  conversionRates,
  onTransferPress,
}: {
  snapshot: PortfolioAccountSnapshot;
  account: PortfolioAccount;
  conversionRates: { btc: number; eth: number };
  onTransferPress: () => void;
}) {
  const financials = financialsForMode(snapshot, "SPOT");

  return (
    <PaperPortfolioHeader
      mode="SPOT"
      walletBalance={financials.walletBalance}
      availableBalance={financials.availableBalance}
      equity={financials.equity}
      totalReturnPercent={
        account.initialBalance > 0
          ? Number(
              (
                ((financials.equity - account.initialBalance) /
                  account.initialBalance) *
                100
              ).toFixed(4),
            )
          : 0
      }
      conversionRates={conversionRates}
      onTransferPress={onTransferPress}
    />
  );
});

/** SPOT positions tab — subscribes to SpotPosition read model only. */
const SpotPositionsSlice = memo(function SpotPositionsSlice({
  accountId,
  closingSymbol,
  onClose,
  onEditTpSl,
}: {
  accountId: string;
  closingSymbol: string | null;
  onClose: (symbol: string) => void;
  onEditTpSl: (symbol: string) => void;
}) {
  const positions = useSpotOpenPositions(accountId);
  const cards = useMemo(
    () => positions.map(spotPositionToCardView),
    [positions],
  );

  return (
    <PositionsBlock
      cards={cards}
      title="Activos"
      emptyLabel="Sin activos abiertos"
      closingSymbol={closingSymbol}
      onClose={onClose}
      onEditTpSl={onEditTpSl}
    />
  );
});

/** SPOT history tab — subscribes to trades only. */
const SpotHistorySlice = memo(function SpotHistorySlice({
  accountId,
}: {
  accountId: string;
}) {
  const trades = useSpotTrades(accountId);
  return <SpotTradeHistoryList trades={trades} />;
});

/** SPOT orders tab — subscribes to open orders only. */
const SpotOrdersSlice = memo(function SpotOrdersSlice({
  accountId,
  onCancel,
}: {
  accountId: string;
  onCancel: (orderId: string) => void;
}) {
  const orders = useSpotOpenOrderEntities(accountId);
  return <OpenOrdersList orders={orders} onCancel={onCancel} />;
});

export function PaperPortfolioScreen({ accountId }: Props) {
  const colors = useColors();
  const feed = useMarketFeed();
  const { createPaperAccount } = usePortfolioSource();
  const { mode, setMode, workspaceTab, setWorkspaceTab } = useTradingMode();
  const session = usePortfolioAccountSession(accountId);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [tpSlCard, setTpSlCard] = useState<PositionCardViewModel | null>(null);
  /** Snapshot for close confirmation — CLOSE_POSITION only after Confirm. */
  const [closeConfirmView, setCloseConfirmView] =
    useState<PositionCardViewModel | null>(null);
  const [closingSymbol, setClosingSymbol] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [perpWallet, setPerpWallet] = useState<PerpWalletSnapshot | null>(null);
  const [conversionRates, setConversionRates] = useState({ btc: 0, eth: 0 });

  const isSpot = mode === "SPOT";

  const refreshConversionRates = useCallback(() => {
    setConversionRates({
      btc: getMarketPrice("BTCUSDT") ?? 0,
      eth: getMarketPrice("ETHUSDT") ?? getMarketPrice("BTCUSDT") ?? 0,
    });
  }, []);

  const modeRef = useRef(mode);
  modeRef.current = mode;
  const blockSwipeRef = useRef(false);
  blockSwipeRef.current =
    tradeOpen || transferOpen || tpSlCard != null || closeConfirmView != null;

  const openTransfer = useCallback(() => setTransferOpen(true), []);
  const closeTransfer = useCallback(() => setTransferOpen(false), []);
  const openTrade = useCallback(() => setTradeOpen(true), []);
  const closeTrade = useCallback(() => setTradeOpen(false), []);

  const swipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
          if (blockSwipeRef.current) return false;
          const absDx = Math.abs(gesture.dx);
          const absDy = Math.abs(gesture.dy);
          // Horizontal intent only — leave vertical scroll / lists alone.
          return absDx > 24 && absDx > absDy * 1.8;
        },
        onPanResponderTerminationRequest: () => true,
        onPanResponderRelease: (_, gesture) => {
          if (blockSwipeRef.current) return;
          const SWIPE_DISTANCE = 56;
          const SWIPE_VELOCITY = 0.35;
          const wentLeft =
            gesture.dx <= -SWIPE_DISTANCE || gesture.vx <= -SWIPE_VELOCITY;
          const wentRight =
            gesture.dx >= SWIPE_DISTANCE || gesture.vx >= SWIPE_VELOCITY;
          if (wentLeft && modeRef.current === "SPOT") {
            setMode("PERP");
            return;
          }
          if (wentRight && modeRef.current === "PERP") {
            setMode("SPOT");
          }
        },
      }),
    [setMode],
  );

  useEffect(() => {
    setTradeOpen(false);
    setTransferOpen(false);
    setTpSlCard(null);
    setCloseConfirmView(null);
    setClosingSymbol(null);
    setActionError(null);
    setPerpWallet(null);
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return;
    void spotLedgerRuntime.start(accountId, { createIfMissing: true, initialUsdt: 0 });
    void spotPositionRuntime.start(accountId);
  }, [accountId]);

  const state: PortfolioEngineState | null = session.state;
  const markPrice = getMarketPrice(PORTFOLIO_V1_SYMBOL) ?? 0;
  const accountSnapshot = usePortfolioAccountSnapshot({
    accountId,
    markPrice,
    perpWallet,
    perpState: state,
  });

  const refreshPerpWallet = useCallback(async () => {
    if (!accountId) {
      setPerpWallet(null);
      return;
    }
    const mark = getMarketPrice(PORTFOLIO_V1_SYMBOL) ?? 0;
    setPerpWallet(await walletService.getPerpWallet(accountId, mark));
    refreshConversionRates();
  }, [accountId, refreshConversionRates]);

  const refreshWallets = useCallback(async () => {
    if (!accountId) return;
    if (isSpot) {
      await spotLedgerRuntime.start(accountId, { createIfMissing: true, initialUsdt: 0 });
      await spotPositionRuntime.start(accountId);
      setPerpWallet(null);
      refreshConversionRates();
      return;
    }
    await refreshPerpWallet();
  }, [accountId, isSpot, refreshConversionRates, refreshPerpWallet]);

  const refreshBothWallets = useCallback(async () => {
    if (!accountId) return;
    await spotLedgerRuntime.start(accountId, { createIfMissing: true, initialUsdt: 0 });
    await spotPositionRuntime.start(accountId);
    refreshConversionRates();
    const mark = getMarketPrice(PORTFOLIO_V1_SYMBOL) ?? 0;
    setPerpWallet(await walletService.getPerpWallet(accountId, mark));
  }, [accountId, refreshConversionRates]);

  useEffect(() => {
    void refreshWallets();
  }, [refreshWallets, isSpot ? null : state?.portfolio.walletBalance]);

  const perpHistoryRows = useMemo(
    () => (isSpot ? [] : buildTradeHistoryFromLedger(state?.trades ?? [])),
    [isSpot, state?.trades],
  );

  const linkedOrdersForEdit: OrderEntity[] = useMemo(() => {
    if (!tpSlCard || !accountId) return [];
    if (tpSlCard.domain === "SPOT") {
      const positionId = buildSpotPositionId(accountId, tpSlCard.quantityAsset);
      return session.openOrders.filter((order) => order.positionId === positionId);
    }
    const positionId = buildPositionId(accountId, tpSlCard.symbol);
    return session.openOrders.filter((order) => order.positionId === positionId);
  }, [accountId, session.openOrders, tpSlCard]);

  const spotCardsFromStore = useCallback(() => {
    if (!accountId) return [];
    return spotLedgerStore
      .getOpenPositionsSnapshot(accountId)
      .map(spotPositionToCardView);
  }, [accountId]);

  const perpCards = useMemo(
    () =>
      isSpot
        ? []
        : (state?.positions ?? []).map((p) =>
            perpPositionToCardView(p, accountSnapshot?.perp?.walletBalance ?? state?.portfolio.walletBalance ?? 0),
          ),
    [isSpot, state?.positions, state?.portfolio.walletBalance, accountSnapshot?.perp?.walletBalance],
  );

  const closePosition = session.closePosition;
  const buy = session.buy;
  const sell = session.sell;
  const updatePositionTpSl = session.updatePositionTpSl;
  const refreshSession = session.refresh;
  const cancelOrder = session.cancelOrder;
  const executeTrade = session.executeTrade;

  const handleClosePosition = useCallback(
    async (symbol: string) => {
      setActionError(null);
      setClosingSymbol(symbol);
      try {
        await closePosition(symbol);
        if (!isSpot) {
          void refreshWallets();
        }
      } catch (err: unknown) {
        setActionError(err instanceof Error ? err.message : "No se pudo cerrar la posición");
      } finally {
        setClosingSymbol(null);
      }
    },
    [closePosition, isSpot, refreshWallets],
  );

  const handleSaveTpSl = useCallback(
    async (takeProfitPrice: number | null, stopLossPrice: number | null) => {
      if (!tpSlCard) return;
      await updatePositionTpSl(tpSlCard.symbol, takeProfitPrice, stopLossPrice);
      if (tpSlCard.domain !== "SPOT") {
        void refreshWallets();
      }
    },
    [refreshWallets, tpSlCard, updatePositionTpSl],
  );

  const handleTradeExecuted = useCallback(() => {
    if (!isSpot) {
      refreshSession();
      void refreshWallets();
    }
  }, [isSpot, refreshSession, refreshWallets]);

  const handleTransferred = useCallback(() => {
    refreshSession();
    void refreshBothWallets();
  }, [refreshBothWallets, refreshSession]);

  const onClosePositionPress = useCallback(
    (symbol: string) => {
      const card =
        spotCardsFromStore().find((entry) => entry.symbol === symbol) ??
        perpCards.find((entry) => entry.symbol === symbol) ??
        null;
      if (card) setCloseConfirmView(card);
    },
    [perpCards, spotCardsFromStore],
  );

  const dismissCloseConfirm = useCallback(() => {
    if (closingSymbol != null) return;
    setCloseConfirmView(null);
  }, [closingSymbol]);

  const confirmClosePosition = useCallback(
    async (quantity: number) => {
      if (!closeConfirmView) return;
      const symbol = closeConfirmView.symbol;
      const positionQty = closeConfirmView.quantity;
      const closeCheck = validateCloseQuantity(
        { symbol, quantity: positionQty },
        quantity,
      );
      const fullClose = closeCheck.isFullClose;

      setActionError(null);
      setClosingSymbol(symbol);
      try {
        if (fullClose) {
          await closePosition(symbol);
        } else {
          const mark = getMarketPrice(symbol) ?? 0;
          if (!(mark > 0)) {
            throw new Error("Precio de mercado no disponible");
          }
          const execQty = closeCheck.executableQuantity;
          if (closeConfirmView.sideIsLong) {
            await sell(execQty, mark);
          } else {
            await buy(execQty, mark);
          }
        }
        if (!isSpot) {
          void refreshWallets();
        }
      } catch (err: unknown) {
        setActionError(err instanceof Error ? err.message : "No se pudo cerrar la posición");
      } finally {
        setClosingSymbol(null);
        setCloseConfirmView(null);
      }
    },
    [buy, closeConfirmView, closePosition, isSpot, refreshWallets, sell],
  );

  const onEditTpSlPress = useCallback(
    (symbol: string) => {
      const card =
        spotCardsFromStore().find((entry) => entry.symbol === symbol) ??
        perpCards.find((entry) => entry.symbol === symbol) ??
        null;
      if (card) setTpSlCard(card);
    },
    [perpCards, spotCardsFromStore],
  );

  const workspaceTabs = useMemo(
    () =>
      [
        { id: "positions" as TradingWorkspaceTab, label: isSpot ? "Activos" : "Posiciones" },
        { id: "orders" as TradingWorkspaceTab, label: "Órdenes" },
        { id: "history" as TradingWorkspaceTab, label: "Historial" },
      ] as const,
    [isSpot],
  );

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

  const { account, isEngineLoading, error } = session;

  const showBalanceHeader = isSpot ? accountId != null : perpWallet != null;

  const showPerpLoading = !isSpot && isEngineLoading && !state;

  return (
    <View style={styles.container} {...swipeResponder.panHandlers}>
      {feed.isLoading && !feed.isLive ? (
        <View style={[styles.priceBanner, { borderColor: colors.border }]}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={[styles.priceBannerText, { color: colors.mutedForeground }]}>
            Conectando precio BTC en vivo…
          </Text>
        </View>
      ) : null}

      {!feed.isLive ? (
        <Text style={[styles.priceWarning, { color: colors.primary }]}>
          Precio BTC no disponible. Los valores se actualizarán cuando el feed esté activo.
        </Text>
      ) : null}

      {showPerpLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 8 }} />
      ) : null}

      {error && !isSpot ? (
        <Text style={[styles.error, { color: colors.primary }]}>{error}</Text>
      ) : null}
      {actionError ? (
        <Text style={[styles.error, { color: colors.primary }]}>{actionError}</Text>
      ) : null}

      {showBalanceHeader && isSpot && account && accountSnapshot ? (
        <SpotBalanceHeaderSlice
          snapshot={accountSnapshot}
          account={account}
          conversionRates={conversionRates}
          onTransferPress={openTransfer}
        />
      ) : null}

      {showBalanceHeader && !isSpot && accountSnapshot?.perp ? (
        <PaperPortfolioHeader
          mode="PERP"
          walletBalance={accountSnapshot.perp.walletBalance}
          availableBalance={accountSnapshot.perp.availableBalance}
          equity={accountSnapshot.perp.equity}
          totalReturnPercent={state?.portfolio.totalReturnPercent ?? 0}
          conversionRates={conversionRates}
          onTransferPress={openTransfer}
        />
      ) : null}

      <Pressable
        onPress={openTrade}
        disabled={!feed.isLive}
        style={({ pressed }) => [
          styles.newTradeButton,
          {
            borderColor: colors.border,
            backgroundColor: colors.secondary,
            opacity: pressed || !feed.isLive ? 0.55 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Nueva operación"
      >
        <Feather name="plus" size={14} color={colors.primary} />
        <Text style={[styles.newTradeText, { color: colors.primary }]}>Nueva operación</Text>
      </Pressable>

      <View style={styles.workspaceTabs}>
        {workspaceTabs.map((tab) => {
          const selected = workspaceTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              onPress={() => setWorkspaceTab(tab.id)}
              style={[
                styles.workspaceTab,
                {
                  borderColor: colors.border,
                  backgroundColor: selected ? colors.secondary : "transparent",
                },
              ]}
            >
              <Text
                style={[
                  styles.workspaceTabText,
                  { color: selected ? colors.primary : colors.mutedForeground },
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {workspaceTab === "positions" && isSpot && accountId ? (
        <SpotPositionsSlice
          accountId={accountId}
          closingSymbol={closingSymbol}
          onClose={onClosePositionPress}
          onEditTpSl={onEditTpSlPress}
        />
      ) : null}

      {workspaceTab === "positions" && !isSpot ? (
        <PositionsBlock
          cards={perpCards}
          title="Posiciones abiertas"
          emptyLabel="Sin posiciones abiertas"
          closingSymbol={closingSymbol}
          onClose={onClosePositionPress}
          onEditTpSl={onEditTpSlPress}
        />
      ) : null}

      {workspaceTab === "orders" && isSpot && accountId ? (
        <SpotOrdersSlice
          accountId={accountId}
          onCancel={(orderId) => {
            void cancelOrder(orderId);
          }}
        />
      ) : null}

      {workspaceTab === "orders" && !isSpot ? (
        <OpenOrdersList
          orders={session.openOrders}
          onCancel={(orderId) => {
            void cancelOrder(orderId).then(() => {
              void refreshWallets();
            });
          }}
        />
      ) : null}

      {workspaceTab === "history" && isSpot && accountId ? (
        <SpotHistorySlice accountId={accountId} />
      ) : null}

      {workspaceTab === "history" && !isSpot ? (
        <TradeHistoryList rows={perpHistoryRows} />
      ) : null}

      <TradeEntryModal
        visible={tradeOpen}
        onClose={closeTrade}
        leverage={isSpot ? 1 : (state?.portfolio.leverage ?? 1)}
        accountSnapshot={accountSnapshot}
        existingPerpTrades={isSpot ? undefined : state?.trades}
        walletId={session.walletId}
        canTrade={session.canTrade}
        executeTrade={executeTrade}
        onExecuted={handleTradeExecuted}
      />

      {accountId ? (
        <WalletTransferModal
          visible={transferOpen}
          accountId={accountId}
          accountSnapshot={accountSnapshot}
          onClose={closeTransfer}
          onTransferred={handleTransferred}
        />
      ) : null}

      <EditTpSlModal
        visible={tpSlCard != null}
        view={tpSlCard}
        linkedOrders={linkedOrdersForEdit}
        onClose={() => setTpSlCard(null)}
        onSave={handleSaveTpSl}
      />

      <ClosePositionConfirmModal
        visible={closeConfirmView != null}
        view={closeConfirmView}
        accountSnapshot={accountSnapshot}
        submitting={
          closeConfirmView != null && closingSymbol === closeConfirmView.symbol
        }
        onClose={dismissCloseConfirm}
        onConfirm={(quantity) => {
          void confirmClosePosition(quantity);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
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
  newTradeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 14,
  },
  newTradeText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
  },
  workspaceTabs: {
    flexDirection: "row",
    gap: 8,
  },
  workspaceTab: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  workspaceTabText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  empty: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  positionsList: {
    gap: 12,
  },
});
