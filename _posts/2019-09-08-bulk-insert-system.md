---
layout: post
cover: '/assets/images/cover8.jpg'
title: Bulk Insert와 Asynchronous I/O를 활용하여 쿠폰 대량 지급 성능 개선하기
date: 2019-09-08 00:00:00
tags: Bulk-Insert Asynchronous Tuning
subclass: 'post tag-dev'
categories: 'pkgonan' 
navigation: True
---

## 목적
* 쿠폰 대량 지급 시스템 개발을 통한, 대량 지급 성능 및 운영 효율성 개선


## 현황 및 문제점
* `한번에 수 천만개의 쿠폰을 지급해야 합니다.` 
* 하지만, 쿠폰을 지급하는 관리자는 아래와 같은 문제점을 가지고 있었습니다.
    * 첫째, 쿠폰 대량 지급 속도가 매우 느리다.
    * 둘째, 사용자는 지급 결과를 알기 위해서 지급 완료까지 대기해야 한다.
    * 셋째, 쿠폰 지급 처리 과정 중 휴먼 에러로 쿠폰 오지급 가능성이 높다.


## 원인 분석
* 첫째, 단일 Insert Query로 동작한다.
* 둘째, 지급 요청과 지급 결과 확인이 동기 방식으로 수행된다.
* 셋째, 지급 대상 분석부터 파일 추출 그리고 업로드까지 사람의 손을 직접 거치는 부분이 많다.


## 해결 방안
* 첫째, `Bulk Insert Query로 개선.`
* 둘째, `지급 요청과 지급 결과 확인을 비동기로 개선.`
* 셋째, `사람은 지급 대상 분석만 처리, 파일 추출 및 업로드는 생략 혹은 시스템이 처리하도록 개선.`


## 해결 방안의 구체화
* JPA 기반의 Bulk Insert Query로 개선하여, 성능을 극대화 한다.
* 지급 요청을 Queue에 적재, Scheduler를 통해 지급 처리 후 지급 결과를 이벤트로 던져 결과를 Slack으로 알려주어, 요청과 요청의 결과를 비동기로 처리한다.
* Presto JDBC를 활용하여 클라이언트로부터 Presto Table 이름과 Column을 전달받아 지급 대상을 추출하도록 개선하여, 엑셀 업로드 및 다운로드 과정을 제거한다.


## 작업에 사용된 개념
* `Bulk Insert`는 왜 더 빠른가 ?
* `DB Index Table Rebalancing 그리고 성능`
* `Hard Delete 그리고 Soft Delete`
* `블로킹 & 논블로킹` 그리고 `동기 & 비동기`에 관하여
* `AOP를 통한 공통 관심사의 추출` 방법
* `Event를 통하여 패키지 그리고 클래스간의 의존성을 분리`하는 방법


## 이해를 돕기 위하여.
* 아래 기본적인 쿠폰 지급 요청 흐름과 지급 수행 흐름을 확인하자.
* 아래 간략화하여 표현한 도메인 인터페이스와 서비스를 확인하자.


## 지급 요청 흐름
* ![쿠폰 지급 요청 흐름](/assets/images/post/Distribution_Command_Sequence_Diagram.png)


## 지급 수행 흐름
* ![쿠폰 지급 수행 흐름](/assets/images/post/Distribution_Process_Sequence_Diagram.png)


## 도메인 - Distributor
* 쿠폰 대량 지급의 최소 단위이다. 
    * Reader와 Writer를 가진다. 
    * Reader에서 읽어서 Writer에 쓴다.
    * Reader & Writer를 받아 distribute()를 수행하면 쿠폰을 지급한다.
* ![쿠폰 Distributor](/assets/images/post/Domain-Distributor.png)


## 도메인 - Reader
* 쿠폰 지급의 대상을 읽어오는 Reader.
    * read() - Java 8의 Stream<T> 스펙으로 쿠폰 지급 대상을 읽는다.
    * PrestoReader는 Presto JDBC를 활용하여 JPA 스펙으로 읽는 Reader이다.
* ![쿠폰 Reader](/assets/images/post/Domain-Reader.png)


