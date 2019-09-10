---
layout: post
cover: '/assets/images/cover5.jpg'
title: How to add new kafka topic listener at runtime
date: 2019-09-10 00:00:00
tags: Kafka platform
subclass: 'post tag-dev'
categories: 'pkgonan' 
navigation: True
---


## 배경
* 숙박, 레저, 항공, 철도 등 `확장 가능한 다양한 서비스에 쿠폰을 적용할 수 있는 쿠폰 플랫폼 개발`을 진행하게 되었습니다.
* `각 서비스는 쿠폰을 제공하고 싶을 경우 플랫폼에 들어와야 합니다.`
* 이를 위해 서비스는 플랫폼에 등록 해야 하며, 서비스의 주문 이벤트가 적재되는 Kafka Topic을 플랫폼에 함께 등록해야 합니다.
* 하지만, Spring Kafka의 @KafkaListener는 Runtime에 새로운 Kafka Topic을 등록하고 Consuming 할 수 없습니다.
* 따라서, 개발자는 새로운 서비스가 플랫폼에 들어올 때 새로운 @KafkaListener를 추가하는 개발 및 배포 작업을 진행해야 합니다.


## 목표
> Runtime에 새롭게 추가 된 Kafka Topic을 등록, 삭제, 시작, 종료 할 수 있는 도구 개발


## 결과
> Runtime에 new kafka topic을 add, remove, start, stop 기능 개발 완료


## Github
* [Runtime Kafka Listener](https://github.com/pkgonan/kafka-listener)


## 마치며
* 아마도 `일반적인 상황에서는 필요하지 않은 요구사항`으로 보입니다.
* `여러 가지 서비스들이 들어올 수 있는 플랫폼 개발이었기에, 추가 개발이 필요없고 재부팅도 필요 없는 위와 같은 기능이 필요` 하였습니다.
* 플랫폼에 새로운 서비스가 들어온다고 추가 개발 및 재부팅을 하는 작업은 플랫폼의 안정성을 저해하는 요소로 봤기 때문입니다.
* 따라서, `소스 코드의 추가가 아닌 데이터의 추가로 문제를 해결하기 위해 개발`하게 되었습니다.
* 추가적으로, Kafka Topic Listener의 추가, 삭제, 시작, 정지 기능은 사용하는 쪽에서 API 호출, Scheduler, Event 등을 Trigger로 동작시키면 됩니다.