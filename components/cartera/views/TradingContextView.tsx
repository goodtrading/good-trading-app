import React, { useCallback, useMemo, useState } from "react";

import { AddAccountSheet } from "@/components/portfolio/AddAccountSheet";
import { PaperAccountInfoSheet } from "@/components/portfolio/PaperAccountInfoSheet";
import { PaperCreateAccountSheet } from "@/components/portfolio/PaperCreateAccountSheet";
import { WalletScreen } from "@/components/portfolio/WalletScreen";
import { TradingContextHeader } from "@/components/cartera/views/TradingContextHeader";
import { useTradingContext } from "@/lib/cartera";

type TradingContextViewProps = {
  btcPrice: number | null;
  ethPrice: number | null;
  isLive: boolean;
  isPriceLoading: boolean;
};

/**
 * WRITE bounded context renderer — trading execution and wallet operations.
 */
export function TradingContextView({
  btcPrice,
  ethPrice,
  isLive,
  isPriceLoading,
}: TradingContextViewProps) {
  const { createPaperAccount, paperAccounts } = useTradingContext();
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [createPaperOpen, setCreatePaperOpen] = useState(false);
  const [infoAccountId, setInfoAccountId] = useState<string | null>(null);

  const infoAccount = useMemo(
    () => paperAccounts.find((account) => account.id === infoAccountId) ?? null,
    [infoAccountId, paperAccounts],
  );

  const handleCreatePaperAccount = useCallback(
    async (name: string, initialBalance: number) => {
      await createPaperAccount(name, initialBalance);
    },
    [createPaperAccount],
  );

  return (
    <>
      <TradingContextHeader
        onAddPress={() => setAddAccountOpen(true)}
        onAccountInfoRequest={setInfoAccountId}
      />
      <WalletScreen
        onAddPress={() => setAddAccountOpen(true)}
        btcPrice={btcPrice}
        ethPrice={ethPrice}
        isLive={isLive}
        isPriceLoading={isPriceLoading}
      />
      <AddAccountSheet
        visible={addAccountOpen}
        onClose={() => setAddAccountOpen(false)}
        onCreatePaperPress={() => setCreatePaperOpen(true)}
      />
      <PaperCreateAccountSheet
        visible={createPaperOpen}
        onClose={() => setCreatePaperOpen(false)}
        onCreate={handleCreatePaperAccount}
      />
      <PaperAccountInfoSheet
        visible={infoAccount != null}
        account={infoAccount}
        btcPrice={btcPrice}
        onClose={() => setInfoAccountId(null)}
      />
    </>
  );
}
