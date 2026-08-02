import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { KcPage } from "./kc.gen";
import "antd/dist/reset.css";
import "./theme.css";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        {window.kcContext ? <KcPage kcContext={window.kcContext} /> : null}
    </StrictMode>
);
