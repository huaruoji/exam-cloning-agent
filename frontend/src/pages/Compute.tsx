import { useCallback, useEffect, useState } from "react"
import { Activity, Database, Gauge, Loader2, RefreshCw, Route, ShieldCheck, Zap } from "lucide-react"
import { Button } from "@/components/Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/Card"
import { api } from "@/lib/api"
import { useToast } from "@/components/Toast"
import { useLanguage } from "@/i18n"
import { cn } from "@/lib/utils"

interface ProviderStatus { id?: string; name?: string; label?: string; model?: string; status?: string; healthy?: boolean; usable?: boolean; latency_ms?: number | null; kind?: string; health?: { reachable?: boolean; latency_ms?: number | null } | null }
interface RouteEvent { id?: string; task?: string; task_type?: string; operation?: string; provider?: string; route?: string; latency_ms?: number; outcome?: string; cached?: boolean; created_at?: string; reason?: string; route_reason?: string }
interface ComputeStatus {
  mode?: string; status?: string; success_rate?: number; cache_hit_rate?: number; cache_hits?: number;
  calls_saved?: number; saved_calls?: number; providers?: ProviderStatus[]; recent_routes?: RouteEvent[]; routes?: RouteEvent[];
  degraded_operation_available?: boolean; metrics?: { success_rate?: number | null; rule_graded?: number; fallbacks?: number; successful_requests?: number; failed_requests?: number }
}

function percent(value?: number) {
  if (value == null) return "—"
  return `${Math.round(value <= 1 ? value * 100 : value)}%`
}

export function Compute() {
  const { t } = useLanguage()
  const { addToast } = useToast()
  const [data, setData] = useState<ComputeStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [drilling, setDrilling] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await api.getComputeStatus()) }
    catch (error) { addToast(error instanceof Error ? error.message : "Failed to load compute status", "error") }
    finally { setLoading(false) }
  }, [addToast])

  useEffect(() => { void load() }, [load])

  const drill = async () => {
    setDrilling(true)
    try {
      const result = await api.runFailoverDrill()
      addToast(`Failover drill: ${result?.outcome || "completed"}${result?.selected_provider ? ` → ${result.selected_provider}` : ""}`, "success")
      await load()
    } catch (error) { addToast(error instanceof Error ? error.message : "Drill failed", "error") }
    finally { setDrilling(false) }
  }

  const providers = data?.providers || []
  const routes = data?.recent_routes || data?.routes || []
  const healthy = data?.status === "healthy" || providers.some((provider) => provider.healthy || provider.usable || provider.status === "healthy")

  return <div>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-[11px] uppercase tracking-[0.16em] text-slate-muted">{t("resourceRouting")}</p><h1 className="mt-2 font-serif text-3xl">{t("computeTitle")}</h1><p className="mt-2 text-sm text-slate-muted">{t("computeSubtitle")}</p></div>
      <div className="flex gap-2"><Button variant="outline" onClick={load} disabled={loading}><RefreshCw size={15} className={cn(loading && "animate-spin")} />{t("refresh")}</Button><Button variant="coral" onClick={drill} disabled={drilling}>{drilling ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}{t("runDrill")}</Button></div>
    </div>

    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { label: t("currentMode"), value: data?.mode || "adaptive", icon: Route },
        { label: t("successRate"), value: percent(data?.success_rate ?? data?.metrics?.success_rate ?? undefined), icon: Activity },
        { label: t("cacheHit"), value: percent(data?.cache_hit_rate ?? data?.cache_hits), icon: Database },
        { label: t("callsSaved"), value: data?.calls_saved ?? data?.saved_calls ?? data?.metrics?.rule_graded ?? 0, icon: Zap },
      ].map(({ label, value, icon: Icon }) => <Card key={label}><CardContent className="flex items-center gap-4"><div className="rounded-xl bg-coral/10 p-3 text-coral"><Icon size={18} /></div><div><p className="truncate text-xl font-semibold">{value}</p><p className="text-xs text-slate-muted">{label}</p></div></CardContent></Card>)}
    </div>

    <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Gauge size={18} />{t("providers")}</CardTitle><CardDescription><span className={cn("inline-flex items-center gap-1.5", healthy ? "text-success" : "text-warning")}><span className="h-2 w-2 rounded-full bg-current" />{healthy ? t("computeHealthy") : t("computeDegraded")}</span></CardDescription></CardHeader><CardContent className="space-y-2">
        {!providers.length ? <p className="text-sm text-slate-muted">{t("noProviders")}</p> : providers.map((provider, index) => { const ok = provider.status === "healthy" || provider.healthy === true || provider.usable === true; const unknown = provider.status === "unknown"; const latency = provider.latency_ms ?? provider.health?.latency_ms; return <div key={provider.id || index} className="flex items-center justify-between rounded-xl border border-border bg-ivory p-3"><div><p className="text-sm font-medium">{provider.label || provider.name || provider.kind || "Provider"}</p><p className="text-xs text-slate-muted">{provider.model || provider.kind || "OpenAI-compatible"}</p></div><div className="text-right"><p className={cn("text-xs", ok ? "text-success" : "text-slate-muted")}>{ok ? t("healthy") : unknown ? t("unknown") : t("unavailable")}</p>{latency != null && <p className="font-mono text-[11px] text-slate-muted">{latency} ms</p>}</div></div> })}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>{t("recentRoutes")}</CardTitle><CardDescription>{t("realRouting")}</CardDescription></CardHeader><CardContent>
        {!routes.length ? <p className="text-sm text-slate-muted">{t("noRoutes")}</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-slate-muted"><tr><th className="pb-3 font-normal">{t("task")}</th><th className="pb-3 font-normal">{t("route")}</th><th className="pb-3 font-normal">{t("latency")}</th><th className="pb-3 text-right font-normal">{t("result")}</th></tr></thead><tbody>{routes.slice(0, 12).map((event, index) => <tr key={event.id || index} className="border-t border-border"><td className="py-3">{event.task || event.task_type || event.operation || "Model request"}</td><td className="py-3 font-mono text-xs">{event.provider || event.route || (event.cached ? "cache" : "—")}</td><td className="py-3 font-mono text-xs">{event.latency_ms != null ? `${event.latency_ms} ms` : "—"}</td><td className="py-3 text-right text-xs text-slate-muted">{event.outcome || event.reason || event.route_reason || "success"}</td></tr>)}</tbody></table></div>}
      </CardContent></Card>
    </div>
  </div>
}
