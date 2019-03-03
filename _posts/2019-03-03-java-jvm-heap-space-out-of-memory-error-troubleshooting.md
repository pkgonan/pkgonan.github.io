---
layout: post
cover: '/assets/images/cover3.jpg'
title: Java JVM Heap Space Out Of Memory Error Trouble Shooting
date: 2019-03-03 00:00:00
tags: Java JVM Trouble-Shooting
subclass: 'post tag-dev'
categories: 'pkgonan' 
navigation: True
---

## 목적
* Java JVM Heap Space Out of memory Error 발생 시 원인 파악 및 문제 해결


## 배경
* 운영중인 Dev 서버에서 Out Of Memory Error 가 발생하게 되었습니다.
* 이에 따라 서버에서는 다수의 500에러가 발생하고 있었습니다.
* 어떤 이유로 OOM이 발생했는지 그 원인을 파악하고 이를 통해 문제를 해결하고자 합니다.


## 원인 파악을 위한 준비
* Heap Dump
* Heap Dump Analyzer


## Heap Dump에 관하여
* `OOM 발생시 원인 파악을 위해 당시 Heap의 상태를 보여주는 Heap Dump 파일을 추출해야 합니다.`
* 이를 위해 Java Application 실행시 아래의 옵션을 추가하여 실행해야 합니다.
* -XX:+HeapDumpOnOutOfMemoryError 
* -XX:HeapDumpPath=/var/log
* 예) java -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/var/log -jar Application.jar


## Heap Dump Analyzer에 관하여
* Heap Dump 분석을 위한 여러가지 제품이 있습니다.
* 이번 Post에서는 Eclipse의 [MAT](https://www.eclipse.org/mat/)를 활용합니다.


## 분석
* Heap Dump Analyzer를 통해 추출한 Heap Dump를 분석합니다.
* OOM을 발생시킨 용의자를 찾기 위해 Leak Suspects 기능을 활용합니다.
* 전체 Heap에서 가장 큰 사용률을 보인 두 그룹이 용의 선상에 오른 것을 확인할 수 있습니다.
* 용의 선상에 오른 두 그룹에 대해 자세히 살펴보도록 하겠습니다. 
* ![예시](/assets/images/post/OOM_Leak_Suspects.png) 
* ![예시](/assets/images/post/OOM_Leak_Suspects_Detail.png)
* Suspect 1의 경우 `ResultSet 즉, DB에서 조회한 데이터를 메모리에 올리는 과정에서 전체 메모리의 41%를 사용한 것을 확인할 수 있습니다.`
* `DB에서 조회한 결과가 전체 메모리의 41%를 차지한다니 뭔가 수상합니다...`
* 따라서, 해당 시간에 어떠한 요청이 인입되었는지 파악하기 위해 Access Log를 분석하였습니다.
* 그 결과로, API 호출시 Query Parameter의 값이 비어 있는(Empty Space) 값으로 전송되었다는 것을 확인하게 되었습니다.
* 해당 API는 Query Parameter로 들어온 값으로 DB에 일치하는 N개의 데이터를 조회하게 되는데 이때, 빈 값이 전달될 경우 약 2천만 건의 데이터가 조회되고 있었습니다.
* 이에 따라 빈값이 전달되면서 2천만 건의 데이터를 메모리에 한번에 올리면서 OOM이 발생하게 된 것이었습니다.


## 해결
* OOM의 근본적인 원인은 API 호출시 Query Parameter 값에 대한 Validation이 정상적으로 동작하지 않은 문제였습니다.
* 따라서 Query Parameter에 대해 Validation이 정상적으로 동작하도록 수정하여 문제를 해결하게 되었습니다. 


## 마치며
* Heap Dump는 OOM 발생 시 문제의 원인을 파악할 수 있는 중요한 데이터입니다.
* 빠른 원인 파악은 빠른 문제 해결의 열쇠가 될 것입니다.
* 장애 발생시 사후 대응을 위해 -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/var/log 옵션은 반드시 넣는게 좋습니다.
