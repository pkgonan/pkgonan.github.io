---
layout: post
cover: '/assets/images/cover7.jpg'
title: HikariCP test-while-idle
date: 2018-04-22 00:00:00
tags: Java Spring Boot HikariCP test-while-idle max-lifetime
subclass: 'post tag-dev'
categories: 'pkgonan' 
navigation: True
---

## 목적
* HikariCP에는 Tomcat DBCP의 test-while-idle과 같은 커넥션 갱신 기능이 없을까?

## 배경
* Spring Boot 2.0을 기점으로 Default DBCP가 Tomcat DBCP -> HikariCP로 바뀌었다.
* HikariCP Gihub에서 눈을 씻고 찾아봐도 유휴 상태인 Connection을 갱신하는 기능이 기본 설정에 보이지 않는다.
* 또한, Pool에 생존할 수 있는 기간인 max-lifetime 설정도 Database의 wait_timeout 설정보다 최소 30초 이상 짧게 줄 것을 권고한다.
* wait_timeout이 60초 일 경우, max-lifetime은 30초가 될텐데. 30초마다 몇 백개의 커넥션을 맺고 끊는 것을 반복한다면 DB 부하가 클 텐데?
* 자, HikariCP가 어떻게 동작하는지 알아보자.

## 분석
* DBCP : HikariCP 3.1.0
* JDBC : MariaDB  2.2.3


