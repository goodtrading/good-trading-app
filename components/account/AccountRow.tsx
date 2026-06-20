import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";

type AccountRowProps = {
  label: string;
  value?: string | null;
  onPress?: () => void;
  showChevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  trailing?: React.ReactNode;
  isLast?: boolean;
};

export function AccountRow({
  label,
  value,
  onPress,
  showChevron = Boolean(onPress),
  destructive = false,
  disabled = false,
  trailing,
  isLast = false,
}: AccountRowProps) {
  const colors = useColors();
  const content = (
    <View
      style={[
        styles.row,
        !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border },
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.main}>
        <Text
          style={[
            styles.label,
            { color: destructive ? colors.primary : colors.foreground },
          ]}
        >
          {label}
        </Text>
        {value ? (
          <Text style={[styles.value, { color: colors.mutedForeground }]} numberOfLines={2}>
            {value}
          </Text>
        ) : null}
      </View>
      {trailing}
      {showChevron && onPress ? (
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      ) : null}
    </View>
  );

  if (!onPress || disabled) {
    return content;
  }

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  main: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  value: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 3,
    lineHeight: 15,
  },
  disabled: {
    opacity: 0.55,
  },
});
