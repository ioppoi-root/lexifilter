import './styles.css';
import type { AppState, ParsedCandidate, Rating, WordEntry } from './types';
import { emptyState, loadState, saveState } from './storage';
import { parseVocabularyText, dedupeCandidates } from './parser';
import { extractPdf } from './pdf';
import { counts, dateKey, planInfo } from './planner';
import { exportCsv, exportJson } from './export';

let state: AppState = emptyState();
let candidates: ParsedCandidate[] = [];
let currentView = 'home';
let screenIds: string[] = [];
let screenIndex = 0;
let screenRevealed = false;
let reviewIds: string[] = [];
let reviewIndex = 0;
let reviewRevealed = false;
let quizCurrent: { wordId: string; options: string[] } | null = null;

const app = document.querySelector<HTMLDivElement>('#app')!;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]!));
const id = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const wordById = (wordId: string) => state.words.find(w => w.id === wordId);

function shell() {
  app.innerHTML = `
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><div class="logo">L</div><div><b>LexiFilter</b><small>PDF 词本筛选器</small></div></div>
      <nav>
        ${nav('home','概览','⌂')}${nav('import','导入词本','＋')}${nav('screen','快速筛词','✓')}${nav('review','弱词复习','↻')}${nav('quiz','四选一','?')}${nav('plan','学习计划','◫')}${nav('library','词库','≡')}${nav('data','数据','↓')}
      </nav>
      <div class="privacy">默认本地处理<br>PDF 不上传到 LexiFilter 服务器</div>
    </aside>
    <main><div id="view"></div></main>
  </div>`;
  app.querySelectorAll<HTMLElement>('[data-view]').forEach(el => el.addEventListener('click', () => go(el.dataset.view!)));
}

function nav(view: string, label: string, icon: string) {
  return `<button data-view="${view}" class="nav-item ${currentView===view?'active':''}"><span>${icon}</span>${label}</button>`;
}

