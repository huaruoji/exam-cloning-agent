import { BrowserRouter, Routes, Route } from "react-router-dom"
import { Layout } from "@/components/Layout"
import { ToastProvider } from "@/components/Toast"
import { Dashboard } from "@/pages/Dashboard"
import { Upload } from "@/pages/Upload"
import { QuestionBank } from "@/pages/QuestionBank"
import { Practice } from "@/pages/Practice"
import { MockExam } from "@/pages/MockExam"
import { Review } from "@/pages/Review"
import { Settings } from "@/pages/Settings"

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ToastProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/questions" element={<QuestionBank />} />
            <Route path="/practice" element={<Practice />} />
            <Route path="/exam" element={<MockExam />} />
            <Route path="/review" element={<Review />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <h1 className="font-serif text-4xl">404</h1>
                <p className="mt-2 text-sm text-slate-muted">This page doesn't exist.</p>
              </div>
            } />
          </Route>
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  )
}

export default App