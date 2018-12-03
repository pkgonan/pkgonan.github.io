---
layout: post
cover: '/assets/images/cover2.jpg'
title: JPA Composite Primary Key의 IN 쿼리 서술 방식 변경을 통한 DB Optimizer 인덱스 전략 튜닝
date: 2018-11-03 00:00:00
tags: Java JPA Hibernate MariaDB DB Index
subclass: 'post tag-dev'
categories: 'pkgonan' 
navigation: True
---

## 목적
* JPA Composite Primary Key의 IN 쿼리 서술 방식 변경을 통해 DB Optimizer의 인덱스 전략 튜닝


## 배경
* 현재 야놀자 쿠폰 API 서버 개발을 담당하고 있으며, 최근 API 서버의 P99 Latency가 급격하게 느려진 것을 확인하였습니다.
* APM Pinpoint에서 확인 결과, Composite Primary Key를 사용하는 특정 API의 쿼리 수행시간이 느려 진 것을 알게 되었습니다.
* 분석 결과, JPA에서 Composite Primary Key를 통해 IN Query를 사용하게 될 경우 아래와 같은 쿼리가 발생하고 있었습니다.


        SELECT * FROM A WHERE (A.a, A.b) IN ( (1,2), (3,4) );


* Explain으로 쿼리 수행 방식 조회 결과, FULL Scan 급으로 동작하고 있는 것을 파악하게 되었습니다.
    * Index Type=index
        * `Range 보다 느리고 N개의 데이터 블럭을 스캔하기에 FULL Scan과 다름 없다.`
    * Rows=N개..(보안!)
    * ![Explain 결과](/assets/images/post/JPA_Composite_Key_Query_Explain_Analysis_Result.png)
