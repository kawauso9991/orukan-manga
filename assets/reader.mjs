import { assetURL, externalURL, parsePageHash, chooseStart, readProgress, writeProgress } from './state.mjs';
import { createNavigation } from './navigation.mjs';
import { createScrollThrottle } from './scroll.mjs';
import { installPageControl } from './controls.mjs';
import { createLayoutRestorer, observeLayoutChanges } from './layout.mjs';
import { createPresentationUI } from './presentation-ui.mjs?v=quality-2';
import { renderDownloadLinks, lightDownloadURL, visiblePages, chapterLabel } from './presentation.mjs?v=quality-2';
import { pageAlignment, verifiedCover } from './alignment.mjs';
import { validateReadings, referenceName } from './references.mjs';
import {createReaderDoor} from './reader-door.mjs';

const $ = id => document.getElementById(id);
const documentURL = document.URL;
const storageKey = 'orukan-manga:reading';
const getStorage = () => window.localStorage;
const reader = $('reader');
const toolbar = $('reader-toolbar');
const contentsDialog = $('contents-dialog');
const zoomDialog = $('zoom-dialog');
const zoomViewport = $('zoom-viewport');
const zoomCanvas = $('zoom-canvas');
const zoomImage = $('zoom-image');
let book, navigation, pageControl, layoutRestorer, currentPage = 1;
const scrollWork = createScrollThrottle(() => { if (!zoomDialog.open && !contentsDialog.open && !presentation?.transitioning) navigation.passive(); });
let images = [], figures = [], pageLinks = new Map();
let zoomPage = null, zoomOpener, pendingZoomPage = null;
let contentsOpener, pendingContentsPage = null;
let pendingZoomOffset = 0, pendingContentsOffset = 0;
let skipZoomRestore = false;
let presentation,door,savedResume=null;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function pageLabel(page) {
  const item = book.pages[page - 1];
  return item.label === String(page) ? `${page}ページ` : `${page}ページ（補足 ${item.label}）`;
}

function validateBook(data) {
  if (!data || data.totalPages !== 107 || typeof data.title !== 'string' || typeof data.version !== 'string' ||
      !Array.isArray(data.pages) || data.pages.length !== 107 || !Array.isArray(data.chapters) || !Array.isArray(data.links)) throw Error('Invalid book');
  data.pages.forEach((page, index) => {
    if (page.number !== index + 1 || typeof page.label !== 'string' || !Number.isSafeInteger(page.width) || !Number.isSafeInteger(page.height) || page.width <= 0 || page.height <= 0 ||
        !assetURL(page.src, documentURL) || !assetURL(page.zoom, documentURL)) throw Error('Invalid page');
  });
  for (const chapter of data.chapters) {
    if (parsePageHash(`#p=${chapter.page}`, 107) === null || typeof chapter.title !== 'string') throw Error('Invalid chapter');
  }
  for (const link of data.links) {
    if (parsePageHash(`#p=${link.page}`, 107) === null || !Array.isArray(link.rect) || link.rect.length !== 4 ||
        !link.rect.every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1) ||
        link.rect[2] <= 0 || link.rect[3] <= 0 || link.rect[0] + link.rect[2] > 1.001 || link.rect[1] + link.rect[3] > 1.001 ||
        !(link.type === 'external' ? externalURL(link.url) : link.type === 'internal' && parsePageHash(`#p=${link.target}`, 107))) throw Error('Invalid source link');
    if(link.targetOffset!==undefined&&(!Number.isFinite(link.targetOffset)||link.targetOffset<0||link.targetOffset>1))throw Error('Invalid source destination');
  }
  validateReadings(data.readings,107);
  if (!data.download || !lightDownloadURL(data.download, documentURL) || typeof data.download.filename !== 'string' || !Number.isFinite(data.download.bytes)) throw Error('Invalid download');
  return data;
}

