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
* HikariCP Gihub에서 눈을 씻고 찾아봐도 유휴 상태인 Connection을 갱신하는 기능이 보이지 않는다.
* 또한, Pool에 생존할 수 있는 기간인 max-lifetime 설정도 Database의 wait_timeout 설정보다 최소 30초 이상 짧게 줄 것을 권고한다.
* wait_timeout이 60초 일 경우, max-lifetime은 30초가 될텐데. 30초마다 몇 백개의 커넥션을 맺고 끊는 것을 반복한다면 DB 부하가 클 텐데?
* 자, HikariCP가 어떻게 동작하는지 알아보자.

## 분석
* HikariCP는 test-while-idle 설정이 있는가?
    * 없다. test-while-idle처럼 특정 기간마다 반복적으로 커넥션을 갱신하는 방식이 아니다.
    * 그렇다면 Pool안에 있는 Connection 갱신은 어떻게?
    * HikariCP는 아래와 같은 특정 타이밍에 Connection Validation Check를 수행.
        * 첫째, `커넥션을 DB에서 새로 맺을 때`
  
  
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
                 
                 
        * 둘째, `커넥션 풀에서 커넥션을 가져올때`


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


        * 셋째, `ConnectivityHealthCheck를 사용할 경우`
    
    
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
  
     
* Connection Pool의 Validation Check는 어떤 방식을 활용하여 수행될까?
    * connectionTestQuery관련하여 Github 문서를 참고해보면
    
        >If your driver supports JDBC4 we strongly recommend not setting this property. 
        This is for "legacy" drivers that do not support the JDBC4 Connection.isValid() API. 
        This is the query that will be executed just before a connection is given to you from the pool to validate that the connection to the database is still alive.
        Again, try running the pool without this property, HikariCP will log an error if your driver is not JDBC4 compliant to let you know. Default: none 
      
    * 기존에는 ConnectionTestQuery = SELECT 1 과 같은 방식을 사용하였다.
    * 만약 사용하고 있는 JDBC 드라이버가 Connection.isValid() 메소드를 @Override 하여 구현했다면  ConnectionTestQuery 사용하지 않는 것을 추천한다.
    * 아래와 같이 HikariCP 내부적으로 JDBC 구현체의 `Connection.isValid()` 를 호출한다.


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


* HikariCP의 `max-lifetime` 그리고 Database `wait_timeout` 설정의 상관관계
    * HikariCP는 max-lifetime를 wait_timeout 설정보다 최소 30초 이상 짧게 줄 것을 권고.
        * wait_timeout이 60초라면, max-lifetime은 30초가 될 것이다.
        * 여러대의 서버를 가지는 프로덕션 환경에서 30초마다 몇 백개의 커넥션이 끊어지고 재 생성되는 작업이 반복될텐데 크리티컬하게 작용하지 않을까?
            * DB 요청이 지속적으로 온다면, Pool에서 커넥션을 가져오며 `Connection.isValid()가 호출되며 커넥션 갱신`한다.
            * `따라서, 결론은 wait_timeout이 30초가 되더라도 문제가 없다`


                >This property controls the maximum lifetime of a connection in the pool.
                An in-use connection will never be retired, only when it is closed will it then be removed.
                On a connection-by-connection basis, minor negative attenuation is applied to avoid mass-extinction in the pool.
                We strongly recommend setting this value, and it should be at least 30 seconds less than any database or infrastructure imposed connection time limit.
                A value of 0 indicates no maximum lifetime (infinite lifetime), subject of course to the idleTimeout setting. 
                Default: 1800000 (30 minutes)


            * 하지만, db요청이 없을 경우 wait_timeout에 의해 이미 커넥션은 종료되었기에 커넥션 재연결을 실시 - 아래와 같은 로그 확인 가능

                >2018-04-22 14:00:58.126 DEBUG 1160 --- [nnection closer] com.zaxxer.hikari.pool.PoolBase          : hikariMasterPool - Closing connection org.mariadb.jdbc.MariaDbConnection@49769f2a: (connection is dead)
                2018-04-22 14:00:58.129 DEBUG 1160 --- [onnection adder] com.zaxxer.hikari.pool.HikariPool        : hikariMasterPool - Added connection org.mariadb.jdbc.MariaDbConnection@9ffc849



* HikariCP 성능 향상 기법
    * 첫째, `Connection recycle` 기법
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

    * 둘째, 동시에 한번에 여러개의 커넥션을 지우고 생성하는게 아니라 `시간 분포를 고르게하여 커넥션 생성 및 삭제로 가용 커넥션 부족 이슈를 방지`
        * negative attenuation 활용.
            
            >This property controls the maximum lifetime of a connection in the pool.
            An in-use connection will never be retired, only when it is closed will it then be removed.
            On a connection-by-connection basis, minor negative attenuation is applied to avoid mass-extinction in the pool.
            We strongly recommend setting this value, and it should be at least 30 seconds less than any database or infrastructure imposed connection time limit.
            A value of 0 indicates no maximum lifetime (infinite lifetime), subject of course to the idleTimeout setting.
            Default: 1800000 (30 minutes)

    * 셋째, `일정 간격으로 DataBase에 커넥션 생존 확인 요청을 보내지 않아 부하 감소`
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



## 결론
* 첫째, maxLifeTime 설정은, wait_timeout 보다 30초이상 짧게 주자.
* 둘째, maxLifeTime이 너무 짧아서 단 기간에 많은 커넥션이 반복적으로 재 생성될 것에 대해 걱정하지 않아도 된다.
* 셋째, HikariCP에 Connection test-while-idle에 대한 설정이 없는 것은, Tomcat DBCP와 Connection 갱신 방식이 다르기 때문이다.