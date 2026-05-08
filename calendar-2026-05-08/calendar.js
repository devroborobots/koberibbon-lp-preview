(function () {
  'use strict';

  /* ============================================================
     設定
     ============================================================ */
  var CALENDAR_ID = 'kobe-ribbon.co.jp_bt1kbo4jj56uaa75kl0ff3dsfc@group.calendar.google.com';

  var ICS_URL = 'https://calendar.google.com/calendar/ical/' +
    encodeURIComponent(CALENDAR_ID) + '/public/basic.ics';

  // ブラウザ直 fetch は CORS エラーになるため、モックでは公開 CORS プロキシ経由。
  // 本番（Shopify セクション）では以下のいずれかに差し替え：
  //   1) Google Calendar API v3（HTTP Referrer 制限付き API キー使用）
  //   2) Shopify App Proxy 経由でサーバ側 fetch
  //   3) Cloudflare Workers などの自前 CORS プロキシ
  var FETCH_URLS = [
    'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(ICS_URL),
    'https://corsproxy.io/?' + encodeURIComponent(ICS_URL)
  ];

  // 曜日別の営業時間（0=日 .. 6=土）。null は「営業時間表示なし」。
  var HOURS_BY_WEEKDAY = {
    0: null,            // 日（通常 定休日）
    1: '5:15–15:00',  // 月
    2: '6:00–15:00',  // 火
    3: '6:00–15:00',  // 水
    4: null,            // 木（通常 定休日）
    5: '5:15–15:00',  // 金
    6: '6:00–15:00'   // 土
  };

  var MONTH_EN = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

  /* ============================================================
     状態
     ============================================================ */
  var state = {
    viewYear: null,
    viewMonth: null,
    closedMap: null,
    rawEvents: null
  };

  /* ============================================================
     ユーティリティ
     ============================================================ */
  function isoDate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
  }

  function span(className, text) {
    var el = document.createElement('span');
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  /* ============================================================
     ICS 取得 → ical.js Event[] 抽出
     ============================================================ */
  function fetchOne(url) {
    return fetch(url, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    });
  }

  function fetchIcs() {
    var urls = FETCH_URLS.slice();
    function tryNext() {
      if (!urls.length) return Promise.reject(new Error('全 CORS プロキシで取得失敗'));
      var url = urls.shift();
      return fetchOne(url).catch(function (err) {
        console.warn('proxy failed, trying next:', url, err.message);
        return tryNext();
      });
    }
    return tryNext().then(function (text) {
      var jcal = ICAL.parse(text);
      var comp = new ICAL.Component(jcal);
      var vevents = comp.getAllSubcomponents('vevent');
      return vevents.map(function (v) { return new ICAL.Event(v); });
    });
  }

  /* ============================================================
     表示中の月に該当する休業日マップを構築
     - 終日 / 時刻あり / 複数日 / 繰り返し（RRULE）すべて対応
     - 1 日でも該当範囲がかかっていればその日は「休業」として登録
     ============================================================ */
  function buildClosedMap(events, year, month) {
    var monthStart = new Date(year, month, 1);
    var monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
    var rangeIcalEnd = ICAL.Time.fromJSDate(new Date(year, month + 1, 1), false);

    var map = new Map();

    events.forEach(function (event) {
      var summary = (event.summary || '休業').trim();

      if (event.isRecurring()) {
        var iter = event.iterator();
        var nextTime;
        while ((nextTime = iter.next())) {
          if (nextTime.compare(rangeIcalEnd) >= 0) break;
          var occ = event.getOccurrenceDetails(nextTime);
          var jsStart = occ.startDate.toJSDate();
          var jsEnd = occ.endDate.toJSDate();
          if (jsEnd <= monthStart) continue;
          markRange(map, jsStart, jsEnd, summary, monthStart, monthEnd);
        }
      } else {
        var s = event.startDate.toJSDate();
        var e = event.endDate ? event.endDate.toJSDate() : new Date(s.getTime() + 24 * 60 * 60 * 1000);
        if (e <= monthStart || s > monthEnd) return;
        markRange(map, s, e, summary, monthStart, monthEnd);
      }
    });

    return map;
  }

  function markRange(map, start, end, summary, rangeStart, rangeEnd) {
    var cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    while (cur < end) {
      if (cur >= rangeStart && cur <= rangeEnd) {
        var key = isoDate(cur);
        if (!map.has(key)) {
          map.set(key, summary);
        }
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  /* ============================================================
     描画
     ============================================================ */
  function render() {
    var year = state.viewYear;
    var month = state.viewMonth;

    document.getElementById('cal-year').textContent = year;
    document.getElementById('cal-month-num').textContent = (month + 1) + '月';
    document.getElementById('cal-month-en').textContent = MONTH_EN[month];

    var tbody = document.getElementById('cal-body');
    tbody.replaceChildren();

    var firstDay = new Date(year, month, 1);
    var startDow = firstDay.getDay();
    var gridStart = new Date(year, month, 1 - startDow);
    var today = new Date();
    var closedMap = state.closedMap || new Map();

    for (var w = 0; w < 6; w++) {
      var tr = document.createElement('tr');
      for (var d = 0; d < 7; d++) {
        var cellDate = new Date(gridStart);
        cellDate.setDate(gridStart.getDate() + w * 7 + d);
        tr.appendChild(buildCell(cellDate, month, closedMap, today));
      }
      tbody.appendChild(tr);
    }

    var lastRow = tbody.lastElementChild;
    if (lastRow && Array.prototype.every.call(lastRow.children, function (c) {
      return c.classList.contains('is-out');
    })) {
      tbody.removeChild(lastRow);
    }
  }

  function buildCell(date, viewMonth, closedMap, today) {
    var td = document.createElement('td');
    var dow = date.getDay();
    var isOut = date.getMonth() !== viewMonth;
    var isToday = isSameDay(date, today);
    var key = isoDate(date);
    var closedReason = closedMap.get(key);

    if (isOut) td.classList.add('is-out');
    if (dow === 0) td.classList.add('is-sun');
    if (dow === 6) td.classList.add('is-sat');
    if (closedReason && !isOut) td.classList.add('is-closed');
    if (isToday && !isOut) td.classList.add('is-today');

    td.appendChild(span('day', String(date.getDate())));

    if (isToday && !isOut) {
      td.appendChild(span('day-tag', 'TODAY'));
    }

    if (!isOut) {
      if (closedReason) {
        td.appendChild(span('status', closedReason));
      } else {
        td.appendChild(span('status', '営業日'));
        var hours = HOURS_BY_WEEKDAY[dow];
        if (hours) {
          var parts = hours.split('–');
          var hoursEl = document.createElement('span');
          hoursEl.className = 'hours';
          hoursEl.appendChild(span('h-open', parts[0] + '–'));
          if (parts[1]) hoursEl.appendChild(span('h-close', parts[1]));
          td.appendChild(hoursEl);
        }
      }
    }

    return td;
  }

  /* ============================================================
     月切替
     ============================================================ */
  function shiftMonth(delta) {
    var d = new Date(state.viewYear, state.viewMonth + delta, 1);
    state.viewYear = d.getFullYear();
    state.viewMonth = d.getMonth();
    if (state.rawEvents) {
      state.closedMap = buildClosedMap(state.rawEvents, state.viewYear, state.viewMonth);
    }
    render();
  }

  function bindNav() {
    document.getElementById('cal-prev').addEventListener('click', function () { shiftMonth(-1); });
    document.getElementById('cal-next').addEventListener('click', function () { shiftMonth(1); });
  }

  function setLoading(visible) {
    var el = document.getElementById('cal-loading');
    if (!el) return;
    if (visible) el.removeAttribute('hidden');
    else el.setAttribute('hidden', '');
  }

  function setFootError(message) {
    var el = document.getElementById('cal-foot-note');
    if (el) el.textContent = message;
  }

  /* ============================================================
     起動
     ============================================================ */
  function init() {
    var today = new Date();
    state.viewYear = today.getFullYear();
    state.viewMonth = today.getMonth();
    bindNav();
    render();
    setLoading(true);

    fetchIcs()
      .then(function (events) {
        state.rawEvents = events;
        state.closedMap = buildClosedMap(events, state.viewYear, state.viewMonth);
        render();
      })
      .catch(function (err) {
        console.error(err);
        setFootError('※ Google カレンダーを取得できませんでした（' + err.message + '）。');
      })
      .finally(function () {
        setLoading(false);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