function makeLink(link, hotspot = false) {
  const name = referenceName(link,pageLabel);
  const anchor = element('a', hotspot ? 'source-hotspot' : '', hotspot ? undefined : name);
  if (link.type === 'external') {
    anchor.href = externalURL(link.url);
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
  } else {
    anchor.href = `#p=${link.target}`;
    anchor.dataset.page = String(link.target);
    if(link.targetOffset!==undefined)anchor.dataset.sourceOffset=String(link.targetOffset);
  }
  if (hotspot) {
    const [x, y, width, height] = link.rect;
    Object.assign(anchor.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${width * 100}%`, height: `${height * 100}%` });
    anchor.setAttribute('aria-label', name);
    // The same destinations have full-size keyboard-accessible sidebar rows.
    anchor.tabIndex = -1;
    anchor.setAttribute('aria-hidden', 'true');
  } else {
    const icon = element('span', '', link.type === 'external' ? '↗' : '→');
    icon.setAttribute('aria-hidden', 'true');
    anchor.append(icon);
    if(link.reading){anchor.classList.add('reference-reading');anchor.append(element('span','reference-reading-description',link.description));}
    if (link.type === 'external') anchor.append(element('span', 'sr-only', '（新しいタブで開きます）'));
  }
  return anchor;
}

function addHotspots(container, links) {
  for (const link of links) container.append(makeLink(link, true));
}

function renderPages() {
  const fragment = document.createDocumentFragment();
  for (const link of book.links) {
    if (!pageLinks.has(link.page)) pageLinks.set(link.page, []);
    pageLinks.get(link.page).push(link);
  }
  for (const page of book.pages) {
    const figure = element('figure', 'page');
    figure.id = `page-${page.number}`;
    figure.dataset.page = String(page.number);
    figure.dataset.verifiedCover=String(page.number===1&&verifiedCover(book));
    const art = element('div', 'page-art');
    art.style.setProperty('--page-ratio', `${page.width} / ${page.height}`);
    const image = element('img', 'page-image');
    image.width = page.width;
    image.height = page.height;
    image.alt = `${book.title} ${pageLabel(page.number)}`;
    image.setAttribute('aria-label',`${pageLabel(page.number)}を拡大`);
    image.decoding = 'async';
    image.draggable = false;
    image.addEventListener('click', () => openZoom(page.number, image));
    image.addEventListener('keydown', event => {
      if(window.innerWidth>=1024&&(event.key==='Enter'||event.key===' ')) {
        event.preventDefault();openZoom(page.number,image);
      }
    });
    const loadError = element('p', 'page-load-error', '画像を読み込めませんでした。');
    loadError.hidden = true;
    const retry = element('button', '', 'もう一度読み込む');
    retry.type = 'button';
    retry.addEventListener('click', () => { image.removeAttribute('src'); loadPage(page.number); });
    loadError.append(retry);
    image.addEventListener('error', () => { loadError.hidden = false;delete image.dataset.hq;delete image.dataset.qualityLoaded; });
    image.addEventListener('load', () => {
      loadError.hidden = true;
      if(image.currentSrc!==image.src)return;
      image.dataset.qualityLoaded=image.dataset.quality;
      if(image.dataset.quality==='high')image.dataset.hq='ready';
    });
    art.append(image);
    const links = pageLinks.get(page.number) ?? [];
    if (links.length) {
      const hotspots = element('div', 'source-links');
      addHotspots(hotspots, links);
      art.append(hotspots);
    }
    if(pageAlignment(book,page.number)) {
      const frame=element('div','page-frame');frame.dataset.alignmentFrame='true';frame.append(art);figure.append(frame,loadError);
    } else figure.append(art, loadError);
    fragment.append(figure);
    figures.push(figure);
    images.push(image);
  }
  reader.append(fragment);
}

function renderContents() {
  for (const chapter of book.chapters) {
    const option = element('option', '', chapter.title);
    option.value = String(chapter.page);
    $('chapter-select').append(option);
    const item = element('li');
    const anchor = element('a');
    anchor.href = `#p=${chapter.page}`;
    anchor.dataset.page = String(chapter.page);
    anchor.append(element('span', '', chapter.title), element('small', '', pageLabel(chapter.page)));
    item.append(anchor);
    $('contents-list').append(item);
  }
}

function loadPage(page,{preferHQ}={}) {
  const image = images[page - 1];
  if (image) {
    const high=preferHQ??(presentation?.quality==='high');
    const item=book.pages[page-1];
    const url=assetURL(high?item.zoom:item.src,documentURL);
    if(image.getAttribute('src')===url)return;
    image.dataset.quality=high?'high':'normal';delete image.dataset.qualityLoaded;
    if(high)image.dataset.hq='loading';else delete image.dataset.hq;
    image.src=url;
  }
}

function loadNeighborhood(page) {
  for (let number = Math.max(1, page - 1); number <= Math.min(book.totalPages, page + 1); number++) loadPage(number);
}

function headerOffset() { return 0; }

function positionAtScroll() {
  if(door?.active)return {page:1,offset:0};
  const paginated = presentation?.readPosition();
  if (paginated) return paginated;
  const line = headerOffset();
  let low = 0, high = images.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (figures[middle].getBoundingClientRect().top <= line + 1) low = middle;
    else high = middle - 1;
  }
  const top = (pageAlignment(book,low+1,'vertical',window.innerWidth>=1024)?images[low]:figures[low]).getBoundingClientRect().top;
  return { page: low + 1, offset: Math.max(0, Math.min(1, (line - top) / images[low].getBoundingClientRect().height)) };
}

