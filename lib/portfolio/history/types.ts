export type EquitySnapshot = {
  timestamp: number;
  equity: number;
  cash: number;
  exposure: number;
  pnl: number;
};

export type EquitySnapshotSeries = {
  accountId: string;
  snapshots: EquitySnapshot[];
};
