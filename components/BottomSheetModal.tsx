import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useColors } from "@/hooks/useColors";

type BottomSheetModalProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  keyboardAware?: boolean;
  footer?: React.ReactNode;
};

export function BottomSheetModal({
  visible,
  title,
  onClose,
  children,
  contentStyle,
  keyboardAware = false,
  footer,
}: BottomSheetModalProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const scrollContent = keyboardAware ? (
    <KeyboardAwareScrollViewCompat
      style={[styles.content, keyboardAware && styles.contentKeyboardAware, contentStyle]}
      contentContainerStyle={[
        styles.contentContainer,
        keyboardAware && styles.contentContainerKeyboardAware,
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      bottomOffset={footer ? 32 : 20}
      extraKeyboardSpace={footer ? 140 : 80}
      disableScrollOnKeyboardHide={false}
    >
      {children}
    </KeyboardAwareScrollViewCompat>
  ) : (
    <ScrollView
      style={[styles.content, contentStyle]}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );

  const sheet = (
    <View
      style={[
        styles.sheet,
        keyboardAware && styles.sheetKeyboardAware,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          paddingBottom: footer ? 0 : Math.max(insets.bottom, 16),
        },
      ]}
    >
      <View style={[styles.handle, { backgroundColor: colors.border }]} />

      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Cerrar detalle"
          style={({ pressed }) => [styles.closeButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name="x" size={20} color={colors.foreground} />
        </Pressable>
      </View>

      {scrollContent}

      {footer ? (
        <View
          style={[
            styles.footer,
            {
              borderTopColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar" />

        {keyboardAware ? (
          <KeyboardAvoidingView
            style={styles.keyboardAvoiding}
            behavior="padding"
            keyboardVerticalOffset={Platform.OS === "ios" ? insets.bottom : 0}
          >
            {sheet}
          </KeyboardAvoidingView>
        ) : (
          sheet
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  keyboardAvoiding: {
    width: "100%",
    maxHeight: "92%",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  sheet: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderWidth: 1,
    maxHeight: "78%",
    overflow: "hidden",
  },
  sheetKeyboardAware: {
    maxHeight: "92%",
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 999,
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: {
    flex: 1,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.2,
  },
  closeButton: {
    padding: 4,
    marginLeft: 12,
  },
  content: {
    maxHeight: "100%",
  },
  contentKeyboardAware: {
    flexGrow: 0,
    flexShrink: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  contentContainerKeyboardAware: {
    paddingBottom: 16,
    flexGrow: 1,
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    flexShrink: 0,
  },
});