function moveTo(position, settled) {
  scrollWork.cancel();
  loadNeighborhood(position.page);
  if(door?.active) {
    window.scrollTo({top:window.scrollY+$('reader-shell').getBoundingClientRect().top,behavior:'instant'});
    requestAnimationFrame(()=>requestAnimationFrame(settled));return;
  }
  if (presentation?.moveTo(position)) { requestAnimationFrame(() => requestAnimationFrame(settled)); return; }
  const image = images[position.page - 1];
  const aligned=pageAlignment(book,position.page,'vertical',window.innerWidth>=1024);
  const top = (aligned&&position.offset>0?image:figures[position.page - 1]).getBoundingClientRect().top;
  window.scrollTo({ top: Math.max(0, window.scrollY + top + image.getBoundingClientRect().height * position.offset - headerOffset()), behavior: 'instant' });
  requestAnimationFrame(() => requestAnimationFrame(settled));
}

function updatePosition(position) {
  currentPage = position.page;
  const wasDoor=door?.active;door?.sync();
  if(wasDoor!==door?.active)presentation?.resize();
  presentation?.changed(position);
  $('current-position').textContent = `${position.page} / ${book.totalPages} ページ${book.pages[position.page - 1].label === String(position.page) ? '' : ` · 補足 ${book.pages[position.page - 1].label}`}`;
  pageControl.update(position.page);
  const spread = presentation?.mode === 'spread';
  $('previous').disabled = position.page === 1;
  $('next').disabled = spread ? position.page >= book.totalPages - 1 : position.page === book.totalPages;
  if (spread && position.page !== 1) {
    const right = position.page - position.page % 2;
    $('current-position').textContent = `${right}・${right + 1} / ${book.totalPages} ページ`;
  }
  $('reading-progress').style.width = `${((position.page - 1 + position.offset) / book.totalPages) * 100}%`;
  $('current-chapter').textContent = chapterLabel(visiblePages(position.page,presentation?.mode??'vertical',book.totalPages),book.chapters);
  loadNeighborhood(position.page);
}

function historyWrite(method, position) {
  try { history[method]({ reader: book.version, ...position }, '', `#p=${position.page}`); } catch { /* Reading also works when history APIs are restricted. */ }
}

