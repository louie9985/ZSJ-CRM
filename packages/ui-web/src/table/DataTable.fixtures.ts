export interface DemoLeadRecord {
  id: string;
  code: string;
  customer: string;
  channel: 'wecom' | 'referral' | 'website';
  owner: string;
  status: 'pending' | 'following' | 'qualified';
  createdAt: string;
}

export const demoLeadRecords: DemoLeadRecord[] = [
  {
    id: 'demo-001',
    code: 'L-DEMO-001',
    customer: '演示客户 A',
    channel: 'wecom',
    owner: '演示员工 01',
    status: 'pending',
    createdAt: '2026-07-10 09:30:00',
  },
  {
    id: 'demo-002',
    code: 'L-DEMO-002',
    customer: '演示客户 B',
    channel: 'referral',
    owner: '演示员工 02',
    status: 'following',
    createdAt: '2026-07-11 14:20:00',
  },
  {
    id: 'demo-003',
    code: 'L-DEMO-003',
    customer: '演示客户 C',
    channel: 'website',
    owner: '演示员工 01',
    status: 'qualified',
    createdAt: '2026-07-12 10:05:00',
  },
];
