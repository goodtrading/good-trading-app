import React from "react";

import {

  ActivityIndicator,

  StyleSheet,

  Text,

  View,

} from "react-native";



import { PaperPortfolioScreen } from "@/components/portfolio/PaperPortfolioScreen";

import { WalletExchangeScreen } from "@/components/portfolio/WalletExchangeScreen";

import { usePortfolioSource } from "@/lib/portfolio";



type WalletScreenProps = {

  onAddPress: () => void;

};



export function WalletScreen({ onAddPress: _onAddPress }: WalletScreenProps) {

  const { isPaperView, selectedPaperAccountId, selection } = usePortfolioSource();



  if (isPaperView) {

    return <PaperPortfolioScreen accountId={selectedPaperAccountId} />;

  }



  if (selection?.type === "exchange") {

    return <WalletExchangeScreen sourceId={selection.sourceId} />;

  }



  return (

    <View style={styles.emptyWrap}>

      <ActivityIndicator size="small" />

      <Text style={styles.emptyText}>Selecciona una cuenta operativa.</Text>

    </View>

  );

}



const styles = StyleSheet.create({

  emptyWrap: {

    paddingVertical: 24,

    alignItems: "center",

    gap: 8,

  },

  emptyText: {

    fontSize: 11,

    fontFamily: "Inter_500Medium",

  },

});