function go(page, offset = 0) {
  scrollWork.cancel();
  pageControl.clearDraft();
  navigation.go(page, offset);
  $('announcement').textContent = `${pageLabel(currentPage)}に移動しました。`;
}

function openContents(opener) {
  contentsOpener = opener;
  pendingContentsPage = null;
  pendingContentsOffset = 0;
  $('chapter-select').value = '';
  contentsDialog.showModal();
}

function zoomLayout(preserveCenter = false) {
  if (!zoomPage) return;
  const previousWidth = zoomCanvas.getBoundingClientRect().width;
  const centerX = previousWidth ? (zoomViewport.scrollLeft + zoomViewport.clientWidth / 2) / previousWidth : .5;
  const centerY = previousWidth ? (zoomViewport.scrollTop + zoomViewport.clientHeight / 2) / previousWidth : 0;
  const page = book.pages[zoomPage - 1];
  const width = Math.max(1, zoomViewport.clientWidth);
  zoomCanvas.style.width = `${width}px`;
  zoomCanvas.style.height = `${width * page.height / page.width}px`;
  if (preserveCenter) {
    zoomViewport.scrollLeft = centerX * width - zoomViewport.clientWidth / 2;
    zoomViewport.scrollTop = centerY * width - zoomViewport.clientHeight / 2;
  } else {
    zoomViewport.scrollLeft = 0;
    zoomViewport.scrollTop = 0;
  }
}

function openZoom(page, opener) {
  if (window.innerWidth<1024 || zoomDialog.open) return;
  layoutRestorer.openModal();
  zoomPage = page;
  zoomOpener = opener;
  pendingZoomPage = null;
  pendingZoomOffset = 0;
  skipZoomRestore = false;
  zoomDialog.setAttribute('aria-label',`${pageLabel(page)}の拡大`);
  zoomCanvas.classList.toggle('cover-view',page===1&&verifiedCover(book));
  $('zoom-message').hidden = true;
  zoomImage.alt = `${book.title} ${pageLabel(page)} 拡大画像`;
  const item = book.pages[page - 1];
  zoomImage.width = item.width;
  zoomImage.height = item.height;
  $('zoom-links').replaceChildren();
  addHotspots($('zoom-links'), pageLinks.get(page) ?? []);
  presentation.zoomReferences(page);
  presentation.openZoomPanel(zoomDialog);
  document.documentElement.style.overflow = 'hidden';
  zoomDialog.showModal();
  zoomLayout();
  zoomImage.dataset.quality=presentation.quality;
  zoomImage.src = assetURL(presentation.quality==='high'?item.zoom:item.src, documentURL);
  $('close-zoom').focus({ preventScroll: true });
}

function closeZoomFromContextMenu(event) {
  if(!zoomDialog.open||!zoomCanvas.contains(event.target)||event.target.closest('a,button,input,select,textarea,[contenteditable]'))return;
  event.preventDefault();
  zoomDialog.close();
}

function saveReadingPosition(position) {
  // Visiting the door must not erase a reader's saved place inside the book.
  if(position.page===1)return false;
  const saved=writeProgress(getStorage,storageKey,book.version,position,book.totalPages);
  if(saved)savedResume={...position};
  return saved;
}

