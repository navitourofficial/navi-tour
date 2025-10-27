// lib/boot.js
// ──────────────────────────────────────────────────────────────────────────────
// 📚 섹션 목차
// 0) DEV 플래그 / 페이지 데이터 수집
// 1) 초기 구성값 cfg (마운트 지점/레이아웃 경로/히어로/템플릿 캐시버스터)
// 2) bootFromDataset(cfg) : 부팅 절차 오케스트레이션
// 3) loadLayout(layout)   : 레이아웃 파일 fetch + 템플릿 주입/슬롯 교체/스크립트 실행
// 4) injectGlobal(html)   : 전역 스타일/스크립트 템플릿 주입
// 5) replaceSlot(sel,tpl) : #slot 자리에 외부 템플릿 교체
// 6) applyHero(img)       : 히어로 배경 이미지 CSS 변수 주입
// 7) mountTemplates(...)  : 제품/사이트 템플릿 지연 로드 & 마운트
// 8) activatePageTabs()   : 섹션 스크롤 스파이 → aria-current 토글
// 9) query(sel)           : 안전한 querySelector 래퍼
// 10) export bootPage(..) : 외부에서 커스텀 설정으로 재부팅 지원
// ──────────────────────────────────────────────────────────────────────────────


// 0) DEV 플래그 / 페이지 데이터 수집
// - DEV: localhost 또는 URL 쿼리에 dev=1/mode=dev 가 있으면 개발모드로 간주
//   → 제품 템플릿에 캐시버스터(?v=timestamp) 자동 부여(새로고침 시 갱신)
// - #page[data-*]로 페이지별 설정을 HTML에서 주입
const DEV =
  location.hostname === 'localhost' ||
  location.search.includes('dev=1') ||
  location.search.includes('mode=dev');

const $page = document.getElementById('page');
const ds = $page?.dataset || {}; // #page가 없거나 data-*가 비어도 안전하게 처리


// 1) 초기 구성값 cfg
// - 필요 시 여기 기본값을 바꾸면 전역 기본 동작이 달라짐
//   • region     : 현재 페이지 권역(필터/트래킹 등에 활용 가능)
//   • heroImg    : 히어로 배경 이미지 URL
//   • productTpl : 제품 템플릿 HTML 경로(DEV면 캐시버스터를 자동 추가)
//   • mounts     : 각 템플릿이 주입될 DOM 셀렉터 (페이지가 다르면 data-*로 재지정 가능)
//   • layout     : 공통 레이아웃 파일 경로(헤더/푸터/필터/글로벌)
const cfg = {
  region: ds.region || '',
  heroImg: ds.hero || '',
  // ✨ 캐시버스터: 개발 중 새로고침마다 최신 템플릿을 받도록 timestamp 쿼리 부여
  //   - 끄고 싶으면 DEV 조건을 제거하거나 false로 하드코딩
  productTpl: (ds.product || '') + (DEV ? (ds.product?.includes('?') ? `&v=${Date.now()}` : `?v=${Date.now()}`) : ''),
  mounts: {
    // 🧷 기본 마운트 지점. 페이지마다 data-mount-list 등으로 덮어쓸 수 있음
    list:  ds.mountList  || '#product-list',
    high:  ds.mountHigh  || '#product-highlights',
    sites: ds.mountSites || '#site-cards'
  },
  layout: {
    // 📁 레이아웃 파일 경로. 폴더 구조 바뀌면 여기 일괄 수정
    header: 'layout/header.html',
    footer: 'layout/footer.html',
    filter: 'layout/main_filter.html',
    global: 'layout/global_layout.html'
  }
};

// 🚀 엔트리: #page data-* 값으로 부팅
bootFromDataset(cfg);



// ---------------- core ----------------


// 2) 부팅 오케스트레이션
// 흐름: 전역/레이아웃 주입 → 히어로 세팅 → (IO로 지연) 제품 템플릿 마운트 → 탭 활성화
async function bootFromDataset(cfg){
  // 2-1) 전역/레이아웃 주입 (헤더/푸터/필터/전역 스타일·스크립트)
  await loadLayout(cfg.layout);

  // 2-2) 히어로 변수 세팅 (CSS var --hero-img 에 url(...) 주입)
  applyHero(cfg.heroImg);

  // 2-3) 제품 템플릿: 화면 진입 전에 미리 로드 (LCP 보존을 위해 IO로 지연)
  //   - firstSection: 관찰 기준 엘리먼트. 뷰포트에 근접하면 fetch/mount 실행
  //   - IntersectionObserver rootMargin: 언제 미리 로드할지 여유거리
  //     → 400px: 뷰포트 위/아래 400px에서 이미 로딩 시작 (더 일찍: 800px / 더 늦게: 100~0px)
  const listMount = query(cfg.mounts.list);
  const firstSection = listMount?.closest('section') || document.querySelector('#section-2') || document.body;

  const io = new IntersectionObserver(async (entries)=>{
    const e = entries[0];
    if (!e.isIntersecting) return;
    io.disconnect();
    await mountTemplates(cfg.productTpl, cfg.mounts);
  }, { rootMargin: '400px 0px' });

  if (firstSection) io.observe(firstSection);
  else await mountTemplates(cfg.productTpl, cfg.mounts); // 섹션이 없다면 즉시 마운트

  // 2-4) 탭 활성화(aria-current 사용) — 스타일은 CSS에서 [aria-current="true"]로 제어
  activatePageTabs();
}


