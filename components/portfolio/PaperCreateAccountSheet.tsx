import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";
import { parsePositiveNumber } from "@/lib/portfolio/accounts/format";

type PaperAccountCurrency = "USD" | "USDT" | "BTC" | "ETH";

const CURRENCY_OPTIONS: PaperAccountCurrency[] = ["USD", "USDT", "BTC", "ETH"];

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string, initialBalance: number) => Promise<void>;
};

export function PaperCreateAccountSheet({ visible, onClose, onCreate }: Props) {
  const colors = useColors();
  const [name, setName] = useState("");
  const [capital, setCapital] = useState("100000");
  const [currency, setCurrency] = useState<PaperAccountCurrency>("USDT");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setCapital("100000");
    setCurrency("USDT");
    setError(null);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleCreate = async () => {
    const initialBalance = parsePositiveNumber(capital);
    if (!name.trim()) {
      setError("Ingresa un nombre para la cuenta");
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
      handleClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo crear la cuenta");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={handleClose} />
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable onPress={() => {}} style={styles.dialogPressable}>
          <View
            style={[
              styles.dialog,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                maxHeight: Dimensions.get("window").height * 0.85,
              },
            ]}
          >
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
              <Text style={[styles.headerTitle, { color: colors.foreground }]}>
                Crear una cuenta
              </Text>
              <Pressable
                onPress={handleClose}
                disabled={submitting}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
                style={({ pressed }) => [{ opacity: pressed || submitting ? 0.6 : 1 }]}
              >
                <Feather name="x" size={20} color={colors.foreground} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  Nombre de la cuenta
                </Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Paper Main"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="words"
                  style={[
                    styles.input,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                    },
                  ]}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  Capital inicial
                </Text>
                <TextInput
                  value={capital}
                  onChangeText={setCapital}
                  keyboardType="decimal-pad"
                  placeholder="100000"
                  placeholderTextColor={colors.mutedForeground}
                  style={[
                    styles.input,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                    },
                  ]}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Divisa</Text>
                <View style={styles.currencyRow}>
                  {CURRENCY_OPTIONS.map((option) => {
                    const isActive = currency === option;
                    return (
                      <Pressable
                        key={option}
                        onPress={() => setCurrency(option)}
                        style={({ pressed }) => [
                          styles.currencyPill,
                          {
                            borderColor: isActive ? colors.primary : colors.border,
                            backgroundColor: isActive ? "#1a0005" : colors.background,
                            opacity: pressed ? 0.85 : 1,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.currencyText,
                            { color: isActive ? colors.primary : colors.foreground },
                          ]}
                        >
                          {option}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {error ? (
                <Text style={[styles.error, { color: colors.primary }]}>{error}</Text>
              ) : null}
            </ScrollView>

            <View style={[styles.footer, { borderTopColor: colors.border }]}>
              <Pressable
                onPress={handleClose}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.footerButton,
                  styles.cancelButton,
                  { borderColor: colors.border, opacity: pressed || submitting ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.cancelText, { color: colors.foreground }]}>Cancelar</Text>
              </Pressable>

              <Pressable
                onPress={() => void handleCreate()}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.footerButton,
                  { backgroundColor: colors.primary, opacity: pressed || submitting ? 0.85 : 1 },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.createText}>Crear</Text>
                )}
              </Pressable>
            </View>
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
  },
  dialogPressable: {
    width: "90%",
    maxWidth: 420,
  },
  dialog: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderBottomWidth: 1,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
  },
  body: {
    flexGrow: 0,
    flexShrink: 1,
  },
  bodyContent: {
    paddingHorizontal: 22,
    paddingVertical: 20,
    gap: 16,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.2,
  },
  input: {
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  currencyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  currencyPill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minWidth: 64,
    alignItems: "center",
  },
  currencyText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  error: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 4,
  },
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  footerButton: {
    flex: 1,
    borderRadius: 9,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    borderWidth: 1,
  },
  cancelText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  createText: {
    color: "#ffffff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
});
