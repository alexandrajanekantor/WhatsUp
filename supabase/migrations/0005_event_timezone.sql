-- Store each event's local timezone so times display where the event is, not where the viewer is.
alter table events add column if not exists timezone text;
