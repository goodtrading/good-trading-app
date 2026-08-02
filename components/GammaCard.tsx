import React from "react";

import { View, Text, StyleSheet } from "react-native";

import { editorial } from "@/constants/editorial";

import { EditorialSectionTitle } from "@/components/EditorialSectionTitle";

import { useColors } from "@/hooks/useColors";



interface GammaCardProps {

  state: string;

  level: number;

  netGamma: string;

  flipPoint: string;

  description: string;

  dominantExpiry: string;

  hideNetGamma?: boolean;

  netGammaStale?: boolean;

  flipPointStale?: boolean;

  dominantExpiryStale?: boolean;

}



function MetricRow({

  label,

  value,

  colors,

}: {

  label: string;

  value: string;

  colors: ReturnType<typeof useColors>;

}) {

  return (

    <View style={styles.metricRow}>

      <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{label}</Text>

      <Text style={[styles.metricValue, { color: colors.foreground }]}>{value}</Text>

    </View>

  );

}



export function GammaCard({

  state: _state,

  level: _level,

  netGamma,

  flipPoint,

  description,

  dominantExpiry,

  hideNetGamma = false,

  netGammaStale = false,

  flipPointStale = false,

  dominantExpiryStale = false,

}: GammaCardProps) {

  const colors = useColors();

  const staleSuffix = " · desactualizado";



  return (

    <View style={styles.section}>

      <EditorialSectionTitle>Gamma</EditorialSectionTitle>



      <View style={styles.metrics}>

        {!hideNetGamma ? (

          <MetricRow

            label="Gamma neta"

            value={`${netGamma}${netGammaStale ? staleSuffix : ""}`}

            colors={colors}

          />

        ) : null}

        <MetricRow

          label="Flip point"

          value={`${flipPoint || "No disponible"}${flipPointStale ? staleSuffix : ""}`}

          colors={colors}

        />

        {dominantExpiry ? (

          <MetricRow

            label="Exp. dominante"

            value={`${dominantExpiry}${dominantExpiryStale ? staleSuffix : ""}`}

            colors={colors}

          />

        ) : null}

      </View>



      {description ? (

        <Text style={[styles.description, { color: colors.mutedForeground }]}>{description}</Text>

      ) : null}

    </View>

  );

}



const styles = StyleSheet.create({

  section: {

    gap: editorial.rowGap - 2,

  },

  metrics: {

    gap: 5,

  },

  metricRow: {

    flexDirection: "row",

    justifyContent: "space-between",

    alignItems: "baseline",

    gap: 12,

  },

  metricLabel: {

    fontSize: editorial.bodySize - 2,

    fontFamily: "Inter_400Regular",

    letterSpacing: 0.2,

  },

  metricValue: {

    fontSize: editorial.bodySize - 2,

    fontFamily: "Inter_600SemiBold",

    letterSpacing: 0.3,

    textAlign: "right",

    flexShrink: 1,

  },

  description: {

    fontSize: editorial.metaSize + 1,

    fontFamily: "Inter_400Regular",

    lineHeight: 17,

    letterSpacing: 0.2,

    marginTop: 4,

  },

});


