import { TerminalProvider } from '@/terminal/TerminalContext';
import { useTerminal } from '@/terminal/useTerminal';
import { TopBar, StatusBar, HelpOverlay } from '@/terminal/Chrome';
import StatusDesk from '@/desks/StatusDesk';
import PipelineDesk from '@/desks/PipelineDesk';
import InventoryDesk from '@/desks/InventoryDesk';
import LocationsDesk from '@/desks/LocationsDesk';
import CostsDesk from '@/desks/CostsDesk';
import GoalsDesk from '@/desks/GoalsDesk';
import OrdersDesk from '@/desks/OrdersDesk';
import AdsDesk from '@/desks/AdsDesk';
import NewsfeedDesk from '@/desks/NewsfeedDesk';
import ImportFeedDesk from '@/desks/ImportFeedDesk';

// Shown above every desk: demo data is never mistaken for real numbers, and a
// typed-in entry that didn't reach the server says so.
function GlobalNotices() {
  const { imported, storedSnapshotErrors, manualSync } = useTerminal();
  return (
    <>
      {!imported && !storedSnapshotErrors && (
        <div role="status" className="border-b border-[var(--crt-mid)] bg-[var(--crt-dark)] px-3 py-1.5 font-display text-sm tier-amber">
          DEMO DATA — SAMPLE DATA — INVENTED NUMBERS FOR LAYOUT ONLY, NOT TROPICAL FUTURES RESULTS. IMPORT A SYNC TO SEE REAL DATA.
        </div>
      )}
      {(manualSync.state === 'unsaved' || manualSync.state === 'conflict') && manualSync.message && (
        <div role="alert" className="border-b border-[var(--crt-mid)] bg-[var(--crt-dark)] px-3 py-1.5 font-display text-sm tier-amber">
          {manualSync.message}
        </div>
      )}
    </>
  );
}

function DeskArea() {
  const { desk } = useTerminal();
  return (
    <main key={desk} className="desk-enter min-h-0 flex-1 overflow-hidden">
      {desk === 's' && <StatusDesk />}
      {desk === 'p' && <PipelineDesk />}
      {desk === 'i' && <InventoryDesk />}
      {desk === 'l' && <LocationsDesk />}
      {desk === 'c' && <CostsDesk />}
      {desk === 'g' && <GoalsDesk />}
      {desk === 'o' && <OrdersDesk />}
      {desk === 'a' && <AdsDesk />}
      {desk === 'n' && <NewsfeedDesk />}
      {desk === 'f' && <ImportFeedDesk />}
    </main>
  );
}

export default function Home() {
  return (
    <TerminalProvider>
      <div className="flex h-screen flex-col overflow-hidden">
        <TopBar />
        <GlobalNotices />
        <DeskArea />
        <StatusBar />
        <HelpOverlay />
        {/* CRT material stack — hidden by CSS in the paper look */}
        <div className="crt-scanlines" />
        <div className="crt-rgb" />
        <div className="crt-vignette" />
        <div className="crt-noise" />
        <div className="glitch-band" />
        <div className="glitch-band two" />
      </div>
    </TerminalProvider>
  );
}
