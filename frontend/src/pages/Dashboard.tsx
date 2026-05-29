import { useEffect, useState } from "react"
import { BookOpen, Clock3, FolderOpen, TrendingUp } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/Card"
import { api } from "@/lib/api"
import { useLayoutContext } from "@/hooks/useLayoutContext"

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
  const { selectedCourse } = useLayoutContext()
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    if (!selectedCourse) {
      setStats(null)
      return
    }
    api.getStats(selectedCourse.id).then(setStats).catch(() => setStats(null))
  }, [selectedCourse])

  if (!selectedCourse) {
    return (
      <div>
        <h1 className="font-serif text-3xl">Overview</h1>
        <p className="mt-2 text-sm text-slate-muted">Create or select a course to start building a workspace.</p>
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

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-muted">Course workspace</p>
      <h1 className="mt-2 font-serif text-3xl">{selectedCourse.name}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-muted">
        Combine past exams, written homework, slide decks, and reference PDFs into one
        practice workspace. Parsing happens in the background, then the course profile is
        updated automatically.
      </p>

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
