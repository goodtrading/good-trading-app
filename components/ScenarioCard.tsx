import React from "react";

import { View, Text, StyleSheet } from "react-native";

import { editorial } from "@/constants/editorial";

import { EditorialSectionTitle } from "@/components/EditorialSectionTitle";

import { useColors } from "@/hooks/useColors";



interface ScenarioCardProps {

  title: string;

  label?: string;

  description: string;

  probability: number;

}



function formatSectionTitle(_label?: string): string {
  return "Escenario";
}



function hasUsefulProbability(probability: number): boolean {

  return Number.isFinite(probability) && probability > 0 && probability <= 100;

}



export function ScenarioCard({

  title,

  label,

  description,

  probability,

}: ScenarioCardProps) {

  const colors = useColors();

  const sectionTitle = formatSectionTitle(label);

  const body = description.trim() || title.trim();

  // probability mirrors bias.confidence from index — already rendered in CommandBlock

  // as "Confidence". Omitting here avoids duplicate signal; prop kept for API stability.

  const showProbability = false;



  return (

    <View style={styles.section}>

      <EditorialSectionTitle>{sectionTitle}</EditorialSectionTitle>



      {showProbability && hasUsefulProbability(probability) ? (

        <Text style={[styles.confidence, { color: colors.mutedForeground }]}>

          {Math.round(probability)}% confidence

        </Text>

      ) : null}



      {body ? (

        <Text style={[styles.body, styles.bodyNeutral, { color: colors.mutedForeground }]}>{body}</Text>

      ) : (

        <Text style={[styles.body, { color: colors.mutedForeground }]}>Sin escenario disponible</Text>

      )}

    </View>

  );

}



const styles = StyleSheet.create({

  section: {

    gap: 2,

  },

  confidence: {

    fontSize: editorial.metaSize,

    fontFamily: "Inter_400Regular",

    letterSpacing: 0.3,

  },

  body: {

    fontSize: editorial.bodySize - 2,

    fontFamily: "Inter_400Regular",

    lineHeight: 20,

    letterSpacing: 0.2,

  },

  bodyNeutral: {

    fontSize: Math.round(editorial.bodySize * 0.7),

    fontFamily: "Inter_400Regular",

    lineHeight: Math.round(20 * 0.7),

    letterSpacing: 0.2,

  },

});


