import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface Toast {
  id: string
  message: string
  type: "success" | "error" | "info"
  timerId?: ReturnType<typeof setTimeout>
}

interface ToastContextValue {
  toasts: Toast[]
  addToast: (message: string, type?: Toast["type"]) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within ToastProvider")
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timerIdsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  const addToast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = Math.random().toString(36).slice(2)
    const timerId = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
      timerIdsRef.current.delete(timerId)
    }, 5000)
    timerIdsRef.current.add(timerId)
    setToasts((prev) => [...prev, { id, message, type, timerId }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => {
      const toast = prev.find((t) => t.id === id)
      if (toast?.timerId !== undefined) {
        clearTimeout(toast.timerId)
        timerIdsRef.current.delete(toast.timerId)
      }
      return prev.filter((t) => t.id !== id)
    })
  }, [])

  useEffect(() => {
    return () => {
      timerIdsRef.current.forEach((id) => clearTimeout(id))
      timerIdsRef.current.clear()
    }
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-sm",
              toast.type === "success" && "border-success/20 bg-success/10 text-success",
              toast.type === "error" && "border-danger/20 bg-danger/10 text-danger",
              toast.type === "info" && "border-border bg-ivory-card text-slate-ink"
            )}
          >
            <span className="flex-1">{toast.message}</span>
            <button onClick={() => removeToast(toast.id)} className="shrink-0 opacity-60 hover:opacity-100">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
