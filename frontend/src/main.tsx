import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { LayoutGroup } from "motion/react"

import App from "./App"
import { DesktopUpdateNotice } from "./components/layout/DesktopUpdateNotice"
import { initializePreferences } from "./lib/preferences"
import "./styles/global.css"

initializePreferences()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LayoutGroup id="infinity-header">
      <App />
    </LayoutGroup>
    <DesktopUpdateNotice />
  </StrictMode>,
)
