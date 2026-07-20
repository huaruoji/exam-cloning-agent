import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { CheckCircle, Play, XCircle } from "lucide-react"

import { Button } from "@/components/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/Card"
import { QuestionCard } from "@/components/QuestionCard"
import { useLayoutContext } from "@/hooks/useLayoutContext"
import { useToast } from "@/components/Toast"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/i18n"

const FORCED_TOPIC_KEY = "exam-cloner:practice-topic"

type Tab = "wrong" | "history"

export function Review() {
  const { t } = useLanguage()
  const { selectedCourse } = useLayoutContext()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>("wrong")
  const [wrong, setWrong] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    if (!selectedCourse) return
    Promise.all([
      api.getWrong(selectedCourse.id),
      api.getHistory(selectedCourse.id),
      api.getReviewStats(selectedCourse.id),
    ])
      .then(([w, h, s]) => {
        setWrong(w.wrong)
        setHistory(h.history)
        setStats(s)
      })
      .catch((e) => addToast(e.message || "Failed to load review data", "error"))
  }, [selectedCourse, addToast])

  const redoQuestion = (topic: string) => {
    localStorage.setItem(FORCED_TOPIC_KEY, topic)
    navigate("/practice")
  }

  const practiceAllWrong = () => {
    if (wrong.length === 0) return
    // Navigate to practice — the adaptive engine already prioritizes weak concepts.
    navigate("/practice")
  }

  if (!selectedCourse) {
    return (
      <div>
        <h1 className="font-serif text-3xl">{t("review")}</h1>
        <p className="mt-2 text-sm text-slate-muted">{t("selectCourse")}</p>
      </div>
    )
  }

  const daily = stats?.daily ?? []

  return (
    <div>
      <h1 className="font-serif text-3xl">{t("review")}</h1>
      <p className="mt-2 text-sm text-slate-muted">Wrong answers, practice history, and progress over time.</p>

      {/* Summary */}
      {stats && (
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-4">
              <div className="rounded-xl bg-coral/10 p-3 text-coral"><CheckCircle size={18} /></div>
              <div>
                <p className="text-2xl font-semibold">{stats.total_correct}/{stats.total_submitted}</p>
                <p className="text-xs text-slate-muted">Correct answers</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4">
              <div className="rounded-xl bg-danger/10 p-3 text-danger"><XCircle size={18} /></div>
              <div>
                <p className="text-2xl font-semibold">{wrong.length}</p>
                <p className="text-xs text-slate-muted">Wrong to review</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-xs uppercase tracking-[0.16em] text-slate-muted">Overall accuracy</p>
              <p className="mt-1 text-2xl font-semibold">
                {stats.total_submitted ? Math.round((stats.total_correct / stats.total_submitted) * 100) : 0}%
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Accuracy over time */}
      {daily.length > 1 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Accuracy over time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-slate-muted)" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--color-slate-muted)" }} />
                  <Tooltip contentStyle={{ background: "var(--color-ivory-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="accuracy" stroke="var(--color-coral)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="mt-6 flex gap-2">
        <button onClick={() => setTab("wrong")}
          className={cn("rounded-lg px-3 py-1.5 text-sm", tab === "wrong" ? "border border-coral/30 bg-coral/8 text-slate-ink" : "text-slate-muted hover:bg-ivory-card")}>
          Wrong answers ({wrong.length})
        </button>
        <button onClick={() => setTab("history")}
          className={cn("rounded-lg px-3 py-1.5 text-sm", tab === "history" ? "border border-coral/30 bg-coral/8 text-slate-ink" : "text-slate-muted hover:bg-ivory-card")}>
          History ({history.length})
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {tab === "wrong" && (
          <>
            {wrong.length > 0 && (
              <div className="mb-2">
                <Button variant="outline" size="sm" onClick={practiceAllWrong}>
                  <Play size={14} /> Practice weak topics
                </Button>
              </div>
            )}
            {wrong.length === 0 ? (
              <Card><CardContent className="py-12 text-sm text-slate-muted">{t("noWrongAnswers")}</CardContent></Card>
            ) : (
              wrong.map((item) => (
                <Card key={item.id}>
                  <CardContent className="py-4">
                    <div className="mb-2 flex items-center gap-2 text-xs">
                      <span className="rounded bg-danger/10 px-2 py-0.5 text-danger">{item.concept}</span>
                      <span className="text-slate-muted">{new Date(item.created_at).toLocaleString()}</span>
                      <span className="text-xs text-slate-muted">· Your answer: {item.answer || "(empty)"}</span>
                    </div>
                    {item.question ? (
                      <QuestionCard question={item.question} defaultExpanded compact />
                    ) : (
                      <p className="text-sm text-slate-muted">Question content not available.</p>
                    )}
                    {item.question?.topic && (
                      <div className="mt-2">
                        <Button variant="ghost" size="sm" onClick={() => redoQuestion(item.question.topic)}>
                          <Play size={12} /> Redo this question
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </>
        )}

        {tab === "history" && (
          history.length === 0 ? (
            <Card><CardContent className="py-12 text-sm text-slate-muted">{t("noHistory")}</CardContent></Card>
          ) : (
            history.map((item) => (
              <Card key={item.id}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "rounded px-2 py-0.5 text-xs",
                        item.correct === true && "bg-success/10 text-success",
                        item.correct === false && "bg-danger/10 text-danger",
                      )}>
                        {item.correct ? "correct" : "wrong"}
                      </span>
                      <span className="text-slate-muted">{item.concept}</span>
                      <span className="text-xs text-slate-muted">· Answer: {item.answer || "(empty)"}</span>
                    </div>
                    <span className="text-xs text-slate-muted">{new Date(item.created_at).toLocaleString()}</span>
                  </div>
                  {item.question && (
                    <div className="mt-2">
                      <QuestionCard question={item.question} defaultExpanded compact />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )
        )}
      </div>
    </div>
  )
}
