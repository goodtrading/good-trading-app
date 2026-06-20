import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login, loginError, hydrationError, isLoading, refreshSession } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const onSubmit = async () => {
    setLocalError(null);
    if (!email.trim() || !password) {
      setLocalError("Ingresá email y contraseña.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (!result.ok) {
        setLocalError(result.message ?? "Credenciales inválidas.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const displayError = localError ?? loginError ?? hydrationError;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 24,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>
          GOOD<Text style={{ color: colors.primary }}>TRADING</Text>
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Iniciá sesión con tu cuenta de la terminal
        </Text>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>EMAIL</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="tu@email.com"
            placeholderTextColor={colors.mutedForeground}
            style={[
              styles.input,
              {
                color: colors.foreground,
                borderColor: colors.border,
                backgroundColor: colors.secondary,
              },
            ]}
          />

          <Text style={[styles.label, { color: colors.mutedForeground }]}>CONTRASEÑA</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            placeholder="••••••••"
            placeholderTextColor={colors.mutedForeground}
            style={[
              styles.input,
              {
                color: colors.foreground,
                borderColor: colors.border,
                backgroundColor: colors.secondary,
              },
            ]}
          />

          {displayError ? (
            <Text style={[styles.errorText, { color: colors.primary }]}>{displayError}</Text>
          ) : null}

          <Pressable
            onPress={() => void onSubmit()}
            disabled={submitting || isLoading}
            style={[
              styles.button,
              {
                backgroundColor: colors.primary,
                opacity: submitting || isLoading ? 0.7 : 1,
              },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>INICIAR SESIÓN</Text>
            )}
          </Pressable>

          {hydrationError ? (
            <Pressable onPress={() => void refreshSession()} style={styles.retryWrap}>
              <Text style={[styles.retryText, { color: colors.mutedForeground }]}>
                Reintentar validación de sesión
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: "center",
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginBottom: 8,
  },
  card: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 16,
    gap: 8,
  },
  label: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.2,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  errorText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 4,
  },
  button: {
    marginTop: 12,
    borderRadius: 4,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
  },
  retryWrap: {
    marginTop: 8,
    alignItems: "center",
  },
  retryText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
});
