import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/Card"
import { BookOpen, Target, TrendingUp, Clock } from "lucide-react"

interface Stats {
  total_questions_in_bank: number
  total_attempted: number
  total_correct: number
  accuracy: number
  concept_mastery: Record<string, { score: number; concept: string }>
  recent_accuracy: boolean[]
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    api.getStats().then(setStats).catch(() => {})
  }, [])

  const accuracy = stats?.accuracy ?? 0
  const attempted = stats?.total_attempted ?? 0
  const inBank = stats?.total_questions_in_bank ?? 0

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="p-2 rounded-md bg-coral/10">
              <BookOpen size={20} className="text-coral" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{inBank}</p>
              <p className="text-xs text-slate-muted">Questions in Bank</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="p-2 rounded-md bg-success/10">
              <Target size={20} className="text-success" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{attempted}</p>
              <p className="text-xs text-slate-muted">Attempted</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="p-2 rounded-md bg-warning/10">
              <TrendingUp size={20} className="text-warning" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{(accuracy * 100).toFixed(0)}%</p>
              <p className="text-xs text-slate-muted">Accuracy</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="p-2 rounded-md bg-slate-ink/10">
              <Clock size={20} className="text-slate-ink" />
            </div>
            <div>
              <p className="text-2xl font-semibold">
                {stats?.recent_accuracy?.length ?? 0}
              </p>
              <p className="text-xs text-slate-muted">Recent Sessions</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Concept mastery */}
      <Card>
        <CardHeader>
          <CardTitle>Concept Mastery</CardTitle>
        </CardHeader>
        <CardContent>
          {stats?.concept_mastery && Object.keys(stats.concept_mastery).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(stats.concept_mastery)
                .sort(([, a], [, b]) => a.score - b.score)
                .map(([concept, data]) => (
                  <div key={concept}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{concept}</span>
                      <span className="text-slate-muted">{(data.score * 100).toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-ivory-deep rounded-full overflow-hidden">
                      <div
                        className="h-full bg-coral rounded-full transition-all"
                        style={{ width: `${data.score * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-sm text-slate-muted">
              No data yet. Upload an exam PDF or start practicing to see your progress.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Recent accuracy streak */}
      {stats?.recent_accuracy && stats.recent_accuracy.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Recent Answers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-1 flex-wrap">
              {stats.recent_accuracy.map((correct, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-sm ${
                    correct ? "bg-success" : "bg-danger/60"
                  }`}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
