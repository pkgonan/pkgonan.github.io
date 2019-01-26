# 개발 블로그

#### Server Developer로서 성장하며 겪었던 경험들을 공유하는 블로그 입니다.


환경 설정
1. Docker
- docker jekyll 이미지 다운로드
  ```bash
  docker pull jekyll/jekyll
  ```

- docker 이미지 다운로드 현황
  ```bash
  docker images
  ```


2. 실행
- MacOS / Linux
  ```bash
  docker run --rm --label=jekyll --volume=$(pwd):/srv/jekyll \
    -it -p $(docker-machine ip `docker-machine active`):4000:4000 \
      jekyll/jekyll jekyll serve
  ```
- Windows
  ```bash
  docker run --rm --label=jekyll --volume="$PWD":/srv/jekyll -it -p 4000:4000 jekyll/jekyll jekyll serve
  ```
  
  
3. 접속
```
    Server address: http://localhost:4000
```