function installEvents() {
  $('previous').addEventListener('click', () => presentation.turn(-1));
  $('next').addEventListener('click', () => presentation.turn(1));
  pageControl = installPageControl({ form: $('page-form'), input: $('page-number'), totalPages: book.totalPages, onNavigate: go });
  $('open-contents').addEventListener('click', event => openContents(event.currentTarget));
  $('toolbar-contents').addEventListener('click', event => openContents(event.currentTarget));
  $('close-contents').addEventListener('click', () => contentsDialog.close());
  $('chapter-select').addEventListener('change', event => {
    if (event.target.value) { pendingContentsPage = Number(event.target.value); contentsDialog.close(); }
  });
  contentsDialog.addEventListener('close', () => {
    contentsOpener?.focus({ preventScroll: true });
    if (pendingContentsPage !== null) go(pendingContentsPage,pendingContentsOffset);
    pendingContentsPage = null;
  });
  document.addEventListener('click', event => {
    const anchor = event.target.closest('a[data-page]');
    if (!anchor || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const page = parsePageHash(`#p=${anchor.dataset.page}`, book.totalPages);
    if (page === null) return;
    const offset=Number(anchor.dataset.sourceOffset??0);
    event.preventDefault();
    if (zoomDialog.open) { pendingZoomPage = page;pendingZoomOffset=offset; zoomDialog.close(); }
    else if (contentsDialog.open) { pendingContentsPage = page;pendingContentsOffset=offset; contentsDialog.close(); }
    else go(page,offset);
  });
  window.addEventListener('scroll', () => {
    if (zoomDialog.open || contentsDialog.open || door?.active || presentation?.transitioning) return;
    navigation.observe();
    scrollWork.schedule();
  }, { passive: true });
  window.addEventListener('popstate', event => {
    scrollWork.cancel();
    pageControl.clearDraft();
    if (zoomDialog.open) { skipZoomRestore = true; zoomDialog.close(); }
    if (contentsDialog.open) contentsDialog.close();
    navigation.restore(location.hash, event.state?.reader === book.version ? event.state : null);
  });
  // Also handles a manually edited address fragment; popstate may already have restored it.
  window.addEventListener('hashchange', () => {
    const page = parsePageHash(location.hash, book.totalPages);
    pageControl.clearDraft();
    if (page === null || page !== currentPage) navigation.restore(location.hash, null);
    else pageControl.update(currentPage);
  });
  window.addEventListener('pagehide', () => { if (!zoomDialog.open) navigation.persist(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && !zoomDialog.open) navigation.persist(); });
  $('close-zoom').addEventListener('click', () => zoomDialog.close());
  zoomViewport.addEventListener('contextmenu',closeZoomFromContextMenu);
  zoomDialog.addEventListener('close', () => {
    scrollWork.cancel();
    zoomImage.removeAttribute('src');
    $('zoom-links').replaceChildren();
    presentation.closeZoomPanel();
    zoomPage = null;
    document.documentElement.style.overflow = '';
    zoomOpener?.focus({ preventScroll: true });
    layoutRestorer.closeModal({skipRestore: skipZoomRestore || pendingZoomPage !== null});
    if (pendingZoomPage !== null) go(pendingZoomPage,pendingZoomOffset);
    pendingZoomPage = null;
  });
  zoomImage.addEventListener('error', () => {
    if (!zoomPage) return;
    const message = $('zoom-message');
    message.replaceChildren(document.createTextNode('拡大画像を読み込めませんでした。'));
    const retry = element('button', '', '再読み込み');
    retry.type = 'button';
    retry.addEventListener('click', () => {const item=book.pages[zoomPage-1];zoomImage.src=assetURL(presentation.quality==='high'?item.zoom:item.src,documentURL);message.hidden=true;});
    message.append(retry); message.hidden = false;
  });
  zoomImage.addEventListener('load', () => { $('zoom-message').hidden = true; });
  let drag = null;
  zoomViewport.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('a')) return;
    drag = { x: event.clientX, y: event.clientY, left: zoomViewport.scrollLeft, top: zoomViewport.scrollTop };
    zoomViewport.setPointerCapture(event.pointerId);
    zoomViewport.classList.add('dragging');
    event.preventDefault();
  });
  zoomViewport.addEventListener('pointermove', event => {
    if (!drag) return;
    zoomViewport.scrollLeft = drag.left - (event.clientX - drag.x);
    zoomViewport.scrollTop = drag.top - (event.clientY - drag.y);
  });
  const endDrag = () => { drag = null; zoomViewport.classList.remove('dragging'); };
  zoomViewport.addEventListener('pointerup', endDrag);
  zoomViewport.addEventListener('pointercancel', endDrag);
  zoomViewport.addEventListener('lostpointercapture', endDrag);
  const resize=()=>{
    if(window.innerWidth<1024&&zoomDialog.open)zoomDialog.close();
    layoutRestorer.resize();
  };
  window.addEventListener('resize',resize);
  if(typeof ResizeObserver==='function')observeLayoutChanges({
    elements:[toolbar,$('reading-stage'),$('mobile-navigation'),document.documentElement],
    measure:()=>[toolbar.getBoundingClientRect().height,$('reading-stage').clientWidth,$('reading-stage').clientHeight,
      $('mobile-navigation').getBoundingClientRect().height,window.getComputedStyle(document.documentElement).fontSize].join(':'),
    onResize:resize,Observer:ResizeObserver,requestFrame:requestAnimationFrame
  });
}

