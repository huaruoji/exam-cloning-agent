import { BrowserRouter, Routes, Route } from "react-router-dom"
import { Layout } from "@/components/Layout"
import { ToastProvider } from "@/components/Toast"
import { Dashboard } from "@/pages/Dashboard"
import { Upload } from "@/pages/Upload"
import { QuestionBank } from "@/pages/QuestionBank"
import { Practice } from "@/pages/Practice"
import { MockExam } from "@/pages/MockExam"

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/questions" element={<QuestionBank />} />
            <Route path="/practice" element={<Practice />} />
            <Route path="/exam" element={<MockExam />} />
          </Route>
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  )
}

export default App
