import React, { type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

type AccountSectionProps = {
  title: string;
  children: ReactNode;
};

export function AccountSection({ title, children }: AccountSectionProps) {
  const colors = useColors();

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: colors.mutedForeground }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 16,
  },
  title: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 2,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  card: {
    borderWidth: 1,
    borderRadius: 4,
    overflow: "hidden",
  },
});