async function start() {
  try {
    const response = await fetch(assetURL('data/book.json', documentURL));
    if (!response.ok) throw Error('Book unavailable');
    book = validateBook(await response.json());
    savedResume=readProgress(getStorage,storageKey,book.version,book.totalPages);
    document.title = `${book.title}｜kawauso`;
    renderPages();
    renderContents();
    renderDownloadLinks(book,{primary:$('pdf-download'),secondary:$('pdf-light-download'),size:$('pdf-size')},documentURL);
    $('startup-message').hidden = true;
    toolbar.hidden = false;
    $('site-footer').hidden = false;
    $('open-contents').disabled = false;
    document.documentElement.style.setProperty('--toolbar-height', '0px');
    try { history.scrollRestoration = 'manual'; } catch { /* Optional in restricted browsers. */ }
    navigation = createNavigation({ totalPages: book.totalPages, readPosition: positionAtScroll, moveTo,
      push: position => historyWrite('pushState', position), replace: position => historyWrite('replaceState', position),
      save: saveReadingPosition, onChange: updatePosition });
    layoutRestorer = createLayoutRestorer({ navigation, cancelPassive: () => scrollWork.cancel(),
      updateLayout: () => {
        presentation.resize();
        document.documentElement.style.setProperty('--toolbar-height', '0px');
        if (zoomDialog.open) zoomLayout(true);
      }, readScrollY: () => window.scrollY,
      restoreScrollY: top => window.scrollTo({top, behavior:'instant'}) });
    presentation = createPresentationUI({book,figures,images,getPage:()=>currentPage,getStorage,go,makeLink,
      reflow:()=>{if(presentation)navigation.reflow();},persist:()=>navigation.persist(),loadPage,
      observeScroll:()=>{navigation.observe();scrollWork.schedule();}});
    door=createReaderDoor({shell:$('reader-shell'),book,getPage:()=>currentPage,getResume:()=>savedResume,
      getFullscreen:()=>presentation.fullscreen,coverURL:assetURL('assets/orukan-cover-square-protected-web.webp',documentURL),
      portraitCoverURL:assetURL('assets/orukan-cover-A4-fullbleed-web.webp',documentURL),onNavigate:go,
      onContents:()=>openContents($('reader-door-contents'))});
    installEvents();
    const initialHash = location.hash;
    const saved = savedResume;
    const initial = chooseStart(initialHash, saved, book.totalPages);
    // Keep the introduction visible on a fresh visit; explicit/resumed locations align below the toolbar.
    if (!initialHash && !saved) {
      navigation.start(initial);
      window.scrollTo({ top: 0, behavior: 'instant' });
    } else navigation.start(initial);
  } catch {
    const message = $('startup-message');
    message.replaceChildren(document.createTextNode('まんがを読み込めませんでした。通信環境を確認して、'));
    const reload = element('a', '', '再読み込み'); reload.href = location.href;
    message.append(reload, document.createTextNode('してください。PDFでもお読みいただけます。'));
    message.setAttribute('role', 'alert'); message.hidden = false;
  }
}

start();
