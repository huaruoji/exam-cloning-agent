import { useState } from "react"
import { ChevronLeft, ChevronRight, Clock, Loader2 } from "lucide-react"

import { Button } from "@/components/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/Card"
import { MathRenderer } from "@/components/MathRenderer"
import { useLayoutContext } from "@/hooks/useLayoutContext"
import { api } from "@/lib/api"

export function MockExam() {
  const { selectedCourse } = useLayoutContext()
  const [exam, setExam] = useState<any>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [generating, setGenerating] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const generate = async () => {
    if (!selectedCourse) return
    setGenerating(true)
    try {
      const result = await api.generateExam({ courseId: selectedCourse.id, numQuestions: 10, timeLimit: 60 })
      setExam(result)
      setCurrentIndex(0)
      setAnswers({})
      setSubmitted(false)
    } finally {
      setGenerating(false)
    }
  }

  if (!selectedCourse) {
    return (
      <div>
        <h1 className="font-serif text-3xl">Mock Exam</h1>
        <p className="mt-2 text-sm text-slate-muted">Select a course before generating a mock exam.</p>
      </div>
    )
  }

  if (!exam && !generating) {
    return (
      <div>
        <h1 className="font-serif text-3xl">Mock Exam</h1>
        <p className="mt-2 text-sm text-slate-muted">Generate a paper that imitates the style profile of {selectedCourse.name}.</p>
        <Card className="mt-6">
          <CardContent className="py-12 text-center">
            <Button variant="coral" onClick={generate}>Generate mock exam</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (generating) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 size={24} className="mx-auto mb-3 animate-spin text-coral" />
          <p className="text-sm text-slate-muted">Generating exam...</p>
        </CardContent>
      </Card>
    )
  }

  const current = exam.questions[currentIndex]
  const total = exam.questions.length

  if (submitted) {
    return (
      <div>
        <h1 className="font-serif text-3xl">Mock Exam complete</h1>
        <p className="mt-2 text-sm text-slate-muted">You answered {Object.keys(answers).length} of {total} questions.</p>
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Answer map</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {exam.questions.map((q: any, index: number) => (
              <div key={index} className="rounded-xl border border-border bg-ivory px-4 py-3 text-sm">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-muted">Question {index + 1}</p>
                <div className="mt-1 line-clamp-2"><MathRenderer content={q.content} /></div>
                {answers[index] ? <p className="mt-2 text-xs text-coral">Your answer saved.</p> : <p className="mt-2 text-xs text-slate-muted">No answer entered.</p>}
              </div>
            ))}
            <Button variant="outline" onClick={generate}>Generate another paper</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Mock Exam</h1>
          <p className="mt-2 text-sm text-slate-muted">{selectedCourse.name}</p>
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-muted">
          <span>{Object.keys(answers).length}/{total} answered</span>
          <span className="flex items-center gap-1"><Clock size={14} /> {exam.time_limit_minutes} min</span>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {exam.questions.map((_: any, index: number) => (
          <button
            key={index}
            onClick={() => setCurrentIndex(index)}
            className={`h-8 w-8 rounded-lg text-xs ${
              currentIndex === index
                ? "border border-coral/40 bg-coral/10 text-coral"
                : answers[index]
                ? "bg-ivory-deep text-slate-ink"
                : "bg-ivory text-slate-muted"
            }`}
          >
            {index + 1}
          </button>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-xl">
            <MathRenderer content={current.content} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {current.question_type === "mcq" && current.options?.length ? (
            <div className="space-y-2">
              {current.options.map((option: string, index: number) => (
                <button
                  key={index}
                  onClick={() => setAnswers((prev) => ({ ...prev, [currentIndex]: option }))}
                  className={`w-full rounded-xl border p-3 text-left text-sm ${
                    answers[currentIndex] === option ? "border-coral bg-coral/5" : "border-border bg-ivory"
                  }`}
                >
                  <MathRenderer content={option} />
                </button>
              ))}
            </div>
          ) : (
            <textarea
              value={answers[currentIndex] || ""}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [currentIndex]: e.target.value }))}
              className="min-h-[140px] w-full rounded-xl border border-border bg-ivory px-4 py-3 text-sm outline-none"
              placeholder="Write your answer..."
            />
          )}

          <div className="mt-6 flex items-center justify-between">
            <Button variant="ghost" size="sm" disabled={currentIndex === 0} onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}>
              <ChevronLeft size={16} /> Previous
            </Button>
            {currentIndex === total - 1 ? (
              <Button variant="coral" size="sm" onClick={() => setSubmitted(true)}>Submit exam</Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setCurrentIndex((value) => Math.min(total - 1, value + 1))}>
                Next <ChevronRight size={16} />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
