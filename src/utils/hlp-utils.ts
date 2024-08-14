import { Network } from "../types/network";
import { gql, request } from "graphql-request";
import config from "../config";

type GraphResponse = {
  hlpStats: Array<{
    id: string;
    aumInUsdg: string;
    hlpSupply: string;
    distributedUsd: string;
    distributedEth: string;
  }>;
};

// as of 27 Oct 2022 the only period that has data is daily & total
type Period = "hourly" | "daily" | "weekly" | "total";

type HistoricalHlpData = {
  timestamp: number;
  aum: number;
  hlpSupply: number;
  hlpPrice: number;
  cumulativeDistributedEthPerGlp: number;
  cumulativeDistributedUsdPerGlp: number;
  distributedUsdPerGlp: number;
  distributedEthPerGlp: number;
  glpSupplyChange: number;
  aumChange: number;
};

/**
 * @param from The minimum timestamp (in seconds) to fetch data
 * @param to The maximum timestamp (in seconds) to fetch data
 * @param network The network on which to fetch data
 * @returns historic hlp data
 */
export const getHistoricHlpData = async (
  from: number,
  to: number,
  network: Network,
  period: Period = "daily"
) => {
  if (network !== "arbitrum") throw new Error("Hlp only available on arbitrum");
  const query = gql`{
      hlpStats(
        first: 1000
        orderBy: id
        orderDirection: desc
        where: {period: ${period}, id_gte: ${from}, id_lte: ${to}}
      ) {
        id
        aumInUsdg
        hlpSupply
        distributedUsd
        distributedEth
      }
    }`;

  const data = await request<GraphResponse>(
    config.theGraphEndpoints[network].trade,
    query
  );

  let cumulativeDistributedUsdPerGlp = 0;
  let cumulativeDistributedEthPerGlp = 0;

  let prevGlpSupply: number;
  let prevAum: number;

  let ret = data.hlpStats
    .sort((a, b) => +b.id - +a.id)
    .reduce((memo, item) => {
      const last = memo[memo.length - 1];

      const aum = Number(item.aumInUsdg) / 1e18;
      const hlpSupply = Number(item.hlpSupply) / 1e18;

      const distributedUsd = Number(item.distributedUsd) / 1e30;
      const distributedUsdPerGlp = distributedUsd / hlpSupply || 0;
      cumulativeDistributedUsdPerGlp += distributedUsdPerGlp;

      const distributedEth = Number(item.distributedEth) / 1e18;
      const distributedEthPerGlp = distributedEth / hlpSupply || 0;
      cumulativeDistributedEthPerGlp += distributedEthPerGlp;

      const hlpPrice = aum / hlpSupply;
      const timestamp = parseInt(item.id);

      const newItem = {
        timestamp,
        aum,
        hlpSupply,
        hlpPrice,
        cumulativeDistributedEthPerGlp,
        cumulativeDistributedUsdPerGlp,
        distributedUsdPerGlp,
        distributedEthPerGlp,
      };

      // if the timestamp is the same as the previous timestamp, overwrite the previous
      // instead of pushing a new element. This is to remove duplicate timestamps
      if (last && last.timestamp === timestamp) {
        memo[memo.length - 1] = newItem;
      } else {
        memo.push(newItem);
      }

      return memo;
    }, [] as Partial<HistoricalHlpData>[])
    .map((item) => {
      let { hlpSupply, aum } = item;
      if (!hlpSupply) hlpSupply = prevGlpSupply;
      if (!aum) aum = prevAum;

      item.glpSupplyChange = prevGlpSupply
        ? ((hlpSupply - prevGlpSupply) / prevGlpSupply) * 100
        : 0;
      if (item.glpSupplyChange > 1000) item.glpSupplyChange = 0;

      item.aumChange = prevAum ? ((aum - prevAum) / prevAum) * 100 : 0;
      if (item.aumChange > 1000) item.aumChange = 0;

      prevGlpSupply = hlpSupply;
      prevAum = aum;
      return item;
    });

  ret = fillNa(ret);
  // this is a safe typecast as at this point, every field is filled
  return ret as HistoricalHlpData[];
};

// This is taken from handle-stats. It fills falsey values
// with the value from the previous array element, with the exception
// of the timestamp and id fields
function fillNa(arr: any[]) {
  const prevValues = {} as any;
  const keys = Object.keys(arr[0]).filter(
    (key) => key !== "timestamp" && key !== "id"
  );
  for (const el of arr) {
    for (const key of keys) {
      if (!el[key]) {
        if (prevValues[key]) {
          el[key] = prevValues[key];
        }
      } else {
        prevValues[key] = el[key];
      }
    }
  }
  return arr;
}
