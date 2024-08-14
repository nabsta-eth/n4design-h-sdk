import axios from "axios";
import { INSTRUMENTS_LIST_URL_BASE } from "../../config";
import { Instrument, InstrumentSchema } from ".";
import { z } from "zod";
import { TradeNetwork } from "../../types/network";
import { BigNumber } from "ethers";
import { PRICE_UNIT } from "./reader";

const constructInstrumentFromSchema = (
  parsedSchema: InstrumentSchema
): Instrument => ({
  ...parsedSchema,
  getDisplayDecimals(price: BigNumber, useExtendedDecimals?: boolean) {
    const displayDecimalsToUse =
      this.displayDecimals ?? getInstrumentDecimalsFromPrice(price);
    return useExtendedDecimals && this.shouldUseExtendedDecimals
      ? displayDecimalsToUse + 1
      : displayDecimalsToUse;
  },
  getDescription() {
    return this.description ?? this.unitName;
  },
  getUnitName(useShortUnitName?: boolean) {
    return useShortUnitName
      ? this.unitNameShort ?? this.unitName
      : this.unitName;
  },
  getChartSymbol() {
    return this.chartSymbol ?? this.pair;
  },
});

export const fetchInstruments = async (
  network: TradeNetwork
): Promise<Instrument[]> => {
  const instrumentsListUrl = `${INSTRUMENTS_LIST_URL_BASE}/${network}.json`;
  const result = await axios.get(instrumentsListUrl);
  const rawInstruments = z.array(InstrumentSchema).parse(result.data);
  return rawInstruments.map((instrument) =>
    constructInstrumentFromSchema(instrument)
  );
};

const getInstrumentDecimalsFromPrice = (price: BigNumber): number => {
  if (price.lte(PRICE_UNIT)) {
    return 4;
  }
  if (price.lte(PRICE_UNIT.mul(10))) {
    return 4;
  }
  if (price.lte(PRICE_UNIT.mul(100))) {
    return 3;
  }
  return 2;
};
