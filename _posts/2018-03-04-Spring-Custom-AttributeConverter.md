---
layout: post
cover: '/assets/images/cover9.jpg'
title: Spring Custom AttributeConverter
date: 2018-02-24 00:00:00
tags: Java Spring AttributeConverter
subclass: 'post tag-dev'
categories: 'pkgonan' 
navigation: True
---

## 목적
* Entity Attribute <-> Database Column 커스텀

## 상세
* JPA를 사용하여 서버를 개발하다 보면 Database에 저장된 값을 Java 프로그램 내부에서 특정 형태로 변환하여 사용하고 싶을 때가 있다.
* 예, Database에서 사용 가능한 요일을 1,2,3으로 표현하고 있지만 Java 프로그램 내부에서는 Enum Type으로 변경하여 MONDAY,TUESDAY,WEDNESDAY로 처리하고 싶을 경우.
* Database -> Entity
* Entity -> Database

## 인터페이스
      package javax.persistence;
      
      /**
       * A class that implements this interface can be used to convert
       * entity attribute state into database column representation
       * and back again.
       * Note that the X and Y types may be the same Java type.
       *
       * @param X the type of the entity attribute
       * @param Y the type of the database column
       *
       * @since Java Persistence 2.1
       */
      public interface AttributeConverter<X,Y> {
      	/**
      	 * Converts the value stored in the entity attribute into the
      	 * data representation to be stored in the database.
      	 *
      	 * @param attribute the entity attribute value to be converted
      	 * @return the converted data to be stored in the database column
      	 */
      	public Y convertToDatabaseColumn (X attribute);
      
      	/**
      	 * Converts the data stored in the database column into the
      	 * value to be stored in the entity attribute.
      	 * Note that it is the responsibility of the converter writer to
      	 * specify the correct dbData type for the corresponding column
      	 * for use by the JDBC driver: i.e., persistence providers are
      	 * not expected to do such type conversion.
      	 *
      	 * @param dbData the data from the database column to be converted
      	 * @return the converted value to be stored in the entity attribute
      	 */
      	public X convertToEntityAttribute (Y dbData);
      }


## 구현
* AttributeConverter를 implements 후 convertToDatabaseColumn와 convertToEntityAttribute 메소드를 Override해서 사용한다.
* 항상 적용되는 것을 원할 경우 @Converter(autoApply = true)를 사용한다.
     
      @Slf4j
      @Converter(autoApply = true)
      public class PayTypeConverter implements AttributeConverter<PayType, String> {
      
          @Override
          public String convertToDatabaseColumn(PayType payType) {
      
              if (isNull(payType)) {
                  return null;
              }
      
              return payType.getCode();
          }
      
          @Override
          public PayType convertToEntityAttribute(String code) {
      
              if (isNull(code)) {
                  return null;
              }
      
              try {
                  return PayType.fromCode(code);
              } catch (IllegalArgumentException e) {
                  AttributeConvertException ace = new AttributeConvertException(e);
                  log.error("failure to convert cause unexpected code [{}]", code, ace);
                  throw ace;
              }
          }
      }
      
## 활용
* 레거시 DB의 Column Type이 부적절(?) 할 경우, 서버 쪽에서 반드시 그것을 따를 필요가 없다고 생각한다.
* 서버 내부에서는 Enum Type이나 특정 형태로 Attribute를 관리하고 DB에 입출력을 할때 String 혹은 Long 형태로 변환하면 좀더 가독성 있는 코드를 만들 수 있을 것으로 보인다.
