import React, { memo, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CenteredDialogModal } from "@/components/CenteredDialogModal";
import { EditorialSectionTitle } from "@/components/EditorialSectionTitle";
import { editorial } from "@/constants/editorial";
import { useColors } from "@/hooks/useColors";
import {
  areKeyZonesEqual,
  buildZoneKey,
} from "@/lib/market-state/keyZoneSelectors";
import {
  isKeyZoneExpandable,
  keyZoneMoreLabel,
  logKeyZoneGroups,
  type KeyZoneDetailItem,
  type KeyZoneViewModel,
} from "@/lib/market-state/v2UiMappers";

interface KeyZonesCardProps {
  zones: KeyZoneViewModel[];
  selectedMode: "Macro" | "Micro";
}

function KeyZoneGroupDetail({
  items,
  colors,
}: {
  items: KeyZoneDetailItem[];
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View>
      {items.map((item, index) => (
        <View
          key={item.id}
          style={[
            styles.detailRow,
            { borderBottomColor: colors.border },
            index === items.length - 1 && styles.detailRowLast,
          ]}
        >
          <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>
            {item.label}
            {item.stale ? " · desactualizado" : ""}
          </Text>
          <Text style={[styles.detailPrice, { color: colors.foreground }]}>{item.price}</Text>
          {item.distance && item.distance !== "—" ? (
            <Text
              style={[
                styles.detailDistance,
                {
                  color: item.distance.startsWith("+") ? colors.success : colors.primary,
                },
              ]}
            >
              {item.distance}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function KeyZonesCardComponent({ zones, selectedMode }: KeyZonesCardProps) {
  const colors = useColors();
  const [expandedZone, setExpandedZone] = useState<KeyZoneViewModel | null>(null);

  useEffect(() => {
    if (!__DEV__) return;
    console.log("[KeyZonesCard render]");
    console.log(`zoneCount: ${zones.length}`);
    console.log(`labels: ${JSON.stringify(zones.map((zone) => zone.label))}`);
    console.log(`selectedMode: ${selectedMode}`);
    console.log(
      "[KEYZONE KEYS]",
      zones.map((zone) => ({
        id: zone.id,
        label: zone.label,
        key: buildZoneKey(zone),
        moreCount: zone.moreCount ?? 0,
      })),
    );
    logKeyZoneGroups(zones);
  }, [selectedMode, zones]);

  const getZoneColor = (type: KeyZoneViewModel["type"]) => {
    if (type === "resistance") return colors.primary;
    if (type === "support") return colors.success;
    if (type === "neutral") return "transparent";
    return colors.gold;
  };

  const displayZones = zones;

  return (
    <>
      <View style={styles.container}>
        <View style={styles.header}>
          <EditorialSectionTitle style={styles.sectionTitle}>
            Niveles · {selectedMode}
          </EditorialSectionTitle>
        </View>

        {displayZones.length === 0 ? (
          <View style={styles.emptyRow}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No disponible</Text>
          </View>
        ) : (
          displayZones.map((zone, index) => {
            const expandable = isKeyZoneExpandable(zone);
            const moreLabel = keyZoneMoreLabel(zone);
            const isCurrent = zone.type === "current";
            const rowStyle = [
              styles.row,
              index === displayZones.length - 1 && styles.rowLast,
            ];
            const distanceColor =
              zone.type === "current"
                ? colors.mutedForeground
                : zone.distance.startsWith("+")
                  ? colors.success
                  : colors.primary;
            const showDistance =
              zone.distance && zone.distance !== "—" && zone.distance !== "-";
            const row = (
              <>
                <View
                  style={[
                    styles.typeBar,
                    { backgroundColor: zone.barColor ?? getZoneColor(zone.type) },
                  ]}
                />

                <View style={styles.rowContent}>
                  <View style={styles.leftSide}>
                    <Text
                      style={[
                        styles.zoneLabel,
                        {
                          color: isCurrent ? colors.gold : colors.mutedForeground,
                          fontFamily: isCurrent ? "Inter_700Bold" : "Inter_500Medium",
                        },
                      ]}
                    >
                      {zone.label}
                      {zone.stale ? " · desactualizado" : ""}
                    </Text>
                    {moreLabel ? (
                      <Text style={[styles.moreLabel, { color: colors.gold }]}>{moreLabel}</Text>
                    ) : null}
                  </View>

                  <View style={styles.rightSide}>
                    <View style={styles.priceColumn}>
                      <Text
                        style={[
                          styles.price,
                          {
                            color: isCurrent ? colors.gold : colors.foreground,
                            fontSize: isCurrent ? 17 : 15,
                          },
                        ]}
                      >
                        {zone.price}
                      </Text>
                      {showDistance ? (
                        <Text style={[styles.distance, { color: distanceColor }]}>
                          {zone.distance}
                        </Text>
                      ) : null}
                    </View>
                    {expandable ? (
                      <Text style={[styles.expandChevron, { color: colors.mutedForeground }]}>
                        ›
                      </Text>
                    ) : null}
                  </View>
                </View>
              </>
            );

            if (!expandable) {
              return (
                <View key={buildZoneKey(zone)} style={rowStyle}>
                  {row}
                </View>
              );
            }

            return (
              <Pressable
                key={buildZoneKey(zone)}
                onPress={() => setExpandedZone(zone)}
                accessibilityRole="button"
                accessibilityLabel={`Ver detalle de ${zone.label}`}
                style={({ pressed }) => [rowStyle, pressed && styles.rowPressed]}
              >
                {row}
              </Pressable>
            );
          })
        )}
      </View>

      <CenteredDialogModal
        visible={expandedZone != null}
        title={expandedZone?.modalTitle ?? expandedZone?.label ?? ""}
        onClose={() => setExpandedZone(null)}
      >
        {expandedZone?.items ? (
          <KeyZoneGroupDetail items={expandedZone.items} colors={colors} />
        ) : null}
      </CenteredDialogModal>
    </>
  );
}

export const KeyZonesCard = memo(
  KeyZonesCardComponent,
  (previous, next) =>
    previous.selectedMode === next.selectedMode &&
    areKeyZonesEqual(previous.zones, next.zones),
);

const styles = StyleSheet.create({
  container: {
    marginBottom: editorial.sectionGap,
    gap: editorial.rowGap - 2,
  },
  header: {
    marginBottom: 0,
  },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  emptyRow: {
    paddingVertical: 12,
    alignItems: "flex-start",
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  rowLast: {
    paddingBottom: 0,
  },
  rowPressed: {
    opacity: 0.72,
  },
  typeBar: {
    width: 2,
    alignSelf: "stretch",
    minHeight: 36,
    marginRight: 10,
  },
  rowContent: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  leftSide: {
    flex: 1,
    paddingRight: 12,
  },
  zoneLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
    lineHeight: 15,
  },
  moreLabel: {
    marginTop: 3,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.4,
    lineHeight: 14,
  },
  rightSide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 1,
  },
  priceColumn: {
    alignItems: "flex-end",
  },
  expandChevron: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    opacity: 0.38,
    lineHeight: 16,
    marginTop: -1,
  },
  price: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
    lineHeight: 18,
  },
  distance: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
    letterSpacing: 0.3,
    lineHeight: 13,
  },
  detailRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  detailRowLast: {
    borderBottomWidth: 0,
  },
  detailLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    marginBottom: 4,
    lineHeight: 15,
  },
  detailPrice: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
    lineHeight: 19,
  },
  detailDistance: {
    marginTop: 3,
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
    lineHeight: 13,
  },
});
