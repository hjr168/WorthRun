import { Button, Card, Form, Input, message } from 'antd';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiSend, setToken } from '../api';
import { showError } from '../utils/helpers';

export function LoginPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const submit = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const result = await apiSend<{ token: string }>('POST', '/api/admin/auth/login', values);
      setToken(result.token);
      message.success('登录成功');
      navigate((location.state as { from?: string } | null)?.from || '/workbench', {
        replace: true,
      });
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <Card className="login-card" title="哪场值得跑后台登录">
        <Form layout="vertical" initialValues={{ username: 'admin' }} onFinish={submit}>
          <Form.Item label="用户名" name="username" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            登录
          </Button>
        </Form>
      </Card>
    </main>
  );
}
