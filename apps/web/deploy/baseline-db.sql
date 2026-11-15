-- Database baseline (real-time upgrade, Phase 0). READ-ONLY: only SELECTs, safe on the live database.
--
--   sudo -u postgres psql -d iris -f /opt/iris-web/apps/web/deploy/baseline-db.sql > ~/db-baseline-$(date +%F).txt
--
-- Run it once before a change and once after, and compare. The pg_stat_statements part needs the extension
-- (deploy/DEPLOY.md, "8. Measuring"); without it that part just prints a notice.

\pset pager off
\timing off

\echo '== version and uptime'
select version();
select now() - pg_postmaster_start_time() as uptime;

\echo '== cache hit ratio (want above 0.99)'
select round(sum(blks_hit)::numeric / nullif(sum(blks_hit) + sum(blks_read), 0), 4) as hit_ratio,
       sum(xact_commit) as commits, sum(xact_rollback) as rollbacks, sum(deadlocks) as deadlocks,
       sum(temp_files) as temp_files
from pg_stat_database where datname = current_database();

\echo '== connections now'
select state, count(*) from pg_stat_activity where datname = current_database() group by 1 order by 2 desc;
show max_connections;

\echo '== biggest tables: size, rows, sequential vs index scans'
select relname,
       pg_size_pretty(pg_total_relation_size(relid)) as total,
       n_live_tup as rows,
       seq_scan, seq_tup_read, idx_scan,
       n_dead_tup as dead
from pg_stat_user_tables
order by pg_total_relation_size(relid) desc
limit 20;

\echo '== tables read mostly by sequential scan (candidates for an index)'
select relname, seq_scan, seq_tup_read, idx_scan, n_live_tup
from pg_stat_user_tables
where seq_scan > 100 and n_live_tup > 1000 and seq_scan > coalesce(idx_scan, 0)
order by seq_tup_read desc
limit 15;

\echo '== indexes never used since the stats were reset (not unique, bigger than 1 MB)'
select s.relname, s.indexrelname, pg_size_pretty(pg_relation_size(s.indexrelid)) as size, s.idx_scan
from pg_stat_user_indexes s
join pg_index i on i.indexrelid = s.indexrelid
where s.idx_scan = 0 and not i.indisunique and pg_relation_size(s.indexrelid) > 1024 * 1024
order by pg_relation_size(s.indexrelid) desc
limit 15;

\echo '== the settings that matter for this box'
select name, setting, unit from pg_settings
where name in ('shared_buffers', 'effective_cache_size', 'work_mem', 'maintenance_work_mem',
               'random_page_cost', 'max_connections', 'synchronous_commit', 'wal_compression',
               'autovacuum_vacuum_scale_factor', 'log_min_duration_statement', 'shared_preload_libraries')
order by name;

\echo '== top 20 statements by total time (pg_stat_statements)'
select count(*) > 0 as extension_present from pg_extension where extname = 'pg_stat_statements' \gset
\if :extension_present
select calls,
       round(total_exec_time::numeric, 0) as total_ms,
       round(mean_exec_time::numeric, 2) as mean_ms,
       round(max_exec_time::numeric, 0) as max_ms,
       rows,
       left(regexp_replace(query, '\s+', ' ', 'g'), 110) as query
from pg_stat_statements
where dbid = (select oid from pg_database where datname = current_database())
order by total_exec_time desc
limit 20;
\else
\echo 'pg_stat_statements is not installed here: see deploy/DEPLOY.md, section 8.'
\endif
