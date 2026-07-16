import { Button, Layout, Menu } from 'antd';
import {
  DashboardOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  LogoutOutlined,
  ProfileOutlined,
  RobotOutlined,
  SettingOutlined,
  ShareAltOutlined,
  ToolOutlined,
  WarningOutlined,
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
import { ShareStatsPage } from './pages/ShareStatsPage';
import { LogsPage } from './pages/LogsPage';
import { AdminProvider } from './context/AdminContext';
import { EventChangesPage } from './pages/EventChangesPage';

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
              ? '/share-stats'
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
              icon: <ProfileOutlined />,
              label: <Link to="/quality">质量反馈</Link>,
            },
            {
              key: '/share-stats',
              icon: <ShareAltOutlined />,
              label: <Link to="/share-stats">分享数据</Link>,
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
            <Route path="/share-stats" element={<ShareStatsPage />} />
            <Route path="/content" element={<ContentPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/logs" element={<LogsPage />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
