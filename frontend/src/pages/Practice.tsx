import { useState } from "react"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/Card"
import { Button } from "@/components/Button"
import { MathRenderer } from "@/components/MathRenderer"
import { Loader2, CheckCircle, XCircle, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

export function Practice() {
  const [question, setQuestion] = useState<any>(null)
  const [source, setSource] = useState<string>("")
  const [answer, setAnswer] = useState("")
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const loadNext = async () => {
    setLoading(true)
    setResult(null)
    setAnswer("")
    setSelectedOption(null)
    try {
      const res = await api.getNextQuestion()
      setQuestion(res.question)
      setSource(res.source)
    } catch (e: any) {
      setQuestion(null)
    } finally {
      setLoading(false)
    }
  }

  const submit = async () => {
    if (!question) return
    const finalAnswer = question.question_type === "mcq" ? (selectedOption || "") : answer
    if (!finalAnswer.trim()) return

    setSubmitting(true)
    try {
      const res = await api.submitAnswer(question.id, finalAnswer)
      setResult(res)
    } catch {
      setResult({ correct: false })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">Practice</h1>
      <p className="text-sm text-slate-muted mb-6">
        Adaptive practice — questions adjust to your mastery level.
      </p>

      {!question && !loading && (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-sm text-slate-muted mb-4">
              Ready to practice? The AI will select questions based on your weak areas.
            </p>
            <Button variant="coral" onClick={loadNext}>
              Start Practice Session
            </Button>
          </CardContent>
        </Card>
      )}

      {loading && (
        <Card>
          <CardContent className="text-center py-12">
            <Loader2 size={24} className="animate-spin mx-auto mb-3 text-coral" />
            <p className="text-sm text-slate-muted">Generating question...</p>
          </CardContent>
        </Card>
      )}

      {question && !loading && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-xs px-2 py-0.5 rounded",
                question.difficulty === "easy" && "bg-success/10 text-success",
                question.difficulty === "medium" && "bg-warning/10 text-warning",
                question.difficulty === "hard" && "bg-danger/10 text-danger",
              )}>
                {question.difficulty}
              </span>
              <span className="text-xs text-slate-muted">{question.topic}</span>
              {source === "generated" && (
                <span className="text-xs text-coral ml-auto">AI Generated</span>
              )}
            </div>
            <CardTitle className="mt-2">
              <MathRenderer content={question.content} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* MCQ options */}
            {question.question_type === "mcq" && question.options && (
              <div className="space-y-2 mb-6">
                {question.options.map((opt: string, i: number) => {
                  const isSelected = selectedOption === opt
                  const isCorrect = result && opt === question.answer
                  const isWrong = result && isSelected && !result.correct
                  return (
                    <button
                      key={i}
                      onClick={() => !result && setSelectedOption(opt)}
                      disabled={!!result}
                      className={cn(
                        "w-full text-left p-3 rounded-md border text-sm transition-colors",
                        !result && isSelected && "border-coral bg-coral/5",
                        !result && !isSelected && "border-border hover:border-slate-muted",
                        isCorrect && "border-success bg-success/5",
                        isWrong && "border-danger bg-danger/5",
                        result && !isCorrect && !isWrong && "border-border opacity-50",
                      )}
                    >
                      <MathRenderer content={opt} />
                    </button>
                  )
                })}
              </div>
            )}

            {/* Short answer / calculation input */}
            {question.question_type !== "mcq" && !result && (
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Type your answer here..."
                className="w-full p-3 rounded-md border border-border bg-ivory-card text-sm min-h-[120px] resize-y mb-4 focus:outline-none focus:ring-2 focus:ring-coral/30"
              />
            )}

            {/* Actions */}
            {!result && (
              <div className="flex gap-3">
                <Button variant="coral" onClick={submit} disabled={submitting || (!selectedOption && !answer.trim())}>
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : "Submit Answer"}
                </Button>
              </div>
            )}

            {/* Result feedback */}
            {result && (
              <div className={cn(
                "p-4 rounded-md mt-4",
                result.correct ? "bg-success/5 border border-success/20" : "bg-danger/5 border border-danger/20"
              )}>
                <div className="flex items-center gap-2 mb-2">
                  {result.correct ? (
                    <CheckCircle size={18} className="text-success" />
                  ) : (
                    <XCircle size={18} className="text-danger" />
                  )}
                  <span className="font-medium text-sm">
                    {result.correct ? "Correct!" : "Incorrect"}
                  </span>
                </div>
                {!result.correct && question.answer && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-slate-muted mb-1">Correct Answer</p>
                    <p className="text-sm"><MathRenderer content={question.answer} /></p>
                  </div>
                )}
                {question.explanation && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs font-medium text-slate-muted mb-1">Explanation</p>
                    <p className="text-sm"><MathRenderer content={question.explanation} /></p>
                  </div>
                )}
                <div className="mt-3 text-xs text-slate-muted">
                  Mastery: {(result.mastery_score * 100).toFixed(0)}% | Overall: {(result.overall_accuracy * 100).toFixed(0)}%
                </div>
              </div>
            )}

            {result && (
              <Button variant="outline" className="mt-4" onClick={loadNext}>
                Next Question <ArrowRight size={16} />
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
