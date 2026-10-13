import { useTerminal } from '@/terminal/TerminalContext';
import { campaignVerdict } from '@/game/engine';

export default function AdsDesk() {
  const { data, metrics } = useTerminal();
  if (!data || !metrics) return null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="grid grid-cols-4 gap-2">
        <div className="panel p-2.5">
          <div className="font-display text-sm dim">SPEND</div>
          <div className={`font-display text-3xl ${metrics.spend !== null ? 'tier-red' : 'dim'}`}>{metrics.spend !== null ? `$${metrics.spend.toLocaleString()}` : '—'}</div>
          {metrics.spend === null && <div className="text-[0.72rem] dim">META ADS NOT CONNECTED</div>}
        </div>
        <div className="panel p-2.5">
          <div className="font-display text-sm dim">ATTRIBUTED REVENUE</div>
          <div className="font-display text-3xl text-[var(--vhs-white)]">
            ${data.campaigns.reduce((s, c) => s + c.revenue, 0).toLocaleString()}
          </div>
        </div>
        <div className="panel p-2.5">
          <div className="font-display text-sm dim">BLENDED ROAS</div>
          <div className={`font-display text-3xl ${metrics.roas === null ? 'dim' : metrics.roas >= data.targetRoas ? 'phosphor' : metrics.roas < metrics.breakEvenRoas ? 'tier-red' : 'tier-amber'}`}>
            {metrics.roas !== null ? metrics.roas.toFixed(2) : '—'}
          </div>
          <div className="text-[0.72rem] dim">TARGET {data.targetRoas.toFixed(1)} · BREAK-EVEN {metrics.breakEvenRoas.toFixed(2)}</div>
        </div>
        <div className="panel p-2.5">
          <div className="font-display text-sm dim">MER · TRUE EFFICIENCY</div>
          <div className={`font-display text-3xl ${metrics.mer !== null ? 'phosphor' : 'dim'}`}>{metrics.mer !== null ? metrics.mer.toFixed(2) : '—'}</div>
          <div className="text-[0.72rem] dim">ALL REVENUE ÷ ALL SPEND</div>
        </div>
      </div>

      <div className="panel overflow-x-auto">
        <div className="panel-head">
          <span>CAMPAIGNS</span>
          <span className="dim">META ADS · {data.campaigns.length} CAMPAIGNS</span>
        </div>
        <table className="w-full text-[0.78rem]">
          <thead>
            <tr className="border-b border-[var(--crt-mid)] text-left font-display text-sm dim">
              <th className="px-3 py-1.5 font-normal">CAMPAIGN</th>
              <th className="px-2 py-1.5 text-right font-normal">SPEND</th>
              <th className="px-2 py-1.5 text-right font-normal">REVENUE</th>
              <th className="px-2 py-1.5 text-right font-normal">ROAS</th>
              <th className="px-2 py-1.5 text-right font-normal">CTR</th>
              <th className="px-2 py-1.5 text-right font-normal">FREQ</th>
              <th className="px-2 py-1.5 text-right font-normal">14D SPEND</th>
              <th className="px-3 py-1.5 text-right font-normal">VERDICT</th>
            </tr>
          </thead>
          <tbody>
            {data.campaigns.map((c) => {
              const roas = c.spend > 0 ? c.revenue / c.spend : 0;
              const ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0;
              const v = campaignVerdict(c, metrics.breakEvenRoas, data.targetRoas);
              const max = Math.max(...c.dailySpend, 1);
              return (
                <tr key={c.id} className="border-b border-[var(--crt-mid)] hover:bg-[var(--crt-mid)]">
                  <td className="px-3 py-2">
                    <div className="warm">{c.name}</div>
                    <div className="dim text-[0.68rem]">{c.status}</div>
                  </td>
                  <td className="px-2 py-2 text-right tier-red font-display text-base">${c.spend.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right text-[var(--vhs-white)] font-display text-base">${c.revenue.toLocaleString()}</td>
                  <td className={`px-2 py-2 text-right font-display text-base ${roas >= data.targetRoas ? 'phosphor' : roas < metrics.breakEvenRoas ? 'tier-red' : 'tier-amber'}`}>
                    {roas.toFixed(2)}
                  </td>
                  <td className="px-2 py-2 text-right dim">{ctr.toFixed(2)}%</td>
                  <td className={`px-2 py-2 text-right ${c.frequency > 4.5 ? 'tier-amber' : 'dim'}`}>{c.frequency.toFixed(1)}</td>
                  <td className="px-2 py-2">
                    <div className="spark ml-auto h-4 w-20">
                      {c.dailySpend.map((v2, i) => (
                        <div key={i} style={{ height: `${(v2 / max) * 100}%` }} />
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className={`badge tier-${v.tier}`}>{v.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <div className="panel-head"><span>RECOMMENDATIONS</span></div>
        <div className="p-2">
          {data.campaigns.map((c) => {
            const v = campaignVerdict(c, metrics.breakEvenRoas, data.targetRoas);
            const roas = c.spend > 0 ? c.revenue / c.spend : 0;
            return (
              <div key={c.id} className="tape-row">
                <span className={`tier-${v.tier} shrink-0`}>{v.tier === 'red' ? '▲' : v.tier === 'amber' ? '◆' : '●'}</span>
                <span className="warm">
                  {v.label === 'BELOW BREAK-EVEN' && `${c.name}: below break-even (${roas.toFixed(2)} vs ${metrics.breakEvenRoas.toFixed(2)}). Cut budget or swap creative before tomorrow's spend.`}
                  {v.label === 'ABOVE TARGET' && `${c.name}: ROAS ${roas.toFixed(2)} above target. Consider +15–20% budget steps while frequency is low.`}
                  {v.label === 'UNDER TARGET' && `${c.name}: ROAS ${roas.toFixed(2)} — profitable but under target. Test one new hook before scaling.`}
                  {v.label === 'PAUSED' && `${c.name}: paused. Decide — relaunch for the next drop or archive it.`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
