import * as vscode from "vscode";
import { getContinueServerUrl } from "./bridge";
import {
  getExtensionUri,
  getNonce,
  openEditorAndRevealRange,
} from "./util/vscode";
import { RangeInFile } from "./client";
const WebSocket = require("ws");

let websocketConnections: { [url: string]: WebsocketConnection | undefined } =
  {};

class WebsocketConnection {
  private _ws: WebSocket;
  private readonly _url: string;
  private _onMessage: (message: string) => void;
  private _onOpen: () => void;
  private _onClose: () => void;

  private _newWebsocket() {
    const ws = new WebSocket(this._url);

    ws.addEventListener("message", (event: any) => {
      this._onMessage(event.data);
    });
    ws.addEventListener("close", () => {
      this._onClose();

      // Wait a second, then try to reconnect
      setTimeout(() => {
        this._ws = this._newWebsocket();
      }, 1000);
    });
    ws.addEventListener("open", () => {
      this._onOpen();
    });

    return ws;
  }

  constructor(
    url: string,
    onMessage: (message: string) => void,
    onOpen: () => void,
    onClose: () => void
  ) {
    this._url = url;
    this._onMessage = onMessage;
    this._onOpen = onOpen;
    this._onClose = onClose;

    this._ws = this._newWebsocket();

    const interval = setInterval(() => {
      if (this._ws.readyState !== WebSocket.OPEN)
        this._ws = this._newWebsocket();
      else clearInterval(interval);
    }, 1000);
  }

  public send(message: string) {
    if (typeof message !== "string") {
      message = JSON.stringify(message);
    }
    this._ws.send(message);
  }

  public close() {
    this._ws.close();
  }
}

export let debugPanelWebview: vscode.Webview | undefined;
export function setupDebugPanel(
  panel: vscode.WebviewPanel | vscode.WebviewView,
  sessionIdPromise: Promise<string>
): string {
  debugPanelWebview = panel.webview;
  panel.onDidDispose(() => {
    debugPanelWebview = undefined;
  });

  let extensionUri = getExtensionUri();
  let scriptUri: string;
  let styleMainUri: string;
  let vscMediaUrl: string = debugPanelWebview
    .asWebviewUri(vscode.Uri.joinPath(extensionUri, "react-app/dist"))
    .toString();

  const isProduction = true; // context?.extensionMode === vscode.ExtensionMode.Development;
  if (!isProduction) {
    scriptUri = "http://localhost:5173/src/main.tsx";
    styleMainUri = "http://localhost:5173/src/main.css";
  } else {
    scriptUri = debugPanelWebview
      .asWebviewUri(
        vscode.Uri.joinPath(extensionUri, "react-app/dist/assets/index.js")
      )
      .toString();
    styleMainUri = debugPanelWebview
      .asWebviewUri(
        vscode.Uri.joinPath(extensionUri, "react-app/dist/assets/index.css")
      )
      .toString();
  }

  panel.webview.options = {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, "react-app/dist")],
  };

  const nonce = getNonce();

  vscode.window.onDidChangeTextEditorSelection((e) => {
    if (e.selections[0].isEmpty) {
      return;
    }

    let rangeInFile: RangeInFile = {
      range: e.selections[0],
      filepath: e.textEditor.document.fileName,
    };
    let filesystem = {
      [rangeInFile.filepath]: e.textEditor.document.getText(),
    };
    panel.webview.postMessage({
      type: "highlightedCode",
      rangeInFile,
      filesystem,
    });

    panel.webview.postMessage({
      type: "workspacePath",
      value: vscode.workspace.workspaceFolders?.[0].uri.fsPath,
    });
  });

  async function connectWebsocket(url: string) {
    return new Promise((resolve, reject) => {
      const onMessage = (message: any) => {
        panel.webview.postMessage({
          type: "websocketForwardingMessage",
          url,
          data: message,
        });
      };
      const onOpen = () => {
        panel.webview.postMessage({
          type: "websocketForwardingOpen",
          url,
        });
        resolve(null);
      };
      const onClose = () => {
        websocketConnections[url] = undefined;
        panel.webview.postMessage({
          type: "websocketForwardingClose",
          url,
        });
      };
      const connection = new WebsocketConnection(
        url,
        onMessage,
        onOpen,
        onClose
      );
      websocketConnections[url] = connection;
    });
  }

  panel.webview.onDidReceiveMessage(async (data) => {
    switch (data.type) {
      case "onLoad": {
        let sessionId = await sessionIdPromise;
        panel.webview.postMessage({
          type: "onLoad",
          vscMachineId: vscode.env.machineId,
          apiUrl: getContinueServerUrl(),
          sessionId,
          vscMediaUrl,
        });

        // // Listen for changes to server URL in settings
        // vscode.workspace.onDidChangeConfiguration((event) => {
        //   if (event.affectsConfiguration("continue.serverUrl")) {
        //     debugPanelWebview?.postMessage({
        //       type: "onLoad",
        //       vscMachineId: vscode.env.machineId,
        //       apiUrl: getContinueServerUrl(),
        //       sessionId,
        //     });
        //   }
        // });

        break;
      }
      case "websocketForwardingOpen": {
        let url = data.url;
        if (typeof websocketConnections[url] === "undefined") {
          await connectWebsocket(url);
        }
        break;
      }
      case "websocketForwardingMessage": {
        let url = data.url;
        let connection = websocketConnections[url];
        if (typeof connection === "undefined") {
          await connectWebsocket(url);
        }
        connection = websocketConnections[url];
        if (typeof connection === "undefined") {
          throw new Error("Failed to connect websocket in VS Code Extension");
        }
        connection.send(data.message);
        break;
      }
      case "openFile": {
        openEditorAndRevealRange(data.path, undefined, vscode.ViewColumn.One);
        break;
      }
      case "withProgress": {
        // This message allows withProgress to be used in the webview
        if (data.done) {
          // Will be caught in the listener created below
          break;
        }
        let title = data.title;
        vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title,
            cancellable: false,
          },
          async () => {
            return new Promise<void>((resolve, reject) => {
              let listener = panel.webview.onDidReceiveMessage(async (data) => {
                if (
                  data.type === "withProgress" &&
                  data.done &&
                  data.title === title
                ) {
                  listener.dispose();
                  resolve();
                }
              });
            });
          }
        );
        break;
      }
    }
  });

  return `<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script>const vscode = acquireVsCodeApi();</script>
        <link href="${styleMainUri}" rel="stylesheet">
        
        <title>Continue</title>
      </head>
      <body>
        <div id="root"></div>
        <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
      </body>
    </html>`;
}

export class ContinueGUIWebviewViewProvider
  implements vscode.WebviewViewProvider
{
  public static readonly viewType = "continue.continueGUIView";

  constructor(private readonly sessionIdPromise: Promise<string>) {
    this.sessionIdPromise = sessionIdPromise;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    webviewView.webview.html = setupDebugPanel(
      webviewView,
      this.sessionIdPromise
    );
  }
}
