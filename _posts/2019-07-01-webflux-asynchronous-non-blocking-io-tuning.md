---
layout: post
cover: '/assets/images/cover8.jpg'
title: WebFlux로 Asynchronous & Non-blocking I/O 전환하여 API 성능 튜닝하기
date: 2019-06-01 00:00:00
tags: WebFlux WebClient Reactor Reactor-Cache Tuning
subclass: 'post tag-dev'
categories: 'pkgonan' 
navigation: True
---

## 목적
* WebFlux로 Asynchronous & Non-blocking I/O 전환하여 API 성능 튜닝


## 배경
* APM을 통해 특정 API는 평균 성능 보다 수 십배 느려, 성능 편차가 크다는 걸 알게 되었습니다.
* 성능 저하의 원인은 I/O의 순차 처리와 Blocking으로, 병목 현상을 유발하고 있었습니다.
* 따라서, 병목을 해소하여 API의 성능 및 처리율을 향상 시키고자 합니다.

> 응답시간을 나타내는 녹색점이 위 아래로 넓게 퍼져있어 성능 편차가 큰 것을 알 수 있다.

![Pinpoint 성능 편차](/assets/images/post/Pinpoint_Before_Async_Nonblocking_Tuning.png){: width="70%" height="70%"}


## 목표
* 순차적으로 처리하던 다수의 I/O 작업을 동시에 처리하도록 개선하여, API 성능 향상
* Blocking I/O를 Non-Blocking 하도록 개선하여, API 성능 향상
* 컴퓨팅 자원(Thread)을 효율적으로 활용하여, 급증하는 트래픽을 안정적으로 처리


## 필수 지식
* Blocking and Non-blocking
* Synchronous and Asynchronous
* Reactive API를 사용하면 무엇이 좋은가 ?
* Reactive API는 언제 써야 하는가 ?
* Reactive API는 왜 써야 하는가 ?
* Reactor (Mono & Flux)


## 도구
* spring-boot-starter-webflux
* [reactor-cache](https://github.com/pkgonan/reactor-cache)
* reactor-extra
* reactor-test


## 작업
> 작업은 전환, 조립, 튜닝 3단계로 나누어 진행.


## 전환 작업
* 외부 API 호출 모듈 전체를 비동기/논블로킹을 지원하는 WebClient 기반으로 전환

> RestTemplate & WebClient Blocking -> WebClient Non-blocking

* ###### AS-IS
    ![RestTemplate Blocking I/O](/assets/images/post/RestTemplate_Blocking_IO.png){: width="70%" height="80%"}
    ![WebFlux Blocking I/O](/assets/images/post/WebFlux_Blocking_IO.png){: width="70%" height="70%"}
* ###### TO-BE
    ![WebFlux Non-Blocking I/O](/assets/images/post/WebFlux_Non-Blocking_IO.png){: width="70%" height="70%"}
    

## 조립 작업
* 외부 API, DB 조회, Redis 등 `I/O 작업의 순서가 중요하지 않다면 동시에 처리하도록 개선`.

> 이때, 순차 처리하는 I/O를 동시에 처리하도록 `Mono.zip`을 활용하여 조립.

* ###### 대상
    * API 호출
    * DB 조회
    * Redis 조회
        
* ###### 작업 예시
    ![Mono.zip Function Usage](/assets/images/post/WebFlux_Zip_Function.png){: width="90%" height="90%"}
* ###### 유의 사항
    * WebFlux는 Netty 기반으로 동작하기에 적은 수의 Thread를 효율적으로 처리해야 한다.
    * 따라서, Thread가 Blocking 되면 안된다.
    * 만약, Blocking I/O를 어쩔 수 없이 함께 사용해야 할 경우 반드시 `Elastic Thread` 혹은 `Custom Thread`를 할당하여 처리해야 한다.
    ![Elastic Scheduler](/assets/images/post/WebFlux_Elastic_Schedulers.png){: width="90%" height="90%"}


## 튜닝 작업
* ###### 배경
    * Spring Boot 2.1.6 기준 Spring의 @Cacheable에서 Reactor Cache 미지원
* ###### 작업
    * `Reactor Cache 개발`
* ###### 요구사항
    * Spring에서 Reactive Cache를 지원할 경우를 고려해서 추가 및 제거가 용이해야 한다.
    * Spring @Cacheable 인터페이스와 구현이 변경되도 영향을 받지 않게 개발해야 한다.
* ###### 요구사항 구체화
    * AOP & Annotation 기반으로 개발
    * Spring @Cacheable 관련 코드를 재활용 하지 않는다.
* ###### Github
    * [Reactor Cache](https://github.com/pkgonan/reactor-cache)


## 결과
> 비동기 논블로킹 개선 작업으로 병목 현상이 해소되어 성능이 대폭 향상되었음.

![Total_Newrelic](/assets/images/post/Newrelic_After_Async_Nonblocking_Tuning_Total.png){: width="120%" height="120%"}

> 평균 응답 속도보다 느린 API를 개선하여 Latency가 튀는 현상 즉, 성능 편차를 줄였다.

![Total_Pinpoint](/assets/images/post/Pinpoint_After_Async_Nonblocking_Tuning_Total.png){: width="120%" height="120%"}


## 마치며
* 예상보다 성능 향상 효과가 컸다.
* 비동기 논블로킹 개선 작업은 외부 I/O 응답이 느리면 느릴 수록, 동시에 호출하는게 많으면 많을 수록 효과가 크다.
    * 순차 처리하던 것을 동시에 처리하도록 변경하니 당연하다.
* 아직 JDBC가 비동기 논블로킹 스펙을 지원하지 않아, [R2DBC](https://r2dbc.io)를 기다리는 중이다.
    * DB까지 Full 비동기 논블로킹을 지원하게 되면, 1 Request = 1 Thread의 서블릿 기반의 개념을 벗어날 수 있지 않을까 생각한다.