### HikariCP는 test-while-idle 설정이 있는가?
* 있지만, 기본적으로 제공하지 않으며 추천하지 않는다. 
* HikariCP는 기본적으로 test-while-idle처럼 특정 기간마다 반복적으로 커넥션을 갱신하는 방식이 아니다.
* 그렇다면 Pool안에 있는 Connection 갱신은 어떻게?
* 갱신을 하지 않는다. 커넥션 생성 시간이 HikariCP에 설정한 max-lifetime값에 도달하면 가차 없이 종료 된다.
* 사실 [Dropwizard-HealthChecks](https://github.com/brettwooldridge/HikariCP/wiki/Dropwizard-HealthChecks)를 추가하면 커넥션 갱신을 할 수는 있지만 HikariCP 개발자가 커넥션 갱신 방식을 반대하므로 Dropwizard-HealthChecks를 사용하지 않는 것을 추천한다.
* HikariCP는 기본적으로 DBA가 설정한 wait_timeout을 존중하며, 그 설정을 위반하지 않는다.
* Database의 wait_timeout이 60초 일 경우로 예를 들어 보자.
* max-lifetime값은 네트워크 지연 등을 포함하여 2~3초간의 시간을 뺀 58초 정도로 설정, HikariCP의 ThreadLocal 내부에서 커넥션 유지 시간을 계산한다.
* Database와 의존 관계를 분리하였기에, 지속적으로 유효성을 체크하지 않아도 되며, 내부적으로 커넥션이 58초가 되었는지 계산하면 된다.
* 따라서, 매번 Connection.isValid()를 호출하지 않아도 되며 유효성 체크를 건너 뛰며 성능 향상을 발휘할 수 있다.
* <b>결론적으로 말하자면, 개발자가 지정한, max-lifetime만큼 커넥션을 유지하고, 종료되면 새로 커넥션을 생성하는 사이클이 반복되는 방식이다.
  
  
### HikariCP 개발자는 왜 test-while-idle을 반대할까?

* [커넥션 갱신 기능에 대한 질문 그리고 HikariCP 메인 개발자의 댓글 참조](https://github.com/brettwooldridge/HikariCP/issues/766)

    >HikariCP is opposed to idle connection testing.
    
    >It generates unnecessary queries to the database, defeats the database configured idle timeouts, takes away control from the network infrastructure team, and does not remove the need for test on borrow.

    >Having said that, it is generally not a great idea to keep individual database connections open for hours. Databases and drivers both track connections internally with sessions, and both have historically been sources of memory leaks. Allowing drivers and the database itself to release session-associated state periodically improves overall stability. HikariCP has a default maxLifetime of 30 minutes.
    
    >The cost of replacing a retired connection, due to exceeding idle or lifetime limits, is typically measured in double-digit milliseconds. If a maxLifetime of 30 minutes is considered, and a pool of 20 connections, you are looking at 20 events, several tens of milliseconds each, occurring in a span of 30 minutes, in the background. Finding a measurable impact on the application would be challenging.
    

* 보기 쉽게 구글 번역기를 돌려본다면

    HikariCP는 유휴 연결 테스트에 반대합니다. 데이터베이스에 대한 불필요한 쿼리를 생성하고, 유휴 시간 제한이 구성된 데이터베이스를 무효화하고, 네트워크 인프라 팀의 통제를 제거하고, 차용시 테스트의 필요성을 제거하지 않습니다.
    
    일반적으로 개별 데이터베이스 연결을 몇 시간 동안 열어 두는 것은 좋은 생각이 아닙니다. 데이터베이스와 드라이버는 내부적으로 세션과 연결을 추적하며, 둘 다 역사적으로 메모리 누수의 원인이었습니다. 드라이버와 데이터베이스 자체가 주기적으로 세션 관련 상태를 해제하도록 허용하면 전반적인 안정성이 향상됩니다. HikariCP의 기본 maxLifetime은 30 분입니다.
    
    유휴 또는 수명 제한을 초과하여 폐기 된 연결을 교체하는 데 드는 비용은 일반적으로 두 자릿수 밀리 초 단위로 측정됩니다. 30 분의 maxLifetime이 고려되고 20 개의 연결 풀이 있으면 백그라운드에서 20 분의 이벤트가 30 분의 간격으로 각각 수십 밀리 초씩 발생합니다. 응용 프로그램에 측정 가능한 영향을 찾는 것은 어려울 것입니다.

    
### HikariCP는 어떤 타이밍에 Connection Validation Check를 수행할까?

#### 첫째, `커넥션을 DB에서 새로 맺을 때`


     PoolBase.java
     
     /**
     * Setup a connection initial state.
     *
     * @param connection a Connection
     * @throws ConnectionSetupException thrown if any exception is encountered
     */
     private void setupConnection(final Connection connection) throws ConnectionSetupException
     {
       ... 생략
       
          checkDriverSupport(connection); -> Validation Check 수행
       
       ... 생략
     }
             
             
#### 둘째, `커넥션 풀에서 커넥션을 가져올때`


    HikariPool.java

    /**
    * Get a connection from the pool, or timeout after the specified number of milliseconds.
    *
    * @param hardTimeout the maximum time to wait for a connection from the pool
    * @return a java.sql.Connection instance
    * @throws SQLException thrown if a timeout occurs trying to obtain a connection
    */
    public Connection getConnection(final long hardTimeout) throws SQLException
    {
       ... 생략
      
            if (poolEntry.isMarkedEvicted() || (elapsedMillis(poolEntry.lastAccessed, now) > ALIVE_BYPASS_WINDOW_MS && !isConnectionAlive(poolEntry.connection))) {
          
            }
       ... 생략
    }


#### 셋째, `Dropwizard - ConnectivityHealthCheck를 사용할 경우`


    CodahaleHealthChecker.java
    
    /**
     * Provides Dropwizard HealthChecks.  Two health checks are provided:
     * <ul>
     *   <li>ConnectivityCheck</li>
     *   <li>Connection99Percent</li>
     * </ul>
     * The ConnectivityCheck will use the <code>connectionTimeout</code>, unless the health check property
     * <code>connectivityCheckTimeoutMs</code> is defined.  However, if either the <code>connectionTimeout</code>
     * or the <code>connectivityCheckTimeoutMs</code> is 0 (infinite), a timeout of 10 seconds will be used.
     * <p>
     * The Connection99Percent health check will only be registered if the health check property
     * <code>expected99thPercentileMs</code> is defined and greater than 0.
     *
     * @author Brett Wooldridge
     */
    public final class CodahaleHealthChecker
    {
       private static class ConnectivityHealthCheck extends HealthCheck
       {
          ... 생략
    
          /** {@inheritDoc} */
          @Override
          protected Result check() throws Exception
          {
             try (Connection connection = pool.getConnection(checkTimeoutMs)) {
                return Result.healthy();
             }
             catch (SQLException e) {
                return Result.unhealthy(e);
             }
          }
       }
    }
  
     
### Connection Pool의 Validation Check는 어떤 방식을 활용하여 수행될까?

#### connectionTestQuery관련하여 Github 문서를 참고해보면
    
    
    If your driver supports JDBC4 we strongly recommend not setting this property. 
    This is for "legacy" drivers that do not support the JDBC4 Connection.isValid() API. 
    This is the query that will be executed just before a connection is given to you from the pool to validate that the connection to the database is still alive.
    Again, try running the pool without this property, HikariCP will log an error if your driver is not JDBC4 compliant to let you know. Default: none 
  
  
> 기존에는 ConnectionTestQuery = SELECT 1 과 같은 방식을 사용하였다.
만약 사용하고 있는 JDBC 드라이버가 Connection.isValid() 메소드를 @Override 하여 구현했다면  ConnectionTestQuery 사용하지 않는 것을 추천한다.
아래와 같이 HikariCP 내부적으로 JDBC 구현체의 `Connection.isValid()` 를 호출한다.


        PoolBase.java
      
        boolean isConnectionAlive(final Connection connection)
        {
          ... 생략
    
                if (isUseJdbc4Validation) {
                   return connection.isValid(validationSeconds);
                }
    
           .. 생략
        }
      
        /**
        * Execute isValid() or connection test query.
        *
        * @param connection a Connection to check
        */
        private void checkDriverSupport(final Connection connection) throws SQLException
        {
            ... 생략
                if (isUseJdbc4Validation) {
                   connection.isValid(1);
                }
            ... 생략
        }


### HikariCP의 `max-lifetime` 그리고 Database `wait_timeout` 설정의 상관관계

> HikariCP는 네트워크 지연을 고려하여 max-lifetime를 wait_timeout 설정보다 2~3초 정도 짧게 줄 것을 권고한다.


* wait_timeout이 60초라면, max-lifetime은 58초가 될 것이다.
* 여러대의 서버를 가지는 프로덕션 환경에서 58초마다 수 많은 커넥션이 끊어지고 재 생성되는 작업이 반복될텐데 한번에 커넥션이 사라지면 크리티컬하게 작용하지 않을까?
    * 동시에 한번에 여러개의 커넥션을 지우고 생성하는게 아니라 `2.5%의 시간 변화를 주어, 커넥션 생성 및 삭제 시간의 분포를 고르게하여 가용 커넥션 부족 이슈를 방지`
    * `현재 사용중인 커넥션은 즉시 종료되지 않기에, 시간이 흐름에 따라 생성 및 삭제 시간이 고르게 퍼지게 된다`
    * negative attenuation 활용.
            
            
#### 2018-04-26 기준, `HikariCP 공식 문서는 max-lifetime을 Database의 wait-timeout 보다 최소 30초 이상 적게 줄 것을 권고하고 있지만 이는 잘못되었다.`            
    
    
>기존 문서

>This property controls the maximum lifetime of a connection in the pool.
An in-use connection will never be retired, only when it is closed will it then be removed.
On a connection-by-connection basis, minor negative attenuation is applied to avoid mass-extinction in the pool.
We strongly recommend setting this value, and it should be at least 30 seconds less than any database or infrastructure imposed connection time limit.
A value of 0 indicates no maximum lifetime (infinite lifetime), subject of course to the idleTimeout setting.
Default: 1800000 (30 minutes)


* [max-lifetime과 Database wait_timeout을 왜 30초 이상 짧게 권고하는지 질문](https://github.com/brettwooldridge/HikariCP/issues/709#issuecomment-384252344)하였고, HikariCP 개발자에게 답변 받음


* 질문
![질문](/assets/images/post/hikari_question.png)


* 질문 요약
    * Database wait_timeout이 60초인데, 당신은 30초의 여유를 줄 것을 추천하고 있다.
    * maxLifeTime을 30초로 주면 30초마다 대량의 커넥션 종료로 인해 부하가 크지 않을까?
    
    
* 답변
![답변](/assets/images/post/hikari_answer.png)



* 질문2
![질문2](/assets/images/post/hikari_question2.png)


* 답변2
![답변2](/assets/images/post/hikari_answer2.png)


* 답변 요약
    * max_lifetime을 Database의 wait_timeout보다 30초 이상 짧게 주라는 것은 잘못 되었다. 공식 문서 업데이트를 진행하지 않은 것이다.
    * HikariCP는 DBA를 존중하기 때문에 DBA가 설정한 wait_timeout을 지킨다.
    * HikariCP는 커넥션 풀을 관리하기 위해 HouseKeeper라는 Thread가 30초마다 돌고 있다.
    * HouseKeeper가 30초마다 돌며 커넥션을 종료하였기에, 이전 29.xx초까지의 커넥션들에 대해 유효성 체크가 누락될 수 있어서 30초의 여유를 준 것이다.
    * 현재 방식은, ThreadLocal에서 각각 타이머를 통해 max-lifetime에 도달했는지 체크를 하는 방식으로 변경되었다.
    * `따라서, max-lifetime은 네트워크 통신 등을 감안해서 Database의 wait_timeout으로 부터 2~3초 정도 짧게 주면 된다.`
    * `커넥션이 사용중일 경우 즉시 종료를 하지 않기에 커넥션이 매우 바쁜 상황을 감안해서 여유있게 준다면 wait_timeout으로 부터 5초정도까지 짧게 주면 된다는 개발자의 추가 답변.`
    



### HikariCP 성능 향상 기법

#### 첫째, `Connection recycle` 기법

* 커넥션을 재활용하여 성능 개선


        HikariPool.java
      
        /**
        * Recycle PoolEntry (add back to the pool)
        *
        * @param poolEntry the PoolEntry to recycle
        */
        @Override
        void recycle(final PoolEntry poolEntry)
        {
          metricsTracker.recordConnectionUsage(poolEntry);
          connectionBag.requite(poolEntry);
        }


        PoolEntry.java

        /**
        * Release this entry back to the pool.
        *
        * @param lastAccessed last access time-stamp
        */
        void recycle(final long lastAccessed)
        {
          if (connection != null) {
             this.lastAccessed = lastAccessed;
             hikariPool.recycle(this);
          }
        }


#### 둘째, `일정 간격으로 DataBase에 커넥션 생존 확인 요청을 보내지 않아 부하 감소`

* test-while-idle과 같이 지속적으로 생존 여부를 확인해야 할 필요가 없다.
* `1000ms 이내에 연결이 사용되었다면, Connection 유효성 체크를 무시한다`
* [HikariCP 메인 개발자의 댓글 참조](https://github.com/brettwooldridge/HikariCP/issues/311)

    >Let’s discuss.

    >Unless you’ve studied the internals of HikariCP you may not know it, but under load HikariCP mostly bypasses the connection validation check. If a connection has been used within the last 1000ms, HikariCP will bypass the validation check automatically in getConnection().

    >If connections are being used less frequently than that, it indicates one of two things: 

    >The application is simply not that active in terms of transactions/sec, or
    >The pool is sized too large for the application, such that connections frequently sit in the pool unused for more than 1000ms before being reused
    >Having said that, with JDBC4 capable drivers, the cost of validation has largely dropped to sub-millisecond or single digit milliseconds. Wherever possible, validation queries should be avoided, allowing HikariCP to use Connection.isValid() instead.

    >Lastly, if there truly are use-cases where speed is paramount (over reliability) and yet transaction rates are very low, there are several alternative pools such as C3P0 available. We tend to think that either those use-cases are extremely rare, or can be effectively dealt with through driver and pool settings in their current form.`


* 요약한다면.

    HikariCP는 대부분 연결 유효성 체크를 건너 뛴다. 마지막 1000ms 이내에 연결이 사용 되었다면, HikariCP는 getConnection ()에서 유효성 검사를 자동으로 무시한다.
    유효성 검사를 일정 시간마다 따박따박 하는게 성능 측면에서 비효율적이라 건너 뛰는 것으로 보인다.
    SELECT 1과 같이 유효성 검사 쿼리를 직접 날리는 것보다 JDBC4를 지원한다면 Connection.isValid()가 호출되는게 성능 측면에서 더 효과적이다.
    JDBC 구현체마다 다르지만 쿼리를 날리지 않고 Ping을 날리는 등으로 성능을 개선한다.



## 결론
* 첫째, HikariCP가 test-while-idle이 없는 것은 커넥션을 계속 들고 있는 방식이 아니기 때문.
* 둘째, 사실 억지로 한다면 [Dropwizard-HealthChecks](https://github.com/brettwooldridge/HikariCP/wiki/Dropwizard-HealthChecks)를 추가하여 test-while-idle를 쓸 수는 있다. 하지만 HikariCP 개발자가 반대하는 방식이기에 추천하지 않는다.
* 셋째, 기본적으로 DBA가 설정한 wait_timeout을 존중하며, 그 설정을 위반하지 않는다.
* 넷째, maxLifeTime 설정은, wait_timeout 보다 2~3초 짧게 주자. 좀더 여유있게 준다면 5초 정도 짧게 주면 된다.
* 다섯째, maxLifeTime을 무제한으로 한다고 0으로 주게 될 경우, Dead Connection을 참조하는 문제가 발생할 수 있다.
* 여섯째, 다량의 커넥션이 한번에 종료되며 발생할 수 있는, 가용 커넥션 부족 이슈에 대해 걱정하지 않아도 된다.