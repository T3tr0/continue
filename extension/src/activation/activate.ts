import * as vscode from "vscode";
import { registerAllCommands } from "../commands";
import { registerAllCodeLensProviders } from "../lang-server/codeLens";
import { sendTelemetryEvent, TelemetryEvent } from "../telemetry";
// import { openCapturedTerminal } from "../terminal/terminalEmulator";
import IdeProtocolClient from "../continueIdeClient";
import { getContinueServerUrl } from "../bridge";
import { CapturedTerminal } from "../terminal/terminalEmulator";
import { setupDebugPanel, ContinueGUIWebviewViewProvider } from "../debugPanel";
import { startContinuePythonServer } from "./environmentSetup";
// import { CapturedTerminal } from "../terminal/terminalEmulator";

export let extensionContext: vscode.ExtensionContext | undefined = undefined;

export let ideProtocolClient: IdeProtocolClient;

export async function activateExtension(
  context: vscode.ExtensionContext,
  showTutorial: boolean
) {
  extensionContext = context;

  sendTelemetryEvent(TelemetryEvent.ExtensionActivated);
  registerAllCodeLensProviders(context);
  registerAllCommands(context);

  const serverUrl = getContinueServerUrl();
  // vscode.window.registerWebviewViewProvider("continue.continueGUIView", setupDebugPanel);
  await startContinuePythonServer();

  ideProtocolClient = new IdeProtocolClient(
    `${serverUrl.replace("http", "ws")}/ide/ws`,
    context
  );

  // Setup the left panel
  const sessionIdPromise = ideProtocolClient.getSessionId();
  const provider = new ContinueGUIWebviewViewProvider(sessionIdPromise);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "continue.continueGUIView",
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
      }
    )
  );
}
