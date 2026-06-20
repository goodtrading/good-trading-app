import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";

export function LogoutButton() {
  const colors = useColors();
  const { isAuthenticated, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  if (!isAuthenticated) return null;

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={() => void handleLogout()}
      style={[styles.button, { borderColor: colors.primary }]}
      activeOpacity={0.8}
      disabled={loggingOut}
    >
      {loggingOut ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Text style={[styles.text, { color: colors.primary }]}>Cerrar sesión</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  text: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
});
