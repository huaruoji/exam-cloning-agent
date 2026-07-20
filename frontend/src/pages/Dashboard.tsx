import { useEffect, useState } from "react"
import { BookOpen, Clock3, FolderOpen, Sparkles, TrendingUp } from "lucide-react"
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
  const [stats, setStats] = useState<Stats | null>(null)
  const [reviewStats, setReviewStats] = useState<any>(null)

  useEffect(() => {
    if (!selectedCourse) {
      setStats(null)
      setReviewStats(null)
      return
    }
    api.getStats(selectedCourse.id).then(setStats).catch(() => setStats(null))
    api.getReviewStats(selectedCourse.id).then(setReviewStats).catch(() => setReviewStats(null))
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

  // Streak / today row
  const todayCount = reviewStats?.daily?.length
    ? reviewStats.daily.reduce((sum: number, d: any) => {
        const today = new Date().toISOString().slice(0, 10)
        return d.date === today ? sum + (d.count || 0) : sum
      }, 0)
    : 0

  const topicStats = reviewStats?.topic_stats ?? []
  const bestTopic = topicStats.length
    ? topicStats.reduce((best: any, curr: any) => (curr.accuracy > (best?.accuracy || 0) ? curr : best), null)
    : null
  const weakestTopic = topicStats.length
    ? topicStats.reduce((weak: any, curr: any) => (curr.accuracy < (weak?.accuracy || 1) ? curr : weak), null)
    : null

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

      {/* Streak / today row */}
      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="text-center">
            <p className="text-2xl font-semibold">{todayCount}</p>
            <p className="text-xs text-slate-muted">Questions today</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="text-center">
            <p className="text-2xl font-semibold">{stats ? `${Math.round((stats.accuracy ?? 0) * 100)}%` : "—"}</p>
            <p className="text-xs text-slate-muted">Overall accuracy</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="text-center">
            <p className="text-2xl font-semibold truncate">{bestTopic ? bestTopic.topic : "—"}</p>
            <p className="text-xs text-slate-muted">Best topic</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="text-center">
            <p className="text-2xl font-semibold truncate">{weakestTopic ? weakestTopic.topic : "—"}</p>
            <p className="text-xs text-slate-muted">Weakest topic</p>
          </CardContent>
        </Card>
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
            <CardTitle>Topic coverage</CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.knowledge_topics?.length ? (
              <div className="flex flex-wrap gap-2">
                {stats.knowledge_topics.map((topic) => (
                  <span key={topic} className="rounded-full border border-border bg-ivory px-3 py-1 text-xs text-slate-ink">
                    {topic}
                  </span>
                ))}
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
