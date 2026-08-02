import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import React from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { CarteraTabAnchoredSwitcher } from "@/components/cartera/CarteraTabAnchoredSwitcher";
import { CarteraTabShellProvider, useCarteraTabShell } from "@/lib/cartera/context/CarteraTabShellContext";

function CarteraTabBarButton(props: BottomTabBarButtonProps) {
  const navigation = useNavigation();
  const { handleCarteraTabPress } = useCarteraTabShell();
  const { onPress, ...rest } = props;

  return (
    <Pressable
      {...rest}
      onPress={(event) => {
        if (navigation.isFocused()) {
          handleCarteraTabPress({
            preventDefault: () => {},
          });
          return;
        }

        onPress?.(event);
      }}
    />
  );
}

export default function TabLayout() {
  const colors = useColors();
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <CarteraTabShellProvider>
      <View style={styles.shell}>
        <Tabs
          screenOptions={{
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.mutedForeground,
            headerShown: false,
            tabBarStyle: {
              position: "absolute",
              backgroundColor: isIOS ? "transparent" : colors.card,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              elevation: 0,
              ...(isWeb ? { height: 84 } : {}),
            },
            tabBarLabelStyle: {
              fontSize: 9,
              fontFamily: "Inter_600SemiBold",
              letterSpacing: 0.5,
              marginBottom: isWeb ? 8 : 0,
            },
            tabBarBackground: () =>
              isIOS ? (
                <BlurView
                  intensity={100}
                  tint="dark"
                  style={StyleSheet.absoluteFill}
                />
              ) : isWeb ? (
                <View
                  style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: colors.card },
                  ]}
                />
              ) : null,
          }}
        >
          <Tabs.Screen
            name="watchlist"
            options={{
              title: "WATCHLIST",
              tabBarIcon: ({ color }) =>
                isIOS ? (
                  <SymbolView name="list.bullet" tintColor={color} size={22} />
                ) : (
                  <Feather name="list" size={20} color={color} />
                ),
            }}
          />
          <Tabs.Screen
            name="alerts"
            options={{
              title: "ALERTAS",
              tabBarIcon: ({ color }) =>
                isIOS ? (
                  <SymbolView name="bell" tintColor={color} size={22} />
                ) : (
                  <Feather name="bell" size={20} color={color} />
                ),
            }}
          />
          <Tabs.Screen
            name="index"
            options={{
              title: "HOME",
              tabBarIcon: ({ color }) =>
                isIOS ? (
                  <SymbolView name="house" tintColor={color} size={22} />
                ) : (
                  <Feather name="home" size={20} color={color} />
                ),
            }}
          />
          <Tabs.Screen
            name="learn"
            options={{
              title: "CARTERA",
              tabBarButton: (props) => <CarteraTabBarButton {...props} />,
              tabBarIcon: ({ color }) =>
                isIOS ? (
                  <SymbolView name="book" tintColor={color} size={22} />
                ) : (
                  <Feather name="book-open" size={20} color={color} />
                ),
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: "CUENTA",
              tabBarIcon: ({ color }) =>
                isIOS ? (
                  <SymbolView name="person" tintColor={color} size={22} />
                ) : (
                  <Feather name="user" size={20} color={color} />
                ),
            }}
          />
        </Tabs>
        <CarteraTabAnchoredSwitcher />
      </View>
    </CarteraTabShellProvider>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
});
