import { useState } from "react"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/Card"
import { Button } from "@/components/Button"
import { MathRenderer } from "@/components/MathRenderer"
import { Loader2, ChevronLeft, ChevronRight, Clock } from "lucide-react"

export function MockExam() {
  const [exam, setExam] = useState<any>(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [generating, setGenerating] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const generate = async () => {
    setGenerating(true)
    try {
      const res = await api.generateExam(10, 60)
      setExam(res)
      setCurrentIdx(0)
      setAnswers({})
      setSubmitted(false)
    } catch {
    } finally {
      setGenerating(false)
    }
  }

  const currentQ = exam?.questions?.[currentIdx]
  const total = exam?.questions?.length ?? 0

  const setAnswer = (idx: number, val: string) => {
    setAnswers((prev) => ({ ...prev, [idx]: val }))
  }

  const handleSubmit = () => {
    setSubmitted(true)
  }

  const answeredCount = Object.keys(answers).length

  if (!exam && !generating) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-2">Mock Exam</h1>
        <p className="text-sm text-slate-muted mb-6">
          Generate a mock exam that clones the style of your uploaded exams.
        </p>
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-sm text-slate-muted mb-4">
              Upload an exam PDF first, then generate a matching mock exam.
            </p>
            <Button variant="coral" onClick={generate}>
              Generate Mock Exam
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (generating) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Loader2 size={24} className="animate-spin mx-auto mb-3 text-coral" />
          <p className="text-sm text-slate-muted">Generating exam...</p>
        </CardContent>
      </Card>
    )
  }

  if (submitted) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-6">Exam Complete</h1>
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-muted mb-4">
              You answered {answeredCount} of {total} questions.
            </p>
            <div className="space-y-3">
              {exam.questions.map((q: any, i: number) => (
                <div key={i} className="p-3 border border-border rounded-md">
                  <p className="text-xs text-slate-muted mb-1">Q{i + 1}</p>
                  <p className="text-sm line-clamp-1"><MathRenderer content={q.content} /></p>
                  {answers[i] && (
                    <p className="text-xs text-coral mt-1">Your answer: {answers[i]}</p>
                  )}
                </div>
              ))}
            </div>
            <Button variant="outline" className="mt-6" onClick={generate}>
              Generate New Exam
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Mock Exam</h1>
        <div className="flex items-center gap-4 text-sm text-slate-muted">
          <span>{answeredCount}/{total} answered</span>
          {exam.time_limit_minutes && (
            <span className="flex items-center gap-1">
              <Clock size={14} />
              {exam.time_limit_minutes} min
            </span>
          )}
        </div>
      </div>

      {/* Question navigation dots */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {exam.questions.map((_: any, i: number) => (
          <button
            key={i}
            onClick={() => setCurrentIdx(i)}
            className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
              i === currentIdx
                ? "bg-slate-ink text-white"
                : answers[i]
                ? "bg-coral/20 text-coral"
                : "bg-ivory-deep text-slate-muted hover:bg-ivory-warm"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Current question */}
      {currentQ && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-xs text-slate-muted mb-2">
              <span>Question {currentIdx + 1} of {total}</span>
              <span>|</span>
              <span>{currentQ.difficulty}</span>
              <span>|</span>
              <span>{currentQ.topic}</span>
            </div>
            <CardTitle>
              <MathRenderer content={currentQ.content} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {currentQ.question_type === "mcq" && currentQ.options ? (
              <div className="space-y-2 mb-6">
                {currentQ.options.map((opt: string, i: number) => (
                  <button
                    key={i}
                    onClick={() => setAnswer(currentIdx, opt)}
                    className={`w-full text-left p-3 rounded-md border text-sm transition-colors ${
                      answers[currentIdx] === opt
                        ? "border-coral bg-coral/5"
                        : "border-border hover:border-slate-muted"
                    }`}
                  >
                    <MathRenderer content={opt} />
                  </button>
                ))}
              </div>
            ) : (
              <textarea
                value={answers[currentIdx] || ""}
                onChange={(e) => setAnswer(currentIdx, e.target.value)}
                placeholder="Type your answer..."
                className="w-full p-3 rounded-md border border-border bg-ivory-card text-sm min-h-[120px] resize-y mb-4 focus:outline-none focus:ring-2 focus:ring-coral/30"
              />
            )}

            <div className="flex justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))}
                disabled={currentIdx === 0}
              >
                <ChevronLeft size={16} /> Previous
              </Button>
              {currentIdx < total - 1 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentIdx(currentIdx + 1)}
                >
                  Next <ChevronRight size={16} />
                </Button>
              ) : (
                <Button variant="coral" size="sm" onClick={handleSubmit}>
                  Submit Exam
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
