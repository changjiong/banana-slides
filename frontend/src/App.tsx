import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Home } from './pages/Home';
import { History } from './pages/History';
import { OutlineEditor } from './pages/OutlineEditor';
import { DetailEditor } from './pages/DetailEditor';
import { SlidePreview } from './pages/SlidePreview';
import { ObjectCutoutDemo } from './pages/ObjectCutoutDemo';
import { useProjectStore } from './store/useProjectStore';
import { Loading, useToast, GithubLink } from './components/shared';

function App() {
  const { currentProject, syncProject, error, setError } = useProjectStore();
  const { show, ToastContainer } = useToast();

  // 恢复项目状态
  useEffect(() => {
    const savedProjectId = localStorage.getItem('currentProjectId');
    if (savedProjectId && !currentProject) {
      syncProject();
    }
  }, []);

  // 显示全局错误
  useEffect(() => {
    if (error) {
      show({ message: error, type: 'error' });
      setError(null);
    }
  }, [error, setError, show]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/history" element={<History />} />
        <Route path="/project/:projectId/outline" element={<OutlineEditor />} />
        <Route path="/project/:projectId/detail" element={<DetailEditor />} />
        <Route path="/project/:projectId/preview" element={<SlidePreview />} />
        {/* 隐藏实验页面：智能抠图 + Inpaint Demo（无导航入口，仅通过路径访问） */}
        <Route path="/secret/object-cutout" element={<ObjectCutoutDemo />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastContainer />
      <GithubLink />
    </BrowserRouter>
  );
}

export default App;

