---
layout: post
cover: '/assets/images/cover8.jpg'
title: InetAddress 클래스 사용으로 인한 성능 이슈, 나아가 AWS EC2 환경에서의 동작 방식 분석
date: 2018-06-17 00:00:00
tags: Java InetAddress getLocalHost AWS Beanstalk DNS
subclass: 'post tag-dev'
categories: 'pkgonan' 
navigation: True
---

## 목적
* IP & 도메인 로깅을 위해 InetAddress.getLocalHost() 사용으로 발생할 수 있는 성능 이슈, 나아가 AWS EC2 환경에서의 동작 방식 분석

## 배경
* 사내 타 프로덕트에서 라이브 중인 서버의 Latency가 급격하게 튀는 현상이 발생.
* 모든 Request마다 InetAddress.getLocalHost()를 사용하여 IP 주소를 로깅하고 있었음.
* InetAddress.getLocalHost()를 사용하면 DNS 서버를 통해 IP 정보를 가져올텐데 부하가 크지 않을까?
* 결론을 먼저 말한다면, API Call이 올때마다 InetAddress.getLocalHost()를 호출하게 되면 치명적인 성능 이슈를 초래한다. 
* 꼭 사용해야 한다면, 처음 서버 부팅시 static하게 정보를 받아 재 요청 없이 사용해야 할 것이다.
* 이제, 내부적으로 어떻게 동작하는지 알아보자.
* 나아가 AWS EC2 환경에서 InetAddress.getLocalHost()를 호출하면 어떤 흐름으로 동작하는지 분석해보자.

## 분석
* Java Code
    * InetAddress.java
* Native Code
    * Inet4AddressImpl.c
    * gethostbyname.c에서 gethostbyname_r() Method
    * res_search() Method


### InetAddress.getLocalHost() 사용으로 발생할 수 있는 성능 이슈는 무엇인가?
* 매 Request 마다 InetAddress.getLocalHost()를 사용한다면 현재 시스템에서 지정한 DNS 서버로 매번 요청을 보내게 된다.
* 따라서, 응답 시간이 느려질 수 밖에 없다.
* 또한, getLocalHost() 내부적으로 DNS 서버로부터 가져온 데이터를 5초간 캐싱하게 되는데 이때 Synchronized 블록을 사용하여 멀티 스레드 환경에서 병목현상이 발생하게 된다.
* 즉, 5초간 캐싱을 하기에 5초마다 레이턴시가 튀는 현상이 반복될 것이며, 동기화 블럭 및 반복적인 DNS 서버 요청으로 인해 성능이 크게 악화 될 것이다.


### getLocalHost() 내부는 어떻게 동작할까?

#### InetAddress.java 의 getLocalHost()



        public static InetAddress getLocalHost() throws UnknownHostException {
    
            ...
                String local = impl.getLocalHostName();
    
                ...
    
                InetAddress ret = null;
                synchronized (cacheLock) {
                    long now = System.currentTimeMillis();
                    if (cachedLocalHost != null) {
                        if ((now - cacheTime) < maxCacheTime) // Less than 5s old?
                            ret = cachedLocalHost;
                        else
                            cachedLocalHost = null;
                    }
    
                    ...
                    if (ret == null) {
                        InetAddress[] localAddrs;
                        try {
                            localAddrs = InetAddress.getAddressesFromNameService(local, null);
                        } catch (UnknownHostException uhe) {
                            ...
                        }
                        ...
                    }
                }
                ...
        }




> 여기서 눈여겨 볼 부분은 세가지이다.

> 첫째, impl.getLocalHostName()  -  native Code

> 둘째, InetAddress.getAddressesFromNameService(local, null)

> 셋째, maxCacheTime  -  현재 5초로 설정, 5초 이내는 DNS 서버에 요청 않고 캐시 사용


> getLocalHostName() 그리고 getAddressesFromNameService(local, null)에 대해서 좀더 살펴 보도록 하자.
  
  
#### 첫째, native로 구현된 getLocalHostName() 메소드를 분석해보자.