// 3) 레이아웃 로드/주입
// - layout.global: 전역 스타일/스크립트 템플릿 (선로딩; 실패해도 앱은 계속)
// - header/footer/filter: 각 HTML을 fetch 후 <template>를 찾아 DOM에 복제
// - #concierge-slot / #bottom-cta-slot / #filter-slot : 페이지의 슬롯을 외부 템플릿으로 교체
// - header.html 내 <template id="layout-script">의 인라인 <script>를 실행(이벤트 바인딩 등)
async function loadLayout(layout){
  const tasks = [];
  // 전역 템플릿은 선택적. 실패해도 전체 흐름 중단 안 함.
  if (layout.global) tasks.push(fetch(layout.global).then(r=>r.text()).then(injectGlobal).catch(()=>{}));
  // 헤더/푸터/필터는 병렬로 가져오기
  tasks.push(
    fetch(layout.header).then(r=>r.text()),
    fetch(layout.footer).then(r=>r.text()),
    fetch(layout.filter).then(r=>r.text())
  );
  const [ , hHtml, fHtml, mfHtml ] = await Promise.all(tasks);
  const P = (h)=>new DOMParser().parseFromString(h,'text/html');

  const hDoc  = P(hHtml), fDoc=P(fHtml), mfDoc=P(mfHtml);
  // 각 파일에서 필요한 템플릿/스크립트 추출
  const $headerTpl = hDoc.getElementById('layout-header');
  const $footerTpl = fDoc.getElementById('layout-footer');
  const $concTpl   = hDoc.getElementById('layout-concierge');
  const $bottomTpl = fDoc.getElementById('layout-bottom-cta');
  const $filterTpl = mfDoc.getElementById('layout-main-filter');
  const $hScript   = hDoc.getElementById('layout-script');

  const main = document.querySelector('main');
  // ⬆️ 헤더는 main 앞, 푸터는 body 끝
  if ($headerTpl) document.body.insertBefore($headerTpl.content.cloneNode(true), main || document.body.firstChild);
  if ($footerTpl) document.body.appendChild($footerTpl.content.cloneNode(true));

  // 슬롯 교체 (페이지에서 비워둔 placeholder를 외부 조각으로 대체)
  replaceSlot('#concierge-slot', $concTpl);
  replaceSlot('#bottom-cta-slot', $bottomTpl);
  replaceSlot('#filter-slot', $filterTpl);

  // 헤더 전용 스크립트 실행(예: 메뉴 토글, 검색, 드롭다운 등)
  if ($hScript){
    const inline = $hScript.content.querySelector('script');
    if (inline){
      const s = document.createElement('script');
      s.textContent = inline.textContent;
      document.body.appendChild(s);
    }
  }
}


// 4) 전역 템플릿 주입
// - global_layout.html 에서 style/script 템플릿을 읽어 <head>/<body>에 삽입
// - 실패 시 전체 부팅은 계속(상위에서 try/catch)
function injectGlobal(html){
  const doc = new DOMParser().parseFromString(html,'text/html');
  const styleTpl  = doc.getElementById('global-layout-style');
  const scriptTpl = doc.getElementById('global-layout-script');
  if (styleTpl)  document.head.append(styleTpl.content.cloneNode(true));
  if (scriptTpl){
    const inline = scriptTpl.content.querySelector('script');
    if (inline){
      const s = document.createElement('script');
      s.textContent = inline.textContent;
      document.body.appendChild(s);
    }
  }
}


// 5) 슬롯 교체 유틸
// - sel: 페이지 내 placeholder 선택자 (예: #filter-slot)
// - tpl: 외부 파일에서 가져온 <template> 노드
// - slot이 존재하고 tpl도 있으면 그대로 교체. 없으면 아무것도 안 함(안전)
function replaceSlot(sel, tpl){
  const slot = document.querySelector(sel);
  if (slot && tpl) slot.replaceWith(tpl.content.cloneNode(true));
}


