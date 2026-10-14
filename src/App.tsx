import { useState } from "react";
import AuthLayout from "./components/AuthLayout";
import { DeskTabs, TicketsStrip, type DeskTab } from "./components/DeskNav";
import Participants from "./components/Participants";
import QRScanner from "./components/QRScanner";
import UnclaimedDialog from "./components/UnclaimedDialog";
import { usePolled } from "./hooks/usePolled";
import { fetchOverview, fetchUnclaimed } from "./lib/api";
import { useIsStaff } from "./lib/staff";

export default function App() {
  const isStaff = useIsStaff();
  const overview = usePolled(isStaff, fetchOverview, "Could not load the schedule.");
  // QRIS payments that landed after their QR closed; any desk can add the tickets.
  const unclaimed = usePolled(isStaff, fetchUnclaimed, "Could not check Mayar for unclaimed payments.");
  const [tab, setTab] = useState<DeskTab>("scan");
  const [focus, setFocus] = useState<{ session: number; nonce: number } | null>(null);
  const [showUnclaimed, setShowUnclaimed] = useState(false);

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
          unclaimed={unclaimed.value?.length ?? 0}
          onOpenUnclaimed={() => setShowUnclaimed(true)}
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
      {showUnclaimed && (
        <UnclaimedDialog
          credits={unclaimed.value ?? []}
          onClose={() => setShowUnclaimed(false)}
          onClaimed={() => {
            void unclaimed.refresh();
            void overview.refresh();
          }}
        />
      )}
    </AuthLayout>
  );
}
