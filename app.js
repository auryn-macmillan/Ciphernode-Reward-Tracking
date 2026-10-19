/* IPP-001 tracker frontend — renders state.json produced by tools/track.mjs */
(() => {
  const $ = (s) => document.querySelector(s);

  const fmtFOLD = (weiStr, digits = 0) => {
    const w = BigInt(weiStr);
    const whole = w / 10n ** 18n;
    const frac = (w % 10n ** 18n) / 10n ** BigInt(18 - Math.min(digits, 18));
    const s =
      digits > 0 && frac > 0n
        ? `${whole}.${String(frac).padStart(digits, '0')}`
        : String(whole);
    const [i, d] = s.split('.');
    return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d ? '.' + d : '');
  };
  const fmtInt = (s) => BigInt(s).toLocaleString('en-US');
  const fmtDate = (ts) =>
    new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const short = (a) => a.slice(0, 6) + '…' + a.slice(-4);
  const fmtAddr = (a, ens) =>
    ens
      ? `<span class="ens" title="${a}">${ens}</span>`
      : `<span class="addr-full">${a}</span>`;

  let STATE = null;
  let selectedEpoch = null;

  function stats() {
    const p = STATE.program;
    const paid = STATE.epochs.filter((e) => e.status === 'complete');
    const current = STATE.epochs.find((e) => e.status === 'in-progress');
    const e = current ?? paid[paid.length - 1] ?? STATE.epochs[0];
    const totalOps = new Set(STATE.snapshot.map((n) => n.operator)).size;
    const activeNodes = STATE.snapshot.filter((n) => n.active).length;
    const poolPct =
      STATE.epochs
        .filter((x) => x.status === 'complete')
        .reduce((a, x) => a + BigInt(x.poolWei), 0n);
    const cards = [
      ['Pool', fmtFOLD(p.totalPool), '1.0% of 1.2B FOLD supply'],
      ['Settled pools', fmtFOLD(poolPct.toString()), `${paid.length} of 6 epochs complete`],
      ['Current epoch', e ? `${e.index} / 6` : '—', e ? `${fmtDate(e.startTs)} → ${fmtDate(e.endTs)}` : ''],
      ['Operators accruing', e ? String(e.operatorCount) : '0', e && e.status === 'in-progress' ? 'epoch in progress' : 'in current epoch'],
      ['Registered nodes', String(STATE.snapshot.length), `${activeNodes} active · ${totalOps} operators`],
    ];
    $('#stats').innerHTML = cards
      .map(
        ([l, v, s]) =>
          `<div class="stat"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`,
      )
      .join('');
  }

  function epochs() {
    const g = $('#epoch-grid');
    g.innerHTML = '';
    STATE.epochs.forEach((e) => {
      const b = document.createElement('button');
      b.className = 'epoch-card' + (e.index === selectedEpoch ? ' selected' : '');
      const pct =
        e.status === 'complete' ? 100 : e.status === 'upcoming' ? 0 : progressPct(e);
      b.innerHTML = `
        <div class="e-name">Epoch ${e.index}</div>
        <div class="e-pool">${fmtFOLD(e.poolWei)} FOLD</div>
        <div class="e-dates">${fmtDate(e.startTs)} → ${fmtDate(e.endTs)}</div>
        <span class="badge ${e.status}">${e.status}</span>
        <div class="progress"><i style="width:${pct}%"></i></div>`;
      b.onclick = () => { selectedEpoch = e.index; epochs(); table(); };
      g.appendChild(b);
    });
  }

  function progressPct(e) {
    const now = Math.floor(Date.now() / 1000);
    if (now <= e.startTs) return 0;
    if (now >= e.endTs) return 100;
    return Math.round(((now - e.startTs) / (e.endTs - e.startTs)) * 100);
  }

  function table() {
    const e = STATE.epochs.find((x) => x.index === selectedEpoch) ?? STATE.epochs[0];
    if (!e) return;
    $('#table-title').textContent = `Epoch ${e.index} · operator accrual (${e.status})`;
    const q = $('#search').value.trim().toLowerCase();
    const rows = e.operators.filter(
      (o) => !q || o.operator.includes(q) || (o.ens ?? '').toLowerCase().includes(q),
    );
    const cap = BigInt(STATE.program.cap);
    $('#op-table tbody').innerHTML = rows
      .map((o, i) => {
        const tb = BigInt(o.ticketBlocks);
        const blocks = BigInt(e.blocksObserved) || 1n;
        const avg = tb / blocks; // avg credited tickets over observed span
        return `<tr>
          <td>${i + 1}</td>
          <td>${fmtAddr(o.operator, o.ens)}</td>
          <td class="num">${avg > cap ? cap : avg}</td>
          <td class="num">${fmtInt(o.ticketBlocks)}</td>
          <td class="num">${o.sharePct.toFixed(2)}%</td>
          <td class="num payout">${fmtFOLD(o.estPayoutWei.toString(), 2)}</td>
        </tr>`;
      })
      .join('');
    $('#table-footnote').textContent =
      `* Average credited tickets per block over ${fmtInt(e.blocksObserved)} observed blocks (cap ${STATE.program.cap}/operator). ` +
      `Est. payout = epoch pool × ticket-blocks ÷ total ticket-blocks (${fmtInt(e.totalTicketBlocks)}). ` +
      `Payouts are delivered VE-locked (30-day term) after the epoch's settlement sheet clears its 48h dispute window.`;
    payloadButton(e);
  }

  // Safe tx-builder payload: served pre-built by the refresh workflow for
  // completed epochs; the button downloads it for import at safe.global.
  function payloadButton(e) {
    const btn = $('#payload-btn');
    if (e.status !== 'complete') {
      btn.hidden = true;
      return;
    }
    const url = `payouts/epoch-${e.index}.safe.json`;
    fetch(url, { method: 'HEAD' })
      .then((r) => {
        btn.hidden = !r.ok;
        btn.onclick = () => {
          const a = document.createElement('a');
          a.href = url;
          a.download = `ipp-001-epoch-${e.index}.safe.json`;
          a.click();
        };
      })
      .catch(() => (btn.hidden = true));
  }

  function snapshot() {
    const byOp = new Map();
    for (const n of STATE.snapshot) {
      const g = byOp.get(n.operator) ?? { nodes: 0, active: 0, tickets: 0, ens: n.ens ?? null };
      g.nodes++;
      if (n.active) { g.active++; g.tickets += n.tickets; }
      byOp.set(n.operator, g);
    }
    const cap = STATE.program.cap;
    $('#snap-table tbody').innerHTML = [...byOp.entries()]
      .sort((a, b) => b[1].tickets - a[1].tickets || b[0].localeCompare(a[0]))
      .map(([op, g]) => `<tr>
        <td>${fmtAddr(op, g.ens)}</td>
        <td class="num">${g.nodes}</td>
        <td class="num">${g.active}</td>
        <td class="num">${g.tickets}</td>
        <td class="num">${Math.min(g.tickets, cap)}</td>
        <td class="addr" title="${STATE.snapshot.filter(n=>n.operator===op).map(n=>n.node).join(', ')}">${g.nodes} node${g.nodes>1?'s':''}</td>
      </tr>`)
      .join('');
  }

  function meta() {
    $('#meta-updated').textContent = `Updated ${new Date(STATE.generatedAt).toUTCString().slice(5, 22)} UTC`;
    $('#meta-head').textContent = `Head block ${fmtInt(STATE.headBlock)}`;
    $('#meta-t0').textContent = `T0 = block ${fmtInt(STATE.program.t0Block)} (${fmtDate(STATE.program.t0Ts)})`;
    $('#proposal-link').href = STATE.program.proposal;
    $('#proposal-link-2').href = STATE.program.proposal;
    $('#notes').innerHTML = STATE.notes.map((n) => `<li>${n}</li>`).join('');
  }

  function render() {
    stats(); epochs(); table(); snapshot(); meta();
  }

  fetch('state.json')
    .then((r) => {
      if (!r.ok) throw new Error(`state.json ${r.status}`);
      return r.json();
    })
    .then((s) => {
      STATE = s;
      const cur = s.epochs.find((e) => e.status === 'in-progress') ?? s.epochs.find((e) => e.status === 'complete') ?? s.epochs[0];
      selectedEpoch = cur.index;
      render();
      $('#search').addEventListener('input', table);
    })
    .catch((e) => {
      $('#stats').innerHTML = `<div class="stat"><div class="label">Error</div><div class="sub">${e.message}</div></div>`;
    });
})();