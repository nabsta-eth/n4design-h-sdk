import { Network } from "../types/network";
import { WebSocketProvider } from "@ethersproject/providers";
import { NETWORK_NAME_TO_CHAIN_ID } from "../constants";
import { ethers } from "ethers";

const RECONNECT_WAIT_TIME = 500;

export type PersistentWebsocketConnection = {
  provider: WebSocketProvider;
  closeConnection: () => void;
};

const connections: Record<number, PersistentWebsocketConnection | undefined> =
  {};

export const openPersistentWebsocketRpcConnection = (
  url: string,
  network: Network,
  shouldLogStdout = true,
  connectionId?: number
): PersistentWebsocketConnection => {
  if (!connectionId) {
    connectionId = Object.keys(connections).length + 1;
  }
  const provider = new ethers.providers.WebSocketProvider(url, {
    name: network,
    chainId: NETWORK_NAME_TO_CHAIN_ID[network],
  });
  let hasRequestedCloseConnection = false;
  const closeConnection = () => {
    if (!connections[connectionId!]) {
      // Already closed.
      return;
    }
    hasRequestedCloseConnection = true;
    provider._websocket.close();
    connections[connectionId!] = undefined;
  };
  if (!connections[connectionId]) {
    connections[connectionId] = {
      provider,
      closeConnection,
    };
  } else {
    connections[connectionId]!.provider = provider;
  }
  log(connectionId, "initialising connection", shouldLogStdout);
  // If websocket connection is closed.
  provider._websocket.onclose = async (event: { code: number }) => {
    log(
      connectionId!,
      `connection closed${event?.code ? ` (${event.code})` : ""}`,
      shouldLogStdout
    );
    if (hasRequestedCloseConnection) {
      return;
    }
    await new Promise((r) => setTimeout(r, RECONNECT_WAIT_TIME));
    openPersistentWebsocketRpcConnection(
      url,
      network,
      shouldLogStdout,
      connectionId
    );
  };
  return connections[connectionId]!;
};

const log = (id: number, message: string, shouldLog: boolean) => {
  if (!shouldLog) {
    return;
  }
  console.log(
    `[${new Date().toLocaleString()}] [handle-sdk ws connection #${id}] ${message}`
  );
};
