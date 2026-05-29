import { useState, useCallback } from "react"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/Card"
import { Button } from "@/components/Button"
import { Upload as UploadIcon, FileText, CheckCircle, Loader2 } from "lucide-react"

export function Upload() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState("")
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped?.name.endsWith(".pdf")) {
      setFile(dropped)
      setError("")
    } else {
      setError("Only PDF files are supported")
    }
  }, [])

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setError("")
    try {
      const res = await api.upload(file)
      setResult(res)
    } catch (e: any) {
      setError(e.message || "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Upload Exam PDF</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Upload</CardTitle>
          <CardDescription>
            Upload a past exam PDF. The AI will parse questions, analyze the exam style, and
            generate matching practice questions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
              dragOver
                ? "border-coral bg-coral/5"
                : "border-border hover:border-slate-muted"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <UploadIcon size={32} className="mx-auto mb-4 text-slate-muted" />
            {file ? (
              <div className="flex items-center justify-center gap-2">
                <FileText size={16} className="text-coral" />
                <span className="text-sm font-medium">{file.name}</span>
                <button
                  onClick={() => setFile(null)}
                  className="text-xs text-slate-muted hover:text-danger ml-2"
                >
                  Remove
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-muted mb-2">
                  Drag and drop a PDF file here, or
                </p>
                <label className="text-sm text-coral hover:underline cursor-pointer">
                  browse files
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) { setFile(f); setError("") }
                    }}
                  />
                </label>
              </>
            )}
          </div>

          {error && (
            <p className="text-sm text-danger mt-3">{error}</p>
          )}

          <Button
            variant="coral"
            className="mt-4"
            onClick={handleUpload}
            disabled={!file || uploading}
          >
            {uploading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Parsing PDF...
              </>
            ) : (
              "Upload & Parse"
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Result */}
      {result && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle size={20} className="text-success" />
              <CardTitle>Upload Successful</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-muted">File</p>
                <p className="font-medium">{result.filename}</p>
              </div>
              <div>
                <p className="text-slate-muted">Questions Parsed</p>
                <p className="font-medium">{result.questions_parsed}</p>
              </div>
            </div>

            {result.style_profile && (
              <div className="mt-4 p-4 bg-ivory-warm rounded-md">
                <p className="text-xs font-medium text-slate-muted mb-2 uppercase tracking-wide">
                  Exam Style Profile
                </p>
                <p className="text-sm">{result.style_profile.description}</p>
                {result.style_profile.key_topics?.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {result.style_profile.key_topics.map((t: string) => (
                      <span key={t} className="text-xs px-2 py-0.5 bg-ivory-card border border-border rounded">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
