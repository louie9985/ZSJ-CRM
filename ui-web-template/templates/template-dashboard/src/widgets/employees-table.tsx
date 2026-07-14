"use client";

import type {Employee} from "../data/employees";
import type {DataGridColumn, DataGridSortDescriptor} from "@heroui-pro/react";

import {BarsDescendingAlignCenter, Copy, LayoutColumns3, Sliders} from "@gravity-ui/icons";
import {Avatar, Button, Chip, SearchField} from "@heroui/react";
import {DataGrid} from "@heroui-pro/react";
import {useCallback, useMemo, useState} from "react";

import {EMPLOYEES} from "../data/employees";

import {RowActions} from "./employees-table-row-actions";

export function EmployeesTable() {
  const [search, setSearch] = useState("");
  const [sortDescriptor, setSortDescriptor] = useState<DataGridSortDescriptor>({
    column: "name",
    direction: "ascending",
  });

  // Derived during render — no useState + useEffect mirror.
  const filteredEmployees = useMemo<Employee[]>(() => {
    if (!search) return [...EMPLOYEES];
    const q = search.toLowerCase();

    return EMPLOYEES.filter(
      (employee) =>
        employee.name.toLowerCase().includes(q) ||
        employee.email.toLowerCase().includes(q) ||
        employee.workerId.toLowerCase().includes(q),
    );
  }, [search]);

  const sortedEmployees = useMemo<Employee[]>(() => {
    if (!sortDescriptor.column) return filteredEmployees;
    const column = sortDescriptor.column as keyof Employee;

    return [...filteredEmployees].sort((a, b) => {
      const first = String(a[column] ?? "");
      const second = String(b[column] ?? "");
      const direction = sortDescriptor.direction === "descending" ? -1 : 1;

      return first.localeCompare(second) * direction;
    });
  }, [filteredEmployees, sortDescriptor]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
  }, []);

  const columns = useMemo<DataGridColumn<Employee>[]>(
    () => [
      {
        accessorKey: "workerId",
        allowsSorting: true,
        cell: (item) => (
          <div className="flex items-center gap-2">
            <span className="font-medium tabular-nums">{item.workerId}</span>
            <Button isIconOnly aria-label="复制编号" size="sm" variant="ghost">
              <Copy className="text-muted size-3.5" />
            </Button>
          </div>
        ),
        header: "员工编号",
        id: "workerId",
        isRowHeader: true,
        minWidth: 140,
      },
      {
        accessorKey: "name",
        allowsSorting: true,
        cell: (item) => (
          <div className="flex items-center gap-3">
            <Avatar className="size-8">
              <Avatar.Image alt={item.name} src={item.avatar} />
              <Avatar.Fallback>
                {item.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")}
              </Avatar.Fallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="text-xs font-medium">{item.name}</span>
              <span className="text-muted text-xs">{item.email}</span>
            </div>
          </div>
        ),
        header: "成员",
        id: "name",
        minWidth: 220,
      },
      {
        accessorKey: "role",
        allowsSorting: true,
        header: "职位",
        id: "role",
        minWidth: 200,
      },
      {
        accessorKey: "workerType",
        allowsSorting: true,
        header: "员工类型",
        id: "workerType",
        minWidth: 120,
      },
      {
        align: "end",
        cell: (item) => <RowActions employeeId={item.id} />,
        header: "操作",
        id: "actions",
        minWidth: 140,
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-foreground text-base font-semibold">全部员工</span>
          <Chip size="sm" variant="soft">
            32
          </Chip>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="tertiary">
              <Sliders className="size-4" />
              筛选
            </Button>
            <Button size="sm" variant="tertiary">
              <BarsDescendingAlignCenter className="size-4" />
              排序
            </Button>
            <Button size="sm" variant="tertiary">
              <LayoutColumns3 className="size-4" />
              列设置
            </Button>
          </div>
          <SearchField
            className="w-full sm:w-[220px]"
            name="employee-search"
            onChange={handleSearchChange}
          >
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="搜索..." />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
        </div>
      </div>

      <DataGrid
        aria-label="全部员工"
        columns={columns}
        contentClassName="min-w-[700px]"
        data={sortedEmployees}
        getRowId={(item) => item.id}
        sortDescriptor={sortDescriptor}
        onSortChange={setSortDescriptor}
      />
    </div>
  );
}
