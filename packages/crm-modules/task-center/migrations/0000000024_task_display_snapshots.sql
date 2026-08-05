alter table crm_task_center.task_projections
  add column title varchar(512) not null default 'Task update',
  add column summary varchar(2000) not null default 'Open the task to view its current details.';

comment on column crm_task_center.task_projections.title is 'Source-provided display snapshot for lifecycle v2; fixed neutral fallback for v1.';
comment on column crm_task_center.task_projections.summary is 'Source-provided display snapshot for lifecycle v2; fixed neutral fallback for v1.';
