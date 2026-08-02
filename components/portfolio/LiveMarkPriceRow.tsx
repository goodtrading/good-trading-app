import React, { memo, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useMarketTick } from "@/hooks/useMarketTick";
import { formatUsd } from "@/lib/portfolio/accounts/format";

type LiveMarkPriceRowProps = {
  symbol: string;
  referencePriceLabel?: string;
};

/**
 * Isolated live mark row — sole subscriber for price + tick arrow.
 */
export const LiveMarkPriceRow = memo(function LiveMarkPriceRow({
  symbol,
  referencePriceLabel,
}: LiveMarkPriceRowProps) {
  const colors = useColors();
  const { price } = useMarketTick(symbol);
  const prevRef = useRef(price);
  const [tick, setTick] = useState<"up" | "down" | "flat">("flat");

  useEffect(() => {
    const prev = prevRef.current;
    if (price != null && prev != null) {
      if (price > prev) setTick("up");
      else if (price < prev) setTick("down");
    }
    prevRef.current = price;
  }, [price]);

  const tickColor =
    tick === "up" ? colors.success : tick === "down" ? colors.primary : colors.mutedForeground;

  return (
    <View style={styles.metaBlock}>
      {referencePriceLabel ? (
        <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>
          {referencePriceLabel}
        </Text>
      ) : null}
      <View style={styles.priceRow}>
        <Text style={[styles.price, { color: colors.foreground }]}>
          {price != null && price > 0 ? formatUsd(price) : "—"}
        </Text>
        {tick === "up" ? (
          <Text style={[styles.arrow, { color: tickColor }]}>▲</Text>
        ) : null}
        {tick === "down" ? (
          <Text style={[styles.arrow, { color: tickColor }]}>▼</Text>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  metaBlock: {
    flexDirection: "column",
    alignItems: "stretch",
    alignSelf: "stretch",
    width: "100%",
    gap: 4,
  },
  metaLabel: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "Inter_500Medium",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    width: "100%",
    gap: 6,
  },
  price: {
    fontSize: 22,
    lineHeight: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  arrow: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Inter_700Bold",
  },
});
