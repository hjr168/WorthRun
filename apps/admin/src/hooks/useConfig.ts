import { useEffect, useState } from 'react';
import { message } from 'antd';
import { apiGet, apiSend } from '../api';
import { showError } from '../utils/helpers';

/**
 * 读取单个 system_config 并提供 save 方法。
 * 由于 system_config.configValue 在 DB 中是 Json 类型，configValue 已是解析后的值（数组/对象/字符串），
 * 保存时直接 PUT { configValue: <原生值> }，无需 JSON.stringify。
 */
export function useConfig<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiGet<{ items: Array<{ configKey: string; configValue: unknown }> }>(
      '/api/admin/system-configs',
    )
      .then((result) => {
        const item = result.items.find((c) => c.configKey === key);
        if (!cancelled && item?.configValue != null) setValue(item.configValue as T);
      })
      .catch(showError)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const save = (newValue: T) => {
    setSaving(true);
    apiSend('PUT', `/api/admin/system-configs/${key}`, { configValue: newValue })
      .then(() => {
        setValue(newValue);
        message.success('保存成功');
      })
      .catch(showError)
      .finally(() => setSaving(false));
  };

  return { value, setValue, loading, saving, save };
}
