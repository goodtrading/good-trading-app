import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { usePortfolioSource } from "@/lib/portfolio";

import { PortfolioSourceChip } from "./PortfolioSourceChip";

type PortfolioSourceSelectorProps = {
  onAddPress: () => void;
};

export function PortfolioSourceSelector({ onAddPress }: PortfolioSourceSelectorProps) {
  const { selectedSource, setSelectedSource, visibleSources } = usePortfolioSource();

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {visibleSources.map((source) => (
          <PortfolioSourceChip
            key={source.id}
            source={source}
            selected={selectedSource === source.id}
            onPress={() => setSelectedSource(source.id)}
            accessibilityLabel={`Fuente ${source.name}`}
          />
        ))}
        <PortfolioSourceChip
          variant="add"
          onPress={onAddPress}
          accessibilityLabel="Agregar cuenta"
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexShrink: 0,
    maxWidth: "58%",
  },
  content: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingLeft: 4,
  },
});
