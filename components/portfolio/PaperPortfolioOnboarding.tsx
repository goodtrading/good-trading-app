import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";
import { parsePositiveNumber, formatUsd } from "@/lib/portfolio/accounts/format";

type Props = {
  onCreate: (name: string, initialBalance: number) => Promise<void>;
};

export function PaperPortfolioOnboarding({ onCreate }: Props) {
  const colors = useColors();
  const [name, setName] = useState("Mi cartera Paper");
  const [capital, setCapital] = useState("100000");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    const initialBalance = parsePositiveNumber(capital);
    if (!name.trim()) {
      setError("Ingresa un nombre para la cartera");
      return;
    }
    if (initialBalance == null) {
      setError("Capital inicial inválido");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onCreate(name.trim(), initialBalance);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo crear la cartera");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>Crear cartera Paper</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        Simula operaciones spot con capital virtual. Los cálculos los hace el Portfolio Engine.
      </Text>

      <Text style={[styles.label, { color: colors.mutedForeground }]}>Nombre</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Mi cartera Paper"
        placeholderTextColor={colors.mutedForeground}
        style={[
          styles.input,
          { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background },
        ]}
      />

      <Text style={[styles.label, { color: colors.mutedForeground }]}>Capital inicial</Text>
      <TextInput
        value={capital}
        onChangeText={setCapital}
        keyboardType="decimal-pad"
        placeholder="100000"
        placeholderTextColor={colors.mutedForeground}
        style={[
          styles.input,
          { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background },
        ]}
      />
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>
        Ejemplo: {formatUsd(100_000, 0)}
      </Text>

      {error ? <Text style={[styles.error, { color: colors.primary }]}>{error}</Text> : null}

      <Pressable
        onPress={() => void handleCreate()}
        disabled={submitting}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.primary, opacity: pressed || submitting ? 0.8 : 1 },
        ]}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.buttonText}>Crear cartera</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    marginBottom: 8,
  },
  label: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  hint: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  error: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  button: {
    marginTop: 8,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
});
