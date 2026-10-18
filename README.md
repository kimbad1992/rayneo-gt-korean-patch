# RayNeo GT 한국어 패치

**비공식 · v2.0.0-beta.1 · 원본 펌웨어 별도 준비**

GT의 기존 언어를 유지하면서 한국어 항목과 한국어 메뉴를 추가합니다.
이 저장소와 Release에는 원본/완성 펌웨어, 추출된 원본 이미지, RayNeo 업데이터 JavaScript, 폰트 파일을 포함하지 않습니다.
사용자가 준비한 정확한 공식 원본 ZIP에 변경분을 적용하고, 결과를 브라우저 메모리에서 GT로 전송합니다.

**한국어 패치 펌웨어를 실제 RayNeo GT(Gemini1)에 설치했고, 재부팅 후 정상 동작과 업데이트 적용을 확인했습니다.** 실제 설치에는 **약 28분으로, 30분 가까이** 걸렸습니다.
이 확인은 이전 설치기로 동일한 패치 결과를 설치한 GT 한 대에 대한 사용자 실기기 확인입니다. 공개판에서 새로 작성한 USB 전송 코드 자체는 모의 장치 검증을 마친 베타이며, 실기기 설치는 별도로 검증하지 않았습니다. GT Max도 실기기 검증하지 않았습니다.

## 설치

준비물: Windows, Python 3.8 이상, 최신 데스크톱 Chrome, 데이터 전송이 가능한 USB 케이블.