## 도메인 - Writer
* 쿠폰 지급 행위를 수행할 Writer.
    * write(Stream<T>) - Stream<T>으로 추출한 대상에게 쿠폰을 지급한다.
    * WebClientWriter는 WebClient를 활용하여 비동기 및 동기 스펙으로 API 호출이 가능한 Writer이다.
* ![쿠폰 Writer](/assets/images/post/Domain-Writer.png)


## 서비스 - Command
* 쿠폰 지급 명령의 기본 단위
    * Distributor - 지급기
    * Payload - 지급 요청 시 클라이언트로부터 전달 받은 Payload
    * execute()를 수행하면 쿠폰 지급 명령을 수행한다.
* ![쿠폰 Command](/assets/images/post/Service-Command.png)


## 서비스 - Event
* 쿠폰 지급과 기타 관심사를 분리하여 의존성을 낮추기 위해 사용
    * 쿠폰 지급과 알림은 서로 관심사가 달라 이를 분리하기 위해 활용
    * Spring Event를 활용하여, 이벤트 Publish & Subscribe 수행
    * Publisher는 아래의 이벤트를 발생시킨다. 
        * 쿠폰 지급 시작 이벤트
        * 쿠폰 지급 성공 이벤트
        * 쿠폰 지급 실패 이벤트
    * Subscriber는 각 이벤트를 받아, 원하는 비지니스를 수행한다.
        * Slack Notification
        * Email
* ![쿠폰 Event](/assets/images/post/Service-Event.png)


## 서비스 - Interceptor
* 공통 관심사를 추출하기 위해 사용하며, AOP를 활용한다.
    * 모든 쿠폰 지급 행위에 대해 소요 시간을 측정한다.
    * 공통 관심사를 추상화하여, 해당 행위 전/후로 어떤 작업을 하기 위해 사용.


## 서비스 - Notificator
* 쿠폰 지급 관련 Notification 전송
    * Slack
    * Email
* 의존성 분리를 위해 Spring Event를 활용하여, Notification 전송
    * 각 NotificationService에서는 @EventListener를 활용하여 이벤트를 수신하여 처리한다.
    * Notification은 정확한 순서 보장이 중요하지는 않아, @Async를 활용하여 비동기로 처리한다.
    

## 서비스 - Queue
* 쿠폰 지급 명령의 순차 처리와, 비동기 처리를 위해 사용한다.
    * 클라이언트는 작업 요청을 Queue에만 담고 끝나기에 비동기 처리의 기반이된다.


## 서비스 - Scheduler
* Background에서 쿠폰 지급 요청을 수행
    * Queue에서 DistributionCommand 를 하나씩 꺼내 순차처리한다.
    * 쿠폰 API의 DBCP 부족 현상 방지 & DB Lock 경합으로 인한 장애 예방을 위해 순차처리.
* ![쿠폰 Scheduler](/assets/images/post/Service-Scheduler.png)


## 결과
> 쿠폰 1천만건 당 500분 => 5분, 쿠폰 대량 지급 성능 100배 향상.


> 지급 요청과 결과 확인을 동기 방식에서 비동기 방식으로 전환하여, 사용자는 기다리지 않고 다른 작업을 처리할 수 있다.


## 마치며
* 단일 Insert Query를 Bulk Insert Query로 변경하는 것 만으로도 성능 향상 효과가 컸다.
* 현재, 아쉽게도 쿠폰 대량 지급 Table은 사용자가 쿠폰을 받아가면 Soft Delete가 아닌 Hard Delete 방식으로 처리한다.
* 이때, `DB Index Table Rebalancing을 위해 Index Table Lock이 발생하여 성능 저하가 있다.`
* 따라서, `극단적인 성능을 위해서는 대량 지급 테이블에 대해 인덱스는 최소화하며 반드시 Soft Delete를 사용해야 할 것으로 판단된다.`
* 특히, `Soft Delete 시 삭제 여부를 나타내는 Flag 혹은 삭제 시간을 나타내는 컬럼에 인덱스를 구성하면 안된다. Insert 시 인덱스에도 추가되어 성능 저하가 발생하기 때문이다.`
* 그리고 기존에 요청과 요청의 결과가 동기 방식으로 이루어져 사용자는 세션 타임아웃 뿐만 아니라 무한 로딩을 겪어야 했다. 하지만 비동기로 개선하여 이를 해결하였다.