// 6) 히어로 배경 이미지 세팅
// - .hero 요소의 CSS 변수 --hero-img 에 url(...)을 주입
//   • applyHero('image/hero.jpg') → CSS: background: var(--hero-img) center/cover
//   • 이미지가 없거나 비우고 싶으면 빈 문자열 전달
function applyHero(img){
  const hero = document.querySelector('.hero');
  if (hero && img) hero.style.setProperty('--hero-img', `url("${img}")`);
}


// 7) 제품/사이트 템플릿 마운트
// - tplUrl: 가져올 템플릿 HTML 파일 경로
// - mounts: 각 섹션이 들어갈 DOM 셀렉터 맵
// - map: 템플릿 내부 <template id="..."> 와 실제 마운트 지점의 연결 정의
//   • 새 섹션이 생기면 여기 배열에 [tplId, mountSel]만 추가하면 됨
// - 실패 시 빈 박스 안내 메시지 출력(UX 가드)
async function mountTemplates(tplUrl, mounts){
  if (!tplUrl) return;
  let html = '';
  try {
    html = await fetch(tplUrl).then(r=>r.text());
  } catch (e) {
    console.warn('product template fetch failed:', e);
    return;
  }
  const doc  = new DOMParser().parseFromString(html,'text/html');

  // 템플릿 ID → 마운트 셀렉터 매핑
  // ⚠️ 'bgando-site-cards' 는 이전 호환 ID. 새 템플릿은 'site-cards' 권장.
  const map = [
    ['product-list',       mounts.list],
    ['product-highlights', mounts.high],
    ['bgando-site-cards',  mounts.sites],
    ['site-cards',         mounts.sites],
  ];

  for (const [tplId, mountSel] of map){
    const tpl = doc.getElementById(tplId);
    const el  = query(mountSel);
    console.log(`[mount] tplId=${tplId} exist=${!!tpl} | mountSel=${mountSel} exist=${!!el}`);
    if (!el) continue;
    if (!tpl){
      // 🚧 템플릿 조각이 없을 때 사용자에게 피드백
      el.innerHTML = `<div class="empty" style="padding:16px;border:1px solid #eee;border-radius:12px;">콘텐츠를 불러오지 못했습니다.</div>`;
      continue;
    }
    // 정상: 마운트 지점 내용을 템플릿 콘텐츠로 교체
    el.replaceChildren(tpl.content.cloneNode(true));
  }
}


// 8) 페이지 탭 활성화(스크롤 스파이)
// - .page-nav-tabs a[href^="#"] 목록을 읽어, 해당하는 섹션이 뷰포트 기준선(120px)과 교차하면
//   해당 링크에 aria-current="true" 부여(스타일링은 CSS에서)
// - 기준선 높이를 조정하고 싶으면 120px 값을 변경(헤더 높이에 맞추면 정확도↑)
function activatePageTabs(){
  const links = [...document.querySelectorAll('.page-nav-tabs a[href^="#"]')];
  const secs  = links.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const on = ()=>{
    let id = null;
    for (const sec of secs){
      const r = sec.getBoundingClientRect();
      // 🔧 판정 기준선: 뷰포트 최상단에서 120px 지점
      //   - 값을 낮추면 섹션 진입 직후 탭이 더 빨리 바뀜
      //   - 값을 높이면 섹션 중앙쯤에서 바뀌는 느낌
      if (r.top <= 120 && r.bottom >= 120){ id = sec.id; break; }
    }
    links.forEach(a=>a.toggleAttribute('aria-current', a.getAttribute('href') === `#${id}`));
  };
  document.addEventListener('scroll', on, { passive:true });
  on(); // 초기에도 한 번 계산
}


// 9) 안전한 querySelector
// - 잘못된 CSS 셀렉터 문자열이 들어와도 앱이 죽지 않도록 try/catch
function query(sel){
  try { return document.querySelector(sel); } catch { return null; }
}


// 10) 외부용 부트 함수
// - 다른 스크립트에서 import 후 원하는 설정만 덮어써 재부팅 가능
// - 사용 예:
//   import { bootPage } from './lib/boot.js';
//   bootPage({ heroImg:'image/x.jpg', mounts:{ list:'#alt' } })
export async function bootPage(custom){
  const merged = {
    ...cfg,
    ...custom,
    mounts: { ...cfg.mounts, ...(custom?.mounts || {}) },
    layout: { ...cfg.layout, ...(custom?.layout || {}) }
  };
  await loadLayout(merged.layout);
  applyHero(merged.heroImg);
  await mountTemplates(merged.productTpl || merged.productTemplateUrl, merged.mounts);
  activatePageTabs();
}
