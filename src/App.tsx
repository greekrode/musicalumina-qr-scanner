import { useState } from "react";
import AuthLayout from "./components/AuthLayout";
import { DeskTabs, TicketsStrip, type DeskTab } from "./components/DeskNav";
import Participants from "./components/Participants";
import QRScanner from "./components/QRScanner";
import { useEventOverview } from "./hooks/useEventOverview";
import { useIsStaff } from "./lib/staff";

export default function App() {
  const overview = useEventOverview(useIsStaff());
  const [tab, setTab] = useState<DeskTab>("scan");
  const [focus, setFocus] = useState<{ session: number; nonce: number } | null>(null);

  return (
    <AuthLayout
      tabs={
        <DeskTabs
          tab={tab}
          onChange={(next) => {
            setTab(next);
            setFocus(null);
          }}
        />
      }
      subbar={
        <TicketsStrip
          data={overview}
          onSelectSession={(session) => {
            setTab("participants");
            setFocus({ session, nonce: Date.now() });
          }}
        />
      }
    >
      {/* Kept mounted so the scan history survives a look at the list. */}
      <div hidden={tab !== "scan"}>
        <QRScanner active={tab === "scan"} onActivity={() => void overview.refresh()} />
      </div>
      {tab === "participants" && <Participants data={overview} focus={focus} />}
    </AuthLayout>
  );
}
