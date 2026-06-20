import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { BottomSheetModal } from "@/components/BottomSheetModal";
import { useColors } from "@/hooks/useColors";
import type { AssetCatalogEntry } from "@/lib/assets/types";
import { filterCatalogByQuery } from "@/lib/watchlist";

type WatchlistSearchSheetProps = {
  visible: boolean;
  catalog: AssetCatalogEntry[];
  activeAsset: string;
  onClose: () => void;
  onSelect: (symbol: string) => void;
  onBlocked: (message: string) => void;
};

export function WatchlistSearchSheet({
  visible,
  catalog,
  activeAsset,
  onClose,
  onSelect,
  onBlocked,
}: WatchlistSearchSheetProps) {
  const colors = useColors();
  const [query, setQuery] = useState("");

  const results = useMemo(() => filterCatalogByQuery(catalog, query), [catalog, query]);

  const handleSelect = (entry: AssetCatalogEntry) => {
    if (entry.status === "coming_soon") {
      onBlocked("Próximamente");
      return;
    }
    onSelect(entry.symbol);
    setQuery("");
    onClose();
  };

  const handleClose = () => {
    setQuery("");
    onClose();
  };

  return (
    <BottomSheetModal visible={visible} title="BUSCAR ACTIVOS" onClose={handleClose}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Buscar por símbolo o nombre"
        placeholderTextColor={colors.mutedForeground}
        style={[
          styles.searchInput,
          {
            color: colors.foreground,
            borderColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
        autoCapitalize="characters"
        autoCorrect={false}
      />

      {results.length === 0 ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>Sin resultados</Text>
      ) : (
        results.map((entry) => {
          const isActive = entry.symbol === activeAsset;
          const blocked = entry.status === "coming_soon";

          return (
            <Pressable
              key={entry.symbol}
              onPress={() => handleSelect(entry)}
              style={({ pressed }) => [
                styles.row,
                {
                  borderColor: colors.border,
                  backgroundColor: pressed ? colors.secondary : "transparent",
                },
              ]}
            >
              <View>
                <Text style={[styles.symbol, { color: colors.foreground }]}>{entry.symbol}</Text>
                <Text style={[styles.name, { color: colors.mutedForeground }]}>{entry.name}</Text>
              </View>

              <View style={styles.trailing}>
                {blocked ? (
                  <Text style={[styles.blocked, { color: colors.mutedForeground }]}>Próximamente</Text>
                ) : isActive ? (
                  <Feather name="check" size={16} color={colors.primary} />
                ) : null}
              </View>
            </Pressable>
          );
        })
      )}
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  searchInput: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 10,
  },
  empty: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    paddingVertical: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  symbol: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  name: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  trailing: {
    minWidth: 90,
    alignItems: "flex-end",
  },
  blocked: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.4,
  },
});