1. [Releases](../../releases)에서 `RayNeo_GT_Korean_Patch_v2.0.0-beta.1.zip`을 받아 새 폴더에 **전체 압축 해제**합니다.
2. [RayNeo 공식 업데이트 사이트](https://ota.rayneo.com/)에서 지원 버전을 확인합니다. 이 패치는 [공식 서버의 20260922 원본 ZIP](https://file-tdp-ffalcon-asia-o.api.leiniao.com/res/7142cd8f/thirdapk_5e0d34331c71a20ea4ba8826cea0c1a2.zip)만 지원합니다. 원본은 배포자가 재호스팅하지 않습니다. 링크가 없어지거나 다른 버전이면 설치기가 거부합니다.
3. `Start.cmd`를 실행합니다. Chrome이 열리지 않으면 표시된 `http://127.0.0.1:포트/` 주소를 Chrome에서 엽니다.
4. **공식 원본 ZIP 선택**을 누릅니다. 브라우저에서 원본과 패치를 검증하고 한국어 펌웨어를 준비합니다. ZIP을 풀거나 수정하지 마세요.
5. GT 한 대를 PC에 USB 데이터 케이블로 직접 연결합니다. HDMI 변환 젠더를 사용하지 않습니다. 다른 RayNeo 앱과 공식 업데이트 창은 닫습니다.
6. **GT 정보 연결 → 업데이트 모드 전환 → 업데이트 기기 연결 → 선택한 펌웨어 설치** 순서로 진행합니다.
7. **실제 설치에 30분 가까이 걸린 사례가 있습니다.** 설치 탭을 화면에 띄워 두고 케이블과 서버 창을 유지합니다. 진행률이 천천히 오를 수 있으므로 새로고침하거나 연결을 끊지 마세요. 아래 실기기 기록을 참고하되, 환경에 따라 소요 시간은 달라질 수 있습니다.
8. 마지막 전송 뒤 기기가 재부팅하며 USB 연결이 해제될 수 있습니다. **재부팅 확인 대기**가 나오면 화면이 돌아온 뒤 **재부팅 확인**을 눌러 정상 모드와 버전 `20260922`를 확인합니다. 이 버튼은 정보만 읽습니다. 언어 메뉴에서 한국어 표시도 직접 확인하세요.

이미 이전 한글판을 설치했다면 이 설치기를 쓰기 위해 다시 설치할 필요는 없습니다. 생성되는 두 DFU 파일은 이전 한국어 추가 v1과 동일합니다.

## 실제 장치 설치 결과와 소요 시간

2026년 10월 17일, 기존 버전 `20260723`인 GT(Gemini1)에 한국어 패치 펌웨어를 설치했습니다. 실제 로그의 소요 시간은 다음과 같습니다.

| 단계 | 기록 시각 | 소요 시간 |
| --- | --- | --- |
| 메뉴 이미지(OSD) 전송 및 완료 응답 | 22:00:01 → 22:26:46 | 26분 45초 |
| 본체 펌웨어 전송 후 재부팅에 따른 연결 해제 | 22:26:46 → 22:27:55 | 1분 9초 |
| 설치 시작부터 마지막 전송 후 연결 해제까지 | 22:00:01 → 22:27:55 | **27분 54초** |

기기는 업데이트 후 USB 연결을 해제하고 다시 연결되었으며, 사용자가 이후 **정상 부팅과 업데이트 적용을 직접 확인했습니다.** 당시 설치기는 재부팅으로 사라진 업데이트 장치의 마지막 응답을 읽으려다 연결 해제 오류를 표시했지만, 실제 업데이트는 적용되었습니다. 현재 설치기는 이 상황을 ‘재부팅 확인 대기’로 구분합니다.

위 시간은 한 대의 실측 사례이며 모든 환경의 예상 완료 시간은 아닙니다. 연결 해제 시각까지의 로그이므로, 이후 화면이 돌아와 정상 동작을 확인하는 데 걸린 시간은 포함하지 않습니다.

## 원본 복구와 오류

같은 공식 ZIP을 선택한 뒤 **원본 복구 준비**를 누르면 패치하지 않은 원본을 준비합니다. 장치가 USB 업데이트 모드로 인식될 때만 전송할 수 있습니다. 연결되지 않는 기기의 복구 도구는 아닙니다.

전송 중 끊김, 부분 전송, 기기 오류는 중단됩니다. 자동으로 재시도하지 않습니다.
재부팅 확인 대기는 OSD의 완료 응답을 받은 뒤 마지막 펌웨어 종료 블록까지 전송하고, 그 직후 연결이 해제된 경우에만 표시합니다. 연결 해제만으로 설치 성공을 확정하지 않습니다.

## 배포 내용과 권리

- 설치기 소스 및 COPY/ADD 패치 2개만 배포합니다. 패치만으로 원본을 대체할 수 없습니다.
- 기존 원본 바이트는 사용자 원본에서 읽고, 패치의 변경 바이트와 결합합니다. 원본 ZIP, DFU, 완성 펌웨어, 원본 이미지 파일은 Git과 Release에서 제외합니다.
- USB/ZIP 처리 코드는 이 프로젝트에서 작성했으며 RayNeo 웹사이트의 JavaScript를 포함하거나 실행하지 않습니다.
- 패치에는 번역된 메뉴 그래픽의 변경분이 포함됩니다. Windows 폰트 파일이나 재사용 가능한 글꼴 데이터를 배포하지 않습니다.
- RayNeo의 공식 프로젝트나 승인된 배포가 아닙니다. 패치 배포가 모든 지역에서 자동으로 허용되거나 저작권 문제가 없다고 보장하지 않습니다. 원본에 관한 권리는 해당 권리자에게 있습니다. 자세한 범위는 [NOTICE.md](NOTICE.md)를 확인하세요.

공식 파일을 내려받는 링크를 직접 누르는 경우를 제외하면 설치기는 외부 서버에 접속하지 않습니다. 선택한 원본과 생성된 펌웨어는 브라우저 안에서 처리하며 서버에 업로드하지 않습니다.

## 검증과 개발

공식 입력 ZIP의 SHA-256:

```text
d5ecaf7ad5ae587ffe4c4b31af7a3d8eb96e6c7cd6ff56af14b6481a86e2da4d
```

각 DFU와 패치의 입력/출력 해시는 [`web/package-data.js`](web/package-data.js)에 고정되어 있습니다. 패치 적용 직후와 설치 직전에 최종 파일 해시를 확인합니다.

Node.js 22 이상으로 실제 원본을 로컬에서 검증할 수 있습니다. 테스트는 물리 장치에 접근하지 않습니다.

```text
node tests/core.test.mjs /path/to/official-20260922.zip
node --test tests/dfu-descriptor.test.mjs
```

브라우저 검사는 별도 개발 환경에 Playwright와 Chrome이 필요합니다. `PLAYWRIGHT_MODULE` 환경 변수로 Playwright 경로를 지정할 수 있습니다. Python 명령은 `PYTHON` 환경 변수로 지정할 수 있습니다.

```text
node tests/browser.test.cjs /path/to/official-20260922.zip
python tools/package_release.py
```

`tests/*result.json`은 모의 장치 결과입니다. 실기기 검증과 구분됩니다.
패치 형식과 생성기는 [`tools/make_patch.py`](tools/make_patch.py)에 있습니다. 입력 펌웨어는 저장소에 추가하지 마세요.

## English

Unofficial Korean localization patch for the exact RayNeo GT global firmware dated 20260922. Download the vendor's original ZIP yourself, start the localhost installer, and select that ZIP. The browser verifies the input, applies the bundled deltas locally, and verifies the resulting images before any device write. No original or prepatched firmware is distributed.

**The patched firmware was installed on a real RayNeo GT (Gemini1), and the user confirmed successful boot and that the update had been applied. Installation took nearly 30 minutes:** 26 minutes 45 seconds for OSD, then 1 minute 9 seconds for firmware, totaling 27 minutes 54 seconds from installation start to the reboot-related USB disconnect. Subsequent boot confirmation time is not included. This was one device using the previous private installer with identical patched images; times may vary. The public installer's newly written USB implementation remains beta and has only been tested with simulated devices. See NOTICE.md for third-party rights and licensing scope.
