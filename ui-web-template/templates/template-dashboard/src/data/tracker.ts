export type TrackerStatus = "To Do" | "In Progress" | "Done";

export type Assignee = {
  name: string;
  avatar: string;
};

export type TrackerTask = {
  id: string;
  title: string;
  description: string;
  status: TrackerStatus;
  tag: {
    color: "accent" | "success" | "warning" | "danger";
    label: string;
  };
  assignees: readonly Assignee[];
  dueDate?: string;
  subtasks?: {
    completed: number;
    total: number;
  };
};

export const TRACKER_COLUMNS: readonly TrackerStatus[] = ["To Do", "In Progress", "Done"];

const AVATARS = {
  alex: "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/indigo.jpg",
  emma: "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/rose.jpg",
  john: "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/sky.jpg",
  kate: "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/blue-light.jpg",
  mike: "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/green-dark.jpg",
  sara: "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/emerald.jpg",
} as const;

export const TRACKER_TASKS: readonly TrackerTask[] = [
  {
    assignees: [{avatar: AVATARS.john, name: "John Smith"}],
    description: "Audit the onboarding flow for slow LCP and CLS.",
    dueDate: "Dec 12",
    id: "t1",
    status: "To Do",
    tag: {color: "accent", label: "Engineering"},
    title: "Fix onboarding flow",
  },
  {
    assignees: [
      {avatar: AVATARS.kate, name: "Kate Moore"},
      {avatar: AVATARS.emma, name: "Emma Davis"},
    ],
    description: "Align 404/500 states with new brand guidelines.",
    dueDate: "Dec 10",
    id: "t2",
    status: "To Do",
    subtasks: {completed: 1, total: 4},
    tag: {color: "danger", label: "Design"},
    title: "Update error states",
  },
  {
    assignees: [{avatar: AVATARS.sara, name: "Sara Johnson"}],
    description: "Add inline validation errors to the sign-up flow.",
    dueDate: "Dec 8",
    id: "i1",
    status: "In Progress",
    subtasks: {completed: 3, total: 7},
    tag: {color: "warning", label: "Frontend"},
    title: "Fix form validation",
  },
  {
    assignees: [
      {avatar: AVATARS.alex, name: "Alex Turner"},
      {avatar: AVATARS.mike, name: "Mike Wilson"},
    ],
    description: "Draft user stories for the roadmap page.",
    id: "i2",
    status: "In Progress",
    subtasks: {completed: 2, total: 5},
    tag: {color: "accent", label: "Product"},
    title: "Write product spec",
  },
  {
    assignees: [{avatar: AVATARS.emma, name: "Emma Davis"}],
    description: "Renamed tokens across the token pipeline.",
    id: "d1",
    status: "Done",
    tag: {color: "success", label: "Design"},
    title: "Migrate design tokens to v3",
  },
];
