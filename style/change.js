/* ==========================================================
   Hero Background Rotator (self-contained, base-agnostic)
   - 필요 CSS를 JS가 직접 주입(외부 CSS 의존 X)
   - 이미지 경로를 현재 페이지 디렉토리 기준으로 안전 해석
   - 초기 레이어를 inline 스타일로 표시해 "흰 화면" 원천 차단
   ========================================================== */
(function () {
  console.log('[change.js] file loaded');

  // 1) 안전한 DOM ready
  const onReady = (fn) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  };

  // 2) 현재 페이지 디렉토리 경로 계산( base 태그 영향 안 받는 버전 )
  function getCurrentDirHref() {
    // 예) http://127.0.0.1:5500/site/index.html  -> http://127.0.0.1:5500/site/
    const url = new URL(window.location.href);
    url.pathname = url.pathname.replace(/[^/]*$/, '');
    url.search = '';
    url.hash = '';
    return url.href;
  }

  // 3) 경로 해석기( base 유무와 무관하게 "현재 페이지 디렉토리" 기준으로 만듦 )
  function resolveFromPageDir(relPath) {
    try {
      return new URL(relPath, getCurrentDirHref()).toString();
    } catch {
      // 혹시 모를 예외시 그냥 원문 반환
      return relPath;
    }
  }

  // 4) 필요 CSS를 직접 주입(외부 CSS 미적용이어도 동작)
  function ensureInlineCSS() {
    if (document.getElementById('hero-rotator-inline')) return;
    const css = `
      .hero{ position:relative; min-height:250px; }
      .hero .layer{
        position:absolute; inset:0;
        background-position:center; background-size:cover; background-repeat:no-repeat;
        opacity:0; transition:opacity .9s ease; z-index:0;
      }
      .hero .layer.show{ opacity:1; }
      .hero > *{ position:relative; z-index:2; }
      .hero .scrim{ z-index:1; }
    `.replace(/\s+/g,' ');
    const style = document.createElement('style');
    style.id = 'hero-rotator-inline';
    style.textContent = css;
    document.head.appendChild(style);
  }

  onReady(() => {
    const hero = document.querySelector('.hero');
    if (!hero) {
      console.warn('[change.js] .hero not found');
      return;
    }

    ensureInlineCSS();

    // 이미지 목록 (페이지 디렉토리 기준 상대경로)
    const HERO_IMAGES_REL = [
      'image/banner/1.png',
      'image/banner/2.png',
      'image/banner/3.png',
      'image/banner/4.png',
    ];
    const HERO_IMAGES = HERO_IMAGES_REL.map(resolveFromPageDir);

    if (!HERO_IMAGES.length) {
      console.warn('[change.js] HERO_IMAGES is empty');
      return;
    }

    // 레이어 2장 생성
    const layerA = document.createElement('div');
    const layerB = document.createElement('div');
    layerA.className = 'layer';
    layerB.className = 'layer';
    // 텍스트보다 아래에 오도록 hero의 가장 앞에 삽입
    hero.prepend(layerB);
    hero.prepend(layerA);

    // 초기 화면: A에 첫 이미지 지정 + "show" + 인라인 opacity=1 세팅(외부CSS 미적용 대비)
    layerA.style.backgroundImage = `url("${HERO_IMAGES[0]}")`;
    layerA.classList.add('show');
    layerA.style.opacity = '1'; // CSS 미적용/지연에도 보이도록 안전장치

    // 프리로드 로그
    HERO_IMAGES.forEach((src) => {
      const img = new Image();
      img.onload = () => console.log('[change.js] OK', src);
      img.onerror = () => console.warn('[change.js] NOT FOUND', src);
      img.src = src;
    });

    if (HERO_IMAGES.length < 2) {
      console.log('[change.js] only one image; rotation disabled');
      return;
    }

    // 상태값
    let cur = 0;
    let next = 1;
    let showingA = true;
    const TRANSITION_MS = 950;
    const INTERVAL_MS = 10000;

    function setBg(el, src) {
      el.style.backgroundImage = `url("${src}")`;
    }

    function swap() {
      if (showingA) {
        setBg(layerB, HERO_IMAGES[next]);
        layerB.classList.add('show');
        layerB.style.opacity = '';     // 인라인 강제값 해제(정상 전환)
        layerA.classList.remove('show');
      } else {
        setBg(layerA, HERO_IMAGES[next]);
        layerA.classList.add('show');
        layerA.style.opacity = '';
        layerB.classList.remove('show');
      }

      setTimeout(() => {
        cur = next;
        next = (cur + 1) % HERO_IMAGES.length;
        showingA = !showingA;
      }, TRANSITION_MS);
    }

    let timer = setInterval(swap, INTERVAL_MS);

    // 호버/가시성 제어 (옵션)
    hero.addEventListener('mouseenter', () => clearInterval(timer));
    hero.addEventListener('mouseleave', () => {
      clearInterval(timer);
      timer = setInterval(swap, INTERVAL_MS);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearInterval(timer);
      else {
        clearInterval(timer);
        timer = setInterval(swap, INTERVAL_MS);
      }
    });

    // 디버그 헬퍼
    window._heroNext = () => swap();

    console.log('[change.js] init done', { baseDir: getCurrentDirHref(), imgs: HERO_IMAGES });
  });
})();
