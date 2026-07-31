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

/** 把字节数格式化为带单位的可读字符串，如 1536 -> "1.5 KB"。 */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  const decimals = exponent === 0 ? 0 : value >= 100 ? 0 : 1;
  return `${value.toFixed(decimals)} ${units[exponent]}`;
}
