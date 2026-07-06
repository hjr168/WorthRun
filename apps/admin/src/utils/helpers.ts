import { message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { clearToken } from '../api';

export function logout(navigate: ReturnType<typeof useNavigate>) {
  clearToken();
  navigate('/login', { replace: true });
}

export function showError(error: unknown) {
  message.error(error instanceof Error ? error.message : '操作失败');
}
