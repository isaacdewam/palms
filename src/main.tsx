import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installNativeKeys } from "./lib/native-keys";
import "lenis/dist/lenis.css";
import "./index.css";

installNativeKeys();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
