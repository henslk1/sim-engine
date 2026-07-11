import { Panel } from "@/components/game/ui"
import { StickyNote } from "lucide-react"

export function NotesPanel() {
  return (
    <Panel title="Notes" icon={<StickyNote className="size-4 text-muted-foreground" />}>
      <p className="text-[11px] text-muted-foreground">No notes</p>
    </Panel>
  )
}
