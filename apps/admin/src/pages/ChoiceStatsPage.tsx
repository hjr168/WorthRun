import { Alert, Button, Card, DatePicker, Input, Select, Space, Statistic, Table, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { publishStatusLabels } from '@worth-running/shared';
import dayjs, { type Dayjs } from 'dayjs';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../api';
import { publishStatusOptions } from '../constants';
import type { EventChoiceStatsQuery, EventChoiceStatsResponse } from '../types';
import { buildEventChoiceStatsQuery } from '../utils/choiceStats';
import { showError } from '../utils/helpers';

const { RangePicker } = DatePicker;
const initialQuery: EventChoiceStatsQuery = {
  page: 1,
  pageSize: 20,
  sort: 'total_desc',
};

const emptySummary: EventChoiceStatsResponse['summary'] = {
  anonymousUsers: 0,
  totalChoices: 0,
  interested: 0,
  considering: 0,
  registered: 0,
  events: 0,
};

export function ChoiceStatsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState<EventChoiceStatsQuery>(initialQuery);
  const [searchText, setSearchText] = useState('');
  const [data, setData] = useState<EventChoiceStatsResponse>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(
        await apiGet<EventChoiceStatsResponse>(
          `/api/admin/event-choice-stats?${buildEventChoiceStatsQuery(query)}`,
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '选择数据加载失败');
      showError(caught);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeDates = (dates: null | [Dayjs | null, Dayjs | null]) => {
    setQuery((current) => ({
      ...current,
      page: 1,
      eventDateFrom: dates?.[0]?.format('YYYY-MM-DD'),
      eventDateTo: dates?.[1]?.format('YYYY-MM-DD'),
    }));
  };

  const reset = () => {
    setSearchText('');
    setQuery(initialQuery);
  };

  const summary = data?.summary ?? emptySummary;
  return (
    <main className="page choice-stats-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">选择数据</h1>
          <div className="page-subtitle">查看用户当前对各场赛事的匿名意向汇总</div>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
          刷新
        </Button>
      </div>

      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="匿名意向统计，不代表官方报名人数；已报名为用户自报。"
        />
        {error && (
          <Alert
            type="error"
            showIcon
            message="选择数据加载失败"
            description={error}
            action={<Button onClick={() => void load()}>重新加载</Button>}
          />
        )}
        <div className="stat-grid choice-stats-summary">
          <Card><Statistic title="匿名用户数" value={summary.anonymousUsers} /></Card>
          <Card><Statistic title="当前选择记录" value={summary.totalChoices} /></Card>
          <Card><Statistic title="想跑" value={summary.interested} valueStyle={{ color: '#2A9D8F' }} /></Card>
          <Card><Statistic title="观望" value={summary.considering} valueStyle={{ color: '#D48806' }} /></Card>
          <Card><Statistic title="已报名（用户自报）" value={summary.registered} valueStyle={{ color: '#1677FF' }} /></Card>
          <Card><Statistic title="涉及赛事" value={summary.events} /></Card>
        </div>

        <Card>
          <div className="choice-stats-filters">
            <Input.Search
              allowClear
              value={searchText}
              placeholder="搜索赛事名称或城市"
              onChange={(event) => setSearchText(event.target.value)}
              onSearch={(search) =>
                setQuery((current) => ({ ...current, search, page: 1 }))
              }
            />
            <Select
              allowClear
              placeholder="全部发布状态"
              value={query.publishStatus}
              options={publishStatusOptions}
              onChange={(publishStatus) =>
                setQuery((current) => ({ ...current, publishStatus, page: 1 }))
              }
            />
            <RangePicker
              value={
                query.eventDateFrom && query.eventDateTo
                  ? [dayjs(query.eventDateFrom), dayjs(query.eventDateTo)]
                  : null
              }
              onChange={changeDates}
              placeholder={['比赛日期起', '比赛日期止']}
            />
            <Select
              value={query.sort}
              onChange={(sort) => setQuery((current) => ({ ...current, sort, page: 1 }))}
              options={[
                { value: 'total_desc', label: '选择总数从高到低' },
                { value: 'recent_choice_desc', label: '最近选择优先' },
                { value: 'event_date_asc', label: '比赛日期从近到远' },
                { value: 'event_date_desc', label: '比赛日期从远到近' },
              ]}
            />
            <Button onClick={reset}>重置</Button>
          </div>

          <Table
            rowKey={(record) => record.event.id}
            loading={loading}
            dataSource={data?.items ?? []}
            scroll={{ x: 1160 }}
            pagination={{
              current: query.page,
              pageSize: query.pageSize,
              total: data?.total ?? 0,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 场赛事`,
              onChange: (page, pageSize) =>
                setQuery((current) => ({ ...current, page, pageSize })),
            }}
            locale={{ emptyText: error ? '加载失败，请重新加载' : '暂无选择数据' }}
            columns={[
              {
                title: '赛事名称',
                dataIndex: ['event', 'eventName'],
                fixed: 'left',
                width: 220,
                render: (value, record) => (
                  <a onClick={() => navigate(`/events/edit/${record.event.id}`)}>{value}</a>
                ),
              },
              { title: '城市', dataIndex: ['event', 'city'], width: 100 },
              {
                title: '比赛日期',
                dataIndex: ['event', 'eventDate'],
                width: 125,
                render: (value) => dayjs(value).format('YYYY-MM-DD'),
              },
              {
                title: '发布状态',
                dataIndex: ['event', 'publishStatus'],
                width: 110,
                render: (value) => <Tag>{publishStatusLabels[value as keyof typeof publishStatusLabels]}</Tag>,
              },
              { title: '想跑', dataIndex: ['counts', 'interested'], width: 90 },
              { title: '观望', dataIndex: ['counts', 'considering'], width: 90 },
              { title: '已报名', dataIndex: ['counts', 'registered'], width: 90 },
              {
                title: '合计',
                dataIndex: ['counts', 'total'],
                width: 90,
                render: (value) => <strong>{value}</strong>,
              },
              {
                title: '最近选择时间',
                dataIndex: 'lastChoiceAt',
                width: 170,
                render: (value) => value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-',
              },
            ]}
          />
        </Card>
      </Space>
    </main>
  );
}
