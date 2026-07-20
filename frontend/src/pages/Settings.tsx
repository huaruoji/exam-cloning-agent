import { useState } from "react"
import { CheckCircle, KeyRound, Loader2, UserRound } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/Card"
import { Button } from "@/components/Button"
import { useToast } from "@/components/Toast"
import { api, getModelConfig, setModelConfig, getUserIdDisplay, regenerateUserId, type ModelConfig } from "@/lib/api"
import { useLanguage } from "@/i18n"

export function Settings() {
  const { t } = useLanguage()
  const { addToast } = useToast()
  const [config, setConfig] = useState<ModelConfig>(getModelConfig)
  const [userId, setUserId] = useState(getUserIdDisplay())
  const [testing, setTesting] = useState(false)
  const [tested, setTested] = useState(false)

  const update = <K extends keyof ModelConfig>(key: K, value: ModelConfig[K]) => {
    setConfig((current) => ({ ...current, [key]: value }))
    setTested(false)
  }
  const save = () => { setModelConfig(config); addToast(t("saved"), "success") }
  const clear = () => {
    const next = { label: "Built-in", baseUrl: "", model: "", apiKey: "", allowFallback: true }
    setConfig(next); setModelConfig(next); setTested(false); addToast(t("useBuiltIn"), "info")
  }
  const test = async () => {
    if (!config.baseUrl.trim()) return
    setTesting(true)
    try {
      const result = await api.probeCompute({ base_url: config.baseUrl.trim(), api_key: config.apiKey.trim() || undefined, model: config.model.trim() || undefined })
      if (!result.reachable) throw new Error(result.error || t("probeFailed"))
      setTested(true); addToast(`${t("probeOk")}${result.latency_ms != null ? ` · ${Math.round(result.latency_ms)} ms` : ""}`, "success")
    } catch (error) { setTested(false); addToast(error instanceof Error ? error.message : t("probeFailed"), "error") }
    finally { setTesting(false) }
  }
  const handleRegenerateId = () => {
    if (!confirm(t("regenerateConfirm"))) return
    setUserId(regenerateUserId()); addToast(t("newId"), "info")
  }

  const inputClass = "w-full rounded-lg border border-border bg-ivory px-3 py-2 text-sm outline-none focus:border-coral/60"
  return <div>
    <h1 className="font-serif text-3xl">{t("settings")}</h1>
    <p className="mt-2 text-sm text-slate-muted">{t("settingsSubtitle")}</p>

    <Card className="mt-6"><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound size={18} />{t("modelConnections")}</CardTitle><CardDescription>{t("connectionHelp")}</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs text-slate-muted">{t("label")}<input value={config.label} onChange={(event) => update("label", event.target.value)} placeholder="My LM Studio" className={`${inputClass} mt-1`} /></label><label className="text-xs text-slate-muted">{t("model")}<input value={config.model} onChange={(event) => update("model", event.target.value)} placeholder="qwen2.5-14b-instruct" className={`${inputClass} mt-1`} /></label></div>
      <label className="block text-xs text-slate-muted">{t("baseUrl")}<input type="url" value={config.baseUrl} onChange={(event) => update("baseUrl", event.target.value)} placeholder="https://model.example.com/v1" className={`${inputClass} mt-1`} /></label>
      <label className="block text-xs text-slate-muted">{t("apiKey")}<input type="password" value={config.apiKey} onChange={(event) => update("apiKey", event.target.value)} placeholder="sk-… (optional)" className={`${inputClass} mt-1`} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.allowFallback} onChange={(event) => update("allowFallback", event.target.checked)} className="accent-coral" />{t("allowFallback")}</label>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={test} disabled={!config.baseUrl.trim() || testing}>{testing ? <Loader2 size={15} className="animate-spin" /> : tested ? <CheckCircle size={15} className="text-success" /> : null}{t("testConnection")}</Button><Button variant="coral" onClick={save}>{t("save")}</Button><Button variant="ghost" onClick={clear}>{t("useBuiltIn")}</Button></div>
      <p className="text-xs text-slate-muted">{t("endpointSafety")}</p>
    </CardContent></Card>

    <details className="mt-6 rounded-2xl border border-border bg-ivory-card"><summary className="cursor-pointer px-6 py-5 text-sm font-medium">{t("advanced")}</summary><div className="border-t border-border p-6"><div className="flex items-center gap-2"><UserRound size={18} /><p className="font-medium">{t("anonymousId")}</p></div><p className="mt-2 text-xs text-slate-muted">{t("idHelp")}</p><div className="mt-3 flex flex-wrap gap-2"><code className="min-w-0 flex-1 break-all rounded-lg border border-border bg-ivory px-3 py-2 text-sm text-slate-muted">{userId}</code><Button variant="outline" onClick={handleRegenerateId}>{t("regenerate")}</Button></div></div></details>
  </div>
}
