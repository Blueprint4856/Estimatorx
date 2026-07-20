import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const rootEl = document.getElementById("root")!;
rootEl.innerHTML = "";
createRoot(rootEl).render(<App />);
