export type Employee = {
  avatar: string;
  email: string;
  id: string;
  name: string;
  role: string;
  workerId: string;
  workerType: string;
};

export const EMPLOYEES: readonly Employee[] = [
  {
    avatar: "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/blue-light.jpg",
    email: "kate@acme.com",
    id: "1",
    name: "Kate Moore",
    role: "首席执行官",
    workerId: "#4586932",
    workerType: "正式员工",
  },
  {
    avatar: "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/sky.jpg",
    email: "john@acme.com",
    id: "2",
    name: "John Smith",
    role: "首席技术官",
    workerId: "#4586933",
    workerType: "正式员工",
  },
  {
    avatar: "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/emerald.jpg",
    email: "sara@acme.com",
    id: "3",
    name: "Sara Johnson",
    role: "首席营销官",
    workerId: "#4586934",
    workerType: "正式员工",
  },
  {
    avatar: "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/green-dark.jpg",
    email: "mike@acme.com",
    id: "4",
    name: "Mike Wilson",
    role: "工程副总裁",
    workerId: "#4586935",
    workerType: "正式员工",
  },
  {
    avatar: "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/indigo.jpg",
    email: "alex@acme.com",
    id: "5",
    name: "Alex Turner",
    role: "产品经理",
    workerId: "#4586936",
    workerType: "正式员工",
  },
  {
    avatar: "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/rose.jpg",
    email: "emma@acme.com",
    id: "6",
    name: "Emma Davis",
    role: "高级设计师",
    workerId: "#4586937",
    workerType: "正式员工",
  },
];