function go(view: string) {
  currentView = view;
  shell();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function render() {
  const view = document.querySelector<HTMLDivElement>('#view')!;
  if (currentView === 'home') renderHome(view);
  else if (currentView === 'import') renderImport(view);
  else if (currentView === 'screen') renderScreen(view, true);
  else if (currentView === 'review') renderReview(view, true);
  else if (currentView === 'quiz') renderQuiz(view, true);
  else if (currentView === 'plan') renderPlan(view);
  else if (currentView === 'library') renderLibrary(view);
  else renderData(view);
}

function heading(kicker: string, title: string, sub: string) {
  return `<div class="kicker">${esc(kicker)}</div><h1>${esc(title)}</h1><p class="lead">${esc(sub)}</p>`;
}

function renderHome(el: HTMLElement) {
  const c = counts(state); const p = planInfo(state);
  const screened = c.total - c.unseen; const pct = c.total ? Math.round(screened/c.total*100) : 0;
  el.innerHTML = `${heading('OVERVIEW', state.bookName, '先筛掉已经熟悉的词，把时间留给真正不会的部分。')}
    <div class="stats">
      ${stat(c.total,'总词数')}${stat(screened,'已筛选')}${stat(c.weak,'弱词')}${stat(`${pct}%`,'筛选进度')}
    </div>
    <section class="panel hero-panel">
      <div><span class="tag">今日</span><h2>${p ? `DAY ${p.day} · ${p.isReviewPhase ? '复习阶段' : `新词 ${p.todayScreened}/${p.targetToday}`}` : '从自己的词本开始'}</h2>
      <p>${p ? (p.isReviewPhase ? `当前有 ${p.weak} 个弱词，今天集中复习。` : `还剩 ${p.unseen} 个未筛词；计划结束日期 ${p.endDate}。`) : '上传 PDF、粘贴文本或导入备份，然后设置你想用几天完成。'}</p></div>
      <div class="hero-actions">${c.total ? `<button class="btn primary" id="continue">${c.unseen ? '继续筛词' : '复习弱词'}</button>` : `<button class="btn primary" id="startImport">导入第一个词本</button>`}<button class="btn" id="planBtn">${p?'查看计划':'设置计划'}</button></div>
    </section>
    <section class="panel"><div class="between"><div><h3>词库状态</h3><p class="muted">熟悉的词默认退出重点复习；模糊和不会进入弱词池。</p></div><b>${screened}/${c.total || 0}</b></div><div class="progress"><i style="width:${pct}%"></i></div>
      <div class="legend"><span>熟悉 ${c.known}</span><span>模糊 ${c.vague}</span><span>不会 ${c.unknown}</span><span>未筛 ${c.unseen}</span></div>
    </section>`;
  el.querySelector('#continue')?.addEventListener('click', () => go(c.unseen ? 'screen' : 'review'));
  el.querySelector('#startImport')?.addEventListener('click', () => go('import'));
  el.querySelector('#planBtn')?.addEventListener('click', () => go('plan'));
}
function stat(n: number|string, label: string){ return `<div class="stat"><strong>${n}</strong><span>${label}</span></div>`; }

function renderImport(el: HTMLElement) {
  el.innerHTML = `${heading('IMPORT', '导入你的词本', '优先读取 PDF 文本层；扫描件可启用 OCR。识别后先校对，再写入词库。')}
  <div class="import-grid">
    <section class="panel">
      <h3>PDF 文件</h3><p class="muted">适合“英文词 / 中文释义”类词表。OCR 首次使用会下载识别模型，速度取决于设备。</p>
      <label class="dropzone"><input id="pdfFile" type="file" accept="application/pdf"/><b>选择 PDF 词本</b><span>文件只在当前浏览器中读取</span></label>
      <div class="form-row"><label>扫描页处理<select id="ocrMode"><option value="auto">自动：文本太少时 OCR</option><option value="off">关闭 OCR</option><option value="all">所有页面都 OCR（慢）</option></select></label><label>OCR 语言<select id="ocrLang"><option value="eng+chi_sim">英语 + 简体中文</option><option value="eng">仅英语</option><option value="eng+chi_tra">英语 + 繁体中文</option></select></label></div>
      <button class="btn primary" id="parsePdf">解析 PDF</button>
      <div class="progress-wrap hidden" id="parseProgress"><div class="progress"><i id="parseBar"></i></div><span id="parseMsg">准备中</span></div>
    </section>
    <section class="panel"><h3>粘贴文本</h3><p class="muted">也支持直接粘贴“account 账户”或“1. account 账户”这样的词表。</p><textarea id="pasteText" rows="9" placeholder="account 账户\nbankruptcy 破产\n..."></textarea><button class="btn" id="parseText">解析文本</button></section>
  </div>
  <div id="preview"></div>`;
  el.querySelector('#parseText')?.addEventListener('click', () => {
    const text = (el.querySelector('#pasteText') as HTMLTextAreaElement).value;
    candidates = dedupeCandidates(parseVocabularyText(text)); renderCandidatePreview();
  });
  el.querySelector('#parsePdf')?.addEventListener('click', async () => {
    const input = el.querySelector('#pdfFile') as HTMLInputElement;
    const file = input.files?.[0]; if (!file) return toast('请先选择 PDF 文件。');
    const progress = el.querySelector('#parseProgress') as HTMLElement; progress.classList.remove('hidden');
    const btn = el.querySelector('#parsePdf') as HTMLButtonElement; btn.disabled = true;
    try {
      const pages = await extractPdf(file, {
        ocrMode: (el.querySelector('#ocrMode') as HTMLSelectElement).value as 'off'|'auto'|'all',
        ocrLanguage: (el.querySelector('#ocrLang') as HTMLSelectElement).value,
        onProgress: (message, percent) => {
          (el.querySelector('#parseBar') as HTMLElement).style.width = `${percent}%`;
          (el.querySelector('#parseMsg') as HTMLElement).textContent = message;
        }
      });
      candidates = dedupeCandidates(pages.flatMap(p => parseVocabularyText(p.text, p.page)));
      const totalChars = pages.reduce((n, p) => n + p.text.length, 0);
      const cjkChars = pages.reduce((n, p) => n + (p.text.match(/[\u3400-\u9fff]/g) ?? []).length, 0);
      const ocrPages = pages.filter(p => p.method === 'ocr').length;
      (el.querySelector('#parseMsg') as HTMLElement).textContent =
        `完成：${pages.length} 页 · 提取 ${totalChars} 字符 · 中文 ${cjkChars} 字符 · OCR ${ocrPages} 页 · 识别 ${candidates.length} 词条`;
      if (!candidates.length) toast(`没有识别出词条。诊断：提取 ${totalChars} 字符 / 中文 ${cjkChars} 字符 / OCR ${ocrPages} 页。`);
      renderCandidatePreview(file.name.replace(/\.pdf$/i,''));
    } catch (e) { toast(`解析失败：${e instanceof Error ? e.message : String(e)}`); }
    finally { btn.disabled = false; }
  });
}

function renderCandidatePreview(suggestedName = '') {
  const root = document.querySelector('#preview') as HTMLElement;
  const selected = candidates.filter(x => x.selected).length;
  root.innerHTML = `<section class="panel preview-panel"><div class="between"><div><h3>导入前校对</h3><p class="muted">识别到 ${candidates.length} 条，当前选中 ${selected} 条。低置信度内容请重点检查。</p></div><div class="row"><button class="btn" id="selectAll">全选</button><button class="btn" id="selectNone">全不选</button></div></div>
    <div class="form-row"><label>词本名称<input id="bookName" value="${esc(suggestedName || state.bookName)}"/></label><label>导入方式<select id="importMode"><option value="replace">替换当前词本</option><option value="append">追加到当前词本</option></select></label></div>
    <div class="candidate-table"><div class="candidate-head"><span>选</span><span>单词 / 词组</span><span>释义</span><span>页</span></div>${candidates.slice(0,1000).map((x,i)=>candidateRow(x,i)).join('')}</div>
    ${candidates.length>1000?`<p class="notice">预览只显示前 1000 条，但导入会包含所有已选词条。</p>`:''}
    <div class="between footer-actions"><span class="muted">自动识别只是起点；正式导入前建议抽查。</span><button class="btn primary" id="commitImport">导入 ${selected} 条</button></div></section>`;
  root.querySelector('#selectAll')?.addEventListener('click',()=>{candidates.forEach(x=>x.selected=true);renderCandidatePreview(suggestedName)});
  root.querySelector('#selectNone')?.addEventListener('click',()=>{candidates.forEach(x=>x.selected=false);renderCandidatePreview(suggestedName)});
  root.querySelectorAll<HTMLInputElement>('[data-candidate-check]').forEach(ch=>ch.addEventListener('change',()=>{candidates[Number(ch.dataset.candidateCheck)]!.selected=ch.checked;}));
  root.querySelectorAll<HTMLInputElement>('[data-term]').forEach(inp=>inp.addEventListener('input',()=>{candidates[Number(inp.dataset.term)]!.term=inp.value;}));
  root.querySelectorAll<HTMLInputElement>('[data-meaning]').forEach(inp=>inp.addEventListener('input',()=>{candidates[Number(inp.dataset.meaning)]!.meaning=inp.value;}));
  root.querySelector('#commitImport')?.addEventListener('click', async () => {
    const chosen = candidates.filter(x=>x.selected && x.term.trim() && x.meaning.trim());
    if (!chosen.length) return toast('没有可导入的词条。');
    const newWords: WordEntry[] = chosen.map(x=>({id:id(),term:x.term.trim(),meaning:x.meaning.trim(),page:x.page,source:suggestedName||'import',createdAt:Date.now()}));
    const mode = (root.querySelector('#importMode') as HTMLSelectElement).value;
    if (mode === 'replace') { state.words = newWords; state.progress = {}; state.plan = null; }
    else {
      const existing = new Set(state.words.map(w=>w.term.toLocaleLowerCase().trim()));
      state.words.push(...newWords.filter(w=>!existing.has(w.term.toLocaleLowerCase().trim())));
    }
    state.bookName = (root.querySelector('#bookName') as HTMLInputElement).value.trim() || '我的词本';
    await saveState(state); toast(`已导入 ${newWords.length} 条词汇。`); go('plan');
  });
}
function candidateRow(x: ParsedCandidate,i:number){return `<div class="candidate-row ${x.confidence==='low'?'low':''}"><input type="checkbox" data-candidate-check="${i}" ${x.selected?'checked':''}/><input data-term="${i}" value="${esc(x.term)}"/><input data-meaning="${i}" value="${esc(x.meaning)}"/><span>${x.page??'—'}</span></div>`;}

function initScreenQueue(){ screenIds = state.words.filter(w=>!state.progress[w.id]?.rating).map(w=>w.id); screenIndex=0; screenRevealed=false; }
function renderScreen(el: HTMLElement, reset=false){
  if(reset) initScreenQueue();
  const c=counts(state); if(!state.words.length){el.innerHTML=emptyAction('还没有词本','先导入 PDF 或文本。','导入词本','import');return}
  if(!screenIds.length){el.innerHTML=`${heading('SCREEN','快速筛词','空格显示释义，1 熟悉 / 2 模糊 / 3 不会。')}<section class="panel center"><h2>未筛词已经清空 🎉</h2><p class="muted">接下来只需要反复处理 ${c.weak} 个弱词。</p><button class="btn primary" id="toReview">去复习弱词</button></section>`;el.querySelector('#toReview')?.addEventListener('click',()=>go('review'));return}
  const word=wordById(screenIds[screenIndex]!); if(!word) return;
  el.innerHTML=`${heading('SCREEN',`快速筛词 · ${screenIndex+1}/${screenIds.length}`,'先判断自己是否知道，再看答案。键盘操作会比鼠标更快。')}
  <section class="flashcard"><div class="word">${esc(word.term)}</div><div class="meaning ${screenRevealed?'':'hidden-answer'}">${screenRevealed?esc(word.meaning):'按空格显示释义'}</div>${word.page?`<small>来源页 ${word.page}</small>`:''}</section>
  <div class="screen-actions">${screenRevealed?`<button class="btn known" data-rate="known"><kbd>1</kbd> 熟悉</button><button class="btn vague" data-rate="vague"><kbd>2</kbd> 模糊</button><button class="btn unknown" data-rate="unknown"><kbd>3</kbd> 不会</button>`:`<button class="btn primary wide" id="reveal">显示释义 <kbd>Space</kbd></button>`}</div>`;
  el.querySelector('#reveal')?.addEventListener('click',()=>{screenRevealed=true;renderScreen(el)});
  el.querySelectorAll<HTMLElement>('[data-rate]').forEach(b=>b.addEventListener('click',()=>rateScreen(b.dataset.rate as Rating)));
}
async function rateScreen(rating:Rating){const wid=screenIds[screenIndex]!;state.progress[wid]={...(state.progress[wid]??{wrong:0}),rating,screenedAt:dateKey()};await saveState(state);screenIndex++;screenRevealed=false;const el=document.querySelector('#view')!;if(screenIndex>=screenIds.length)initScreenQueue();renderScreen(el as HTMLElement);}

function initReviewQueue(){ reviewIds=state.words.filter(w=>['vague','unknown'].includes(state.progress[w.id]?.rating??'')).sort((a,b)=>(state.progress[b.id]?.wrong??0)-(state.progress[a.id]?.wrong??0)).map(w=>w.id);reviewIndex=0;reviewRevealed=false;}
function renderReview(el:HTMLElement,reset=false){if(reset)initReviewQueue();if(!reviewIds.length){el.innerHTML=emptyAction('当前没有弱词','把词库先快速筛一遍，模糊和不会会自动来到这里。','去筛词','screen');return}const w=wordById(reviewIds[reviewIndex]!);if(!w)return;el.innerHTML=`${heading('REVIEW',`弱词复习 · ${reviewIndex+1}/${reviewIds.length}`,'弱词按错误次数优先排列。这里的评级可以随时更新。')}<section class="flashcard"><div class="word">${esc(w.term)}</div><div class="meaning ${reviewRevealed?'':'hidden-answer'}">${reviewRevealed?esc(w.meaning):'先回忆，再显示答案'}</div><small>当前：${labelRating(state.progress[w.id]?.rating)} · 错误 ${state.progress[w.id]?.wrong??0} 次</small></section><div class="screen-actions">${reviewRevealed?`<button class="btn known" data-review-rate="known">记住了</button><button class="btn vague" data-review-rate="vague">还模糊</button><button class="btn unknown" data-review-rate="unknown">不会</button>`:`<button class="btn primary wide" id="reviewReveal">显示答案</button>`}</div>`;el.querySelector('#reviewReveal')?.addEventListener('click',()=>{reviewRevealed=true;renderReview(el)});el.querySelectorAll<HTMLElement>('[data-review-rate]').forEach(b=>b.addEventListener('click',()=>rateReview(b.dataset.reviewRate as Rating)));}
async function rateReview(rating:Rating){const wid=reviewIds[reviewIndex]!;const p=state.progress[wid]??{wrong:0};state.progress[wid]={...p,rating,reviewedAt:dateKey()};await saveState(state);reviewIndex++;reviewRevealed=false;if(reviewIndex>=reviewIds.length)initReviewQueue();renderReview(document.querySelector('#view') as HTMLElement);}

function makeQuiz(){const pool=state.words.filter(w=>['vague','unknown'].includes(state.progress[w.id]?.rating??''));if(pool.length<4)return null;const target=pool[Math.floor(Math.random()*pool.length)]!;const others=state.words.filter(w=>w.id!==target.id).sort(()=>Math.random()-.5).slice(0,3);return {wordId:target.id,options:[target,...others].map(x=>x.meaning).sort(()=>Math.random()-.5)};}
function renderQuiz(el:HTMLElement,reset=false){if(reset)quizCurrent=makeQuiz();if(!quizCurrent){el.innerHTML=emptyAction('四选一需要至少 4 个弱词','先筛出一些“模糊/不会”的词，再回来测试。','去筛词','screen');return}const w=wordById(quizCurrent.wordId)!;el.innerHTML=`${heading('QUIZ','四选一小测','优先从弱词中出题。答错会累计错误次数，但不会自动替你改变熟悉度。')}<section class="quiz-card"><div class="word small-word">${esc(w.term)}</div><div class="choices">${quizCurrent.options.map((x,i)=>`<button class="choice" data-choice="${i}"><span>${String.fromCharCode(65+i)}</span>${esc(x)}</button>`).join('')}</div></section><div id="quizFeedback"></div>`;el.querySelectorAll<HTMLElement>('[data-choice]').forEach((b,i)=>b.addEventListener('click',()=>answerQuiz(b,quizCurrent!.options[i]!,w)));}
async function answerQuiz(btn:HTMLElement,answer:string,w:WordEntry){const all=document.querySelectorAll<HTMLElement>('[data-choice]');all.forEach(x=>(x as HTMLButtonElement).disabled=true);const ok=answer===w.meaning;btn.classList.add(ok?'correct':'wrong');if(!ok){all.forEach((x,j)=>{if(quizCurrent?.options[j]===w.meaning)x.classList.add('correct')});const p=state.progress[w.id]??{wrong:0};state.progress[w.id]={...p,wrong:(p.wrong??0)+1};await saveState(state)}const f=document.querySelector('#quizFeedback')!;f.innerHTML=`<div class="notice ${ok?'good':'bad-note'}">${ok?'答对了。':'答错了，正确释义已标出。'} <button class="btn" id="nextQuiz">下一题</button></div>`;f.querySelector('#nextQuiz')?.addEventListener('click',()=>{quizCurrent=makeQuiz();renderQuiz(document.querySelector('#view') as HTMLElement)});}

function renderPlan(el:HTMLElement){const c=counts(state);if(!c.total){el.innerHTML=emptyAction('还没有可规划的词','导入词本后再设置完成时间。','导入词本','import');return}const p=planInfo(state);el.innerHTML=`${heading('PLAN','自定义学习计划','你决定总天数和最后几天专门复习；程序按剩余未筛词动态计算每天目标。')}
<section class="panel plan-config"><div class="form-row"><label>总计划天数<input id="planDays" type="number" min="2" max="365" value="${state.plan?.days??7}"/></label><label>最后专门复习<input id="reviewDays" type="number" min="1" max="30" value="${state.plan?.reviewDays??1}"/></label></div><button class="btn primary" id="savePlan">${state.plan?'重新计算计划':'开始计划'}</button><p class="muted">例如：7 天 + 1 个复习日 = 前 6 天筛完新词，第 7 天只刷弱词。</p></section>
${p?`<section class="panel"><div class="plan-hero"><div><span class="tag">DAY ${p.day}</span><h2>${p.isReviewPhase?'集中复习':`今日新词 ${p.todayScreened}/${p.targetToday}`}</h2><p>计划结束：${p.endDate}</p></div><div class="plan-number">${p.unseen}<small>剩余未筛</small></div></div><div class="progress"><i style="width:${p.targetToday?Math.min(100,p.todayScreened/p.targetToday*100):100}%"></i></div><div class="legend"><span>学习阶段 ${p.learningDays} 天</span><span>复习阶段 ${state.plan!.reviewDays} 天</span><span>弱词 ${p.weak}</span></div></section>`:''}`;
  el.querySelector('#savePlan')?.addEventListener('click',async()=>{const days=Number((el.querySelector('#planDays') as HTMLInputElement).value);const reviewDays=Number((el.querySelector('#reviewDays') as HTMLInputElement).value);if(days<2||days>365||reviewDays<1||reviewDays>=days)return toast('总天数至少 2 天，复习天数必须小于总天数。');state.plan={startDate:dateKey(),days,reviewDays,initialUnseen:c.unseen,initialScreened:c.total-c.unseen};await saveState(state);toast('学习计划已更新。');renderPlan(el);});}

function renderLibrary(el:HTMLElement){const c=counts(state);el.innerHTML=`${heading('LIBRARY','词库','搜索、查看评级，并手动修正自动识别的词条。')}<section class="panel"><div class="between"><input id="search" class="search" placeholder="搜索单词或释义"/><select id="filter"><option value="all">全部 ${c.total}</option><option value="known">熟悉 ${c.known}</option><option value="vague">模糊 ${c.vague}</option><option value="unknown">不会 ${c.unknown}</option><option value="unseen">未筛 ${c.unseen}</option></select></div><div id="wordTable"></div></section>`;const search=el.querySelector('#search') as HTMLInputElement,filter=el.querySelector('#filter') as HTMLSelectElement;const draw=()=>drawLibrary(el.querySelector('#wordTable') as HTMLElement,search.value,filter.value);search.addEventListener('input',draw);filter.addEventListener('change',draw);draw();}
function drawLibrary(root:HTMLElement,q:string,filter:string){q=q.toLocaleLowerCase().trim();const rows=state.words.filter(w=>{const r=state.progress[w.id]?.rating;const fm=filter==='all'||(filter==='unseen'&&!r)||r===filter;return fm&&(!q||w.term.toLocaleLowerCase().includes(q)||w.meaning.toLocaleLowerCase().includes(q));}).slice(0,500);root.innerHTML=`<div class="word-table">${rows.map(w=>`<div class="word-row"><div><b>${esc(w.term)}</b><span>${esc(w.meaning)}</span></div><select data-lib-rate="${w.id}"><option value="" ${!state.progress[w.id]?.rating?'selected':''}>未筛</option><option value="known" ${state.progress[w.id]?.rating==='known'?'selected':''}>熟悉</option><option value="vague" ${state.progress[w.id]?.rating==='vague'?'selected':''}>模糊</option><option value="unknown" ${state.progress[w.id]?.rating==='unknown'?'selected':''}>不会</option></select></div>`).join('')}</div>${rows.length>=500?'<p class="muted">最多显示 500 条，请用搜索缩小范围。</p>':''}`;root.querySelectorAll<HTMLSelectElement>('[data-lib-rate]').forEach(s=>s.addEventListener('change',async()=>{const wid=s.dataset.libRate!;if(!s.value)delete state.progress[wid];else state.progress[wid]={...(state.progress[wid]??{wrong:0}),rating:s.value as Rating,screenedAt:dateKey()};await saveState(state)}));}

function renderData(el:HTMLElement){const c=counts(state);el.innerHTML=`${heading('DATA','数据与备份','学习记录默认保存在当前浏览器。建议定期导出 JSON 备份。')}<div class="data-grid"><section class="panel"><h3>导出</h3><p class="muted">JSON 可以完整恢复词库、评级和计划；CSV 适合 Excel 或打印。</p><div class="stack"><button class="btn primary" id="backup">完整备份 JSON</button><button class="btn" id="weakCsv">导出弱词 CSV（${c.weak}）</button><button class="btn" id="allCsv">导出全部 CSV（${c.total}）</button></div></section><section class="panel"><h3>恢复 / 清空</h3><label class="file-btn">导入 LexiFilter JSON<input id="restore" type="file" accept="application/json"/></label><button class="btn danger" id="clear">清空当前所有数据</button><p class="muted">清空操作不可撤销，请先备份。</p></section></div>`;el.querySelector('#backup')?.addEventListener('click',()=>exportJson(state));el.querySelector('#weakCsv')?.addEventListener('click',()=>exportCsv(state,state.words.filter(w=>['vague','unknown'].includes(state.progress[w.id]?.rating??''))));el.querySelector('#allCsv')?.addEventListener('click',()=>exportCsv(state,state.words));el.querySelector('#restore')?.addEventListener('change',async(e)=>{const f=(e.target as HTMLInputElement).files?.[0];if(!f)return;try{const parsed=JSON.parse(await f.text()) as AppState;if(parsed.version!==1||!Array.isArray(parsed.words))throw new Error('格式不兼容');state=parsed;await saveState(state);toast('备份已恢复。');go('home')}catch(err){toast(`恢复失败：${err instanceof Error?err.message:String(err)}`)}});el.querySelector('#clear')?.addEventListener('click',async()=>{if(!confirm('确定清空全部词库、评级和计划吗？'))return;state=emptyState();await saveState(state);go('home')});}

function emptyAction(title:string,sub:string,button:string,target:string){return `${heading('WORDFLOW',title,sub)}<section class="panel center"><button class="btn primary" data-empty-go="${target}">${button}</button></section>`;}
function labelRating(r?:Rating){return r==='known'?'熟悉':r==='vague'?'模糊':r==='unknown'?'不会':'未筛';}
function toast(message:string){let t=document.querySelector('.toast') as HTMLElement|null;if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t)}t.textContent=message;t.classList.add('show');setTimeout(()=>t?.classList.remove('show'),3000)}

document.addEventListener('click',e=>{const target=(e.target as HTMLElement).closest<HTMLElement>('[data-empty-go]');if(target)go(target.dataset.emptyGo!)});
document.addEventListener('keydown',e=>{if(currentView==='screen'){const tag=(e.target as HTMLElement).tagName;if(['INPUT','TEXTAREA','SELECT'].includes(tag))return;if(e.code==='Space'){e.preventDefault();if(!screenRevealed){screenRevealed=true;renderScreen(document.querySelector('#view') as HTMLElement)}}if(screenRevealed&&['1','2','3'].includes(e.key))rateScreen(({1:'known',2:'vague',3:'unknown'} as Record<string,Rating>)[e.key]!);}});

state=await loadState();shell();render();
