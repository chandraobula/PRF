import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Splash from './pages/Splash';
import Onboarding from './pages/Onboarding';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import FinanceHub from './pages/FinanceHub';
import CarHub from './pages/CarHub';
import WorkHub from './pages/WorkHub';
import LearningHub from './pages/LearningHub';
import Pantry from './pages/Pantry';
import MealPlanner from './pages/MealPlanner';
import Subscriptions from './pages/Subscriptions';
import ImportantDates from './pages/ImportantDates';
import Notes from './pages/Notes';
import DocumentViewer from './pages/DocumentViewer';
import ConnectServices from './pages/ConnectServices';
import AIAssistant from './pages/AIAssistant';
import ProfileSettings from './pages/ProfileSettings';
import AdminDashboard from './pages/AdminDashboard';
import PlannerBoard from './pages/admin/PlannerBoard';
import ImportNotes from './pages/admin/ImportNotes';
import TaskDetail from './pages/admin/TaskDetail';
import Standup from './pages/admin/Standup';
import WorkosDashboard from './pages/admin/WorkosDashboard';
import ProjectsList from './pages/admin/ProjectsList';
import ProjectDetail from './pages/admin/ProjectDetail';
import AiWorkspace from './pages/admin/AiWorkspace';
import KnowledgeBase from './pages/admin/KnowledgeBase';
import Analytics from './pages/admin/Analytics';
import RequireAdmin from './components/RequireAdmin';
import MainLayout from './layouts/MainLayout';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/auth" element={<Auth />} />
        <Route element={<MainLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/finance" element={<FinanceHub />} />
          <Route path="/car" element={<CarHub />} />
          <Route path="/work" element={<WorkHub />} />
          <Route path="/learning" element={<LearningHub />} />
          <Route path="/pantry" element={<Pantry />} />
          <Route path="/meal-plan" element={<MealPlanner />} />
          <Route path="/subscriptions" element={<Subscriptions />} />
          <Route path="/dates" element={<ImportantDates />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/documents" element={<DocumentViewer />} />
          <Route path="/services" element={<ConnectServices />} />
          <Route path="/ai-assistant" element={<AIAssistant />} />
          <Route path="/settings" element={<ProfileSettings />} />
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/planner" element={<PlannerBoard />} />
            <Route path="/admin/planner/dashboard" element={<WorkosDashboard />} />
            <Route path="/admin/planner/import" element={<ImportNotes />} />
            <Route path="/admin/planner/standup" element={<Standup />} />
            <Route path="/admin/planner/projects" element={<ProjectsList />} />
            <Route path="/admin/planner/projects/:projectId" element={<ProjectDetail />} />
            <Route path="/admin/planner/knowledge" element={<KnowledgeBase />} />
            <Route path="/admin/planner/analytics" element={<Analytics />} />
            <Route path="/admin/planner/tasks/:taskId" element={<TaskDetail />} />
            <Route path="/admin/planner/tasks/:taskId/workspace" element={<AiWorkspace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
