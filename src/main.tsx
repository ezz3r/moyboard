import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { QuickPanel } from "./components/QuickPanel";
import { isQuickPanelWindow } from "./api";
import { installShellGuards } from "./shell";
import "./styles.css";

installShellGuards();

// One bundle, two windows: the Quick Panel window renders its own root.
const Root = isQuickPanelWindow() ? QuickPanel : App;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
