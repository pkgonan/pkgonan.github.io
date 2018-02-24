---
layout: post
cover: '/assets/images/cover10.jpg'
title: Spring Custom Serializer 그리고 Deserializer
date: 2018-02-24 00:00:00
tags: Java Spring Custom Serializer Deserializer
subclass: 'post tag-dev'
categories: 'pkgonan' 
navigation: True
---

## 목적
* Object <-> JSON 커스텀

## 상세
* API 서버를 개발하다 보면 JSON Value를 전송하고 이를 커스텀하여 Object로 받아야 할 때가 있다.
그 반대로 Object를 커스텀하여 JSON Value로 바꿔 전송해야 할 때도 있다.
* Serializer = Object -> JSON Custom
* Deserializer = JSON -> Object Custom

## 구현
* StdSerializer를 extends 후 serialize() 메소드를 Override해서 사용한다.
*     @JsonComponent
      public class LongToStringSerializer extends StdSerializer<Long> {
        
          @Override
          public void serialize(Long val, JsonGenerator jsonGenerator, SerializerProvider serializerProvider) throws IOException {
              jsonGenerator.writeString(val.toString());
          }
      }
      
## 활용
* 서버 내부에서는 Set, Enum 등으로 String을 관리하고 외부에 노출 할때 String 혹은 Long 형태로 반환할 때 활용하면 좋을 것으로 보인다.
