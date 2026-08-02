import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { PageContainer } from "@ant-design/pro-components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Form, Input, Modal, Select, Space, Table, Tabs, Tag, Typography } from "antd";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import type {
  OrganizationUnitView,
  PositionView,
  WorkforceAccountQuery,
  WorkforceAccountView,
  WorkforceAdministrationCommand,
  WorkforceAdministrationPort,
} from "./workbench-port";

const statusCopy = {
  active: { color: "success", text: "启用" },
  credential_pending: { color: "processing", text: "待设置密码" },
  disabled: { color: "default", text: "已停用" },
  failed: { color: "error", text: "处理失败" },
  provisioning: { color: "processing", text: "创建中" },
} as const;

function StatusTag({ status }: { status: keyof typeof statusCopy }): React.JSX.Element {
  const copy = statusCopy[status];
  return <Tag color={copy.color}>{copy.text}</Tag>;
}

const identitySyncCopy = {
  failed: { color: "error", text: "同步失败" },
  pending: { color: "processing", text: "同步中" },
  succeeded: { color: "success", text: "已同步" },
  superseded: { color: "default", text: "已过期" },
} as const;

const identitySyncErrorCopy = {
  eventing_handler_timeout: "处理超时",
  identity_sync_failed: "同步失败",
  keycloak_administration_unavailable: "身份服务暂时不可用",
  keycloak_entity_conflict: "身份记录冲突",
} as const;

function operationId(): string {
  return crypto.randomUUID();
}

