import { useState } from "react"
import { KeyRound, UserRound } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/Card"
import { Button } from "@/components/Button"
import { useToast } from "@/components/Toast"
import { getUserApiKey, setUserApiKey, getUserIdDisplay, regenerateUserId } from "@/lib/api"

export function Settings() {
  const { addToast } = useToast()
  const [key, setKey] = useState(getUserApiKey())
  const [userId, setUserId] = useState(getUserIdDisplay())

  const save = () => {
    setUserApiKey(key.trim())
    addToast(key.trim() ? "API key saved" : "Built-in key will be used", "success")
  }

  const clear = () => {
    setKey("")
    setUserApiKey("")
    addToast("Using built-in demo key", "info")
  }

  const handleRegenerateId = () => {
    if (!confirm("Generating a new user ID will not migrate your existing data. Are you sure?")) return
    const newId = regenerateUserId()
    setUserId(newId)
    addToast("New anonymous ID generated", "info")
  }

  return (
    <div>
      <h1 className="font-serif text-3xl">Settings</h1>
      <p className="mt-2 text-sm text-slate-muted">Configure your DeepSeek API key for LLM grading and question generation.</p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound size={18} /> DeepSeek API key</CardTitle>
          <CardDescription>
            By default the app uses a built-in demo key (shared, rate-limited). Enter your own key
            to use your own quota — it is stored only in your browser and sent with each request.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-..."
              className="min-w-0 flex-1 rounded-lg border border-border bg-ivory px-3 py-2 text-sm outline-none"
            />
            <Button variant="coral" onClick={save}>Save</Button>
            <Button variant="outline" onClick={clear}>Use built-in</Button>
          </div>
          <p className="mt-3 text-xs text-slate-muted">
            Get a key at platform.deepseek.com. The key never leaves your browser except to call the DeepSeek API via this backend.
          </p>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserRound size={18} /> Anonymous user ID</CardTitle>
          <CardDescription>
            Your data is associated with this anonymous ID. All requests include it via the <code>X-User-Id</code> header.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg border border-border bg-ivory px-3 py-2 text-sm font-mono text-slate-muted">
              {userId}
            </code>
            <Button variant="outline" onClick={handleRegenerateId}>Regenerate</Button>
          </div>
          <p className="mt-3 text-xs text-slate-muted">
            Changing your ID does not transfer your practice history or statistics. Only do this if you want to start fresh.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
