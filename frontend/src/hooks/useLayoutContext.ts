import { useOutletContext } from "react-router-dom"

import type { LayoutContextValue } from "@/components/Layout"

export function useLayoutContext() {
  return useOutletContext<LayoutContextValue>()
}
