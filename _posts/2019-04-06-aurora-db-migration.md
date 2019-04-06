---
layout: post
cover: '/assets/images/cover9.jpg'
title: AWS Aurora DB Migration
date: 2019-04-06 00:00:00
tags: AWS Aurora DB Migration
subclass: 'post tag-dev'
categories: 'pkgonan' 
navigation: True
---

## 목적
* AWS Aurora DB로 Migration 하기


## 배경
* 전체 시스템 구조를 MSA 환경으로 전환
* 이에 따라 담당하고 있는 서비스의 Production DB 분리 필요
* MariaDB 10.0.x -> AWS Aurora DB로 Migration 진행


## DB Migration 전략
* replication 전략 - 서비스 점검 시간 매우 짧다
* xtrabackup 전략 - 물리적 백업으로 데이터를 통째로 복사
* mysqldump 전략 - 논리적 백업, 데이터 사이즈에 비례해서 서비스 점검 시간 증가


## DB Migration 전략의 적합성 분석
* 서비스 점검 시간이 매우 짧다는 점에서 Replication 전략이 가장 좋은 선택
* 하지만.. MariaDB -> RDS Aurora로 데이터 동기화 과정에서 5.7의 경우 Master db를 찾지 못하는 버그
* 따라서, Replication 방식을 사용할 경우 Aurora 5.7로 다이렉트 이관이 불가 Aurora 5.6으로만 이관 가능
* 이왕 Migration 하는 김에.. Aurora 5.6을 쓰긴 싫고 Aurora 5.7을 쓰고 싶다
* Aurora 5.7을 쓰고 싶으면 점검 시간이 긴 나머지 방식을 선택해야 한다.
* 따라서 다음 타자인 xtrabackup을 고려하였지만 알수없는 문제 발생으로 실패
* 남은 방법은 mysqldump 인데 점검 시간이 매우 길어 진다..
* Replication 전략으로 Aurora 5.6으로 갈 것인가, mysqldump로 하루 점검 걸고 갈 것인가 그것이 문제로다.
* 어떻게 할 것인가 ?


## DB Migration 전략의 확정
* 여러 고민을 하던 중 Replication을 통해 Aurora 5.7로 Migration 할 수 있는 좋은 아이디어가 떠올랐다.
* 핵심은, `중간에 Aurora 5.6을 두어 돌다리를 만드는 것이다.`
* 위 전략을 활용하면 Replication 방식을 사용하여 Maria -> Aurora 5.7로 Migration이 가능하다.


## DB Migration 아이디어
* 기존 Maria DB → Aurora 5.6 → Aurora 5.7
* -> 는 Replication을 의미한다.
* 서비스 점검 전 위 순서로 Replication을 걸어 놓는다.
* 서비스 점검 후 모든 서버에서 기존 MariaDB 참조를 끊고 Aurora 5.7을 바라보도록 배포한다.
* Replication이 종료 된 것을 확인 후 아래 작업을 진행한다.
* MariaDB -> Aurora 5.6 Replication을 끊는다.
* Aurora 5.6 -> Aurora 5.7 Replication을 끊는다.
* Aurora 5.6을 삭제한다.
* 이제, Aurora 5.7을 신나게 쓰면 된다.


## DB Migration 아이디어 이미지 설명
* ![AWS Aurora DB Migration Strategy](/assets/images/post/AWS_Aurora_DB_Migration_Strategy.png)


## 마치며
* 이가 없으면 잇몸으로...
* 사실.. 서비스 점검을 하루동안 걸 수 는 없었기에 Replication 방식으로 Aurora 5.6으로 가는 걸 확정했었다.
* 이후에 다행히 `돌다리`라는 좋은 아이디어가 떠올라서 Aurora 5.7로 Migration 할 수 있었다.
* 작은 아이디어 하나가 큰 도움이 되었던 것 같다.
