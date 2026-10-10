import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "./styles/app.css";
import App from "./App";
import { StoreProvider } from "./lib/store";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider fallback={null}>
      <App />
    </StoreProvider>
  </StrictMode>,
);
