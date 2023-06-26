import DebugPanel from "./components/DebugPanel";
import { Provider } from "react-redux";
import store from "./redux/store";
import WelcomeTab from "./tabs/welcome";
import GUI from "./tabs/gui";

function App() {
  return (
    <>
      <Provider store={store}>
        <DebugPanel
          tabs={[
            {
              element: <GUI />,
              title: "GUI",
            },
            // { element: <WelcomeTab />, title: "Welcome" },
          ]}
        ></DebugPanel>
      </Provider>
    </>
  );
}

export default App;
