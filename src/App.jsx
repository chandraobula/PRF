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
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
