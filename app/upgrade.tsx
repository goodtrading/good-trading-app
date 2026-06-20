import React from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { ProPaywallContent } from "@/components/account/ProPaywallContent";
import { useColors } from "@/hooks/useColors";
import { buildAccountScreenModel } from "@/lib/account/accountScreenModel";
import { useAuth } from "@/lib/auth";

export default function UpgradeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, access, saasDisabled, isAuthenticated } = useAuth();

  const screenModel = buildAccountScreenModel({
    user,
    access,
    saasDisabled,
    isAuthenticated,
  });

  const topPad = Platform.OS === "web" ? 67 : insets.top + 8;
  const showActivateCta = screenModel.showFullPaywallOnUpgrade;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.8}>
          <Feather name="arrow-left" size={18} color={colors.foreground} />
          <Text style={[styles.backText, { color: colors.foreground }]}>Cuenta</Text>
        </TouchableOpacity>
      </View>

      <ProPaywallContent showActivateCta={showActivateCta} />

      {!showActivateCta ? (
        <View style={[styles.notice, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[styles.noticeText, { color: colors.secondaryForeground }]}>
            Ya tenés acceso Pro activo. Gestioná tu suscripción desde la terminal web.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  backText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  notice: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
  },
  noticeText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
});
