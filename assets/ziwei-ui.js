/* =========================================================================
   紫微命门 · 前端交互
   引擎：assets/ziwei.engine.js（lib/ziwei 纯前端计算，懒加载）
   解读：https://api.haoran.lu/api/interpret（SSE 流式，服务端持 key）
   ========================================================================= */
(() => {
  'use strict';

  const API = 'https://api.haoran.lu';
  const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
  const STEMS = '甲乙丙丁戊己庚辛壬癸';
  const HUA_CLS = { '禄': 'h-lu', '权': 'h-quan', '科': 'h-ke', '忌': 'h-ji' };
  /* 十二宫在 4×4 网格中的落位（地支索引），中间 2×2 是信息卡 */
  const GRID = [
    [5, 6, 7, 8],        /* 巳 午 未 申 */
    [4, null, null, 9],  /* 辰     酉 */
    [3, null, null, 10], /* 卯     戌 */
    [2, 1, 0, 11]        /* 寅 丑 子 亥 */
  ];
  const CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  const lunarDayName = d =>
    d <= 10 ? '初' + CN[d] :
    d === 20 ? '二十' :
    d < 20 ? '十' + CN[d - 10] :
    d === 30 ? '三十' : '廿' + CN[d - 20];
  const lunarMonthName = m => (m === 1 ? '正' : m === 11 ? '冬' : m === 12 ? '腊' : CN[m]) + '月';

  /* ---------- DOM ---------- */
  const overlay = document.getElementById('zw-overlay');
  const body = document.getElementById('zw-body');
  const entryBtn = document.getElementById('zw-entry');
  const closeBtn = document.getElementById('zw-close');

  /* ---------- 引擎懒加载 ---------- */
  let enginePromise = null;
  const loadEngine = () => enginePromise ||= new Promise((res, rej) => {
    if (window.ZiweiEngine && window.ZiweiEngine.generateChart) {
      res(window.ZiweiEngine); return;
    }
    const s = document.createElement('script');
    s.src = 'assets/ziwei.engine.js';
    s.onload = () => window.ZiweiEngine && window.ZiweiEngine.generateChart
      ? res(window.ZiweiEngine)
      : rej(new Error('引擎加载异常'));
    s.onerror = () => rej(new Error('引擎加载失败，请检查网络后重试'));
    document.head.appendChild(s);
  });

  /* ---------- 状态 ---------- */
  let opened = false;
  let chart = null;        /* 完整排盘结果 */
  let compact = null;      /* 送 AI 的精简命盘 */
  let chartTitle = '';     /* 出生信息一句话 */
  let history = [];        /* 追问历史（user/assistant） */
  let streaming = false;
  let firstAsked = false;

  /* ---------- 开 / 关 ---------- */
  const open = () => {
    overlay.classList.add('on');
    document.body.classList.add('zw-open');      /* 首页文字隐去，星空继续流动 */
    if (!opened) { opened = true; renderForm(); }
  };
  const close = () => {
    overlay.classList.remove('on');
    document.body.classList.remove('zw-open');  /* 文字淡回 */
  };
  entryBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('on')) close();
  });

  /* ---------- 工具 ---------- */
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const $ = id => body.querySelector('#' + id);

  function mdToHtml(text) {
    let h = esc(text);
    /* 解读固定四段：段首小标题统一成加粗标题，模型加不加粗都好看 */
    h = h.replace(/^(?:\*\*)?(性格|事业|感情|提醒)(?:\*\*)?[：:]/gm, '<b class="md-k">$1</b>');
    h = h.replace(/^#{1,4}\s*(.+)$/gm, '<span class="md-h">$1</span>');
    h = h.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    h = h.replace(/^\s*[-•]\s+(.+)$/gm, '<span class="md-li">· $1</span>');
    h = h.replace(/\n{2,}/g, '<br>');
    h = h.replace(/\n/g, '<br>');
    return h;
  }

  /* 首次解读的格式指令：服务端按 question 解析，等于给首轮加约束，
     换来「结构固定、篇幅短、直给结论」的解读，而不是又长又散的小作文 */
  const FIRST_INSTRUCTION =
    '直接给结论。四段，段首分别为「性格」「事业」「感情」「提醒」，每段 1-2 句；' +
    '每段末尾用括号注明依据（宫位 + 星曜 + 四化）。全文 220 字以内。' +
    '不要思考过程、不要开场白、不要总结段、不要免责声明。';

  /* 追问也限长，否则模型又会铺开写 */
  const FOLLOW_SUFFIX = '\n\n（回答控制在 200 字内，直接给结论和依据，不要免责声明。）';

  /* 输出清洗：去掉模型爱加的免责声明、空段、复读开场白 */
  function cleanOutput(text) {
    const lines = text
      .split('\n')
      .filter(l => !/^\s*(以上内容仅供参考|仅供参考|不构成.{0,12}建议|注[:：]?\s*仅供)/.test(l));
    while (lines.length && !lines[0].trim()) lines.shift();
    if (lines.length && /^(好的|以下是|根据(您|你)提供的?命盘)/.test(lines[0].trim()) && lines[0].trim().length <= 30) {
      lines.shift();
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /* =========================================================
     表单
     ========================================================= */
  function renderForm() {
    overlay.scrollTop = 0;              /* 手机上整页滚动后回到顶部 */
    const saved = {};
    try { Object.assign(saved, JSON.parse(localStorage.getItem('zw-form') || '{}')); } catch {}
    const def = { name: saved.name || '', gender: saved.gender || 'male', cal: saved.cal || 'solar' };

    /* 子时拆早晚：晚子时（23–24）按次日排盘，与原平台 formToBirthInfo 口径一致 */
    const hours =
      `<option value="0e">早子时 · 00–01（当日）</option>` +
      `<option value="0l">晚子时 · 23–24（次日排盘）</option>` +
      Array.from({ length: 11 }, (_, i) =>
        `<option value="${i + 1}">${BRANCHES[i + 1]}时 · ${['01–03','03–05','05–07','07–09','09–11','11–13','13–15','15–17','17–19','19–21','21–23'][i]}</option>`).join('');

    body.innerHTML = `
      <div class="zw-cols zw-cols-form">
        <form class="zw-form" id="zw-form" novalidate>
          <div class="zw-form-head">
            <div class="zw-title">紫微命门</div>
          </div>
          <div class="zw-field"><label>称呼 <i class="zw-req">*</i></label>
            <input class="zw-input" id="zf-name" type="text" maxlength="12" enterkeyhint="done" placeholder="请填写称呼" value="${esc(def.name)}">
          </div>
          <div class="zw-row">
            <div class="zw-field"><label>性别</label>
              <div class="zw-seg" id="zf-gender">
                <button type="button" data-v="male" class="${def.gender === 'male' ? 'sel' : ''}">男</button>
                <button type="button" data-v="female" class="${def.gender === 'female' ? 'sel' : ''}">女</button>
              </div>
            </div>
            <div class="zw-field"><label>历法</label>
              <div class="zw-seg" id="zf-cal">
                <button type="button" data-v="solar" class="${def.cal === 'solar' ? 'sel' : ''}">公历</button>
                <button type="button" data-v="lunar" class="${def.cal === 'lunar' ? 'sel' : ''}">农历</button>
              </div>
            </div>
          </div>
          <div class="zw-field" id="zf-solar-wrap"><label>出生日期（公历）</label>
            <input class="zw-input" id="zf-date" type="date" min="1901-01-01" max="2099-12-31" value="${saved.solarDate || '1995-06-15'}">
          </div>
          <div class="zw-field" id="zf-lunar-wrap" style="display:none"><label>出生日期（农历）</label>
            <div class="zw-row">
              <input class="zw-input" id="zf-lyear" type="number" min="1901" max="2099" step="1" value="${saved.lunarYear || 1995}">
              <select class="zw-select" id="zf-lmonth">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${lunarMonthName(i + 1)}</option>`).join('')}</select>
              <select class="zw-select" id="zf-lday">${Array.from({ length: 30 }, (_, i) => `<option value="${i + 1}">${lunarDayName(i + 1)}</option>`).join('')}</select>
            </div>
            <label class="zw-check"><input type="checkbox" id="zf-lleap">闰月</label>
          </div>
          <div class="zw-field"><label>出生时辰</label>
            <select class="zw-select" id="zf-hour">${hours}</select>
          </div>
          <div class="zw-err" id="zf-err"></div>
          <button class="zw-go" id="zf-go" type="submit">排 盘</button>
        </form>
      </div>`;

    /* 分段选择器 */
    const segInit = (id, key) => {
      const seg = $(id);
      seg.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        seg.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b));
        const v = b.dataset.v;
        if (key === 'cal') {
          $('zf-solar-wrap').style.display = v === 'solar' ? '' : 'none';
          $('zf-lunar-wrap').style.display = v === 'lunar' ? '' : 'none';
        }
      });
    };
    segInit('zf-gender'); segInit('zf-cal');
    if (def.cal === 'lunar') { $('zf-solar-wrap').style.display = 'none'; $('zf-lunar-wrap').style.display = ''; }
    if (saved.lunarMonth) $('zf-lmonth').value = saved.lunarMonth;
    if (saved.lunarDay) $('zf-lday').value = saved.lunarDay;
    if (saved.hourRaw) $('zf-hour').value = saved.hourRaw;

    $('zw-form').addEventListener('submit', e => { e.preventDefault(); submitForm(); });
  }

  function readForm() {
    const seg = id => $(id).querySelector('button.sel').dataset.v;
    const hv = $('zf-hour').value;
    return {
      name: $('zf-name').value.trim(),
      gender: seg('zf-gender'),
      cal: seg('zf-cal'),
      solarDate: $('zf-date').value,
      lunarYear: +$('zf-lyear').value,
      lunarMonth: +$('zf-lmonth').value,
      lunarDay: +$('zf-lday').value,
      lunarLeap: $('zf-lleap').checked,
      hourRaw: hv,                        /* '0e' 早子时 | '0l' 晚子时 | '1'..'11' */
      hour: hv === '0e' || hv === '0l' ? 0 : parseInt(hv, 10),
      lateZi: hv === '0l',
    };
  }

  /* 晚子时换日：排盘日 = 出生日期 +1（引擎口径：入参已是换日后的日期） */
  const shiftDay = (y, m, d) => {
    const dt = new Date(Date.UTC(y, m - 1, d + 1));
    return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
  };

  async function submitForm() {
    const err = $('zf-err');
    err.classList.remove('on');
    const f = readForm();
    const fail = msg => {
      err.textContent = msg; err.classList.add('on');
    };

    /* 校验 */
    if (!f.name) {
      $('zf-name').focus();
      return fail('请先填写称呼');
    }
    if (f.cal === 'solar') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.solarDate)) return fail('请选择一个有效的公历日期');
    } else {
      if (!Number.isInteger(f.lunarYear) || f.lunarYear < 1901 || f.lunarYear > 2099) return fail('农历年份需在 1901–2099 之间');
    }

    const go = $('zf-go');
    go.disabled = true; go.textContent = '推 演 中';
    const reset = () => { go.disabled = false; go.textContent = '排 盘'; };

    /* 引擎先就位（农历换算本身也依赖它），失败立即回退表单 */
    try {
      await loadEngine();
    } catch (e) {
      reset();
      return fail(String((e && e.message) || e));
    }

    /* 换算到公历，交给引擎 */
    let y, m, d;
    try {
      if (f.cal === 'solar') {
        [y, m, d] = f.solarDate.split('-').map(Number);
      } else {
        const lm = f.lunarLeap ? -f.lunarMonth : f.lunarMonth;
        const solar = window.ZiweiEngine.Lunar.fromYmd(f.lunarYear, lm, f.lunarDay).getSolar();
        y = solar.getYear(); m = solar.getMonth(); d = solar.getDay();
      }
    } catch {
      reset();
      return fail('这个农历日期不存在，请核对（比如大小月、闰月）');
    }
    if (f.lateZi) [y, m, d] = shiftDay(y, m, d);

    /* 记住输入 */
    try { localStorage.setItem('zw-form', JSON.stringify(f)); } catch {}

    try {
      chart = window.ZiweiEngine.generateChart({
        year: y, month: m, day: d, hour: f.hour, gender: f.gender, name: f.name || undefined,
      });
      history = []; firstAsked = false;
      renderChart(f);
    } catch (e) {
      reset();
      fail(e && e.message ? String(e.message) : '排盘失败，请稍后重试');
    }
  }

  /* =========================================================
     命盘绘制
     ========================================================= */
  function buildCompact(f) {
    const li = chart.lunarInfo;
    const gzYear = `${STEMS[li.yearStem]}${BRANCHES[li.yearBranch]}年`;
    const lunarStr = `${gzYear} ${li.isLeapMonth ? '闰' : ''}${lunarMonthName(Math.abs(li.lunarMonth))}${lunarDayName(li.lunarDay)}`;
    chartTitle = `${f.name || '命主'} · 公历 ${chart.birthInfo.year}-${String(chart.birthInfo.month).padStart(2, '0')}-${String(chart.birthInfo.day).padStart(2, '0')} ${BRANCHES[chart.birthInfo.hour]}时${f.lateZi ? '（晚）' : ''} · ${lunarStr}`;
    const curDX = chart.daXians && chart.daXians[chart.currentDaXianIndex];
    return {
      基本信息: {
        称呼: f.name || '命主',
        性别: f.gender === 'male' ? '男' : '女',
        阴阳性别: chart.yinYangGender || null,
        公历生日: `${chart.birthInfo.year}年${chart.birthInfo.month}月${chart.birthInfo.day}日`,
        农历生日: lunarStr,
        出生时辰: `${BRANCHES[chart.birthInfo.hour]}时${f.lateZi ? '（晚子时，23:00–24:00 出生，已按次日排盘）' : f.hour === 0 ? '（早子时，00:00–01:00 出生）' : ''}`,
        五行局: chart.wuxingJuName,
        命主星: chart.mingZhu || null,
        身主星: chart.shenZhu || null,
        现行大限: curDX ? `${curDX.startAge}-${curDX.endAge}岁 行${curDX.palaceName}` : null,
      },
      十二宫: chart.palaces.map(p => ({
        宫位名: p.name,
        干支: STEMS[p.stem] + BRANCHES[p.branch],
        大限年龄: p.daXianAge ? `${p.daXianAge[0]}-${p.daXianAge[1]}岁` : null,
        宫位标记: [p.isMingGong ? '命宫' : null, p.isShenGong ? '身宫' : null].filter(Boolean).join('、') || null,
        星曜: p.stars.map(s => ({
          星名: s.name,
          类别: ({ major: '主星', minor: '辅星', lucky: '吉星', sha: '煞星' })[s.type] || s.type,
          亮度: s.brightnessRaw || null,
          四化: s.siHua || null,
        })),
        宫内自化: p.selfSihua && p.selfSihua.length
          ? p.selfSihua.map(x => `${x.starName}自化${x.siHua}`) : null,
        空宫借对宫: p.isEmpty ? (p.borrowedStars || []) : null,
      })),
    };
  }

  function renderChart(f) {
    overlay.scrollTop = 0;
    compact = buildCompact(f);

    const brightCls = b => ({
      '庙': '', '旺': '', '得': 'b2', '利': 'b2', '平': 'b3',
      '不': 'b4', '闲': 'b4', '陷': 'b4', '地': 'b3',
    }[b] || 'b3');

    const starHTML = s => {
      let h = `<span class="zw-major ${s.type === 'major' ? brightCls(s.brightnessRaw) : ''}">${esc(s.name)}`;
      if (s.type === 'major' && s.brightnessRaw) h += `<sup>${esc(s.brightnessRaw)}</sup>`;
      h += `</span>`;
      if (s.siHua) h += `<i class="zw-hua ${HUA_CLS[s.siHua] || ''}">${esc(s.siHua)}</i>`;
      return h;
    };

    const cellHTML = p => {
      const majors = p.stars.filter(s => s.type === 'major');
      const luckies = p.stars.filter(s => s.type === 'lucky');
      const shas = p.stars.filter(s => s.type === 'sha');
      const minors = p.stars.filter(s => s.type === 'minor');
      let stars = '';
      if (!majors.length) {
        if (p.borrowedStars && p.borrowedStars.length) {
          /* 空宫借对宫：主星半透明 + 「借」标记，不额外占行 */
          stars = p.borrowedStars.map(n =>
            `<span class="zw-major zw-borrow">${esc(n)}<sup>借</sup></span>`).join('');
        } else {
          stars = `<span class="zw-empty">空宫</span>`;
        }
      } else {
        stars += majors.map(starHTML).join('');
      }
      const kinds = [];
      const fortune = [];
      if (luckies.length) fortune.push(`<div class="zw-lucky">${luckies.map(s => esc(s.name) + (s.siHua ? `<i class="zw-hua ${HUA_CLS[s.siHua]}">${s.siHua}</i>` : '')).join('')}</div>`);
      if (shas.length) fortune.push(`<div class="zw-sha">${shas.map(s => esc(s.name) + (s.siHua ? `<i class="zw-hua ${HUA_CLS[s.siHua]}">${s.siHua}</i>` : '')).join('')}</div>`);
      if (fortune.length) kinds.push(`<div class="zw-fortune">${fortune.join('')}</div>`);
      if (minors.length) kinds.push(`<div class="zw-lucky zw-minor">${minors.map(s => esc(s.name)).join('')}</div>`);
      if (p.selfSihua && p.selfSihua.length)
        kinds.push(`<div class="zw-zihua">${p.selfSihua.map(x => `自化${esc(x.siHua)}·${esc(x.starName)}`).join(' ')}</div>`);

      return `
        <div class="zw-cell ${p.isCurrentDaXian ? 'cur' : ''}">
          <div class="zw-cell-top">
            <span class="zw-gname ${p.isMingGong ? 'g-ming' : ''} ${p.isShenGong ? 'g-shen' : ''}">${esc(p.name)}</span>
            ${p.isMingGong ? '<i class="zw-tag t-ming">命</i>' : ''}
            ${p.isShenGong ? '<i class="zw-tag t-shen">身</i>' : ''}
            ${p.daXianAge ? `<span class="zw-dx">${p.daXianAge[0]}–${p.daXianAge[1]}</span>` : ''}
          </div>
          <div class="zw-gz">${STEMS[p.stem]}${BRANCHES[p.branch]}</div>
          <div class="zw-stars">${stars}</div>
          ${kinds.join('')}
        </div>`;
    };

    let cells = '';
    let order = 0;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const b = GRID[r][c];
        if (b === null) continue;
        const p = chart.palaces.find(x => x.branch === b);
        if (!p) continue;
        cells += cellHTML(p).replace('class="zw-cell',
          `style="grid-area:${r + 1}/${c + 1};animation-delay:${order * 38}ms" class="zw-cell`);
        order++;
      }
    }

    const li = chart.lunarInfo;
    const curDX = chart.daXians && chart.daXians[chart.currentDaXianIndex];
    const lunarStr = `${STEMS[li.yearStem]}${BRANCHES[li.yearBranch]}年 ${li.isLeapMonth ? '闰' : ''}${lunarMonthName(Math.abs(li.lunarMonth))}${lunarDayName(li.lunarDay)}`;
    const pillars = li.fourPillars ? li.fourPillars.join(' ') : null;

    body.innerHTML = `
      <div class="zw-cols zw-cols-chart">
        <div class="zw-col zw-col-ai">
          <div class="zw-ai">
            <div class="zw-label">解读</div>
            <div class="zw-ai-log" id="zw-ailog">
              <div class="zw-ai-hint">命盘已成，点击「开始解读」。</div>
            </div>
            <div class="zw-ai-chips" id="zw-ai-chips" hidden>
              <button type="button">今年的感情</button>
              <button type="button">事业方向</button>
              <button type="button">要注意什么</button>
            </div>
            <div class="zw-ai-bar">
              <button id="zw-ai-start" type="button">开始解读</button>
              <input id="zw-ai-q" type="text" maxlength="200" enterkeyhint="send" placeholder="继续追问…" disabled>
              <button id="zw-ai-send" type="button" disabled>发 送</button>
            </div>
          </div>
        </div>
        <div class="zw-col zw-col-chart">
          <div class="zw-head">
            <div>
              <div class="zw-label">紫微命盘</div>
              <div class="zw-title zw-title-chart" style="font-size:clamp(14px,1.7vw,19px)">${esc(chartTitle)}</div>
            </div>
            <button class="zw-rebtn" id="zw-redo" type="button">↺ 重新排盘</button>
          </div>
          <div class="zw-grid">
            ${cells}
            <div class="zw-center">
              <div class="zw-kv"><span>五行局</span><b>${esc(chart.wuxingJuName)}</b></div>
              <div class="zw-kv"><span>命主 · 身主</span><b>${esc(chart.mingZhu || '—')} · ${esc(chart.shenZhu || '—')}</b></div>
              <div class="zw-kv"><span>阴阳性别</span><b>${esc(chart.yinYangGender || '—')}</b></div>
              <div class="zw-kv ${curDX ? 'hl' : ''}"><span>现行大限</span><b>${curDX ? `${curDX.startAge}–${curDX.endAge}岁 · ${esc(curDX.palaceName)}` : '—'}</b></div>
              <div class="zw-kv"><span>时辰</span><b>${BRANCHES[chart.birthInfo.hour]}时${f.lateZi ? ' · 晚（按次日）' : f.hour === 0 ? ' · 早' : ''}</b></div>
              ${pillars ? `<div class="zw-kv"><span>四柱</span><b>${esc(pillars)}</b></div>` : ''}
              <div class="zw-kv"><span>虚岁</span><b>${chart.currentAge}</b></div>
            </div>
          </div>
        </div>
      </div>`;

    $('zw-redo').addEventListener('click', renderForm);
    $('zw-ai-start').addEventListener('click', () => askAI());
    $('zw-ai-send').addEventListener('click', sendFollowUp);
    $('zw-ai-q').addEventListener('keydown', e => { if (e.key === 'Enter') sendFollowUp(); });
    /* 快捷问题：解读完成后出现，点一下直接问 */
    $('zw-ai-chips').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b || !firstAsked || streaming) return;
      askAI(b.textContent.trim());
    });
  }

  /* =========================================================
     AI 流式对话
     ========================================================= */
  function setStreamingUI(on) {
    streaming = on;
    const q = $('zw-ai-q'), send = $('zw-ai-send'), start = $('zw-ai-start');
    if (!q || !send) return;
    q.disabled = on || !firstAsked;
    send.disabled = on || !firstAsked;
    send.textContent = on ? '···' : '发 送';
    if (start && firstAsked) start.style.display = 'none';
    const chips = $('zw-ai-chips');
    if (chips) chips.hidden = !firstAsked || on;
  }

  function appendUserBubble(text) {
    const log = $('zw-ailog');
    const el = document.createElement('div');
    el.className = 'zw-u-bubble';
    el.textContent = text;
    log.appendChild(el);
  }

  /* 首字前的等待提示：分段文案 + 模型思考字数，避免看起来像卡死 */
  const WAIT_STEPS = [
    ['正在推演命盘…', 0],
    ['星曜与四化已就位，正在组织判断…', 8000],
    ['模型正在逐宫推演，思路较长，请稍候…', 22000],
  ];
  const waitTimers = new WeakMap();
  function startWait(el) {
    const st = { t0: Date.now(), chars: 0, id: 0 };
    const tick = () => {
      const ms = Date.now() - st.t0;
      let text = WAIT_STEPS[0][0];
      for (const [t, at] of WAIT_STEPS) if (ms >= at) text = t;
      const detail = st.chars ? `（已推演 ${st.chars} 字）` : '';
      el.innerHTML = `<span class="zw-thinking">${text}${detail}</span>`;
    };
    tick();
    st.id = setInterval(tick, 1000);
    waitTimers.set(el, st);
  }
  function bumpWait(el, n) {
    const st = waitTimers.get(el);
    if (st) st.chars += n;
  }
  function stopWait(el) {
    const st = waitTimers.get(el);
    if (st) { clearInterval(st.id); waitTimers.delete(el); }
  }

  function appendAssistantBubble() {
    const log = $('zw-ailog');
    const el = document.createElement('div');
    el.className = 'zw-a-md';
    log.appendChild(el);
    startWait(el);
    return el;
  }

  /* 窄屏是整页一起滚（滚动容器 = 浮层本身），桌面仍是解读区内部滚动 */
  const isNarrow = () => window.matchMedia('(max-width: 860px)').matches;
  const scroller = () => (isNarrow() ? overlay : $('zw-ailog'));
  const nearBottom = el => el.scrollHeight - el.scrollTop - el.clientHeight < 90;
  const scrollLog = force => {
    const el = scroller(); if (!el) return;
    if (force || nearBottom(el)) el.scrollTop = el.scrollHeight;
  };

  async function askAI(question) {
    if (streaming || !compact) return;
    const log = $('zw-ailog');
    log.querySelector('.zw-ai-hint')?.remove();
    if (question) { appendUserBubble(question); }
    const bubble = appendAssistantBubble();
    /* 手机上整页一起滚，直接把新回答的起始位置送到眼前；桌面滚解读区 */
    if (isNarrow()) bubble.scrollIntoView({ block: 'start' });
    else scrollLog(true);
    setStreamingUI(true);

    /* 首轮不带 question 时后端会走「完整解读」的长提示词，模型思考极久、输出冗长。
       统一按追问通道发送，把格式要求写进 question，篇幅可控、出字更快。 */
    const payload = {
      chart: compact,
      question: question ? question + FOLLOW_SUFFIX : FIRST_INSTRUCTION,
    };
    if (question) payload.history = history.slice(-12);

    let full = '';
    try {
      const resp = await fetch(`${API}/api/interpret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok || !resp.body) {
        let detail = `HTTP ${resp.status}`;
        try { detail = (await resp.json()).detail || detail; } catch {}
        throw new Error(detail);
      }

      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const data = t.slice(5).trim();
          if (data === '[DONE]') continue;
          let j; try { j = JSON.parse(data); } catch { continue; }
          if (j.error) throw new Error(String(j.error));
          const delta = j.choices?.[0]?.delta || {};
          /* 思考阶段不展示内容，只累计字数当进度，让等待有反馈 */
          if (delta.reasoning_content) bumpWait(bubble, delta.reasoning_content.length);
          if (delta.content) {
            if (full === '') stopWait(bubble);
            full += delta.content;
            bubble.innerHTML = mdToHtml(cleanOutput(full));
            bubble.classList.add('zw-caret');
            scrollLog();
          }
        }
      }
      full = cleanOutput(full);
      if (!full) full = '（模型没有返回内容，请稍后再试）';
      bubble.innerHTML = mdToHtml(full);
      scrollLog();
      /* 首轮的格式指令不是用户提问，不写进追问历史 */
      if (question) history.push({ role: 'user', content: question });
      /* 后端限制 history 每条 ≤4000 字符，超长解读截断入列（展示不受影响） */
      const trim4hist = s => s.length > 3800 ? s.slice(0, 3800) + '…（后略）' : s;
      history.push({ role: 'assistant', content: trim4hist(full) });
      if (history.length > 14) history = history.slice(-14);
      firstAsked = true;
    } catch (e) {
      const msg = String((e && e.message) || e);
      bubble.innerHTML = `<span class="zw-thinking" style="color:rgba(240,106,106,.75)">✕ ${esc(msg)}</span>`;
    } finally {
      stopWait(bubble);
      bubble.classList.remove('zw-caret');
      setStreamingUI(false);
    }
  }

  function sendFollowUp() {
    const q = $('zw-ai-q');
    const text = q.value.trim();
    if (!text || streaming) return;
    q.value = '';
    askAI(text);
  }
})();