* [Inet4AddressImpl.c 구현체 참조](http://icedtea.classpath.org/~vanaltj/webrevs/tl/patch1/jdk/src/solaris/native/java/net/Inet4AddressImpl.c.html)



       * Inet4AddressImpl
       */
      
      /*
       * Class:     java_net_Inet4AddressImpl
       * Method:    getLocalHostName
       * Signature: ()Ljava/lang/String;
       */
      JNIEXPORT jstring JNICALL
      Java_java_net_Inet4AddressImpl_getLocalHostName(JNIEnv *env, jobject this) {
          char hostname[MAXHOSTNAMELEN+1];
      
          hostname[0] = '\0';
          if (JVM_GetHostName(hostname, MAXHOSTNAMELEN)) {
              /* Something went wrong, maybe networking is not setup? */
              strcpy(hostname, "localhost");
          } else {
      #ifdef __linux__
              /* On Linux gethostname() says "host.domain.sun.com".  On
               * Solaris gethostname() says "host", so extra work is needed.
               */
      #else
              /* Solaris doesn't want to give us a fully qualified domain name.
               * We do a reverse lookup to try and get one.  This works
               * if DNS occurs before NIS in /etc/resolv.conf, but fails
               * if NIS comes first (it still gets only a partial name).
               * We use thread-safe system calls.
               */
      #endif /* __linux__ */
              struct hostent res, res2, *hp;
              char buf[HENT_BUF_SIZE];
              char buf2[HENT_BUF_SIZE];
              int h_error=0;
      
      #ifdef __GLIBC__
              gethostbyname_r(hostname, &res, buf, sizeof(buf), &hp, &h_error);
      #else
              hp = gethostbyname_r(hostname, &res, buf, sizeof(buf), &h_error);
      #endif
      
              ... 생략
              
         }
         return (*env)->NewStringUTF(env, hostname);
     }
     
     
     
> 여기서 핵심은 gethostbyname_r() 메소드이다. 해당 메소드를 까보자.

* [gethostbyname_r() 메소드 구현체 참조](http://web.mit.edu/ghudson/sipb/pthreads/net/gethostbyname.c)



    
         struct hostent *gethostbyname_r(const char *hostname, struct hostent *result, char *buf, int bufsize, int *errval)
         {
        
             ... 생략
            
             /* Do the search. */
             n = res_search(hostname, C_IN, T_A, qbuf.buf, sizeof(qbuf));
             if (n >= 0)
                 return _res_parse_answer(&qbuf, n, 0, result, buf, bufsize, errval);
             else if (errno == ECONNREFUSED)
                 return file_find_name(hostname, result, buf, bufsize, errval);
             else
                 return NULL;
         }
         
         
         static struct hostent *file_find_name(const char *name, struct hostent *result,
         									  char *buf, int bufsize, int *errval)
         {
         	char **alias;
         	FILE *fp = NULL;
         
         	pthread_mutex_lock(&host_iterate_lock);
         	sethostent(0);
         	while ((result = gethostent_r(result, buf, bufsize, errval)) != NULL) {
         		/* Check the entry's name and aliases against the given name. */
         		if (strcasecmp(result->h_name, name) == 0)
         			break;
         		for (alias = result->h_aliases; *alias; alias++) {
         			if (strcasecmp(*alias, name) == 0)
         				break;
         		}
         	}
         	pthread_mutex_unlock(&host_iterate_lock);
         	if (!result && errno != ERANGE)
         		*errval = HOST_NOT_FOUND;
         	return result;
         }
        
    
    
    
> 여기서 핵심은 res_search() 메소드와 file_find_name() 메소드이다.
 
> res_search()는 etc/resolv.conf에 등록된 DNS 서버에 'www.naver.com'고 같은 주소로 요청을 보내 응답을 받는 메소드이다. [res_search()가 하는 일](https://linux.die.net/man/3/res_search)

> 즉, DNS 서버에 요청을 보내 정보를 가져오는데 하나도 가져 오지 못할 경우 file_find_name()이 실행된다.

> file_find_name()은 etc/hosts 에 저장된 로컬 호스트 테이블을 뒤지는 작업이다. 여기서 핵심은 gethostent_r() 메소드이다. [file_find_name()가 하는 일](https://nxmnpg.lemoda.net/ko/3/gethostent)

> 결론, 먼저 etc/resolv.conf에 등록된 DNS 서버를 찾아보고, 없으면 /etc/hosts에 등록된 로컬 호스트 테이블을 찾는다. 

> 즉, 무조건 DNS 서버에 요청을 보내게 되어 매우 비효율 적이다.



#### 둘째, InetAddress.getAddressesFromNameService(local, null)를 분석해보자.


    private static InetAddress[] getAddressesFromNameService(String host, InetAddress reqAddr) throws UnknownHostException
        {
            InetAddress[] addresses = null;
            boolean success = false;
            UnknownHostException ex = null;
    
            ... 생략
            
            if ((addresses = checkLookupTable(host)) == null) {
                try {
                    ... 생략
                    
                    for (NameService nameService : nameServices) {
                        try {
                            ... 생략
                            addresses = nameService.lookupAllHostAddr(host);
                            success = true;
                            break;
                        } catch (UnknownHostException uhe) {
                            ... 생략
                        }
                    }
    
                    ... 생략
                    
                    // Cache the address.
                    cacheAddresses(host, addresses, success);
    
                    ... 생략
    
                } finally {
                    updateLookupTable(host);
                }
            }
            return addresses;
        }
        
        
> 여기서 핵심은 native code로 구현된 nameService.lookupAllHostAddr(host) 메소드이다. 해당 메소드를 까보자.

* [lookupAllHostAddr() 메소드 구현체 참조](http://icedtea.classpath.org/~vanaltj/webrevs/tl/patch1/jdk/src/solaris/native/java/net/Inet4AddressImpl.c.html)



         /*
         * Find an internet address for a given hostname.  Note that this
         * code only works for addresses of type INET. The translation
         * of %d.%d.%d.%d to an address (int) occurs in java now, so the
         * String "host" shouldn't *ever* be a %d.%d.%d.%d string
         *
         * Class:     java_net_Inet4AddressImpl
         * Method:    lookupAllHostAddr
         * Signature: (Ljava/lang/String;)[[B
         */
          
         JNIEXPORT jobjectArray JNICALL
         Java_java_net_Inet4AddressImpl_lookupAllHostAddr(JNIEnv *env, jobject this,
                                                         jstring host) {
             const char *hostname;
             jobjectArray ret = 0;
             struct hostent res, *hp = 0;
             char buf[HENT_BUF_SIZE];
         
         
             ... 생략
         
         
             /* Try once, with our static buffer. */
         #ifdef __GLIBC__
             gethostbyname_r(hostname, &res, buf, sizeof(buf), &hp, &h_error);
         #else
             hp = gethostbyname_r(hostname, &res, buf, sizeof(buf), &h_error);
         #endif
         
         
             ... 생략

         }
     
     
     
> 여기서도 핵심은 위와 동일하게 getLocalHostName() 메소드이다.

> 즉 DNS 서버에 요청 후 응답으로 오는 값들이 호스트 주소, IP 주소 등 여러가지이기 때문에 동일하게 gethostbyname_r()를 재활용한다.

  
  
* 요약

* InetAddress로 IP, 도메인 주소 등을 동적으로 계속해서 가져오는 것은 성능에 치명적이다.
* DNS 서버에서 가져온 데이터의 내부 캐시는 5초간만 동작한다.
* InetAddress.getLocalHost()를 수행하면 먼저 etc/resolv.conf에 등록된 DNS 서버에 요청을 보낸다.
* 이후, 응답값이 없다면 etc/hosts에 저장된 로컬 호스트 테이블을 찾는다.
   


### 나아가 AWS EC2 인스턴스 환경에서 InetAddress를 사용한다면 어떻게 동작할까??

* 먼저 기본적인 동작은 위에서 설명한 것과 같다.
* DNS 서버에 요청, 그 결과가 없다면 로컬 호스트 테이블 참조로 동일하다.
* 그렇다면 차이점은 무엇일까??
* 첫째, etc/resolv.conf에 등록된 DNS 서버가 Amazon DNS인 AmazonProvidedDNS로 바뀐다.
* ![etc/resolv.conf에 자동으로 변경된 DNS 설정](/assets/images/post/InetAddress_resolv.conf.png)
* 둘째, etc/hosts에 자신의 private IP 주소가 등록된다. 
* ![etc/hosts에 자동으로 변경된 로컬 호스트 테이블 설정](/assets/images/post/InetAddress_hosts.png)
* 즉, AWS EC2 환경에서 InetAddress를 사용하면 Amazon DNS 서버로 요청이 전송되게 된다.


> 이는 모두 AWS에서 `DHCP 옵션 세트를 생성`하고 이를 이용하여 `VPC 환경을 생성`하고 `해당 VPC 환경으로 EC2 인스턴스를 생성`해야 가능하다.


* [DHCP OPTION 세트](https://docs.aws.amazon.com/ko_kr/AmazonVPC/latest/UserGuide/VPC_DHCP_Options.html#AmazonDNS)
* [DHCP OPTION 세트에 관한 글](https://holtstrom.com/michael/blog/post/401/Hostname-in-Amazon-Linux.html)



## 결론
* InetAddress를 처음 프로그램이 부팅시 static하게 한번만 저장하여 사용하지 않고, 반복적으로 수행할 경우 성능에 치명적이다. 알고 쓰자.
* 분석을 통해 성능에 안좋은건 알겠는데 왜? 어떻게 동작하길래 안좋은데? 라는 의문을 해소하게 되었다.