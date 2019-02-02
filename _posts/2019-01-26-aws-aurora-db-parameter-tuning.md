---
layout: post
cover: '/assets/images/cover8.jpg'
title: AWS Aurora DB Cluster & Instance Parameter 튜닝
date: 2019-01-26 00:00:00
tags: AWS Aurora DB Tuning
subclass: 'post tag-dev'
categories: 'pkgonan' 
navigation: True
---

## 목적
* AWS Aurora DB Cluster & Instance Parameter Tuning


## 배경
* 담당하고 있는 서비스의 Production DB Migration


## 환경
* AWS Aurora Mysql 5.7.12


## AWS Aurora Mysql Cluster Parameter

| Variable | Reference Document | Default | Override | 비고 |
|---------|---------|---------|---------|---------|
| binlog_format | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/replication-options-binary-log.html#sysvar_binlog_format) | MIXED | ROW | innodb_autoinc_lock_mode 2 를 위해 ROW로 지정 필요 (Statement 는 위험성 존재), mysql 5.7.7 부터 ROW가 default |
| innodb_autoinc_lock_mode | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/innodb-auto-increment-handling.html) | 1 | 2 | Simple Insert는 성능 변화가 없다. 몇줄이 Insert 될지 미리 알 수 없는 Bulk Insert 문에서 성능이 개선된다. [what-is-innodb_autoinc_lock_mode-and-why-should-i-care](https://www.percona.com/blog/2017/07/26/what-is-innodb_autoinc_lock_mode-and-why-should-i-care/) PK Autoincrement시 1,2,3,4,5가 아닌 1,2,5,6,8 처럼 건너 뛰며 증가할 수 있어 PK 값의 증가 속도가 가속화된다. 따라서, PK의 Type을 int -> bigint에 대한 고려가 필요하다. binlog_format을 ROW로 지정해야 안전하다. [MySQL – InnoDB Auto Increment 성능 최적화](https://www.letmecompile.com/mysql-innodb-auto-increment-성능-최적화/) |
| innodb_sync_array_size | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/innodb-parameters.html#sysvar_innodb_sync_array_size) | 1 | 768 | Increasing the value is recommended for workloads that frequently produce a large number of waiting threads, typically greater than 768. |
| innodb_sync_spin_loops | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/innodb-parameters.html#sysvar_innodb_sync_spin_loops) | 30 | 10 | [MySQL CPU Saturation Analysis](http://small-dbtalk.blogspot.com/2016/06/) |
| character_set_client | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_character_set_client) | utf8 | utf8mb4 | |
| character_set_connection | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_character_set_connection) | utf8 | utf8mb4 | |
| character_set_database | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_character_set_database) | latin1 | utf8mb4 | |
| character_set_filesystem | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_character_set_filesystem) | binary | utf8mb4 | |
| character_set_results | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_character_set_results) | utf8 | utf8mb4 | |
| character_set_server | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_character_set_server) | latin1 | utf8mb4 | |
| collation_connection | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_collation_connection) | | utf8mb4_unicode_ci | |
| collation_server | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_collation_server) | latin1_swedish_ci | utf8mb4_unicode_ci | |
| lc_time_names | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_lc_time_names) | | ko_KR | |
| time_zone | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_time_zone) | | Asia/Seoul | |


## AWS Aurora Mysql Instance Parameter

| Variable | Reference Document | Default | Override | 비고 |
|---------|---------|---------|---------|---------|
| innodb_adaptive_hash_index | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/innodb-parameters.html#sysvar_innodb_adaptive_hash_index) | 1 |  | default 설정 유지, default ON, 자주 사용하는 PK 접근에 대해 O(logN) -> O(1)로 접근하여 성능 향상, Drop Table시 Hash 메모리 정리 작업으로 인해 쿼리 처리량이 떨어져 장애 발생 가능, 따라서 트래픽이 적은 시간에 Drop Table 수행 필요. [kakao-adaptive-hash-index](http://tech.kakao.com/2016/04/07/innodb-adaptive-hash-index/) [innodb-adaptive-hash](https://dev.mysql.com/doc/refman/5.7/en/innodb-adaptive-hash.html) [mysql-57-mutex](http://small-dbtalk.blogspot.com/2015/11/mysql-57-mutex.html) |
| innodb_adaptive_hash_index_parts | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/innodb-parameters.html#sysvar_innodb_adaptive_hash_index_parts) | 8 |  | default 설정 유지 |
| innodb_adaptive_flushing | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/innodb-parameters.html#sysvar_innodb_adaptive_flushing) | 1 |  | default 설정 유지 |
| innodb_adaptive_max_sleep_delay | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/innodb-parameters.html#sysvar_innodb_adaptive_max_sleep_delay) | 150000 |  | default 설정 유지 |
| query_cache_type | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_query_cache_type) | 1 | 0 | The query cache is deprecated as of MySQL 5.7.20, and is removed in MySQL 8.0. Deprecation includes [query_cache_type.](https://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_query_cache_type) |
| query_cache_size | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_query_cache_size) | {DBInstanceClassMemory/24} | 0 | The query cache is deprecated as of MySQL 5.7.20, and is removed in MySQL 8.0. Deprecation includes [query_cache_size.](https://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_query_cache_size) |
| query_cache_limit | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_query_cache_limit) | 1048576 |  | 변경 없음(=Aurora MySQL 5.7 default) The query cache is deprecated as of MySQL 5.7.20, and is removed in MySQL 8.0. Deprecation includes [query_cache_limit.](https://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_query_cache_limit) |
| query_cache_min_res_unit | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_query_cache_min_res_unit) | 4096 |  | 변경 없음(=Aurora MySQL 5.7 default) The query cache is deprecated as of MySQL 5.7.20, and is removed in MySQL 8.0. Deprecation includes [query_cache_min_res_unit.](https://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_query_cache_min_res_unit) |
| query_cache_wlock_invalidate | [Reference Document](	https://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_query_cache_wlock_invalidate) | 0 |  | 변경 없음(=Aurora MySQL 5.7 default) The query cache is deprecated as of MySQL 5.7.20, and is removed in MySQL 8.0. Deprecation includes [query_cache_wlock_invalidate.](https://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_query_cache_wlock_invalidate) |
| eq_range_index_dive_limit | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_eq_range_index_dive_limit) | >= 5.7.4 : 200, <= 5.7.3 : 10 | 200 | index statistics 대신 index dive를 더 활용하도록 200 설정 [index-range-scan](http://small-dbtalk.blogspot.com/2016/02/mysql56-inval1-valn-index-range-scan.html) |
| connect_timeout | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_connect_timeout) | 10 | 5 |  |
| innodb_lock_wait_timeout | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/innodb-parameters.html#sysvar_innodb_lock_wait_timeout) | 50 | 5 | Innodb Record Lock에만 적용되며 Table Lock에는 적용되지 않음 |
| lock_wait_timeout | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_lock_wait_timeout) | 31536000 (1year) | 3600 (1hour) |  |
| slow_query_log | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_slow_query_log) | 0 | 1 | Slow Query Logging 여부 |
| long_query_time | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_long_query_time) | 10 | 3 | 해당 초를 지난 쿼리에 대해 Slow Query Logging을 한다 |
| log_queries_not_using_indexes | [Reference Document](https://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_log_queries_not_using_indexes) | 0 |  | 인덱스를 타지 않는 쿼리 로깅 여부 - 필요한 경우 1로 설정한다 |


