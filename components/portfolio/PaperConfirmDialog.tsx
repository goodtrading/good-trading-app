import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
};

export function PaperConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = "Eliminar",
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
  loading = false,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel="Cerrar" />
        <View
          style={[
            styles.dialog,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              marginBottom: Math.max(insets.bottom, 24),
            },
          ]}
        >
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.mutedForeground }]}>{message}</Text>

          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              disabled={loading}
              style={({ pressed }) => [
                styles.button,
                styles.cancelButton,
                { borderColor: colors.border, opacity: pressed || loading ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.cancelText, { color: colors.foreground }]}>{cancelLabel}</Text>
            </Pressable>

            <Pressable
              onPress={onConfirm}
              disabled={loading}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.primary, opacity: pressed || loading ? 0.8 : 1 },
              ]}
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  dialog: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  message: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  button: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelButton: {
    borderWidth: 1,
  },
  cancelText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  confirmText: {
    color: "#ffffff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
});
