import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReasoningPanel } from "@/components/cockpit/ReasoningPanel";
import { CampaignChart } from "@/components/cockpit/CampaignChart";
import { JourneyView } from "@/components/cockpit/JourneyView";
import type { Event, Playbook } from "@/types/protocol";

interface CenterTabsProps {
  events: Event[];
  playbook: Playbook;
}

export function CenterTabs({ events, playbook }: CenterTabsProps) {
  return (
    <Tabs
      defaultValue="reasoning"
      className="flex h-full flex-col bg-background"
    >
      <div className="border-b border-border px-3 py-2">
        <TabsList variant="line" className="h-7">
          <TabsTrigger
            value="reasoning"
            className="font-mono text-[11px] uppercase tracking-widest"
          >
            Reasoning
          </TabsTrigger>
          <TabsTrigger
            value="playbook"
            className="font-mono text-[11px] uppercase tracking-widest"
          >
            Playbook
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="reasoning" className="min-h-0 flex-1 overflow-hidden">
        <ReasoningPanel events={events} />
      </TabsContent>

      <TabsContent value="playbook" className="min-h-0 flex-1 overflow-hidden">
        {playbook === "media_buying" ? (
          <CampaignChart events={events} />
        ) : (
          <JourneyView events={events} />
        )}
      </TabsContent>
    </Tabs>
  );
}
