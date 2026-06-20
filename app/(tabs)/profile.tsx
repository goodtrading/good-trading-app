import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";

import { AccountHeader } from "@/components/account/AccountHeader";
import { AccountRow } from "@/components/account/AccountRow";
import { AccountSection } from "@/components/account/AccountSection";
import { LogoutButton } from "@/components/account/LogoutButton";
import { SubscriptionCard } from "@/components/account/SubscriptionCard";
import { useColors } from "@/hooks/useColors";
import { buildAccountScreenModel } from "@/lib/account/accountScreenModel";
import {
  APP_VERSION,
  PRIVACY_URL,
  SUPPORT_EMAIL,
  TERMS_URL,
  TERMINAL_WEB_URL,
} from "@/lib/account/constants";
import { formatOptionalBoolean } from "@/lib/account/formatUser";
import {
  formatTimezoneLabel,
  loadAccountPreferences,
  saveAccountPreferences,
  type AccountPreferences,
} from "@/lib/account/preferences";
import { useAuth } from "@/lib/auth";

function PreferenceToggleRow({
  label,
  value,
  onValueChange,
  disabled = false,
  isLast = false,
}: {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  isLast?: boolean;
}) {
  const colors = useColors();

  return (
    <AccountRow
      label={label}
      isLast={isLast}
      disabled={disabled}
      trailing={
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#ffffff"
        />
      }
    />
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { status, user, access, saasDisabled, isAuthenticated, hydrationError } = useAuth();

  const [preferences, setPreferences] = useState<AccountPreferences | null>(null);
  const [prefsLoading, setPrefsLoading] = useState(true);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  useEffect(() => {
    let active = true;
    void loadAccountPreferences().then((loaded) => {
      if (active) {
        setPreferences(loaded);
        setPrefsLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const screenModel = useMemo(
    () =>
      buildAccountScreenModel({
        user,
        access,
        saasDisabled,
        isAuthenticated,
      }),
    [access, isAuthenticated, saasDisabled, user],
  );

  const emailVerifiedLabel = formatOptionalBoolean(user?.emailVerified);

  const persistPreferences = useCallback(async (next: AccountPreferences) => {
    setPreferences(next);
    await saveAccountPreferences(next);
  }, []);

  const openExternal = useCallback(async (url: string) => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    await WebBrowser.openBrowserAsync(url);
  }, []);

  const openUpgrade = useCallback(() => {
    router.push("/upgrade");
  }, [router]);

  const openManageSubscription = useCallback(() => {
    void openExternal(TERMINAL_WEB_URL);
  }, [openExternal]);

  const openSupport = useCallback(() => {
    void Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
  }, []);

  if (status === "loading") {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
          Cargando tu cuenta…
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: topPad + 16,
        paddingBottom: bottomPad,
        paddingHorizontal: 16,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.screenTitle, { color: colors.foreground }]}>Cuenta</Text>

      {hydrationError ? (
        <View style={[styles.banner, { borderColor: colors.warning, backgroundColor: "#1a1400" }]}>
          <Text style={[styles.bannerText, { color: colors.warning }]}>
            Modo offline: mostrando la última sesión conocida. {hydrationError}
          </Text>
        </View>
      ) : null}

      <AccountHeader user={user} subscription={screenModel.subscription} />

      <SubscriptionCard
        subscription={screenModel.subscription}
        onUpgradePress={openUpgrade}
        onManagePress={openManageSubscription}
        onReactivatePress={openUpgrade}
      />

      <AccountSection title="MI CUENTA">
        <AccountRow
          label="Información personal"
          value={user?.fullName?.trim() || "No disponible"}
        />
        <AccountRow label="Email" value={user?.email} />
        {emailVerifiedLabel ? (
          <AccountRow label="Estado de verificación" value={emailVerifiedLabel} />
        ) : null}
        <AccountRow
          label="Cambiar contraseña"
          onPress={() => void openExternal(`${TERMINAL_WEB_URL}/account`)}
          isLast
        />
      </AccountSection>

      <AccountSection title="PREFERENCIAS">
        <AccountRow
          label="Zona horaria"
          value={
            preferences
              ? formatTimezoneLabel(preferences.timezone)
              : prefsLoading
                ? "Cargando…"
                : formatTimezoneLabel("UTC")
          }
        />
        <AccountRow
          label="Idioma"
          value={preferences?.language ?? (prefsLoading ? "Cargando…" : "es-AR")}
        />
        {preferences ? (
          <>
            <PreferenceToggleRow
              label="Alertas institucionales"
              value={preferences.notifications.institutionalAlerts}
              onValueChange={(next) =>
                void persistPreferences({
                  ...preferences,
                  notifications: {
                    ...preferences.notifications,
                    institutionalAlerts: next,
                  },
                })
              }
            />
            <PreferenceToggleRow
              label="Cambios de régimen gamma"
              value={preferences.notifications.gammaRegimeChanges}
              onValueChange={(next) =>
                void persistPreferences({
                  ...preferences,
                  notifications: {
                    ...preferences.notifications,
                    gammaRegimeChanges: next,
                  },
                })
              }
            />
            <PreferenceToggleRow
              label="Ruptura de zonas clave"
              value={preferences.notifications.keyZoneBreaks}
              onValueChange={(next) =>
                void persistPreferences({
                  ...preferences,
                  notifications: {
                    ...preferences.notifications,
                    keyZoneBreaks: next,
                  },
                })
              }
            />
            <PreferenceToggleRow
              label="Squeeze / cascade"
              value={preferences.notifications.squeezeCascade}
              onValueChange={(next) =>
                void persistPreferences({
                  ...preferences,
                  notifications: {
                    ...preferences.notifications,
                    squeezeCascade: next,
                  },
                })
              }
            />
          </>
        ) : null}
        <AccountRow label="Permiso push del dispositivo" value="Próximamente" disabled />
        <AccountRow label="Apariencia" value="Sistema" isLast />
      </AccountSection>

      <AccountSection title="SEGURIDAD">
        <AccountRow
          label="Cambiar contraseña"
          onPress={() => void openExternal(`${TERMINAL_WEB_URL}/account`)}
          isLast
        />
      </AccountSection>

      <AccountSection title="SOPORTE Y APP">
        <AccountRow label="Contactar soporte" onPress={openSupport} />
        <AccountRow label="Términos y condiciones" onPress={() => void openExternal(TERMS_URL)} />
        <AccountRow label="Política de privacidad" onPress={() => void openExternal(PRIVACY_URL)} />
        <AccountRow label="Versión de la app" value={`v${APP_VERSION}`} />
        <AccountRow
          label="Estado de conexión"
          value={hydrationError ? "Offline" : "Conectado"}
          isLast
        />
      </AccountSection>

      <LogoutButton />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  loadingText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  screenTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
    marginBottom: 14,
  },
  banner: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
  },
  bannerText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
});
