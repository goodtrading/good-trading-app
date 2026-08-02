import React from "react";

import { Platform, View, Text, StyleSheet } from "react-native";

import { useColors } from "@/hooks/useColors";

import { editorial } from "@/constants/editorial";

import { resolveRegimeTextColor } from "@/lib/market-state/headerRegimeView";



interface CommandBlockProps {

  asset: string;

  gamma: string;

  setup: string;

  probability: number;

  lastUpdate: string;

  marketMode?: string;

  confidence?: number | null;

  transitionZone?: string | null;

  /** Micro: show transition zone in place of Setup Activo. Macro: keep setup. */

  showTransitionInsteadOfSetup?: boolean;

}



export function CommandBlock({

  asset,

  gamma,

  setup,

  lastUpdate,

  marketMode,

  confidence,

  transitionZone,

  showTransitionInsteadOfSetup = false,

}: CommandBlockProps) {

  const colors = useColors();

  const regimeColor = resolveRegimeTextColor(gamma, {

    success: colors.success,

    destructive: colors.destructive,

    mutedForeground: colors.mutedForeground,

  });



  return (

    <View style={styles.wrapper}>

      <View

        style={[

          styles.frame,

          Platform.OS === "web"

            ? ({

                boxShadow: `0 0 ${editorial.frameGlowRadius}px rgba(139, 20, 20, ${editorial.frameGlowOpacity})`,

              } as object)

            : {

                shadowColor: editorial.frameGlowColor,

                shadowOffset: { width: 0, height: 0 },

                shadowOpacity: editorial.frameGlowOpacity,

                shadowRadius: editorial.frameGlowRadius,

                elevation: 1,

              },

        ]}

      >

        <View style={styles.timestampRow}>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>{lastUpdate}</Text>
        </View>

        <View style={styles.heroBlock}>
          <Text style={[styles.price, { color: colors.foreground }]}>{asset}</Text>
          <Text style={[styles.regime, { color: regimeColor }]}>{gamma}</Text>
        </View>



        <View style={styles.metaRow}>

          <View style={styles.metaCell}>

            <Text style={[styles.label, { color: colors.mutedForeground }]}>Modo de mercado</Text>

            <Text style={[styles.metaValue, { color: colors.foreground }]}>{marketMode ?? "—"}</Text>

          </View>

          <View style={styles.metaCell}>

            <Text style={[styles.label, { color: colors.mutedForeground }]}>Confidence</Text>

            <Text style={[styles.metaValue, { color: colors.foreground }]}>

              {confidence !== null && confidence !== undefined ? `${confidence}%` : "—"}

            </Text>

          </View>

        </View>



        <View style={styles.actionBlock}>

          <Text style={[styles.label, { color: colors.mutedForeground }]}>

            {showTransitionInsteadOfSetup ? "Zona de transición" : "Setup activo"}

          </Text>

          <Text style={[styles.actionValue, { color: colors.foreground }]}>

            {showTransitionInsteadOfSetup ? transitionZone ?? "—" : setup}

          </Text>

        </View>

      </View>

    </View>

  );

}



const styles = StyleSheet.create({

  wrapper: {

    marginBottom: editorial.sectionGap,

  },

  frame: {

    borderRadius: editorial.frameRadius,

    borderWidth: editorial.frameBorderWidth,

    borderColor: editorial.frameBorder,

    paddingHorizontal: editorial.framePaddingH,

    paddingTop: editorial.framePaddingV - 4,

    paddingBottom: editorial.framePaddingV,

    gap: editorial.rowGap,

  },

  timestampRow: {

    alignItems: "flex-end",

    marginBottom: -2,

  },

  heroBlock: {

    marginTop: -10,

    gap: 2,

  },

  meta: {

    fontSize: editorial.metaSize - 1,

    fontFamily: "Inter_400Regular",

    letterSpacing: 0.25,

    opacity: 0.62,

  },

  price: {

    fontSize: editorial.heroSize,

    fontFamily: "Inter_700Bold",

    letterSpacing: 0.5,

    lineHeight: 38,

  },

  regime: {

    fontSize: editorial.leadSize,

    fontFamily: "Inter_700Bold",

    letterSpacing: 0.6,

    lineHeight: 32,

  },

  metaRow: {

    flexDirection: "row",

    gap: 24,

    marginTop: editorial.blockGap - editorial.rowGap,

  },

  metaCell: {

    flex: 1,

    gap: 4,

  },

  label: {

    fontSize: editorial.metaSize,

    fontFamily: "Inter_500Medium",

    letterSpacing: editorial.labelTracking,

  },

  metaValue: {

    fontSize: editorial.bodySize,

    fontFamily: "Inter_600SemiBold",

    letterSpacing: 0.3,

  },

  actionBlock: {

    gap: 4,

    marginTop: 2,

  },

  actionValue: {

    fontSize: 14,

    fontFamily: "Inter_600SemiBold",

    letterSpacing: 0.3,

    lineHeight: 20,

  },

});


