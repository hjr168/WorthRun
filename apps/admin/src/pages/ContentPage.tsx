import { Button, Input, Modal, Select, Space, Spin, Tabs, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../api';
import { showError } from '../utils/helpers';

/* ----------------------------- 内置默认值 ----------------------------- */

export const DEFAULT_CITIES = [
  '广州',
  '深圳',
  '佛山',
  '东莞',
  '珠海',
  '中山',
  '惠州',
  '香港',
  '澳门',
];

export const DEFAULT_DISTANCES = ['5K', '10K', '半马', '全马', '欢乐跑'];

export const DEFAULT_TAGS = [
  '新手友好',
  '适合 PB',
  '风景路线',
  '交通方便',
  '周末可去',
  '补给成熟',
  '氛围较好',
  '信息较完整',
];

export interface ChecklistTemplateItem {
  groupName: string;
  itemName: string;
  itemStatus: string;
  sortOrder: number;
}

export type ChecklistTemplates = Record<string, ChecklistTemplateItem[]>;

export const CHECKLIST_DISTANCE_TABS: Array<{ key: string; label: string }> = [
  { key: 'general', label: '通用' },
  { key: '5K', label: '5K' },
  { key: '10K', label: '10K' },
  { key: 'half', label: '半马' },
  { key: 'full', label: '全马' },
];

function checklist(
  rows: Array<[string, string]>,
): ChecklistTemplateItem[] {
  return rows.map(([groupName, itemName], index) => ({
    groupName,
    itemName,
    itemStatus: 'pending_verify',
    sortOrder: index + 1,
  }));
}

export const DEFAULT_CHECKLIST_TEMPLATES: ChecklistTemplates = {
  general: checklist([
    ['报名信息', '报名截止与是否抽签'],
    ['领物安排', '领物时间、地点、证件要求'],
    ['交通安排', '起终点交通、存包和接驳'],
    ['装备', '号码布、芯片、跑鞋、补给'],
    ['风险提示', '天气变化和赛事变更公告'],
  ]),
  '5K': checklist([
    ['完赛目标', '确认起跑时间和关门时间'],
    ['装备', '轻便跑鞋和基础补水'],
    ['新手提醒', '赛前不临时更换新装备'],
    ['交通安排', '提前确认短距离项目检录口'],
  ]),
  '10K': checklist([
    ['配速计划', '确认目标配速和补给点位置'],
    ['装备', '跑鞋、能量胶或随身补给'],
    ['赛事规则', '确认分区、检录和关门时间'],
    ['恢复安排', '赛后换衣、拉伸和返程路线'],
  ]),
  half: checklist([
    ['训练状态', '确认最近长距离训练和身体状态'],
    ['补给策略', '确认能量胶、水站和盐丸安排'],
    ['赛事规则', '确认半马关门时间和医疗点'],
    ['装备', '比赛鞋、袜子、防磨和号码布固定'],
  ]),
  full: checklist([
    ['身体状态', '确认无伤病、睡眠和赛前减量'],
    ['补给策略', '确认全程补给节奏和备用方案'],
    ['赛事规则', '确认分段关门时间、医疗点和退赛车'],
    ['赛后安排', '确认完赛后保暖、换衣和返程'],
  ]),
};

const LIST_CONFIG_KEYS = ['available_cities', 'distance_options', 'decision_tag_options'] as const;

/* ----------------------------- 顶层读取全量 configs ----------------------------- */

interface SystemConfigLite {
  configKey: string;
  configValue: unknown;
}

function parseList(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) ? (value as string[]).map((item) => String(item)) : fallback;
}

function parseChecklist(value: unknown): ChecklistTemplates {
  const safe: ChecklistTemplates = {};
  for (const tab of CHECKLIST_DISTANCE_TABS) {
    const raw = (value as Record<string, unknown>)?.[tab.key];
    safe[tab.key] = Array.isArray(raw)
      ? (raw as ChecklistTemplateItem[]).map((item) => ({
        groupName: String((item as ChecklistTemplateItem).groupName ?? ''),
        itemName: String((item as ChecklistTemplateItem).itemName ?? ''),
        itemStatus: 'pending_verify',
        sortOrder: Number((item as ChecklistTemplateItem).sortOrder ?? 0),
      }))
      : [];
  }
  return safe;
}

