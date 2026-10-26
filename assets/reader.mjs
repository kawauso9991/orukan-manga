import { assetURL, externalURL, parsePageHash, chooseStart, readProgress, writeProgress } from './state.mjs';
import { createNavigation } from './navigation.mjs';
import { createScrollThrottle } from './scroll.mjs';
import { installPageControl } from './controls.mjs';
import { createLayoutRestorer, observeLayoutChanges } from './layout.mjs';
import { createPresentationUI } from './presentation-ui.mjs';
import { renderDownloadLinks, visiblePages, chapterLabel } from './presentation.mjs';

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
let skipZoomRestore = false;
let presentation;

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
  }
  if (!data.download || !assetURL(data.download.url, documentURL) || typeof data.download.filename !== 'string' || !Number.isFinite(data.download.bytes)) throw Error('Invalid download');
  return data;
}

function makeLink(link, hotspot = false) {
  const name = link.type === 'internal' ? `${pageLabel(link.target)}へ` : `出典を開く：${new URL(link.url).hostname}`;
  const anchor = element('a', hotspot ? 'source-hotspot' : '', hotspot ? undefined : name);
  if (link.type === 'external') {
    anchor.href = externalURL(link.url);
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
  } else {
    anchor.href = `#p=${link.target}`;
    anchor.dataset.page = String(link.target);
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
    image.addEventListener('error', () => { loadError.hidden = false; });
    image.addEventListener('load', () => { loadError.hidden = true; });
    art.append(image);
    const links = pageLinks.get(page.number) ?? [];
    if (links.length) {
      const hotspots = element('div', 'source-links');
      addHotspots(hotspots, links);
      art.append(hotspots);
    }
    figure.append(art, loadError);
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

function loadPage(page) {
  const image = images[page - 1];
  if (image && !image.hasAttribute('src')) image.src = assetURL(book.pages[page - 1].src, documentURL);
}

function loadNeighborhood(page) {
  for (let number = Math.max(1, page - 1); number <= Math.min(book.totalPages, page + 1); number++) loadPage(number);
}

function headerOffset() { return 0; }

function positionAtScroll() {
  const paginated = presentation?.readPosition();
  if (paginated) return paginated;
  const line = headerOffset();
  let low = 0, high = images.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (figures[middle].getBoundingClientRect().top <= line + 1) low = middle;
    else high = middle - 1;
  }
  const top = figures[low].getBoundingClientRect().top;
  return { page: low + 1, offset: Math.max(0, Math.min(1, (line - top) / images[low].getBoundingClientRect().height)) };
}

function moveTo(position, settled) {
  scrollWork.cancel();
  loadNeighborhood(position.page);
  if (presentation?.moveTo(position)) { requestAnimationFrame(() => requestAnimationFrame(settled)); return; }
  const image = images[position.page - 1];
  const top = figures[position.page - 1].getBoundingClientRect().top;
  window.scrollTo({ top: Math.max(0, window.scrollY + top + image.getBoundingClientRect().height * position.offset - headerOffset()), behavior: 'instant' });
  requestAnimationFrame(() => requestAnimationFrame(settled));
}

function updatePosition(position) {
  currentPage = position.page;
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

function go(page) {
  scrollWork.cancel();
  pageControl.clearDraft();
  navigation.go(page);
  $('announcement').textContent = `${pageLabel(currentPage)}に移動しました。`;
}

function openContents(opener) {
  contentsOpener = opener;
  pendingContentsPage = null;
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
  skipZoomRestore = false;
  zoomDialog.setAttribute('aria-label',`${pageLabel(page)}の拡大`);
  zoomCanvas.classList.toggle('cover-view',page===1);
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
  zoomImage.src = assetURL(item.zoom, documentURL);
  $('close-zoom').focus({ preventScroll: true });
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
    if (pendingContentsPage !== null) go(pendingContentsPage);
    pendingContentsPage = null;
  });
  document.addEventListener('click', event => {
    const anchor = event.target.closest('a[data-page]');
    if (!anchor || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const page = parsePageHash(`#p=${anchor.dataset.page}`, book.totalPages);
    if (page === null) return;
    event.preventDefault();
    if (zoomDialog.open) { pendingZoomPage = page; zoomDialog.close(); }
    else if (contentsDialog.open) { pendingContentsPage = page; contentsDialog.close(); }
    else go(page);
  });
  window.addEventListener('scroll', () => {
    if (zoomDialog.open || contentsDialog.open || presentation?.transitioning) return;
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
  zoomDialog.addEventListener('close', () => {
    scrollWork.cancel();
    zoomImage.removeAttribute('src');
    $('zoom-links').replaceChildren();
    presentation.closeZoomPanel();
    zoomPage = null;
    document.documentElement.style.overflow = '';
    zoomOpener?.focus({ preventScroll: true });
    layoutRestorer.closeModal({skipRestore: skipZoomRestore || pendingZoomPage !== null});
    if (pendingZoomPage !== null) go(pendingZoomPage);
    pendingZoomPage = null;
  });
  zoomImage.addEventListener('error', () => {
    if (!zoomPage) return;
    const message = $('zoom-message');
    message.replaceChildren(document.createTextNode('拡大画像を読み込めませんでした。'));
    const retry = element('button', '', '再読み込み');
    retry.type = 'button';
    retry.addEventListener('click', () => { zoomImage.src = assetURL(book.pages[zoomPage - 1].zoom, documentURL); message.hidden = true; });
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
      save: position => writeProgress(getStorage, storageKey, book.version, position, book.totalPages), onChange: updatePosition });
    layoutRestorer = createLayoutRestorer({ navigation, cancelPassive: () => scrollWork.cancel(),
      updateLayout: () => {
        presentation.resize();
        document.documentElement.style.setProperty('--toolbar-height', '0px');
        if (zoomDialog.open) zoomLayout(true);
      }, readScrollY: () => window.scrollY,
      restoreScrollY: top => window.scrollTo({top, behavior:'instant'}) });
    presentation = createPresentationUI({book,figures,images,getPage:()=>currentPage,getStorage,go,makeLink,
      reflow:()=>navigation.reflow(),persist:()=>navigation.persist(),loadPage,
      observeScroll:()=>{navigation.observe();scrollWork.schedule();}});
    installEvents();
    const initialHash = location.hash;
    const saved = readProgress(getStorage, storageKey, book.version, book.totalPages);
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
