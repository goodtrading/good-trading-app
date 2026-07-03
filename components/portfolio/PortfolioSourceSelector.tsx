import React from "react";

import { ScrollView, StyleSheet, View } from "react-native";



import { PORTFOLIO_SOURCE_CATALOG, usePortfolioSource } from "@/lib/portfolio";



import { PortfolioSourceChip } from "./PortfolioSourceChip";



type PortfolioSourceSelectorProps = {

  onAddPress: () => void;

  onAccountInfoRequest: (accountId: string) => void;

};



export function PortfolioSourceSelector({

  onAddPress,

  onAccountInfoRequest,

}: PortfolioSourceSelectorProps) {

  const {

    paperAccounts,

    exchangeConnections,

    selection,

    selectPaperAccount,

    selectExchange,

  } = usePortfolioSource();



  const paperMeta = PORTFOLIO_SOURCE_CATALOG.paper;



  const handlePaperAccountPress = (accountId: string) => {

    const isSelected = selection?.type === "paper" && selection.accountId === accountId;

    if (isSelected) {

      onAccountInfoRequest(accountId);

      return;

    }

    void selectPaperAccount(accountId);

  };



  return (

    <View style={styles.wrap}>

      <ScrollView

        horizontal

        showsHorizontalScrollIndicator={false}

        contentContainerStyle={styles.content}

      >

        {paperAccounts.map((account) => {

          const isSelected =

            selection?.type === "paper" && selection.accountId === account.id;



          return (

            <PortfolioSourceChip

              key={account.id}

              source={paperMeta}

              displayName={account.name}

              selected={isSelected}

              onPress={() => handlePaperAccountPress(account.id)}

              accessibilityLabel={`Cartera ${account.name}`}

            />

          );

        })}



        {exchangeConnections.binance ? (

          <PortfolioSourceChip

            source={PORTFOLIO_SOURCE_CATALOG.binance}

            displayName="Binance"

            selected={selection?.type === "exchange" && selection.sourceId === "binance"}

            onPress={() => selectExchange("binance")}

            accessibilityLabel="Fuente Binance"

          />

        ) : null}



        {exchangeConnections.bingx ? (

          <PortfolioSourceChip

            source={PORTFOLIO_SOURCE_CATALOG.bingx}

            displayName="BingX"

            selected={selection?.type === "exchange" && selection.sourceId === "bingx"}

            onPress={() => selectExchange("bingx")}

            accessibilityLabel="Fuente BingX"

          />

        ) : null}



        <PortfolioSourceChip

          variant="add"

          onPress={onAddPress}

          accessibilityLabel="Agregar cuenta"

        />

      </ScrollView>

    </View>

  );

}



const styles = StyleSheet.create({

  wrap: {

    flexShrink: 0,

    alignItems: "flex-end",

  },

  content: {

    flexDirection: "row",

    alignItems: "flex-start",

    gap: 8,

    paddingLeft: 4,

  },

});

