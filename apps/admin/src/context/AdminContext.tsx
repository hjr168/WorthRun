import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { AdminUser } from '../types';

interface AdminContextValue {
  admin: AdminUser | null;
  // 按权限矩阵判断
  can: (action: AdminAction) => boolean;
}

export type AdminAction =
  | 'create_event'
  | 'edit_event'
  | 'publish_event' // 发布/隐藏/下架/归档
  | 'handle_feedback'
  | 'manage_settings' // 系统设置写、内容配置写、管理员管理
  | 'edit_release_notes'
  | 'publish_release_notes'
  | 'manage_ai_sources'
  | 'review_ai_candidates'
  | 'review_event_changes'
  | 'apply_event_changes'
  | 'view';

const ROLE_MATRIX: Record<AdminAction, string[]> = {
  // super_admin 在逻辑里特殊处理（全部允许）
  create_event: ['event_operator'],
  edit_event: ['event_operator', 'content_reviewer'],
  publish_event: ['event_operator'],
  handle_feedback: ['event_operator', 'content_reviewer'],
  manage_settings: [],
  edit_release_notes: ['event_operator', 'content_reviewer'],
  publish_release_notes: ['event_operator'],
  manage_ai_sources: ['event_operator'],
  review_ai_candidates: ['event_operator', 'content_reviewer'],
  review_event_changes: ['event_operator', 'content_reviewer'],
  apply_event_changes: ['event_operator'],
  view: ['event_operator', 'content_reviewer', 'readonly'],
};

const AdminContext = createContext<AdminContextValue>({
  admin: null,
  can: () => false,
});

export function AdminProvider({
  admin,
  children,
}: {
  admin: AdminUser | null;
  children: ReactNode;
}) {
  const can = (action: AdminAction) => {
    if (!admin) return false;
    if (admin.role === 'super_admin') return true;
    return ROLE_MATRIX[action].includes(admin.role);
  };
  return <AdminContext.Provider value={{ admin, can }}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  return useContext(AdminContext);
}