export function WorkforceAdministrationPage({ port }: { port: WorkforceAdministrationPort }): React.JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const snapshot = useQuery({ queryKey: ["workforce-administration"], queryFn: () => port.load(), retry: false });
  const [accountPageNumber, setAccountPageNumber] = useState(1);
  const [accountPageSize, setAccountPageSize] = useState(20);
  const [accountFilters, setAccountFilters] = useState<Readonly<Omit<WorkforceAccountQuery, "page" | "pageSize">>>({});
  const accounts = useQuery({
    queryKey: ["workforce-administration", "accounts", accountPageNumber, accountPageSize, accountFilters],
    queryFn: () => port.listAccounts({ ...accountFilters, page: accountPageNumber, pageSize: accountPageSize }),
    retry: false,
  });
  const [accountOpen, setAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<WorkforceAccountView>();
  const [editingSystemAccount, setEditingSystemAccount] = useState<WorkforceAccountView>();
  const [reauthenticatingSystemAccount, setReauthenticatingSystemAccount] = useState(false);
  const [systemAccountReauthenticationFailed, setSystemAccountReauthenticationFailed] = useState(false);
  const [reactivatingAccount, setReactivatingAccount] = useState<WorkforceAccountView>();
  const [releasePhoneAccount, setReleasePhoneAccount] = useState<WorkforceAccountView>();
  const [releasePhoneValue, setReleasePhoneValue] = useState<string>();
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<OrganizationUnitView>();
  const [positionOpen, setPositionOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<PositionView>();
  const [credentialUrl, setCredentialUrl] = useState<string>();
  const [accountForm] = Form.useForm();
  const [accountSearchForm] = Form.useForm();
  const [editAccountForm] = Form.useForm();
  const [systemAccountForm] = Form.useForm();
  const [reactivateForm] = Form.useForm();
  const [departmentForm] = Form.useForm();
  const [positionForm] = Form.useForm();
  const credentialCompletionStarted = useRef(false);
  const requestedTab = searchParams.get("tab");
  const activeTab = requestedTab === "departments" || requestedTab === "positions" ? requestedTab : "accounts";

  const execute = useMutation({
    mutationFn: async (command: WorkforceAdministrationCommand) => port.execute(command),
    onSuccess: async (result) => {
      if (result.credentialRedirectUrl !== undefined) setCredentialUrl(result.credentialRedirectUrl);
      await queryClient.invalidateQueries({ queryKey: ["workforce-administration"] });
    },
  });

  useEffect(() => {
    if (credentialCompletionStarted.current || snapshot.data === undefined) return;
    const accountId = searchParams.get("accountId");
    const ceremonyOperationId = searchParams.get("operationId");
    const stableId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
    if (accountId === null || ceremonyOperationId === null || !stableId.test(accountId) || !stableId.test(ceremonyOperationId)) return;
    const account = [...snapshot.data.accounts, ...(snapshot.data.systemAccount === undefined ? [] : [snapshot.data.systemAccount])]
      .find((candidate) => candidate.accountId === accountId);
    if (account === undefined) return;
    credentialCompletionStarted.current = true;
    void execute.mutateAsync({ accountId, ceremonyOperationId, expectedRevision: account.revision, kind: "complete_credential_ceremony" })
      .then(() => {
        const next = new URLSearchParams(searchParams);
        next.delete("accountId");
        next.delete("operationId");
        setSearchParams(next, { replace: true });
      }, () => { credentialCompletionStarted.current = false; });
  }, [execute, searchParams, setSearchParams, snapshot.data]);

  const departments = snapshot.data?.departments ?? [];
  const positions = snapshot.data?.positions ?? [];
  const activeDepartments = departments.filter((item) => item.status === "active");
  const selectedDepartment = Form.useWatch("departmentId", accountForm) as string | undefined;
  const accountPositions = positions.filter((item) => item.status === "active" && item.departmentId === selectedDepartment);

  const run = (command: WorkforceAdministrationCommand): void => { execute.mutate(command); };
  const confirm = (title: string, content: string, command: WorkforceAdministrationCommand): void => {
    Modal.confirm({ title, content, okText: "确认", cancelText: "取消", onOk: async () => { await execute.mutateAsync(command); } });
  };

  const accountColumns: ColumnsType<WorkforceAccountView> = [
    { title: "用户名", dataIndex: "username", width: 160 },
    { title: "姓名", dataIndex: "legalName", width: 140 },
    { title: "手机号", dataIndex: "phone", width: 160, render: (value?: string) => value ?? "-" },
    { title: "部门", dataIndex: "departmentName", width: 160, render: (value?: string) => value ?? "-" },
    { title: "岗位", dataIndex: "positionName", width: 160, render: (value?: string) => value ?? "-" },
    { title: "授权", width: 150, render: (_, row) => row.crmAdministrator ? <Tag color="blue">CRM系统管理员</Tag> : "-" },
    { title: "状态", width: 110, render: (_, row) => <StatusTag status={row.status} /> },
    { title: "身份同步", width: 150, render: (_, row) => row.latestIdentitySync === undefined ? "-" : <Space orientation="vertical" size={0}><Tag color={identitySyncCopy[row.latestIdentitySync.status].color}>{identitySyncCopy[row.latestIdentitySync.status].text}</Tag>{row.latestIdentitySync.errorCode === undefined ? null : <Typography.Text type="secondary">{identitySyncErrorCopy[row.latestIdentitySync.errorCode]}</Typography.Text>}</Space> },
    {
      title: "操作", key: "actions", fixed: "right", width: 340,
      render: (_, row) => (
        <Space size={4} wrap>
          {row.allowedActions.includes("reset_password") && <Button type="link" onClick={() => { run({ accountId: row.accountId, expectedRevision: row.revision, kind: "reset_password" }); }}>重置密码</Button>}
          {row.allowedActions.includes("release_phone") && row.releasablePhones.length > 0 && <Button type="link" onClick={() => { setReleasePhoneAccount(row); setReleasePhoneValue(row.releasablePhones[0]); }}>释放旧手机号</Button>}
          {row.allowedActions.includes("retry_identity_sync") && row.latestIdentitySync?.status === "failed" && <Button type="link" onClick={() => { run({ accountId: row.accountId, expectedRevision: row.revision, failedOperationId: row.latestIdentitySync?.operationId ?? "", kind: "retry_identity_sync" }); }}>重试同步</Button>}
          {(row.allowedActions.includes("edit") || row.allowedActions.includes("transfer")) && <Button type="link" onClick={() => { setEditingAccount(row); editAccountForm.setFieldsValue({ username: row.username, legalName: row.legalName, phone: row.phone, departmentId: row.departmentId, positionId: row.positionId }); }}>编辑</Button>}
          {row.allowedActions.includes("deactivate") && <Button danger type="link" onClick={() => { confirm("停用员工账号", "停用后将撤销其会话、任职和权限。", { accountId: row.accountId, expectedRevision: row.revision, kind: "deactivate_account" }); }}>停用</Button>}
          {row.allowedActions.includes("reactivate") && <Button type="link" onClick={() => { setReactivatingAccount(row); reactivateForm.setFieldsValue({ departmentId: row.departmentId, positionId: row.positionId }); }}>重新启用</Button>}
          {row.allowedActions.includes("grant_crm_administrator") && <Button type="link" onClick={() => { confirm("授予 CRM 系统管理员", "该账号将获得全部已注册 CRM 权限。", { accountId: row.accountId, enabled: true, expectedRevision: row.revision, kind: "set_crm_administrator" }); }}>授予管理员</Button>}
          {row.allowedActions.includes("revoke_crm_administrator") && <Button danger type="link" onClick={() => { confirm("撤销 CRM 系统管理员", "撤销后该账号立即失去管理员权限。", { accountId: row.accountId, enabled: false, expectedRevision: row.revision, kind: "set_crm_administrator" }); }}>撤销管理员</Button>}
        </Space>
      ),
    },
  ];

  const departmentColumns: ColumnsType<OrganizationUnitView> = [
    { title: "部门", dataIndex: "name" },
    { title: "上级部门", render: (_, row) => departments.find((candidate) => candidate.departmentId === row.parentDepartmentId)?.name ?? "-" },
    { title: "状态", width: 110, render: (_, row) => <StatusTag status={row.status} /> },
    {
      title: "操作", width: 180, render: (_, row) => <Space>
        {row.allowedActions.includes("edit") && <Button type="link" onClick={() => { setEditingDepartment(row); departmentForm.setFieldsValue({ name: row.name, parentDepartmentId: row.parentDepartmentId }); setDepartmentOpen(true); }}>编辑</Button>}
        {row.allowedActions.includes("deactivate") && <Button danger type="link" onClick={() => { confirm("停用部门", "存在有效下级、岗位或员工时操作将被拒绝。", { departmentId: row.departmentId, expectedRevision: row.revision, kind: "deactivate_department" }); }}>停用</Button>}
        {row.allowedActions.includes("reactivate") && <Button type="link" onClick={() => { run({ departmentId: row.departmentId, expectedRevision: row.revision, kind: "reactivate_department" }); }}>恢复</Button>}
      </Space>,
    },
  ];

  const positionColumns: ColumnsType<PositionView> = [
    { title: "岗位", dataIndex: "name" },
    { title: "所属部门", render: (_, row) => departments.find((item) => item.departmentId === row.departmentId)?.name ?? "-" },
    { title: "状态", width: 110, render: (_, row) => <StatusTag status={row.status} /> },
    {
      title: "操作", width: 180, render: (_, row) => <Space>
        {row.allowedActions.includes("edit") && <Button type="link" onClick={() => { setEditingPosition(row); positionForm.setFieldsValue({ name: row.name, departmentId: row.departmentId }); setPositionOpen(true); }}>编辑</Button>}
        {row.allowedActions.includes("deactivate") && <Button danger type="link" onClick={() => { confirm("停用岗位", "存在有效员工时操作将被拒绝。", { expectedRevision: row.revision, kind: "deactivate_position", positionId: row.positionId }); }}>停用</Button>}
        {row.allowedActions.includes("reactivate") && <Button type="link" onClick={() => { run({ expectedRevision: row.revision, kind: "reactivate_position", positionId: row.positionId }); }}>恢复</Button>}
      </Space>,
    },
  ];

  if (snapshot.isPending) return <PageContainer title="员工账号管理"><Typography.Text>正在加载</Typography.Text></PageContainer>;
  if (snapshot.isError) return <PageContainer title="员工账号管理"><Alert type="error" showIcon title="员工账号管理暂时不可用" action={<Button icon={<ReloadOutlined />} onClick={() => { void snapshot.refetch(); }}>重试</Button>} /></PageContainer>;

  const accountTab = <>
    {snapshot.data.systemAccount !== undefined && <section className="system-account-band">
      <Typography.Title level={5}>系统账号</Typography.Title>
      <Space wrap>
        <strong>{snapshot.data.systemAccount.legalName}</strong>
        <span>{snapshot.data.systemAccount.username}</span>
        <StatusTag status={snapshot.data.systemAccount.status} />
        {snapshot.data.systemAccount.allowedActions.includes("edit")
          ? <Button type="link" onClick={() => { setEditingSystemAccount(snapshot.data.systemAccount); systemAccountForm.setFieldsValue({ username: snapshot.data.systemAccount?.username, phone: snapshot.data.systemAccount?.phone }); }}>编辑登录标识</Button>
          : port.beginSystemAccountReauthentication === undefined ? null : <Button type="link" loading={reauthenticatingSystemAccount} onClick={() => {
            setSystemAccountReauthenticationFailed(false);
            setReauthenticatingSystemAccount(true);
            void port.beginSystemAccountReauthentication?.().catch(() => { setReauthenticatingSystemAccount(false); setSystemAccountReauthenticationFailed(true); });
          }}>重新认证后编辑</Button>}
      </Space>
    </section>}
    <Form name="account-search" form={accountSearchForm} layout="inline" className="account-search-form" onFinish={(raw: Record<string, unknown>) => {
      const next = Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "string" && value.length > 0)) as Omit<WorkforceAccountQuery, "page" | "pageSize">;
      setAccountFilters(Object.freeze(next));
      setAccountPageNumber(1);
    }}>
      <Form.Item name="username"><Input allowClear placeholder="用户名" /></Form.Item>
      <Form.Item name="legalName"><Input allowClear placeholder="姓名" /></Form.Item>
      <Form.Item name="phone"><Input allowClear placeholder="手机号" /></Form.Item>
      <Form.Item name="departmentId"><Select allowClear placeholder="部门" style={{ width: 150 }} options={departments.map((item) => ({ label: item.name, value: item.departmentId }))} /></Form.Item>
      <Form.Item name="positionId"><Select allowClear placeholder="岗位" style={{ width: 180 }} options={positions.map((item) => ({ label: `${item.name} / ${departments.find((department) => department.departmentId === item.departmentId)?.name ?? "-"}`, value: item.positionId }))} /></Form.Item>
      <Form.Item name="status"><Select allowClear placeholder="状态" style={{ width: 120 }} options={Object.entries(statusCopy).map(([value, copy]) => ({ label: copy.text, value }))} /></Form.Item>
      <Form.Item><Space><Button type="primary" htmlType="submit">查询</Button><Button onClick={() => { accountSearchForm.resetFields(); setAccountFilters({}); setAccountPageNumber(1); }}>重置</Button></Space></Form.Item>
    </Form>
    <div className="table-toolbar"><Button type="primary" icon={<PlusOutlined />} onClick={() => { setAccountOpen(true); }}>创建员工账号</Button></div>
    {accounts.isError && <Alert className="management-alert" type="error" showIcon title="员工账号列表暂时不可用" action={<Button icon={<ReloadOutlined />} onClick={() => { void accounts.refetch(); }}>重试</Button>} />}
    <Table rowKey="accountId" columns={accountColumns} dataSource={[...(accounts.data?.items ?? [])]} loading={accounts.isPending} scroll={{ x: 1250 }} pagination={{ current: accounts.data?.page ?? accountPageNumber, pageSize: accounts.data?.pageSize ?? accountPageSize, showSizeChanger: true, total: accounts.data?.total ?? 0, onChange: (page, pageSize) => { setAccountPageNumber(pageSize === accountPageSize ? page : 1); setAccountPageSize(pageSize); } }} />
  </>;

  return <PageContainer title="员工账号管理">
    {execute.isError && <Alert className="management-alert" type="error" showIcon title="操作未完成" description="服务器未确认成功，请刷新状态后重试。" />}
    {systemAccountReauthenticationFailed && <Alert className="management-alert" type="error" showIcon title="重新认证未启动" description="当前会话未发生变化，请重试。" />}
    {credentialUrl !== undefined && <Alert className="management-alert" type="info" showIcon title="继续设置临时密码" action={<Button type="primary" href={credentialUrl}>前往 Keycloak</Button>} closable={{ onClose: () => { setCredentialUrl(undefined); } }} />}
    <Tabs activeKey={activeTab} onChange={(tab) => {
      const next = new URLSearchParams(searchParams);
      if (tab === "accounts") next.delete("tab"); else next.set("tab", tab);
      setSearchParams(next);
    }} items={[
      { key: "accounts", label: "员工账号", children: accountTab },
      { key: "departments", label: "部门", children: <><div className="table-toolbar"><Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingDepartment(undefined); departmentForm.resetFields(); setDepartmentOpen(true); }}>新建部门</Button></div><Table rowKey="departmentId" columns={departmentColumns} dataSource={[...departments]} pagination={false} /></> },
      { key: "positions", label: "岗位", children: <><div className="table-toolbar"><Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingPosition(undefined); positionForm.resetFields(); setPositionOpen(true); }}>新建岗位</Button></div><Table rowKey="positionId" columns={positionColumns} dataSource={[...positions]} pagination={false} /></> },
    ]} />

    <Modal title="创建员工账号" open={accountOpen} okText="创建并设置密码" cancelText="取消" confirmLoading={execute.isPending} onCancel={() => { setAccountOpen(false); }} onOk={() => { void accountForm.validateFields().then(async (value: Record<string, string>) => {
      await execute.mutateAsync({ kind: "create_account", username: value["username"] ?? "", legalName: value["legalName"] ?? "", ...(value["phone"] ? { phone: value["phone"] } : {}), departmentId: value["departmentId"] ?? "", positionId: value["positionId"] ?? "" });
      setAccountOpen(false); accountForm.resetFields();
    }); }}>
      <Form form={accountForm} layout="vertical" preserve={false}>
        <Form.Item name="username" label="用户名（昵称）" rules={[{ required: true }, { pattern: /^[A-Za-z0-9._-]{4,32}$/u, message: "请输入 4-32 位字母、数字、点、下划线或短横线" }]}><Input autoComplete="off" /></Form.Item>
        <Form.Item name="legalName" label="姓名（实名）" rules={[{ required: true, whitespace: true, max: 64 }]}><Input autoComplete="off" /></Form.Item>
        <Form.Item name="phone" label="手机号（可用于登录）" rules={[{ pattern: /^\+?[0-9 -]{6,24}$/u, message: "请输入有效手机号" }]}><Input autoComplete="off" /></Form.Item>
        <Form.Item name="departmentId" label="部门" rules={[{ required: true }]}><Select options={activeDepartments.map((item) => ({ label: item.name, value: item.departmentId }))} onChange={() => { accountForm.setFieldValue("positionId", undefined); }} /></Form.Item>
        <Form.Item name="positionId" label="岗位" rules={[{ required: true }]}><Select disabled={selectedDepartment === undefined} options={accountPositions.map((item) => ({ label: item.name, value: item.positionId }))} /></Form.Item>
      </Form>
    </Modal>

    <Modal title="重新启用员工账号" open={reactivatingAccount !== undefined} okText="继续设置临时密码" cancelText="取消" confirmLoading={execute.isPending} onCancel={() => { setReactivatingAccount(undefined); }} onOk={() => { void reactivateForm.validateFields().then(async (value: Record<string, string>) => {
      if (reactivatingAccount === undefined) return;
      await execute.mutateAsync({ accountId: reactivatingAccount.accountId, departmentId: value["departmentId"] ?? "", expectedRevision: reactivatingAccount.revision, kind: "reactivate_account", positionId: value["positionId"] ?? "" });
      setReactivatingAccount(undefined); reactivateForm.resetFields();
    }); }}>
      <Form form={reactivateForm} layout="vertical" preserve={false}>
        <Form.Item name="departmentId" label="部门" rules={[{ required: true }]}><Select options={activeDepartments.map((item) => ({ label: item.name, value: item.departmentId }))} onChange={() => { reactivateForm.setFieldValue("positionId", undefined); }} /></Form.Item>
        <Form.Item noStyle shouldUpdate>{() => <Form.Item name="positionId" label="岗位" rules={[{ required: true }]}><Select options={positions.filter((item) => item.status === "active" && item.departmentId === reactivateForm.getFieldValue("departmentId") as string).map((item) => ({ label: item.name, value: item.positionId }))} /></Form.Item>}</Form.Item>
      </Form>
    </Modal>

    <Modal title="释放旧手机号" open={releasePhoneAccount !== undefined} okText="确认释放" okButtonProps={{ danger: true, disabled: releasePhoneValue === undefined }} cancelText="取消" confirmLoading={execute.isPending} onCancel={() => { setReleasePhoneAccount(undefined); setReleasePhoneValue(undefined); }} onOk={() => {
      if (releasePhoneAccount === undefined || releasePhoneValue === undefined) return;
      void execute.mutateAsync({ accountId: releasePhoneAccount.accountId, expectedRevision: releasePhoneAccount.revision, kind: "release_phone", phone: releasePhoneValue }).then(() => { setReleasePhoneAccount(undefined); setReleasePhoneValue(undefined); });
    }}>
      <Space orientation="vertical" size={12} style={{ width: "100%" }}>
        <Typography.Text>释放后，该旧手机号可被其他账号使用。此操作不会修改当前登录手机号。</Typography.Text>
        <Select aria-label="选择要释放的旧手机号" value={releasePhoneValue} onChange={setReleasePhoneValue} options={(releasePhoneAccount?.releasablePhones ?? []).map((phone) => ({ label: phone, value: phone }))} style={{ width: "100%" }} />
      </Space>
    </Modal>

    <Modal title="编辑员工账号" open={editingAccount !== undefined} okText="保存" cancelText="取消" confirmLoading={execute.isPending} onCancel={() => { setEditingAccount(undefined); }} onOk={() => { void editAccountForm.validateFields().then(async (value: Record<string, string>) => {
      if (editingAccount === undefined) return;
      await execute.mutateAsync({ kind: "update_account", accountId: editingAccount.accountId, expectedRevision: editingAccount.revision, username: value["username"] ?? "", legalName: value["legalName"] ?? "", ...(value["phone"] ? { phone: value["phone"] } : {}), departmentId: value["departmentId"] ?? "", positionId: value["positionId"] ?? "" });
      setEditingAccount(undefined); editAccountForm.resetFields();
    }); }}>
      <Form form={editAccountForm} layout="vertical" preserve={false}>
        <Form.Item name="username" label="用户名（昵称）" rules={[{ required: true }, { pattern: /^[A-Za-z0-9._-]{4,32}$/u }]}><Input autoComplete="off" /></Form.Item>
        <Form.Item name="legalName" label="姓名（实名）" rules={[{ required: true, whitespace: true, max: 64 }]}><Input /></Form.Item>
        <Form.Item name="phone" label="手机号"><Input /></Form.Item>
        <Form.Item name="departmentId" label="部门" rules={[{ required: true }]}><Select options={activeDepartments.map((item) => ({ label: item.name, value: item.departmentId }))} onChange={() => { editAccountForm.setFieldValue("positionId", undefined); }} /></Form.Item>
        <Form.Item noStyle shouldUpdate>{() => <Form.Item name="positionId" label="岗位" rules={[{ required: true }]}><Select options={positions.filter((item) => item.status === "active" && item.departmentId === editAccountForm.getFieldValue("departmentId") as string).map((item) => ({ label: item.name, value: item.positionId }))} /></Form.Item>}</Form.Item>
      </Form>
    </Modal>

    <Modal title="编辑系统账号登录标识" open={editingSystemAccount !== undefined} okText="保存" cancelText="取消" confirmLoading={execute.isPending} onCancel={() => { setEditingSystemAccount(undefined); }} onOk={() => { void systemAccountForm.validateFields().then(async (value: Record<string, string>) => {
      if (editingSystemAccount === undefined) return;
      await execute.mutateAsync({ accountId: editingSystemAccount.accountId, expectedRevision: editingSystemAccount.revision, kind: "update_system_account", ...(value["phone"] ? { phone: value["phone"] } : {}), username: value["username"] ?? "" });
      setEditingSystemAccount(undefined); systemAccountForm.resetFields();
    }); }}>
      <Form name="system-account-identifiers" form={systemAccountForm} layout="vertical" preserve={false}>
        <Form.Item name="username" label="用户名（昵称）" rules={[{ required: true }, { pattern: /^[A-Za-z0-9._-]{4,32}$/u, message: "请输入 4-32 位字母、数字、点、下划线或短横线" }]}><Input autoComplete="off" /></Form.Item>
        <Form.Item name="phone" label="手机号（可用于登录）" rules={[{ pattern: /^\+?[0-9 -]{6,24}$/u, message: "请输入有效手机号" }]}><Input autoComplete="off" /></Form.Item>
      </Form>
    </Modal>

    <Modal title={editingDepartment === undefined ? "新建部门" : "编辑部门"} open={departmentOpen} okText={editingDepartment === undefined ? "创建" : "保存"} cancelText="取消" onCancel={() => { setDepartmentOpen(false); }} onOk={() => { void departmentForm.validateFields().then(async (value: Record<string, string>) => {
      const parent = value["parentDepartmentId"];
      await execute.mutateAsync(editingDepartment === undefined
        ? { kind: "create_department", departmentId: operationId(), name: value["name"] ?? "", ...(parent ? { parentDepartmentId: parent } : {}) }
        : { kind: "update_department", departmentId: editingDepartment.departmentId, expectedRevision: editingDepartment.revision, name: value["name"] ?? "", parentDepartmentId: parent ?? null });
      setDepartmentOpen(false); setEditingDepartment(undefined); departmentForm.resetFields();
    }); }}><Form form={departmentForm} layout="vertical" preserve={false}><Form.Item name="name" label="部门名称" rules={[{ required: true, whitespace: true, max: 64 }]}><Input /></Form.Item><Form.Item name="parentDepartmentId" label="上级部门"><Select allowClear options={activeDepartments.map((item) => ({ label: item.name, value: item.departmentId }))} /></Form.Item></Form></Modal>

    <Modal title={editingPosition === undefined ? "新建岗位" : "编辑岗位"} open={positionOpen} okText={editingPosition === undefined ? "创建" : "保存"} cancelText="取消" onCancel={() => { setPositionOpen(false); }} onOk={() => { void positionForm.validateFields().then(async (value: Record<string, string>) => {
      await execute.mutateAsync(editingPosition === undefined
        ? { kind: "create_position", positionId: operationId(), name: value["name"] ?? "", departmentId: value["departmentId"] ?? "" }
        : { kind: "update_position", positionId: editingPosition.positionId, expectedRevision: editingPosition.revision, name: value["name"] ?? "" });
      setPositionOpen(false); setEditingPosition(undefined); positionForm.resetFields();
    }); }}><Form form={positionForm} layout="vertical" preserve={false}><Form.Item name="name" label="岗位名称" rules={[{ required: true, whitespace: true, max: 64 }]}><Input /></Form.Item><Form.Item name="departmentId" label="所属部门" rules={[{ required: true }]}><Select disabled={editingPosition !== undefined} options={activeDepartments.map((item) => ({ label: item.name, value: item.departmentId }))} /></Form.Item></Form></Modal>
  </PageContainer>;
}