export function ContentPage() {
  const [loading, setLoading] = useState(true);
  const [cities, setCities] = useState<string[]>(DEFAULT_CITIES);
  const [distances, setDistances] = useState<string[]>(DEFAULT_DISTANCES);
  const [tags, setTags] = useState<string[]>(DEFAULT_TAGS);
  const [checklistTemplates, setChecklistTemplates] = useState<ChecklistTemplates>(
    DEFAULT_CHECKLIST_TEMPLATES,
  );

  useEffect(() => {
    let cancelled = false;
    apiGet<{ items: SystemConfigLite[] }>('/api/admin/system-configs')
      .then((result) => {
        if (cancelled) return;
        for (const item of result.items) {
          if (item.configKey === 'available_cities') {
            setCities(parseList(item.configValue, DEFAULT_CITIES));
          } else if (item.configKey === 'distance_options') {
            setDistances(parseList(item.configValue, DEFAULT_DISTANCES));
          } else if (item.configKey === 'decision_tag_options') {
            setTags(parseList(item.configValue, DEFAULT_TAGS));
          } else if (item.configKey === 'checklist_templates') {
            setChecklistTemplates(parseChecklist(item.configValue));
          }
        }
      })
      .catch(showError)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveListConfig = (key: (typeof LIST_CONFIG_KEYS)[number], value: string[]) => {
    return apiSend('PUT', `/api/admin/system-configs/${key}`, { configValue: value })
      .then(() => message.success('保存成功'))
      .catch(showError);
  };

  const saveChecklist = (value: ChecklistTemplates) => {
    return apiSend('PUT', '/api/admin/system-configs/checklist_templates', { configValue: value })
      .then(() => message.success('保存成功'))
      .catch(showError);
  };

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">工具与内容配置</h1>
          <div className="page-subtitle">城市、距离、标签与赛前清单模板</div>
        </div>
      </div>
      <Tabs
        items={[
          {
            key: 'cities',
            label: '城市配置',
            children: (
              <ListConfigTab
                loading={loading}
                title="可选城市列表（available_cities）"
                description="用于赛事编辑页城市下拉，可输入回车新增。"
                value={cities}
                onChange={setCities}
                defaultValue={DEFAULT_CITIES}
                onSave={() => saveListConfig('available_cities', cities)}
              />
            ),
          },
          {
            key: 'distances',
            label: '距离项目',
            children: (
              <ListConfigTab
                loading={loading}
                title="距离项目列表（distance_options）"
                description="用于赛事编辑页距离项目下拉，可输入回车新增。"
                value={distances}
                onChange={setDistances}
                defaultValue={DEFAULT_DISTANCES}
                onSave={() => saveListConfig('distance_options', distances)}
              />
            ),
          },
          {
            key: 'tags',
            label: '决策标签',
            children: (
              <ListConfigTab
                loading={loading}
                title="决策标签列表（decision_tag_options）"
                description="跑前判断维度的可选标签，可输入回车新增。"
                value={tags}
                onChange={setTags}
                defaultValue={DEFAULT_TAGS}
                onSave={() => saveListConfig('decision_tag_options', tags)}
              />
            ),
          },
          {
            key: 'checklist',
            label: '赛前清单模板',
            children: (
              <ChecklistTab
                loading={loading}
                value={checklistTemplates}
                onChange={setChecklistTemplates}
                onSave={() => saveChecklist(checklistTemplates)}
              />
            ),
          },
        ]}
      />
    </main>
  );
}

/* ----------------------------- 通用卡片：列表类配置 ----------------------------- */

function useSavingState() {
  const [saving, setSaving] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setSaving(true);
    try {
      await fn();
    } finally {
      setSaving(false);
    }
  };
  return { saving, run };
}

