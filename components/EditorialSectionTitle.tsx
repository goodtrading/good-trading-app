import React from "react";
import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";

import { editorial } from "@/constants/editorial";
import { useColors } from "@/hooks/useColors";

type EditorialSectionTitleProps = {
  children: string;
  style?: StyleProp<TextStyle>;
};

export function EditorialSectionTitle({ children, style }: EditorialSectionTitleProps) {
  const colors = useColors();

  return (
    <Text style={[styles.title, { color: colors.foreground }, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: editorial.sectionTitleSize,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: editorial.sectionTitleTracking,
    lineHeight: 18,
    marginBottom: 6,
  },
});
