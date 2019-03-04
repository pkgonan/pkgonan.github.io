---
layout: post
cover: '/assets/images/cover2.jpg'
title: Hazelcast를 구현체로 Hibernate Second Level Cache 적용하여 성능 튜닝 후 Trouble Shooting
date: 2019-03-01 00:00:00
tags: Java AWS Beanstalk Hazelcast Hibernate Second-Level-Cache Tuning Trouble-Shooting
subclass: 'post tag-dev'
categories: 'pkgonan' 
navigation: True
---

## 목적
* [Hazelcast를 구현체로 Hibernate Second Level Cache를 적용하여 성능 튜닝](https://pkgonan.github.io/2018/10/hazelcast-hibernate-second-level-cache) 이후 발생했던 Eventually Consistency로 인한 데이터 불일치 이슈의 해결.


## 배경
* [이전 글](https://pkgonan.github.io/2018/10/hazelcast-hibernate-second-level-cache)에서, API 성능을 극대화 하기 위해 Local Cache 전략을 사용하였습니다.
* Local Cache의 단점은, Cache의 상태가 변경 되었을 때 변경 사항을 다른 인스턴스가 모른다는게 가장 큰 단점입니다.
* 따라서, 이러한 단점을 극복하고 장점인 성능을 취하기 위해 Hazelcast가 제공하는 Cache Eviction Message를 다른 인스턴스에 Propagation하는 전략을 사용하게 되었습니다.
* 그런데 만약, `Cache Eviction Message가 전파되기도 전에 다른 수정 요청이 인입된다면 어떤 문제가 발생할까요 ?`
* 동시성 문제로 인해 의도하지 않는 결과가 발생할 수 있습니다.
* N대의 서버를 기준으로 Cache Eviction Message가 전파되는 방식은 아래와 같습니다.
* ![예시](/assets/images/post/Hazelcast_Local_Map_Invalidation.png)
* 아래의 이미지를 기준으로 예를 들어 동시성 문제를 설명해보겠습니다.
* ![예시](/assets/images/post/Hazelcast_Local_Cache_Eviction_Propagation_Strategy.png)
* DB Table에는 1,2,3이 들어 있는 Set이 저장되어 있으며, 2대의 서버에는 각각 이를 Cache 하고 있습니다.
* 먼저, 좌측 서버에 Entity에서 2,3을 제거한 값을 저장하라는 요청 인입됩니다.
* 좌측 서버는 캐시 사용 중, 따라서 캐시된 Entity를 가져오며, Entity에서 2,3을 제거한 결과를 DB 저장합니다.
* 그리고, 데이터가 변경되었다는 이벤트를 우측 서버에 Publish 합니다.
* 이벤트가 우측 서버에 도착하기 전에, 우측 서버에 Entity에서 4,5를 추가한 값을 저장하라는 요청이 인입됩니다.
* 우측 서버는 캐시 사용 중, 따라서 캐시된 Entity를 가져오며, Entity에서 4,5를 추가한 결과를 DB 저장합니다.
* `그런데 이때, 우측 서버는 아직 데이터가 변경되었다는 이벤트를 받지 못한 상황입니다.`
* `따라서, 캐시를 깨지 않은 상황이기에 캐시된 Entity를 가져오게 되면 2,3이 제거되지 않은 1,2,3을 가져오게 됩니다.`
* 따라서, 4,5를 추가하여 DB에 저장하게 되면 DB에는 1,2,3,4,5가 저장되게 됩니다.
* `기대했던 결과는 1,4,5가 DB에 저장되기를 바랬는데, 의도와 다르게 실제로는 1,2,3,4,5가 DB에 저장되어버립니다.`
* 이러한 동시성 문제를 어떤 방식을 사용하여 해결하였는지 공유합니다.


## 환경
* JAVA 8
* Spring Boot 2.x
* Spring Data JPA 2.x
* Hibernate 5.2.x
* QueryDSL 4.2.x
* Hazelcast 3.11.x
* hazelcast-hibernate52 1.3.x
* AWS Elastic Beanstalk


## 해결 방안
* Cache Concurrency Strategy
* Query Hint를 통한 Cache Ignore


## 해결 방안과 관련된 중요한 키워드
* Local Cache
* Cache Eviction Propagation
* IMDG
* Lock
* Cache Concurrency Strategy
* Strong Consistency
* Eventually Consistency


## 해결 방안의 분석
* Cache Concurrency Strategy 변경
    * Hibernate와 연동하여 Hazelcast를 사용중입니다.
    * 따라서, hazelcast-hibernate 오픈 소스의 구현체를 분석 대상으로 잡았습니다.
    * Local Cache로 hazelcast-hibernate를 사용할 경우 Cache 구현체로 LocalRegionCache.java를 사용합니다.
    * Local Cache를 사용중이기에 LocalRegionCache.java에서 lock & unlock 구현을 살펴보았습니다.
    * Hibernate에서 제공하는 Cache Concurrency Strategy (NONE, READ_ONLY, NONSTRICT_READ_WRITE, READ_WRITE, TRANSACTIONAL)
    * `결론은, hazelcast-hibernate Local Cache 구현체에는 Concurrency 전략 별 lock이 구현되어 있지 않았습니다.`
    * `따라서 Local Cache에서 Cache Concurrency Strategy 변경을 통해 동시성 이슈를 해결하는 것은 불가능하였습니다.`
    * 구현이 되어 있어도, READ_WRITE 전략의 경우 Lock이 해제될까지 읽을 수 없기에 대용량 트래픽 환경에서는 성능 저하 및 장애가 발생할 수 있습니다.
    * `따라서, Cache Concurrency Strategy 전략은 적절하지 않다고 판단하였습니다.`
    
    
        LocalRegionCache.java
        
           @Override
           public SoftLock tryLock(final Object key, final Object version) {
               ExpiryMarker marker;
               String markerId = nextMarkerId();
               while (true) {
                   final Expirable original = cache.get(key);
                   long timeout = nextTimestamp() + CacheEnvironment.getDefaultCacheTimeoutInMillis();
                   if (original == null) {
                       marker = new ExpiryMarker(version, timeout, markerId);
                       if (cache.putIfAbsent(key, marker) == null) {
                           break;
                       }
                   } else {
                       marker = original.markForExpiration(timeout, markerId);
                       if (cache.replace(key, original, marker)) {
                           break;
                       }
                   }
               }
               return new MarkerWrapper(marker);
           }
        
           @Override
           public void unlock(final Object key, final SoftLock lock) {
               while (true) {
                   final Expirable original = cache.get(key);
                   if (original != null) {
                       if (!(lock instanceof MarkerWrapper)) {
                           break;
                       }
                       final ExpiryMarker unwrappedMarker = ((MarkerWrapper) lock).getMarker();
                       if (original.matches(unwrappedMarker)) {
                           final Expirable revised = ((ExpiryMarker) original).expire(nextTimestamp());
                           if (cache.replace(key, original, revised)) {
                               break;
                           }
                       } else if (original.getValue() != null) {
                           if (cache.remove(key, original)) {
                               break;
                           }
                       } else {
                           break;
                       }
                   } else {
                       break;
                   }
               }
               maybeNotifyTopic(key, null, null);
           }


* 번외, IDMG에서의 Cache Concurrent Strategy 변경으로 동시성 이슈 해결
    * N개의 Instance가 JVM을 공유하는 IDMG로 사용할 경우 Cache Concurrency Strategy 별 동시성 컨트롤이 될까?
    * Local Cache가 아닌 IMDG로 쓸 경우 hazelcast-hibernate에서는 IMapRegionCache.java를 Cache 구현체로 사용합니다.
    * `결론은, Cache Concurrent Strategy 별 lock을 차등적으로 적용하여 구현하고 있었습니다.`
    * `따라서, IMDG에서는 Cache Concurrent Strategy 변경으로 동시성 이슈 해결이 가능합니다. 하지만 Lock으로 인해 성능이 좋지 않습니다.`
    * Key를 기준으로, Partition ID를 구해서 어떤 인스턴스에 요청을 보내 Lock/Unlock을 할지 정하고 해당 인스턴스에 요청을 보내도록 구현되어있었습니다.
    * Cache Concurrent Strategy는 다른 클래스에서 공통적으로 구현되어 있으며 핵심은 tryLock, unlock에서 실제 lock, unlock을 구현하는지 여부입니다.
    * IMDG에서도 대용량 트래픽 환경일 경우에는 Cache Concurrency Strategy를 READ_WRITE로 설정할 경우 Lock으로 인해 성능 저하 및 장애 가능성이 있습니다.
    

        IMapRegionCache.java
        
           @Override
           public SoftLock tryLock(final Object key, final Object version) {
               long timeout = nextTimestamp(hazelcastInstance) + lockTimeout;
               final ExpiryMarker marker = (ExpiryMarker) map.executeOnKey(key,
                       new LockEntryProcessor(nextMarkerId(), timeout, version));
               return new MarkerWrapper(marker);
           }
        
           @Override
           public void unlock(final Object key, final SoftLock lock) {
               if (lock instanceof MarkerWrapper) {
                   final ExpiryMarker unwrappedMarker = ((MarkerWrapper) lock).getMarker();
                   map.executeOnKey(key, new UnlockEntryProcessor(unwrappedMarker, nextMarkerId(),
                           nextTimestamp(hazelcastInstance)));
               }
           }
           

* Query Hint를 통한 Cache Ignore 기법
    * Hibernate Second Level Cache 사용시 기본적으로 캐시를 사용하여 데이터를 가져오고 없으면 DB에 접근하여 가져오게 됩니다.
    * Query Hint를 사용하게 되면, 데이터를 Cache에서 참조할지, DB에서 참조해서 가져올지를 선택할 수 있습니다.
    * `애초에 Local Cache + Eviction Message Propagation 전략을 선택했다는 점에서 Strong Consistency가 아닌 Eventually Consistency를 제공하는 것을 의미합니다.`
    * 대부분의 트래픽이 `조회`이기에 Eventually Consistency는 문제 되지 않기 때문이죠.
    * 하지만, `변경` 요청이 빠르게 여러번 들어올 경우에는 Eventually Consistency는 취약합니다.
    * `따라서, 변경 API에 대해서는 Query Hint를 통해 Cache를 사용하지 않고 DB를 직접 바라보도록 메소드를 제공하여 이를 해결할 수 있었습니다.`
    * 이러한 방식은 Lock을 걸지 않기에 대용량 트래픽 환경에서 성능 저하 및 Lock으로 인한 장애가 발생하지 않습니다.
    * 아래는 Spring-Data-Jpa 환경에서 구현한 소스코드 예시입니다.
    
    
            @Repository
            public interface TestRepository extends JpaRepository<Test, Long>, TestCustomRepository {
            
            }
            
            
            
            interface TestCustomRepository {
            
                Optional<Test> findByIdIgnoreCache(long id);
            }
            
            
            
            class TestRepositoryImpl implements TestCustomRepository {
            
                @Autowired
                private EntityManager entityManager;
            
                @Autowired
                private TestRepository testRepository;
            
            
                /**
                 * findAllById Second Level Cache Ignore 적용
                 * 데이터를 가져올 때는 DB 참조
                 * 데이터를 가져온 후에는 Cache Update
                 **/
                @Override
                public Optional<Test> findByIdIgnoreCache(long id) {
                    Map<String, Object> properties = Maps.newHashMap();
                    properties.put("javax.persistence.cache.retrieveMode", CacheRetrieveMode.BYPASS);
                    properties.put("javax.persistence.cache.storeMode", CacheStoreMode.REFRESH);
            
                    return Optional.ofNullable(entityManager.find(Test.class, id, properties));
                }
            }


## 결론
* Cache Concurrency Strategy는 `부적합`
    * Local Cache 구현체([hazelcast-hibernate](https://github.com/hazelcast/hazelcast-hibernate5))에서는 Cache Concurrency Strategy 별 Lock이 구현되어 있지 않음
* Query Hint를 통한 Cache Ignore는 `적합`
    * Cache가 아닌 원본 데이터인 DB를 참조하여 Local Cache와 Local Cache 간의 동시성 이슈 해결(정확하게는 회피)
    * Lock을 사용하지 않아 대용량 트래픽 환경에서 성능 저하 없음
        

## 마치며
* Redis 같은 Write Endpoint가 한 곳인 Cache는 Cache Eviction Propagation Timing에 대해서는 크게 고려하지 않아도 된다.
* 위와 같은 Local Cache + Cache Eviction Propagation 전략을 사용할 경우에는 Eventually Consistency에 대해 반드시 고려해야 할 것이다.
* Strong Consistency & Eventually Consistency에 대해 다시 한번 생각해보는 좋은 계기가 된것 같다.
* 그리고 분산 환경에서의 동시성 전략에 대해서도 고민해보는 좋은 시간이 되었던 것 같다.


## 관련 Post
* [Hazelcast를 구현체로 Hibernate Second Level Cache를 적용하여 API 성능 튜닝하기](https://pkgonan.github.io/2018/10/hazelcast-hibernate-second-level-cache)