function ListConfigTab({
  loading,
  title,
  description,
  value,
  onChange,
  defaultValue,
  onSave,
}: {
  loading: boolean;
  title: string;
  description: string;
  value: string[];
  onChange: (next: string[]) => void;
  defaultValue: string[];
  onSave: () => Promise<unknown>;
}) {
  const { saving, run } = useSavingState();
  const confirmReset = () => {
    Modal.confirm({
      title: '重置为默认值？',
      content: '将恢复为内置默认值，但不会自动保存，需再点击保存。',
      okText: '重置',
      cancelText: '取消',
      onOk: () => {
        onChange([...defaultValue]);
        message.info('已恢复为默认值，需点击保存生效');
      },
    });
  };

  return (
    <div style={{ maxWidth: 640 }}>
      {loading ? (
        <Spin />
      ) : (
        <>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>{title}</div>
          <div style={{ marginBottom: 12, color: '#999' }}>{description}</div>
          <Select
            mode="tags"
            style={{ width: '100%' }}
            value={value}
            onChange={onChange}
            tokenSeparators={[',']}
            placeholder="可输入回车添加，或从已有选项选择"
            options={value.map((item) => ({ value: item, label: item }))}
          />
          <Space style={{ marginTop: 16 }}>
            <Button type="primary" loading={saving} onClick={() => run(onSave)}>
              保存
            </Button>
            <Button onClick={confirmReset}>重置为默认</Button>
          </Space>
        </>
      )}
    </div>
  );
}

/* ----------------------------- 清单模板 Tab ----------------------------- */

function ChecklistTemplateEditor({
  items,
  onChange,
}: {
  items: ChecklistTemplateItem[];
  onChange: (next: ChecklistTemplateItem[]) => void;
}) {
  const update = (index: number, patch: Partial<ChecklistTemplateItem>) => {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {items.map((item, index) => (
        <div className="checklist-row" key={index}>
          <span style={{ fontWeight: 500, marginRight: 8 }}>#{index + 1}</span>
          <Input
            placeholder="分组"
            value={item.groupName}
            onChange={(event) => update(index, { groupName: event.target.value })}
            style={{ width: 140 }}
          />
          <Input
            placeholder="确认项"
            value={item.itemName}
            onChange={(event) => update(index, { itemName: event.target.value })}
            style={{ width: 300 }}
          />
          <Button danger onClick={() => onChange(items.filter((_, i) => i !== index))}>
            删除
          </Button>
        </div>
      ))}
      <Button
        icon={<PlusOutlined />}
        onClick={() =>
          onChange([
            ...items,
            {
              groupName: '',
              itemName: '',
              itemStatus: 'pending_verify',
              sortOrder: items.length + 1,
            },
          ])
        }
      >
        添加项目
      </Button>
    </Space>
  );
}

function ChecklistTab({
  loading,
  value,
  onChange,
  onSave,
}: {
  loading: boolean;
  value: ChecklistTemplates;
  onChange: (next: ChecklistTemplates) => void;
  onSave: () => Promise<unknown>;
}) {
  const { saving, run } = useSavingState();
  const safeValue: ChecklistTemplates = CHECKLIST_DISTANCE_TABS.reduce(
    (acc, tab) => {
      acc[tab.key] = Array.isArray(value[tab.key]) ? value[tab.key] : [];
      return acc;
    },
    {} as ChecklistTemplates,
  );

  const confirmReset = () => {
    Modal.confirm({
      title: '重置为默认值？',
      content: '将恢复为内置默认清单模板，但不会自动保存，需再点击保存。',
      okText: '重置',
      cancelText: '取消',
      onOk: () => {
        onChange(structuredClone(DEFAULT_CHECKLIST_TEMPLATES));
        message.info('已恢复为默认值，需点击保存生效');
      },
    });
  };

  return (
    <div style={{ maxWidth: 720 }}>
      {loading ? (
        <Spin />
      ) : (
        <>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>
            赛前清单模板（checklist_templates）
          </div>
          <div style={{ marginBottom: 12, color: '#999' }}>
            按距离类型配置赛前确认清单模板，状态统一为「待核实」（pending_verify）。
          </div>
          <Tabs
            items={CHECKLIST_DISTANCE_TABS.map((tab) => ({
              key: tab.key,
              label: tab.label,
              children: (
                <ChecklistTemplateEditor
                  items={safeValue[tab.key]}
                  onChange={(next) => onChange({ ...safeValue, [tab.key]: next })}
                />
              ),
            }))}
          />
          <Space style={{ marginTop: 16 }}>
            <Button type="primary" loading={saving} onClick={() => run(onSave)}>
              保存
            </Button>
            <Button onClick={confirmReset}>重置为默认</Button>
          </Space>
        </>
      )}
    </div>
  );
}
