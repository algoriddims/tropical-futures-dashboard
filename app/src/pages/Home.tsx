import { TerminalProvider, useTerminal } from '@/terminal/TerminalContext';
import { TopBar, StatusBar, HelpOverlay } from '@/terminal/Chrome';
import Ticker from '@/terminal/Ticker';
import StatusDesk from '@/desks/StatusDesk';
import PipelineDesk from '@/desks/PipelineDesk';
import InventoryDesk from '@/desks/InventoryDesk';
import LocationsDesk from '@/desks/LocationsDesk';
import CostsDesk from '@/desks/CostsDesk';
import GoalsDesk from '@/desks/GoalsDesk';
import OrdersDesk from '@/desks/OrdersDesk';
import AdsDesk from '@/desks/AdsDesk';
import NewsfeedDesk from '@/desks/NewsfeedDesk';

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
    </main>
  );
}

export default function Home() {
  return (
    <TerminalProvider>
      <div className="flex h-screen flex-col overflow-hidden">
        <TopBar />
        <Ticker />
        <DeskArea />
        <StatusBar />
        <HelpOverlay />
        {/* CRT material stack */}
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
