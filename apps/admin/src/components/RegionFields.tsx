import { Form, Select, Space, Typography, type FormInstance } from 'antd';
import { getSupportedProvinces } from '@worth-running/shared';
import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../api';

const provinces = getSupportedProvinces();

interface RegionFieldsProps {
  form: FormInstance;
  compact?: boolean;
}

export function RegionFields({ form, compact = false }: RegionFieldsProps) {
  const provinceCode = Form.useWatch('provinceCode', form);
  const [nationwideEnabled, setNationwideEnabled] = useState(false);
  const province = useMemo(
    () => provinces.find((item) => item.provinceCode === provinceCode),
    [provinceCode],
  );

  useEffect(() => {
    let cancelled = false;
    void apiGet<{ nationwideEnabled: boolean }>('/api/regions')
      .then((result) => {
        if (!cancelled) setNationwideEnabled(result.nationwideEnabled);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className={compact ? 'form-grid compact-form-grid' : 'form-grid'}>
        <Form.Item
          label="省级行政区代码"
          name="provinceCode"
          required={nationwideEnabled}
          rules={[
            { pattern: /^\d{6}$/, message: '省级行政区代码必须是六位数字' },
            ...(nationwideEnabled ? [{ required: true, message: '请补齐省级行政区代码' }] : []),
          ]}
        >
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="选择省级行政区"
            options={provinces.map((item) => ({
              value: item.provinceCode,
              label: `${item.provinceName}（${item.provinceCode}）`,
            }))}
            onChange={() => form.setFieldValue('cityCode', undefined)}
          />
        </Form.Item>
        <Form.Item
          label="市级行政区代码"
          name="cityCode"
          required={nationwideEnabled}
          rules={[
            { pattern: /^\d{6}$/, message: '市级行政区代码必须是六位数字' },
            ...(nationwideEnabled ? [{ required: true, message: '请补齐市级行政区代码' }] : []),
          ]}
        >
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            disabled={!province}
            placeholder={province ? '选择市级行政区' : '先选择省级行政区'}
            options={province?.cities.map((item) => ({
              value: item.cityCode,
              label: `${item.cityName}（${item.cityCode}）`,
            }))}
          />
        </Form.Item>
      </div>
      <Space size={4}>
        <Typography.Text type="secondary">
          {nationwideEnabled
            ? '全国发现已开启：省、市代码必须成对补齐，并与城市名称一致。'
            : '代码使用国家统计局六位行政区划代码；全国模式开启后发布前必须补齐。'}
        </Typography.Text>
      </Space>
    </div>
  );
}
