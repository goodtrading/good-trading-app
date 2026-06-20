import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { BottomSheetModal } from "@/components/BottomSheetModal";
import { useColors } from "@/hooks/useColors";
import type { WatchlistAction } from "@/lib/watchlist/watchlistModel";

const ACTION_LABELS: Record<WatchlistAction, string> = {
  view_analysis: "Ver análisis",
  go_home: "Ir a Home",
  go_portfolio: "Ir a Cartera",
  create_alert: "Crear alerta",
  unfollow: "Dejar de seguir",
  coming_soon: "Próximamente",
};

type WatchlistContextMenuSheetProps = {
  visible: boolean;
  symbol: string;
  actions: WatchlistAction[];
  onClose: () => void;
  onAction: (action: WatchlistAction) => void;
};

export function WatchlistContextMenuSheet({
  visible,
  symbol,
  actions,
  onClose,
  onAction,
}: WatchlistContextMenuSheetProps) {
  const colors = useColors();

  return (
    <BottomSheetModal visible={visible} title={symbol} onClose={onClose}>
      {actions.map((action) => {
        const disabled = action === "coming_soon";
        return (
          <Pressable
            key={action}
            disabled={disabled}
            onPress={() => {
              if (disabled) return;
              onAction(action);
              onClose();
            }}
            style={({ pressed }) => [
              styles.row,
              {
                borderColor: colors.border,
                opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                {
                  color: disabled ? colors.mutedForeground : colors.foreground,
                },
              ]}
            >
              {ACTION_LABELS[action]}
            </Text>
          </Pressable>
        );
      })}
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  row: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
});
