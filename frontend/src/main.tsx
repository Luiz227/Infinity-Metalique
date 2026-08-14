import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import App from "./App"
import { DesktopUpdateNotice } from "./components/layout/DesktopUpdateNotice"
import "./styles/global.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <DesktopUpdateNotice />
  </StrictMode>,
)