* IN Query 자체가, Optimizer가 최적화를 제대로 못하는 경우가 있다. (InnoDB 사용중)
    * [Mysql Index Cook Book](http://mysql.rjweb.org/doc.php/index_cookbook_mysql)

        >IN (1,99,3) is sometimes optimized as efficiently as "=", but not always. Older versions of MySQL did not optimize it as well as newer versions. (5.6 is possibly the main turning point.)
        
        
* 따라서, JPA에서 IN Query를 서술 방식을 변경하여 인덱스를 정상적으로 타도록 개선하자.
    

    * AS-IS
    
            SELECT * FROM A WHERE (A.a, A.b) IN ( (1,2), (3,4) );
            
    * TO-BE
        
            SELECT * FROM A WHERE (A.a=1 AND A.b=2) OR (A.a=3 AND A.b=4);


## 환경
* JAVA 8
* Spring Boot 2.x
* Spring Data JPA 2.x
* Hibernate 5.2.x
* QueryDSL 4.2.x
* Hazelcast 3.10.x
* MariaDB 10.0.x (InnoDB-5.6.x)
* AWS Elastic Beanstalk


## 문제 분석
* 처음에는 Composite Primary Key의 순서로 인해 성능이 저하된 것으로 판단하였음. (Cardinality에 따른 적합한 순서)
    * 하지만, 라이브 데이터를 그대로 받아 로컬 환경에서 Composite Primary Key 순서 변경 후 테스트 결과, 영향이 크지 않음.
    * 따라서, 근본적으로 다른 부분에 문제가 있음을 파악.
* Optimizer의 index type 분석 결과 `index`방식 확인.
    * 전체 인덱스 블락을 스캔하기에 Index Type `ALL` 즉 풀스캔과 유사.
    * Range 쿼리보다 비효율적.
* 쿼리 방식을 정확히 AND, =, OR 등으로 서술하게 변경하면 어떨까?
    * 그 영향은, 오직 Composite Primary Key를 사용하는 Repository로만 한정하여 적용.
* 테스트 결과 IN Query로 서술하지 않고, AND, =, OR 등으로 쿼리를 서술하면 인덱스를 정상적으로 타는 것을 확인.


## 문제 분석 결론
* `JPA의 Composite Primary Key의 쿼리 서술 방식을 변경하자.`


## 구현
* 구현 핵심
    * `기존 JPA에서 제공하는 method를 override 하자.`
        * 현재 QueryDSL을 사용하고 있기에 아래 두개의 소스 코드에서 재정의할 메소드를 확인하자.
            * QuerydslJpaRepository.java
            * SimpleJpaRepository.java
    * 여러개의 Composite Primary Key로 조회할 경우 파라미터를 Iterable을 상속한 형태로 받을 것이다.
        * `A는 Entity 이름`
        * `A.ID는 해당 Entity의 Composite Primary Key`
    * 현재 QueryDSL을 사용하므로, 여러개의 조합 키를 AND와 OR로 묶는 작업은 `QueryDSL의 Predicate`를 사용한다.
* 실제 구현
    * 커스텀 Repository
    
        
            interface ACustomRepository {
          
               List<A> findAllById(Iterable<A.Id> ids);
          
            } 
-

    * 커스텀 Repository의 구현체


            class ARepositoryImpl implements ACustomRepository {
             
                 @Autowired
                 private ARepository aRepository;
            
            
                 /**
                  * [AS-IS] SELECT * FROM A WHERE (a,b,c) in ( (1,2,3), (4,5,6) );
                  * [TO-BE] SELECT * FROM A WHERE a=1 and b=2 and c=3 or a=4 and b=5 and c=6 ;
                  */
                 @Override
                 public List<A> findAllById(Iterable<A.Id> ids) {
                     Predicate predicate = ASpecs.by(ids);
                     return aRepository.findAll(predicate);
                 }
             } 
-

    * QueryDSL을 활용한 Predicate 생성
    
    
            public class ASpecs {
 
            
                 /**
                  * @return 특정 metaId & placeNo 등록된 설정 조회
                  */
                 public static BooleanExpression by(long metaId, long placeNo) {
                     return metaIdIs(metaId)
                             .and(placeNoIs(placeNo));
                 }
            
                 /**
                  * @param ids
                  * @return 특정 A.Id로 등록된 설정 조회
                  */
                 public static Predicate by(Iterable<A.Id> ids) {
                     BooleanBuilder builder = new BooleanBuilder();
            
                     for (A.Id id : ids) {
                         builder.or(by(id.getMetaId(), id.getPlaceNo()));
                     }
            
                     return builder;
                 }
             } 
-

    * 기존 Repository에서 findAllById() 재정의 및 커스텀 Repository extends 추가
    
    
             @Repository
             public interface ARepository extends JpaRepository<A, A.Id>, QuerydslPredicateExecutor<A>, ACustomRepository {
            
                 @Override
                 List<A> findAllById(Iterable<A.Id> ids);
            
             }
    


## 결과
* 결과
    * ![JPA Composite Primary Key의 IN 쿼리 서술 방식 변경을 통한 DB Optimizer의 인덱스 전략 튜닝 결과](/assets/images/post/JPA_Composite_Key_Tunning_Total_Result.png)


* 결과 이미지 
    * 쿼리 튜닝 전, Explain 결과
    * ![쿼리 튜닝 전, Explain 결과](/assets/images/post/JPA_Composite_Key_Tunning_Before.png)
    * 쿼리 튜닝 후, Explain 결과
    * ![쿼리 튜닝 후, Explain 결과](/assets/images/post/JPA_Composite_Key_Tunning_After.png)


## 마치며
* `DB Optimizer는 생각과 다르게 동작`하는 경우가 많다.. 항상 `Explain` 생활화를..
* 이번에도 APM 덕분에 문제 파악이 수월했다. APM 찬양  :) 
* `O(N)` 과 `O(logN)`은 하늘과 땅 차이의 성능이니 `알고리즘에 민감하게 반응하고 대응`해야 한다.
* FULL Scan 급으로 수 십 ms까지 튀던 쿼리가, 단 2ms 이내로 잡히는 걸 보면 더더욱 그렇다.