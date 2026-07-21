import { Button, Layout, Menu } from 'antd';
import {
  DashboardOutlined,
  BarChartOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  LogoutOutlined,
  CommentOutlined,
  RobotOutlined,
  SettingOutlined,
  ShareAltOutlined,
  ToolOutlined,
  WarningOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { useEffect, useState } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { apiGet, clearToken, getToken } from './api';
import { AdminUser } from './types';
import { logout } from './utils/helpers';
import { LoginPage } from './pages/LoginPage';
import { WorkbenchPage } from './pages/WorkbenchPage';
import { EventsPage } from './pages/EventsPage';
import { EventEditPage } from './pages/EventEditPage';
import { AiSourcesPage } from './pages/AiSourcesPage';
import { QualityPage } from './pages/QualityPage';
import { SettingsPage } from './pages/SettingsPage';
import { ContentPage } from './pages/ContentPage';
import { LogsPage } from './pages/LogsPage';
import { AdminProvider } from './context/AdminContext';
import { EventChangesPage } from './pages/EventChangesPage';
import { ChoiceStatsPage } from './pages/ChoiceStatsPage';
import { ShareCenterPage } from './pages/ShareCenterPage';
import { ReleaseNotesPage } from './pages/ReleaseNotesPage';

const { Content, Sider } = Layout;

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<ProtectedShell />} />
      </Routes>
    </BrowserRouter>
  );
}

function ProtectedShell() {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [checking, setChecking] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!getToken()) {
      setChecking(false);
      return;
    }
    apiGet<{ admin: AdminUser }>('/api/admin/auth/me')
      .then((result) => setAdmin(result.admin))
      .catch(() => clearToken())
      .finally(() => setChecking(false));
  }, []);

  if (checking) return null;
  if (!getToken()) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return (
    <AdminProvider admin={admin}>
      <Shell admin={admin} onLogout={() => logout(navigate)} />
    </AdminProvider>
  );
}

function Shell({ admin, onLogout }: { admin: AdminUser | null; onLogout: () => void }) {
  const location = useLocation();
  const selectedKey = location.pathname.startsWith('/events')
    ? '/events'
    : location.pathname.startsWith('/event-changes')
      ? '/event-changes'
      : location.pathname.startsWith('/ai-sources')
        ? '/ai-sources'
        : location.pathname.startsWith('/content')
          ? '/content'
          : location.pathname.startsWith('/settings')
            ? '/settings'
            : location.pathname.startsWith('/quality')
              ? '/quality'
              : location.pathname.startsWith('/share-stats')
                ? '/share'
                : location.pathname.startsWith('/share')
                  ? '/share'
                  : location.pathname.startsWith('/release-notes')
                    ? '/release-notes'
                    : location.pathname.startsWith('/choice-stats')
                      ? '/choice-stats'
                      : location.pathname.startsWith('/logs')
                        ? '/logs'
                        : '/workbench';

  return (
    <Layout className="app-shell">
      <Sider width={220} className="app-sider">
        <div className="app-logo">哪场值得跑后台</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={[
            {
              key: '/workbench',
              icon: <DashboardOutlined />,
              label: <Link to="/workbench">工作台</Link>,
            },
            {
              key: '/events',
              icon: <DatabaseOutlined />,
              label: <Link to="/events">赛事库</Link>,
            },
            {
              key: '/ai-sources',
              icon: <RobotOutlined />,
              label: <Link to="/ai-sources">AI 赛事源</Link>,
            },
            {
              key: '/event-changes',
              icon: <WarningOutlined />,
              label: <Link to="/event-changes">变更复核</Link>,
            },
            {
              key: '/quality',
              icon: <CommentOutlined />,
              label: <Link to="/quality">反馈管理</Link>,
            },
            {
              key: '/share',
              icon: <ShareAltOutlined />,
              label: <Link to="/share">分享中心</Link>,
            },
            {
              key: '/release-notes',
              icon: <RocketOutlined />,
              label: <Link to="/release-notes">版本更新</Link>,
            },
            {
              key: '/choice-stats',
              icon: <BarChartOutlined />,
              label: <Link to="/choice-stats">选择数据</Link>,
            },
            {
              key: '/content',
              icon: <ToolOutlined />,
              label: <Link to="/content">内容配置</Link>,
            },
            {
              key: '/settings',
              icon: <SettingOutlined />,
              label: <Link to="/settings">系统设置</Link>,
            },
            {
              key: '/logs',
              icon: <FileTextOutlined />,
              label: <Link to="/logs">操作日志</Link>,
            },
          ]}
        />
      </Sider>
      <Layout>
        <div className="topbar">
          <span>{admin?.displayName || '后台用户'}</span>
          <Button icon={<LogoutOutlined />} onClick={onLogout}>
            退出登录
          </Button>
        </div>
        <Content>
          <Routes>
            <Route path="/" element={<Navigate to="/workbench" replace />} />
            <Route path="/workbench" element={<WorkbenchPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/edit" element={<EventEditPage />} />
            <Route path="/events/edit/:id" element={<EventEditPage />} />
            <Route path="/ai-sources" element={<AiSourcesPage />} />
            <Route path="/event-changes" element={<EventChangesPage />} />
            <Route path="/quality" element={<QualityPage />} />
            <Route path="/share" element={<ShareCenterPage />} />
            <Route path="/share-stats" element={<Navigate to="/share?tab=stats" replace />} />
            <Route path="/release-notes" element={<ReleaseNotesPage />} />
            <Route path="/choice-stats" element={<ChoiceStatsPage />} />
            <Route path="/content" element={<ContentPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/logs" element={<LogsPage />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
