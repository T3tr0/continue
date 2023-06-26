import React, { useEffect, useState } from "react";
import { RootStore } from "../redux/store";
import { useSelector } from "react-redux";
import ContinueGUIClientProtocol from "./ContinueGUIProtocol";
import { postVscMessage } from "../vscode";

function useContinueGUIProtocol(useVscodeMessagePassing: boolean = true) {
  const sessionId = useSelector((state: RootStore) => state.config.sessionId);
  const serverHttpUrl = useSelector((state: RootStore) => state.config.apiUrl);
  const [client, setClient] = useState<ContinueGUIClientProtocol | undefined>(
    undefined
  );
  const [connected, setConnected] = useState<boolean>(false);

  useEffect(() => {
    if (!sessionId || !serverHttpUrl) {
      if (useVscodeMessagePassing) {
        postVscMessage("onLoad", {});
      }
      setClient(undefined);
      return;
    }

    const serverUrlWithSessionId =
      serverHttpUrl.replace("http", "ws") +
      "/gui/ws?session_id=" +
      encodeURIComponent(sessionId);

    console.log("Creating websocket", serverUrlWithSessionId);
    console.log("Using vscode message passing", useVscodeMessagePassing);
    const newClient = new ContinueGUIClientProtocol(
      serverUrlWithSessionId,
      useVscodeMessagePassing,
      () => {
        console.log("Connected to websocket");
        setConnected(true);
      },
      () => {
        console.log("Disconnected from websocket");
        setConnected(false);
      }
    );
    setClient(newClient);
  }, [sessionId, serverHttpUrl]);

  return { client, connected };
}
export default useContinueGUIProtocol;
