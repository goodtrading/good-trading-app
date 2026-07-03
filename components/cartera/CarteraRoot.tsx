import React, { useCallback, useEffect, useRef } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { InventoryContextView } from "@/components/cartera/views/InventoryContextView";
import { PortfolioContextView } from "@/components/cartera/views/PortfolioContextView";
import { TradingContextView } from "@/components/cartera/views/TradingContextView";
import { useLiveSpotPrices } from "@/hooks/useLiveSpotPrices";
import { useColors } from "@/hooks/useColors";
import {
  getTabScrollViewStyle,
  TAB_SCROLL_VIEW_PROPS,
  useTabScreenScrollInsets,
} from "@/hooks/useTabScreenScrollInsets";
import {
  InventoryContextProvider,
  PortfolioContextProvider,
  TradingContextProvider,
} from "@/lib/cartera";
import { useCarteraTabShell } from "@/lib/cartera/context/CarteraTabShellContext";
import type { CarteraContext } from "@/lib/cartera/types";

/**
 * Single entry gate for the entire Cartera module.
 * Routes rendering to isolated bounded contexts — no business logic here.
 */
export function CarteraRoot() {
  const colors = useColors();
  const { bottomPad, contentPaddingTop } = useTabScreenScrollInsets();
  const spotFeed = useLiveSpotPrices();
  const { context: activeContext, isHydrated } = useCarteraTabShell();

  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const scrollByContext = useRef<Record<CarteraContext, number>>({
    TRADING: 0,
    INVENTORY: 0,
    PORTFOLIO: 0,
  });
  const activeContextRef = useRef<CarteraContext>(activeContext);
  const prevContextRef = useRef<CarteraContext>(activeContext);

  activeContextRef.current = activeContext;

  const restoreScrollForContext = useCallback((nextContext: CarteraContext) => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: scrollByContext.current[nextContext],
        animated: false,
      });
    });
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    const previous = prevContextRef.current;
    if (previous !== activeContext) {
      scrollByContext.current[previous] = scrollYRef.current;
      prevContextRef.current = activeContext;
      restoreScrollForContext(activeContext);
    }
  }, [activeContext, isHydrated, restoreScrollForContext]);

  if (!isHydrated) {
    return null;
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={getTabScrollViewStyle(colors.background)}
      contentContainerStyle={{
        paddingTop: contentPaddingTop,
        paddingBottom: bottomPad,
        paddingHorizontal: 16,
      }}
      onScroll={(event) => {
        scrollYRef.current = event.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
      {...TAB_SCROLL_VIEW_PROPS}
    >
      <View style={styles.contextPane}>
        {activeContext === "TRADING" ? (
          <TradingContextProvider>
            <TradingContextView
              btcPrice={spotFeed.btcPrice}
              ethPrice={spotFeed.ethPrice}
              isLive={spotFeed.isLive}
              isPriceLoading={spotFeed.isLoading}
            />
          </TradingContextProvider>
        ) : null}

        {activeContext === "INVENTORY" ? (
          <InventoryContextProvider>
            <InventoryContextView />
          </InventoryContextProvider>
        ) : null}

        {activeContext === "PORTFOLIO" ? (
          <PortfolioContextProvider marketPrice={spotFeed.btcPrice}>
            <PortfolioContextView />
          </PortfolioContextProvider>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contextPane: {
    width: "100%",
  },
});
