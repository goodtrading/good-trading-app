import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useColors } from "@/hooks/useColors";

const DIALOG_ANIMATION_MS = 200;

type CenteredDialogModalProps = {
  visible: boolean;
  title?: string;
  /** Replaces the default title text (close button remains). */
  headerContent?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  /** When false, body is a fixed View (no vertical scroll / expand). */
  scrollEnabled?: boolean;
};

export function CenteredDialogModal({
  visible,
  title = "",
  headerContent,
  onClose,
  children,
  contentStyle,
  scrollEnabled = true,
}: CenteredDialogModalProps) {
  const colors = useColors();
  const [mounted, setMounted] = useState(visible);
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const scale = useRef(new Animated.Value(visible ? 1 : 0.96)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      opacity.setValue(0);
      scale.setValue(0.96);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: DIALOG_ANIMATION_MS,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: DIALOG_ANIMATION_MS,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (!mounted) return;

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: DIALOG_ANIMATION_MS,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.96,
        duration: DIALOG_ANIMATION_MS,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setMounted(false);
      }
    });
  }, [mounted, opacity, scale, visible]);

  if (!mounted && !visible) {
    return null;
  }

  const body = scrollEnabled ? (
    <ScrollView
      style={[styles.content, contentStyle]}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      bounces={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.contentFixed, contentStyle, styles.contentContainer]}>
      {children}
    </View>
  );

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdropWrap, { opacity }]}>
          <Pressable
            style={styles.backdrop}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.dialog,
            !scrollEnabled && styles.dialogFixed,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity,
              transform: [{ scale }],
            },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            {headerContent ? (
              <View style={styles.headerContent}>{headerContent}</View>
            ) : (
              <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
            )}
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cerrar detalle"
              style={({ pressed }) => [styles.closeButton, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Feather name="x" size={20} color={colors.foreground} />
            </Pressable>
          </View>

          {body}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  backdropWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  dialog: {
    width: "100%",
    maxWidth: 360,
    maxHeight: "72%",
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  dialogFixed: {
    maxHeight: undefined,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerContent: {
    flex: 1,
    paddingRight: 4,
  },
  title: {
    flex: 1,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.2,
  },
  closeButton: {
    padding: 4,
    marginLeft: 8,
    marginTop: 2,
  },
  content: {
    maxHeight: "100%",
  },
  contentFixed: {
    flexGrow: 0,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
});
