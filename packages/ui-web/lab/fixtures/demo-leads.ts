export interface DemoLeadRecord {
  id: string;
  code: string;
  customer: string;
  channel: 'wecom' | 'referral' | 'website' | 'event';
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
  {
    id: 'demo-004',
    code: 'L-DEMO-004',
    customer: '演示客户 D',
    channel: 'event',
    owner: '演示员工 03',
    status: 'following',
    createdAt: '2026-07-12 16:40:00',
  },
  {
    id: 'demo-005',
    code: 'L-DEMO-005',
    customer: '演示客户 E',
    channel: 'wecom',
    owner: '演示员工 02',
    status: 'pending',
    createdAt: '2026-07-13 08:15:00',
  },
  {
    id: 'demo-006',
    code: 'L-DEMO-006',
    customer: '演示客户 F',
    channel: 'referral',
    owner: '演示员工 03',
    status: 'qualified',
    createdAt: '2026-07-13 11:25:00',
  },
  {
    id: 'demo-007',
    code: 'L-DEMO-007',
    customer: '演示客户 G',
    channel: 'event',
    owner: '演示员工 01',
    status: 'following',
    createdAt: '2026-07-13 13:50:00',
  },
  {
    id: 'demo-008',
    code: 'L-DEMO-008',
    customer: '演示客户 H',
    channel: 'website',
    owner: '演示员工 02',
    status: 'pending',
    createdAt: '2026-07-13 15:10:00',
  },
];
