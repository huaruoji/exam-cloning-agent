import { useEffect, useState } from "react"
import { BookOpen, Clock3, Cpu, FolderOpen, Sparkles, TrendingUp, ArrowRight } from "lucide-react"
import { Link } from "react-router-dom"
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts"

import { Button } from "@/components/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/Card"
import { api } from "@/lib/api"
import { useLayoutContext } from "@/hooks/useLayoutContext"
import { useToast } from "@/components/Toast"
import { useLanguage } from "@/i18n"

interface Stats {
  total_questions_in_bank: number
  total_attempted: number
  total_correct: number
  accuracy: number
  concept_mastery: Record<string, { score: number }>
  recent_accuracy: boolean[]
  knowledge_topics: string[]
  document_counts: Record<string, number>
}

export function Dashboard() {
  const { selectedCourse, refreshCourses, selectCourse } = useLayoutContext()
  const { addToast } = useToast()
  const { t } = useLanguage()
  const [stats, setStats] = useState<Stats | null>(null)
  const [showAllTopics, setShowAllTopics] = useState(false)
  const [computeHealthy, setComputeHealthy] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!selectedCourse) {
      setStats(null)
      return
    }
    api.getStats(selectedCourse.id)
      .then((value) => { if (!cancelled) setStats(value) })
      .catch(() => { if (!cancelled) setStats(null) })
    api.getComputeStatus()
      .then((value) => { if (!cancelled) setComputeHealthy(value.status === "healthy" || value.providers?.some((provider: any) => provider.healthy || provider.usable)) })
      .catch(() => { if (!cancelled) setComputeHealthy(false) })
    return () => { cancelled = true }
  }, [selectedCourse])

  const seedDemo = async () => {
    try {
      const res = await api.seedDemo()
      if (res.status === "exists") addToast("Demo course already loaded", "info")
      else addToast(`Demo loaded: ${res.questions_loaded} questions`, "success")
      await refreshCourses()
      if (res.course) selectCourse(res.course.id)
    } catch (e: any) {
      addToast(e.message || "Failed to load demo", "error")
    }
  }

  if (!selectedCourse) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <h1 className="font-serif text-3xl">Overview</h1>
        <p className="mt-2 text-sm text-slate-muted">Create a course above, or load a ready-made demo to explore the full experience.</p>
        <Button
          onClick={seedDemo}
          variant="coral"
          size="lg"
          className="mt-8 text-base"
        >
          <Sparkles size={20} /> Load demo course (AIAA 2711)
        </Button>
        <p className="mt-4 max-w-md text-center text-xs text-slate-muted">
          The demo seeds 30+ curated questions across 8 topics with a style profile ready for practice and mock exams.
        </p>
      </div>
    )
  }

  const statCards = [
    { label: "Questions in bank", value: stats?.total_questions_in_bank ?? 0, icon: BookOpen },
    { label: "Practice attempts", value: stats?.total_attempted ?? 0, icon: Clock3 },
    { label: "Accuracy", value: `${Math.round((stats?.accuracy ?? 0) * 100)}%`, icon: TrendingUp },
    {
      label: "Documents ingested",
      value: Object.values(stats?.document_counts ?? {}).reduce((sum, count) => sum + count, 0),
      icon: FolderOpen,
    },
  ]

  const masteryData = Object.entries(stats?.concept_mastery ?? {})
    .map(([concept, data]) => ({ topic: concept, score: Math.round(data.score * 100) }))
    .slice(0, 8)

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-muted">Course workspace</p>
      <h1 className="mt-2 font-serif text-3xl">{selectedCourse.name}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-muted">
        Combine past exams, written homework, slide decks, and reference PDFs into one
        practice workspace. Parsing happens in the background, then the course profile is
        updated automatically.
      </p>

      <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-coral/20 bg-coral/5 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs uppercase tracking-[0.14em] text-coral">{t("nextStep")}</p><p className="mt-1 font-medium">{stats?.total_questions_in_bank ? t("startPractice") : t("uploadMaterial")}</p><p className="mt-1 text-xs text-slate-muted">{stats?.total_questions_in_bank ? "Adaptive routing will favor due and weak concepts." : "A past exam gives the best style signal."}</p></div>
        <Link to={stats?.total_questions_in_bank ? "/practice" : "/upload"}><Button variant="coral">{stats?.total_questions_in_bank ? t("practice") : t("materials")}<ArrowRight size={15} /></Button></Link>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-4">
              <div className="rounded-xl bg-coral/10 p-3 text-coral">
                <Icon size={18} />
              </div>
              <div>
                <p className="text-2xl font-semibold">{value}</p>
                <p className="text-xs text-slate-muted">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("topicCoverage")}</CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.knowledge_topics?.length ? (
              <div className="flex flex-wrap gap-2">
                {stats.knowledge_topics.slice(0, showAllTopics ? undefined : 8).map((topic) => (
                  <span key={topic} className="rounded-full border border-border bg-ivory px-3 py-1 text-xs text-slate-ink">
                    {topic}
                  </span>
                ))}
                {stats.knowledge_topics.length > 8 && <button onClick={() => setShowAllTopics((value) => !value)} className="rounded-full px-3 py-1 text-xs text-coral hover:bg-coral/10">{showAllTopics ? t("showLess") : `${t("showAll")} (+${stats.knowledge_topics.length - 8})`}</button>}
              </div>
            ) : (
              <p className="text-sm text-slate-muted">
                No parsed topics yet. Upload documents under Materials to build the knowledge profile.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Document mix</CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.document_counts && Object.keys(stats.document_counts).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(stats.document_counts).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-slate-muted">{key.replaceAll("_", " ")}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-muted">No documents completed yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4"><CardContent className="flex flex-wrap items-center justify-between gap-4 py-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-coral/10 p-3 text-coral"><Cpu size={18} /></div><div><p className="text-sm font-medium">{t("compute")}</p><p className="text-xs text-slate-muted">{computeHealthy === null ? t("loading") : computeHealthy ? t("computeHealthy") : t("computeDegraded")}</p></div></div><Link to="/compute" className="text-sm text-coral hover:underline">{t("viewCompute")} →</Link></CardContent></Card>

      {masteryData.length >= 3 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Concept mastery radar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={masteryData}>
                  <PolarGrid stroke="var(--color-border)" />
                  <PolarAngleAxis dataKey="topic" tick={{ fontSize: 11, fill: "var(--color-slate-muted)" }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--color-slate-light)" }} />
                  <Radar dataKey="score" stroke="var(--color-coral)" fill="var(--color-coral)" fillOpacity={0.3} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {stats?.concept_mastery && Object.keys(stats.concept_mastery).length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Weakest concepts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(stats.concept_mastery)
              .sort(([, a], [, b]) => a.score - b.score)
              .slice(0, 6)
              .map(([concept, data]) => (
                <div key={concept}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{concept}</span>
                    <span className="text-slate-muted">{Math.round(data.score * 100)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-ivory-deep">
                    <div className="h-full rounded-full bg-coral" style={{ width: `${data.score * 100}%` }} />
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
